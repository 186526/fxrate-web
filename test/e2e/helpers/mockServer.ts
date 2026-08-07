const MOCK_PORT = Number(process.env.MOCK_PORT || 8188)
const MOCK_ORIGIN = `http://127.0.0.1:${MOCK_PORT}`

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

export async function resetMockServer(): Promise<void> {
	const response = await fetch(`${MOCK_ORIGIN}/__reset`)
	if (!response.ok) {
		throw new Error(`重置 mock server 失败：HTTP ${response.status}`)
	}
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
