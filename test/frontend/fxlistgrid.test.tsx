// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { createTheme, ThemeProvider } from "@mui/material/styles"
import FXListGrid, { FXListProps } from "@/componets/fxlistgrid"

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

function baseProps(): FXListProps[] {
	return [
		{
			name: "bankA",
			type: { buy: { cash: 7.05, remit: 7.08 }, sell: { cash: 7.15, remit: 7.12 } },
			updated: new Date(),
		},
		{
			name: "bankB",
			type: { buy: { cash: 7.06, remit: 7.09 }, sell: { cash: 7.14, remit: 7.11 } },
			updated: new Date(),
		},
		{
			name: "bankC",
			type: { buy: { cash: 7.04, remit: 7.07 }, sell: { cash: 7.16, remit: 7.13 } },
			updated: new Date(),
		},
	]
}

function renderList(props: FXListProps[] = baseProps()) {
	return render(
		<ThemeProvider theme={theme}>
			<FXListGrid props={props} from="CNY" to="USD" amount={100} precision={4} />
		</ThemeProvider>
	)
}

describe("FXListGrid 最优价计数文案", () => {
	it("按钮文案为参与高亮 X/Y 家，分子分母同取可见来源集", () => {
		renderList()

		// 3 个可见来源均非默认排除集 → 3/3
		expect(
			screen.getByRole("button", { name: "参与高亮 3/3 家" })
		).toBeInTheDocument()
		expect(
			screen.queryByRole("button", { name: /最优价/ })
		).not.toBeInTheDocument()
	})

	it("排除来源后分子减小、分母不变", async () => {
		const user = (await import("@testing-library/user-event")).default
		renderList()

		// 打开弹层排除 bankB → 分子 2 / 分母 3
		await user.click(screen.getByRole("button", { name: "参与高亮 3/3 家" }))
		await user.click(screen.getByRole("checkbox", { name: /bankB/ }))
		// 弹层（Modal）打开时外部内容被 aria-hidden，需先关闭再按 role 断言
		await user.keyboard("{Escape}")
		expect(
			screen.getByRole("button", { name: "参与高亮 2/3 家" })
		).toBeInTheDocument()
	})

	it("分子分母都只统计至少含一个有效数值报价的来源", () => {
		renderList([
			...baseProps(),
			{
				name: "metadataOnly",
				type: { buy: { cash: true as unknown as number } },
				updated: new Date(),
			},
		])

		expect(
			screen.getByRole("button", { name: "参与高亮 3/3 家" })
		).toBeInTheDocument()
	})
})

describe("FXListGrid 斑马纹 / 宽度规则", () => {
	it("奇数行数据格 surfaceMuted 且 sticky 首列同步底色，hover 属性保留", () => {
		renderList([
			...baseProps(),
			{
				name: "bankD",
				type: {
					buy: { cash: 7.07, remit: 7.1 },
					sell: { cash: 7.13, remit: 7.1 },
				},
				updated: new Date(),
			},
		])

		// rows 按名称排序：bankA(偶) / bankB(奇) / bankC(偶) / bankD(奇)。
		// bankC 购钞/结钞最优（高亮格 brandSoft），斑马断言只取其余行
		const bodyRows = screen
			.getAllByRole("row")
			.filter((r) => r.querySelector("th[scope='row']"))
		expect(bodyRows.length).toBe(4)
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

		// zebra 不影响 hover 接线
		for (const row of bodyRows) {
			expect(row).toHaveClass("MuiTableRow-hover")
		}
	})

	it("数值列窄屏宽度规则：nowrap + text-overflow 截断超长值", () => {
		renderList([
			{
				name: "bankA",
				type: {
					buy: { cash: 12345678.123456, remit: 7.08 },
					sell: { cash: 7.15, remit: 7.12 },
				},
				updated: new Date(),
			},
		])

		// 数值列：nowrap + ellipsis + overflow hidden（jsdom 不解析媒体查询门控的
		// min/max-width，宽度数字由 e2e scroll-corner 截图验证）
		const td = screen
			.getByText("12345678.123456")
			.closest("td") as HTMLElement
		const style = window.getComputedStyle(td)
		expect(style.whiteSpace).toBe("nowrap")
		expect(style.textOverflow).toBe("ellipsis")
		expect(style.overflow).toBe("hidden")
	})

	it("数值列的表头与正文统一右对齐", () => {
		renderList()
		const header = screen.getByRole("columnheader", { name: "购钞价" })
		const cell = screen.getByText("7.05").closest("td") as HTMLElement

		expect(window.getComputedStyle(header).textAlign).toBe("right")
		expect(window.getComputedStyle(cell).textAlign).toBe("right")
	})
})
