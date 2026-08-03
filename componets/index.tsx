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
} from "./tools"
import { useThemeMode } from "./theme"
import { infoResponse } from "@/lib/fxrate/src/client"

type View = "pair" | "matrix"

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

	const [from, setFrom] = React.useState(
		searchParams.get("from") ?? "CNY"
	)
	const [to, setTo] = React.useState(searchParams.get("to") ?? "USD")
	const [amount, setAmount] = React.useState(
		Number(searchParams.get("amount")) || 100
	)

	// 视图由 URL 路径驱动：/ = 单对报价，/matrix = 全对矩阵（方便分享链接）
	// 点击 tab 先本地立即切换视图，URL 由 router.push 后台同步：
	// 避免等待 RSC 导航（服务端预取可能要数秒）完成才响应，导致界面"卡住"
	const [viewOverride, setViewOverride] = React.useState<View | null>(null)
	const view: View =
		viewOverride ?? (pathname == "/matrix" ? "matrix" : "pair")
	const setView = (v: View) => {
		setViewOverride(v)
		const params = new URLSearchParams(searchParams.toString())
		router.push(`${v == "matrix" ? "/matrix" : "/"}?${params.toString()}`, {
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
	const [precision, setPrecision] = React.useState(4)

	const PRECISION_KEY = "fxrate-precision"

	// 读档完成前禁止写入：避免挂载时用默认精度覆盖用户 localStorage 存档
	const precisionLoadedRef = React.useRef(false)

	React.useEffect(() => {
		try {
			const saved = localStorage.getItem(PRECISION_KEY)
			if (saved) {
				const n = Number(saved)
				if (Number.isInteger(n) && n >= -1 && n <= 6) {
					setPrecision(n)
				}
			}
		} catch {
			// localStorage 不可用时使用默认精度
		}
	}, [])

	React.useEffect(() => {
		if (!precisionLoadedRef.current) return
		try {
			localStorage.setItem(PRECISION_KEY, String(precision))
		} catch {
			// localStorage 不可用时忽略持久化
		}
	}, [precision])

	// 标记读档完成（须声明在持久化 effect 之后：首轮渲染持久化先跳过，state 更新后再写）
	React.useEffect(() => {
		precisionLoadedRef.current = true
	}, [])

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
	const [error, setError] = React.useState<string | null>(null)
	const [backendVersion, setBackendVersion] = React.useState(
		initialBackendVersion ?? ""
	)

	// 交叉汇率开关：开启后单对视图请求带 bfs=true，无直连报价时经中间货币折算
	const CROSS_KEY = "fxrate-cross-rates"
	const crossLoadedRef = React.useRef(false)
	const [crossRates, setCrossRates] = React.useState(false)
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
	}, [])

	React.useEffect(() => {
		if (!crossLoadedRef.current) return
		try {
			localStorage.setItem(CROSS_KEY, crossRates ? "1" : "0")
		} catch {
			// localStorage 不可用时忽略持久化
		}
	}, [crossRates])

	React.useEffect(() => {
		crossLoadedRef.current = true
	}, [])

	const pairReqRef = React.useRef(0)
	const matrixReqRef = React.useRef(0)

	// 视图数据缓存（stale-while-revalidate）：切换视图先渲染上次数据再后台刷新，避免白屏
	const pairCacheRef = React.useRef<{
		key: string
		data: FXListProps[]
	} | null>(
		initialResult
			? {
					key: `${to}-${from}-${amount}-p${precision}${crossRates ? "-bfs" : ""}`,
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
	} | null>(
		initialMatrix
			? { key: `${from}-${amount}-p${precision}`, data: initialMatrix }
			: null
	)

	// 挂载：SSR 已预取则直接使用，否则拉取来源货币列表与后端版本
	React.useEffect(() => {
		if (initialCurrencies) return
		let cancelled = false
		;(async () => {
			try {
				// info() 须在 showCurrencyAllRates 之后串行（后者内部开启 batch，
				// 并行的 info() 会被吞进批量队列拿不到结果）
				const cur = await showCurrencyAllRates()
				if (cancelled) return
				const info = await FXRate.info()
				if (cancelled) return
				setCurrencies(cur)
				setBackendVersion((info as infoResponse).version)
				setError(null)
			} catch (e) {
				if (!cancelled) {
					setError(
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
			const key = `${to}-${from}-${amount}-p${precision}${crossRates ? "-bfs" : ""}`
			const cached = pairCacheRef.current
			if (cached && cached.key == key) {
				setResult(cached.data)
				setLoading(false)
			} else {
				setLoading(true)
			}
			getCurrenciesDetails(
				currencies,
				to,
				from,
				(r) => {
					if (reqId == pairReqRef.current) {
						pairCacheRef.current = { key, data: r }
						setResult(r)
						setLoading(false)
						setError(null)
					}
				},
				{ amount, precision, force, bfs: crossRates }
			).catch((e) => {
				if (reqId == pairReqRef.current) {
					setLoading(false)
					setError(
						e instanceof Error ? e.message : "加载报价失败，请稍后重试"
					)
				}
			})
		},
		[currencies, to, from, amount, precision, crossRates]
	)

	// 货币/金额变化：防抖 300ms 拉取（命中缓存时零请求）
	React.useEffect(() => {
		if (!currencies) return
		// 切回本视图时立即恢复上次数据，不等防抖，避免白屏
		const cached = pairCacheRef.current
		if (
			cached &&
			cached.key == `${to}-${from}-${amount}-p${precision}${crossRates ? "-bfs" : ""}`
		) {
			setResult(cached.data)
			setLoading(false)
		}
		const timer = setTimeout(() => fetchPair(false), 300)
		return () => clearTimeout(timer)
	}, [fetchPair])

	// 自动刷新：60s，仅页面可见时强制重拉
	React.useEffect(() => {
		if (!currencies) return
		const interval = setInterval(() => {
			if (document.visibilityState != "visible") return
			fetchPair(true)
		}, 60000)
		return () => clearInterval(interval)
	}, [fetchPair])

	const fetchMatrix = React.useCallback(
		(force: boolean) => {
			if (!currencies) return
			const reqId = ++matrixReqRef.current
			const key = `${from}-${amount}-p${precision}`
			const cached = matrixCacheRef.current
			if (cached && cached.key == key) {
				setMatrix(cached.data)
				setMatrixLoading(false)
			} else {
				setMatrixLoading(true)
			}
			getRatesMatrix(currencies, from, {
				amount,
				precision,
				force,
				skipSources: SLOW_SOURCES,
			})
				.then((data) => {
					if (reqId == matrixReqRef.current) {
						matrixCacheRef.current = { key, data }
						setMatrix(data)
						setMatrixFetchedAt(new Date())
						setMatrixLoading(false)
						setError(null)
					}
				})
				.catch((e) => {
					if (reqId == matrixReqRef.current) {
						setMatrixLoading(false)
						setError(
							e instanceof Error ? e.message : "加载矩阵失败，请稍后重试"
						)
					}
				})
		},
		[currencies, from, amount, precision]
	)

	React.useEffect(() => {
		if (view != "matrix" || !currencies) return
		// 切回本视图时立即恢复上次数据，不等防抖，避免白屏
		const cached = matrixCacheRef.current
		if (cached && cached.key == `${from}-${amount}-p${precision}`) {
			setMatrix(cached.data)
			setMatrixLoading(false)
		}
		const timer = setTimeout(() => fetchMatrix(false), 300)
		return () => clearTimeout(timer)
	}, [view, fetchMatrix])

	// URL 同步（page.tsx 已瘦身，replace 不触发任何服务端数据请求）
	React.useEffect(() => {
		const params = new URLSearchParams()
		params.set("from", from)
		params.set("to", to)
		params.set("amount", String(amount))
		const timer = setTimeout(() => {
			router.replace(`${pathname}?${params.toString()}`)
		}, 300)
		return () => clearTimeout(timer)
	}, [from, to, amount, pathname, router])

	const lastUpdated = React.useMemo(() => {
		if (view == "matrix") return matrixFetchedAt
		if (!result || result.length == 0) return null
		return result.reduce(
			(max, r) => (r.updated > max ? r.updated : max),
			result[0].updated
		)
	}, [view, result, matrixFetchedAt])

	const { mode, toggle } = useThemeMode()

	const handleSwap = () => {
		setFrom(to)
		setTo(from)
	}

	const handleRefresh = () => {
		if (view == "matrix") {
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
								onClick={() => router.push("/api-docs")}
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
				{error ? (
					<Alert
						severity="error"
						action={
							<Button color="inherit" size="small" onClick={() => window.location.reload()}>
								重试
							</Button>
						}
					>
						{error}
					</Alert>
				) : (
					<>
						<CurrencyChooser
							currencies={allCurrencies}
							from={from}
							to={to}
							amount={amount}
							onFromChange={setFrom}
							onToChange={setTo}
							onSwap={handleSwap}
							onAmountChange={setAmount}
							showTo={view == "pair"}
						/>

						<Box sx={{ mt: 2 }}>
							{view == "pair" ? (
								<>
									{loading && result != null && (
										<LinearProgress sx={{ mb: 1 }} />
									)}
									{loading && result == null ? (
										<Skeleton variant="rounded" height={280} />
									) : result && result.length > 0 ? (
										<FXListGrid
											props={result}
											from={from}
											to={to}
											amount={amount}
											precision={precision}
										/>
									) : (
										<Alert severity="info">
											该货币对暂无可用的银行报价，试试其他货币对
										</Alert>
									)}
								</>
							) : (
								<>
									{matrixLoading && matrix != null && (
										<LinearProgress sx={{ mb: 1 }} />
									)}
									{matrixLoading && matrix == null ? (
										<Skeleton variant="rounded" height={280} />
									) : matrix && Object.keys(matrix).length > 0 ? (
										<FXMatrixGrid
											data={matrix}
											from={from}
											amount={amount}
											precision={precision}
											slowSources={Array.from(SLOW_SOURCES)}
											sourceCurrencies={currencies ?? undefined}
											crossRates={crossRates}
										/>
									) : (
										<Alert severity="info">暂无矩阵数据</Alert>
									)}
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
