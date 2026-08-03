"use client"
import * as React from "react"

import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import TableSortLabel from "@mui/material/TableSortLabel"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Popover from "@mui/material/Popover"
import TextField from "@mui/material/TextField"
import Tooltip from "@mui/material/Tooltip"
import Link from "@mui/material/Link"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import ChecklistIcon from "@mui/icons-material/Checklist"
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents"

import { sourceNamesInZH } from "@/lib/fxrate/src/constant"
import { RatesMatrix, RatesMatrixCell, getSourceMatrixRow, ratesPageURL } from "@/componets/tools"
import { useBestPriceSources } from "@/componets/bestPriceSources"
import { SourceIcon, currencyEmoji } from "@/componets/sourceIcon"
import { computeStats, StatsTip, StatsTipProvider, StatsTooltip, isStale, StaleIcon, useMounted } from "@/componets/rateStats"

const nameMapping: { [x: string]: string } = sourceNamesInZH

const DEFAULT_COMMON_CURRENCIES = [
	"USD",
	"EUR",
	"JPY",
	"HKD",
	"GBP",
	"AUD",
	"CAD",
	"CHF",
	"SGD",
	"CNH",
	"KRW",
	"THB",
]

const MATRIX_CURRENCIES_KEY = "fxrate-matrix-currencies"

function getName(name: string): string {
	if (nameMapping[name]) {
		return nameMapping[name] + ` (${name})`
	} else return name
}

type CellValue = number | string | boolean

type PriceType = "middle" | "cash" | "remit"

const priceTypeLabels: { [k in PriceType]: string } = {
	middle: "中间价",
	cash: "现钞",
	remit: "现汇",
}

const toNumber = (v: CellValue | undefined): number | undefined => {
	if (v == undefined) return undefined
	if (typeof v == "number") return v
	if (typeof v == "string" && v.trim() != "") {
		const n = Number(v)
		return Number.isNaN(n) ? undefined : n
	}
	return undefined
}

const formatValue = (v: CellValue | undefined): string =>
	typeof v == "number" || typeof v == "string" ? String(v) : "—"

const cellOf = (
	cell: RatesMatrixCell | undefined,
	type: PriceType
): CellValue | undefined => {
	if (!cell) return undefined
	if (type == "middle") return cell.middle
	return cell[type]
}

export default React.memo(FXMatrixGrid)

