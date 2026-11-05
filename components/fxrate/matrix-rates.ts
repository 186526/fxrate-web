import { isAbortError } from "@/components/shared"
import { fxRateResponse } from "@/lib/fxrate/src/client"
import { LRUCache } from "lru-cache"
import { getFXRateClient, safeUpdated } from "./client"
import { createAbortError, runBatch } from "./request"
import { SLOW_SOURCES } from "./source-links"
import { registerDataRequestSettleHook } from "./test-cache-reset"

export interface RatesMatrixCell {
	middle: number | string | boolean
	cash?: number | string | boolean
	remit?: number | string | boolean
	// 交叉汇率补查时的过桥路径（如 ["CNY","HKD","CNH"]）
	path?: string[]
	// CNY/CNH 归一化：源只用 CNH 报价时实际使用 CNH 汇率
	alias?: string
	// 该汇率更新时间（用于 stale 判断）
	updated?: Date
}

export interface RatesMatrix {
	[source: string]: { [currency: string]: RatesMatrixCell }
}

// 矩阵空行可能同时触发多个来源的逐货币补查。不同来源不能强行合并进同一
// JSON-RPC batch（任一来源报错会让 client.done() 以整批错误拒绝，破坏来源级
// 重试隔离），因此在 tools 层用有界并发削平突发，同时保留每个来源独立批次。
const MATRIX_ROW_MAX_CONCURRENCY = 4
let matrixRowActiveRequests = 0
const matrixRowWaiters: Array<{
	resolve: (release: () => void) => void
	reject: (error: Error) => void
	signal?: AbortSignal
	onAbort?: () => void
}> = []

const releaseMatrixRowSlot = (): void => {
	matrixRowActiveRequests = Math.max(0, matrixRowActiveRequests - 1)
	while (matrixRowWaiters.length > 0) {
		const waiter = matrixRowWaiters.shift()!
		if (waiter.signal?.aborted) {
			waiter.reject(createAbortError())
			continue
		}
		if (waiter.signal && waiter.onAbort) {
			waiter.signal.removeEventListener("abort", waiter.onAbort)
		}
		matrixRowActiveRequests++
		let released = false
		waiter.resolve(() => {
			if (released) return
			released = true
			releaseMatrixRowSlot()
		})
		break
	}
}

const acquireMatrixRowSlot = (signal?: AbortSignal): Promise<() => void> => {
	if (signal?.aborted) return Promise.reject(createAbortError())
	if (matrixRowActiveRequests < MATRIX_ROW_MAX_CONCURRENCY) {
		matrixRowActiveRequests++
		let released = false
		return Promise.resolve(() => {
			if (released) return
			released = true
			releaseMatrixRowSlot()
		})
	}
	return new Promise<() => void>((resolve, reject) => {
		const waiter: (typeof matrixRowWaiters)[number] = {
			resolve,
			reject,
			signal,
		}
		if (signal) {
			waiter.onAbort = () => {
				const index = matrixRowWaiters.indexOf(waiter)
				if (index >= 0) matrixRowWaiters.splice(index, 1)
				waiter.reject(createAbortError())
				// 被移除的等待者不再占用名额，把名额交给下一位
				releaseMatrixRowSlot()
			}
			signal.addEventListener("abort", waiter.onAbort, { once: true })
		}
		matrixRowWaiters.push(waiter)
	})
}

// 请求范围指纹：参与请求的来源及其各自支持的货币稳定化后纳入缓存 key。
// 来源列表或支持货币变化（如新增银行、上游货币覆盖变化）时缓存自动失效，
// 避免命中缺少新源/新货币的旧数据；undefined/非数组（部分结果）安全处理
export const sourceSupportFingerprint = (currencies: {
	[source: string]: string[]
}): string => {
	return Object.keys(currencies)
		.sort()
		.map((s) => {
			const supported = currencies[s]
			return Array.isArray(supported)
				? `${s}:${[...supported].sort().join("+")}`
				: `${s}:?`
		})
		.join("|")
}

