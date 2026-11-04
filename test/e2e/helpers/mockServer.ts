const MOCK_PORT = Number(process.env.MOCK_PORT || 8188)
const MOCK_ORIGIN = `http://127.0.0.1:${MOCK_PORT}`
const WEB_PORT = Number(process.env.WEB_PORT || 3111)
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`

export interface MockServerCounters {
	batches: number
	methods: Record<string, number>
	methodsBySource: Record<string, Record<string, number>>
}

export interface MockServerScenario {
	sources: string[]
	matrixForbiddenSources?: string[]
	emptyRateSources?: string[]
}

export async function getMockServerCounters(): Promise<MockServerCounters> {
	const response = await fetch(`${MOCK_ORIGIN}/__counters`)
	if (!response.ok) {
		throw new Error(`读取 mock counters 失败：HTTP ${response.status}`)
	}
	return (await response.json()) as MockServerCounters
}

// 前端 next dev 进程的模块级缓存跨用例存活（mock server 够不着它的内存），
// 重置 mock 计数后必须同时清空，否则下一个用例的 SSR 直接命中缓存、服务端计数为 0。
async function resetWebCaches(): Promise<void> {
	const response = await fetch(`${WEB_ORIGIN}/api/test-only/reset-caches`, {
		method: "POST",
	})
	if (!response.ok) {
		throw new Error(`清空前端缓存失败：HTTP ${response.status}`)
	}
}

export async function resetMockServer(): Promise<void> {
	const response = await fetch(`${MOCK_ORIGIN}/__reset`)
	if (!response.ok) {
		throw new Error(`重置 mock server 失败：HTTP ${response.status}`)
	}
	await resetWebCaches()
}

export async function setMockServerScenario({
	sources,
	matrixForbiddenSources = [],
	emptyRateSources = [],
}: MockServerScenario): Promise<void> {
	const params = new URLSearchParams({
		sources: sources.join(","),
		matrixForbiddenSources: matrixForbiddenSources.join(","),
		emptyRateSources: emptyRateSources.join(","),
	})
	const response = await fetch(`${MOCK_ORIGIN}/__scenario?${params.toString()}`)
	if (!response.ok) {
		throw new Error(`配置 mock server 失败：HTTP ${response.status}`)
	}
}
