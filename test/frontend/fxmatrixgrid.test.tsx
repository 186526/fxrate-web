// @vitest-environment jsdom
import * as React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

beforeEach(() => {
	localStorage.clear()
})

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

	it("部分单元格缺少 middle 时保持缺失，不伪造 0 报价", async () => {
		const user = userEvent.setup()
		mockedRow.mockResolvedValue({
			USD: { cash: 6.9 } as RatesMatrixCell,
		})
		renderGrid({
			sourceCurrencies: { bankA: ["USD"], visa: ["USD"] },
		})

		await user.click(screen.getByRole("button", { name: "点击加载" }))
		await waitFor(() => expect(mockedRow).toHaveBeenCalled())
		expect(screen.queryByText("0")).not.toBeInTheDocument()

		await user.click(screen.getByRole("button", { name: "现钞" }))
		expect(await screen.findByText("6.9")).toBeInTheDocument()
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

	it("StrictMode 双挂载 abort 后自动补查复位并重试：unchanged-key AbortError 不留下 loading/去重", async () => {
		// 模拟 getSourceMatrixRow 真实行为：signal 中止时以 AbortError 拒绝。
		// 第一次调用（StrictMode 首次挂载）挂起等待 abort；第二次（重挂载后的
		// 重试）正常返回数据。旧实现 catch 对 AbortError 直接 return，status 卡在
		// loading + autoAttemptedRef 去重，重挂载后不再补查（死锁）。
		const abortError = () =>
			Object.assign(new Error("aborted"), { name: "AbortError" })
		let call = 0
		mockedRow.mockImplementation(
			(_source, _supported, _targets, _from, options) => {
				const signal = options?.signal
				if (signal?.aborted) return Promise.reject(abortError())
				call++
				if (call == 1) {
					return new Promise((_resolve, reject) => {
						signal?.addEventListener(
							"abort",
							() => reject(abortError()),
							{ once: true }
						)
					})
				}
				return Promise.resolve({ USD: { middle: 7.3 } })
			}
		)
		render(
			<React.StrictMode>
				<ThemeProvider theme={theme}>
					<FXMatrixGrid
						data={{ bankA: { USD: { middle: 7.1 } }, mastercard: {} }}
						from="CNY"
						amount={100}
						sourceCurrencies={{
							bankA: ["USD"],
							mastercard: ["USD"],
						}}
					/>
				</ThemeProvider>
			</React.StrictMode>
		)

		// StrictMode cleanup abort 后必须复位并重试（第二次调用成功返回数据）
		await waitFor(() => expect(mockedRow).toHaveBeenCalledTimes(2))
		expect(await screen.findByText("7.3")).toBeInTheDocument()
		expect(
			screen.queryByRole("button", { name: "加载中..." })
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
			screen.getByRole("button", { name: "参与高亮 1/1 家" })
		).toBeInTheDocument()
		expect(
			screen.queryByRole("button", { name: "参与高亮 2/1 家" })
		).not.toBeInTheDocument()
	})

	it("refreshGeneration 递增（手动刷新）重置已加载的额外行并允许按新代际重新请求", async () => {
		const user = userEvent.setup()
		mockedRow.mockResolvedValue({ USD: { middle: 6.99 } })
		const { rerender } = renderGrid({
			sourceCurrencies: { bankA: ["USD"], visa: ["USD"] },
		})

		await user.click(screen.getByRole("button", { name: "点击加载" }))
		expect(await screen.findByText("6.99")).toBeInTheDocument()
		expect(mockedRow).toHaveBeenCalledTimes(1)

		// 手动刷新：refreshGeneration 递增 → rowParamsKey 含新代际 → 额外行清空
		rerenderGrid(rerender, {
			refreshGeneration: 1,
			sourceCurrencies: { bankA: ["USD"], visa: ["USD"] },
		})
		expect(screen.queryByText("6.99")).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "点击加载" })).toBeInTheDocument()

		// 新代际下重新加载成功（旧代际的请求不阻止新请求）
		await user.click(screen.getByRole("button", { name: "点击加载" }))
		expect(await screen.findByText("6.99")).toBeInTheDocument()
		expect(mockedRow).toHaveBeenCalledTimes(2)
	})
})

