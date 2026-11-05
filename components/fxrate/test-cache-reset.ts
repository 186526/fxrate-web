import { clearMatrixCache } from "./matrix-rates"
import { clearBackendInfoCache, clearCurrenciesCache } from "./metadata"
import { clearPairRatesCache } from "./pair-rates"

// 测试用：清空数据层模块级缓存。
// Turbopack 下同一模块会被路由 bundle 与 RSC 页面 bundle 各求值一次、各持一份缓存，
// 从 HTTP 路由调用只能清掉路由 bundle 那份。因此各 bundle 自己的入口在启动时把
// 自己的清空函数登记到 globalThis，路由再经登记的钩子清掉其他 bundle 那份。
const CLEAR_HOOK = "__fxClearDataCaches"

export function registerDataCacheClearHook(clear: () => void): void {
	;(globalThis as Record<string, unknown>)[CLEAR_HOOK] = clear
}

export function clearBundleCaches(): void {
	clearBackendInfoCache()
	clearCurrenciesCache()
	clearPairRatesCache()
	clearMatrixCache()
}

export function clearDataCaches(): void {
	clearBundleCaches()
	const hook = (globalThis as Record<string, unknown>)[CLEAR_HOOK]
	if (typeof hook == "function") hook()
}
