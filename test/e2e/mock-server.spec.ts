import { expect, test } from "@playwright/test"

// mock JSON-RPC 后端本身的安全硬化验证：只绑定 loopback（127.0.0.1 可达）、
// 1MiB 请求体上限（超限 413，且不计入批次计数）
const MOCK_PORT = Number(process.env.MOCK_PORT || 8188)
const MOCK = `http://127.0.0.1:${MOCK_PORT}`

test.describe("mock-server hardening", () => {
	test("loopback 可达：ping 与正常 JSON-RPC 批量返回 200", async () => {
		const ping = await fetch(`${MOCK}/__ping`)
		expect(ping.status).toBe(200)

		const res = await fetch(`${MOCK}/v1/jsonrpc`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify([
				{ jsonrpc: "2.0", id: "1", method: "instanceInfo", params: "" },
			]),
		})
		expect(res.status).toBe(200)
		const body = (await res.json()) as { result: { status: string } }[]
		expect(body[0].result.status).toBe("ok")
	})

	test("超过 1MiB 的请求体返回 413 且不计入计数", async () => {
		await fetch(`${MOCK}/__reset`)

		// content-length 声明即超限
		const big = JSON.stringify({ pad: "x".repeat(2 * 1024 * 1024) })
		const res = await fetch(`${MOCK}/v1/jsonrpc`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: big,
		})
		expect(res.status).toBe(413)

		// 未声明 content-length 的分块流式超限同样 413
		const streamed = new ReadableStream({
			start(controller) {
				controller.enqueue(
					new TextEncoder().encode(
						"x".repeat(1024 * 1024 + 1024)
					)
				)
				controller.close()
			},
		})
		const res2 = await fetch(`${MOCK}/v1/jsonrpc`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			// 注意：TextEncoder 内容非合法 JSON，但 413 应在解析前返回
			body: streamed,
			// Node 原生 fetch 流式 body 需要 duplex；TS DOM 类型未声明该字段
			duplex: "half",
		} as RequestInit)
		expect(res2.status).toBe(413)

		const counters = (await (
			await fetch(`${MOCK}/__counters`)
		).json()) as { batches: number }
		expect(counters.batches).toBe(0)
	})
})
