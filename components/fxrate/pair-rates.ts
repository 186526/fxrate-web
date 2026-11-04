import type { FXListProps } from "@/components/shared"
import { isAbortError } from "@/components/shared"
import { fxRateResponse } from "@/lib/fxrate/src/client"
import { LRUCache } from "lru-cache"
import { getFXRateClient, safeUpdated } from "./client"
import { createAbortError, runBatch } from "./request"
import { SLOW_SOURCES } from "./source-links"
import { sourceSupportFingerprint } from "./matrix-rates"

const cache = new LRUCache<string, FXListProps[]>({
	max: 100,
	ttl: 1000 * 60 * 5,
})

export interface FXDetailsOptions {
	amount?: number
	precision?: number
	force?: boolean
	// 启用交叉汇率：后端 BFS 找中间货币路径（如 CNY→CNH 经 HKD 折算），
	// 有累积误差，默认关闭；响应中会带 path 字段
	bfs?: boolean
	// 取消信号：参数/视图变化时由调用方 abort，取消未发送与可取消的在途工作。
	// 被取消的请求不写缓存、不回调、不启动慢源后台批（AbortError 向上抛）
	signal?: AbortSignal
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

// getCurrenciesDetails 回调携带的数据更新：data 为本次合并结果。
// fastFailed=true 表示本次快源批量失败/不完整（回调可能是慢源单独完成或部分快源结果），
// 调用方应保留既有快源行与错误展示，避免慢源回调覆盖失败现场
export interface FXDetailsUpdate {
	data: FXListProps[]
	fastFailed: boolean
	// pending：快源结果已返回、慢源仍在后台；complete：慢源批成功完成，
	// 即使没有可用报价也可移除旧慢源行；failed：慢源请求失败，应保留旧行兜底。
	slowSourcesState?: "none" | "pending" | "complete" | "failed"
}

// 慢源后台批代际守卫：同一缓存 key 可能同时存在多个进行中的请求（手动刷新/自动刷新
// 会发起 force 请求，先前的非 force 慢源批仍在后台抓取）。全局单调递增 id 标记每个
// 请求，bounded LRU 保存每个 key 的最新代际；慢源批完成时只允许最新代际写缓存，
// 过期的慢源结果不得覆盖新数据。全局单调 id 保证 key 被清理/重建后新旧请求不会撞号
// （per-key 计数器删除后会从 1 重新计数，旧请求与重建后的新请求会碰撞）
const slowSourceLatestGen = new LRUCache<string, number>({
	max: 100,
})
let slowSourceGenCounter = 0

// 测试用：清空单对报价缓存与慢源代际表。模块级状态跨用例存活，不清的话：
// - `cache` 命中会让下一个用例跳过请求；
// - `slowSourceLatestGen` 里上一个用例的在途慢源批仍持有最新代际，完成后能通过
//   代际守卫写进刚清空的 `cache`，把旧场景的数据带进下一个用例。
// 单调计数器 `slowSourceGenCounter` 故意保留：它只增不减，留着才能保证清理前后
// 新旧请求的代际 id 不撞号。
export function clearPairRatesCache(): void {
	cache.clear()
	slowSourceLatestGen.clear()
}

export async function getCurrenciesDetails(
	currencies: { [source: string]: string[] },
	toCurrency: string,
	fromCurrency: string,
	setResult?: (update: FXDetailsUpdate) => void,
	options: FXDetailsOptions = {}
): Promise<FXListProps[]> {
	const {
		amount = 100,
		precision = 4,
		force = false,
		bfs = false,
		signal,
	} = options

	const key = `${fromCurrency}-${toCurrency}-${amount}-p${precision}${bfs ? "-bfs" : ""}|${sourceSupportFingerprint(currencies)}`

	// 预中止：在 cache 读取/回调之前抛 AbortError——被取消的请求即使命中缓存
	// 也不回调、不展示（契约：被取消的请求不写缓存、不回调）
	if (signal != undefined && signal.aborted) {
		throw createAbortError()
	}

	if (!force) {
		const cached = cache.get(key)
		if (cached) {
			if (setResult) {
				setResult({
					data: cached,
					fastFailed: false,
					slowSourcesState: "complete",
				})
			}
			return cached
		}
	}

	// client 须先于任何 await 捕获：服务端请求级实例在渲染作用域结束后失效
	const client = getFXRateClient()

	const data: { [source: string]: FXListProps } = {}
	const sourceResponseCounts: { [source: string]: number } = {}
	let failed = false
	let fastCacheComplete = true
	let failedMessage = "获取报价失败：所有数据源均不可用，请稍后重试"

	// 慢源（Visa/MasterCard 反爬抓取可达 30s+）拆出主批量：
	// 主批量只等快源，慢源单独后台请求，完成后合并回 data 再回调
	const slowSources = Object.keys(currencies).filter((s) =>
		SLOW_SOURCES.has(s)
	)
	const fastSources = Object.keys(currencies).filter(
		(s) => !SLOW_SOURCES.has(s)
	)

	// 代际登记须在快源批启动前完成：更晚的 force/普通请求在自身快源批阶段就登记
	// 新代际，使先前请求的过期慢源批完成后不可能写缓存（若登记延后到慢源批启动，
	// 「先发的慢源批先完成、新 force 快源批尚未完成」的窗口内旧结果仍会写缓存）
	const slowGeneration =
		slowSources.length > 0 && typeof window != "undefined"
			? ++slowSourceGenCounter
			: null
	if (slowGeneration != null) {
		slowSourceLatestGen.set(key, slowGeneration)
	}

	// 只请求来源货币列表含 from/to 任一的数据源；货币列表可能为部分结果，
	// 缺失条目（undefined）安全跳过，避免批次排队中途抛错
	const sourceSupportsPair = (x: string): boolean => {
		const supported = currencies[x]
		return (
			Array.isArray(supported) &&
			(supported.includes(toCurrency) ||
				supported.includes(fromCurrency))
		)
	}

	const requestSource = (x: string) => {
		client.getFXRate(
			x,
			toCurrency,
			fromCurrency,
			(resp) => {
				sourceResponseCounts[x] = (sourceResponseCounts[x] ?? 0) + 1
				if (!isUsableFXRateResponse(resp)) return
				const withPath = resp

				data[x] = data[x] ?? {
					name: x,
					updated: safeUpdated(resp.updated),
					type: {},
				}

				data[x].type.middle = resp.middle

				data[x].type.sell = {
					cash: resp.cash,
					remit: resp.remit,
				}

				if (withPath.path && withPath.path.length > 0) {
					data[x].path = withPath.path
				}
			},
			"all",
			precision,
			amount,
			0,
			false,
			bfs
		)

		client.getFXRate(
			x,
			fromCurrency,
			toCurrency,
			(resp) => {
				sourceResponseCounts[x] = (sourceResponseCounts[x] ?? 0) + 1
				if (!isUsableFXRateResponse(resp)) return
				const withPath = resp

				data[x] = data[x] ?? {
					name: x,
					updated: safeUpdated(resp.updated),
					type: {},
				}

				// 反向请求（本币→外币）返回的是"卖出价倒数"口径：
				// resp.cash = amount 本币可换的外币数（如 100 CNY = 12.7857 EUR），
				// 银行卖出价 = amount 外币折本币 = amount² / resp.cash（如 10000/12.7857 = 782.12）。
				// 注意：本请求必须用高精度（precision=8）避免反向值被提前舍入导致换算误差放大
				// （不能用 precision=-1：后端对 Fraction 无限小数会输出 "14.(7642…)" 字符串无法解析），
				// 换算结果再按请求精度四舍五入
				const num = (v: unknown): number | undefined => {
					if (typeof v == "number") return v
					if (typeof v == "string" && v.trim() != "") {
						const n = Number(v)
						return Number.isNaN(n) ? undefined : n
					}
					return undefined
				}
				const invert = (v: unknown): number | string | undefined => {
					const n = num(v)
					if (n == undefined || n == 0) {
						return typeof v == "boolean"
							? undefined
							: (v as number | string | undefined)
					}
					const raw = (amount * amount) / n
					return precision >= 0
						? Math.round(raw * 10 ** precision) / 10 ** precision
						: raw
				}

				data[x].type.buy = {
					cash: invert(resp.cash),
					remit: invert(resp.remit),
				}

				if (withPath.path && withPath.path.length > 0) {
					data[x].path = withPath.path
				}

				if (withPath.alias) {
					data[x].alias = withPath.alias
				}
			},
			"all",
			8,
			amount,
			0,
			false,
			bfs
		)
	}

	try {
		// 后端 JSON-RPC 批量上限 150 条；每源排 2 条 getFXRate（双向）。按 70
		// 源/批分块（140 条 < 150），为未来批内附加请求预留 10 条余量；当前
		// 约 59 个来源可在单批完成，各块仍顺序执行、共享 data，慢源继续单独请求。
		const requestedFastSources = fastSources.filter(sourceSupportsPair)
		const BATCH_CHUNK = 70
		for (let i = 0; i < requestedFastSources.length; i += BATCH_CHUNK) {
			const chunk = requestedFastSources.slice(i, i + BATCH_CHUNK)
			await runBatch(client, () => {
				for (const x of chunk) {
					requestSource(x)
				}
			}, signal)
		}
		fastCacheComplete = requestedFastSources.every(
			(source) =>
				sourceResponseCounts[source] == 2 && data[source] != undefined
		)
		if (
			requestedFastSources.length > 0 &&
			!requestedFastSources.some((source) => data[source] != undefined)
		) {
			failed = true
		}
	} catch (error) {
		if (isAbortError(error)) {
			// 请求被取消（参数/视图变化）：不启动慢源、不写缓存、不回调
			throw error
		}
		console.error("Error getting currency details:", error)
		failed = true
		failedMessage =
			error instanceof Error && /timed out/i.test(error.message)
				? "请求超时：部分数据源响应缓慢（如 Visa/MasterCard 反爬抓取），请稍后重试"
				: "获取报价失败：所有数据源均不可用，请稍后重试"
	}

	// 快源批完成但请求已被取消（如关闭交叉汇率时旧 BFS 批尚未启动慢源）：
	// 不再启动慢源后台批，避免旧 BFS/Visa 请求继续占用 Card/Chromium 预算
	if (signal != undefined && signal.aborted) {
		throw createAbortError()
	}

	// 慢源后台单独请求（不阻塞主流程），完成后合并结果再回调一次。
	// 服务端 SSR 不启动：渲染作用域结束后请求级 client 失效，且 30s+ 抓取不应
	// 残留服务端进程；客户端挂载后自会补拉慢源
	if (slowGeneration != null) {
		// 快源与慢源都成功才写缓存：慢源失败时只降级展示已成功部分，
		// 不落缓存，保证下次请求仍会重试慢源
		let slowCacheComplete = false
		let slowSourcesState: "complete" | "failed" = "failed"
		const requestedSlowSources = slowSources.filter(sourceSupportsPair)
		const mergeAndNotify = () => {
			const merged = Object.values(data)
			if (merged.length > 0) {
				// 快速源失败（failed=true）、慢源失败（slowCacheComplete=false）或本请求已不是
				// 该 key 最新代际（更晚的 force/普通请求已接管）都不写缓存，避免把
				// 部分结果或过期慢源数据写进缓存导致下次请求不再重试缺失源
				if (
					!failed &&
					fastCacheComplete &&
					slowCacheComplete &&
					slowSourceLatestGen.get(key) == slowGeneration
				) {
					cache.set(key, merged)
				}
			}
			if (setResult) {
				setResult({
					data: merged,
					fastFailed: failed,
					slowSourcesState,
				})
			}
		}
		;(async () => {
			try {
				await runBatch(client, () => {
					for (const x of requestedSlowSources) {
						requestSource(x)
					}
				})
				slowSourcesState = "complete"
				slowCacheComplete = requestedSlowSources.every(
					(source) =>
						sourceResponseCounts[source] == 2 && data[source] != undefined
				)
			} catch (error) {
				console.error("Error getting slow source details:", error)
			} finally {
				mergeAndNotify()
			}
		})()
	}

	const result = Object.values(data)

	// 慢源后台批已启动（detached，不受本 signal 影响）后请求被取消：
	// 快源结果不写缓存、不回调；慢源完成时由 mergeAndNotify 按代际守卫自行决定
	if (signal != undefined && signal.aborted) {
		throw createAbortError()
	}

	// 请求失败不写缓存，保证下次还能重试；
	// 有慢源待后台批处理时也不写快源结果（慢源成功后才统一写缓存，
	// 避免命中快源-only 数据）——慢源完成前缓存仍保持缺失状态
	if (
		!failed &&
		fastCacheComplete &&
		result.length > 0 &&
		slowSources.length == 0
	) {
		cache.set(key, result)
	}

	// 全部来源都失败时向上抛错，让调用方显示错误（部分成功仍降级返回）
	if (failed && result.length == 0) {
		throw new Error(failedMessage)
	}

	if (setResult) {
		setResult({
			data: result,
			fastFailed: failed,
			slowSourcesState: slowGeneration == null ? "none" : "pending",
		})
	}
	return result
}
