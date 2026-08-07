// 本地 mock JSON-RPC 后端：e2e 期间 SSR（FXRATE_API）与浏览器代理（FXRATE_PROXY）
// 都指向本服务，测试完全不依赖真实上游。响应完全确定性。
const http = require("node:http")

const PORT = Number(process.env.PORT || 8188)

// 请求体上限：1 MiB（JSON-RPC 批量体很小；超出直接 413 拒绝，避免内存被撑爆）
const MAX_BODY_BYTES = 1024 * 1024

const CURRENCIES = ["CNY", "USD", "EUR", "JPY", "HKD", "GBP"]
const SOURCES = ["bankA", "bankB", "bankC", "visa"]
const BASE_RATE = { CNY: 1, USD: 7.1, EUR: 8.4, JPY: 0.053, HKD: 0.91, GBP: 9.8 }
const SOURCE_SPREAD = { bankA: 0.0, bankB: 0.005, bankC: -0.004, visa: 0.01 }

function defaultScenario() {
	return {
		sources: [...SOURCES],
		matrixForbiddenSources: new Set(),
		emptyRateSources: new Set(),
	}
}

let scenario = defaultScenario()

function rateFor(source, from, to) {
	const base = (BASE_RATE[to] ?? 1) / (BASE_RATE[from] ?? 1)
	const middle = base * (1 + (SOURCE_SPREAD[source] ?? 0))
	return {
		middle: round(middle),
		cash: round(middle * 0.995),
		remit: round(middle * 0.998),
	}
}

function round(n) {
	return Math.round(n * 1e4) / 1e4
}

function handle(method, params) {
	switch (method) {
		case "instanceInfo":
			return {
				environment: "test",
				sources: scenario.sources,
				version: "fxrate@mock <test>",
				status: "ok",
				apiVersion: "1",
			}
		case "listCurrencies":
			return { currency: CURRENCIES, date: new Date().toISOString() }
		case "listFXRates": {
			if (scenario.matrixForbiddenSources.has(params.source)) {
				return { status: 403, message: "Forbidden" }
			}
			const row = {}
			for (const c of CURRENCIES) {
				if (c == params.from) continue
				row[c] = { ...rateFor(params.source, params.from, c), updated: new Date().toISOString() }
			}
			return row
		}
		case "getFXRate":
			if (scenario.emptyRateSources.has(params.source)) return {}
			return { ...rateFor(params.source, params.from, params.to), updated: new Date().toISOString() }
		default:
			throw new Error("unhandled method " + method)
	}
}

const counters = { batches: 0, methods: {}, methodsBySource: {} }

function listParam(params, name, fallback = []) {
	if (!params.has(name)) return [...fallback]
	return params
		.get(name)
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean)
}

function scenarioSnapshot() {
	return {
		sources: scenario.sources,
		matrixForbiddenSources: [...scenario.matrixForbiddenSources],
		emptyRateSources: [...scenario.emptyRateSources],
	}
}

const server = http.createServer((req, res) => {
	const requestUrl = new URL(req.url || "/", "http://127.0.0.1")
	if (requestUrl.pathname === "/__ping") {
		res.writeHead(200, { "content-type": "text/plain" })
		res.end("ok")
		return
	}
	if (requestUrl.pathname === "/__counters") {
		res.writeHead(200, { "content-type": "application/json" })
		res.end(JSON.stringify(counters))
		return
	}
	if (requestUrl.pathname === "/__reset") {
		counters.batches = 0
		counters.methods = {}
		counters.methodsBySource = {}
		scenario = defaultScenario()
		res.writeHead(200, { "content-type": "application/json" })
		res.end(JSON.stringify({ ok: true }))
		return
	}
	if (requestUrl.pathname === "/__scenario") {
		scenario = {
			sources: listParam(requestUrl.searchParams, "sources", SOURCES),
			matrixForbiddenSources: new Set(
				listParam(requestUrl.searchParams, "matrixForbiddenSources")
			),
			emptyRateSources: new Set(
				listParam(requestUrl.searchParams, "emptyRateSources")
			),
		}
		res.writeHead(200, { "content-type": "application/json" })
		res.end(JSON.stringify(scenarioSnapshot()))
		return
	}
	if (requestUrl.pathname !== "/v1/jsonrpc" || req.method !== "POST") {
		res.writeHead(404, { "content-type": "application/json" })
		res.end(JSON.stringify({ error: "not found" }))
		return
	}
	// 声明长度即超限：直接 413，不读 body
	const declared = Number(req.headers["content-length"] || 0)
	if (declared > MAX_BODY_BYTES) {
		res.writeHead(413, { "content-type": "application/json" })
		res.end(JSON.stringify({ error: "payload too large" }))
		return
	}
	let raw = ""
	let tooLarge = false
	req.on("data", (chunk) => {
		if (tooLarge) return
		raw += chunk
		if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
			tooLarge = true
			raw = ""
			res.writeHead(413, { "content-type": "application/json" })
			res.end(JSON.stringify({ error: "payload too large" }))
			// 丢弃剩余 body（不 destroy：destroy 可能与 413 响应 flush 竞争，客户端会收到连接重置）
			req.removeAllListeners("data")
			req.resume()
		}
	})
	req.on("end", () => {
		if (tooLarge) return
		counters.batches++
		let body
		try {
			body = JSON.parse(raw)
		} catch {
			res.writeHead(500, { "content-type": "application/json" })
			res.end(JSON.stringify({ error: "bad json" }))
			return
		}
		const list = Array.isArray(body) ? body : [body]
		const responses = list.map((r) => {
			counters.methods[r.method] = (counters.methods[r.method] || 0) + 1
			const source = r.params && typeof r.params.source === "string"
				? r.params.source
				: null
			if (source) {
				const bySource = counters.methodsBySource[r.method] || {}
				bySource[source] = (bySource[source] || 0) + 1
				counters.methodsBySource[r.method] = bySource
			}
			try {
				return { jsonrpc: "2.0", id: r.id, result: handle(r.method, r.params) }
			} catch (e) {
				return { jsonrpc: "2.0", id: r.id, error: { code: -32000, message: e.message } }
			}
		})
		res.writeHead(200, { "content-type": "application/json" })
		res.end(JSON.stringify(responses))
	})
})

// 只绑定 loopback：e2e mock 不应暴露到局域网/公网接口
server.listen(PORT, "127.0.0.1", () => {
	console.log(`[mock-jsonrpc] listening on http://127.0.0.1:${PORT}`)
})
