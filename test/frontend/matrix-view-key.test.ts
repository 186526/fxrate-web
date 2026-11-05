// @vitest-environment jsdom
// 矩阵请求参数 key 与视图缓存 key 的形态一致性：getRatesMatrix 必须以
// matrixViewCacheKey 生成请求参数 key，并把它的结果原样传给 isCurrentKey，
// 调用方（use-matrix-data）才能直接与自己的 activeMatrixKey 比较。
// 两侧若各拼一份字面量，形态分叉时 isCurrentKey 恒为 false，切矩阵整页重挂载的
// 轮次被取消、新实例重发整批（request-count 5 vs 6 竞态），因此这里断言的是
// 「调用关系」而不只是字符串相等。

import { afterEach, describe, expect, it, vi } from "vitest"
import { getRatesMatrix } from "@/components/tools"
import * as viewUtils from "@/components/view-utils"
import { createDeferredBatchMock } from "./jsonrpc"

const isoNow = () => new Date().toISOString()

const CURRENCIES = { bankA: ["CNY", "USD"], bankB: ["CNY", "USD"] }

const listFXRates = () => ({
	USD: { middle: 7.1, cash: 7.05, remit: 7.08, updated: isoNow() },
})

const flush = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve()
}

const settle = <T>(p: Promise<T>) =>
	p.then(
		(value) => ({ status: "fulfilled" as const, value }),
		(error: unknown) => ({ status: "rejected" as const, error })
	)

const isAbort = (error: unknown) =>
	error instanceof Error && error.name == "AbortError"

describe("矩阵请求参数 key 与视图缓存 key 同形", () => {
	afterEach(() => {
		vi.restoreAllMocks()
		;(globalThis as unknown as { __fxSetFetch: (impl: null) => void }).__fxSetFetch(
			null
		)
	})

	it("请求参数 key 由 matrixViewCacheKey 生成，isCurrentKey 收到它的返回值", async () => {
		const cacheKeySpy = vi.spyOn(viewUtils, "matrixViewCacheKey")
		const { handles } = createDeferredBatchMock({ listFXRates })
		const received: string[] = []
		// 四个参数都取非默认值：任一处拼接分叉都能被看出
		const controller = new AbortController()
		const request = settle(
			getRatesMatrix(CURRENCIES, "EUR", {
				amount: 350,
				precision: 6,
				reverse: true,
				signal: controller.signal,
				isCurrentKey: (viewKey) => {
					received.push(viewKey)
					return false
				},
			})
		)
		await flush()

		expect(cacheKeySpy).toHaveBeenCalledWith("EUR", 350, 6, true)
		const viewKey = cacheKeySpy.mock.results[0].value as string
		expect(viewKey).toBe("EUR-350-p6-reverse")
		// 只有调用方离开（取消）时才询问 isCurrentKey
		expect(received).toEqual([])

		controller.abort()
		expect((await request).status).toBe("rejected")
		expect(received).toEqual([viewKey])

		handles[0].resolve()
		await flush()
	})

	it("调用方按 matrixViewCacheKey 比较时参数未变：共享请求跑完写缓存，新实例零新增批次", async () => {
		const { stats, handles } = createDeferredBatchMock({ listFXRates })
		const controller = new AbortController()
		const first = settle(
			getRatesMatrix(CURRENCIES, "CNY", {
				amount: 420,
				signal: controller.signal,
				isCurrentKey: (key) =>
					key == viewUtils.matrixViewCacheKey("CNY", 420, 4, false),
			})
		)
		await flush()
		expect(stats.batches).toBe(1)

		controller.abort()
		const outcome = await first
		expect(isAbort(outcome.status == "rejected" ? outcome.error : null)).toBe(
			true
		)

		// 参数未变：共享请求未被取消，落地后新实例直接命中缓存
		handles[0].resolve()
		await flush()
		const second = await getRatesMatrix(CURRENCIES, "CNY", { amount: 420 })
		expect(stats.batches).toBe(1)
		expect(second.bankA.USD.middle).toBe(7.1)
	})

	it("force 路径不读缓存也不加入在途轮次，仍按完整 key（含来源指纹与 skip）重新请求", async () => {
		const { stats, handles } = createDeferredBatchMock({ listFXRates })
		const first = settle(getRatesMatrix(CURRENCIES, "CNY", { amount: 430 }))
		await flush()
		expect(stats.batches).toBe(1)

		const forced = settle(
			getRatesMatrix(CURRENCIES, "CNY", { amount: 430, force: true })
		)
		await flush()
		expect(stats.batches).toBe(2)

		handles[0].resolve()
		handles[1].resolve()
		expect((await first).status).toBe("fulfilled")
		expect((await forced).status).toBe("fulfilled")

		// 强刷结果写入同一完整 key：后续非 force 调用命中缓存
		const after = stats.batches
		await getRatesMatrix(CURRENCIES, "CNY", { amount: 430 })
		expect(stats.batches).toBe(after)
	})
})
