import type FXRates from "@/lib/fxrate/src/client"

// 数据请求超时阈值（默认）：超过则放弃等待，让调用方降级处理（如客户端首屏不被慢后端拖住）
export const DEFAULT_TIMEOUT_MS = 3000

export async function withTimeout<T>(
	p: Promise<T>,
	ms = DEFAULT_TIMEOUT_MS
): Promise<T | null> {
	return new Promise<T | null>((resolve, reject) => {
		let settled = false
		const timer = setTimeout(() => {
			settled = true
			resolve(null)
		}, ms)
		p.then(
			(value) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				resolve(value)
			},
			(error) => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				reject(error)
			}
		)
	})
}

// 构造统一的取消错误（name=AbortError）：被取消的请求不视为真实失败，
// 调用方据此跳过错误提示；AbortController.abort() 触发的 fetch 错误同名可兼容
export const createAbortError = (): Error => {
	const error = new Error("请求已取消")
	error.name = "AbortError"
	return error
}

// 让 Promise 可被 AbortSignal 提前放弃：abort 触发时立即以 AbortError 拒绝，
// 不再等待原 Promise settle；原 Promise 后续 resolve/reject 都被消化，
// 不会产生 unhandled rejection。用于 runBatch 的 client.done() 竞态——
// client 不向 fetch 传外部 signal（网络层取消由后端/客户端超时兜底），
// 这里取消的是调用方对该批次结果的等待
const abortable = <T>(p: Promise<T>, signal?: AbortSignal): Promise<T> => {
	if (signal == undefined) return p
	if (signal.aborted) return Promise.reject(createAbortError())
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => {
			signal.removeEventListener("abort", onAbort)
			reject(createAbortError())
		}
		signal.addEventListener("abort", onAbort, { once: true })
		p.then(
			(value) => {
				signal.removeEventListener("abort", onAbort)
				resolve(value)
			},
			(error) => {
				signal.removeEventListener("abort", onAbort)
				reject(error)
			}
		)
	})
}

// 批量请求生命周期兜底：batch() → 排队 → done()。无论排队阶段是否抛错，
// 都确保 done() 被调用复位 inBatch/请求队列（done() 空队列时直接返回，幂等），
// 异常不会残留污染同一 client 的后续请求。第一个错误（排队异常或批量内部分
// 失败）向上抛给调用方按既有降级逻辑处理。
// signal：可选。已中止时直接抛 AbortError（不触碰 client 状态）；批次在途时
// abort 立即以 AbortError 拒绝，由调用方放弃该批次结果（代际守卫兜底）
export async function runBatch(
	client: FXRates,
	queue: () => void,
	signal?: AbortSignal
): Promise<void> {
	if (signal != undefined && signal.aborted) {
		throw createAbortError()
	}
	client.batch()
	let error: unknown = null
	try {
		queue()
	} catch (e) {
		error = e
	}
	try {
		await abortable(client.done(), signal)
	} catch (e) {
		if (error == null) error = e
	}
	if (error != null) throw error
}
