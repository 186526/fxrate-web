// @vitest-environment jsdom
// 精度下拉的越界选项回归：parsePrecision 接受 [-1, 6] 的任意整数（URL/localStorage
// 均可写入），而预设只有 -1/0/2/4/6。当前值不在预设时若直接作为 Select 的 value，
// MUI 会报 "out-of-range value" 且下拉没有选中项、用户看不出当前精度。
// 这里锁住：越界值动态补一个对应位数选项并被选中；补选项与预设项同列；预设值不重复。

import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import Header from "@/components/home/header"
import { ThemeProvider } from "@/components/theme"

const renderHeader = (precision: number) => {
	const onPrecisionChange = vi.fn()
	render(
		<ThemeProvider>
			<Header
				view="pair"
				onViewChange={vi.fn()}
				sourceCount={3}
				lastUpdated={null}
				precision={precision}
				onPrecisionChange={onPrecisionChange}
				onPrecisionReset={vi.fn()}
				crossRates={false}
				onCrossRatesToggle={vi.fn()}
				onRefresh={vi.fn()}
				onOpenApiDocs={vi.fn()}
			/>
		</ThemeProvider>
	)
	return { onPrecisionChange }
}

// 下拉的可访问名来自 TextField 的 label（aria-labelledby），不是 inputProps 的 aria-label
const precisionSelect = () => screen.getByLabelText("精度")

describe("Header 精度下拉的越界当前值", () => {
	it("precision=3 时下拉显示 3 位且不触发 MUI out-of-range 警告", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

		renderHeader(3)

		expect(precisionSelect()).toHaveTextContent("3 位")
		expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
			"out-of-range"
		)
	})

	it("precision=3 时下拉含被选中的 3 位选项，且与预设项同列按位数排序", () => {
		renderHeader(3)

		// MUI Select 只在 mousedown 上打开菜单，click 不会触发
		fireEvent.mouseDown(precisionSelect())
		const option = screen.getByRole("option", { name: "3 位" })
		expect(option).toHaveAttribute("aria-selected", "true")

		const labels = screen
			.getAllByRole("option")
			.map((item) => item.textContent)
		expect(labels).toEqual(["原样", "0 位", "2 位", "3 位", "4 位", "6 位", "恢复默认"])
	})

	it("precision=1/5 同样补齐对应选项", () => {
		const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

		const { unmount } = render(
			<ThemeProvider>
				<Header
					view="pair"
					onViewChange={vi.fn()}
					sourceCount={3}
					lastUpdated={null}
					precision={1}
					onPrecisionChange={vi.fn()}
					onPrecisionReset={vi.fn()}
					crossRates={false}
					onCrossRatesToggle={vi.fn()}
					onRefresh={vi.fn()}
					onOpenApiDocs={vi.fn()}
				/>
			</ThemeProvider>
		)
		expect(precisionSelect()).toHaveTextContent("1 位")
		expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
			"out-of-range"
		)
		unmount()

		renderHeader(5)
		expect(precisionSelect()).toHaveTextContent("5 位")
		expect(consoleError.mock.calls.flat().join(" ")).not.toContain(
			"out-of-range"
		)
	})

	it("预设精度 2 位不重复追加选项", () => {
		renderHeader(2)

		fireEvent.mouseDown(precisionSelect())
		expect(screen.getAllByRole("option", { name: "2 位" })).toHaveLength(1)
	})
})
