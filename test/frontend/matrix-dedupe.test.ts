// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
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

describe("getRatesMatrix 在途请求去重", () => {
	it("同一矩阵 key 的并发调用只发一轮 listFXRates，并共享同一结果", async () => {
		const { stats, handles } = createDeferredBatchMock({ listFXRates })
		const first = getRatesMatrix(CURRENCIES, "CNY")
		const second = getRatesMatrix(CURRENCIES, "CNY")
		await flush()

		expect(stats.batches).toBe(1)
		expect(stats.methods.listFXRates).toBe(2)

		handles[0].resolve()
		const [a, b] = await Promise.all([first, second])
		expect(a).toEqual(b)
		expect(a.bankA.USD.middle).toBe(7.1)
	})
})
