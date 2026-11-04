"use client"
import * as React from "react"

import { getCurrenciesDetails, isAbortError, SLOW_SOURCES } from "../tools"
import type { FXListProps } from "../shared"
import { pairViewCacheKey, visibleSnapshot, type View } from "../view-utils"

interface PairSnapshot {
	key: string
	data: FXListProps[]
}

// 单对视图数据：keyed 快照 + SWR 缓存 + 代际守卫 + 视图级 AbortController。
// 渲染只读 state 快照，不读 cache ref（react-hooks/refs）；快照与 cache ref
// 每次写入保持同步，SWR 门控语义不变。
export function usePairData({
	currencies,
	view,
	pairFrom,
	pairTo,
	pairReverse,
	amount,
	precision,
	crossRates,
	initialResult,
}: {
	currencies: { [source: string]: string[] } | null
	view: View
	pairFrom: string
	pairTo: string
	pairReverse: boolean
	amount: number
	precision: number
	crossRates: boolean
	initialResult?: (Omit<FXListProps, "updated"> & { updated: string })[] | null
}) {
	const pairReqTo = pairReverse ? pairFrom : pairTo
	const pairReqFrom = pairReverse ? pairTo : pairFrom
	const activePairKey = pairViewCacheKey(
		pairReqFrom,
		pairReqTo,
		amount,
		precision,
		crossRates
	)
	const activePairKeyRef = React.useRef(activePairKey)
	// 提交后同步：陈旧响应守卫只在回调/effect 读取，不能在渲染期间写 ref
	React.useEffect(() => {
		activePairKeyRef.current = activePairKey
	}, [activePairKey])

	const pairReqRef = React.useRef(0)
	// 视图级 AbortController：参数/视图变化时 abort 在途请求，取消未发送与
	// 可取消的网络工作（慢源后台批 detached 不受影响，由代际守卫兜底）
	const pairAbortRef = React.useRef<AbortController | null>(null)

	const initialSnapshot = React.useMemo<PairSnapshot | null>(
		() =>
			initialResult
				? {
						key: activePairKey,
						data: initialResult.map((r) => ({
							...r,
							updated: new Date(r.updated),
						})),
				  }
				: null,
		// 初始结果只在挂载时使用；key 取挂载时的参数
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	)
	const pairCacheRef = React.useRef<PairSnapshot | null>(initialSnapshot)
	const [pairSnapshot, setPairSnapshot] =
		React.useState<PairSnapshot | null>(initialSnapshot)
	const [result, setResult] = React.useState<FXListProps[] | null>(
		initialSnapshot?.data ?? null
	)
	const [loading, setLoading] = React.useState(!initialResult)
	const [pairError, setPairError] = React.useState<string | null>(null)

	const fetchPair = React.useCallback(
		(force: boolean) => {
			if (!currencies) return
			const reqId = ++pairReqRef.current
			// 新请求接管：取消上一批进行中的单对工作（同 key 自动刷新或旧参数请求）
			pairAbortRef.current?.abort()
			const controller = new AbortController()
			// 立即登记：同一渲染批次内先运行的参数变化 effect 必须能取消本请求
			pairAbortRef.current = controller
			const key = activePairKey
			setPairError(null)
			const cached = pairCacheRef.current
			if (cached && cached.key == key) {
				setResult(cached.data)
				setLoading(false)
			} else {
				setLoading(true)
			}
			getCurrenciesDetails(
				currencies,
				pairReqTo,
				pairReqFrom,
				(r) => {
					if (
						reqId != pairReqRef.current ||
						activePairKeyRef.current != key
					) return

					const existing =
						pairCacheRef.current?.key == key
							? pairCacheRef.current.data
							: []
					const mergedByName = new Map<string, FXListProps>()
					if (r.fastFailed) {
						// 快源批量失败：本次回调只含慢源（或部分快源）结果，无法判断
						// 哪些快源真正下线，保留既有全部行（快源+慢源）兜底，新数据逐行覆盖
						for (const row of existing) {
							mergedByName.set(row.name, row)
						}
					} else {
						// 正常成功刷新：快源行本次未返回（失败/已下线）即视为陈旧移除；
						// 慢源仅在后台未归或请求失败时保留；批次成功完成但未返回报价时
						// 必须移除旧慢源行，不能无限展示已经失效的 Visa 数据。
						for (const row of existing) {
							if (
								SLOW_SOURCES.has(row.name) &&
								(r.slowSourcesState == "pending" ||
									r.slowSourcesState == "failed")
							) {
								mergedByName.set(row.name, row)
							}
						}
					}
					for (const row of r.data) mergedByName.set(row.name, row)
					const merged = Array.from(mergedByName.values())

					pairCacheRef.current = { key, data: merged }
					setPairSnapshot({ key, data: merged })
					setResult(merged)
					setLoading(false)
					// 快源失败的回调不清除错误提示：慢源单独完成不得掩盖失败现场
					if (!r.fastFailed) setPairError(null)
				},
				{
					amount,
					precision,
					force,
					bfs: crossRates,
					signal: controller.signal,
				}
			)
				.catch((e) => {
					// 取消（参数/视图变化/新请求接管）不视为失败，不触碰错误/加载状态
					if (isAbortError(e)) return
					if (reqId == pairReqRef.current && activePairKeyRef.current == key) {
						setLoading(false)
						setPairError(
							e instanceof Error ? e.message : "加载报价失败，请稍后重试"
						)
					}
				})
		},
		[
			currencies,
			pairReqTo,
			pairReqFrom,
			activePairKey,
			amount,
			precision,
			crossRates,
		]
	)

	// 参数/视图变化时立即作废单对进行中的请求代际，
	// 防止陈旧响应（旧货币对/矩阵视图期间完成）落地污染 result/loading/pairError；
	// 同时 abort 在途请求，取消未发送与可取消的网络工作
	React.useEffect(() => {
		/* eslint-disable react-hooks/set-state-in-effect -- URL state invalidates active work */
		pairReqRef.current++
		pairAbortRef.current?.abort()
		pairAbortRef.current = null
		setPairError(null)
		/* eslint-enable react-hooks/set-state-in-effect */
	}, [view, pairReverse, pairFrom, pairTo, amount, precision, crossRates])

	// 货币/金额变化：防抖 300ms 拉取（命中缓存时零请求）；
	// 矩阵视图激活时不运行单对防抖
	React.useEffect(() => {
		if (!currencies || view != "pair") return
		// 切回本视图时立即恢复上次数据，不等防抖，避免白屏
		const cached = pairCacheRef.current
		if (cached && cached.key == activePairKey) {
			setResult(cached.data)
			setLoading(false)
		} else {
			// 无匹配缓存：立即进入加载态，配合 visiblePair 按完整 key 门控显示
			setLoading(true)
		}
		const timer = setTimeout(() => fetchPair(false), 300)
		return () => clearTimeout(timer)
	}, [currencies, fetchPair, view, activePairKey])

	// 自动刷新：60s，仅页面可见时强制重拉（矩阵视图激活时不运行）
	React.useEffect(() => {
		if (!currencies || view != "pair") return
		const interval = setInterval(() => {
			if (document.visibilityState != "visible") return
			fetchPair(true)
		}, 60000)
		return () => clearInterval(interval)
	}, [currencies, fetchPair, view])

	// 卸载清理依赖稳定引用：每次渲染新建函数会让清理 effect 反复重跑，
	// 取消同一渲染批次中刚完成、调用方仍持有 signal 的请求
	const abort = React.useCallback(() => {
		pairAbortRef.current?.abort()
	}, [])

	const visiblePair = visibleSnapshot(pairSnapshot, activePairKey)?.data ?? null
	const visiblePairLoading =
		loading || (view == "pair" && result != null && visiblePair == null)

	return {
		pairReqFrom,
		pairReqTo,
		activePairKey,
		result,
		pairError,
		fetchPair,
		visiblePair,
		visiblePairLoading,
		abort,
	}
}
