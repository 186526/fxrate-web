import { infoResponse } from "@/lib/fxrate/src/client"
import { LRUCache } from "lru-cache"
import { getFXRateClient } from "./client"
import { runBatch } from "./request"

const currenciesCache = new LRUCache<string, { [source: string]: string[] }>({
	max: 1,
	ttl: 1000 * 60 * 5,
})

// info() 的短 TTL 缓存。SSR 首屏预取路径会取两次 instanceInfo：一次在
// showCurrencyAllRates 内部（要 sources 决定批量查哪些源），一次在
// ssr-prefetch 里（要 version 填页脚）。两次都走独立 RPC，冷启动实测
// 第二次多花约 400ms。sources/version 只在后端部署时变化（部署即重启进程、
// 模块级缓存自然清空），60s 内复用是安全的。失败不写缓存，下次重试。
const infoCache = new LRUCache<string, infoResponse>({
	max: 1,
	ttl: 1000 * 60,
})

// 首次访问时可能有多个 SSR/RSC 请求同时要 instanceInfo。仅缓存已完成结果
// 仍会让这些请求各自发一遍 RPC；保留一个短生命周期的 in-flight promise，
// 让冷启动并发请求共享同一次网络往返。失败不会留在这里，下次调用可重试。
let infoInFlight: Promise<infoResponse> | null = null

// 测试用：清空 info 缓存（模块级缓存跨用例存活，避免用例间互相命中）
export function clearBackendInfoCache(): void {
	infoCache.clear()
	infoInFlight = null
}

// 客户端首屏先取货币列表再展示后端版本时，允许调用方复用刚完成的
// instanceInfo，避免为了 footer 再发一次相同 RPC。只返回已完成缓存，不会
// 启动网络请求；需要强一致/缓存未命中时仍调用 getBackendInfo 或 client.info。
export function getCachedBackendInfo(): infoResponse | undefined {
	return infoCache.get("info")
}

export async function getBackendInfo(): Promise<infoResponse> {
	const cached = infoCache.get("info")
	if (cached) return cached
	if (infoInFlight) return infoInFlight

	const holder: { promise?: Promise<infoResponse> } = {}
	const request = (async () => {
		try {
			const info = (await getFXRateClient().info()) as infoResponse
			infoCache.set("info", info)
			return info
		} finally {
			if (infoInFlight == holder.promise) infoInFlight = null
		}
	})()
	holder.promise = request
	infoInFlight = request
	return request
}

// 与 info 相同，货币列表也是首屏的共享元数据。并发请求不能只依赖完成后的
// LRU：冷启动时每个请求都会排一轮 listCurrencies，放大后端上游压力。
let currenciesInFlight: Promise<{ [source: string]: string[] }> | null = null

export async function showCurrencyAllRates(): Promise<{
	[source: string]: string[]
}> {
	const cached = currenciesCache.get("all")
	if (cached) return cached
	if (currenciesInFlight) return currenciesInFlight

	const holder: { promise?: Promise<{ [source: string]: string[] }> } = {}
	const request = (async () => {
		try {
			const client = getFXRateClient()
			const sources = (await getBackendInfo()).sources
			const answer: { [source: string]: string[] } = {}

			// 部分来源失败（如上游被反爬拦截）时 done() 会抛错：
			// 返回已成功的部分结果做降级，不要拖垮整个货币列表
			try {
				await runBatch(client, () => {
					for (const x of sources) {
						client.listCurrencies(x, (resp) => {
							answer[x] = resp.currency
						})
					}
				})
			} catch (e) {
				console.error("部分来源货币列表获取失败，使用部分结果:", e)
			}

			// 只有全部 source 都返回成功才缓存，避免把部分结果缓存 5 分钟
			if (sources.every((s) => Array.isArray(answer[s]))) {
				currenciesCache.set("all", answer)
			}

			return answer
		} finally {
			if (currenciesInFlight == holder.promise) currenciesInFlight = null
		}
	})()
	holder.promise = request
	currenciesInFlight = request
	return request
}
