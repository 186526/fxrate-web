// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { createTheme, ThemeProvider } from "@mui/material/styles"

import Footer from "@/componets/footer"

const theme = createTheme({
	palette: {
		text: { secondary: "#5a666e" },
		primary: { main: "#2f6f73" },
	},
})

function renderFooter() {
	return render(
		<ThemeProvider theme={theme}>
			<Footer
				buildId="0123456789abcdef"
				buildTime=""
				version="1.2.3"
				backendVersion="fxrate@abc1234 2025-01-01T00:00:00+08:00"
			/>
		</ThemeProvider>
	)
}

describe("Footer 对比度", () => {
	it("后端/版本 caption 不再应用 0.85 透明度降级（text.secondary 原色保证 AA）", () => {
		renderFooter()
		const backend = screen.getByLabelText("后端 fxrate@abc1234")
		const web = screen.getByLabelText("fxrate-web v1.2.3")
		// 移除 opacity 后计算样式回归 1，文字色保持 text.secondary #5a666e（rgb 90,102,110）
		expect(window.getComputedStyle(backend).opacity).toBe("1")
		expect(window.getComputedStyle(web).opacity).toBe("1")
		expect(window.getComputedStyle(backend).color).toBe("rgb(90, 102, 110)")
		expect(window.getComputedStyle(web).color).toBe("rgb(90, 102, 110)")
	})
})