const matrixCache = new LRUCache<string, RatesMatrix>({
	max: 100,
	ttl: 1000 * 60 * 5,
})

// 在途矩阵请求：同一 key 的并发调用共享同一轮 listFXRates。仅缓存已完成结果时，
// 防抖窗口内二次触发的调用（currencies 到达、精度从存储读回）会各自重发整批请求。
// 每个调用方用自己的 signal 等待共享结果：任一调用方取消只让它自己以 AbortError
// 退出，其余调用方继续等待。
//
// 调用方全部离开后共享请求是否继续跑：由调用方在离开时按「key 是否仍是当前参数」
// 决定（见 isCurrentKey）。key 未变时（切矩阵的整页重挂载，旧实例卸载、新实例
// 稍后挂载）这一轮结果仍是下一个实例要的数据，取消它会让请求永远到不了
// matrixCache、新实例重发整批；key 已变时（金额/基准/精度/方向变化）旧结果已无用，
// 取消是正确的。共享请求本身有超时，留下继续跑的轮次不会无限占用。
// 无人等待但仍在跑的轮次留在表里、仍可加入：新实例挂载后直接等这一轮的结果，
// 不再另发一批；它结束时由 release() 移出表。
interface MatrixInFlight {
	promise: Promise<RatesMatrix>
	// 共享请求自身的取消信号：调用方全部离开且 key 已变时触发
	controller: AbortController
	// 仍在等待该请求的调用方数量
	subscribers: number
}
const matrixInFlight = new Map<string, MatrixInFlight>()

// 该 key 是否仍是当前请求参数：调用方离开时据此判断在途请求是否还值得跑完
type IsCurrentMatrixKey = (key: string) => boolean

const joinMatrixInFlight = (
	key: string,
	shared: MatrixInFlight,
	signal?: AbortSignal,
	isCurrentKey?: IsCurrentMatrixKey
): Promise<RatesMatrix> => {
	shared.subscribers++
	return new Promise<RatesMatrix>((resolve, reject) => {
		let settled = false
		const leave = () => {
			if (settled) return
			settled = true
			if (signal) signal.removeEventListener("abort", onAbort)
			shared.subscribers--
			if (shared.subscribers > 0) return
			// 最后一个调用方也走了：key 未变则让它跑完写缓存，并留在表里等后续调用
			// 加入；key 已变则取消
			if (isCurrentKey && isCurrentKey(key)) return
			if (matrixInFlight.get(key) == shared) matrixInFlight.delete(key)
			shared.controller.abort()
		}
		const onAbort = () => {
			leave()
			reject(createAbortError())
		}
		if (signal) signal.addEventListener("abort", onAbort, { once: true })
		const settle = () => {
			if (settled) return
			settled = true
			if (signal) signal.removeEventListener("abort", onAbort)
			shared.subscribers--
		}
		shared.promise.then(
			(value) => {
				settle()
				resolve(value)
			},
			(error) => {
				settle()
				reject(error)
			}
		)
	})
}

// 测试用：清空矩阵缓存（模块级缓存跨用例存活，避免用例间互相命中）。
// 并发闸门 `matrixRowActiveRequests` / `matrixRowWaiters` 故意不清：它们只描述
// 当前在途补查行的名额占用，不持有数据；在途请求结束时会自行释放名额，清空它们
// 反而会让等待中的请求拿不到名额。在途矩阵请求同理不清：调用方离开后仍可能跑完
// 写缓存，清表只会让新调用重发一轮；调用方要清缓存时应先 await
// settleMatrixRequests() 再清，避免在途那一轮的结果落回已清空的缓存。
export function clearMatrixCache(): void {
	matrixCache.clear()
}

// 等当前所有在途矩阵请求结束（含调用方离开后仍跑完写缓存的轮次）。
// 这些轮次受 client 自身请求超时约束，不会无限等待。
export async function settleMatrixRequests(): Promise<void> {
	while (matrixInFlight.size > 0) {
		await Promise.allSettled(
			Array.from(matrixInFlight.values(), (shared) => shared.promise)
		)
	}
}

