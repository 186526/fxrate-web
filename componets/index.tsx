"use client"
import * as React from "react"

import { useSearchParams, useRouter, usePathname } from "next/navigation"

import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Tabs from "@mui/material/Tabs"
import Tab from "@mui/material/Tab"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import Alert from "@mui/material/Alert"
import Button from "@mui/material/Button"
import Skeleton from "@mui/material/Skeleton"
import LinearProgress from "@mui/material/LinearProgress"
import RefreshIcon from "@mui/icons-material/Refresh"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import TuneIcon from "@mui/icons-material/Tune"
import DarkModeIcon from "@mui/icons-material/DarkMode"
import LightModeIcon from "@mui/icons-material/LightMode"
import MenuBookIcon from "@mui/icons-material/MenuBook"
import MenuItem from "@mui/material/MenuItem"
import Menu from "@mui/material/Menu"
import TextField from "@mui/material/TextField"
import { alpha, useTheme } from "@mui/material/styles"

import CurrencyChooser from "./currencyChooser"
import FXListGrid, { FXListProps, RelativeTime } from "./fxlistgrid"
import FXMatrixGrid from "./fxmatrixgrid"
import Footer from "./footer"
import {
	showCurrencyAllRates,
	getCurrenciesDetails,
	getRatesMatrix,
	FXRate,
	RatesMatrix,
	SLOW_SOURCES,
	withTimeout,
} from "./tools"
import { useThemeMode } from "./theme"
import { infoResponse } from "@/lib/fxrate/src/client"

type View = "pair" | "matrix"

const parsePrecision = (value: string | null): number | null => {
	if (value == null) return null
	const precision = Number(value)
	return Number.isInteger(precision) && precision >= -1 && precision <= 6
		? precision
		: null
}

const buildViewUrl = (
	view: View,
	pairFrom: string,
	pairTo: string,
	matrixBase: string,
	matrixReverse: boolean,
	amount: number,
	precision: number
): string => {
	const params = new URLSearchParams()
	if (view == "matrix") {
		params.set(matrixReverse ? "to" : "from", matrixBase)
	} else {
		params.set("from", pairFrom)
		params.set("to", pairTo)
	}
	params.set("amount", String(amount))
	params.set("precision", String(precision))
	return `${view == "matrix" ? "/matrix" : "/"}?${params.toString()}`
}

const pairViewCacheKey = (
	from: string,
	to: string,
	amount: number,
	precision: number,
	bfs: boolean
): string => `${from}-${to}-${amount}-p${precision}${bfs ? "-bfs" : ""}`

const matrixViewCacheKey = (
	base: string,
	amount: number,
	precision: number,
	reverse: boolean
): string =>
	`${base}-${amount}-p${precision}-${reverse ? "reverse" : "forward"}`

// 视图记忆 localStorage keys：pair 记忆（from/to + reverse）与 matrix 记忆（基准/方向）分离，
// 各自仅在本视图路径写入，pair↔matrix 往返时互不重置；矩阵 URL 的 to 是基准货币，
// 不得污染 pair 目标货币
const PAIR_FROM_KEY = "fxrate-pair-from"
const PAIR_TO_KEY = "fxrate-pair-to"
const PAIR_REVERSE_KEY = "fxrate-reverse"
const MATRIX_BASE_KEY = "fxrate-matrix-base"
const MATRIX_REVERSE_KEY = "fxrate-matrix-reverse"

