// JSON-RPC 批处理 fetch mock：按 method 分派确定性响应，支持部分请求失败
export interface JsonRpcRequest {
	id: string
	method: string
	params: Record<string, unknown>
}

export interface BatchStats {
	batches: number
	requests: number
	methods: Record<string, number>
	bodies: JsonRpcRequest[][]
}

type Builder = (params: Record<string, unknown>) => unknown

const newStats = (): BatchStats => ({
	batches: 0,
	requests: 0,
	methods: {},
	bodies: [],
})

// builder 抛错 → 该请求返回 JSON-RPC error 响应（同一批次其他请求仍成功）
export function createBatchMock(builders: Record<string, Builder>) {
	const stats = newStats()
	const impl = async (_input: RequestInfo | URL, init?: RequestInit) => {
		stats.batches++
		const body = JSON.parse(String(init?.body ?? "[]"))
		const list: JsonRpcRequest[] = Array.isArray(body) ? body : [body]
		stats.requests += list.length
		stats.bodies.push(list)
		for (const r of list) {
			stats.methods[r.method] = (stats.methods[r.method] ?? 0) + 1
		}
		const responses = list.map((r) => {
			try {
				return { jsonrpc: "2.0", id: r.id, result: builders[r.method]?.(r.params) }
			} catch (e) {
				return {
					jsonrpc: "2.0",
					id: r.id,
					error: {
						code: -32000,
						message: e instanceof Error ? e.message : String(e),
						data: null,
					},
				}
			}
		})
		return new Response(JSON.stringify(responses), {
			status: 200,
			headers: { "content-type": "application/json" },
		})
	}
	setFetch(impl)
	return stats
}

// 模拟整批网络失败（fetch 抛错）
export function createNetworkErrorMock() {
	setFetch(async () => {
		throw new TypeError("fetch failed")
	})
}

const setFetch = (impl: typeof fetch) =>
	(globalThis as unknown as {
		__fxSetFetch: (impl: typeof fetch) => void
	}).__fxSetFetch(impl)
