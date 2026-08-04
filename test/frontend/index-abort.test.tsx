// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeProvider } from "@/componets/theme"
import Index from "@/componets/index"
import type { FXListProps } from "@/componets/fxlistgrid"
import type { RatesMatrix } from "@/componets/tools"

const { mockSearchParams } = vi.hoisted(() => ({
	mockSearchParams: new URLSearchParams(),
}))

vi.mock("next/navigation", () => ({
	useSearchParams: () => mockSearchParams,
	useRouter: () => ({ push: vi.fn() }),
	usePathname: () => "/",
}))

vi.mock("@/componets/tools", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/componets/tools")>()
	return {
		...actual,
		getRatesMatrix: vi.fn(),
		getCurrenciesDetails: vi.fn(),
		showCurrencyAllRates: vi.fn(),
		FXRate: { info: vi.fn() },
	}
})

import { getCurrenciesDetails, getRatesMatrix } from "@/componets/tools"

const getCurrenciesDetailsMock = vi.mocked(getCurrenciesDetails)
const getRatesMatrixMock = vi.mocked(getRatesMatrix)

const liveRow = (name: string, middle: number): FXListProps => ({
	name,
	type: {
		middle,
		buy: { cash: 7.11, remit: 7.12 },
		sell: { cash: 7.0, remit: 7.02 },
	},
	updated: new Date("2026-01-01T00:00:00Z"),
})

const renderPair = () =>
	render(
		<ThemeProvider>
			<Index
				buildId="build"
				buildTime="2026-01-01T00:00:00.000Z"
				version="1.0.0"
				initialCurrencies={{ bankA: ["CNY", "USD", "EUR"] }}
			/>
		</ThemeProvider>
	)

const crossRatesButton = (): HTMLButtonElement =>
	screen.getByText("交叉汇率").closest("button") as HTMLButtonElement

describe("Index AbortSignal 传播", () => {
	beforeEach(() => {
		window.localStorage.clear()
		getCurrenciesDetailsMock.mockReset()
		getRatesMatrixMock.mockReset()
	})

	it("快速修改金额取消旧批次，最终 UI 匹配最新金额", async () => {
		const user = userEvent.setup()
		const signals: AbortSignal[] = []
		const deferreds: Array<{ resolve: (rows: FXListProps[]) => void }> = []
		getCurrenciesDetailsMock.mockImplementation(
			(_currencies, _to, _from, setResult, options) => {
				const signal = options?.signal
				if (signal) signals.push(signal)
				return new Promise<FXListProps[]>((resolve) => {
					deferreds.push({
						resolve: (rows) => {
							resolve(rows)
							setResult?.({ data: rows, fastFailed: false })
						},
					})
				})
			}
		)

		renderPair()

		// 首次防抖请求在途
		await waitFor(() => expect(getCurrenciesDetailsMock).toHaveBeenCalledTimes(1))
		expect(signals[0].aborted).toBe(false)

		// 修改金额：旧批次被立即取消（网络层）
		const amountInput = screen.getByRole("spinbutton")
		await user.clear(amountInput)
		await user.type(amountInput, "200")
		await waitFor(() => expect(signals[0].aborted).toBe(true))

		// 新金额请求发出，signal 未被取消
		await waitFor(() => expect(getCurrenciesDetailsMock).toHaveBeenCalledTimes(2))
		expect(signals[1].aborted).toBe(false)

		// 新请求完成 → 最终 UI 匹配最新金额；旧请求从未提交
		deferreds[1].resolve([liveRow("bankA", 7.4)])
		expect(await screen.findByText("7.4")).toBeInTheDocument()
		expect(screen.queryByText("7.1")).not.toBeInTheDocument()
	})

	it("关闭交叉汇率取消进行中的 BFS 请求", async () => {
		const calls: Array<{ signal: AbortSignal; bfs: boolean }> = []
		getCurrenciesDetailsMock.mockImplementation(
			(_currencies, _to, _from, setResult, options) => {
				const signal = options?.signal
				if (signal) {
					calls.push({
						signal,
						bfs: options?.bfs ?? false,
					})
				}
				const rows = [liveRow("bankA", 7.1)]
				setResult?.({ data: rows, fastFailed: false })
				return Promise.resolve(rows)
			}
		)

		renderPair()

		// 初始 bfs=false 请求
		await waitFor(() => expect(getCurrenciesDetailsMock).toHaveBeenCalledTimes(1))
		expect(calls[0].bfs).toBe(false)

		// 开启交叉汇率 → bfs=true 请求发出
		fireEvent.click(crossRatesButton())
		await waitFor(() => expect(getCurrenciesDetailsMock).toHaveBeenCalledTimes(2))
		expect(calls[1].bfs).toBe(true)
		expect(calls[1].signal.aborted).toBe(false)

		// 关闭交叉汇率 → 进行中的 BFS 请求被取消
		fireEvent.click(crossRatesButton())
		await waitFor(() => expect(calls[1].signal.aborted).toBe(true))

		// 新请求回到 bfs=false，signal 未被取消
		await waitFor(() => expect(getCurrenciesDetailsMock).toHaveBeenCalledTimes(3))
		expect(calls[2].bfs).toBe(false)
		expect(calls[2].signal.aborted).toBe(false)
	})

	it("单对视图 abort 不影响矩阵视图进行中的请求（视图隔离）", async () => {
		const user = userEvent.setup()
		const pairSignals: AbortSignal[] = []
		getCurrenciesDetailsMock.mockImplementation(
			(_currencies, _to, _from, _setResult, options) => {
				const signal = options?.signal
				if (signal) pairSignals.push(signal)
				return new Promise<FXListProps[]>(() => {})
			}
		)
		const matrixSignals: AbortSignal[] = []
		const matrixDeferreds: Array<{ resolve: (m: RatesMatrix) => void }> = []
		getRatesMatrixMock.mockImplementation((_currencies, _base, options) => {
			const signal = options?.signal
			if (signal) matrixSignals.push(signal)
			return new Promise<RatesMatrix>((resolve) => {
				matrixDeferreds.push({ resolve })
			})
		})

		renderPair()

		// 单对请求在途
		await waitFor(() => expect(getCurrenciesDetailsMock).toHaveBeenCalledTimes(1))
		const pairSignal = pairSignals[0]
		expect(pairSignal.aborted).toBe(false)

		// 切换到矩阵视图：单对请求被取消
		await user.click(screen.getByRole("tab", { name: "全对矩阵" }))
		await waitFor(() => expect(pairSignal.aborted).toBe(true))

		// 矩阵请求（防抖后）发出，signal 未被取消——两个视图互不影响
		await waitFor(() => expect(getRatesMatrixMock).toHaveBeenCalledTimes(1))
		expect(matrixSignals[0].aborted).toBe(false)

		// 矩阵请求完成 → 矩阵正常渲染
		matrixDeferreds[0].resolve({
			bankA: { USD: { middle: 7.1 }, EUR: { middle: 8.2 } },
		})
		expect(await screen.findByText("7.1")).toBeInTheDocument()
	})
})
