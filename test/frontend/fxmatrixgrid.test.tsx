// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createTheme, ThemeProvider } from "@mui/material/styles"
import FXMatrixGrid from "@/componets/fxmatrixgrid"
import { getSourceMatrixRow } from "@/componets/tools"
import type { RatesMatrixCell } from "@/componets/tools"

vi.mock("@/componets/tools", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/componets/tools")>()
	return { ...actual, getSourceMatrixRow: vi.fn() }
})

const mockedRow = vi.mocked(getSourceMatrixRow)

const theme = createTheme({
	palette: {
		mode: "light",
		primary: { main: "#2f6f73" },
		brandSoft: "rgba(47,111,115,0.14)",
		surfaceMuted: "#f1ede4",
	},
})

const baseData = {
	bankA: { USD: { middle: 7.1 }, EUR: { middle: 8.2 } },
}

function renderGrid(overrides: Partial<Parameters<typeof FXMatrixGrid>[0]> = {}) {
	return render(
		<ThemeProvider theme={theme}>
			<FXMatrixGrid
				data={baseData}
				from="CNY"
				amount={100}
				slowSources={["visa"]}
				{...overrides}
			/>
		</ThemeProvider>
	)
}

function rerenderGrid(
	rerender: (ui: React.ReactElement) => void,
	overrides: Partial<Parameters<typeof FXMatrixGrid>[0]> = {}
) {
	rerender(
		<ThemeProvider theme={theme}>
			<FXMatrixGrid
				data={baseData}
				from="CNY"
				amount={100}
				slowSources={["visa"]}
				{...overrides}
			/>
		</ThemeProvider>
	)
}

describe("FXMatrixGrid 单元格深合并 / key 行为", () => {
	it("初始渲染：来源行可见，慢源显示点击加载", () => {
		renderGrid()
		expect(screen.getByText("bankA")).toBeInTheDocument()
		expect(screen.getByText(/Visa/)).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "点击加载" })).toBeInTheDocument()
		expect(screen.getByText("7.1")).toBeInTheDocument()
		expect(screen.getByText("8.2")).toBeInTheDocument()
	})

	it("手动加载慢源行后按单元格深合并进矩阵，不覆盖其他来源", async () => {
		const user = userEvent.setup()
		mockedRow.mockResolvedValue({
			USD: { middle: 6.99, updated: new Date() },
			EUR: { middle: 8.05 },
		})
		renderGrid({
			sourceCurrencies: { bankA: ["USD", "EUR"], visa: ["USD", "EUR"] },
		})

		await user.click(screen.getByRole("button", { name: "点击加载" }))

		expect(await screen.findByText("6.99")).toBeInTheDocument()
		expect(screen.getByText("8.05")).toBeInTheDocument()
		expect(screen.getByText("7.1")).toBeInTheDocument()
		expect(screen.getByText("8.2")).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "点击加载" })).not.toBeInTheDocument()
		expect(mockedRow).toHaveBeenCalledWith(
			"visa",
			["USD", "EUR"],
			["USD", "EUR"],
			"CNY",
			expect.objectContaining({ amount: 100, precision: 4 })
		)
	})

	it("参数（精度）变化触发 rowParamsKey 变化，清空已加载的额外行", async () => {
		const user = userEvent.setup()
		mockedRow.mockResolvedValue({ USD: { middle: 6.99 } })
		const { rerender } = renderGrid()

		await user.click(screen.getByRole("button", { name: "点击加载" }))
		expect(await screen.findByText("6.99")).toBeInTheDocument()

		rerender(
			<ThemeProvider theme={theme}>
				<FXMatrixGrid
					data={baseData}
					from="CNY"
					amount={100}
					precision={6}
					slowSources={["visa"]}
				/>
			</ThemeProvider>
		)

		expect(screen.queryByText("6.99")).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "点击加载" })).toBeInTheDocument()
	})

	it("主数据行为空的非慢源（如卡组织 403）自动经 getSourceMatrixRow 补查", async () => {
		mockedRow.mockResolvedValue({ USD: { middle: 7.2 } })
		renderGrid({
			data: {
				bankA: { USD: { middle: 7.1 }, EUR: { middle: 8.2 } },
				mastercard: {},
			},
			sourceCurrencies: {
				bankA: ["USD", "EUR"],
				mastercard: ["USD", "EUR"],
			},
		})

		expect(mockedRow).toHaveBeenCalledWith(
			"mastercard",
			["USD", "EUR"],
			["USD", "EUR"],
			"CNY",
			expect.objectContaining({ amount: 100, precision: 4 })
		)
		expect(await screen.findByText("7.2")).toBeInTheDocument()
	})

	it("交叉补查与主数据同格时按字段深合并：主数据重叠字段优先，补查独有字段保留", async () => {
		const user = userEvent.setup()
		mockedRow.mockResolvedValue({
			USD: {
				middle: 7.09,
				cash: 7.05,
				remit: 7.08,
				path: ["CNY", "HKD", "USD"],
				updated: new Date("2026-01-01T00:00:00Z"),
			},
		})
		renderGrid({
			// 生产形态：getRatesMatrix 对缺值格显式写 cash/remit/path 为 undefined
			data: {
				bankA: {
					USD: {
						middle: 7.1,
						cash: undefined,
						remit: undefined,
						path: undefined,
					},
					EUR: { middle: 8.2 },
				},
			},
			sourceCurrencies: { bankA: ["USD", "EUR"] },
			crossRates: true,
		})

		// 切换到现汇列：bankA 的 USD 格缺 remit → 触发交叉补查
		await user.click(screen.getByRole("button", { name: "现汇" }))
		// 补查带回的 remit 7.08 必须保留（主数据同格 remit 为 undefined，
		// 旧实现整格浅合并把它覆盖丢失）
		expect(await screen.findByText("7.08")).toBeInTheDocument()

		// 现钞列同样保留补查带回的 cash 7.05
		await user.click(screen.getByRole("button", { name: "现钞" }))
		expect(await screen.findByText("7.05")).toBeInTheDocument()

		// 切回中间价：主数据 middle 7.1 优先，不被补查的 7.09 覆盖
		await user.click(screen.getByRole("button", { name: "中间价" }))
		expect(screen.getByText("7.1")).toBeInTheDocument()
		expect(screen.queryByText("7.09")).not.toBeInTheDocument()

		// 补查带回的过桥路径保留（主数据同格 path 为 undefined），悬停可见
		await user.hover(screen.getByText("7.1"))
		expect(await screen.findByText(/CNY → HKD → USD/)).toBeInTheDocument()
	})
})

