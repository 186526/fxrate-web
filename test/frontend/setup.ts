// 单元/组件测试共享初始化：fetch 委托桩 + jsdom 浏览器 API 兜底
import { vi } from "vitest"
import "@testing-library/jest-dom/vitest"

// tools.ts 在模块加载（import）时即构造 FXRates client 并绑定 globalThis.fetch。
// 这里装一个可委托的 fetch 桩：默认走真实 fetch，测试内随时可用 __fxSetFetch 替换实现。
// 注意 setupFiles 先于测试文件执行，所以桩一定先于 client 构造生效。
const realFetch = globalThis.fetch
let currentImpl: typeof fetch | null = null

const fetchStub = ((
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<Response> => {
	return currentImpl
		? currentImpl(input, init)
		: realFetch(input as RequestInfo, init)
}) as typeof fetch

vi.stubGlobal("fetch", fetchStub)

;(globalThis as unknown as {
	__fxSetFetch: (impl: typeof fetch | null) => void
}).__fxSetFetch = (impl) => {
	currentImpl = impl
}

// 浏览器 API 兜底（MUI/Emotion 需要；仅在 jsdom 环境定义）
if (typeof window != "undefined") {
	if (typeof window.matchMedia != "function") {
		window.matchMedia = ((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false,
		})) as unknown as typeof window.matchMedia
	}
	if (typeof (window as { ResizeObserver?: unknown }).ResizeObserver == "undefined") {
		class ResizeObserverMock {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
		;(window as unknown as { ResizeObserver: unknown }).ResizeObserver =
			ResizeObserverMock
	}
}
