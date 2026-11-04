"use client"
import * as React from "react"

import Footer from "../footer"
import IndexContent from "../index-content"
import type { FXListProps } from "../shared"
import type { RatesMatrix } from "../tools"
import {
	buildViewUrl,
	hasMatrixQuotes,
	hasPairQuotes,
	latestPairUpdated,
} from "../view-utils"
import Header from "./header"
import StatusBar from "./status-bar"
import { useCrossRates, usePrecision } from "./use-precision"
import { useCurrencies } from "./use-currencies"
import { useMatrixData } from "./use-matrix-data"
import { usePairData } from "./use-pair-data"
import { useViewNavigation } from "./use-view-navigation"

export interface HomeProps {
	buildId: string
	buildTime: string
	version: string
	initialCurrencies?: { [source: string]: string[] } | null
	initialResult?: (Omit<FXListProps, "updated"> & { updated: string })[] | null
	initialMatrix?: RatesMatrix | null
	initialBackendVersion?: string
}

// 首页编排组件：只负责把导航、数据、偏好 Hook 的结果接到 Header / 内容区 / Footer，
// 具体状态与副作用分别在 components/home/ 的各 Hook 中。
export default function Home({
	buildId,
	buildTime,
	version,
	initialCurrencies,
	initialResult,
	initialMatrix,
	initialBackendVersion,
}: HomeProps) {
	const [crossRates, setCrossRates] = useCrossRates()
	const { precision, precisionHydrated, setPrecision, resetPrecision } =
		usePrecision()
	const navigation = useViewNavigation()
	const {
		view,
		pathname,
		router,
		cancelPendingUrlWrite,
		pairFrom,
		pairTo,
		pairReverse,
		matrixBase,
		matrixReverse,
		amount,
		setPairFrom,
		setPairTo,
		setMatrixBase,
		setMatrixReverse,
		setPairReverse,
		setAmount,
		setView,
		urlPrecision,
	} = navigation
	// URL 的 ?precision= 优先于 localStorage 偏好；URL 未指定时用偏好
	const effectivePrecision = urlPrecision ?? precision
	const { currencies, allCurrencies, loadError, retry, backendVersion } =
		useCurrencies({ initialCurrencies, initialBackendVersion })

	const pair = usePairData({
		currencies,
		view,
		pairFrom,
		pairTo,
		pairReverse,
		amount,
		precision: effectivePrecision,
		crossRates,
		initialResult,
	})
	const matrix = useMatrixData({
		currencies,
		view,
		matrixBase,
		matrixReverse,
		amount,
		precision: effectivePrecision,
		initialMatrix,
	})

	// 查询参数变化用 Native History API 原地同步，不触发 RSC GET。
	// 仅在 pathname 与当前视图一致时排队；路径切换会取消 timer 并推进代际。
	// 精度未从存储读回前不写 URL，避免把默认精度写进链接。
	const { pendingUrlTimerRef, urlWriteGenerationRef } = navigation
	React.useEffect(() => {
		if (!precisionHydrated) return
		const scheduledPath = view == "matrix" ? "/matrix" : "/"
		if (pathname != scheduledPath) return
		const nextUrl = buildViewUrl(
			view,
			pairFrom,
			pairTo,
			matrixBase,
			matrixReverse,
			amount,
			effectivePrecision
		)
		const generation = ++urlWriteGenerationRef.current
		const generationRef = urlWriteGenerationRef
		if (pendingUrlTimerRef.current != null) {
			clearTimeout(pendingUrlTimerRef.current)
		}
		const timer = setTimeout(() => {
			if (pendingUrlTimerRef.current == timer) {
				pendingUrlTimerRef.current = null
			}
			if (generationRef.current != generation) return
			if (window.location.pathname != scheduledPath) return
			const current = window.location.pathname + window.location.search
			if (current == nextUrl) return
			window.history.replaceState(window.history.state, "", nextUrl)
		}, 300)
		pendingUrlTimerRef.current = timer
		return () => {
			if (pendingUrlTimerRef.current == timer) {
				clearTimeout(timer)
				pendingUrlTimerRef.current = null
			}
			if (generationRef.current == generation) {
				generationRef.current++
			}
		}
	}, [
		view,
		pairFrom,
		pairTo,
		matrixBase,
		matrixReverse,
		amount,
		effectivePrecision,
		precisionHydrated,
		pathname,
		pendingUrlTimerRef,
		urlWriteGenerationRef,
	])

	// 卸载时取消仍在途的请求（路由切换/组件卸载），避免陈旧响应落地与网络浪费
	const abortPair = pair.abort
	const abortMatrix = matrix.abort
	React.useEffect(() => {
		return () => {
			abortPair()
			abortMatrix()
		}
	}, [abortPair, abortMatrix])

	const activeViewError = view == "pair" ? pair.pairError : matrix.matrixError
	const hasVisibleData =
		view == "pair"
			? hasPairQuotes(pair.visiblePair)
			: hasMatrixQuotes(matrix.visibleMatrix)
	const lastUpdated =
		view == "matrix"
			? matrix.visibleMatrixSnapshot?.fetchedAt ?? null
			: latestPairUpdated(pair.visiblePair)

	const handleSwap = () => {
		setPairFrom(pairTo)
		setPairTo(pairFrom)
	}

	// 两个视图各自切换金额方向，不改写对方的方向偏好。
	const handleReverseToggle = () => {
		if (view == "matrix") {
			setMatrixReverse((value) => !value)
		} else {
			setPairReverse((value) => !value)
		}
	}

	const handleRefresh = () => {
		if (view == "matrix") {
			matrix.refresh()
		} else {
			pair.fetchPair(true)
		}
	}

	const handleOpenApiDocs = () => {
		cancelPendingUrlWrite()
		router.push("/api-docs")
	}

	return (
		<>
			<Header
				view={view}
				onViewChange={setView}
				sourceCount={currencies ? Object.keys(currencies).length : null}
				lastUpdated={lastUpdated}
				precision={effectivePrecision}
				onPrecisionChange={setPrecision}
				onPrecisionReset={resetPrecision}
				crossRates={crossRates}
				onCrossRatesToggle={() => setCrossRates((value) => !value)}
				onRefresh={handleRefresh}
				onOpenApiDocs={handleOpenApiDocs}
			/>
			<IndexContent
				view={view}
				currencies={currencies}
				allCurrencies={allCurrencies}
				pairFrom={pairFrom}
				pairTo={pairTo}
				pairReqFrom={pair.pairReqFrom}
				pairReqTo={pair.pairReqTo}
				pairReverse={pairReverse}
				matrixBase={matrixBase}
				matrixReverse={matrixReverse}
				amount={amount}
				precision={effectivePrecision}
				crossRates={crossRates}
				result={pair.result}
				matrix={matrix.matrix}
				visiblePair={pair.visiblePair}
				visibleMatrix={matrix.visibleMatrix}
				visiblePairLoading={pair.visiblePairLoading}
				visibleMatrixLoading={matrix.visibleMatrixLoading}
				pairError={pair.pairError}
				matrixError={matrix.matrixError}
				loadError={loadError}
				setCurrenciesLoadAttempt={retry}
				setPairFrom={setPairFrom}
				setPairTo={setPairTo}
				setMatrixBase={setMatrixBase}
				setAmount={setAmount}
				handleSwap={handleSwap}
				handleReverseToggle={handleReverseToggle}
				fetchPair={pair.fetchPair}
				fetchMatrix={matrix.fetchMatrix}
				matrixExtraRowsGeneration={matrix.matrixExtraRowsGeneration}
			/>
			<StatusBar
				error={activeViewError}
				hasVisibleData={hasVisibleData}
				onRetry={() =>
					view == "pair" ? pair.fetchPair(true) : matrix.fetchMatrix(true)
				}
			/>
			<Footer
				buildId={buildId}
				buildTime={buildTime}
				version={version}
				backendVersion={backendVersion}
			/>
		</>
	)
}
