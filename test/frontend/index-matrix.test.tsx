// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeProvider } from "@/componets/theme"
import Index from "@/componets/index"
import {
	getRatesMatrix,
	getCurrenciesDetails,
	getSourceMatrixRow,
	showCurrencyAllRates,
} from "@/componets/tools"
import type { RatesMatrix } from "@/componets/tools"

const { mockSearchParams } = vi.hoisted(() => ({
	mockSearchParams: new URLSearchParams(),
}))

vi.mock("next/navigation", () => ({
	useSearchParams: () => mockSearchParams,
	useRouter: () => ({ push: vi.fn() }),
	usePathname: () => "/matrix",
}))

vi.mock("@/componets/tools", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/componets/tools")>()
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
vi.mocked(getCurrenciesDetails)
vi.mocked(showCurrencyAllRates)

interface DeferredMatrix {
	promise: Promise<RatesMatrix>
	resolve: (value: RatesMatrix) => void
	reject: (reason?: unknown) => void
}

const deferredMatrix = (): DeferredMatrix => {
	let resolve!: (value: RatesMatrix) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<RatesMatrix>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

let pending: DeferredMatrix[] = []

const waitForPending = (count: number, timeout = 3000) =>
	waitFor(() => expect(pending).toHaveLength(count), { timeout })

describe("Index 矩阵请求作废（stale matrix race）", () => {
	beforeEach(() => {
		pending = []
		getRatesMatrixMock.mockReset()
		getRatesMatrixMock.mockImplementation(() => {
			const d = deferredMatrix()
			pending.push(d)
			return d.promise
		})
	})

	it("参数变化后 300ms 防抖窗口内完成的旧请求响应不得落地污染矩阵缓存", async () => {
		const user = userEvent.setup()
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

		// 首次进入矩阵：300ms 防抖后发起 amount=100 请求并渲染 7.1
		await waitForPending(1)
		const first = pending[0]
		await act(async () => {
			first.resolve({ bankA: { USD: { middle: 7.1 } } })
			await Promise.resolve()
		})
		expect(await screen.findByText("7.1")).toBeInTheDocument()

		// 手动刷新：同一 key 的 in-flight 请求（模拟响应较慢）
		await user.click(screen.getByRole("button", { name: "refresh" }))
		await waitForPending(2)
		const refresh = pending[1]

		// 刷新响应未归时把金额改为 200：旧请求进入 300ms 防抖窗口
		const amountInput = screen.getByRole("spinbutton")
		await user.clear(amountInput)
		await user.type(amountInput, "200")

		// 在防抖窗口内完成旧刷新响应（新数值 7.9）：
		// 作废后不得覆盖 matrixCacheRef 里的 7.1
		await act(async () => {
			refresh.resolve({ bankA: { USD: { middle: 7.9 } } })
			await Promise.resolve()
		})

		// 新金额 200 的请求（防抖后发起）让它失败
		await waitForPending(3)
		await act(async () => {
			pending[2].reject(new Error("matrix failed"))
			await Promise.resolve()
		})

		// 切回金额 100：应恢复缓存中的原始 7.1，而不是陈旧刷新写入的 7.9
		await user.clear(amountInput)
		await user.type(amountInput, "100")

		expect(await screen.findByText("7.1")).toBeInTheDocument()
		expect(screen.queryByText("7.9")).not.toBeInTheDocument()
	}, 10_000)
})

describe("Index 矩阵手动刷新额外行代际", () => {
	beforeEach(() => {
		getRatesMatrixMock.mockReset()
		vi.mocked(getSourceMatrixRow).mockReset()
	})

	it("刷新按钮递增 refreshGeneration：已加载的额外行清空并按新代际重新加载", async () => {
		const user = userEvent.setup()
		getRatesMatrixMock.mockResolvedValue({
			bankA: { USD: { middle: 7.1 } },
		})
		vi.mocked(getSourceMatrixRow).mockResolvedValue({
			USD: { middle: 7.2 },
		})

		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{
						bankA: ["CNY", "USD"],
						visa: ["CNY", "USD"],
					}}
				/>
			</ThemeProvider>
		)

		// 矩阵加载后：visa 慢源显示"点击加载"，点击加载成功
		const loadBtn = await screen.findByRole("button", { name: "点击加载" })
		await user.click(loadBtn)
		expect(await screen.findByText("7.2")).toBeInTheDocument()
		expect(getSourceMatrixRow).toHaveBeenCalledTimes(1)

		// 手动刷新：matrixExtraRowsGeneration++ 传给 FXMatrixGrid →
		// 额外行 keyed 快照重置，visa 回到"点击加载"
		await user.click(screen.getByRole("button", { name: "refresh" }))
		expect(screen.queryByText("7.2")).not.toBeInTheDocument()
		const reloadBtn = await screen.findByRole("button", { name: "点击加载" })

		// 新代际下重新加载成功
		await user.click(reloadBtn)
		expect(await screen.findByText("7.2")).toBeInTheDocument()
		expect(getSourceMatrixRow).toHaveBeenCalledTimes(2)
	}, 10_000)
})

describe("Index 矩阵 stale revalidation 提示", () => {
	beforeEach(() => {
		getRatesMatrixMock.mockReset()
		getRatesMatrixMock.mockRejectedValue(new Error("matrix refresh failed"))
	})

	it("刷新失败保留上次成功矩阵，以不占布局的提示明确陈旧语义并允许重试", async () => {
		const user = userEvent.setup()
		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{ bankA: ["CNY", "USD"] }}
					initialMatrix={{ bankA: { USD: { middle: 7.1 } } }}
				/>
			</ThemeProvider>
		)

		expect(screen.getByText("7.1")).toBeInTheDocument()
		expect(
			await screen.findByText("刷新失败，当前显示的是上次成功获取的数据。")
		).toBeInTheDocument()
		expect(screen.getByText("matrix refresh failed")).toBeInTheDocument()
		expect(screen.getByText("7.1")).toBeInTheDocument()

		await user.click(screen.getByRole("button", { name: "重试" }))
		await waitFor(() => expect(getRatesMatrixMock).toHaveBeenCalledTimes(2))
	})

	it("空成功快照后刷新失败显示内联错误，不显示陈旧数据 Snackbar", async () => {
		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{ bankA: ["CNY", "USD"] }}
					initialMatrix={{}}
				/>
			</ThemeProvider>
		)

		expect(await screen.findByText("matrix refresh failed")).toBeInTheDocument()
		expect(
			screen.queryByText("刷新失败，当前显示的是上次成功获取的数据。")
		).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument()
	})

	it("只有空来源行、没有实际报价的快照不触发陈旧数据 Snackbar", async () => {
		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{ bankA: ["CNY", "USD"] }}
					initialMatrix={{ bankA: {} }}
				/>
			</ThemeProvider>
		)

		expect(await screen.findByText("matrix refresh failed")).toBeInTheDocument()
		expect(
			screen.queryByText("刷新失败，当前显示的是上次成功获取的数据。")
		).not.toBeInTheDocument()
	})
})
