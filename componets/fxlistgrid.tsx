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
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Popover from "@mui/material/Popover"
import TextField from "@mui/material/TextField"
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents"
import RssFeedIcon from "@mui/icons-material/RssFeed"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import Link from "@mui/material/Link"
import { sourceNamesInZH } from "@/lib/fxrate/src/constant"
import { useBestPriceSources } from "@/componets/bestPriceSources"
import { SourceIcon } from "@/componets/sourceIcon"
import { rssURL, ratesPageURL } from "@/componets/tools"
import {
	RateValue,
	toNumber,
	fmt2,
	fmtSigned,
	ColumnStats,
	computeStats,
	isStale,
	StatsTip,
	StatsTipProvider,
	StaleIcon,
	useMounted,
} from "@/componets/rateStats"

export interface FXListProps {
	name: string
	type: {
		buy?: { cash?: number | string; remit?: number | string }
		sell?: { cash?: number | string; remit?: number | string }
		middle?: number | string
	}
	updated: Date
	id?: number
	// 交叉汇率时后端回传的实际兑换路径（如 ["CNH","HKD","JPY"]）
	path?: string[]
	// CNY/CNH 归一化：源只用 CNH 报价时实际使用 CNH 汇率（后端 alias 字段）
	alias?: string
}

const nameMapping: { [x: string]: string } = sourceNamesInZH

function getName(name: string): string {
	if (nameMapping[name]) {
		return nameMapping[name] + ` (${name})`
	} else return name
}

type SortKey = "name" | "buyCash" | "buyRemit" | "sellCash" | "sellRemit" | "middle"

interface Column {
	key: SortKey | "updated"
	label: string
	align: "left" | "right"
	sortable?: boolean
}

const columns: Column[] = [
	{ key: "name", label: "银行/平台", align: "left", sortable: true },
	{ key: "buyCash", label: "购钞价", align: "left", sortable: true },
	{ key: "buyRemit", label: "购汇价", align: "left", sortable: true },
	{ key: "sellCash", label: "结钞价", align: "left", sortable: true },
	{ key: "sellRemit", label: "结汇价", align: "left", sortable: true },
	{ key: "middle", label: "中间价", align: "left", sortable: true },
	{ key: "updated", label: "更新时间", align: "right" },
]

const formatValue = (v: RateValue): string =>
	typeof v == "number" || typeof v == "string" ? String(v) : "—"

// 统计某列所有有效数值（不含被排除来源）：平均/最高/最低
function computeColumnStats(
	rows: Row[],
	excluded: Set<string>,
	get: (r: Row) => RateValue
): ColumnStats | undefined {
	return computeStats(
		rows
			.filter((r) => !excluded.has(r.source))
			.map((r) => toNumber(get(r)))
	)
}

export function relativeTime(date: Date): string {
	const diff = Date.now() - date.getTime()
	if (diff < 60000) return "刚刚"
	if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
	if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
	return `${Math.floor(diff / 86400000)} 天前`
}

// hydration 安全的相对时间：SSR/客户端首帧渲染 null，挂载后再显示
export function RelativeTime({ date }: { date: Date }) {
	const mounted = useMounted()
	if (!mounted) return null
	return <>{relativeTime(date)}</>
}

interface Row {
	id: number
	source: string
	name: string
	updated: Date
	stale: boolean
	buyCash?: number | string | boolean
	buyRemit?: number | string | boolean
	sellCash?: number | string | boolean
	sellRemit?: number | string | boolean
	middle?: number | string | boolean
	path?: string[]
	alias?: string
}

const numCmp = (a: number | undefined, b: number | undefined): number => {
	if (a == undefined && b == undefined) return 0
	if (a == undefined) return 1
	if (b == undefined) return -1
	return a - b
}

export default React.memo(FXListGrid)

