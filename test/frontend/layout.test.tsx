// @vitest-environment jsdom
// layout 的 Windows 国旗字体分支（本轮新增）：UA 含 "Windows NT" 时才把
// "Noto Color Emoji Flags" 追加到 body 的 font-family。该字体文件 693 KB，
// 只在 Windows 下载；这个判定是唯一的开关，回归时不会报错、只会静默变慢，
// 所以必须有测试锁住两个方向。
//
// RootLayout 是 async server component 且返回完整 <html>；用 renderToStaticMarkup
// 取标记串断言 <body> 标签。RTL 的 render 会把 html/body 提出容器，拿不到该元素。

import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const headersMock = vi.hoisted(() => ({ ua: "" }))

vi.mock("next/headers", () => ({
	headers: async () => new Headers({ "user-agent": headersMock.ua }),
}))

vi.mock("next/font/google", () => ({
	Inter: () => ({
		className: "inter-mock",
		style: { fontFamily: "Inter" },
	}),
}))

import RootLayout from "@/app/layout"

const WINDOWS_UA =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const ANDROID_UA =
	"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36"
const MAC_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

async function bodyTagWithUa(ua: string): Promise<string> {
	headersMock.ua = ua
	const markup = renderToStaticMarkup(await RootLayout({ children: <div /> }))
	const match = markup.match(/<body[^>]*>/)
	if (match == null) throw new Error("layout 未渲染出 <body>")
	return match[0]
}

describe("layout 国旗字体分支", () => {
	afterEach(() => {
		headersMock.ua = ""
	})

	it("Windows UA 把 Noto Color Emoji Flags 追加到 body font-family", async () => {
		const body = await bodyTagWithUa(WINDOWS_UA)
		expect(body).toContain("Noto Color Emoji Flags")
	})

	it("Windows UA 仍保留 Inter（只在其后追加，不替换主字体）", async () => {
		const body = await bodyTagWithUa(WINDOWS_UA)
		expect(body).toContain("Inter")
		expect(body).toContain("inter-mock")
	})

	it("Android UA 不引用该字体族（避免下载 693 KB）", async () => {
		const body = await bodyTagWithUa(ANDROID_UA)
		expect(body).not.toContain("Noto Color Emoji Flags")
	})

	it("macOS UA 不引用该字体族（系统自带国旗）", async () => {
		const body = await bodyTagWithUa(MAC_UA)
		expect(body).not.toContain("Noto Color Emoji Flags")
	})

	it("无 UA 头时不引用该字体族（不误判为 Windows）", async () => {
		const body = await bodyTagWithUa("")
		expect(body).not.toContain("Noto Color Emoji Flags")
	})

	it("非 Windows 平台仍带 Inter className", async () => {
		const body = await bodyTagWithUa(ANDROID_UA)
		expect(body).toContain("inter-mock")
	})
})
