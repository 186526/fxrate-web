// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ThemeProvider } from "@/components/theme"
import Index from "@/components/index"
import {
	getRatesMatrix,
	getCurrenciesDetails,
	showCurrencyAllRates,
} from "@/components/tools"
import type { RatesMatrix } from "@/components/tools"

// 切视图时本地视图立即切换，RSC 导航要等薄壳重挂载完成才把 pathname 改掉。
// 薄壳 /matrix 的货币列表请求若晚于矩阵 300ms 防抖计时器返回，矩阵数据
// effect 会在单对视图激活下重跑；矩阵请求只允许由矩阵视图发起，否则导航
// 完成后会再拉一轮 listFXRates（e2e 批次计数 +1）。

const { mockSearchParams } = vi.hoisted(() => ({
	mockSearchParams: new URLSearchParams(),
}))

const mockRouter = vi.hoisted(() => ({ push: vi.fn() }))
const mockPathname = vi.hoisted(() => ({ current: "/matrix" }))

vi.mock("next/navigation", () => ({
	useSearchParams: () => mockSearchParams,
	useRouter: () => mockRouter,
	usePathname: () => mockPathname.current,
}))

vi.mock("@/components/tools", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/components/tools")>()
	return {
		...actual,
		getRatesMatrix: vi.fn(),
		getCurrenciesDetails: vi.fn(),
		getSourceMatrixRow: vi.fn(),
		showCurrencyAllRates: vi.fn(),
		FXRate: { info: vi.fn() },
	}
})

const getRatesMatrixMock = vi.mocked(getRatesMatrix)
const getCurrenciesDetailsMock = vi.mocked(getCurrenciesDetails)
const showCurrencyAllRatesMock = vi.mocked(showCurrencyAllRates)

const CURRENCIES = { bankA: ["CNY", "USD"], bankB: ["CNY", "USD"] }

let resolveCurrencies: (value: typeof CURRENCIES) => void = () => {}

// 等待矩阵 300ms 防抖计时器与随后的异步渲染全部结算
const settle = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 500))
	})

beforeEach(() => {
	mockPathname.current = "/matrix"
	mockRouter.push.mockReset()
	getRatesMatrixMock.mockReset()
	getCurrenciesDetailsMock.mockReset()
	showCurrencyAllRatesMock.mockReset()
	getCurrenciesDetailsMock.mockReturnValue(new Promise(() => {}))
	getRatesMatrixMock.mockReturnValue(new Promise<RatesMatrix>(() => {}))
	showCurrencyAllRatesMock.mockImplementation(
		() =>
			new Promise((resolve) => {
				resolveCurrencies = resolve
			})
	)
})

describe("Index 矩阵请求只由矩阵视图发起", () => {
	it("单对视图激活期间货币列表到达不得发起矩阵请求", async () => {
		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
				/>
			</ThemeProvider>
		)
		await waitFor(() => expect(showCurrencyAllRatesMock).toHaveBeenCalled())

		// 切到单对视图：本地视图立即切换，RSC 导航尚未完成
		fireEvent.click(screen.getByRole("tab", { name: "单对报价" }))
		expect(mockRouter.push).toHaveBeenCalledWith(
			expect.stringContaining("/?"),
			expect.anything()
		)
		expect(getRatesMatrixMock).not.toHaveBeenCalled()

		// 让切视图后的渲染与 effect 先提交，防抖计时器开始计时
		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 50))
		})

		// 薄壳重挂载的货币列表在矩阵防抖窗口之后返回
		resolveCurrencies(CURRENCIES)
		await settle()
		expect(getRatesMatrixMock).not.toHaveBeenCalled()

		// 导航完成（pathname 变为 /matrix）后，矩阵请求才发出
		await act(async () => {
			screen.getByRole("tab", { name: "全对矩阵" }).click()
			await Promise.resolve()
		})
		mockPathname.current = "/matrix"
		await settle()
		await waitFor(() => expect(getRatesMatrixMock).toHaveBeenCalledTimes(1))
	})
})