function FXListGrid({
	props,
	from,
	to,
	amount,
	precision = -1,
}: {
	props: FXListProps[]
	from: string
	to: string
	amount: number
	precision?: number
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

	const rows: Row[] = React.useMemo(
		() =>
			props
				.slice()
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((k, i) => ({
					id: i + 1,
					source: k.name,
					name: getName(k.name),
					updated: k.updated,
					stale: mounted && isStale(k.updated),
					buyCash: k.type.buy?.cash,
					buyRemit: k.type.buy?.remit,
					sellCash: k.type.sell?.cash,
					sellRemit: k.type.sell?.remit,
					middle: k.type.middle,
					path: k.path,
					alias: k.alias,
				})),
		[props, mounted]
	)

	const sorted = React.useMemo(() => {
		const copy = rows.slice()
		copy.sort((a, b) => {
			let cmp = 0
			if (sortKey == "name") {
				cmp = a.name.localeCompare(b.name)
			} else {
				const va = toNumber(a[sortKey])
				const vb = toNumber(b[sortKey])
				cmp = numCmp(va, vb)
			}
			return sortDir == "asc" ? cmp : -cmp
		})
		return copy
	}, [rows, sortKey, sortDir])

	// 购钞/购汇取最低成本，结钞/结汇取最高所得
	const best = React.useMemo(() => {
		const pick = (
			get: (r: Row) => RateValue,
			dir: "min" | "max"
		): number | undefined => {
			let found: number | undefined
			for (const r of rows) {
				if (excluded.has(r.source)) continue
				const n = toNumber(get(r))
				if (n == undefined) continue
				if (
					found == undefined ||
					(dir == "min" ? n < found : n > found)
				) {
					found = n
				}
			}
			return found
		}
		return {
			buyCash: pick((r) => r.buyCash, "min"),
			buyRemit: pick((r) => r.buyRemit, "min"),
			sellCash: pick((r) => r.sellCash, "max"),
			sellRemit: pick((r) => r.sellRemit, "max"),
		}
	}, [rows, excluded])

	const stats = React.useMemo(
		() => ({
			buyCash: computeColumnStats(rows, excluded, (r) => r.buyCash),
			buyRemit: computeColumnStats(rows, excluded, (r) => r.buyRemit),
			sellCash: computeColumnStats(rows, excluded, (r) => r.sellCash),
			sellRemit: computeColumnStats(rows, excluded, (r) => r.sellRemit),
			middle: computeColumnStats(rows, excluded, (r) => r.middle),
		}),
		[rows, excluded]
	)

	const handleSort = (key: SortKey) => {
		if (key == sortKey) {
			setSortDir((d) => (d == "asc" ? "desc" : "asc"))
		} else {
			setSortKey(key)
			setSortDir("asc")
		}
	}

	// 最优价弹层：来源搜索过滤
	const [pickerSearch, setPickerSearch] = React.useState("")
	const pickerFilteredRows = React.useMemo(
		() =>
			rows.filter((r) =>
				r.name.toLowerCase().includes(
					pickerSearch.trim().toLowerCase()
				)
			),
		[rows, pickerSearch]
	)

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

	const isBest = (v: RateValue, target: number | undefined): boolean =>
		target != undefined && toNumber(v) != undefined && toNumber(v) == target

	// 当前数据中有报价的来源数（至少一个价格列有值）
	const withDataRows = React.useMemo(
		() =>
			rows.filter(
				(r) =>
					toNumber(r.buyCash) != undefined ||
					toNumber(r.buyRemit) != undefined ||
					toNumber(r.sellCash) != undefined ||
					toNumber(r.sellRemit) != undefined ||
					toNumber(r.middle) != undefined
			).length,
		[rows]
	)

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
					onClick={(e) => {
						setPickerSearch("")
						setPickerAnchor(e.currentTarget)
					}}
					sx={{ ml: { xs: 0, sm: "auto" } }}
				>
					最优价{" "}
					{rows.filter((r) => !excluded.has(r.source)).length}/
					{withDataRows} 家
				</Button>
				<Tooltip
					title={rssCopied ? "已复制 RSS 链接" : `复制 RSS 订阅链接（${rssURL(from, to)}）`}
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
			<Popover
				open={Boolean(pickerAnchor)}
				anchorEl={pickerAnchor}
				onClose={() => setPickerAnchor(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
				transformOrigin={{ vertical: "top", horizontal: "right" }}
			>
				<Box
					sx={{
						p: 1.5,
						width: { xs: 280, sm: 320 },
						maxHeight: 420,
						overflow: "auto",
					}}
				>
					<Typography variant="subtitle2" sx={{ mb: 1 }}>
						参与最优价高亮的来源
					</Typography>
					<TextField
						size="small"
						placeholder="搜索银行..."
						value={pickerSearch}
						onChange={(e) => setPickerSearch(e.target.value)}
						sx={{ mb: 1 }}
					/>
					{pickerFilteredRows.map((r) => (
						<FormControlLabel
							key={r.source}
							control={
								<Checkbox
									size="small"
									checked={!excluded.has(r.source)}
									onChange={() => toggleExcluded(r.source)}
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
									<SourceIcon source={r.source} size={14} />
									{r.name}
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
								setPickerAnchor(null)
							}}
						>
							恢复默认（仅银行）
						</Button>
					</Box>
				</Box>
			</Popover>
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
					<TableHead>
						<TableRow>
							{columns.map((col) => (
								<TableCell
									key={col.label}
									align={col.align}
									sx={{
										position:
											col.key == "name" ? "sticky" : "static",
										left: col.key == "name" ? 0 : "auto",
										zIndex: col.key == "name" ? 3 : "auto",
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
											slotProps={{
												tooltip: { sx: { fontSize: 13 } },
											}}
										>
											<span>{col.label}</span>
										</Tooltip>
									)}
								</TableCell>
							))}
						</TableRow>
					</TableHead>
					<TableBody>
						{sorted.map((row) => {
							const cells: {
								key: string
								v: RateValue
								target?: number
							}[] = [
								{ key: "buyCash", v: row.buyCash, target: best.buyCash },
								{ key: "buyRemit", v: row.buyRemit, target: best.buyRemit },
								{ key: "sellCash", v: row.sellCash, target: best.sellCash },
								{ key: "sellRemit", v: row.sellRemit, target: best.sellRemit },
								{ key: "middle", v: row.middle },
							]
							return (
								<TableRow key={row.id} hover>
								<TableCell
									align="left"
									sx={{
										position: "sticky",
										left: 0,
										zIndex: 1,
										bgcolor: "background.paper",
										borderRight: "1px solid",
										borderColor: "divider",
										whiteSpace: "nowrap",
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
										columns.find(
											(col) => col.key == c.key
										)?.label ?? c.key
									// 购钞/购汇为买入价（越低越优），结钞/结汇为卖出价（越高越优）
									const betterLower =
										c.key.startsWith("buy")
									return (
										<TableCell
											key={c.key}
											align="left"
											sx={{
												fontWeight:
													highlight && !row.stale
														? 700
														: "inherit",
												color: row.stale
													? "text.disabled"
													: highlight
														? "primary.main"
														: "inherit",
												backgroundColor:
													highlight && !row.stale
														? "brandSoft"
														: "inherit",
												py: { xs: 0.75, sm: 1 },
												px: { xs: 1, sm: 1.5 },
												// 移动端数字略小，多展示一列
												fontSize: { xs: 12, sm: 14 },
											}}
										>
											{n != undefined && stat ? (
												<StatsTip
													content={
														<Box sx={{ py: 0.5 }}>
															<Typography
																variant="caption"
																sx={{
																	display: "block",
																	fontWeight: 700,
																	mb: 0.5,
																}}
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
																<span>{formatValue(c.v)}</span>
															</Typography>
															{[
																{
																	label: "平均",
																	value: stat.mean,
																},
																{
																	label: "最高",
																	value: stat.max,
																},
																{
																	label: "最低",
																	value: stat.min,
																},
															].map((row) => {
																const diff =
																	n - row.value
																const pct =
																	row.value != 0
																		? (diff / row.value) *
																		  100
																		: 0
																// 比平均更优（买入更低/卖出更高）→ 红；更差 → 绿
																const isBetter =
																	betterLower
																		? diff < 0
																		: diff > 0
																const isWorse =
																	betterLower
																		? diff > 0
																		: diff < 0
																return (
																	<Typography
																		key={row.label}
																		variant="caption"
																		sx={{
																			display:
																				"flex",
																			justifyContent:
																				"space-between",
																			gap: 2,
																		}}
																	>
																		<span>
																			{row.label}{" "}
																			{fmt2(
																				row.value
																			)}
																		</span>
																		<span
																			style={{
																				color: isBetter
																					? "#ef5350"
																					: isWorse
																						? "#66bb6a"
																						: "inherit",
																				fontWeight:
																					isBetter ||
																					isWorse
																						? 700
																						: "inherit",
																			}}
																		>
																			{fmtSigned(
																				diff
																			)}{" "}
																			(
																			{fmtSigned(
																				pct
																			)}
																			%)
																		</span>
																	</Typography>
																)
															})}
															{(row.path && row.path.length > 1) || row.alias ? (
																<>
																	{row.path && row.path.length > 1 && (
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
																			{row.path.join(" → ")}
																		</Typography>
																	)}
																	{row.alias && (
																		<Typography
																			variant="caption"
																			sx={{
																				display: "block",
																				mt: 0.5,
																				color: "primary.main",
																			}}
																		>
																			实际按{" "}
																			{row.alias}{" "}
																			计（CNY/CNH 归一化）
																		</Typography>
																	)}
																</>
															) : null}
														</Box>
													}
												>
													<span
														style={{
															cursor: "help",
															...(row.path &&
															row.path.length > 1
																? {
																		textDecoration:
																			"underline dotted",
																		textDecorationColor:
																			"inherit",
																  }
																: {}),
														}}
													>
														{formatValue(c.v)}
													</span>
												</StatsTip>
											) : (
												formatValue(c.v)
											)}
										</TableCell>
									)
								})}
									<TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
										<StatsTip
											content={
												<Typography variant="caption">
													{row.updated.toLocaleString("zh-CN")}
												</Typography>
											}
										>
											<span><RelativeTime date={row.updated} /></span>
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
