// @vitest-environment jsdom
// rateStats 的统计浮层：桌面端 StatsTipProvider 持唯一受控 Tooltip（每格只提供触发元素），
// 移动端每格点击开 Popover。矩阵 300+ 格共用同一个 Provider，因此「卸载 cleanup 不悬空」
// 与「移动端 aria 契约」是最容易静默坏掉的两处；此文件专门覆盖它们。
//
// 桌面端 hover 展示已在 fxmatrixgrid.test.tsx / index-pair.test.tsx 间接覆盖，
// 这里不重复，只补 Provider 级行为。

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { createTheme, ThemeProvider } from "@mui/material/styles"

import { StatsTip, StatsTipProvider } from "@/componets/rateStats"

const theme = createTheme({
	palette: {
		primary: { main: "#2f6f73" },
		brandSoft: "rgba(47,111,115,0.14)",
		surfaceMuted: "#f1ede4",
	},
})

const originalMatchMedia = window.matchMedia

function setMobile(mobile: boolean) {
	window.matchMedia = (() => ({
		matches: mobile,
		media: "",
		onchange: null,
		addListener: () => {},
		removeListener: () => {},
		addEventListener: () => {},
		removeEventListener: () => {},
		dispatchEvent: () => false,
	})) as unknown as typeof window.matchMedia
}

function renderTip(content: React.ReactNode = <span>统计内容</span>) {
	return render(
		<ThemeProvider theme={theme}>
			<StatsTipProvider>
				<StatsTip content={content}>
					<span>7.10</span>
				</StatsTip>
			</StatsTipProvider>
		</ThemeProvider>
	)
}

describe("rateStats 移动端 Popover", () => {
	afterEach(() => {
		window.matchMedia = originalMatchMedia
	})

	it("点击触发格打开 role=dialog 弹窗并展示统计内容", async () => {
		setMobile(true)
		renderTip()
		fireEvent.click(screen.getByText("7.10"))
		expect(
			await screen.findByRole("dialog", { name: "汇率统计详情" })
		).toBeInTheDocument()
		expect(await screen.findByText("统计内容")).toBeInTheDocument()
	})

	it("Enter 键激活弹窗（键盘可达，不依赖触摸）", async () => {
		setMobile(true)
		renderTip()
		fireEvent.keyDown(screen.getByText("7.10"), { key: "Enter" })
		expect(
			await screen.findByRole("dialog", { name: "汇率统计详情" })
		).toBeInTheDocument()
	})

	it("空格键激活弹窗", async () => {
		setMobile(true)
		renderTip()
		fireEvent.keyDown(screen.getByText("7.10"), { key: " " })
		expect(
			await screen.findByRole("dialog", { name: "汇率统计详情" })
		).toBeInTheDocument()
	})

	it("触发格带 aria-haspopup=dialog 与 aria-expanded 状态", async () => {
		setMobile(true)
		renderTip()
		const cell = screen.getByText("7.10")
		expect(cell).toHaveAttribute("aria-haspopup", "dialog")
		expect(cell).toHaveAttribute("aria-expanded", "false")
		fireEvent.click(cell)
		await screen.findByRole("dialog", { name: "汇率统计详情" })
		await waitFor(() =>
			expect(cell).toHaveAttribute("aria-expanded", "true")
		)
	})

	it("移动端不渲染共享 Tooltip（只有 Popover 一条路径）", () => {
		setMobile(true)
		renderTip()
		expect(document.querySelectorAll(".MuiTooltip-popper")).toHaveLength(0)
	})
})

describe("rateStats 卸载 cleanup", () => {
	afterEach(() => {
		window.matchMedia = originalMatchMedia
	})

	it("桌面端：活动触发格卸载后共享浮层关闭，不留悬空浮层", async () => {
		setMobile(false)
		const { unmount } = renderTip()
		const cell = screen.getByText("7.10")
		fireEvent.mouseEnter(cell)
		// 打开后触发格获得 aria-describedby 关联共享浮层
		await waitFor(() =>
			expect(cell).toHaveAttribute("aria-describedby")
		)
		unmount()
		// 卸载后不应残留浮层内容（cleanup 调 hide(tipId)）
		expect(screen.queryByText("统计内容")).not.toBeInTheDocument()
	})

	it("桌面端：活动触发格被卸载（数据刷新移除行）时共享浮层随之关闭", async () => {
		setMobile(false)
		// 两个格，移除活动的那一个；Provider 仍在（模拟矩阵数据刷新移除某行）
		const { rerender } = render(
			<ThemeProvider theme={theme}>
				<StatsTipProvider>
					<StatsTip content={<span>第一格统计</span>}>
						<span>7.10</span>
					</StatsTip>
					<StatsTip content={<span>第二格统计</span>}>
						<span>8.20</span>
					</StatsTip>
				</StatsTipProvider>
			</ThemeProvider>
		)
		const first = screen.getByText("7.10")
		fireEvent.mouseEnter(first)
		await waitFor(() => expect(first).toHaveAttribute("aria-describedby"))
		expect(screen.getByText("第一格统计")).toBeInTheDocument()

		// 移除活动格，保留另一个格与 Provider
		rerender(
			<ThemeProvider theme={theme}>
				<StatsTipProvider>
					<StatsTip content={<span>第二格统计</span>}>
						<span>8.20</span>
					</StatsTip>
				</StatsTipProvider>
			</ThemeProvider>
		)
		// cleanup 必须关闭浮层，否则触发格已消失、浮层内容仍挂在 DOM 上
		await waitFor(() =>
			expect(screen.queryByText("第一格统计")).not.toBeInTheDocument()
		)
	})
})
