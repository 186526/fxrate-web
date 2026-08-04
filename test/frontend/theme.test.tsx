// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { StrictMode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ThemeProvider, useThemeMode } from "@/componets/theme"
import { THEME_ATTR } from "@/componets/theme-init"

const THEME_KEY = "fxrate-theme"

function Harness() {
	const { mode, toggle } = useThemeMode()
	return (
		<div>
			<span data-testid="mode">{mode}</span>
			<button onClick={toggle}>toggle</button>
		</div>
	)
}

describe("ThemeProvider StrictMode 持久化", () => {
	beforeEach(() => {
		window.localStorage.clear()
		document.documentElement.removeAttribute(THEME_ATTR)
		document.documentElement.style.colorScheme = ""
	})

	it("预置 dark 存档在 StrictMode 挂载时不被覆盖，且恢复为 dark", async () => {
		window.localStorage.setItem(THEME_KEY, "dark")
		const setItemSpy = vi.spyOn(Storage.prototype, "setItem")
		try {
			render(
				<StrictMode>
					<ThemeProvider>
						<Harness />
					</ThemeProvider>
				</StrictMode>
			)
			await waitFor(() => {
				expect(screen.getByTestId("mode")).toHaveTextContent("dark")
			})
			// 挂载全程写回的必须是读档后的 dark，不得出现默认值 light 覆盖
			const themeWrites = setItemSpy.mock.calls
				.filter(([key]) => key == THEME_KEY)
				.map(([, value]) => value)
			expect(themeWrites.length).toBeGreaterThan(0)
			expect(themeWrites.every((value) => value == "dark")).toBe(true)
			expect(window.localStorage.getItem(THEME_KEY)).toBe("dark")
		} finally {
			setItemSpy.mockRestore()
		}
	})

	it("用户切换主题后持久化提交后的状态", async () => {
		window.localStorage.setItem(THEME_KEY, "light")
		render(
			<StrictMode>
				<ThemeProvider>
					<Harness />
				</ThemeProvider>
			</StrictMode>
		)
		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("light")
		})

		fireEvent.click(screen.getByRole("button", { name: "toggle" }))
		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("dark")
		})
		expect(window.localStorage.getItem(THEME_KEY)).toBe("dark")

		fireEvent.click(screen.getByRole("button", { name: "toggle" }))
		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("light")
		})
		expect(window.localStorage.getItem(THEME_KEY)).toBe("light")
	})

	it("预绘制 data-theme=dark 优先于 localStorage，切换时同步更新属性与存档", async () => {
		// 模拟 layout 的 beforeInteractive 脚本已在 hydration 前把主题写到 <html>
		document.documentElement.setAttribute(THEME_ATTR, "dark")
		window.localStorage.setItem(THEME_KEY, "light")
		render(
			<ThemeProvider>
				<Harness />
			</ThemeProvider>
		)
		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("dark")
		})
		// 属性是单一事实来源：当前生效主题被持久化，把存档对齐到属性（而非反之）
		expect(window.localStorage.getItem(THEME_KEY)).toBe("dark")

		fireEvent.click(screen.getByRole("button", { name: "toggle" }))
		await waitFor(() => {
			expect(screen.getByTestId("mode")).toHaveTextContent("light")
		})
		expect(document.documentElement.getAttribute(THEME_ATTR)).toBe("light")
		expect(window.localStorage.getItem(THEME_KEY)).toBe("light")
	})
})