// 交叉汇率响应在 fxRateResponse 基础上多了 path 字段（client 类型未声明，运行时已透传）；
// alias 为 CNY/CNH 归一化提示：源只用 CNH 报价时实际使用 CNH 汇率（如 dbs/ocbc）
interface FXRateWithPath extends fxRateResponse {
	path?: string[]
	alias?: string
}

const isUsableFXRateResponse = (response: unknown): response is FXRateWithPath => {
	if (typeof response != "object" || response == null) return false
	const rate = response as Record<string, unknown>
	return [rate.middle, rate.cash, rate.remit].some(
		(value) =>
			typeof value == "number" ||
			(typeof value == "string" && value.trim() != "")
	)
}

export async function getRatesMatrix(
	currencies: { [source: string]: string[] },
	from: string,
	options: {
		amount?: number
		precision?: number
		force?: boolean
		reverse?: boolean
		// 跳过不请求的源（默认跳过反爬慢源，矩阵视图点击后单独加载）
		skipSources?: Set<string>
		// 取消信号：参数/视图变化时 abort，取消未发送与可取消的在途工作；
		// 被取消的请求不写缓存（AbortError 向上抛）
		signal?: AbortSignal
		// key 是否仍是当前请求参数：signal 取消时据此决定共享请求继续跑完写缓存
		// （key 未变）还是取消（key 已变）。缺省视为 key 已变，即立即取消
		isCurrentKey?: IsCurrentMatrixKey
	} = {}
): Promise<RatesMatrix> {
	const {
		amount = 100,
		precision = 4,
		force = false,
		reverse = false,
		skipSources,
		signal,
		isCurrentKey,
	} = options

	const skip = skipSources ?? SLOW_SOURCES
	// 来源/支持货币与 skip 策略（排序稳定）纳入缓存 key：
	// 请求范围变化时自动失效，避免命中缺失新源或不同 skip 策略的旧矩阵
	const skipFingerprint =
		skip.size > 0 ? Array.from(skip).sort().join("+") : "none"
	const key = `${from}-${amount}-p${precision}-${reverse ? "reverse" : "forward"}|${sourceSupportFingerprint(currencies)}|skip:${skipFingerprint}`

	// 预中止：在 cache 读取之前抛 AbortError——被取消的请求即使命中缓存也不返回数据
	if (signal != undefined && signal.aborted) {
		throw createAbortError()
	}

	if (!force) {
		const cached = matrixCache.get(key)
		if (cached) return cached
		// 同一 key 已有在途请求：加入它，不再发第二轮 listFXRates。
		// 包括已无调用方、仍在跑的那一轮：结果正是本次要的数据
		const shared = matrixInFlight.get(key)
		if (shared) return joinMatrixInFlight(key, shared, signal, isCurrentKey)
	}

	const shared: MatrixInFlight = {
		controller: new AbortController(),
		subscribers: 0,
		promise: undefined as unknown as Promise<RatesMatrix>,
	}
	shared.promise = loadMatrix(key, currencies, from, {
		amount,
		precision,
		reverse,
		skip,
		signal: shared.controller.signal,
	})
	matrixInFlight.set(key, shared)
	// 共享请求结束后让位，后续调用重新走缓存或在途判断
	const release = () => {
		if (matrixInFlight.get(key) == shared) matrixInFlight.delete(key)
	}
	shared.promise.then(release, release)
	registerDataRequestSettleHook(settleMatrixRequests)

	return joinMatrixInFlight(key, shared, signal, isCurrentKey)
}

