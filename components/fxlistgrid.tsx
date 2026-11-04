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
import Tooltip from "@mui/material/Tooltip"
import IconButton from "@mui/material/IconButton"
import Typography from "@mui/material/Typography"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Link from "@mui/material/Link"
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents"
import RssFeedIcon from "@mui/icons-material/RssFeed"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"

import { useBestPriceSources } from "./bestPriceSources"
import BestPriceMark from "./bestPriceMark"
import BestPricePickerPopover from "./bestPricePickerPopover"
import { SourceIcon } from "./sourceIcon"
import type { FXListProps } from "./shared"
import {
	RelativeTime,
	relativeTime,
	ColumnStats,
	fmt2,
	fmtSigned,
	isStale,
	StatsTip,
	StatsTipProvider,
	StaleIcon,
	toNumber,
	useMounted,
} from "./rateStats"
import {
	buildListRows,
	columnStats,
	formatValue,
	LIST_COLUMNS,
	listBestPrices,
	rowsWithData,
	sortListRows,
	type ListRow,
	type SortKey,
} from "./pair-utils"
import {
	getName,
	NUMERIC_CELL_LAYOUT,
	ratesPageURL,
	rssURL,
	SOURCE_COL_MIN_WIDTH,
} from "./tools"

// 既有导入路径兼容：FXListProps 实体已移至 components/shared.ts
export type { FXListProps } from "./shared"

export default React.memo(FXListGrid)

