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
import Tooltip from "@mui/material/Tooltip"
import Link from "@mui/material/Link"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"

import {
	getName,
	NUMERIC_CELL_LAYOUT,
	ratesPageURL,
	SOURCE_COL_MIN_WIDTH,
} from "../tools"
import {
	cellOf,
	formatValue,
	toNumber,
	type MatrixDisplayData,
	type PriceType,
	type SourceLoadStatus,
} from "../matrix-utils"
import BestPriceMark from "../bestPriceMark"
import { SourceIcon, currencyEmoji } from "../sourceIcon"
import {
	computeStats,
	isStale,
	StatsTip,
	StatsTooltip,
	StaleIcon,
	useMounted,
} from "../rateStats"
import { matrixColumnValues, matrixUpdatedBySource } from "./display"

// 矩阵表格：表头（来源列 + 货币列排序）、数据行（最优价高亮、斑马、过桥提示）、
// 慢源「点击加载」行与自动补查失败/加载中的占位行。
export default function MatrixTable({
	displayData,
	from,
	amount,
	reverse,
	priceType,
	currencies,
	sources,
	best,
	excluded,
	sortKey,
	sortDir,
	onSort,
	sourceStatus,
	sourceError,
	extraRowsReady,
	extraSources,
	onLoadSource,
}: {
	displayData: MatrixDisplayData
	from: string
	amount: number
	reverse: boolean
	priceType: PriceType
	currencies: string[]
	sources: string[]
	best: { [currency: string]: number }
	excluded: Set<string>
	sortKey: string | null
	sortDir: "asc" | "desc"
	onSort: (currency: string) => void
	sourceStatus: { [source: string]: SourceLoadStatus }
	sourceError: { [source: string]: string }
	// 额外行快照是否属于当前参数 key；否则不渲染额外行占位
	extraRowsReady: boolean
	// 需要渲染「点击加载」占位行的慢源
	extraSources: string[]
	onLoadSource: (source: string) => void
}) {
	// hydration 安全：挂载前 stale 视为 false（isStale 依赖 Date.now()）
	const mounted = useMounted()
	const colValues = React.useMemo(
		() => matrixColumnValues(currencies, sources, displayData, priceType, excluded),
		[currencies, sources, displayData, priceType, excluded]
	)
	const colStats = React.useMemo(() => {
		const stats: { [c: string]: ReturnType<typeof computeStats> } = {}
		for (const c of currencies) stats[c] = computeStats(colValues[c])
		return stats
	}, [currencies, colValues])
	const updatedBySource = React.useMemo(
		() => matrixUpdatedBySource(sources, displayData),
		[sources, displayData]
	)

	// 自动补查中/失败且尚无数据的来源：渲染可重试的状态行。
	// 只排除主数据里已有该来源、或已进入可见来源行的来源
	const pendingAutoSources = React.useMemo(
		() =>
			extraRowsReady
				? Object.keys(sourceStatus).filter(
						(s) =>
							!extraSources.includes(s) &&
							(sourceStatus[s] == "error" ||
								sourceStatus[s] == "loading") &&
							!sources.includes(s) && !extraSources.includes(s)
				  )
				: [],
		[extraRowsReady, sourceStatus, extraSources, sources]
	)

	// 自动补查中/失败且还没有可用数据的来源：渲染可重试的状态行。
	// 主数据里存在但整行为空的来源（如卡组织全表 403）不进入可见来源行，
	// 由这里承载「加载中/加载失败，重试」；已进入可见行或已有「点击加载」行的来源不再重复
	const renderStatusRow = (s: string, label: string) => (
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
				<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
					<SourceIcon source={s} />
					{getName(s)}
					<Tooltip title={sourceError[s] ?? ""} describeChild>
						<Button
							size="small"
							variant="tonal"
							disabled={sourceStatus[s] == "loading"}
							onClick={() => onLoadSource(s)}
						>
							{label}
						</Button>
					</Tooltip>
				</Box>
			</TableCell>
		</TableRow>
	)

	return (
		<TableContainer component={Paper} elevation={1} sx={{ overflow: "auto" }}>
			<Table size="small" stickyHeader sx={{ minWidth: { xs: 780, sm: 960 } }}>
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
					基准货币 {from} 的全对矩阵牌价表（每 {amount} 单位各货币
					{reverse ? "折合" : "兑换"} {from}）
				</caption>
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
								// 角落格需高于 MUI stickyHeader 默认 zIndex(2) 与其后的
								// 货币表头同层，才能在双轴滚动时盖住表头行与首列的交叉区
								zIndex: 3,
								minWidth: SOURCE_COL_MIN_WIDTH,
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
								sortDirection={sortKey == c ? sortDir : false}
								sx={{
									py: { xs: 0.75, sm: 1 },
									px: { xs: 1, sm: 1.5 },
								}}
							>
								<TableSortLabel
									active={sortKey == c}
									direction={sortDir}
									onClick={() => onSort(c)}
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
					{currencies.length == 0 && (
						<TableRow>
							<TableCell
								colSpan={1}
								align="center"
								sx={{ py: 4, color: "text.secondary" }}
							>
								未选择显示货币，请通过“显示货币”选择至少一种货币
							</TableCell>
						</TableRow>
					)}
					{sources.map((s, idx) => {
						// 该源各货币最新更新时间：任一 cell 超过 STALE_MS 视为整行可能不准确
						const rowUpdated = updatedBySource[s]
						const rowStale = mounted && !!rowUpdated && isStale(rowUpdated)
						// 轻量斑马纹：奇数行低对比底色。斑马必须画在单元格层而非行层——
						// 行层底色会透过半透明 brandSoft 高亮格把对比度压到 4.22:1（axe 失败），
						// 画在单元格层则高亮格仍与 paper 合成（4.57:1 维持现状）。
						// hover 经 .MuiTableRow-hover:hover 子选择器覆盖为 action.hover，
						// 与偶数行行级 hover 表现一致
						const zebra = idx % 2 == 1
						return (
							<TableRow key={s} hover>
								<TableCell
									component="th"
									scope="row"
									sx={{
										position: "sticky",
										left: 0,
										// sticky 首列同步斑马底色，横向滚动时不露白
										bgcolor: zebra ? "surfaceMuted" : "background.paper",
										borderRight: "1px solid",
										borderColor: "divider",
										zIndex: 1,
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
										{rowStale && (
											<StaleIcon
												title={`该来源 ${rowUpdated!.toLocaleString("zh-CN")} 未更新，数据可能不准确`}
											/>
										)}
									</Box>
								</TableCell>
								{currencies.map((c) => {
									const cell = displayData[s][c]
									const v = cellOf(cell, priceType)
									const n = toNumber(v)
									const highlight = !rowStale && n != undefined && n == best[c]
									return (
										<TableCell
											key={c}
											align="right"
											sx={{
												...NUMERIC_CELL_LAYOUT,
												fontWeight: highlight ? 700 : "inherit",
												color: rowStale
													? "text.disabled"
													: highlight
														? "primary.main"
														: "inherit",
												backgroundColor: highlight
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
												fontSize: { xs: 12, sm: 14 },
											}}
										>
											{n != undefined && colStats[c] ? (
												<StatsTip
													content={
														<>
															{cell?.updated && (
																<Typography
																	variant="caption"
																	color="text.secondary"
																	sx={{ display: "block", mb: 0.5 }}
																>
																	更新于 {cell.updated.toLocaleString("zh-CN")}
																</Typography>
															)}
															<StatsTooltip
																title={`${currencyEmoji(c) ?? ""} ${c}`}
																current={n}
																stats={colStats[c]!}
																betterLower={false}
															/>
															{cell?.path && cell.path.length > 1 && (
																<Typography
																	variant="caption"
																	sx={{
																		display: "block",
																		mt: 0.5,
																		color: "primary.main",
																		fontWeight: 700,
																	}}
																>
																	过桥： {cell.path.join(" → ")}
																</Typography>
															)}
															{cell?.alias && (
																<Typography
																	variant="caption"
																	sx={{
																		display: "block",
																		mt: 0.5,
																		color: "primary.main",
																	}}
																>
																	实际按 {cell.alias} 计（CNY/CNH 归一化）
																</Typography>
															)}
														</>
													}
												>
													<span
														style={{
															cursor: "help",
															...(cell?.path && cell.path.length > 1
																? {
																		textDecoration: "underline dotted",
																		textDecorationColor: "inherit",
																  }
																: {}),
														}}
														aria-label={
															cell?.path && cell.path.length > 1
																? `${formatValue(v)}，经 ${cell.path.join(" → ")} 折算`
																: formatValue(v)
														}
													>
														{formatValue(v)}
													</span>
												</StatsTip>
											) : (
												formatValue(v)
											)}
											{highlight && <BestPriceMark />}
										</TableCell>
									)
								})}
							</TableRow>
						)
					})}
					{currencies.length > 0 &&
						extraSources.map((s) =>
							renderStatusRow(
								s,
								sourceStatus[s] == "loading"
									? "加载中..."
									: sourceStatus[s] == "error"
										? "加载失败，重试"
										: "点击加载"
							)
						)}
					{currencies.length > 0 &&
						pendingAutoSources.map((s) =>
							renderStatusRow(
								s,
								sourceStatus[s] == "loading" ? "加载中..." : "加载失败，重试"
							)
						)}
				</TableBody>
			</Table>
		</TableContainer>
	)
}