async function loadMatrix(
	key: string,
	currencies: { [source: string]: string[] },
	from: string,
	{
		amount,
		precision,
		reverse,
		skip,
		signal,
	}: {
		amount: number
		precision: number
		reverse: boolean
		skip: Set<string>
		signal: AbortSignal
	}
): Promise<RatesMatrix> {
	const client = getFXRateClient()

	const data: RatesMatrix = {}
	let failed = false

	try {
		await runBatch(client, () => {
			for (const k in currencies) {
				if (skip.has(k)) continue
				const x = k
				client.listFXRates(
					x,
					from,
					(resp) => {
						const row: { [currency: string]: RatesMatrixCell } = {}
						for (const currency in resp) {
							const item = resp[currency]
							// 不支持的 source（如卡组织全表 403）经 client transform
							// 会变成 { status, message } 之类非货币条目，跳过
							if (
								typeof item != "object" ||
								item === null ||
								!("middle" in item) ||
								currency == "status" ||
								currency == "message"
							) {
								continue
							}
							row[currency] = {
								middle: item.middle,
								cash: item.cash,
								remit: item.remit,
								updated: safeUpdated(item.updated),
							}
						}
						data[x] = row
					},
					precision,
					amount,
					0,
					reverse
				)
			}
		}, signal)
	} catch (error) {
		if (isAbortError(error)) throw error
		console.error("Error getting rates matrix:", error)
		failed = true
	}

	// 批次完成但请求已被取消：不写缓存（AbortError 向上抛）
	if (signal.aborted) {
		throw createAbortError()
	}

	if (!failed && Object.keys(data).length > 0) {
		matrixCache.set(key, data)
	}

	// 全部来源都失败时向上抛错，让调用方显示错误（部分成功仍降级返回）
	if (failed && Object.keys(data).length == 0) {
		throw new Error("获取矩阵失败：所有数据源均不可用，请稍后重试")
	}

	return data
}

// 矩阵视图单独查询某个源（Visa 等反爬慢源或全表接口 403 的卡组织源）：
// 用 getFXRate 逐货币查询（不走 listFXRates 全表——后端对卡组织全表返回 403），
// 只查该源支持的货币，避免触发不支持的货币导致 chromium 重建超时
export async function getSourceMatrixRow(
	source: string,
	supportedCurrencies: string[],
	targetCurrencies: string[],
	from: string,
	options: {
		amount?: number
		precision?: number
		reverse?: boolean
		// 交叉汇率：开启后无直连的货币对经中间货币折算（与单对视图 bfs 一致）
		bfs?: boolean
		// 取消信号：参数变化时 abort，取消未发送与可取消的在途工作（AbortError 向上抛）
		signal?: AbortSignal
	} = {}
): Promise<{ [currency: string]: RatesMatrixCell }> {
	const {
		amount = 100,
		precision = 4,
		reverse = false,
		bfs = false,
		signal,
	} = options
	const client = getFXRateClient()

	const row: { [currency: string]: RatesMatrixCell } = {}
	let invalidResponses = 0
	const targets = targetCurrencies.filter((c) =>
		supportedCurrencies.includes(c)
	)
	if (targets.length == 0) return row

	// 已中止：不发起任何网络请求（不触碰 client 队列状态）
	if (signal != undefined && signal.aborted) {
		throw createAbortError()
	}
	const releaseSlot = await acquireMatrixRowSlot(signal)

	try {
		await runBatch(client, () => {
			for (const c of targets) {
				client.getFXRate(
					source,
					from,
					c,
					(resp) => {
						if (!isUsableFXRateResponse(resp)) {
							invalidResponses++
							return
						}
						const withPath = resp
						row[c] = {
							middle: resp.middle,
							cash: resp.cash,
							remit: resp.remit,
							updated: safeUpdated(resp.updated),
							path:
								withPath.path && withPath.path.length > 0
									? withPath.path
									: undefined,
							alias: withPath.alias,
						}
					},
					"all",
					precision,
					amount,
					0,
					reverse,
					bfs
				)
			}
		}, signal)
	} catch (error) {
		if (isAbortError(error)) throw error
		console.error(`Error getting matrix row for ${source}:`, error)
		throw error
	} finally {
		releaseSlot()
	}
	if (Object.keys(row).length == 0 && invalidResponses > 0) {
		throw new Error(`${source} 暂无可用报价，请稍后重试`)
	}

	return row
}
