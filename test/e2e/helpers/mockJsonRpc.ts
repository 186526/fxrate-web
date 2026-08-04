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

export interface MockJsonRpc {
	stats: JsonRpcStats
	count(method: string): number
	batches(): number
	reset(): void
	// 各 method 的请求参数（按调用顺序），供方向/参数断言（如矩阵 reverse=true）
	paramsOf(method: string): Record<string, unknown>[]
}

export function mockJsonRpcRoutes(page: Page): MockJsonRpc {
	const stats: JsonRpcStats = { batches: 0, methods: {} }
	const paramsByMethod: Record<string, Record<string, unknown>[]> = {}
	page.route("**/api/fxrate", async (route) => {
		stats.batches++
		const body = route.request().postDataJSON()
		const list: { id: string; method: string; params: Record<string, unknown> }[] =
			Array.isArray(body) ? body : []
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
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(responses),
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
	}
}
