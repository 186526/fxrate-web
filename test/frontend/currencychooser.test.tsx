// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createTheme, ThemeProvider } from "@mui/material/styles"
import CurrencyChooser from "@/componets/currencyChooser"

const theme = createTheme({
	palette: {
		mode: "light",
		primary: { main: "#2f6f73" },
		brandSoft: "rgba(47,111,115,0.14)",
		surfaceMuted: "#f1ede4",
	},
})

const noop = () => undefined

function renderChooser(
	overrides: Partial<Parameters<typeof CurrencyChooser>[0]> = {}
) {
	return render(
		<ThemeProvider theme={theme}>
			<CurrencyChooser
				currencies={["CNY", "USD", "EUR"]}
				from="CNY"
				to="USD"
				amount={100}
				onFromChange={noop}
				onToChange={noop}
				onSwap={noop}
				onAmountChange={noop}
				{...overrides}
			/>
		</ThemeProvider>
	)
}

// React 19 对"把含 key 的 props 对象展开进 JSX"记录 console.error：
// renderOption 必须先解构 key 显式传给根元素，本测试守护该行为不回退
const KEY_SPREAD_RE = /key.*spread|spread.*key/i

describe("CurrencyChooser renderOption", () => {
	it("打开货币下拉：渲染出 option 且无 React key 展开 console.error", async () => {
		const user = userEvent.setup()
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		try {
			renderChooser()

			await user.click(screen.getByRole("combobox", { name: "基准货币" }))
			const options = await screen.findAllByRole("option")
			expect(options.length).toBeGreaterThan(0)

			const keyWarnings = errorSpy.mock.calls.filter(
				(c) => typeof c[0] == "string" && KEY_SPREAD_RE.test(c[0])
			)
			expect(keyWarnings).toEqual([])
		} finally {
			errorSpy.mockRestore()
		}
	})

	it("打开目标货币下拉同样无 key 展开错误", async () => {
		const user = userEvent.setup()
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		try {
			renderChooser()

			await user.click(screen.getByRole("combobox", { name: "目标货币" }))
			const options = await screen.findAllByRole("option")
			expect(options.length).toBeGreaterThan(0)

			const keyWarnings = errorSpy.mock.calls.filter(
				(c) => typeof c[0] == "string" && KEY_SPREAD_RE.test(c[0])
			)
			expect(keyWarnings).toEqual([])
		} finally {
			errorSpy.mockRestore()
		}
	})
})

describe("CurrencyChooser 金额标签", () => {
	it("矩阵正向（showTo=false, reverse=false）：金额按基准货币计", () => {
		renderChooser({ showTo: false, to: "CNY", reverse: false })
		expect(screen.getByLabelText("金额 (CNY)")).toBeInTheDocument()
	})

	it("矩阵反向（showTo=false, reverse=true）：金额按各列货币计，而非基准货币", () => {
		renderChooser({ showTo: false, to: "CNY", reverse: true })
		expect(screen.getByLabelText("金额 (各货币)")).toBeInTheDocument()
		expect(screen.queryByLabelText("金额 (CNY)")).not.toBeInTheDocument()
	})

	it("单对视图保持原语义：正向按目标货币、反向按基准货币", () => {
		const { rerender } = renderChooser()
		expect(screen.getByLabelText("金额 (USD)")).toBeInTheDocument()

		rerender(
			<ThemeProvider theme={theme}>
				<CurrencyChooser
					currencies={["CNY", "USD", "EUR"]}
					from="CNY"
					to="USD"
					amount={100}
					onFromChange={noop}
					onToChange={noop}
					onSwap={noop}
					onAmountChange={noop}
					reverse={true}
				/>
			</ThemeProvider>
		)
		expect(screen.getByLabelText("金额 (CNY)")).toBeInTheDocument()
	})

	it("显式 amountLabel prop 覆盖默认标签", () => {
		renderChooser({ amountLabel: "金额 (每列货币)" })
		expect(screen.getByLabelText("金额 (每列货币)")).toBeInTheDocument()
	})
})
