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

// 等前端在途数据请求落地：矩阵请求在调用方离开后会继续跑完写缓存，
// 不等它落地就清缓存，上一用例的数据会漏进下一用例
async function settleWebRequests(): Promise<void> {
	const response = await fetch(`${WEB_ORIGIN}/api/test-only/settle-requests`, {
		method: "POST",
	})
	if (!response.ok) {
		throw new Error(`等待在途请求结束失败：HTTP ${response.status}`)
	}
}

export async function resetMockServer(): Promise<void> {
	const response = await fetch(`${MOCK_ORIGIN}/__reset`)
	if (!response.ok) {
		throw new Error(`重置 mock server 失败：HTTP ${response.status}`)
	}
}

// 每个用例开始前的统一重置：mock 计数与场景回到默认（/__reset 会恢复
// defaultScenario），前端数据层模块级缓存清空。各 spec 的 beforeEach 只调这一个，
// 避免某个 spec 改了 mock 场景或写了缓存后污染后续 spec。
export async function resetE2EState(): Promise<void> {
	// 先等在途请求落地再重置计数与缓存：否则上一用例的在途轮次会记进下一用例的计数
	await settleWebRequests()
	await resetMockServer()
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
