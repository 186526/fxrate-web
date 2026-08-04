// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { getCurrenciesDetails } from "@/componets/tools"
import type { FXDetailsUpdate } from "@/componets/tools"
import { createBatchMock } from "./jsonrpc"
import type { JsonRpcRequest } from "./jsonrpc"

const isoNow = () => new Date().toISOString()

const okRate = () => ({
	middle: 7.1,
	cash: 7.05,
	remit: 7.08,
	updated: isoNow(),
})

// 慢源（SLOW_SOURCES 内的 visa）在 jsdom 下走浏览器分支：后台单独请求后合并回 data
describe("getCurrenciesDetails 慢源缓存完整性", () => {
	afterEach(() => {
		vi.spyOn(console, "error").mockRestore()
	})

	it("快源失败时慢源单独结果不进缓存，下次请求仍会重试快源", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {})
		const currencies = { bankA: ["CNY", "USD"], visa: ["CNY", "USD"] }
		const setResult = vi.fn()
		let bankAOk = false

		const stats = createBatchMock({
			getFXRate: (p) => {
				if (p.source == "bankA" && !bankAOk) throw new Error("bankA blocked")
				return okRate()
			},
		})

		// 第一次：快源 bankA 全失败 → 抛错；visa 后台请求仍完成并回调
		await expect(
			getCurrenciesDetails(currencies, "USD", "CNY", setResult, {
				amount: 100,
				precision: 4,
			})
		).rejects.toThrow("获取报价失败")

		await vi.waitFor(() => {
			expect(setResult).toHaveBeenCalled()
		})
		const lastCall = setResult.mock.calls.at(-1)![0] as FXDetailsUpdate
		expect(lastCall.fastFailed).toBe(true)
		const mergedFirst = lastCall.data
		expect(mergedFirst.some((x) => x.name == "visa")).toBe(true)
		expect(mergedFirst.some((x) => x.name == "bankA")).toBe(false)

		// 第二次：快源恢复 → 缓存未被 visa-only 结果污染，必须重新请求快源
		bankAOk = true
		const batchesBefore = stats.batches
		const result = await getCurrenciesDetails(currencies, "USD", "CNY", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(stats.batches).toBeGreaterThan(batchesBefore)
		expect(result.some((x) => x.name == "bankA")).toBe(true)
		expect(err).toHaveBeenCalled()
	})

	it("快源成功时合并结果写入缓存，二次调用零请求且含慢源数据", async () => {
		const currencies = { bankA: ["CNY", "USD"], visa: ["CNY", "USD"] }
		const setResult = vi.fn()

		const stats = createBatchMock({ getFXRate: okRate })

		const r1 = await getCurrenciesDetails(currencies, "USD", "JPY", setResult, {
			amount: 100,
			precision: 4,
		})
		expect(r1.some((x) => x.name == "bankA")).toBe(true)

		await vi.waitFor(() => {
			const last = setResult.mock.calls.at(-1)
			expect(
				last &&
					(last[0] as FXDetailsUpdate).data.some((x) => x.name == "visa")
			).toBe(true)
		})

		const batchesAfterFirst = stats.batches
		const r2 = await getCurrenciesDetails(currencies, "USD", "JPY", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(stats.batches).toBe(batchesAfterFirst)
		expect(r2.some((x) => x.name == "visa")).toBe(true)
		expect(r2.some((x) => x.name == "bankA")).toBe(true)
	})

	it("慢源失败时不缓存快源结果：下次请求仍会重试慢源，慢源恢复后合并入库", async () => {
		const err = vi.spyOn(console, "error").mockImplementation(() => {})
		// 用 EUR/CNY 对避免与同文件其他用例的缓存 key（含来源指纹）冲突
		const currencies = { bankA: ["CNY", "EUR"], visa: ["CNY", "EUR"] }
		const setResult = vi.fn()
		let visaOk = false

		const stats = createBatchMock({
			getFXRate: (p) => {
				if (p.source == "visa" && !visaOk) throw new Error("visa blocked")
				return okRate()
			},
		})

		// 第一次：快源成功、慢源失败 → 返回快源部分结果，但不写缓存
		const r1 = await getCurrenciesDetails(currencies, "EUR", "CNY", setResult, {
			amount: 100,
			precision: 4,
		})
		expect(r1.some((x) => x.name == "bankA")).toBe(true)
		expect(r1.some((x) => x.name == "visa")).toBe(false)

		// 等待慢源后台批次结束（mergeAndNotify 回调 = 主结果 + 慢源合并两次）
		await vi.waitFor(() => {
			expect(setResult.mock.calls.length).toBeGreaterThanOrEqual(2)
		})

		// 第二次：慢源恢复 → 缓存未被快源-only 污染，必须重新请求快源与慢源
		visaOk = true
		const batchesBefore = stats.batches
		const r2 = await getCurrenciesDetails(currencies, "EUR", "CNY", setResult, {
			amount: 100,
			precision: 4,
		})
		expect(stats.batches).toBeGreaterThan(batchesBefore)
		expect(r2.some((x) => x.name == "bankA")).toBe(true)

		// 慢源恢复成功 → 合并结果含 visa 且写入缓存
		await vi.waitFor(() => {
			const last = setResult.mock.calls.at(-1)
			expect(
				last &&
					(last[0] as FXDetailsUpdate).data.some((x) => x.name == "visa")
			).toBe(true)
		})
		const batchesAfterSecond = stats.batches
		const r3 = await getCurrenciesDetails(currencies, "EUR", "CNY", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(stats.batches).toBe(batchesAfterSecond)
		expect(r3.some((x) => x.name == "visa")).toBe(true)
		expect(r3.some((x) => x.name == "bankA")).toBe(true)
		expect(err).toHaveBeenCalled()
	})

	it("慢源返回全 false 失败哨兵时不缓存快源结果", async () => {
		const currencies = { bankA: ["CNY", "AUD"], visa: ["CNY", "AUD"] }
		let visaOk = false
		const stats = createBatchMock({
			getFXRate: (params) =>
				params.source == "visa" && !visaOk
					? {
						middle: false,
						cash: false,
						remit: false,
						updated: isoNow(),
					}
					: okRate(),
		})

		const first = await getCurrenciesDetails(currencies, "AUD", "CNY")
		expect(first.some((row) => row.name == "bankA")).toBe(true)
		await vi.waitFor(() => expect(stats.batches).toBeGreaterThanOrEqual(2))

		visaOk = true
		const beforeRetry = stats.batches
		await getCurrenciesDetails(currencies, "AUD", "CNY")
		expect(stats.batches).toBeGreaterThan(beforeRetry)
	})

	it("force 接管后先完成的过期慢源批不得写入缓存（代际在请求开始登记）", async () => {
		const currencies = { bankA: ["CNY", "GBP"], visa: ["CNY", "GBP"] }
		const setResultA = vi.fn()

		// 手动 deferred mock：每次 fetch 挂起，由测试按完成次序放行，精确控制
		// 「先发的慢源批在 force 快源批完成前先完成」的乱序窗口
		const batches: Array<{
			requests: JsonRpcRequest[]
			resolve: (resp: Response) => void
		}> = []
		const release = (index: number, value: number) => {
			const { requests, resolve } = batches[index]
			const responses = requests.map((r) => ({
				jsonrpc: "2.0",
				id: r.id,
				result: {
					middle: value,
					cash: value - 0.05,
					remit: value + 0.02,
					updated: isoNow(),
				},
			}))
			resolve(
				new Response(JSON.stringify(responses), {
					status: 200,
					headers: { "content-type": "application/json" },
				})
			)
		}
		;(globalThis as unknown as {
			__fxSetFetch: (impl: typeof fetch | null) => void
		}).__fxSetFetch(async (_input, init) => {
			const body = JSON.parse(String(init?.body ?? "[]"))
			const list: JsonRpcRequest[] = Array.isArray(body) ? body : [body]
			return new Promise<Response>((resolve) => {
				batches.push({ requests: list, resolve })
			})
		})
		// 所有完成均由测试放行 + setImmediate 事件循环让位（client.done() 内
		// resp.text() 需宏任务轮转）驱动，无任意时延的真实定时器
		const flush = async (): Promise<void> => {
			for (let i = 0; i < 5; i++) {
				await new Promise<void>((r) => setImmediate(r))
			}
		}

		// A 非 force：快源完成返回旧值，慢源（visa）批被挂起 → gen 1
		const p1 = getCurrenciesDetails(currencies, "GBP", "CNY", setResultA, {
			amount: 100,
			precision: 4,
		})
		release(0, 7.1)
		await p1
		expect(batches).toHaveLength(2) // A 的慢源批已发出但未放行

		// B force：请求开始即登记 gen 2，快源批挂起（尚未完成）
		getCurrenciesDetails(currencies, "GBP", "CNY", undefined, {
			amount: 100,
			precision: 4,
			force: true,
		})
		expect(batches).toHaveLength(3) // B 的快源批已发出但未放行

		// 先放行 A 的过期慢源批（旧值）：B 已接管（gen 2 > gen 1），
		// A 不得写缓存，但仍回调自己仍活跃的调用方
		release(1, 7.2)
		await flush()
		expect(setResultA.mock.calls.length).toBeGreaterThanOrEqual(2)
		const staleCall = setResultA.mock.calls.at(-1)![0] as FXDetailsUpdate
		expect(staleCall.data.find((x) => x.name == "visa")?.type.middle).toBe(7.2)

		// A 未污染缓存：此刻非 force 读必须走网络（缓存 miss），批次数 +1；
		// 若 A 在窗口内写了缓存，该读会命中并零请求
		getCurrenciesDetails(currencies, "GBP", "CNY", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(batches).toHaveLength(4)

		// C 作为最新代际完成（返回新值）→ 写入缓存
		release(3, 7.5)
		await flush()
		expect(batches).toHaveLength(5) // C 的慢源批已发出
		release(4, 7.6)
		await flush()

		// 最终非 force 读：命中缓存，返回新值（A 的过期结果从未写入）
		const r = await getCurrenciesDetails(currencies, "GBP", "CNY", undefined, {
			amount: 100,
			precision: 4,
		})
		expect(batches).toHaveLength(5) // 命中缓存，零新增请求
		expect(r.find((x) => x.name == "bankA")?.type.middle).toBe(7.5)
		expect(r.find((x) => x.name == "visa")?.type.middle).toBe(7.6)
	})
})
