import { clearBackendInfoCache, clearCurrenciesCache } from "./metadata"
import { clearPairRatesCache } from "./pair-rates"

// 测试用：清空数据层模块级缓存。
// Turbopack 下同一模块会被路由 bundle 与 RSC 页面 bundle 各求值一次、各持一份缓存，
// 从 HTTP 路由调用只能清掉路由 bundle 那份。因此各 bundle 自己的入口在启动时把
// 自己的清空函数登记到 globalThis，路由再经登记的函数清掉其他 bundle 那份。
// 登记项按函数身份去重：同一个模块实例重复登记只留一份，不同 bundle 的实例各占一份。
// 本模块只 import metadata 与 pair-rates 两个清空函数，不 import matrix-rates：
// 矩阵缓存由 matrix-rates.ts 自己登记（见该文件末尾）。这样依赖方向是
// matrix-rates → test-cache-reset → {metadata, pair-rates}，而 pair-rates 只依赖
// client / request / source-links，不回到 matrix-rates，因此不构成模块循环。
type DataCacheHook = () => void

const CLEAR_HOOK = "__fxClearDataCaches"

function hookSet(): Set<DataCacheHook> {
	const store = globalThis as Record<string, unknown>
	const existing = store[CLEAR_HOOK]
	if (existing instanceof Set) return existing as Set<DataCacheHook>
	const created = new Set<DataCacheHook>()
	store[CLEAR_HOOK] = created
	return created
}

export function registerDataCacheClearHook(clear: DataCacheHook): void {
	hookSet().add(clear)
}

export function clearDataCaches(): void {
	clearBundleCaches()
	for (const clear of Array.from(hookSet())) clear()
}

export function clearBundleCaches(): void {
	clearBackendInfoCache()
	clearCurrenciesCache()
	clearPairRatesCache()
}