describe("矩阵表格语义", () => {
	it("表格带语义 caption，来源列首单元格为 scope=row 行表头", () => {
		renderGrid()

		expect(
			screen.getByRole("table", { name: /基准货币 CNY 的全对矩阵牌价表/ })
		).toBeInTheDocument()
		const sourceTh = screen.getByText("bankA").closest("th")
		expect(sourceTh).toHaveAttribute("scope", "row")
	})

	it("交叉路径格带折算 aria-label，并作为表格唯一 StatsTip 键盘入口", () => {
		renderGrid({
			data: {
				bankA: {
					USD: { middle: 7.1, path: ["CNY", "HKD", "USD"] },
				},
			},
		})

		const cell = screen.getByText("7.1")
		expect(cell).toHaveAttribute(
			"aria-label",
			"7.1，经 CNY → HKD → USD 折算"
		)
		expect(cell).toHaveAttribute("tabindex", "0")
	})

	it("移动端 StatsTip：触摸点击打开弹窗，但大量数字格不形成 Tab 停靠洪泛", async () => {
		const originalMatchMedia = window.matchMedia
		window.matchMedia = (() => ({
			matches: true,
			media: "",
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		})) as unknown as typeof window.matchMedia
		try {
			renderGrid()
			const cell = screen.getByText("7.1")
			const secondCell = screen.getByText("8.2")
			expect(cell).toHaveAttribute("tabindex", "0")
			expect(cell).toHaveAttribute("role", "button")
			expect(cell).toHaveAttribute("aria-haspopup", "dialog")
			expect(cell).toHaveAttribute("aria-expanded", "false")
			expect(secondCell).not.toHaveAttribute("tabindex")
			expect(secondCell).not.toHaveAttribute("role")

			fireEvent.keyDown(cell, { key: "Enter" })
			expect(
				await screen.findByRole("dialog", { name: "汇率统计详情" })
			).toBeInTheDocument()
			expect(await screen.findByText(/平均/)).toBeInTheDocument()
			expect(cell).toHaveAttribute("aria-expanded", "true")
		} finally {
			window.matchMedia = originalMatchMedia
		}
	})

	it("桌面端整张矩阵仅保留一个 StatsTip 顺序 Tab 入口", () => {
		renderGrid()
		const table = screen.getByRole("table")
		const statsTabStops = table.querySelectorAll("td > span[tabindex='0']")
		expect(statsTabStops).toHaveLength(1)
		expect(statsTabStops[0]).toHaveTextContent("7.1")
		expect(screen.getByText("8.2")).not.toHaveAttribute("tabindex")
	})

	it("常用货币按产品定义顺序展示，列排序暴露 aria-sort，报价类型组有名称", async () => {
		const user = userEvent.setup()
		renderGrid({
			data: {
				bankA: {
					THB: { middle: 4.1 },
					USD: { middle: 7.1 },
					EUR: { middle: 8.2 },
				},
			},
		})

		const headers = screen.getAllByRole("columnheader")
		expect(headers.map((header) => header.textContent)).toEqual([
			"银行/平台",
			"🇺🇸USD",
			"🇪🇺EUR",
			"🇹🇭THB",
		])
		expect(screen.getByRole("group", { name: "报价类型" })).toBeInTheDocument()

		await user.click(screen.getByRole("button", { name: /USD/ }))
		expect(headers[1]).toHaveAttribute("aria-sort", "ascending")
		await user.click(screen.getByRole("button", { name: /USD/ }))
		expect(headers[1]).toHaveAttribute("aria-sort", "descending")
	})

	it("用户清空全部显示货币后呈现明确空态且不显示慢源加载入口", async () => {
		localStorage.setItem("fxrate-matrix-currencies", "[]")
		renderGrid({
			sourceCurrencies: { bankA: ["USD", "EUR"], visa: ["USD"] },
		})

		expect(
			await screen.findByText(/未选择显示货币/)
		).toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "点击加载" })).not.toBeInTheDocument()
		expect(mockedRow).not.toHaveBeenCalled()
	})

	it("桌面端 StatsTip describeChild：Tooltip 打开后触发格经 aria-describedby 关联统计描述", async () => {
		const user = userEvent.setup()
		renderGrid()
		const cell = screen.getByText("7.1")
		expect(cell).toHaveAccessibleName("7.1")
		// 悬停/聚焦都会打开 Tooltip，aria 接线一致：describeChild 让统计内容成为
		// 触发格的描述（aria-describedby），不覆盖自身名称（如交叉路径 aria-label）
		await user.hover(cell)
		expect(await screen.findByText(/平均/)).toBeInTheDocument()
		expect(cell).toHaveAttribute("aria-describedby")
		expect(cell).toHaveAccessibleName("7.1")
	})

	it("过期来源的 StaleIcon 以简短名称暴露图标，并关联详细描述", async () => {
		const user = userEvent.setup()
		renderGrid({
			data: {
				bankA: {
					USD: {
						middle: 7.1,
						updated: new Date("2020-01-01T00:00:00Z"),
					},
				},
			},
		})

		const stale = screen.getByRole("img", { name: "数据可能已过期" })
		expect(stale).toHaveAttribute("tabindex", "0")
		await user.hover(stale)
		const tooltip = await screen.findByRole("tooltip")
		expect(tooltip).toHaveTextContent(/未更新，数据可能不准确/)
		expect(stale).toHaveAttribute("aria-describedby", tooltip.id)
		expect(stale).toHaveAccessibleName("数据可能已过期")
	})

	it("角落格 zIndex 高于 MUI stickyHeader 默认（2），双轴滚动时覆盖表头×首列交叉区", () => {
		renderGrid()

		const cornerTh = screen.getAllByRole("columnheader")[0] as HTMLElement
		const headerTh = screen.getAllByRole("columnheader")[1] as HTMLElement
		const cornerZ = parseInt(window.getComputedStyle(cornerTh).zIndex, 10)
		const headerZ = parseInt(window.getComputedStyle(headerTh).zIndex, 10)
		// MUI stickyHeader 使表头格 zIndex=2；角落格必须更高，否则同层时
		// 靠后的货币表头会盖住角落（fxlistgrid 头部名称格同用 3）
		expect(headerZ).toBe(2)
		expect(cornerZ).toBeGreaterThan(headerZ)
		expect(cornerZ).toBeGreaterThan(2)
	})

	it("轻量斑马纹：奇数行数据格 surfaceMuted 且 sticky 首列同步，hover 属性保留", async () => {
		renderGrid({
			data: {
				bankA: { USD: { middle: 7.1 } },
				bankB: { USD: { middle: 7.05 } },
				bankC: { USD: { middle: 7.2 } },
				bankD: { USD: { middle: 7.15 } },
			},
		})

		// visibleSources 按名称排序：bankA(偶) / bankB(奇) / bankC(偶) / bankD(奇)。
		// 慢源"点击加载"行无 td 也无 hover prop，先过滤只留数据行。
		// bankC(7.2) 是 USD 列最优价（高亮格 brandSoft），斑马断言只取其余行
		const bodyRows = screen
			.getAllByRole("row")
			.filter(
				(r) =>
					r.querySelector("th[scope='row']") &&
					r.querySelectorAll("td").length > 0
			)
		expect(bodyRows.length).toBeGreaterThanOrEqual(4)
		const styleOf = (el: HTMLElement) =>
			window.getComputedStyle(el).backgroundColor
		const cellOf = (row: HTMLElement) => row.querySelector("td") as HTMLElement
		// 斑马画在单元格层（非行层，避免透过半透明 brandSoft 高亮格破坏对比度）
		expect(styleOf(cellOf(bodyRows[1]))).toBe(styleOf(cellOf(bodyRows[3])))
		expect(styleOf(cellOf(bodyRows[0]))).not.toBe(styleOf(cellOf(bodyRows[1])))

		// sticky 首列同步斑马底色，横向滚动时不露白
		const zebraStickyTh = bodyRows[1].querySelector(
			"th[scope='row']"
		) as HTMLElement
		expect(styleOf(zebraStickyTh)).toBe(styleOf(cellOf(bodyRows[1])))

		// zebra 不影响 hover 接线（MUI 仍挂 hover 类；CSS :hover 由浏览器处理）
		for (const row of bodyRows) {
			expect(row).toHaveClass("MuiTableRow-hover")
		}
	})

	it("数值列窄屏宽度规则：nowrap + text-overflow 截断超长值", () => {
		renderGrid({
			data: {
				bankA: {
					USD: { middle: 12345678.123456 },
					EUR: { middle: 7.1 },
				},
			},
		})

		const td = screen
			.getByText("12345678.123456")
			.closest("td") as HTMLElement
		const style = window.getComputedStyle(td)
		expect(style.whiteSpace).toBe("nowrap")
		expect(style.textOverflow).toBe("ellipsis")
		expect(style.overflow).toBe("hidden")
	})
})
