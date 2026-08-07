import type { infoResponse } from "@/lib/fxrate/src/client"
import type { JsonRpcRequest } from "./model"

export type RequestState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "success"; body: string }
	| { status: "error"; message: string }

export type RequestTask = (signal: AbortSignal) => Promise<string>
export type StateListener = (state: RequestState) => void

interface RequestSlot {
	generation: number
	timer: ReturnType<typeof setTimeout> | null
	controller: AbortController | null
}

export function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name == "AbortError"
		: error instanceof Error && error.name == "AbortError"
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

async function responseText(response: Response, maxLength: number | null = 4000): Promise<string> {
	const text = await response.text()
	if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
	return maxLength == null ? text : text.slice(0, maxLength)
}

export async function fetchRest(path: string, signal: AbortSignal): Promise<string> {
	const response = await fetch(`/api/rest${path}`, {
		cache: "no-store",
		signal,
	})
	return responseText(response)
}

export async function fetchRpc(
	body: JsonRpcRequest,
	signal: AbortSignal,
	maxLength: number | null = 4000
): Promise<string> {
	const response = await fetch("/api/fxrate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		cache: "no-store",
		signal,
	})
	return responseText(response, maxLength)
}

function isInfoResponse(value: unknown): value is infoResponse {
	if (typeof value != "object" || value == null) return false
	const record = value as Record<string, unknown>
	return (
		typeof record.environment == "string" &&
		Array.isArray(record.sources) &&
		record.sources.every((source) => typeof source == "string") &&
		typeof record.version == "string" &&
		typeof record.status == "string" &&
		typeof record.apiVersion == "string"
	)
}

export async function fetchInstanceInfo(signal: AbortSignal): Promise<infoResponse> {
	const text = await fetchRpc(
		{
			jsonrpc: "2.0",
			id: 1,
			method: "instanceInfo",
			params: {},
		},
		signal,
		null
	)
	const parsed: unknown = JSON.parse(text)
	const envelope = Array.isArray(parsed)
		? parsed.length == 1
			? parsed[0]
			: null
		: parsed
	if (typeof envelope != "object" || envelope == null) {
		throw new Error("实例信息响应不是单条 JSON-RPC 对象")
	}
	const record = envelope as Record<string, unknown>
	if (typeof record.error == "object" && record.error != null) {
		const error = record.error as Record<string, unknown>
		throw new Error(typeof error.message == "string" ? error.message : "实例信息请求失败")
	}
	if (!isInfoResponse(record.result)) throw new Error("实例信息响应结构无效")
	return record.result
}

export interface BackendMeta {
	rpcUrl: string
	restBase: string
}

function isBackendMeta(value: unknown): value is BackendMeta {
	if (typeof value != "object" || value == null) return false
	const record = value as Record<string, unknown>
	return typeof record.rpcUrl == "string" && typeof record.restBase == "string"
}

export async function fetchBackendMeta(signal: AbortSignal): Promise<BackendMeta> {
	const response = await fetch("/api/backend-meta", {
		cache: "no-store",
		signal,
	})
	const text = await responseText(response)
	const value: unknown = JSON.parse(text)
	if (!isBackendMeta(value)) throw new Error("后端地址响应结构无效")
	return value
}

export class EndpointRequestCoordinator {
	private readonly slots = new Map<string, RequestSlot>()

	private slot(key: string): RequestSlot {
		const existing = this.slots.get(key)
		if (existing) return existing
		const created: RequestSlot = {
			generation: 0,
			timer: null,
			controller: null,
		}
		this.slots.set(key, created)
		return created
	}

	private reset(key: string): RequestSlot {
		const slot = this.slot(key)
		if (slot.timer) clearTimeout(slot.timer)
		slot.timer = null
		slot.controller?.abort()
		slot.controller = null
		slot.generation += 1
		return slot
	}

	private start(
		key: string,
		generation: number,
		task: RequestTask,
		onState: StateListener
	): void {
		const slot = this.slot(key)
		if (slot.generation != generation) return
		const controller = new AbortController()
		slot.controller = controller
		onState({ status: "loading" })
		task(controller.signal)
			.then((body) => {
				if (slot.generation == generation && !controller.signal.aborted) {
					onState({ status: "success", body })
				}
			})
			.catch((error: unknown) => {
				if (
					slot.generation == generation &&
					!controller.signal.aborted &&
					!isAbortError(error)
				) {
					onState({ status: "error", message: errorMessage(error) })
				}
			})
			.finally(() => {
				if (slot.generation == generation && slot.controller == controller) {
					slot.controller = null
				}
			})
	}

	run(key: string, task: RequestTask, onState: StateListener): void {
		const slot = this.reset(key)
		this.start(key, slot.generation, task, onState)
	}

	schedule(
		key: string,
		task: RequestTask,
		onState: StateListener,
		delay = 300
	): void {
		const slot = this.reset(key)
		const generation = slot.generation
		slot.timer = setTimeout(() => {
			slot.timer = null
			this.start(key, generation, task, onState)
		}, delay)
	}

	cancel(key: string): void {
		this.reset(key)
	}

	dispose(): void {
		for (const key of this.slots.keys()) this.reset(key)
		this.slots.clear()
	}
}
