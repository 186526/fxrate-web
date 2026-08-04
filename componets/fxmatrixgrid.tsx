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

// 额外行来源的加载状态：自动补查失败（error）可区分、可重试，
// 不再被一次性 ref 永久去重
type SourceLoadStatus = "idle" | "loading" | "success" | "error"

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

const orientMatrixRowPaths = (
	row: RatesMatrix[string],
	from: string,
	reverse: boolean
): RatesMatrix[string] => {
	if (!reverse) return row

	let changed = false
	const oriented: RatesMatrix[string] = {}
	for (const currency in row) {
		const cell = row[currency]
		const path = cell.path
		if (path && path.length > 1 && path[0] == from) {
			oriented[currency] = { ...cell, path: [...path].reverse() }
			changed = true
		} else {
			oriented[currency] = cell
		}
	}

	return changed ? oriented : row
}

// 单元格合并：b（优先侧）的已定义字段覆盖 a。b 对缺值格会显式写
// cash/remit/path 为 undefined（getRatesMatrix 行为），直接用 ?? 回落 a
// 的补查值（false/0/字符串等合法值保留），避免整格浅合并丢字段
const mergeCell = (
	a: RatesMatrixCell | undefined,
	b: RatesMatrixCell | undefined
): RatesMatrixCell => ({
	middle: b?.middle ?? a?.middle ?? 0,
	cash: b?.cash ?? a?.cash,
	remit: b?.remit ?? a?.remit,
	path: b?.path ?? a?.path,
	alias: b?.alias ?? a?.alias,
	updated: b?.updated ?? a?.updated,
})

