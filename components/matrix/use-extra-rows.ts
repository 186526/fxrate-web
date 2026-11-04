"use client"
import * as React from "react"

import { getSourceMatrixRow, isAbortError, type RatesMatrix } from "../tools"
import {
	cellOf,
	mergeCellRows,
	orientMatrixRowPaths,
	type MatrixDisplayData,
	type MatrixRow,
	toNumber,
	type PriceType,
	type SourceLoadStatus,
} from "../matrix-utils"

// 矩阵额外行（Visa 手动 / MasterCard 自动 / 交叉补查）的数据流：
// - 以 rowParamsKey 为代际，异步响应只在 key 未变时写回；
// - 额外行以 keyed 快照 {key, data} 存储，旧参数数据绝不渲染进新参数表格；
// - 合并只在本 Hook 内完成，对外只返回 displayData（单向数据流）。
export function useMatrixExtraRows({
	data,
	from,
	amount,
	precision,
	reverse,
	crossRates,
	slowSources,
	sourceCurrencies,
	currencies,
	rowParamsKey,
	priceType,
}: {
	data: RatesMatrix
	from: string
	amount: number
	precision: number
	reverse: boolean
	crossRates: boolean
	slowSources: string[]
	sourceCurrencies?: { [source: string]: string[] }
	// 已按显示顺序排好的可见货币列
	currencies: string[]
	rowParamsKey: string
	priceType: PriceType
}) {
	const [extraRows, setExtraRows] = React.useState<{
		key: string
		data: MatrixDisplayData
	}>({ key: rowParamsKey, data: {} })
	// 每个额外行来源的加载状态：自动补查失败（error）可区分、可重试
	const [sourceStatus, setSourceStatus] = React.useState<{
		[source: string]: SourceLoadStatus
	}>({})
	const [sourceError, setSourceError] = React.useState<{
		[source: string]: string
	}>({})

	// 最近一次 commit 的请求 key：异步响应经 requestKey 对比判断是否过期。
	// 用 useLayoutEffect（commit 后、绘制前）同步，保证同一渲染周期内异步
	// 响应读到的都是已提交的 key，陈旧响应不能写入当前参数
	const rowParamsRef = React.useRef(rowParamsKey)
	React.useLayoutEffect(() => {
		rowParamsRef.current = rowParamsKey
	}, [rowParamsKey])
	// 额外行请求取消：rowParamsKey 变化/卸载时 abort 全部在途补查
	// （MasterCard 自动 / Visa 手动 / 交叉补查各自独立，互不误伤）
	const rowLoadAbortRef = React.useRef<Set<AbortController>>(new Set())
	const crossFillAbortRef = React.useRef<AbortController | null>(null)
	// 每参数 key 已尝试自动补查的来源：防重复但不永久去重失败——key 变化时清空
	const autoAttemptedRef = React.useRef<{ [key: string]: string[] }>({})

	const mergeExtraRow = React.useCallback(
		(source: string, requestKey: string, row: MatrixRow) => {
			const displayRow = orientMatrixRowPaths(
				row as RatesMatrix[string],
				from,
				reverse
			)
			setExtraRows((prev) =>
				prev.key == requestKey
					? {
							key: prev.key,
							data: {
								...prev.data,
								[source]: mergeCellRows(prev.data[source], displayRow),
							},
					  }
					: prev
			)
		},
		[from, reverse]
	)

	const handleLoadSource = React.useCallback(
		async (source: string) => {
			const requestKey = rowParamsKey
			const controller = new AbortController()
			rowLoadAbortRef.current.add(controller)
			setSourceStatus((prev) => ({ ...prev, [source]: "loading" }))
			try {
				const supported = sourceCurrencies?.[source] ?? []
				const row = await getSourceMatrixRow(
					source,
					supported,
					currencies,
					from,
					{
						amount,
						precision,
						reverse,
						bfs: crossRates,
						signal: controller.signal,
					}
				)
				// 过期响应（参数已变）直接丢弃，不写状态
				if (rowParamsRef.current != requestKey) return
				setSourceStatus((prev) => ({ ...prev, [source]: "success" }))
				if (Object.keys(row).length > 0) {
					mergeExtraRow(source, requestKey, row)
				}
			} catch (e) {
				if (isAbortError(e)) {
					// 参数已变的取消（key 过期）静默忽略：rowParamsKey 变化 effect 已
					// 统一清空状态与去重，无需在此处理。参数未变的取消（StrictMode
					// 双挂载 cleanup 在 client.batch 前提前 abort）不得留下 loading
					// 状态与 attempted 去重记录——复位两者（源状态删除 + 去重移除），
					// 让 auto-load effect 重新评估并重试；重试后的真实空响应/失败
					// 随后正常落入 error 可重试状态，不再被 loading 卡死
					if (rowParamsRef.current == requestKey) {
						setSourceStatus((prev) => {
							const next = { ...prev }
							delete next[source]
							return next
						})
						setSourceError((prev) => {
							if (!(source in prev)) return prev
							const next = { ...prev }
							delete next[source]
							return next
						})
						const attempted = autoAttemptedRef.current[requestKey]
						if (attempted) {
							autoAttemptedRef.current[requestKey] = attempted.filter(
								(s) => s != source
							)
						}
					}
					return
				}
				// 过期响应（参数已变）不写错误状态；其余失败可区分可重试
				if (rowParamsRef.current != requestKey) return
				setSourceStatus((prev) => ({ ...prev, [source]: "error" }))
				setSourceError((prev) => ({
					...prev,
					[source]: e instanceof Error ? e.message : String(e),
				}))
			} finally {
				rowLoadAbortRef.current.delete(controller)
			}
		},
		[
			rowParamsKey,
			sourceCurrencies,
			currencies,
			from,
			amount,
			precision,
			reverse,
			crossRates,
			mergeExtraRow,
		]
	)

	// MasterCard 实测毫秒级返回：矩阵数据就绪后自动加载（不经"点击加载"）。
	// 参数、刷新代际或可见货币变化时重置额外行、状态与请求代际，用新参数重新加载
	const crossFilledRef = React.useRef<string>("")
	const crossFillRequestRef = React.useRef(0)
	const lastRowParamsRef = React.useRef(rowParamsKey)
	React.useEffect(() => {
		if (lastRowParamsRef.current == rowParamsKey) return
		lastRowParamsRef.current = rowParamsKey
		// 参数变化：作废全部在途补查请求（网络层取消 + keyed 守卫防陈旧落地）
		for (const controller of rowLoadAbortRef.current) controller.abort()
		rowLoadAbortRef.current.clear()
		crossFillAbortRef.current?.abort()
		crossFillAbortRef.current = null
		autoAttemptedRef.current = {}
		crossFillRequestRef.current += 1
		crossFilledRef.current = ""
		setExtraRows({ key: rowParamsKey, data: {} })
		setSourceStatus({})
		setSourceError({})
	}, [rowParamsKey])

	// 卸载时取消全部在途补查请求，避免陈旧响应落地
	React.useEffect(() => {
		const rowLoadControllers = rowLoadAbortRef.current
		return () => {
			for (const controller of rowLoadControllers) controller.abort()
			rowLoadControllers.clear()
			crossFillAbortRef.current?.abort()
		}
	}, [])

	React.useEffect(() => {
		if (!sourceCurrencies || Object.keys(data).length == 0) return
		if (currencies.length == 0) return
		const attempted = autoAttemptedRef.current[rowParamsKey] ?? []
		for (const s of Object.keys(sourceCurrencies)) {
			if (slowSources.includes(s)) continue
			// 主数据里该行非空（直连全表返回了数据）则无需自动加载；
			// 空行（如卡组织全表 403）走 getSourceMatrixRow 单独查询
			if (s in data && Object.keys(data[s]).length > 0) continue
			const status = sourceStatus[s]
			if (
				attempted.includes(s) ||
				status == "loading" ||
				status == "success"
			) continue
			attempted.push(s)
			autoAttemptedRef.current[rowParamsKey] = attempted
			handleLoadSource(s)
		}
		// 主数据/来源列表/请求 key/状态变化时重新评估（attempted 防重复；
		// 失败后不自动重试——error 不被 attempted 豁免，但本 effect 只在依赖
		// 变化时运行，不会造成同一参数下无限重试）
	}, [
		data,
		sourceCurrencies,
		slowSources,
		rowParamsKey,
		handleLoadSource,
		sourceStatus,
		currencies.length,
	])

	// 交叉汇率补查：开启时，对可见货币列中"该源支持但直连缺失"的格
	// 用 getSourceMatrixRow(bfs=true) 补查过桥汇率，合并进 extraRows
	React.useEffect(() => {
		if (!crossRates) {
			crossFillRequestRef.current += 1
			crossFilledRef.current = ""
			// 关闭交叉汇率：取消进行中的 BFS 补查
			crossFillAbortRef.current?.abort()
			crossFillAbortRef.current = null
			return
		}
		if (!sourceCurrencies || Object.keys(data).length == 0) return
		if (currencies.length == 0) return
		const requestKey = rowParamsKey
		const params = `${requestKey}-${priceType}-${Object.keys(data).sort().join(",")}`
		if (crossFilledRef.current == params) return
		crossFilledRef.current = params
		const requestId = ++crossFillRequestRef.current
		crossFillAbortRef.current?.abort()
		const controller = new AbortController()
		crossFillAbortRef.current = controller
		const sources = Object.keys(data)
		;(async () => {
			for (const s of sources) {
				if (
					rowParamsRef.current != requestKey ||
					crossFillRequestRef.current != requestId ||
					crossFilledRef.current != params
				) return
				if (slowSources.includes(s)) continue
				const supported = sourceCurrencies[s] ?? []
				const missing = currencies.filter((c) => {
					if (!supported.includes(c)) return false
					if (c == from) return false
					const cell = data[s]?.[c]
					return (
						cell == undefined ||
						toNumber(cellOf(cell, priceType)) == undefined
					)
				})
				if (missing.length == 0) continue
				try {
					const row = await getSourceMatrixRow(
						s,
						supported,
						missing,
						from,
						{ amount, precision, reverse, bfs: true, signal: controller.signal }
					)
					if (
						rowParamsRef.current == requestKey &&
						crossFillRequestRef.current == requestId &&
						crossFilledRef.current == params &&
						Object.keys(row).length > 0
					) {
						mergeExtraRow(s, requestKey, row)
					}
				} catch (e) {
					// 取消（参数变化/新一轮补查/关闭交叉汇率）不视为错误
					if (!isAbortError(e)) {
						console.error(`Error cross-filling ${s}:`, e)
					}
				}
			}
		})()
		// 参数/可见货币/主数据变化时重估（crossFilledRef 防重复）
	}, [
		crossRates,
		sourceCurrencies,
		data,
		currencies,
		from,
		amount,
		precision,
		reverse,
		slowSources,
		priceType,
		rowParamsKey,
		mergeExtraRow,
	])

	// keyed 快照：extraRows 只在其记录时的参数 key 下参与合并，旧参数数据
	// 绝不渲染进新参数表格；合并按单元格字段级进行
	const displayData = React.useMemo(() => {
		if (extraRows.key != rowParamsKey) return data
		const merged: MatrixDisplayData = {}
		const sourceKeys = new Set([
			...Object.keys(extraRows.data),
			...Object.keys(data),
		])
		for (const source of sourceKeys) {
			merged[source] = mergeCellRows(extraRows.data[source], data[source])
		}
		return merged
	}, [data, extraRows, rowParamsKey])

	return {
		displayData,
		extraRows,
		sourceStatus,
		sourceError,
		handleLoadSource,
	}
}
