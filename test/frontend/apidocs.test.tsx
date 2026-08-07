// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ThemeProvider } from "@/componets/theme"

import APIDocs from "@/componets/apidocs"
import { MethodBadge, RequestResult } from "@/componets/api-docs/ui"

const setFetch = (globalThis as unknown as {
	__fxSetFetch: (implementation: typeof fetch | null) => void
}).__fxSetFetch

function jsonResponse(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "Content-Type": "application/json" },
	})
}

function installDocsFetch() {
	setFetch(async (input, init) => {
		const url = String(input)
		if (url == "/api/backend-meta") {
			return jsonResponse({
				rpcUrl: "https://fxrate.example/v1/jsonrpc",
				restBase: "https://fxrate.example",
			})
		}
		if (url == "/api/fxrate") {
			const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string }
			if (body.method == "instanceInfo") {
				return jsonResponse([
					{
						jsonrpc: "2.0",
						id: 1,
						result: {
							environment: "test",
							sources: ["boc", "icbc"],
							version: "fxrate@test",
							status: "ok",
							apiVersion: "v1",
						},
					},
				])
			}
			return jsonResponse({ jsonrpc: "2.0", id: 1, result: {} })
		}
		if (url.startsWith("/api/rest")) return jsonResponse({ middle: 7.1 })
		throw new Error(`Unexpected fetch: ${url}`)
	})
}

function renderDocs() {
	return render(
		<ThemeProvider>
			<APIDocs />
		</ThemeProvider>
	)
}

describe("APIDocs", () => {
	beforeEach(() => {
		window.localStorage.clear()
		document.documentElement.removeAttribute("data-theme")
		window.history.replaceState(null, "", "/api-docs")
		installDocsFetch()
	})

	afterEach(() => {
		setFetch(null)
	})

	it("selects a stable endpoint from the URL hash and exposes return navigation", async () => {
		window.history.replaceState(null, "", "/api-docs#rpc-get-rate")
		renderDocs()

		expect(screen.getByRole("heading", { name: "单对汇率" })).toBeInTheDocument()
		expect(screen.getByRole("link", { name: "返回汇率查询" })).toHaveAttribute("href", "/")
		const current = screen.getByRole("link", { name: /getFXRate/ })
		expect(current).toHaveAttribute("aria-current", "location")
		await waitFor(() => expect(screen.getByText("fxrate@test")).toBeInTheDocument())
	})

	it("updates endpoint selection on hashchange", () => {
		renderDocs()
		expect(screen.getByRole("heading", { name: "数据源信息" })).toBeInTheDocument()

		act(() => {
			window.history.replaceState(null, "", "/api-docs#rest-pair")
			window.dispatchEvent(new HashChangeEvent("hashchange"))
		})

		expect(screen.getByRole("heading", { name: "单对汇率详情" })).toBeInTheDocument()
		expect(screen.getByRole("link", { name: /\/:source\/:from\/:to$/ })).toHaveAttribute(
			"aria-current",
			"location"
		)
	})

	it("searches and filters the endpoint navigation locally", () => {
		renderDocs()
		const search = screen.getByRole("textbox", { name: "搜索端点" })
		fireEvent.change(search, { target: { value: "listCurrencies" } })

		expect(screen.getByRole("link", { name: /listCurrencies/ })).toBeInTheDocument()
		expect(screen.queryByRole("link", { name: /getFXRate/ })).not.toBeInTheDocument()
		expect(screen.getByRole("button", { name: "REST API" })).toHaveAttribute("aria-expanded", "true")

		fireEvent.click(screen.getByRole("button", { name: "REST" }))
		expect(screen.queryByRole("link", { name: /listCurrencies/ })).not.toBeInTheDocument()
		expect(screen.getByText("没有匹配端点")).toBeInTheDocument()
	})

	it("mobile navigation stays collapsed until the browse control opens it", () => {
		const originalMatchMedia = window.matchMedia
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: query.includes("max-width:899.95px"),
			media: query,
			onchange: null,
			addListener: () => undefined,
			removeListener: () => undefined,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			dispatchEvent: () => false,
		}))
		try {
			renderDocs()
			expect(screen.queryByRole("link", { name: /getFXRate/ })).not.toBeInTheDocument()
			fireEvent.click(screen.getByRole("button", { name: "浏览端点" }))
			expect(screen.getByRole("link", { name: /getFXRate/ })).toBeInTheDocument()
		} finally {
			window.matchMedia = originalMatchMedia
		}
	})

	it("preserves endpoint parameter values while edit mode resets across selection changes", () => {
		window.history.replaceState(null, "", "/api-docs#rpc-get-rate")
		renderDocs()
		fireEvent.click(screen.getByRole("button", { name: "试试看" }))
		const amount = screen.getByRole("spinbutton", { name: "参数 amount" })
		fireEvent.change(amount, { target: { value: "250" } })
		expect(amount).toHaveValue(250)

		act(() => {
			window.history.replaceState(null, "", "/api-docs#rest-source")
			window.dispatchEvent(new HashChangeEvent("hashchange"))
		})
		expect(screen.getByRole("heading", { name: "数据源信息" })).toBeInTheDocument()

		act(() => {
			window.history.replaceState(null, "", "/api-docs#rpc-get-rate")
			window.dispatchEvent(new HashChangeEvent("hashchange"))
		})
		expect(screen.getByRole("heading", { name: "单对汇率" })).toBeInTheDocument()
		expect(screen.queryByRole("spinbutton", { name: "参数 amount" })).not.toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "试试看" }))
		expect(screen.getByRole("spinbutton", { name: "参数 amount" })).toHaveValue(250)
	})

	it("dark mode method badge uses the readable primary token", async () => {
		document.documentElement.setAttribute("data-theme", "dark")
		render(
			<ThemeProvider>
				<MethodBadge method="GET" />
			</ThemeProvider>
		)

		await waitFor(() =>
			expect(window.getComputedStyle(screen.getByText("GET")).color).toBe(
				"rgb(143, 195, 198)"
			)
		)
	})

	it("timeout response is presented as an alert with a clear timeout heading", () => {
		render(
			<ThemeProvider>
				<RequestResult
					state={{ status: "error", message: "请求超时（10 秒），请稍后重试" }}
				/>
			</ThemeProvider>
		)

		const alert = screen.getByRole("alert")
		expect(alert).toHaveTextContent("请求超时")
		expect(alert).toHaveTextContent("请稍后重试")
	})
})