// 单元格字段级合并：同一来源同一货币按字段 merge，b 对重叠字段优先、
// a 独有字段（path/alias/updated 等）保留。主数据与单独补查行可能对同一
// 格各持有部分字段（如主数据只有 middle、补查带回 cash/remit/path），
// 浅合并整格会丢字段，这里逐字段合并
const mergeCellRows = (
	a: RatesMatrix[string] | undefined,
	b: RatesMatrix[string] | undefined
): RatesMatrix[string] => {
	if (!a) return b ?? {}
	if (!b) return a
	const currencyKeys = new Set([...Object.keys(a), ...Object.keys(b)])
	const merged: RatesMatrix[string] = {}
	for (const c of currencyKeys) {
		merged[c] = mergeCell(a[c], b[c])
	}
	return merged
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
	reverse = false,
	refreshGeneration = 0,
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
	// 金额单位反转：后端按反向路径返回每 amount 单位列货币可兑换的基准货币数量
	reverse?: boolean
	// 主矩阵手动刷新时递增，使额外行绕过旧代际并重新请求
	refreshGeneration?: number
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

	// 可见货币签名（仅主数据 + 启用集合，不含额外行）：用于构造请求 key。
	// 额外行新增的货币列不应触发整批额外行重置，故 key 只随主数据/启用集变化
	const baseCurrencies = React.useMemo(() => {
		const currencySet = new Set<string>()
		for (const s in data) {
			for (const c in data[s]) {
				if (c == from) continue
				currencySet.add(c)
			}
		}
		const activeSet = new Set(
			enabled ?? DEFAULT_COMMON_CURRENCIES.filter((c) =>
				currencySet.has(c)
			)
		)
		return Array.from(currencySet).filter((c) => activeSet.has(c))
	}, [data, from, enabled])
	const visibleCurrenciesKey = React.useMemo(
		() => [...baseCurrencies].sort().join(","),
		[baseCurrencies]
	)
	const rowParamsKey =
		`${from}-${amount}-p${precision}-${crossRates ? "bfs" : "direct"}-` +
		`${reverse ? "reverse" : "forward"}-r${refreshGeneration}-${visibleCurrenciesKey}`

	// 额外行（Visa 手动 / MasterCard 自动 / 交叉补查）keyed 快照：data 只归属
	// 其 key 对应的参数。参数变化时 render 先按 key 隔离（即使重置 effect 尚未
	// 运行，新参数也绝不渲染旧行），异步响应写回也要求 key 一致
	const [extraRows, setExtraRows] = React.useState<{
		key: string
		data: RatesMatrix
	}>({ key: rowParamsKey, data: {} })
	// 每个额外行来源的加载状态：自动补查失败（error）可区分、可重试
	const [sourceStatus, setSourceStatus] = React.useState<{
		[source: string]: SourceLoadStatus
	}>({})
	const [sourceError, setSourceError] = React.useState<{
		[source: string]: string
	}>({})

	const baseData = React.useMemo(() => {
		// keyed 快照：extraRows 只在其记录时的参数 key 下参与合并，旧参数数据
		// 绝不渲染进新参数表格
		if (extraRows.key != rowParamsKey) return data
		const merged: RatesMatrix = {}
		const sourceKeys = new Set([
			...Object.keys(extraRows.data),
			...Object.keys(data),
		])
		for (const source of sourceKeys) {
			merged[source] = mergeCellRows(extraRows.data[source], data[source])
		}
		return merged
	}, [data, extraRows, rowParamsKey])
	const displayData = baseData

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
		const sourceKeys = Object.keys(displayData).sort((a, b) =>
			getName(a).localeCompare(getName(b))
		)

		const currencySet = new Set<string>()
		for (const s of sourceKeys) {
			for (const c in displayData[s]) {
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
				const n = toNumber(cellOf(displayData[s][c], priceType))
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
	}, [displayData, from, priceType, enabled, excluded])

	// 最近一次 commit 的请求 key：异步响应经 requestKey 对比判断是否过期。
	// 用 useLayoutEffect（commit 后、绘制前）同步，保证同一渲染周期内异步
	// 响应读到的都是已提交的 key，陈旧响应不能写入当前参数
	const rowParamsRef = React.useRef(rowParamsKey)
	React.useLayoutEffect(() => {
		rowParamsRef.current = rowParamsKey
	}, [rowParamsKey])
	const handleLoadSource = React.useCallback(
		async (source: string) => {
			const requestKey = rowParamsKey
			setSourceStatus((prev) => ({ ...prev, [source]: "loading" }))
			try {
				const supported = sourceCurrencies?.[source] ?? []
				const row = await getSourceMatrixRow(
					source,
					supported,
					currencies,
					from,
					{ amount, precision, reverse, bfs: crossRates }
				)
				// 过期响应（参数已变）直接丢弃，不写状态
				if (rowParamsRef.current != requestKey) return
				setSourceStatus((prev) => ({ ...prev, [source]: "success" }))
				if (Object.keys(row).length > 0) {
					const displayRow = orientMatrixRowPaths(row, from, reverse)
					setExtraRows((prev) =>
						prev.key == requestKey
							? {
								key: prev.key,
								data: {
									...prev.data,
									[source]: mergeCellRows(
										prev.data[source],
										displayRow
									),
								},
							}
							: prev
					)
				}
			} catch (e) {
				// 失败可区分：error 状态渲染"加载失败，重试"行，可手动重试
				if (rowParamsRef.current != requestKey) return
				setSourceStatus((prev) => ({ ...prev, [source]: "error" }))
				setSourceError((prev) => ({
					...prev,
					[source]: e instanceof Error ? e.message : String(e),
				}))
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
		]
	)

	// MasterCard 实测毫秒级返回：矩阵数据就绪后自动加载（不经"点击加载"）。
	// 参数、刷新代际或可见货币变化时重置额外行、状态与请求代际，用新参数重新加载
	const crossFilledRef = React.useRef<string>("")
	const crossFillRequestRef = React.useRef(0)
	// 每参数 key 已尝试自动补查的来源：防重复但不永久去重失败——key 变化时清空
	const autoAttemptedRef = React.useRef<{ [key: string]: string[] }>({})
	const lastRowParamsRef = React.useRef(rowParamsKey)
	React.useEffect(() => {
		if (lastRowParamsRef.current == rowParamsKey) return
		lastRowParamsRef.current = rowParamsKey
		autoAttemptedRef.current = {}
		crossFillRequestRef.current += 1
		crossFilledRef.current = ""
		setExtraRows({ key: rowParamsKey, data: {} })
		setSourceStatus({})
		setSourceError({})
	}, [rowParamsKey])

	React.useEffect(() => {
		if (!sourceCurrencies || Object.keys(data).length == 0) return
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
	}, [data, sourceCurrencies, slowSources, rowParamsKey, handleLoadSource, sourceStatus])

	// 交叉汇率补查：开启时，对可见货币列中"该源支持但直连缺失"的格
	// 用 getSourceMatrixRow(bfs=true) 补查过桥汇率，合并进 extraRows
	React.useEffect(() => {
		if (!crossRates) {
			crossFillRequestRef.current += 1
			crossFilledRef.current = ""
			return
		}
		if (!sourceCurrencies || Object.keys(data).length == 0) return
		if (currencies.length == 0) return
		const requestKey = rowParamsKey
		const params = `${requestKey}-${priceType}-${Object.keys(data).sort().join(",")}`
		if (crossFilledRef.current == params) return
		crossFilledRef.current = params
		const requestId = ++crossFillRequestRef.current
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
					const cell = baseData[s]?.[c]
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
						{ amount, precision, reverse, bfs: true }
					)
					if (
						rowParamsRef.current == requestKey &&
						crossFillRequestRef.current == requestId &&
						crossFilledRef.current == params &&
						Object.keys(row).length > 0
					) {
						const displayRow = orientMatrixRowPaths(
							row,
							from,
							reverse
						)
						setExtraRows((prev) =>
							prev.key == requestKey
								? {
									key: prev.key,
									data: {
										...prev.data,
										[s]: mergeCellRows(
											prev.data[s],
											displayRow
										),
									},
								}
								: prev
						)
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
		baseData,
		currencies,
		from,
		amount,
		precision,
		reverse,
		slowSources,
		sources,
		extraRows,
		priceType,
		rowParamsKey,
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
					.map((s) => toNumber(cellOf(displayData[s][c], priceType)))
			)
		}
		return stats
	}, [currencies, sources, displayData, priceType, excluded])

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
			const na = toNumber(cellOf(displayData[a][sortKey], priceType))
			const nb = toNumber(cellOf(displayData[b][sortKey], priceType))
			if (na == undefined && nb == undefined) return 0
			if (na == undefined) return 1
			if (nb == undefined) return -1
			return sortDir == "asc" ? na - nb : nb - na
		})
		return sorted
	}, [sources, displayData, sortKey, sortDir, priceType])

	// 所有货币列都无数据的行（如无该行可用报价的来源）隐藏，减少噪音
	const visibleSources = React.useMemo(
		() =>
			sortedSources.filter((s) =>
				currencies.some((c) => {
					const n = toNumber(cellOf(displayData[s][c], priceType))
					return n != undefined
				})
			),
		[sortedSources, currencies, displayData, priceType]
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
						{reverse
							? `每 ${amount} 单位各货币可兑换的 ${from} 数量`
							: `以 ${from} 为基准 · 每 ${amount} 单位 ${from} 可兑换的各货币数量`}
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
						{visibleSources.filter((s) => !excluded.has(s)).length}/
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
							const rowUpdated = Object.values(displayData[s] ?? {}).reduce<Date | null>(
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
									const v = cellOf(displayData[s][c], priceType)
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
															{displayData[s][c]?.updated && (
																<Typography
																	variant="caption"
																	color="text.secondary"
																	sx={{
																		display: "block",
																		mb: 0.5,
																	}}
																>
																	更新于{" "}
																	{displayData[s][c]!
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
														{displayData[s][c]?.path &&
															displayData[s][c]!.path!.length >
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
																		{displayData[s][
																			c
																		]!.path!.join(
																			" → "
																		)}
																	</Typography>
																)}
															{displayData[s][c]?.alias && (
																<Typography
																	variant="caption"
																	sx={{
																		display: "block",
																		mt: 0.5,
																		color: "primary.main",
																	}}
																>
																	实际按{" "}
																	{displayData[s][c]!
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
															...(displayData[s][c]?.path &&
															displayData[s][c]!.path!
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
							.filter(
								(s) =>
									extraRows.key == rowParamsKey &&
									!(s in extraRows.data) &&
									sourceStatus[s] != "success"
							)
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
											<Tooltip
												title={sourceError[s] ?? ""}
												describeChild
											>
												<Button
													size="small"
													variant="tonal"
													disabled={
														sourceStatus[s] ==
														"loading"
													}
													onClick={() =>
														handleLoadSource(s)
													}
												>
													{sourceStatus[s] ==
													"loading"
														? "加载中..."
														: sourceStatus[s] ==
																"error"
															? "加载失败，重试"
															: "点击加载"}
												</Button>
											</Tooltip>
										</Box>
									</TableCell>
								</TableRow>
							))}
						{Object.keys(sourceStatus)
							.filter(
								(s) =>
									extraRows.key == rowParamsKey &&
									!slowSources.includes(s) &&
									(sourceStatus[s] == "error" ||
										sourceStatus[s] == "loading") &&
									!(s in extraRows.data) &&
									!visibleSources.includes(s)
							)
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
											<Tooltip
												title={sourceError[s] ?? ""}
												describeChild
											>
												<Button
													size="small"
													variant="tonal"
													disabled={
														sourceStatus[s] ==
														"loading"
													}
													onClick={() =>
														handleLoadSource(s)
													}
												>
													{sourceStatus[s] ==
													"loading"
														? "加载中..."
														: "加载失败，重试"}
												</Button>
											</Tooltip>
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