function FXListGrid({
	props,
	from,
	to,
	amount,
}: {
	props: FXListProps[]
	from: string
	to: string
	amount: number
}) {
	const [sortKey, setSortKey] = React.useState<SortKey>("name")
	const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc")
	const [pickerAnchor, setPickerAnchor] = React.useState<HTMLElement | null>(
		null
	)
	const {
		excluded,
		toggle: toggleExcluded,
		reset: resetExcluded,
		selectAll: selectAllSources,
	} = useBestPriceSources()

	// hydration 安全：挂载前 stale 视为 false（isStale 依赖 Date.now()）
	const mounted = useMounted()

	const rows: ListRow[] = React.useMemo(
		() => buildListRows(props, getName, isStale, mounted),
		[props, mounted]
	)
	const sorted = React.useMemo(
		() => sortListRows(rows, sortKey, sortDir),
		[rows, sortKey, sortDir]
	)
	const best = React.useMemo(
		() => listBestPrices(rows, excluded),
		[rows, excluded]
	)
	const stats = React.useMemo(
		() => ({
			buyCash: columnStats(rows, excluded, (r) => r.buyCash),
			buyRemit: columnStats(rows, excluded, (r) => r.buyRemit),
			sellCash: columnStats(rows, excluded, (r) => r.sellCash),
			sellRemit: columnStats(rows, excluded, (r) => r.sellRemit),
			middle: columnStats(rows, excluded, (r) => r.middle),
		}),
		[rows, excluded]
	)
	const withDataRows = React.useMemo(() => rowsWithData(rows), [rows])

	const handleSort = (key: SortKey) => {
		if (key == sortKey) {
			setSortDir((d) => (d == "asc" ? "desc" : "asc"))
		} else {
			setSortKey(key)
			setSortDir("asc")
		}
	}

	const [rssCopied, setRssCopied] = React.useState(false)
	const handleCopyRss = async () => {
		try {
			await navigator.clipboard.writeText(rssURL(from, to))
			setRssCopied(true)
			setTimeout(() => setRssCopied(false), 1500)
		} catch {
			// 剪贴板不可用时静默失败
		}
	}

	const isBest = (
		v: number | string | boolean | undefined,
		target: number | undefined
	): boolean => {
		const n = toNumber(v)
		return target != undefined && n != undefined && n == target
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
						{from} ↔ {to} · 每 {amount} 单位 {to}，折合 {from}（各银行牌价）
					</Typography>
					<Button
						size="small"
						variant="outlined"
						color="inherit"
						startIcon={<EmojiEventsIcon />}
						onClick={(e) => setPickerAnchor(e.currentTarget)}
						sx={{ ml: { xs: 0, sm: "auto" } }}
					>
						参与高亮{" "}
						{withDataRows.filter((r) => !excluded.has(r.source)).length}/
						{withDataRows.length} 家
					</Button>
					<Tooltip
						title={
							rssCopied
								? "已复制 RSS 链接"
								: `复制 RSS 订阅链接（${rssURL(from, to)}）`
						}
						slotProps={{ tooltip: { sx: { fontSize: 12 } } }}
					>
						<IconButton
							aria-label="复制 RSS 订阅链接"
							size="small"
							onClick={handleCopyRss}
							sx={{ color: rssCopied ? "primary.main" : "inherit" }}
						>
							<RssFeedIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Box>
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ display: { xs: "block", sm: "none" }, mb: 1 }}
				>
					左右滑动查看全部列，银行名固定不动 →
				</Typography>
				<BestPricePickerPopover
					anchor={pickerAnchor}
					onClose={() => setPickerAnchor(null)}
					sources={rows.map((r) => ({ source: r.source, label: r.name }))}
					excluded={excluded}
					clearSearchOnOpen
					onToggle={toggleExcluded}
					onSelectAll={selectAllSources}
					onReset={resetExcluded}
				/>
				<TableContainer
					component={Paper}
					elevation={1}
					sx={{ overflow: "auto" }}
				>
					<Table
						size="small"
						stickyHeader
						sx={{ minWidth: { xs: 640, sm: 720 } }}
					>
						<caption
							style={{
								position: "absolute",
								width: 1,
								height: 1,
								margin: -1,
								overflow: "hidden",
								clip: "rect(0 0 0 0)",
								whiteSpace: "nowrap",
							}}
						>
							{from} ↔ {to} 银行/平台买卖牌价表（每 {amount} 单位 {to}{" "}
							折合 {from}）
						</caption>
						<TableHead>
							<TableRow>
								{LIST_COLUMNS.map((col) => (
									<TableCell
										key={col.label}
										align={col.align}
										sx={{
											position:
												col.key == "name" ? "sticky" : "static",
											left: col.key == "name" ? 0 : "auto",
											zIndex: col.key == "name" ? 3 : "auto",
											minWidth:
												col.key == "name"
													? SOURCE_COL_MIN_WIDTH
													: undefined,
											bgcolor:
												col.key == "name"
													? "background.paper"
													: "inherit",
											borderRight:
												col.key == "name" ? "1px solid" : "none",
											borderColor: "divider",
											py: { xs: 0.75, sm: 1 },
											px: { xs: 1, sm: 1.5 },
											// 移动端表头字号略小，适配窄屏
											"& .MuiTableSortLabel-root": {
												fontSize: { xs: 12, sm: 14 },
											},
										}}
										sortDirection={
											sortKey == col.key ? sortDir : false
										}
									>
										{col.sortable ? (
											<TableSortLabel
												active={sortKey == col.key}
												direction={sortDir}
												onClick={() =>
													handleSort(col.key as SortKey)
												}
											>
												{col.label}
											</TableSortLabel>
										) : (
											<Tooltip
												title="数据更新时间"
												describeChild
												slotProps={{
													tooltip: { sx: { fontSize: 13 } },
												}}
											>
												<span aria-label={col.label}>{col.label}</span>
											</Tooltip>
										)}
									</TableCell>
								))}
							</TableRow>
						</TableHead>
						<TableBody>
							{sorted.map((row, idx) => {
								const cells: {
									key: string
									v: number | string | boolean | undefined
									target?: number
								}[] = [
									{ key: "buyCash", v: row.buyCash, target: best.buyCash },
									{ key: "buyRemit", v: row.buyRemit, target: best.buyRemit },
									{ key: "sellCash", v: row.sellCash, target: best.sellCash },
									{ key: "sellRemit", v: row.sellRemit, target: best.sellRemit },
									{ key: "middle", v: row.middle },
								]
								// 轻量斑马纹：奇数行低对比底色。斑马必须画在单元格层而非行层——
								// 行层底色会透过半透明 brandSoft 高亮格把对比度压到 4.22:1（axe 失败），
								// 画在单元格层则高亮格仍与 paper 合成（4.57:1 维持现状）。
								// hover 经 .MuiTableRow-hover:hover 子选择器覆盖为 action.hover，
								// 与偶数行行级 hover 表现一致
								const zebra = idx % 2 == 1
								return (
									<TableRow key={row.id} hover>
										<TableCell
											component="th"
											scope="row"
											align="left"
											sx={{
												position: "sticky",
												left: 0,
												zIndex: 1,
												// sticky 首列同步斑马底色，横向滚动时不露白
												bgcolor: zebra
													? "surfaceMuted"
													: "background.paper",
												borderRight: "1px solid",
												borderColor: "divider",
												whiteSpace: "nowrap",
												minWidth: SOURCE_COL_MIN_WIDTH,
												py: { xs: 0.75, sm: 1 },
												px: { xs: 0.75, sm: 1.5 },
											}}
										>
											<Box
												sx={{
													display: "flex",
													alignItems: "center",
													gap: { xs: 0.25, sm: 0.75 },
													// 移动端限制最大宽度，避免撑爆 sticky 列
													maxWidth: { xs: 150, sm: "none" },
												}}
											>
												{/* 银行图标、名称及链接/过期标志（单行，名称截断保证行高一致） */}
												<Box
													sx={{
														display: "flex",
														alignItems: "center",
														gap: 0.5,
														minWidth: 0,
														flex: 1,
													}}
												>
													<SourceIcon source={row.source} />
													<Box
														sx={{
															overflow: "hidden",
															textOverflow: "ellipsis",
															whiteSpace: "nowrap",
															minWidth: 0,
															flex: { xs: 1, sm: "initial" },
														}}
													>
														{row.name}
													</Box>
													{ratesPageURL(row.source) && (
														<Tooltip title="查看官方外汇牌价页">
															<Link
																href={ratesPageURL(row.source)!}
																target="_blank"
																rel="noopener noreferrer"
																aria-label={`${row.name} 官方外汇牌价`}
																onClick={(e) => e.stopPropagation()}
																sx={{
																	display: "inline-flex",
																	alignItems: "center",
																	justifyContent: "center",
																	minWidth: 24,
																	minHeight: 24,
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
													{row.stale && (
														<StaleIcon
															title={`该来源 ${relativeTime(row.updated)} 未更新，数据可能不准确`}
														/>
													)}
												</Box>
											</Box>
										</TableCell>
										{cells.map((c) => {
											const highlight = isBest(c.v, c.target)
											const stat = stats[c.key as keyof typeof stats]
											const n = toNumber(c.v)
											const label =
												LIST_COLUMNS.find((col) => col.key == c.key)?.label ??
												c.key
											// 购钞/购汇为买入价（越低越优），结钞/结汇为卖出价（越高越优）
											const betterLower = c.key.startsWith("buy")
											return (
												<TableCell
													key={c.key}
													align="right"
													sx={{
														...NUMERIC_CELL_LAYOUT,
														fontWeight:
															highlight && !row.stale ? 700 : "inherit",
														color: row.stale
															? "text.disabled"
															: highlight
																? "primary.main"
																: "inherit",
														backgroundColor:
															highlight && !row.stale
																? "brandSoft"
																: zebra
																	? "surfaceMuted"
																	: "inherit",
														// 斑马格行 hover 时转 action.hover（与偶数行行级 hover 一致）
														...(zebra && !highlight
															? {
																	"@media (hover: hover)": {
																		".MuiTableRow-hover:hover &": {
																			backgroundColor: "action.hover",
																		},
																	},
															  }
															: {}),
														py: { xs: 0.75, sm: 1 },
														px: { xs: 1, sm: 1.5 },
														// 移动端数字略小，多展示一列
														fontSize: { xs: 12, sm: 14 },
													}}
												>
													{n != undefined && stat ? (
														<StatsTip
															content={
																<CellStatsContent
																	from={from}
																	to={to}
																	label={label}
																	value={c.v}
																	current={n}
																	stat={stat}
																	betterLower={betterLower}
																	path={row.path}
																	alias={row.alias}
																/>
															}
														>
															<span
																style={{
																	cursor: "help",
																	...(row.path && row.path.length > 1
																		? {
																				textDecoration: "underline dotted",
																				textDecorationColor: "inherit",
																		  }
																		: {}),
																}}
																aria-label={
																	row.path && row.path.length > 1
																		? `${formatValue(c.v)}，经 ${row.path.join(" → ")} 折算`
																		: formatValue(c.v)
																}
															>
																{formatValue(c.v)}
															</span>
														</StatsTip>
													) : (
														formatValue(c.v)
													)}
													{highlight && !row.stale && <BestPriceMark />}
												</TableCell>
											)
										})}
										<TableCell
											align="right"
											sx={{
												whiteSpace: "nowrap",
												backgroundColor: zebra
													? "surfaceMuted"
													: "inherit",
												...(zebra
													? {
															"@media (hover: hover)": {
																".MuiTableRow-hover:hover &": {
																	backgroundColor: "action.hover",
																},
															},
													  }
													: {}),
											}}
										>
											<StatsTip
												content={
													<Typography variant="caption">
														{row.updated.toLocaleString("zh-CN")}
													</Typography>
												}
											>
												<span>
													<RelativeTime date={row.updated} />
												</span>
											</StatsTip>
										</TableCell>
									</TableRow>
								)
							})}
						</TableBody>
					</Table>
				</TableContainer>
			</Box>
		</StatsTipProvider>
	)
}

// 单元格统计浮层内容：当前值与平均/最高/最低的差值，以及过桥路径/别名说明
function CellStatsContent({
	from,
	to,
	label,
	value,
	current,
	stat,
	betterLower,
	path,
	alias,
}: {
	from: string
	to: string
	label: string
	value: number | string | boolean | undefined
	current: number
	stat: ColumnStats
	betterLower: boolean
	path?: string[]
	alias?: string
}) {
	return (
		<Box sx={{ py: 0.5 }}>
			<Typography
				variant="caption"
				sx={{ display: "block", fontWeight: 700, mb: 0.5 }}
			>
				{from} → {to} · {label}
			</Typography>
			<Typography
				variant="caption"
				sx={{
					display: "flex",
					justifyContent: "space-between",
					mb: 0.5,
					fontWeight: 600,
				}}
			>
				<span>当前</span>
				<span>{formatValue(value)}</span>
			</Typography>
			{[
				{ label: "平均", value: stat.mean },
				{ label: "最高", value: stat.max },
				{ label: "最低", value: stat.min },
			].map((row) => {
				const diff = current - row.value
				const pct = row.value != 0 ? (diff / row.value) * 100 : 0
				// 比平均更优（买入更低/卖出更高）→ 红；更差 → 绿
				const isBetter = betterLower ? diff < 0 : diff > 0
				const isWorse = betterLower ? diff > 0 : diff < 0
				return (
					<Typography
						key={row.label}
						variant="caption"
						sx={{ display: "flex", justifyContent: "space-between", gap: 2 }}
					>
						<span>
							{row.label} {fmt2(row.value)}
						</span>
						<span
							style={{
								color: isBetter ? "#ef5350" : isWorse ? "#66bb6a" : "inherit",
								fontWeight: isBetter || isWorse ? 700 : "inherit",
							}}
						>
							{fmtSigned(diff)} ({fmtSigned(pct)}%)
						</span>
					</Typography>
				)
			})}
			{(path && path.length > 1) || alias ? (
				<>
					{path && path.length > 1 && (
						<Typography
							variant="caption"
							sx={{
								display: "block",
								mt: 0.5,
								color: "primary.main",
								fontWeight: 700,
							}}
						>
							过桥： {path.join(" → ")}
						</Typography>
					)}
					{alias && (
						<Typography
							variant="caption"
							sx={{ display: "block", mt: 0.5, color: "primary.main" }}
						>
							实际按 {alias} 计（CNY/CNH 归一化）
						</Typography>
					)}
				</>
			) : null}
		</Box>
	)
}
