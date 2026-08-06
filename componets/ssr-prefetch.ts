// 默认视图 SSR 预取：首屏直接带默认货币对数据，客户端不再白屏等 JSON-RPC 往返。
// 仅对「默认参数」的 / 路径生效（历史卡顿根因 = 每次 URL 变化都整轮服务端重拉，
// 因此非默认参数一律保持纯客户端加载，URL 参数变化绝不再触发服务端数据请求）；
// 服务端模块级 SWR 缓存（TTL 45s）去重并发/重复请求（多副本各自一份，可接受）。
// 任何失败/超时/空结果都降级为薄壳（客户端照常自己拉数），绝不阻塞首屏。
import type { FXListProps } from "@/componets/fxlistgrid"
import {
	getCurrenciesDetails,
	getFXRateClient,
	showCurrencyAllRates,
	withTimeout,
} from "./tools"

const SSR_TIMEOUT_MS = 8_000
const SWR_TTL_MS = 45_000

export interface SSRPrefetchData {
	initialCurrencies: { [source: string]: string[] } | null
	initialResult: (Omit<FXListProps, "updated"> & { updated: string })[] | null
	initialBackendVersion: string
}

const empty: SSRPrefetchData = {
	initialCurrencies: null,
	initialResult: null,
	initialBackendVersion: "",
}

// 服务端 SWR 缓存：模块级 Map（每个 server 进程一份），key 为请求参数签名
const swrCache = new Map<string, { data: SSRPrefetchData; at: number }>()

// 测试用：清空 SWR 缓存（避免测试间互相命中）
export function clearSSRPrefetchCache(): void {
	swrCache.clear()
}

function first(v: string | string[] | undefined): string | undefined {
	return Array.isArray(v) ? v[0] : v
}

// 仅默认参数（CNY→USD、amount=100、precision=4）才走 SSR 预取；
// 其余参数组合（含 bf 交叉汇率开关之外的 URL 变化）保持纯客户端
function isDefaultView(
	params: Record<string, string | string[] | undefined>
): boolean {
	const from = first(params.from)
	const to = first(params.to)
	const amount = first(params.amount)
	const precision = first(params.precision)
	return (
		(from == null || from == "CNY") &&
		(to == null || to == "USD") &&
		(amount == null || amount == "100") &&
		(precision == null || precision == "4")
	)
}

export async function prefetchDefaultView(
	params: Record<string, string | string[] | undefined>
): Promise<SSRPrefetchData> {
	if (!isDefaultView(params)) return empty

	const key = "CNY-USD-100-p4"
	const hit = swrCache.get(key)
	if (hit && Date.now() - hit.at < SWR_TTL_MS) return hit.data

	try {
		// 注意：info() 必须在 showCurrencyAllRates 之后串行调用——后者内部开启 batch，
		// 并行的 info() 会被吞进批量队列拿不到结果
		const cur = await withTimeout(showCurrencyAllRates(), SSR_TIMEOUT_MS)
		if (!cur) return empty

		const info = await withTimeout(
			Promise.resolve(getFXRateClient().info()),
			SSR_TIMEOUT_MS
		)
		const initialBackendVersion =
			info != null && typeof info == "object" && "version" in info
				? String(info.version)
				: ""

		const result = await withTimeout(
			getCurrenciesDetails(cur, "USD", "CNY"),
			SSR_TIMEOUT_MS
		)
		if (!result || result.length == 0) return empty

		const data: SSRPrefetchData = {
			initialCurrencies: cur,
			initialResult: result.map((r) => ({
				...r,
				// 防御后端个别源返回无效日期导致 toISOString 抛错
				updated: Number.isNaN(r.updated.getTime())
					? new Date().toISOString()
					: r.updated.toISOString(),
			})),
			initialBackendVersion,
		}
		swrCache.set(key, { data, at: Date.now() })
		return data
	} catch (e) {
		// 预取失败降级为客户端加载，不影响首屏
		console.error("SSR 预取失败，降级为客户端加载:", e)
		return empty
	}
}
