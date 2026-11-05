import { clearMatrixCache } from "./matrix-rates"
import { clearBackendInfoCache, clearCurrenciesCache } from "./metadata"
import { clearPairRatesCache } from "./pair-rates"

// 测试用：清空数据层模块级缓存。
// 除各模块自己的缓存外，还要等待仍在跑的在途请求结束：矩阵请求在调用方离开后
// 会继续跑完写缓存（见 matrix-rates.ts 的 isCurrentKey 分流），若在它落地之后
// 才清缓存，上一用例的数据会漏进下一用例。登记在途请求的模块在启动时把
// 「等待在途请求结束」的函数登记到 globalThis，清空时先等它们再清。
// Turbopack 下同一模块会被路由 bundle 与 RSC 页面 bundle 各求值一次、各持一份缓存，
// 从 HTTP 路由调用只能清掉路由 bundle 那份。因此各 bundle 自己的入口在启动时把
// 自己的清空函数登记到 globalThis，路由再经登记的钩子清掉其他 bundle 那份。
const CLEAR_HOOK = "__fxClearDataCaches"
const SETTLE_HOOK = "__fxSettleDataRequests"

export function registerDataCacheClearHook(clear: () => void | Promise<void>): void {
	;(globalThis as Record<string, unknown>)[CLEAR_HOOK] = clear
}

export function unregisterDataCacheClearHook(): void {
	delete (globalThis as Record<string, unknown>)[CLEAR_HOOK]
}

export function registerDataRequestSettleHook(settle: () => Promise<void>): void {
	;(globalThis as Record<string, unknown>)[SETTLE_HOOK] = settle
}

export async function clearDataCaches(): Promise<void> {
	await settleDataRequests()
	clearBundleCaches()
	const hook = (globalThis as Record<string, unknown>)[CLEAR_HOOK]
	if (typeof hook == "function") await hook()
}

// 等仍在跑的数据请求结束：矩阵请求在调用方离开后会继续跑完写缓存，
// 不等它落地就清缓存，上一用例的数据会漏进下一用例
export async function settleDataRequests(): Promise<void> {
	const settle = (globalThis as Record<string, unknown>)[SETTLE_HOOK]
	if (typeof settle == "function") await settle()
}

export function clearBundleCaches(): void {
	clearBackendInfoCache()
	clearCurrenciesCache()
	clearPairRatesCache()
	clearMatrixCache()
}

