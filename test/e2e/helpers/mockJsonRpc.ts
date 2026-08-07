import { Page } from "@playwright/test"

// 浏览器端 JSON-RPC 拦截 helper：与 mock-server 同一套确定性数据，
// 但走 page.route 在浏览器层直接应答 + 计数（SSR 请求不经此路）。
const CURRENCIES = ["CNY", "USD", "EUR", "JPY", "HKD", "GBP"]
const BASE_RATE: Record<string, number> = {
	CNY: 1,
	USD: 7.1,
	EUR: 8.4,
	JPY: 0.053,
	HKD: 0.91,
	GBP: 9.8,
}
const SOURCE_SPREAD: Record<string, number> = {
	bankA: 0.0,
	bankB: 0.005,
	bankC: -0.004,
	visa: 0.01,
}

const round = (n: number) => Math.round(n * 1e4) / 1e4

function rateFor(source: string, from: string, to: string) {
	const base = (BASE_RATE[to] ?? 1) / (BASE_RATE[from] ?? 1)
	const middle = base * (1 + (SOURCE_SPREAD[source] ?? 0))
	return {
		middle: round(middle),
		cash: round(middle * 0.995),
		remit: round(middle * 0.998),
	}
}

function handle(method: string, params: Record<string, string>) {
	switch (method) {
		case "instanceInfo":
			return {
				environment: "test",
				sources: ["bankA", "bankB", "bankC", "visa"],
				version: "fxrate@mock <test>",
				status: "ok",
				apiVersion: "1",
			}
		case "listCurrencies":
			return { currency: CURRENCIES, date: new Date().toISOString() }
		case "listFXRates": {
			const row: Record<string, unknown> = {}
			for (const c of CURRENCIES) {
				if (c == params.from) continue
				row[c] = {
					...rateFor(params.source, params.from, c),
					updated: new Date().toISOString(),
				}
			}
			return row
		}
		case "getFXRate":
			return {
				...rateFor(params.source, params.from, params.to),
				updated: new Date().toISOString(),
			}
		default:
			throw new Error("unhandled method " + method)
	}
}

export interface JsonRpcStats {
	batches: number
	methods: Record<string, number>
}

export interface MockJsonRpcOptions {
	// 持有包含这些 method 的 JSON-RPC 批次（不 fulfill），直到 release() 放行。
	// 用于确定性控制响应时序（如断言客户端骨架在矩阵数据到达前保持）。
	// 只持有每个 method 第一个命中批次，后续包含该 method 的批次直接通过。
	hold?: string[]
}

export interface MockJsonRpc {
	stats: JsonRpcStats
	count(method: string): number
	batches(): number
	reset(): void
	// 各 method 的请求参数（按调用顺序），供方向/参数断言（如矩阵 reverse=true）
	paramsOf(method: string): Record<string, unknown>[]
	// 放行被 hold 的 method：无被持有批次时是 no-op
	release(method: string): void
}

export function mockJsonRpcRoutes(
	page: Page,
	options: MockJsonRpcOptions = {}
): MockJsonRpc {
	const stats: JsonRpcStats = { batches: 0, methods: {} }
	const paramsByMethod: Record<string, Record<string, unknown>[]> = {}
	const holdMethods = new Set(options.hold ?? [])
	const holdReleased = new Set<string>()
	const holdReleaseFns = new Map<string, () => void>()
	page.route("**/api/fxrate", async (route) => {
		stats.batches++
		const body = route.request().postDataJSON()
		const isBatch = Array.isArray(body)
		const list: { id: string | number; method: string; params: Record<string, unknown> }[] =
			isBatch ? body : [body]
		const responses = list.map((r) => {
			stats.methods[r.method] = (stats.methods[r.method] ?? 0) + 1
			;(paramsByMethod[r.method] ??= []).push(r.params ?? {})
			try {
				return { jsonrpc: "2.0", id: r.id, result: handle(r.method, r.params as Record<string, string>) }
			} catch (e) {
				return {
					jsonrpc: "2.0",
					id: r.id,
					error: { code: -32000, message: (e as Error).message },
				}
			}
		})
		// 持有：本批次命中尚未放行的 hold method 时阻塞应答，直到 release()。
		// 命中即标记已放行——只锁第一个批次，多页面实例并发请求不会被永久卡住。
		for (const r of list) {
			if (holdMethods.has(r.method) && !holdReleased.has(r.method)) {
				holdReleased.add(r.method)
				await new Promise<void>((resolve) => {
					holdReleaseFns.set(r.method, () => resolve())
				})
				break
			}
		}
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(isBatch ? responses : responses[0]),
		})
	})
	return {
		stats,
		count: (method) => stats.methods[method] ?? 0,
		batches: () => stats.batches,
		reset: () => {
			stats.batches = 0
			for (const k of Object.keys(stats.methods)) delete stats.methods[k]
			for (const k of Object.keys(paramsByMethod)) delete paramsByMethod[k]
		},
		paramsOf: (method) => paramsByMethod[method] ?? [],
		release: (method) => {
			const release = holdReleaseFns.get(method)
			if (release) {
				holdReleaseFns.delete(method)
				release()
			}
		},
	}
}
