"use client"
import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

import {
	buildViewUrl,
	DEFAULT_PRECISION,
	MATRIX_BASE_KEY,
	MATRIX_REVERSE_KEY,
	PAIR_FROM_KEY,
	PAIR_REVERSE_KEY,
	PAIR_TO_KEY,
	parseAmount,
	parsePrecision,
	readLS,
	writeLS,
	type View,
} from "../view-utils"

// 视图导航：视图由 URL 路径驱动（/ = 单对报价，/matrix = 全对矩阵，方便分享链接）。
// 本 Hook 统一持有两个视图各自的货币/方向状态、URL → state 恢复、state → URL 同步，
// 以及 tab 切换。URL 同步用 Next.js 支持的 Native History API 原地改写，
// 不触发 RSC GET；路径切换（router.push）会取消排队中的 query 写入。
export function useViewNavigation() {
	const searchParams = useSearchParams()
	const router = useRouter()
	const pathname = usePathname()
	const initialIsMatrix = pathname == "/matrix"
	const initialUrlFrom = searchParams.get("from")
	const initialUrlTo = searchParams.get("to")
	const initialMatrixReverse =
		initialIsMatrix && initialUrlFrom == null && initialUrlTo != null

	const [pairFrom, setPairFrom] = React.useState(
		initialIsMatrix ? "CNY" : initialUrlFrom ?? "CNY"
	)
	const [pairTo, setPairTo] = React.useState(
		initialIsMatrix ? "USD" : initialUrlTo ?? "USD"
	)
	const [pairReverse, setPairReverse] = React.useState(false)
	const [matrixBase, setMatrixBase] = React.useState(
		initialIsMatrix
			? (initialMatrixReverse ? initialUrlTo : initialUrlFrom) ?? "CNY"
			: initialUrlFrom ?? "CNY"
	)
	const [matrixReverse, setMatrixReverse] = React.useState(initialMatrixReverse)
	const matrixStateInitializedRef = React.useRef(initialIsMatrix)
	const [amount, setAmount] = React.useState(
		parseAmount(searchParams.get("amount"))
	)
	// URL 精度：null 表示 URL 未指定，由精度偏好（localStorage）兜底
	const [urlPrecision, setUrlPrecision] = React.useState(
		parsePrecision(searchParams.get("precision"))
	)
	const [pairPreferencesHydrated, setPairPreferencesHydrated] =
		React.useState(false)
	const [matrixPreferencesHydrated, setMatrixPreferencesHydrated] =
		React.useState(false)

	// 点击 tab 先本地立即切换视图，URL 由 router.push 后台同步：
	// 避免等待 RSC 导航（服务端预取可能要数秒）完成才响应，导致界面"卡住"
	const [viewOverride, setViewOverride] = React.useState<View | null>(null)
	const view: View =
		viewOverride ?? (pathname == "/matrix" ? "matrix" : "pair")
	const pendingUrlTimerRef = React.useRef<ReturnType<
		typeof setTimeout
	> | null>(null)
	const urlWriteGenerationRef = React.useRef(0)
	// 推进代际并清掉排队中的 query 写入：路径切换与离开页面时调用，
	// 防止旧 pathname 下排队的 replace 覆盖新路径
	const cancelPendingUrlWrite = React.useCallback(() => {
		urlWriteGenerationRef.current++
		if (pendingUrlTimerRef.current != null) {
			clearTimeout(pendingUrlTimerRef.current)
			pendingUrlTimerRef.current = null
		}
	}, [])

	// 切换视图：本地先立即切换，router.push 后台同步路径。目标查询只取当前
	// React 状态；首次进入矩阵时以当前 pair 基准初始化，之后恢复矩阵自己的基准与方向。
	const setView = (nextView: View) => {
		if (nextView == view) return
		cancelPendingUrlWrite()
		let targetMatrixBase = matrixBase
		let targetMatrixReverse = matrixReverse
		if (nextView == "matrix" && !matrixStateInitializedRef.current) {
			targetMatrixBase = pairFrom
			targetMatrixReverse = false
			matrixStateInitializedRef.current = true
			setMatrixBase(targetMatrixBase)
			setMatrixReverse(false)
		}
		setViewOverride(nextView)
		const nextUrl = buildViewUrl(
			nextView,
			pairFrom,
			pairTo,
			targetMatrixBase,
			targetMatrixReverse,
			amount,
			urlPrecision ?? DEFAULT_PRECISION
		)
		router.push(nextUrl, {
			scroll: false,
		})
	}

	// pathname 变化（RSC 导航完成 / 浏览器前进后退）后：与用户最后意图一致则保留本地视图，
	// 否则交还 pathname 决定（防止快速连续切换时视图闪跳）
	React.useEffect(() => {
		/* eslint-disable react-hooks/set-state-in-effect -- synchronizes URL navigation state */
		setViewOverride((prev) => {
			const expected: View = pathname == "/matrix" ? "matrix" : "pair"
			return prev == expected ? prev : null
		})
		/* eslint-enable react-hooks/set-state-in-effect */
	}, [pathname])

	// URL 变化（含前进/后退与 Native History API 写入）只恢复当前路径所属状态。
	// 矩阵 URL 不得覆盖单对货币与方向偏好，反之亦然。
	React.useEffect(() => {
		/* eslint-disable react-hooks/set-state-in-effect -- URL is an external source of truth */
		const urlFrom = searchParams.get("from")
		const urlTo = searchParams.get("to")
		setAmount(parseAmount(searchParams.get("amount")))
		setUrlPrecision(parsePrecision(searchParams.get("precision")))
		if (pathname == "/matrix") {
			const nextReverse = urlFrom == null && urlTo != null
			setMatrixBase((nextReverse ? urlTo : urlFrom) ?? "CNY")
			setMatrixReverse(nextReverse)
			matrixStateInitializedRef.current = true
		} else {
			setPairFrom(urlFrom ?? "CNY")
			setPairTo(urlTo ?? "USD")
		}
		/* eslint-enable react-hooks/set-state-in-effect */
	}, [pathname, searchParams])

	// 非当前视图只能从自己的存档恢复；当前路径的 URL 始终优先。
	React.useEffect(() => {
		/* eslint-disable react-hooks/set-state-in-effect -- localStorage hydration */
		const savedReverse = readLS(PAIR_REVERSE_KEY)
		setPairReverse(savedReverse == "1" || savedReverse == "true")
		if (initialIsMatrix) {
			const savedFrom = readLS(PAIR_FROM_KEY)
			const savedTo = readLS(PAIR_TO_KEY)
			if (savedFrom) setPairFrom(savedFrom)
			if (savedTo) setPairTo(savedTo)
		}
		setPairPreferencesHydrated(true)
		/* eslint-enable react-hooks/set-state-in-effect */
	}, [initialIsMatrix])

	React.useEffect(() => {
		/* eslint-disable react-hooks/set-state-in-effect -- localStorage hydration */
		if (!initialIsMatrix) {
			const savedBase = readLS(MATRIX_BASE_KEY)
			if (savedBase) {
				setMatrixBase(savedBase)
				setMatrixReverse(readLS(MATRIX_REVERSE_KEY) == "1")
				matrixStateInitializedRef.current = true
			}
		}
		setMatrixPreferencesHydrated(true)
		/* eslint-enable react-hooks/set-state-in-effect */
	}, [initialIsMatrix])

	// 仅由单对视图持久化 pair 状态，矩阵 URL/state 永远不会写入这些 key。
	React.useEffect(() => {
		if (!pairPreferencesHydrated || view != "pair" || pathname != "/") return
		writeLS(PAIR_FROM_KEY, pairFrom)
		writeLS(PAIR_TO_KEY, pairTo)
		writeLS(PAIR_REVERSE_KEY, pairReverse ? "1" : "0")
	}, [pairFrom, pairTo, pairReverse, pairPreferencesHydrated, view, pathname])

	// 矩阵基准与方向使用独立存档，保证跨 page 重建后仍可恢复。
	React.useEffect(() => {
		if (
			!matrixPreferencesHydrated ||
			view != "matrix" ||
			pathname != "/matrix"
		) return
		writeLS(MATRIX_BASE_KEY, matrixBase)
		writeLS(MATRIX_REVERSE_KEY, matrixReverse ? "1" : "0")
	}, [matrixBase, matrixReverse, matrixPreferencesHydrated, view, pathname])

	return {
		view,
		setView,
		pathname,
		searchParams,
		router,
		cancelPendingUrlWrite,
		pendingUrlTimerRef,
		urlWriteGenerationRef,
		pairFrom,
		setPairFrom,
		pairTo,
		setPairTo,
		pairReverse,
		setPairReverse,
		matrixBase,
		setMatrixBase,
		matrixReverse,
		setMatrixReverse,
		amount,
		setAmount,
		urlPrecision,
	}
}

export type ViewNavigation = ReturnType<typeof useViewNavigation>