function FXMatrixGrid({
	data,
	from,
	amount,
	precision = 4,
	slowSources = [],
	sourceCurrencies,
	crossRates = false,
}: {
	data: RatesMatrix
	from: string
	amount: number
	// 全局精度（Header select）：主数据与交叉补查共用，显示一致的小数位
	precision?: number
	// 反爬慢源（Visa）：默认不请求，显示"点击加载"行，点击后单独查询
	slowSources?: string[]
	// 各源支持的货币列表（用于过滤加载时只查支持的货币，避免触发 chromium 重建超时）
	sourceCurrencies?: { [source: string]: string[] }
	// 交叉汇率开关：单独加载的源（MasterCard 自动 / Visa 点击）用 bfs 折算
	crossRates?: boolean
}) {
	const [priceType, setPriceType] = React.useState<PriceType>("middle")
	const [enabled, setEnabled] = React.useState<string[] | null>(null)
	const [pickerAnchor, setPickerAnchor] = React.useState<HTMLElement | null>(
		null
	)
	const [bestSourceAnchor, setBestSourceAnchor] =
		React.useState<HTMLElement | null>(null)
	// hydration 安全：挂载前 stale 视为 false（isStale 依赖 Date.now()）
	const mounted = useMounted()
	const {
		excluded,
		toggle: toggleExcluded,
		reset: resetExcluded,
		selectAll: selectAllSources,
	} = useBestPriceSources()

	// 弹层搜索：货币 / 来源
	const [pickerSearch, setPickerSearch] = React.useState("")
	const [bestSearch, setBestSearch] = React.useState("")

	// 手动加载的慢源行（点击后经 getSourceMatrixRow 单独查询合并）
	const [extraRows, setExtraRows] = React.useState<RatesMatrix>({})
	const [loadingSource, setLoadingSource] = React.useState<string | null>(
		null
	)

	const mergedData = React.useMemo(
		() => ({ ...data, ...extraRows }),
		[data, extraRows]
	)

	React.useEffect(() => {
		try {
			const saved = localStorage.getItem(MATRIX_CURRENCIES_KEY)
			if (saved) {
				const parsed: unknown = JSON.parse(saved)
				if (Array.isArray(parsed)) {
					setEnabled(parsed.filter((x) => typeof x == "string"))
				}
			}
		} catch {
			// localStorage 不可用时使用默认常用币种
		}
	}, [])

	React.useEffect(() => {
		if (enabled) {
			try {
				localStorage.setItem(
					MATRIX_CURRENCIES_KEY,
					JSON.stringify(enabled)
				)
			} catch {
				// localStorage 不可用时忽略持久化
			}
		}
	}, [enabled])

	const { sources, allCurrencies, currencies, best } = React.useMemo(() => {
		const sourceKeys = Object.keys(mergedData).sort((a, b) =>
			getName(a).localeCompare(getName(b))
		)

		const currencySet = new Set<string>()
		for (const s of sourceKeys) {
			for (const c in mergedData[s]) {
				if (c == from) continue
				currencySet.add(c)
			}
		}
		const allCurrencyKeys = Array.from(currencySet)

		const activeSet = new Set(
			enabled ?? DEFAULT_COMMON_CURRENCIES.filter((c) =>
				currencySet.has(c)
			)
		)
		const currencyKeys = allCurrencyKeys
			.filter((c) => activeSet.has(c))
			.sort(
				(a, b) =>
					(a in DEFAULT_COMMON_CURRENCIES
						? DEFAULT_COMMON_CURRENCIES.indexOf(a)
						: 999) -
					(b in DEFAULT_COMMON_CURRENCIES
						? DEFAULT_COMMON_CURRENCIES.indexOf(b)
						: 999)
			)

		const best: { [currency: string]: number } = {}
		for (const c of currencyKeys) {
			let max: number | undefined
			for (const s of sourceKeys) {
				if (excluded.has(s)) continue
				const n = toNumber(cellOf(mergedData[s][c], priceType))
				if (n == undefined) continue
				if (max == undefined || n > max) max = n
			}
			if (max != undefined) best[c] = max
		}

		return {
			sources: sourceKeys,
			allCurrencies: allCurrencyKeys,
			currencies: currencyKeys,
			best,
		}
	}, [mergedData, from, priceType, enabled, excluded])

	// 加载单个源行（MasterCard 自动 / Visa 点击）：只查当前可见的货币列，
	// 避免触发后端对不支持货币的 chromium 重建导致 30s+ 超时
	const handleLoadSource = async (source: string) => {
		if (loadingSource) return
		setLoadingSource(source)
		try {
			const supported = sourceCurrencies?.[source] ?? []
			const row = await getSourceMatrixRow(
				source,
				supported,
				currencies,
				from,
				{ amount, precision, bfs: crossRates }
			)
			if (Object.keys(row).length > 0) {
				setExtraRows((prev) => ({ ...prev, [source]: row }))
			}
		} finally {
			setLoadingSource(null)
		}
	}

	// MasterCard 实测毫秒级返回：矩阵数据就绪后自动加载（不经"点击加载"）。
	// 参数（from/amount/crossRates）变化时重置已加载记录，用新参数重新加载
	const autoLoadedRef = React.useRef<string[]>([])
	const lastParamsRef = React.useRef<string>("")
	const handleLoadSourceRef = React.useRef(handleLoadSource)
	handleLoadSourceRef.current = handleLoadSource
	React.useEffect(() => {
		const params = `${from}-${amount}-${crossRates}`
		if (lastParamsRef.current != params) {
			lastParamsRef.current = params
			autoLoadedRef.current = []
			setExtraRows({})
		}
		if (!sourceCurrencies || Object.keys(data).length == 0) return
		for (const s of Object.keys(sourceCurrencies)) {
			if (slowSources.includes(s)) continue
			if (s in extraRows) continue
			// 主数据里该行非空（直连全表返回了数据）则无需自动加载；
			// 空行（如卡组织全表 403）走 getSourceMatrixRow 单独查询
			if (s in data && Object.keys(data[s]).length > 0) continue
			if (autoLoadedRef.current.includes(s)) continue
			autoLoadedRef.current.push(s)
			handleLoadSourceRef.current(s)
		}
		// 主数据/来源列表/参数变化时重新评估（extraRows/autoLoadedRef 用 ref 防重复）
	}, [data, sourceCurrencies, slowSources, from, crossRates, amount, precision])

	// 交叉汇率补查：开启时，对可见货币列中"该源支持但直连缺失"的格
	// 用 getSourceMatrixRow(bfs=true) 补查过桥汇率，合并进 extraRows
	const crossFilledRef = React.useRef<string>("")
	React.useEffect(() => {
		if (!crossRates || !sourceCurrencies || Object.keys(data).length == 0)
			return
		if (currencies.length == 0) return
		const params = `${from}-${amount}-${currencies.join(",")}-${Object.keys(
			data
		).join(",")}`
		if (crossFilledRef.current == params) return
		crossFilledRef.current = params
		;(async () => {
			for (const s of sources) {
				if (slowSources.includes(s)) continue
				if (s in extraRows) continue
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
						{ amount, precision, bfs: true }
					)
					if (Object.keys(row).length > 0) {
						setExtraRows((prev) => ({
							...prev,
							[s]: { ...(prev[s] ?? {}), ...row },
						}))
					}
				} catch (e) {
					console.error(`Error cross-filling ${s}:`, e)
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
		slowSources,
		sources,
		extraRows,
		priceType,
	])

	const pickerFiltered = React.useMemo(
		() =>
			allCurrencies.filter((c) =>
				c.toLowerCase().includes(pickerSearch.trim().toLowerCase())
			),
		[allCurrencies, pickerSearch]
	)
	const bestFiltered = React.useMemo(
		() =>
			sources.filter((s) =>
				getName(s)
					.toLowerCase()
					.includes(bestSearch.trim().toLowerCase())
			),
		[sources, bestSearch]
	)

	// 每货币列统计（排除不参与高亮的来源），供单元格 hover 分析
	const colStats = React.useMemo(() => {
		const stats: { [c: string]: ReturnType<typeof computeStats> } = {}
		for (const c of currencies) {
			stats[c] = computeStats(
				sources
					.filter((s) => !excluded.has(s))
					.map((s) => toNumber(cellOf(mergedData[s][c], priceType)))
			)
		}
		return stats
	}, [currencies, sources, mergedData, priceType, excluded])

	const toggleCurrency = (c: string) => {
		setEnabled((prev) => {
			const base = prev ?? DEFAULT_COMMON_CURRENCIES
			return base.includes(c)
				? base.filter((x) => x != c)
				: [...base, c]
		})
	}

	// 矩阵排序：点击货币列头，按该列汇率值排序来源行（与单对视图交互一致）
	const [sortKey, setSortKey] = React.useState<string | null>(null)
	const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc")

	const handleSort = (c: string) => {
		if (sortKey == c) {
			setSortDir((d) => (d == "asc" ? "desc" : "asc"))
		} else {
			setSortKey(c)
			setSortDir("asc")
		}
	}

	const sortedSources = React.useMemo(() => {
		if (!sortKey) return sources
		const sorted = sources.slice().sort((a, b) => {
			const na = toNumber(cellOf(mergedData[a][sortKey], priceType))
			const nb = toNumber(cellOf(mergedData[b][sortKey], priceType))
			if (na == undefined && nb == undefined) return 0
			if (na == undefined) return 1
			if (nb == undefined) return -1
			return sortDir == "asc" ? na - nb : nb - na
		})
		return sorted
	}, [sources, mergedData, sortKey, sortDir, priceType])

	// 所有货币列都无数据的行（如无该行可用报价的来源）隐藏，减少噪音
	const visibleSources = React.useMemo(
		() =>
			sortedSources.filter((s) =>
				currencies.some((c) => {
					const n = toNumber(cellOf(mergedData[s][c], priceType))
					return n != undefined
				})
			),
		[sortedSources, currencies, mergedData, priceType]
	)

	const resetCurrencies = () => {
		try {
			localStorage.removeItem(MATRIX_CURRENCIES_KEY)
		} catch {
			// localStorage 不可用时忽略
		}
		setEnabled(null)
	}

	return (
		<StatsTipProvider>
			<Box>
			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					flexWrap: "wrap",
					gap: 1,
					mb: 1,
				}}
			>
				<Typography
					variant="subtitle2"
					sx={{
						color: "text.secondary",
						fontSize: { xs: 12, sm: 14 },
						width: { xs: "100%", sm: "auto" },
					}}
				>
					以 {from} 为基准 · 每 {amount} 单位 {from} 可兑换的各货币数量
					（{priceTypeLabels[priceType]}）
				</Typography>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						flexWrap: "wrap",
						justifyContent: "flex-end",
						gap: 0.75,
						ml: { xs: 0, sm: "auto" },
					}}
				>
					<Button
						size="small"
						variant="outlined"
						color="inherit"
						startIcon={<EmojiEventsIcon />}
						onClick={(e) => {
							setBestSearch("")
							setBestSourceAnchor(e.currentTarget)
						}}
					>
						最优价{" "}
						{sources.filter((s) => !excluded.has(s)).length}/
						{visibleSources.length} 家
					</Button>
					<Button
						size="small"
						variant="outlined"
						color="inherit"
						startIcon={<ChecklistIcon />}
						onClick={(e) => {
							setPickerSearch("")
							setPickerAnchor(e.currentTarget)
						}}
					>
						显示货币 {currencies.length}/{allCurrencies.length}
					</Button>
					<ToggleButtonGroup
						size="small"
						exclusive
						value={priceType}
						onChange={(_, v: PriceType | null) => {
							if (v) setPriceType(v)
						}}
						sx={{
							width: { xs: "100%", sm: "auto" },
							borderRadius: 9999,
							p: 0.5,
							bgcolor: "action.hover",
							border: "1px solid",
							borderColor: "divider",
							"& .MuiToggleButtonGroup-grouped": {
								border: 0,
								borderRadius: 9999,
								flex: { xs: 1, sm: "initial" },
								px: { xs: 1.5, sm: 2 },
								py: 0.5,
								fontSize: { xs: 12, sm: 13 },
								fontWeight: 500,
								color: "text.secondary",
								"&.Mui-selected": {
									bgcolor: "brandSoft",
									color: "primary.dark",
									fontWeight: 700,
									boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
								},
							},
						}}
					>
						<ToggleButton value="middle">中间价</ToggleButton>
						<ToggleButton value="cash">现钞</ToggleButton>
						<ToggleButton value="remit">现汇</ToggleButton>
					</ToggleButtonGroup>
				</Box>
			</Box>
			<Popover
				open={Boolean(pickerAnchor)}
				anchorEl={pickerAnchor}
				onClose={() => setPickerAnchor(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
				transformOrigin={{ vertical: "top", horizontal: "right" }}
			>
				<Box sx={{ p: 1.5, width: { xs: 280, sm: 320 }, maxHeight: 420, overflow: "auto" }}>
					<Typography variant="subtitle2" sx={{ mb: 1 }}>
						选择显示的货币
					</Typography>
					<TextField
						size="small"
						placeholder="搜索货币..."
						value={pickerSearch}
						onChange={(e) => setPickerSearch(e.target.value)}
						sx={{ mb: 1 }}
					/>
					<Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.5 }}>
						{pickerFiltered.map((c) => (
							<FormControlLabel
								key={c}
								control={
									<Checkbox
										size="small"
										checked={(enabled ?? DEFAULT_COMMON_CURRENCIES).includes(c)}
										onChange={() => toggleCurrency(c)}
									/>
								}
								label={`${currencyEmoji(c) ?? ""} ${c}`}
								componentsProps={{ typography: { variant: "body2" } }}
							/>
						))}
					</Box>
					<Box
						sx={{
							borderTop: 1,
							borderColor: "divider",
							mt: 1,
							pt: 1,
							display: "flex",
							justifyContent: "flex-end",
						}}
					>
						<Button
							size="small"
							variant="tonal"
							onClick={() => {
								resetCurrencies()
								setPickerAnchor(null)
							}}
						>
							恢复默认（常用 12 币）
						</Button>
					</Box>
				</Box>
			</Popover>
			<Popover
				open={Boolean(bestSourceAnchor)}
				anchorEl={bestSourceAnchor}
				onClose={() => setBestSourceAnchor(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
				transformOrigin={{ vertical: "top", horizontal: "right" }}
			>
				<Box sx={{ p: 1.5, width: { xs: 280, sm: 320 }, maxHeight: 420, overflow: "auto" }}>
					<Typography variant="subtitle2" sx={{ mb: 1 }}>
						参与最优价高亮的来源
					</Typography>
					<TextField
						size="small"
						placeholder="搜索银行..."
						value={bestSearch}
						onChange={(e) => setBestSearch(e.target.value)}
						sx={{ mb: 1 }}
					/>
					{bestFiltered.map((s) => (
						<FormControlLabel
							key={s}
							control={
								<Checkbox
									size="small"
									checked={!excluded.has(s)}
									onChange={() => toggleExcluded(s)}
								/>
							}
							label={
								<Box
									sx={{
										display: "flex",
										alignItems: "center",
										gap: 1,
									}}
								>
									<SourceIcon source={s} size={14} />
									{getName(s)}
								</Box>
							}
							componentsProps={{ typography: { variant: "body2" } }}
						/>
					))}
					<Box
						sx={{
							borderTop: 1,
							borderColor: "divider",
							mt: 1,
							pt: 1,
							display: "flex",
							alignItems: "center",
						}}
					>
						<Button size="small" onClick={selectAllSources}>
							全选
						</Button>
						<Box sx={{ flexGrow: 1 }} />
						<Button
							size="small"
							variant="tonal"
							onClick={() => {
								resetExcluded()
								setBestSourceAnchor(null)
							}}
						>
							恢复默认（仅银行）
						</Button>
					</Box>
				</Box>
			</Popover>
			<Typography
				variant="caption"
				color="text.secondary"
				sx={{ display: { xs: "block", sm: "none" }, mb: 1 }}
			>
				左右滑动查看已选货币 →
			</Typography>
			<TableContainer
				component={Paper}
				elevation={1}
				sx={{ overflow: "auto" }}
			>
				<Table
					size="small"
					stickyHeader
					sx={{ minWidth: { xs: 780, sm: 960 } }}
				>
					<TableHead>
						<TableRow>
							<TableCell
								key="source"
								sx={{
									position: "sticky",
									left: 0,
									bgcolor: "background.paper",
									borderRight: "1px solid",
									borderColor: "divider",
									zIndex: 2,
									py: { xs: 0.75, sm: 1 },
									px: { xs: 0.75, sm: 1.5 },
								}}
							>
								银行/平台
							</TableCell>
							{currencies.map((c) => (
								<TableCell
									key={c}
									align="right"
									sx={{
										py: { xs: 0.75, sm: 1 },
										px: { xs: 1, sm: 1.5 },
									}}
								>
									<TableSortLabel
										active={sortKey == c}
										direction={sortDir}
										onClick={() => handleSort(c)}
										sx={{
											whiteSpace: "nowrap",
											fontSize: { xs: 12, sm: 14 },
										}}
									>
										<Box
											sx={{
												display: "inline-flex",
												alignItems: "center",
												gap: 0.5,
												whiteSpace: "nowrap",
											}}
										>
											{currencyEmoji(c) && <span>{currencyEmoji(c)}</span>}
											{c}
										</Box>
									</TableSortLabel>
								</TableCell>
							))}
						</TableRow>
					</TableHead>
					<TableBody>
						{visibleSources.map((s) => {
							// 该源各货币最新更新时间：任一 cell 超过 STALE_MS 视为整行可能不准确
							const rowUpdated = Object.values(mergedData[s] ?? {}).reduce<Date | null>(
								(acc, cell) => {
									if (!cell?.updated) return acc
									return !acc || cell.updated.getTime() > acc.getTime() ? cell.updated : acc
								},
								null
							)
							const rowStale = mounted && !!rowUpdated && isStale(rowUpdated)
							return (
							<TableRow key={s} hover>
								<TableCell
									component="th"
									scope="row"
									sx={{
										position: "sticky",
										left: 0,
										bgcolor: "background.paper",
										borderRight: "1px solid",
										borderColor: "divider",
										zIndex: 1,
										whiteSpace: "nowrap",
										py: { xs: 0.75, sm: 1 },
										px: { xs: 0.75, sm: 1.5 },
									}}
								>
									<Box
										sx={{
											display: "flex",
											alignItems: "center",
											gap: 0.75,
											// 移动端银行名截断，避免撑爆 sticky 列
											maxWidth: { xs: 140, sm: "none" },
										}}
									>
										<Box sx={{ display: "inline-flex", flexShrink: 0 }}>
											<SourceIcon source={s} />
										</Box>
										<Box
											sx={{
												flex: 1,
												minWidth: 0,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{getName(s)}
										</Box>
										{ratesPageURL(s) && (
											<Tooltip title="查看官方外汇牌价页">
												<Link
													href={ratesPageURL(s)!}
													target="_blank"
													rel="noopener noreferrer"
													aria-label={`${getName(s)} 官方外汇牌价`}
													onClick={(e) => e.stopPropagation()}
													sx={{
														display: "inline-flex",
														alignItems: "center",
														justifyContent: "center",
														verticalAlign: "middle",
														lineHeight: 0,
														color: "text.secondary",
														opacity: 0.75,
														flexShrink: 0,
														"&:hover": {
															opacity: 1,
															color: "primary.main",
														},
													}}
												>
													<OpenInNewIcon sx={{ fontSize: 12 }} />
												</Link>
											</Tooltip>
										)}
										{rowStale && (
											<StaleIcon
												title={`该来源 ${rowUpdated!.toLocaleString("zh-CN")} 未更新，数据可能不准确`}
											/>
										)}
									</Box>
								</TableCell>
								{currencies.map((c) => {
									const v = cellOf(mergedData[s][c], priceType)
									const n = toNumber(v)
									const highlight =
										!rowStale && n != undefined && n == best[c]
									return (
										<TableCell
											key={c}
											align="right"
											sx={{
												fontWeight: highlight ? 700 : "inherit",
												color: rowStale
													? "text.disabled"
													: highlight
														? "primary.main"
														: "inherit",
												backgroundColor: highlight
													? "brandSoft"
													: "inherit",
												py: { xs: 0.75, sm: 1 },
												px: { xs: 1, sm: 1.5 },
												fontSize: { xs: 12, sm: 14 },
											}}
										>
											{n != undefined && colStats[c] ? (
												<StatsTip
													content={
														<>
															{mergedData[s][c]?.updated && (
																<Typography
																	variant="caption"
																	color="text.secondary"
																	sx={{
																		display: "block",
																		mb: 0.5,
																	}}
																>
																	更新于{" "}
																	{mergedData[s][c]!
																		.updated!.toLocaleString(
																			"zh-CN"
																		)}
																</Typography>
															)}
															<StatsTooltip
																title={`${currencyEmoji(c) ?? ""} ${c}`}
																current={n}
																stats={colStats[c]!}
																betterLower={false}
															/>
														{mergedData[s][c]?.path &&
															mergedData[s][c]!.path!.length >
																1 && (
																	<Typography
																		variant="caption"
																		sx={{
																			display: "block",
																			mt: 0.5,
																			color: "primary.main",
																			fontWeight: 700,
																		}}
																	>
																		过桥：{" "}
																		{mergedData[s][
																			c
																		]!.path!.join(
																			" → "
																		)}
																	</Typography>
																)}
															{mergedData[s][c]?.alias && (
																<Typography
																	variant="caption"
																	sx={{
																		display: "block",
																		mt: 0.5,
																		color: "primary.main",
																	}}
																>
																	实际按{" "}
																	{mergedData[s][c]!
																		.alias}{" "}
																	计（CNY/CNH 归一化）
																</Typography>
															)}
														</>
													}
												>
													<span
														style={{
															cursor: "help",
															...(mergedData[s][c]?.path &&
															mergedData[s][c]!.path!
																.length > 1
																? {
																		textDecoration:
																			"underline dotted",
																		textDecorationColor:
																			"inherit",
																  }
																: {}),
														}}
													>
														{formatValue(v)}
													</span>
												</StatsTip>
											) : (
												formatValue(v)
											)}
										</TableCell>
									)
								})}
							</TableRow>
							)
						})}
						{slowSources
							.filter((s) => !(s in extraRows))
							.map((s) => (
								<TableRow key={s}>
									<TableCell
										component="th"
										scope="row"
										colSpan={currencies.length + 1}
										sx={{
											position: "sticky",
											left: 0,
											bgcolor: "background.paper",
											zIndex: 1,
											whiteSpace: "nowrap",
										}}
									>
										<Box
											sx={{
												display: "flex",
												alignItems: "center",
												gap: 1,
											}}
										>
											<SourceIcon source={s} />
											{getName(s)}
											<Button
												size="small"
												variant="tonal"
												disabled={loadingSource != null}
												onClick={() => handleLoadSource(s)}
											>
												{loadingSource == s
													? "加载中..."
													: "点击加载"}
											</Button>
										</Box>
									</TableCell>
								</TableRow>
							))}
					</TableBody>
				</Table>
			</TableContainer>
		</Box>
		</StatsTipProvider>
	)
}