describe("额外行 keyed 快照 / 失败重试 / 计数一致性", () => {
	it("参数变化后，旧参数的延迟响应不得渲染旧行或污染新参数（key 隔离）", async () => {
		const user = userEvent.setup()
		let resolveStale!: (row: Record<string, RatesMatrixCell>) => void
		mockedRow.mockImplementationOnce(
			() =>
				new Promise<Record<string, RatesMatrixCell>>((res) => {
					resolveStale = res
				})
		)
		mockedRow.mockResolvedValue({ USD: { middle: 7.4 } })
		const { rerender } = renderGrid({
			sourceCurrencies: { bankA: ["USD"], visa: ["USD"] },
		})

		// 为 amount=100 的参数点击加载 visa，响应悬挂
		await user.click(screen.getByRole("button", { name: "点击加载" }))
		expect(screen.getByText("加载中...")).toBeInTheDocument()

		// 参数变化（amount=200）：重置额外行，visa 回到"点击加载"
		rerenderGrid(rerender, {
			amount: 200,
			sourceCurrencies: { bankA: ["USD"], visa: ["USD"] },
		})
		expect(screen.getByRole("button", { name: "点击加载" })).toBeInTheDocument()

		// 旧参数（amount=100）的响应此刻才返回：keyed 快照 + ref 守卫拒绝写入
		await act(async () => {
			resolveStale({ USD: { middle: 6.99 } })
			await Promise.resolve()
		})

		expect(screen.queryByText("6.99")).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "点击加载" })).toBeInTheDocument()
	})

	it("参数变化时取消在途的额外行请求（signal 被 abort，不误伤新参数请求）", async () => {
		const user = userEvent.setup()
		const signals: AbortSignal[] = []
		mockedRow.mockImplementation((_source, _supported, _targets, _from, options) => {
			const signal = options?.signal
			if (signal) signals.push(signal)
			return new Promise<Record<string, RatesMatrixCell>>(() => {})
		})
		const { rerender } = renderGrid({
			sourceCurrencies: { bankA: ["USD"], visa: ["USD"] },
		})

		await user.click(screen.getByRole("button", { name: "点击加载" }))
		expect(signals[0].aborted).toBe(false)

		// 参数变化：在途补查请求被取消
		rerenderGrid(rerender, {
			amount: 200,
			sourceCurrencies: { bankA: ["USD"], visa: ["USD"] },
		})
		await waitFor(() => expect(signals[0].aborted).toBe(true))
	})

	it("自动补查失败可区分并可重试：重试成功后数据合并进矩阵", async () => {
		const user = userEvent.setup()
		mockedRow.mockRejectedValueOnce(new Error("403 Forbidden"))
		mockedRow.mockResolvedValue({ USD: { middle: 7.3 } })
		renderGrid({
			data: { bankA: { USD: { middle: 7.1 } }, mastercard: {} },
			sourceCurrencies: { bankA: ["USD"], mastercard: ["USD"] },
		})

		// 自动补查失败 → 出现可重试的"加载失败，重试"行，且失败不被永久去重
		const retryBtn = await screen.findByRole("button", {
			name: "加载失败，重试",
		})
		expect(retryBtn).toBeInTheDocument()
		expect(screen.queryByText("7.3")).not.toBeInTheDocument()

		// 手动重试成功 → 数据出现，失败行消失
		await user.click(retryBtn)
		expect(await screen.findByText("7.3")).toBeInTheDocument()
		expect(
			screen.queryByRole("button", { name: "加载失败，重试" })
		).not.toBeInTheDocument()
	})

	it("最优价计数分子与分母使用同一可见来源集（隐藏来源不计入分子）", () => {
		// bankC 只有 SEK（非常用币种，默认不启用）→ 行隐藏；且不在默认排除集。
		// 旧实现分子按全部非排除源计数会得出 2/1，现实现分子与分母同取可见源
		renderGrid({
			data: {
				bankA: { USD: { middle: 7.1 } },
				bankC: { SEK: { middle: 0.72 } },
			},
			sourceCurrencies: { bankA: ["USD"] },
		})

		expect(
			screen.getByRole("button", { name: "最优价 1/1 家" })
		).toBeInTheDocument()
		expect(
			screen.queryByRole("button", { name: "最优价 2/1 家" })
		).not.toBeInTheDocument()
	})
})
