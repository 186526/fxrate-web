// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderHook } from "@testing-library/react"
import { useMatrixData } from "@/components/home/use-matrix-data"
import { getRatesMatrix } from "@/components/tools"
import type { RatesMatrix } from "@/components/tools"

// 切视图时本地视图立即切换（viewOverride），RSC 导航要等薄壳重挂载完成才把
// pathname 改掉。薄壳 /matrix 的货币列表若晚于矩阵 300ms 防抖计时器返回，
// 矩阵数据 effect 会在单对视图激活下重跑并照常触发计时器；矩阵请求只允许由
// 矩阵视图发起，否则导航完成后会再拉一轮 listFXRates（e2e 批次计数 +1）。

vi.mock("@/components/tools", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/components/tools")>()
	return {
		...actual,
		getRatesMatrix: vi.fn(),
	}
})

const getRatesMatrixMock = vi.mocked(getRatesMatrix)

const CURRENCIES = { bankA: ["CNY", "USD"], bankB: ["CNY", "USD"] }

const matrixArgs = (view: "pair" | "matrix") => ({
	currencies: CURRENCIES,
	view,
	matrixBase: "CNY",
	matrixReverse: false,
	amount: 100,
	precision: 4,
})

beforeEach(() => {
	getRatesMatrixMock.mockReset()
	getRatesMatrixMock.mockReturnValue(new Promise<RatesMatrix>(() => {}))
})

describe("useMatrixData 矩阵请求只由矩阵视图发起", () => {
	it("单对视图激活时防抖计时器与手动刷新都不得发起矩阵请求", async () => {
		const { result } = renderHook(() => useMatrixData(matrixArgs("pair")))

		// 货币列表已到达，防抖计时器照常触发
		await new Promise((resolve) => setTimeout(resolve, 400))
		result.current.fetchMatrix(false)
		expect(getRatesMatrixMock).not.toHaveBeenCalled()
	})

	it("矩阵视图激活时防抖计时器照常发起一次请求", async () => {
		renderHook(() => useMatrixData(matrixArgs("matrix")))

		await new Promise((resolve) => setTimeout(resolve, 400))
		expect(getRatesMatrixMock).toHaveBeenCalledTimes(1)
	})
})
