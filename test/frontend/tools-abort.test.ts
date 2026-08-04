// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import {
	getCurrenciesDetails,
	getRatesMatrix,
	getSourceMatrixRow,
} from "@/componets/tools"
import type { FXDetailsUpdate } from "@/componets/tools"
import { createBatchMock, createDeferredBatchMock } from "./jsonrpc"

const isoNow = () => new Date().toISOString()

const okRate = () => ({
	middle: 7.1,
	cash: 7.05,
	remit: 7.08,
	updated: isoNow(),
})

// jsdom 下 window 存在，慢源（visa）走浏览器后台批分支，与真机一致
describe("getCurrenciesDetails AbortSignal", () => {
	afterEach(() => {
		vi.spyOn(console, "error").mockRestore()
	})

	it("预中止的 signal 直接跳过网络请求（零请求，不触碰 client 队列）", async () => {
		const currencies = { bankA: ["CHF", "SEK"] }
		const stats = createBatchMock({ getFXRate: okRate })
		const controller = new AbortController()
		controller.abort()

		await expect(
			getCurrenciesDetails(currencies, "SEK", "CHF", undefined, {
				amount: 100,
				precision: 4,
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" })
		expect(stats.batches).toBe(0)
	})

	it("预中止的 signal 即使命中缓存也不回调、不展示（cache 读取在 abort 检查之后）", async () => {
		// 先用正常请求填充 LRU 缓存（THB/SGD 专属 key，避免污染其他用例）
		const currencies = { bankA: ["THB", "SGD"] }
		const fillStats = createBatchMock({ getFXRate: okRate })
		const fillResult = await getCurrenciesDetails(currencies, "SGD", "THB", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(fillStats.batches).toBeGreaterThan(0)
		expect(fillResult).toHaveLength(1)

		// 同 key 预中止：必须抛 AbortError——即使命中缓存也不回调、不展示
		const controller = new AbortController()
		controller.abort()
		const setResult = vi.fn()
		const stats = createBatchMock({ getFXRate: okRate })
		await expect(
			getCurrenciesDetails(currencies, "SGD", "THB", setResult, {
				amount: 100,
				precision: 4,
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" })
		expect(setResult).not.toHaveBeenCalled()
		expect(stats.batches).toBe(0)
	})

	it("中途 abort：不写缓存、不回调；在途响应放行后同参数请求仍重新拉取", async () => {
		const currencies = { bankA: ["CHF", "SEK"] }
		const deferred = createDeferredBatchMock({ getFXRate: okRate })
		const controller = new AbortController()
		const setResult = vi.fn()
		const p = getCurrenciesDetails(currencies, "SEK", "CHF", setResult, {
			amount: 100,
			precision: 4,
			signal: controller.signal,
		})

		controller.abort()
		await expect(p).rejects.toMatchObject({ name: "AbortError" })
		expect(setResult).not.toHaveBeenCalled()

		// 在途响应此刻才返回：abort 后的结果不得写缓存/回调
		deferred.handles[0].resolve()
		await new Promise((resolve) => setTimeout(resolve, 10))

		// 缓存未被污染：同参数非 force 请求必须重新发起网络请求
		const stats = createBatchMock({ getFXRate: okRate })
		const result = await getCurrenciesDetails(currencies, "SEK", "CHF", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(result).toHaveLength(1)
		expect(stats.batches).toBeGreaterThan(0)
	})

	it("快源批在途时 abort：不启动慢源后台批（关闭交叉汇率的 BFS/Visa 预算保护）", async () => {
		const currencies = { bankA: ["CHF", "SEK"], visa: ["CHF", "SEK"] }
		const deferred = createDeferredBatchMock({ getFXRate: okRate })
		const controller = new AbortController()
		const p = getCurrenciesDetails(currencies, "SEK", "CHF", undefined, {
			amount: 100,
			precision: 4,
			bfs: true,
			signal: controller.signal,
		})

		controller.abort()
		await expect(p).rejects.toMatchObject({ name: "AbortError" })

		// 快源响应即使放行也不应触发第二条（慢源）批量
		deferred.handles[0].resolve()
		await new Promise((resolve) => setTimeout(resolve, 10))
		expect(deferred.handles).toHaveLength(1)
	})

	it("慢源后台批一旦启动不受主请求 abort 打断（fire-and-forget 完成并合并回调）", async () => {
		const currencies = { bankA: ["CHF", "SEK"], visa: ["CHF", "SEK"] }
		const deferred = createDeferredBatchMock({ getFXRate: okRate })
		const controller = new AbortController()
		const setResult = vi.fn()
		const p = getCurrenciesDetails(currencies, "SEK", "CHF", setResult, {
			amount: 100,
			precision: 4,
			signal: controller.signal,
		})

		// 快源批放行 → 慢源后台批发出（第二条批量）
		deferred.handles[0].resolve()
		await vi.waitFor(() => expect(deferred.handles).toHaveLength(2))

		// 慢源批在途时主请求被取消：慢源批不受影响，仍完成合并
		controller.abort()
		deferred.handles[1].resolve()
		const result = await p
		expect(result.some((row) => row.name == "bankA")).toBe(true)

		await vi.waitFor(() => {
			const last = setResult.mock.calls.at(-1)![0] as FXDetailsUpdate
			expect(last.data.some((row) => row.name == "visa")).toBe(true)
		})
	})
})

describe("getRatesMatrix / getSourceMatrixRow AbortSignal", () => {
	afterEach(() => {
		vi.spyOn(console, "error").mockRestore()
	})

	it("getRatesMatrix 中途 abort：不写缓存，后续同参数请求重新拉取", async () => {
		const currencies = { bankA: ["CHF", "SEK"] }
		const rowBuilder = () => {
			const row: Record<string, unknown> = {}
			for (const c of ["SEK"]) {
				row[c] = { middle: 7.1, cash: 7.0, remit: 7.05, updated: isoNow() }
			}
			return row
		}
		const deferred = createDeferredBatchMock({ listFXRates: rowBuilder })
		const controller = new AbortController()
		const p = getRatesMatrix(currencies, "CHF", {
			amount: 100,
			precision: 4,
			signal: controller.signal,
		})

		controller.abort()
		await expect(p).rejects.toMatchObject({ name: "AbortError" })
		deferred.handles[0].resolve()
		await new Promise((resolve) => setTimeout(resolve, 10))

		const stats = createBatchMock({ listFXRates: rowBuilder })
		const matrix = await getRatesMatrix(currencies, "CHF", {
			amount: 100,
			precision: 4,
		})
		expect(Object.keys(matrix.bankA).sort()).toEqual(["SEK"])
		expect(stats.batches).toBeGreaterThan(0)
	})

	it("getRatesMatrix 预中止的 signal 即使命中缓存也不返回数据（cache 读取在 abort 检查之后）", async () => {
		// 先用正常请求填充矩阵缓存（THB/SGD 专属 key，避免污染其他用例）
		const currencies = { bankA: ["THB", "SGD"] }
		const rowBuilder = () => {
			const row: Record<string, unknown> = {}
			for (const c of ["SGD"]) {
				row[c] = { middle: 25.3, cash: 25.0, remit: 25.5, updated: isoNow() }
			}
			return row
		}
		const fillStats = createBatchMock({ listFXRates: rowBuilder })
		const fill = await getRatesMatrix(currencies, "THB", {
			amount: 100,
			precision: 4,
		})
		expect(fillStats.batches).toBeGreaterThan(0)
		expect(Object.keys(fill.bankA).sort()).toEqual(["SGD"])

		// 同 key 预中止：必须抛 AbortError——命中缓存也不返回数据
		const controller = new AbortController()
		controller.abort()
		const stats = createBatchMock({ listFXRates: rowBuilder })
		await expect(
			getRatesMatrix(currencies, "THB", {
				amount: 100,
				precision: 4,
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" })
		expect(stats.batches).toBe(0)
	})

	it("getSourceMatrixRow 预中止 signal 跳过网络请求", async () => {
		const stats = createBatchMock({ getFXRate: okRate })
		const controller = new AbortController()
		controller.abort()

		await expect(
			getSourceMatrixRow("visa", ["SEK"], ["SEK"], "CHF", {
				amount: 100,
				precision: 4,
				signal: controller.signal,
			})
		).rejects.toMatchObject({ name: "AbortError" })
		expect(stats.batches).toBe(0)
	})
})