const readLS = (key: string): string | null => {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

const writeLS = (key: string, value: string): void => {
	try {
		localStorage.setItem(key, value)
	} catch {
		// localStorage 不可用时忽略持久化
	}
}

export default function Index({
	buildId,
	buildTime,
	version,
	initialCurrencies,
	initialResult,
	initialMatrix,
	initialBackendVersion,
}: {
	buildId: string
	buildTime: string
	version: string
	initialCurrencies?: { [source: string]: string[] } | null
	initialResult?: (Omit<FXListProps, "updated"> & { updated: string })[] | null
	initialMatrix?: RatesMatrix | null
	initialBackendVersion?: string
}) {
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
	const [matrixReverse, setMatrixReverse] = React.useState(
		initialMatrixReverse
	)
	const matrixStateInitializedRef = React.useRef(initialIsMatrix)
	const [amount, setAmount] = React.useState(
		Number(searchParams.get("amount")) || 100
	)
	const [precision, setPrecision] = React.useState(
		parsePrecision(searchParams.get("precision")) ?? 4
	)
	const [precisionHydrated, setPrecisionHydrated] = React.useState(false)
	const [pairPreferencesHydrated, setPairPreferencesHydrated] =
		React.useState(false)
	const [matrixPreferencesHydrated, setMatrixPreferencesHydrated] =
		React.useState(false)

	// 视图由 URL 路径驱动：/ = 单对报价，/matrix = 全对矩阵（方便分享链接）
	// 点击 tab 先本地立即切换视图，URL 由 router.push 后台同步：
	// 避免等待 RSC 导航（服务端预取可能要数秒）完成才响应，导致界面"卡住"
	const [viewOverride, setViewOverride] = React.useState<View | null>(null)
	const view: View =
		viewOverride ?? (pathname == "/matrix" ? "matrix" : "pair")
	const pendingUrlTimerRef = React.useRef<ReturnType<
		typeof setTimeout
	> | null>(null)
	const urlWriteGenerationRef = React.useRef(0)
	const cancelPendingUrlWrite = React.useCallback(() => {
		urlWriteGenerationRef.current++
		if (pendingUrlTimerRef.current != null) {
			clearTimeout(pendingUrlTimerRef.current)
			pendingUrlTimerRef.current = null
		}
	}, [])

	// 切换视图：本地先立即切换，router.push 后台同步路径（RSC 导航可能耗时数秒，
	// 先响应避免界面"卡住"）。目标查询只取当前 React 状态；首次进入矩阵时以
	// 当前 pair 基准初始化，之后恢复矩阵自己的基准与方向。
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
			precision
		)
		router.push(nextUrl, {
			scroll: false,
		})
	}

	// pathname 变化（RSC 导航完成 / 浏览器前进后退）后：与用户最后意图一致则保留本地视图，
	// 否则交还 pathname 决定（防止快速连续切换时视图闪跳）
	React.useEffect(() => {
		setViewOverride((prev) => {
			const expected: View = pathname == "/matrix" ? "matrix" : "pair"
			return prev == expected ? prev : null
		})
	}, [pathname])

	// URL 变化（含前进/后退与 Native History API 写入）只恢复当前路径所属状态。
	// 矩阵 URL 不得覆盖单对货币与方向偏好，反之亦然。
	React.useEffect(() => {
		const urlFrom = searchParams.get("from")
		const urlTo = searchParams.get("to")
		setAmount(Number(searchParams.get("amount")) || 100)
		setPrecision(parsePrecision(searchParams.get("precision")) ?? 4)
		if (pathname == "/matrix") {
			const nextReverse = urlFrom == null && urlTo != null
			setMatrixBase((nextReverse ? urlTo : urlFrom) ?? "CNY")
			setMatrixReverse(nextReverse)
			matrixStateInitializedRef.current = true
		} else {
			setPairFrom(urlFrom ?? "CNY")
			setPairTo(urlTo ?? "USD")
		}
	}, [pathname, searchParams])

	const PRECISION_KEY = "fxrate-precision"

	React.useEffect(() => {
		if (!searchParams.has("precision")) {
			try {
				const saved = localStorage.getItem(PRECISION_KEY)
				if (saved) {
					const savedPrecision = parsePrecision(saved)
					if (savedPrecision != null) setPrecision(savedPrecision)
				}
			} catch {
				// localStorage 不可用时使用默认精度
			}
		}
		setPrecisionHydrated(true)
	}, [])

	React.useEffect(() => {
		if (!precisionHydrated) return
		try {
			localStorage.setItem(PRECISION_KEY, String(precision))
		} catch {
			// localStorage 不可用时忽略持久化
		}
	}, [precision, precisionHydrated])

	const [currencies, setCurrencies] = React.useState<{
		[source: string]: string[]
	} | null>(initialCurrencies ?? null)
	const [result, setResult] = React.useState<FXListProps[] | null>(
		initialResult
			? initialResult.map((r) => ({
					...r,
					updated: new Date(r.updated),
			  }))
			: null
	)
	const [matrix, setMatrix] = React.useState<RatesMatrix | null>(
		initialMatrix ?? null
	)
	// 矩阵数据拉取时间：header"更新于"在矩阵视图下显示矩阵数据的新鲜度
	const [matrixFetchedAt, setMatrixFetchedAt] = React.useState<Date | null>(
		null
	)
	const [loading, setLoading] = React.useState(!initialResult)
	const [matrixLoading, setMatrixLoading] = React.useState(
		view == "matrix" && !initialMatrix
	)
	const [matrixExtraRowsGeneration, setMatrixExtraRowsGeneration] =
		React.useState(0)
	// 全局加载错误（货币列表等基础设施）与视图级错误（单对/矩阵拉取）分离，
	// 避免一个视图的失败污染另一个视图的显示
	const [loadError, setLoadError] = React.useState<string | null>(null)
	const [pairError, setPairError] = React.useState<string | null>(null)
	const [matrixError, setMatrixError] = React.useState<string | null>(null)
	const [backendVersion, setBackendVersion] = React.useState(
		initialBackendVersion ?? ""
	)

	// 交叉汇率开关：开启后单对视图请求带 bfs=true，无直连报价时经中间货币折算
	const CROSS_KEY = "fxrate-cross-rates"
	const [crossRates, setCrossRates] = React.useState(false)
	// hydration 门闩：读档前持久化 effect 不得写回，避免 StrictMode 双执行下用默认值覆盖存档
	const [crossHydrated, setCrossHydrated] = React.useState(false)
	// 移动端精度弹层锚点
	const [precisionAnchor, setPrecisionAnchor] =
		React.useState<HTMLElement | null>(null)

	React.useEffect(() => {
		try {
			const saved = localStorage.getItem(CROSS_KEY)
			if (saved == "1" || saved == "true") setCrossRates(true)
		} catch {
			// localStorage 不可用时保持默认关闭
		}
		setCrossHydrated(true)
	}, [])

	// 提交后持久化：仅在 hydration 完成后写回，事件处理器不再触碰 localStorage
	React.useEffect(() => {
		if (!crossHydrated) return
		try {
			localStorage.setItem(CROSS_KEY, crossRates ? "1" : "0")
		} catch {
			// localStorage 不可用时忽略持久化
		}
	}, [crossRates, crossHydrated])

	// 非当前视图只能从自己的存档恢复；当前路径的 URL 始终优先。
	React.useEffect(() => {
		const savedReverse = readLS(PAIR_REVERSE_KEY)
		setPairReverse(savedReverse == "1" || savedReverse == "true")
		if (initialIsMatrix) {
			const savedFrom = readLS(PAIR_FROM_KEY)
			const savedTo = readLS(PAIR_TO_KEY)
			if (savedFrom) setPairFrom(savedFrom)
			if (savedTo) setPairTo(savedTo)
		}
		setPairPreferencesHydrated(true)
	}, [])

	React.useEffect(() => {
		if (!initialIsMatrix) {
			const savedBase = readLS(MATRIX_BASE_KEY)
			if (savedBase) {
				setMatrixBase(savedBase)
				setMatrixReverse(readLS(MATRIX_REVERSE_KEY) == "1")
				matrixStateInitializedRef.current = true
			}
		}
		setMatrixPreferencesHydrated(true)
	}, [])

	// 仅由单对视图持久化 pair 状态，矩阵 URL/state 永远不会写入这些 key。
	React.useEffect(() => {
		if (!pairPreferencesHydrated || view != "pair" || pathname != "/") return
		writeLS(PAIR_FROM_KEY, pairFrom)
		writeLS(PAIR_TO_KEY, pairTo)
		writeLS(PAIR_REVERSE_KEY, pairReverse ? "1" : "0")
	}, [
		pairFrom,
		pairTo,
		pairReverse,
		pairPreferencesHydrated,
		view,
		pathname,
	])

	// 矩阵基准与方向使用独立存档，保证跨 page 重建后仍可恢复。
	React.useEffect(() => {
		if (
			!matrixPreferencesHydrated ||
			view != "matrix" ||
			pathname != "/matrix"
		) return
		writeLS(MATRIX_BASE_KEY, matrixBase)
		writeLS(MATRIX_REVERSE_KEY, matrixReverse ? "1" : "0")
	}, [
		matrixBase,
		matrixReverse,
		matrixPreferencesHydrated,
		view,
		pathname,
	])

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
	const matrixReqRef = React.useRef(0)
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

	// 视图数据缓存（stale-while-revalidate）：切换视图先渲染上次数据再后台刷新，避免白屏
	const pairCacheRef = React.useRef<{
		key: string
		data: FXListProps[]
	} | null>(
		initialResult
			? {
					key: activePairKey,
					data: initialResult.map((r) => ({
						...r,
						updated: new Date(r.updated),
					})),
			  }
			: null
	)
	const matrixCacheRef = React.useRef<{
		key: string
		data: RatesMatrix
		reverse: boolean
	} | null>(
		initialMatrix
			? {
					key: matrixViewCacheKey(
						matrixBase,
						amount,
						precision,
						matrixReverse
					),
					data: initialMatrix,
					reverse: matrixReverse,
			  }
			: null
	)

	// 可见数据快照（keyed state）：渲染只读 state 快照，不读 cache ref（react-hooks/refs）；
	// 快照与 cache ref 每次写入保持同步，SWR 门控语义不变
	const [pairSnapshot, setPairSnapshot] = React.useState<{
		key: string
		data: FXListProps[]
	} | null>(
		initialResult
			? {
					key: activePairKey,
					data: initialResult.map((r) => ({
						...r,
						updated: new Date(r.updated),
					})),
			  }
			: null
	)
	const [matrixSnapshot, setMatrixSnapshot] = React.useState<{
		key: string
		data: RatesMatrix
		reverse: boolean
	} | null>(
		initialMatrix
			? {
					key: matrixViewCacheKey(
						matrixBase,
						amount,
						precision,
						matrixReverse
					),
					data: initialMatrix,
					reverse: matrixReverse,
			  }
			: null
	)

	// 挂载：拉取来源货币列表与后端版本（薄壳下无 SSR 预取，全部由客户端负责）
	React.useEffect(() => {
		if (initialCurrencies) return
		let cancelled = false
		;(async () => {
			try {
				// info() 须在 showCurrencyAllRates 之后串行（后者内部开启 batch，
				// 并行的 info() 会被吞进批量队列拿不到结果）
				// 5s 超时降级：慢源（上游抓取 30s 超时）不应拖住首屏
				const cur = await withTimeout(
					showCurrencyAllRates(),
					5000
				)
				if (cancelled) return
				if (!cur) {
					if (!cancelled) setLoadError("数据加载超时，请稍后刷新重试")
					return
				}
				const info = await withTimeout(
					Promise.resolve(FXRate.info()),
					5000
				)
				if (cancelled) return
				setCurrencies(cur)
				if (info) setBackendVersion((info as infoResponse).version)
				setLoadError(null)
			} catch (e) {
				if (!cancelled) {
					setLoadError(
						e instanceof Error ? e.message : "加载数据失败，请稍后重试"
					)
				}
			}
		})()
		return () => {
			cancelled = true
		}
	}, [])

	const allCurrencies = React.useMemo(() => {
		if (!currencies) return []
		return Array.from(new Set(Object.values(currencies).flat()))
	}, [currencies])

	const fetchPair = React.useCallback(
		(force: boolean) => {
			if (!currencies) return
			const reqId = ++pairReqRef.current
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
						// 仅保留旧慢源行兜底（慢源后台批未归或失败时仍显示上次数据）
						for (const row of existing) {
							if (SLOW_SOURCES.has(row.name)) {
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
				{ amount, precision, force, bfs: crossRates }
			).catch((e) => {
				if (
					reqId == pairReqRef.current &&
					activePairKeyRef.current == key
				) {
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
	// 防止陈旧响应（旧货币对/矩阵视图期间完成）落地污染 result/loading/pairError
	React.useEffect(() => {
		pairReqRef.current++
		setPairError(null)
	}, [
		view,
		pairReverse,
		pairFrom,
		pairTo,
		amount,
		precision,
		crossRates,
	])

	// 参数/视图变化时立即作废矩阵进行中的请求代际，防止陈旧响应
	// （旧基准/金额/精度/方向请求在 300ms 防抖窗口内完成）落地
	// 污染 matrixCacheRef/matrix/matrixFetchedAt/loading/error
	React.useEffect(() => {
		matrixReqRef.current++
		setMatrixError(null)
	}, [view, matrixBase, amount, precision, matrixReverse])

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
	}, [fetchPair, view, activePairKey])

	// 自动刷新：60s，仅页面可见时强制重拉（矩阵视图激活时不运行）
	React.useEffect(() => {
		if (!currencies || view != "pair") return
		const interval = setInterval(() => {
			if (document.visibilityState != "visible") return
			fetchPair(true)
		}, 60000)
		return () => clearInterval(interval)
	}, [fetchPair, view])

	const fetchMatrix = React.useCallback(
		(force: boolean) => {
			if (!currencies) return
			const reqId = ++matrixReqRef.current
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
			})
				.then((data) => {
					if (
						reqId == matrixReqRef.current &&
						activeMatrixKeyRef.current == key
					) {
						matrixCacheRef.current = {
							key,
							data,
							reverse: matrixReverse,
						}
						setMatrixSnapshot({ key, data, reverse: matrixReverse })
						setMatrix(data)
						setMatrixFetchedAt(new Date())
						setMatrixLoading(false)
						setMatrixError(null)
					}
				})
				.catch((e) => {
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
		[currencies, matrixBase, amount, precision, matrixReverse]
	)

	React.useEffect(() => {
		if (view != "matrix" || !currencies) return
		// 切回本视图时立即恢复上次数据，不等防抖，避免白屏
		const cached = matrixCacheRef.current
		if (
			cached &&
			cached.key ==
				matrixViewCacheKey(matrixBase, amount, precision, matrixReverse)
		) {
			setMatrix(cached.data)
			setMatrixLoading(false)
		}
		const timer = setTimeout(() => fetchMatrix(false), 300)
		return () => clearTimeout(timer)
	}, [view, fetchMatrix])

	// 查询参数变化用 Next.js 支持的 Native History API 原地同步，不触发 RSC GET。
	// 仅在 pathname 与当前视图一致时排队；路径切换会取消 timer 并推进代际。
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
			precision
		)
		const generation = ++urlWriteGenerationRef.current
		if (pendingUrlTimerRef.current != null) {
			clearTimeout(pendingUrlTimerRef.current)
		}
		const timer = setTimeout(() => {
			if (pendingUrlTimerRef.current == timer) {
				pendingUrlTimerRef.current = null
			}
			if (urlWriteGenerationRef.current != generation) return
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
			if (urlWriteGenerationRef.current == generation) {
				urlWriteGenerationRef.current++
			}
		}
	}, [
		view,
		pairFrom,
		pairTo,
		matrixBase,
		matrixReverse,
		amount,
		precision,
		precisionHydrated,
		pathname,
	])

	const visiblePair =
		pairSnapshot != null && pairSnapshot.key == activePairKey
			? pairSnapshot.data
			: null
	const visiblePairLoading =
		loading || (view == "pair" && result != null && visiblePair == null)
	const visibleMatrix =
		matrixSnapshot != null && matrixSnapshot.key == activeMatrixKey
			? matrixSnapshot.data
			: null
	const visibleMatrixLoading =
		matrixLoading ||
		(view == "matrix" && matrix != null && visibleMatrix == null)
	const lastUpdated = React.useMemo(() => {
		if (view == "matrix") {
			return visibleMatrix == null ? null : matrixFetchedAt
		}
		if (!visiblePair || visiblePair.length == 0) return null
		return visiblePair.reduce(
			(max, r) => (r.updated > max ? r.updated : max),
			visiblePair[0].updated
		)
	}, [view, visiblePair, visibleMatrix, matrixFetchedAt])

	const { mode, toggle } = useThemeMode()

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
			setMatrixExtraRowsGeneration((generation) => generation + 1)
			fetchMatrix(true)
		} else {
			fetchPair(true)
		}
	}

	const theme = useTheme()
	// iOS Safari：backdrop-filter 合成层 bug 会吞掉页面触摸事件（点不动），降级为纯色背景
	const isIOS =
		typeof navigator != "undefined" &&
		/iPad|iPhone|iPod/.test(navigator.userAgent)

	return (
		<>
			<Box
				component="header"
				sx={{
					position: "sticky",
					top: 0,
					zIndex: 1100,
					...(isIOS
						? { bgcolor: theme.palette.background.paper }
						: {
								bgcolor: alpha(theme.palette.background.paper, 0.85),
								backdropFilter: "blur(8px)",
								WebkitBackdropFilter: "blur(8px)",
						  }),
					// Sunoaki 导航惯例：底部一条暖沙分隔线，不加重阴影
					borderBottom: 1,
					borderColor: "divider",
				}}
			>
				<Box
					sx={{
						maxWidth: 1080,
						mx: "auto",
						px: { xs: 1, sm: 2 },
						py: { xs: 0.375, sm: 1 },
						display: "flex",
						alignItems: "center",
						gap: { xs: 0.25, sm: 2 },
						flexWrap: "wrap",
					}}
				>
					<Box sx={{ display: "flex", alignItems: "center", mr: { xs: 0.25, sm: 0 } }}>
						<Typography
							variant="h6"
							component="h1"
							sx={{ fontWeight: 700, letterSpacing: "-0.01em" }}
						>
							FXRate
						</Typography>
					</Box>
					<Tabs
						value={view}
						onChange={(_, v) => setView(v as View)}
						sx={{
							minHeight: { xs: 32, sm: 40 },
							order: { xs: 3, sm: 0 },
							width: { xs: "100%", sm: "auto" },
							mt: { xs: 0.25, sm: 0 },
							p: { xs: "2px", sm: 0 },
							bgcolor: { xs: "surfaceMuted", sm: "transparent" },
							borderRadius: { xs: "9999px", sm: 0 },
							border: { xs: 1, sm: 0 },
							borderColor: { xs: "divider", sm: "transparent" },
							"& .MuiTabs-indicator": {
								display: { xs: "none", sm: "block" },
							},
							"& .MuiTab-root": {
								minHeight: { xs: 32, sm: 40 },
								py: { xs: 0.25, sm: 0 },
								px: { xs: 1.5, sm: 2 },
								flex: { xs: 1, sm: 0 },
								borderRadius: { xs: "9999px", sm: 0 },
								fontSize: { xs: "0.8125rem", sm: "0.875rem" },
								fontWeight: 600,
								transition: "all 0.2s ease",
								"&.Mui-selected": {
									bgcolor: { xs: "brandSoft", sm: "transparent" },
									color: { xs: "primary.dark", sm: "primary.main" },
									fontWeight: 700,
								},
							},
						}}
					>
						<Tab value="pair" label="单对报价" />
						<Tab value="matrix" label="全对矩阵" />
					</Tabs>
					<Box sx={{ flexGrow: 1 }} />
						{currencies && (
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: { xs: "none", sm: "block" } }}
							>
								{Object.keys(currencies).length} 家来源
								{lastUpdated ? (
							<>
								{" · 更新于 "}
								<RelativeTime date={lastUpdated} />
							</>
						) : null}
							</Typography>
						)}
					<TextField
						select
						size="small"
						label="精度"
						value={precision}
						onChange={(e) => {
							if (e.target.value == "default") {
								try {
									localStorage.removeItem(PRECISION_KEY)
								} catch {
									// localStorage 不可用时忽略
								}
								setPrecision(4)
							} else {
								setPrecision(Number(e.target.value))
							}
						}}
						sx={{
							display: { xs: "none", sm: "block" },
							width: 84,
						}}
						inputProps={{ "aria-label": "小数精度" }}
					>
						<MenuItem value={-1}>原样</MenuItem>
						<MenuItem value={0}>0 位</MenuItem>
						<MenuItem value={2}>2 位</MenuItem>
						<MenuItem value={4}>4 位</MenuItem>
						<MenuItem value={6}>6 位</MenuItem>
						<MenuItem value="default">恢复默认</MenuItem>
					</TextField>
					{/* 移动端：精度用图标按钮 + 弹层（替代被隐藏的 select） */}
					<Box sx={{ display: { xs: "block", sm: "none" } }}>
						<Tooltip title="小数精度">
							<IconButton
								aria-label="小数精度"
								size="small"
								onClick={(e) => setPrecisionAnchor(e.currentTarget)}
							>
								<TuneIcon fontSize="small" />
							</IconButton>
						</Tooltip>
						<Menu
							anchorEl={precisionAnchor}
							open={Boolean(precisionAnchor)}
							onClose={() => setPrecisionAnchor(null)}
						>
							<MenuItem
								selected={precision == -1}
								onClick={() => {
									setPrecision(-1)
									setPrecisionAnchor(null)
								}}
							>
								原样
							</MenuItem>
							<MenuItem
								selected={precision == 0}
								onClick={() => {
									setPrecision(0)
									setPrecisionAnchor(null)
								}}
							>
								0 位
							</MenuItem>
							<MenuItem
								selected={precision == 2}
								onClick={() => {
									setPrecision(2)
									setPrecisionAnchor(null)
								}}
							>
								2 位
							</MenuItem>
							<MenuItem
								selected={precision == 4}
								onClick={() => {
									setPrecision(4)
									setPrecisionAnchor(null)
								}}
							>
								4 位
							</MenuItem>
							<MenuItem
								selected={precision == 6}
								onClick={() => {
									setPrecision(6)
									setPrecisionAnchor(null)
								}}
							>
								6 位
							</MenuItem>
							<MenuItem
								onClick={() => {
									try {
										localStorage.removeItem(PRECISION_KEY)
									} catch {
										// localStorage 不可用时忽略
									}
									setPrecision(4)
									setPrecisionAnchor(null)
								}}
							>
								恢复默认
							</MenuItem>
						</Menu>
					</Box>
						<Tooltip
							title={
								crossRates
									? "交叉汇率已开启：无直连报价时经中间货币折算（可能有累积误差），行内可悬停查看过桥路径"
									: "开启交叉汇率：无直连报价时经中间货币折算（如 CNY→CNH 经 HKD）"
							}
						>
							<Button
								size="small"
								variant={crossRates ? "tonal" : "outlined"}
								color="inherit"
								startIcon={<SwapHorizIcon fontSize="small" />}
								onClick={() => setCrossRates((v) => !v)}
								sx={{
									display: { xs: "none", sm: "inline-flex" },
									color: crossRates
										? "primary.main"
										: "inherit",
									whiteSpace: "nowrap",
								}}
							>
								交叉汇率
							</Button>
						</Tooltip>
						{/* 移动端：交叉汇率 icon 按钮 */}
						<Tooltip
							title={
								crossRates
									? "交叉汇率已开启"
									: "开启交叉汇率"
							}
						>
							<IconButton
								aria-label="交叉汇率"
								size="small"
								onClick={() => setCrossRates((v) => !v)}
								sx={{
									display: { xs: "inline-flex", sm: "none" },
									color: crossRates
										? "primary.main"
										: "inherit",
								}}
							>
								<SwapHorizIcon fontSize="small" />
							</IconButton>
						</Tooltip>
						<Tooltip title="刷新">
							<IconButton aria-label="refresh" size="small" onClick={handleRefresh}>
								<RefreshIcon fontSize="small" />
							</IconButton>
						</Tooltip>
						<Tooltip title="API 文档">
							<IconButton
								aria-label="API 文档"
								size="small"
								onClick={() => {
									cancelPendingUrlWrite()
									router.push("/api-docs")
								}}
							>
								<MenuBookIcon fontSize="small" />
							</IconButton>
						</Tooltip>
						<Tooltip title={mode == "dark" ? "切换浅色模式" : "切换暗色模式"}>
							<IconButton
								aria-label="toggle theme"
								size="small"
								onClick={toggle}
							>
								{mode == "dark" ? (
									<LightModeIcon fontSize="small" />
								) : (
									<DarkModeIcon fontSize="small" />
								)}
							</IconButton>
						</Tooltip>
					</Box>
				</Box>

			<Box
				sx={{
					width: "100%",
					maxWidth: 1080,
					mx: "auto",
					px: { xs: 1, sm: 2 },
					py: 2,
				}}
			>
				{loadError ? (
					<Alert severity="error">{loadError}</Alert>
				) : (
					<>
						<CurrencyChooser
							currencies={allCurrencies}
							from={view == "matrix" ? matrixBase : pairFrom}
							to={view == "matrix" ? matrixBase : pairTo}
							amount={amount}
							onFromChange={
								view == "matrix" ? setMatrixBase : setPairFrom
							}
							onToChange={setPairTo}
							onSwap={handleSwap}
							onAmountChange={setAmount}
							showTo={view == "pair"}
							fromLabel={
								view == "matrix" && matrixReverse
									? "目标货币"
									: undefined
							}
							reverse={
								view == "matrix" ? matrixReverse : pairReverse
							}
							onReverseChange={handleReverseToggle}
						/>

						<Box sx={{ mt: 2 }}>
							{view == "pair" ? (
								<>
									{pairError && (
										<Alert
											severity="error"
											action={
												<Button
													color="inherit"
													size="small"
													onClick={() => fetchPair(true)}
												>
													重试
												</Button>
											}
											sx={{ mb: 1 }}
										>
											{pairError}
										</Alert>
									)}
									{visiblePairLoading && visiblePair != null && (
										<LinearProgress sx={{ mb: 1 }} />
									)}
									{visiblePairLoading && visiblePair == null ? (
										<Skeleton variant="rounded" height={280} />
									) : visiblePair && visiblePair.length > 0 ? (
										<FXListGrid
											props={visiblePair}
											from={pairReqFrom}
											to={pairReqTo}
											amount={amount}
											precision={precision}
										/>
									) : !pairError ? (
										<Alert severity="info">
											该货币对暂无可用的银行报价，试试其他货币对
										</Alert>
									) : null}
								</>
							) : (
								<>
									{matrixError && (
										<Alert
											severity="error"
											action={
												<Button
													color="inherit"
													size="small"
													onClick={() => fetchMatrix(true)}
												>
													重试
												</Button>
											}
											sx={{ mb: 1 }}
										>
											{matrixError}
										</Alert>
									)}
									{visibleMatrixLoading && visibleMatrix != null && (
										<LinearProgress sx={{ mb: 1 }} />
									)}
									{visibleMatrixLoading && visibleMatrix == null ? (
										<Skeleton variant="rounded" height={280} />
									) : visibleMatrix && Object.keys(visibleMatrix).length > 0 ? (
									<FXMatrixGrid
										data={visibleMatrix}
										from={matrixBase}
											amount={amount}
											precision={precision}
											slowSources={Array.from(SLOW_SOURCES)}
											sourceCurrencies={currencies ?? undefined}
											crossRates={crossRates}
										reverse={matrixReverse}
											refreshGeneration={matrixExtraRowsGeneration}
										/>
									) : !matrixError ? (
										<Alert severity="info">暂无矩阵数据</Alert>
									) : null}
								</>
							)}
						</Box>
					</>
				)}
			</Box>

			<Footer
				buildId={buildId}
				buildTime={buildTime}
				version={version}
				backendVersion={backendVersion}
			/>
		</>
	)
}
