import { afterEach, describe, expect, it, vi } from "vitest"
import {
	getCurrenciesDetails,
	getRatesMatrix,
	getSourceMatrixRow,
	showCurrencyAllRates,
} from "@/componets/tools"
import { createBatchMock, createNetworkErrorMock } from "./jsonrpc"

const isoNow = () => new Date().toISOString()

const okRate = (p: Record<string, unknown>) => ({
	middle: 7.1,
	cash: 7.05,
	remit: 7.08,
	updated: isoNow(),
})

describe("showCurrencyAllRates", () => {
	afterEach(() => {
		vi.spyOn(console, "error").mockRestore()
	})

	it("部分来源失败时返回部分结果，且不缓存部分结果（下次重新请求）", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {})
		const stats = createBatchMock({
			instanceInfo: () => ({
				environment: "test",
				sources: ["bankA", "bankB", "bankC"],
				version: "fxrate@mock",
				status: "ok",
				apiVersion: "1",
			}),
			listCurrencies: (p) => {
				if (p.source == "bankC") throw new Error("upstream blocked")
				return { currency: ["CNY", "USD", "EUR"], date: isoNow() }
			},
		})

		const result = await showCurrencyAllRates()
		expect(result).toEqual({
			bankA: ["CNY", "USD", "EUR"],
			bankB: ["CNY", "USD", "EUR"],
		})
		expect(result.bankC).toBeUndefined()

		const batchesAfterFirst = stats.batches
		await showCurrencyAllRates()
		expect(stats.batches).toBeGreaterThan(batchesAfterFirst)
		expect(err).toHaveBeenCalled()
	})

	it("全部来源成功时缓存完整结果，二次调用零请求", async () => {
		const stats = createBatchMock({
			instanceInfo: () => ({
				environment: "test",
				sources: ["bankA", "bankB"],
				version: "fxrate@mock",
				status: "ok",
				apiVersion: "1",
			}),
			listCurrencies: () => ({ currency: ["CNY", "USD", "EUR"], date: isoNow() }),
		})

		const r1 = await showCurrencyAllRates()
		expect(Object.keys(r1).sort()).toEqual(["bankA", "bankB"])

		const batchesAfterFirst = stats.batches
		const r2 = await showCurrencyAllRates()
		expect(stats.batches).toBe(batchesAfterFirst)
		expect(r2).toEqual(r1)
	})
})

