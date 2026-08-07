import { describe, expect, it } from "vitest"
import { collectStaticResource404s } from "../e2e/helpers/pageDiagnostics"

type FakePage = Parameters<typeof collectStaticResource404s>[0]

function createFakePage() {
	const handlers = new Map<string, Set<(arg: unknown) => void>>()
	const page = {
		on(event: string, callback: (arg: unknown) => void) {
			let set = handlers.get(event)
			if (!set) {
				set = new Set()
				handlers.set(event, set)
			}
			set.add(callback)
		},
	} as unknown as FakePage
	return {
		page,
		emit(event: string, arg: unknown) {
			handlers.get(event)?.forEach((callback) => callback(arg))
		},
	}
}

function makeResponse(
	url: string,
	status: number,
	resourceType: string
): unknown {
	return {
		url: () => url,
		status: () => status,
		request: () => ({ resourceType: () => resourceType }),
	}
}

describe("collectStaticResource404s", () => {
	it("忽略 /bank-logos/ 图片 404（SourceIcon 有设计的 onError 兜底）", () => {
		const { page, emit } = createFakePage()
		const get404s = collectStaticResource404s(page)
		emit(
			"response",
			makeResponse("http://localhost:3000/bank-logos/bankA.svg", 404, "image")
		)
		expect(get404s()).toEqual([])
	})

	it("继续上报脚本/样式/字体/非 bank-logos 图片 404", () => {
		const { page, emit } = createFakePage()
		const get404s = collectStaticResource404s(page)
		emit(
			"response",
			makeResponse("http://localhost:3000/_next/static/chunks/x.js", 404, "script")
		)
		emit(
			"response",
			makeResponse("http://localhost:3000/style.css", 404, "stylesheet")
		)
		emit("response", makeResponse("http://localhost:3000/font.woff2", 404, "font"))
		emit("response", makeResponse("http://localhost:3000/logo.png", 404, "image"))
		expect(get404s()).toEqual([
			"script http://localhost:3000/_next/static/chunks/x.js",
			"stylesheet http://localhost:3000/style.css",
			"font http://localhost:3000/font.woff2",
			"image http://localhost:3000/logo.png",
		])
	})

	it("非 localhost 主机与非 404 响应不收集", () => {
		const { page, emit } = createFakePage()
		const get404s = collectStaticResource404s(page)
		emit(
			"response",
			makeResponse("https://fxrate.sunoaki.net/bank-logos/hsbc.svg", 404, "image")
		)
		emit("response", makeResponse("http://localhost:3000/ok.js", 200, "script"))
		emit("response", makeResponse("http://localhost:3000/api/fxrate", 404, "fetch"))
		expect(get404s()).toEqual([])
	})
})
