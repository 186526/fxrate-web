// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest"
import { getRatesMatrix } from "@/components/tools"
import { createDeferredBatchMock } from "./jsonrpc"

const isoNow = () => new Date().toISOString()

const CURRENCIES = { bankA: ["CNY", "USD"], bankB: ["CNY", "USD"] }

const listFXRates = () => ({
	USD: { middle: 7.1, cash: 7.05, remit: 7.08, updated: isoNow() },
})

const flush = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve()
}

const isAbort = (error: unknown) =>
	error instanceof Error && error.name == "AbortError"

const settle = <T>(p: Promise<T>) =>
	p.then(
		(value) => ({ status: "fulfilled" as const, value }),
		(error: unknown) => ({ status: "rejected" as const, error })
	)

describe("getRatesMatrix 调用方离开后的在途请求", () => {
	afterEach(async () => {
		;(globalThis as unknown as { __fxSetFetch: (impl: null) => void }).__fxSetFetch(
			null
		)
	})

	it("key 未变：最后一个调用方取消时共享请求继续跑完并写入缓存", async () => {
		const { stats, handles } = createDeferredBatchMock({ listFXRates })
		const controller = new AbortController()
		const first = settle(
			getRatesMatrix(CURRENCIES, "CNY", {
				signal: controller.signal,
				isCurrentKey: () => true,
			})
		)
		await flush()
		expect(stats.batches).toBe(1)

		// 旧实例卸载：唯一调用方取消
		controller.abort()
		const outcome = await first
		expect(outcome.status).toBe("rejected")
		expect(isAbort(outcome.status == "rejected" ? outcome.error : null)).toBe(
			true
		)
		expect(handles[0].requests.length).toBe(2)

		// 共享请求未被取消，放行后写入缓存
		handles[0].resolve()
		await flush()

		// 新实例（切矩阵整页重挂载后）同一 key 直接命中缓存，零新增批次
		const second = await getRatesMatrix(CURRENCIES, "CNY")
		expect(stats.batches).toBe(1)
		expect(second.bankA.USD.middle).toBe(7.1)
	})

	it("key 已变：最后一个调用方取消时共享请求被取消，不写缓存", async () => {
		const { stats, handles } = createDeferredBatchMock({ listFXRates })
		const controller = new AbortController()
		// 用非默认金额避开其他用例留下的缓存
		let currentKey = "CNY-500-p4-forward"
		const first = settle(
			getRatesMatrix(CURRENCIES, "CNY", {
				amount: 500,
				signal: controller.signal,
				isCurrentKey: (key) => key == currentKey,
			})
		)
		await flush()
		expect(stats.batches).toBe(1)

		// 金额变化：参数 key 已不同，旧请求不再有用
		currentKey = "CNY-600-p4-forward"
		controller.abort()
		expect((await first).status).toBe("rejected")
		handles[0].resolve()
		await flush()

		// 旧 key 的结果没有落地：同一 key 再请求会重新发批次
		const again = settle(
			getRatesMatrix(CURRENCIES, "CNY", {
				amount: 500,
				signal: new AbortController().signal,
			})
		)
		await flush()
		expect(stats.batches).toBe(2)
		handles[1].resolve()
		expect((await again).status).toBe("fulfilled")
	})
})