describe("getCurrenciesDetails", () => {
	afterEach(() => {
		vi.spyOn(console, "error").mockRestore()
	})

	it("货币列表为部分结果（undefined/非数组）时安全跳过，只请求含 from/to 的数据源", async () => {
		const currencies: { [source: string]: string[] } = {
			bankA: ["CNY", "USD"],
			bankB: undefined as unknown as string[],
			bankC: ["USD", "EUR"],
			bankD: "not-an-array" as unknown as string[],
		}
		const stats = createBatchMock({ getFXRate: okRate })

		const result = await getCurrenciesDetails(currencies, "USD", "CNY", undefined, {
			amount: 100,
			precision: 4,
		})

		// 每来源两个方向的 getFXRate，只有 bankA/bankC 被请求
		expect(stats.methods.getFXRate).toBe(4)
		expect(result.map((r) => r.name).sort()).toEqual(["bankA", "bankC"])
		expect(result[0].type.middle).toBe(7.1)
		expect(result[0].type.sell).toEqual({ cash: 7.05, remit: 7.08 })
	})

	it("runBatch 生命周期：批次网络失败后 client 状态复位，后续请求正常", async () => {
		const currencies = { bankA: ["EUR", "JPY"] }
		createNetworkErrorMock()
		const err = vi.spyOn(console, "error").mockImplementation(() => {})

		await expect(
			getCurrenciesDetails(currencies, "JPY", "EUR", undefined, {
				amount: 100,
				precision: 4,
			})
		).rejects.toThrow("获取报价失败")

		const stats = createBatchMock({ getFXRate: okRate })
		const result = await getCurrenciesDetails(currencies, "JPY", "EUR", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(result).toHaveLength(1)
		expect(result[0].name).toBe("bankA")
		expect(stats.batches).toBeGreaterThan(0)
		expect(err).toHaveBeenCalled()
	})

	it("批次内部分来源失败时降级返回成功部分，不抛错", async () => {
		const currencies = { bankA: ["CNY", "USD"], bankB: ["CNY", "USD"] }
		const err = vi.spyOn(console, "error").mockImplementation(() => {})
		createBatchMock({
			getFXRate: (p) => {
				if (p.source == "bankB") throw new Error("rate blocked")
				return okRate(p)
			},
		})

		const result = await getCurrenciesDetails(currencies, "USD", "CNY", undefined, {
			amount: 100,
			precision: 4,
			force: true,
		})
		expect(result.map((r) => r.name)).toEqual(["bankA"])
		expect(err).toHaveBeenCalled()
	})

	it("来源/支持货币变化（partial map）时缓存 key 指纹变化，不命中旧数据", async () => {
		const currencies = { bankA: ["CNY", "USD"], bankB: ["CNY", "USD"] }
		const stats = createBatchMock({ getFXRate: okRate })

		const r1 = await getCurrenciesDetails(currencies, "USD", "CNY", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(r1.map((x) => x.name).sort()).toEqual(["bankA", "bankB"])

		const afterFirst = stats.batches
		// 相同来源映射命中缓存
		await getCurrenciesDetails(currencies, "USD", "CNY", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(stats.batches).toBe(afterFirst)

		// 新增来源（支持同货币对）→ 指纹变化 → 重新请求
		const extended = { ...currencies, bankC: ["CNY", "USD"] }
		const r2 = await getCurrenciesDetails(extended, "USD", "CNY", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(stats.batches).toBeGreaterThan(afterFirst)
		expect(r2.map((x) => x.name).sort()).toEqual(["bankA", "bankB", "bankC"])

		// 来源支持货币变化 → 指纹变化 → 重新请求
		const beforeSupport = stats.batches
		await getCurrenciesDetails(
			{ bankA: ["CNY", "USD", "EUR"], bankB: ["CNY", "USD"] },
			"USD",
			"CNY",
			undefined,
			{ amount: 100, precision: 4 }
		)
		expect(stats.batches).toBeGreaterThan(beforeSupport)

		// undefined（部分结果）来源条目稳定处理
		const beforePartial = stats.batches
		await getCurrenciesDetails(
			{ bankA: ["CNY", "USD"], bankB: undefined as unknown as string[] },
			"USD",
			"CNY",
			undefined,
			{ amount: 100, precision: 4 }
		)
		expect(stats.batches).toBeGreaterThan(beforePartial)
	})
})

describe("getRatesMatrix / getSourceMatrixRow", () => {
	afterEach(() => {
		vi.spyOn(console, "error").mockRestore()
	})

	it("矩阵按 from-amount-precision-方向 key 缓存：同参数零请求，参数变化重新请求", async () => {
		const currencies = { bankA: ["CNY", "USD", "EUR"] }
		const stats = createBatchMock({
			listFXRates: (p) => {
				const row: Record<string, unknown> = {}
				for (const c of ["USD", "EUR"]) {
					row[c] = {
						middle: c == "USD" ? 7.1 : 8.2,
						cash: 7.0,
						remit: 7.05,
						updated: isoNow(),
					}
				}
				return row
			},
		})

		const m1 = await getRatesMatrix(currencies, "CNY", { amount: 100, precision: 4 })
		expect(Object.keys(m1.bankA).sort()).toEqual(["EUR", "USD"])

		const afterFirst = stats.batches
		const m2 = await getRatesMatrix(currencies, "CNY", { amount: 100, precision: 4 })
		expect(stats.batches).toBe(afterFirst)
		expect(m2).toEqual(m1)

		await getRatesMatrix(currencies, "CNY", { amount: 100, precision: 6 })
		expect(stats.batches).toBeGreaterThan(afterFirst)

		const beforeReverse = stats.batches
		await getRatesMatrix(currencies, "CNY", { amount: 100, precision: 6, reverse: true })
		expect(stats.batches).toBeGreaterThan(beforeReverse)
	})

	it("矩阵缓存 key 纳入来源与 skipSources 指纹：skip 策略/来源变化重新请求", async () => {
		const currencies = { bankA: ["CNY", "USD", "EUR"] }
		const stats = createBatchMock({
			listFXRates: (p) => {
				const row: Record<string, unknown> = {}
				for (const c of ["USD", "EUR"]) {
					row[c] = {
						middle: c == "USD" ? 7.1 : 8.2,
						cash: 7.0,
						remit: 7.05,
						updated: isoNow(),
					}
				}
				return row
			},
		})

		await getRatesMatrix(currencies, "CNY", { amount: 100, precision: 4 })
		const afterFirst = stats.batches

		// 相同来源与 skip 策略命中缓存
		await getRatesMatrix(currencies, "CNY", { amount: 100, precision: 4 })
		expect(stats.batches).toBe(afterFirst)

		// skipSources 变化（排序稳定指纹）→ 重新请求
		await getRatesMatrix(currencies, "CNY", {
			amount: 100,
			precision: 4,
			skipSources: new Set(),
		})
		expect(stats.batches).toBeGreaterThan(afterFirst)

		// 来源列表变化 → 重新请求
		const beforeSource = stats.batches
		await getRatesMatrix(
			{ ...currencies, bankB: ["CNY", "USD"] },
			"CNY",
			{ amount: 100, precision: 4 }
		)
		expect(stats.batches).toBeGreaterThan(beforeSource)
	})

	it("getSourceMatrixRow 只查询支持列表内的目标货币", async () => {
		const stats = createBatchMock({ getFXRate: okRate })

		const row = await getSourceMatrixRow(
			"visa",
			["USD", "EUR"],
			["USD", "EUR", "JPY"],
			"CNY",
			{ amount: 100, precision: 4 }
		)
		expect(stats.methods.getFXRate).toBe(2)
		expect(Object.keys(row).sort()).toEqual(["EUR", "USD"])

		const empty = await getSourceMatrixRow("visa", ["USD"], ["JPY"], "CNY")
		expect(empty).toEqual({})
	})

	it("getSourceMatrixRow 每个单元格写入有效 Date 时间戳", async () => {
		createBatchMock({ getFXRate: okRate })

		const row = await getSourceMatrixRow(
			"visa",
			["USD"],
			["USD"],
			"CNY",
			{ amount: 100, precision: 4 }
		)
		expect(row.USD.updated).toBeInstanceOf(Date)
		expect(Number.isNaN((row.USD.updated as Date).getTime())).toBe(false)
	})

	it("getSourceMatrixRow 无效日期经 safeUpdated 回退为有效 Date", async () => {
		createBatchMock({
			getFXRate: () => ({
				middle: 7.1,
				cash: 7.05,
				remit: 7.08,
				updated: "Invalid Date",
			}),
		})

		const row = await getSourceMatrixRow(
			"visa",
			["USD"],
			["USD"],
			"CNY",
			{ amount: 100, precision: 4 }
		)
		expect(row.USD.updated).toBeInstanceOf(Date)
		expect(Number.isNaN((row.USD.updated as Date).getTime())).toBe(false)
	})

	it("getSourceMatrixRow 批量失败时向上抛错，供矩阵行显示重试状态", async () => {
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
		try {
			createBatchMock({
				getFXRate: () => {
					throw new Error("upstream blocked")
				},
			})

			await expect(
				getSourceMatrixRow("mastercard", ["USD"], ["USD"], "CNY")
			).rejects.toThrow("upstream blocked")
		} finally {
			errorSpy.mockRestore()
		}
	})

	it("getSourceMatrixRow 将全 false 失败哨兵转为可重试错误", async () => {
		createBatchMock({
			getFXRate: () => ({
				middle: false,
				cash: false,
				remit: false,
				updated: isoNow(),
			}),
		})

		await expect(
			getSourceMatrixRow("mastercard", ["USD"], ["USD"], "CNY")
		).rejects.toThrow("暂无可用报价")
	})
})
