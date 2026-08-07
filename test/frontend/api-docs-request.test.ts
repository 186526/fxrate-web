import { afterEach, describe, expect, it, vi } from "vitest"

import {
	API_REQUEST_TIMEOUT_MS,
	EndpointRequestCoordinator,
	fetchRest,
	type RequestState,
} from "@/componets/api-docs/request"

function deferred<T>() {
	let resolvePromise: (value: T) => void = () => undefined
	let rejectPromise: (reason?: unknown) => void = () => undefined
	const promise = new Promise<T>((resolve, reject) => {
		resolvePromise = resolve
		rejectPromise = reject
	})
	return { promise, resolve: resolvePromise, reject: rejectPromise }
}

describe("EndpointRequestCoordinator", () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it("keeps debounce timers independent per endpoint", async () => {
		vi.useFakeTimers()
		const coordinator = new EndpointRequestCoordinator()
		const calls: string[] = []
		coordinator.schedule("rest-pair", async () => {
			calls.push("rest")
			return "rest"
		}, () => undefined)
		coordinator.schedule("rpc-get-rate", async () => {
			calls.push("rpc")
			return "rpc"
		}, () => undefined)

		await vi.advanceTimersByTimeAsync(299)
		expect(calls).toEqual([])
		await vi.advanceTimersByTimeAsync(1)
		expect(calls).toEqual(["rest", "rpc"])
		coordinator.dispose()
	})

	it("aborts reruns and prevents stale responses from overwriting the latest state", async () => {
		const coordinator = new EndpointRequestCoordinator()
		const first = deferred<string>()
		const second = deferred<string>()
		const signals: AbortSignal[] = []
		const states: RequestState[] = []

		coordinator.run(
			"rest-pair",
			(signal) => {
				signals.push(signal)
				return first.promise
			},
			(state) => states.push(state)
		)
		coordinator.run(
			"rest-pair",
			(signal) => {
				signals.push(signal)
				return second.promise
			},
			(state) => states.push(state)
		)

		expect(signals[0].aborted).toBe(true)
		expect(signals[1].aborted).toBe(false)
		first.resolve("old")
		await Promise.resolve()
		second.resolve("new")
		await Promise.resolve()
		await Promise.resolve()

		expect(states.filter((state) => state.status == "success")).toEqual([
			{ status: "success", body: "new" },
		])
		coordinator.dispose()
	})

	it("aborts every active endpoint during disposal without surfacing AbortError", async () => {
		const coordinator = new EndpointRequestCoordinator()
		const signals: AbortSignal[] = []
		const states: RequestState[] = []
		coordinator.run(
			"rest-pair",
			(signal) => {
				signals.push(signal)
				return new Promise((_resolve, reject) => {
					signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
				})
			},
			(state) => states.push(state)
		)

		coordinator.dispose()
		await Promise.resolve()
		expect(signals[0].aborted).toBe(true)
		expect(states.some((state) => state.status == "error")).toBe(false)
	})
})

describe("API docs fetch timeout", () => {
	afterEach(() => {
		vi.useRealTimers()
		vi.unstubAllGlobals()
	})

	it("真正超时转换为 TimeoutError，供工作台显示重试语义", async () => {
		vi.useFakeTimers()
		vi.stubGlobal(
			"fetch",
			vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("Aborted", "AbortError"))
					)
				})
		))
		const promise = fetchRest("/info", new AbortController().signal)
		const assertion = expect(promise).rejects.toMatchObject({
			name: "TimeoutError",
			message: expect.stringContaining("请求超时"),
		})

		await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS)
		await assertion
	})

	it("调用方主动取消仍保留 AbortError，不误报为超时", async () => {
		vi.useFakeTimers()
		vi.stubGlobal(
			"fetch",
			vi.fn((_input: RequestInfo | URL, init?: RequestInit) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("Aborted", "AbortError"))
					)
				})
		))
		const controller = new AbortController()
		const promise = fetchRest("/info", controller.signal)
		controller.abort()

		await expect(promise).rejects.toMatchObject({ name: "AbortError" })
		await vi.advanceTimersByTimeAsync(API_REQUEST_TIMEOUT_MS)
	})
})
