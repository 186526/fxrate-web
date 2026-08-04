// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { StrictMode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ThemeProvider, useThemeMode } from "@/componets/theme"

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
})
