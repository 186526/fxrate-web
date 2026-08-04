// @vitest-environment jsdom
// proxy（Phase 4B 任务 13，nonce-based CSP）：验证每请求唯一 nonce 注入请求头
// x-nonce（layout 读取 + Next 自动 nonce 化自身脚本）、production 响应头 CSP（nonce
// 与 x-nonce 一致、script-src 无 unsafe-inline）、dev 不注入 CSP 但恒有 x-nonce、
// 以及既有 x-fx-release 行为保持不变。mock next/server，不依赖真实 Next 运行时。

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const nextMock = vi.hoisted(() => ({
	next: vi.fn(),
	requestHeaders: null as Headers | null,
}))

vi.mock("next/server", () => ({
	NextResponse: { next: nextMock.next },
}))

import {
	buildCspHeader,
	generateCspNonce,
	proxy,
} from "../../proxy"

const ANALYTICS_HOST = "https://analytics.real186526.cn"

const makeRequest = () => ({
	headers: new Headers({ "user-agent": "vitest" }),
})

// 在 NextResponse.next() 调用时复制请求头，模拟 Next 运行时立即消费 init；这样 proxy
// 若在调用后才改原 Headers，测试不会因共享对象引用而产生假阳性。
const makeResponseMock = () => {
	const headers = new Headers()
	nextMock.next.mockImplementation(
		(init: { request: { headers: Headers } }) => {
			nextMock.requestHeaders = new Headers(init.request.headers)
			return { headers }
		}
	)
	return headers
}

const passedRequestHeaders = () => {
	if (!nextMock.requestHeaders) {
		throw new Error("NextResponse.next 未收到请求头")
	}
	return nextMock.requestHeaders
}

const requiredHeader = (headers: Headers, name: string) => {
	const value = headers.get(name)
	if (!value) throw new Error(`缺少响应头 ${name}`)
	return value
}

const originalNodeEnv = process.env.NODE_ENV

// @types/node 把 process.env.NODE_ENV 声明为只读，测试内需临时切换（用后立即恢复）。
const envWrite = process.env as { NODE_ENV?: string }

beforeEach(() => {
	vi.clearAllMocks()
	nextMock.next.mockReset()
	nextMock.requestHeaders = null
	delete process.env.FXBUILD_TIME
	envWrite.NODE_ENV = "production"
})

afterEach(() => {
	envWrite.NODE_ENV = originalNodeEnv
})

describe("proxy nonce 与 CSP", () => {
	it("production 下注入 x-nonce 与含同值 nonce 的 CSP，且保留 x-fx-release", () => {
		const responseHeaders = makeResponseMock()
		proxy(makeRequest() as never)

		expect(responseHeaders.get("x-fx-release")).toBe("dev")
		const nonce = requiredHeader(responseHeaders, "x-nonce")
		const csp = requiredHeader(responseHeaders, "Content-Security-Policy")
		expect(csp).toBe(buildCspHeader(nonce))
		expect(csp).toContain(`'nonce-${nonce}'`)
		expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' ${ANALYTICS_HOST}`)
		// 主题脚本等内联脚本靠 nonce 放行，script-src 不得退回 unsafe-inline
		expect(csp).not.toContain("script-src 'self' 'unsafe-inline'")
	})

	it("请求头克隆也带上 x-nonce（layout 的 headers() 读到同一值）", () => {
		const responseHeaders = makeResponseMock()
		proxy(makeRequest() as never)

		// proxy 通过 NextResponse.next({request:{headers}}) 把加了 x-nonce 的请求头
		// 传给下游渲染；layout 的 headers() 读到的是这份克隆，而非原始 request.headers。
		const passedHeaders = passedRequestHeaders()
		expect(passedHeaders.get("x-nonce")).toBe(responseHeaders.get("x-nonce"))
	})

	it("production 下请求头克隆也带含同值 nonce 的 CSP（Next 16 从请求 CSP 头取 nonce 加自身脚本）", () => {
		const responseHeaders = makeResponseMock()
		proxy(makeRequest() as never)

		const passedHeaders = passedRequestHeaders()
		const nonce = requiredHeader(responseHeaders, "x-nonce")
		const requestCsp = requiredHeader(
			passedHeaders,
			"Content-Security-Policy"
		)
		expect(requestCsp).toContain(`'nonce-${nonce}'`)
		expect(requestCsp).toBe(buildCspHeader(nonce))
		expect(responseHeaders.get("Content-Security-Policy")).toBe(requestCsp)
	})

	it("dev 下不注入 CSP 但 x-nonce 恒有（主题脚本随时合规）", () => {
		envWrite.NODE_ENV = "development"
		const responseHeaders = makeResponseMock()
		proxy(makeRequest() as never)

		expect(responseHeaders.get("x-nonce")).toBeTruthy()
		expect(responseHeaders.get("Content-Security-Policy")).toBeNull()
		const passedHeaders = passedRequestHeaders()
		expect(passedHeaders.get("Content-Security-Policy")).toBeNull()
	})

	it("每次调用生成不同的 nonce", () => {
		makeResponseMock()
		proxy(makeRequest() as never)
		const first = passedRequestHeaders().get("x-nonce")
		makeResponseMock()
		proxy(makeRequest() as never)
		const second = passedRequestHeaders().get("x-nonce")
		expect(first).not.toBe(second)
	})
})

describe("generateCspNonce / buildCspHeader", () => {
	it("nonce 是 base64-value（CSP nonce-source 语法）且随机", () => {
		const a = generateCspNonce()
		const b = generateCspNonce()
		expect(a).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
		expect(a.length).toBeGreaterThanOrEqual(16)
		expect(a).not.toBe(b)
	})

	it("CSP 包含 nonce、脚本 host、style unsafe-inline 与安全指令", () => {
		const csp = buildCspHeader("test-nonce")
		expect(csp).toContain("default-src 'self'")
		expect(csp).toContain("script-src 'self' 'nonce-test-nonce'")
		expect(csp).toContain(ANALYTICS_HOST)
		expect(csp).toContain("style-src 'self' 'unsafe-inline'")
		expect(csp).toContain("object-src 'none'")
		expect(csp).toContain("base-uri 'self'")
		expect(csp).toContain("form-action 'self'")
	})
})
