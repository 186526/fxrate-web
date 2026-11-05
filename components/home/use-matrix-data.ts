"use client"
import * as React from "react"

import { getRatesMatrix, isAbortError, SLOW_SOURCES, type RatesMatrix } from "../tools"
import {
	matrixViewCacheKey,
	visibleSnapshot,
	type View,
} from "../view-utils"

interface MatrixSnapshot {
	key: string
	data: RatesMatrix
	reverse: boolean
	fetchedAt: Date
}

// 矩阵视图数据：keyed 快照 + SWR 缓存 + 代际守卫 + 视图级 AbortController，
// 与单对视图完全独立（错误、加载态、取消互不影响）。
export function useMatrixData({
	currencies,
	view,
	matrixBase,
	matrixReverse,
	amount,
	precision,
	initialMatrix,
}: {
	currencies: { [source: string]: string[] } | null
	view: View
	matrixBase: string
	matrixReverse: boolean
	amount: number
	precision: number
	initialMatrix?: RatesMatrix | null
}) {
	const activeMatrixKey = matrixViewCacheKey(
		matrixBase,
		amount,
		precision,
		matrixReverse
	)
	const activeMatrixKeyRef = React.useRef(activeMatrixKey)
	React.useEffect(() => {
		activeMatrixKeyRef.current = activeMatrixKey
	}, [activeMatrixKey])

	const matrixReqRef = React.useRef(0)
	const matrixAbortRef = React.useRef<AbortController | null>(null)

	// 服务端/调用方传入的初始矩阵视为本次挂载时已取得；同一 Date 复用于
	// cache/snapshot，避免两个容器的更新时间产生毫秒级偏差。
	const initialSnapshot = React.useMemo<MatrixSnapshot | null>(
		() =>
			initialMatrix
				? {
						key: activeMatrixKey,
						data: initialMatrix,
						reverse: matrixReverse,
						fetchedAt: new Date(),
				  }
				: null,
		// 初始矩阵只在挂载时使用；key 取挂载时的参数
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	)
	const matrixCacheRef = React.useRef<MatrixSnapshot | null>(initialSnapshot)
	const [matrixSnapshot, setMatrixSnapshot] =
		React.useState<MatrixSnapshot | null>(initialSnapshot)
	const [matrix, setMatrix] = React.useState<RatesMatrix | null>(
		initialSnapshot?.data ?? null
	)
	const [matrixLoading, setMatrixLoading] = React.useState(
		view == "matrix" && !initialMatrix
	)
	const [matrixError, setMatrixError] = React.useState<string | null>(null)
	// 主矩阵手动刷新时递增，使额外行绕过旧代际并重新请求
	const [matrixExtraRowsGeneration, setMatrixExtraRowsGeneration] =
		React.useState(0)

	// currencies 只在真正发起请求时读取：把它放进 fetchMatrix 依赖会让货币列表
	// 到达（薄壳 /matrix 挂载后异步拉取）换掉 fetchMatrix 引用，重排防抖计时器、
	// 重建 60s 自动刷新 interval，并让 effect 重跑。请求参数本身不依赖 currencies。
	const currenciesRef = React.useRef(currencies)
	React.useEffect(() => {
		currenciesRef.current = currencies
	}, [currencies])

	const fetchMatrix = React.useCallback(
		(force: boolean) => {
			const currencies = currenciesRef.current
			if (!currencies) return
			const reqId = ++matrixReqRef.current
			matrixAbortRef.current?.abort()
			const controller = new AbortController()
			matrixAbortRef.current = controller
			setMatrixError(null)
			const key = matrixViewCacheKey(
				matrixBase,
				amount,
				precision,
				matrixReverse
			)
			const cached = matrixCacheRef.current
			if (cached && cached.key == key) {
				setMatrix(cached.data)
				setMatrixLoading(false)
			} else {
				setMatrixLoading(true)
			}
			getRatesMatrix(currencies, matrixBase, {
				amount,
				precision,
				force,
				reverse: matrixReverse,
				skipSources: SLOW_SOURCES,
				signal: controller.signal,
			})
				.then((data) => {
					if (
						reqId == matrixReqRef.current &&
						activeMatrixKeyRef.current == key
					) {
						const fetchedAt = new Date()
						matrixCacheRef.current = {
							key,
							data,
							reverse: matrixReverse,
							fetchedAt,
						}
						setMatrixSnapshot({
							key,
							data,
							reverse: matrixReverse,
							fetchedAt,
						})
						setMatrix(data)
						setMatrixLoading(false)
						setMatrixError(null)
					}
				})
				.catch((e) => {
					// 取消（参数/视图变化/新请求接管）不视为失败，不触碰错误/加载状态
					if (isAbortError(e)) return
					if (
						reqId == matrixReqRef.current &&
						activeMatrixKeyRef.current == key
					) {
						setMatrixLoading(false)
						setMatrixError(
							e instanceof Error ? e.message : "加载矩阵失败，请稍后重试"
						)
					}
				})
		},
		[matrixBase, amount, precision, matrixReverse]
	)

	// 参数/视图变化时立即作废矩阵进行中的请求代际，防止陈旧响应
	// （旧基准/金额/精度/方向请求在 300ms 防抖窗口内完成）落地
	// 污染 matrixCacheRef/matrix/matrixSnapshot/loading/error；
	// 同时 abort 在途请求（与单对视图独立，互不影响）
	React.useEffect(() => {
		/* eslint-disable react-hooks/set-state-in-effect -- clearing stale request error */
		matrixReqRef.current++
		matrixAbortRef.current?.abort()
		matrixAbortRef.current = null
		setMatrixError(null)
		/* eslint-enable react-hooks/set-state-in-effect */
	}, [view, matrixBase, amount, precision, matrixReverse])

	// 依赖 currencies 只为判断「是否已有货币列表」：挂载后货币列表到达时补跑一次。
	// fetchMatrix 已不随 currencies 变化，currencies 到达不会重排计时器
	React.useEffect(() => {
		if (view != "matrix" || !currencies) return
		// 切回本视图时立即恢复上次数据，不等防抖，避免白屏
		const cached = matrixCacheRef.current
		if (cached && cached.key == activeMatrixKey) {
			setMatrix(cached.data)
			setMatrixLoading(false)
		} else {
			// 从单对视图首次切入矩阵时，fetchMatrix 尚在 300ms 防抖窗口；
			// 立即进入加载态，避免短暂闪出“暂无矩阵数据”。
			setMatrixLoading(true)
		}
		const timer = setTimeout(() => fetchMatrix(false), 300)
		return () => clearTimeout(timer)
	}, [view, currencies, activeMatrixKey, fetchMatrix])

	// 矩阵自动刷新与单对视图保持一致：仅页面可见时每 60s 强制重拉。
	React.useEffect(() => {
		if (!currencies || view != "matrix") return
		const interval = setInterval(() => {
			if (document.visibilityState != "visible") return
			fetchMatrix(true)
		}, 60000)
		return () => clearInterval(interval)
	}, [currencies, fetchMatrix, view])

	const visibleMatrixSnapshot = visibleSnapshot(
		matrixSnapshot,
		activeMatrixKey
	)
	const visibleMatrix = visibleMatrixSnapshot?.data ?? null
	const visibleMatrixLoading =
		matrixLoading ||
		(view == "matrix" && matrix != null && visibleMatrix == null)

	// 手动刷新：主矩阵强刷，同时推进额外行代际
	const refresh = () => {
		setMatrixExtraRowsGeneration((generation) => generation + 1)
		fetchMatrix(true)
	}

	// 卸载清理依赖稳定引用，理由同 usePairData
	const abort = React.useCallback(() => {
		matrixAbortRef.current?.abort()
	}, [])

	return {
		activeMatrixKey,
		matrix,
		matrixError,
		fetchMatrix,
		refresh,
		visibleMatrix,
		visibleMatrixSnapshot,
		visibleMatrixLoading,
		matrixExtraRowsGeneration,
		abort,
	}
}
