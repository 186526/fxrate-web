// @vitest-environment jsdom
// 预绘制主题初始化脚本（componets/theme-init.ts）的契约测试：脚本必须在浏览器全局
// 可用时把 localStorage → prefers-color-scheme 解析出的主题写到 <html data-theme> 与
// colorScheme，且绝不抛错（localStorage/matchMedia 不可用时静默回落 light）。

import { beforeEach, describe, expect, it, vi } from "vitest"
import { THEME_ATTR, THEME_KEY, themeInitScript } from "@/componets/theme-init"

const runScript = (): void => {
	new Function(themeInitScript)()
}

describe("themeInitScript 预绘制主题初始化", () => {
	beforeEach(() => {
		window.localStorage.clear()
		document.documentElement.removeAttribute(THEME_ATTR)
		document.documentElement.style.colorScheme = ""
		vi.restoreAllMocks()
	})

	it("localStorage 存 dark 时写入 data-theme=dark 与 colorScheme=dark", () => {
		window.localStorage.setItem(THEME_KEY, "dark")
		runScript()
		expect(document.documentElement.getAttribute(THEME_ATTR)).toBe("dark")
		expect(document.documentElement.style.colorScheme).toBe("dark")
	})

	it("localStorage 存 light 时写入 data-theme=light", () => {
		window.localStorage.setItem(THEME_KEY, "light")
		runScript()
		expect(document.documentElement.getAttribute(THEME_ATTR)).toBe("light")
		expect(document.documentElement.style.colorScheme).toBe("light")
	})

	it("无存档时按 prefers-color-scheme: dark 回落", () => {
		vi.spyOn(window, "matchMedia").mockImplementation(
			((query: string) => ({
				matches: query.includes("dark"),
				media: query,
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false,
			})) as unknown as typeof window.matchMedia
		)
		runScript()
		expect(document.documentElement.getAttribute(THEME_ATTR)).toBe("dark")
	})

	it("无存档且系统偏好 light 时回落 light", () => {
		runScript()
		expect(document.documentElement.getAttribute(THEME_ATTR)).toBe("light")
	})

	it("localStorage 抛错时静默回落且不抛异常", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("storage blocked")
		})
		expect(runScript).not.toThrow()
		expect(document.documentElement.getAttribute(THEME_ATTR)).toBe("light")
	})

	it("脚本内容不含 </script> 序列（防 HTML 解析器提前截断）", () => {
		expect(themeInitScript).not.toContain("</script")
		expect(themeInitScript).toContain("data-theme")
	})
})
