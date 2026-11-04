"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import ChecklistIcon from "@mui/icons-material/Checklist"
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents"

import BestPricePickerPopover from "./bestPricePickerPopover"
import { useBestPriceSources } from "./bestPriceSources"
import { getName } from "./tools"
import { priceTypeLabels, type PriceType } from "./matrix-utils"
import { StatsTipProvider } from "./rateStats"
import CurrencyPickerPopover from "./matrix/currency-picker"
import MatrixTable from "./matrix/matrix-table"
import { useMatrixExtraRows } from "./matrix/use-extra-rows"
import { useBaseVisibleCurrencies, useVisibleCurrencies } from "./matrix/use-visible-currencies"
import {
	matrixBestByCurrency,
	matrixSources,
	sortMatrixSources,
	visibleMatrixSources,
} from "./matrix/display"
import type { RatesMatrix } from "./tools"

export default React.memo(FXMatrixGrid)

// 全对矩阵视图：可见货币/报价类型/排序/最优价参与集等展示状态在这里，
// 额外行数据与合并由 useMatrixExtraRows 负责，表格渲染由 MatrixTable 负责。
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
	const [pickerAnchor, setPickerAnchor] = React.useState<HTMLElement | null>(null)
	const [bestSourceAnchor, setBestSourceAnchor] =
		React.useState<HTMLElement | null>(null)
	const [sortKey, setSortKey] = React.useState<string | null>(null)
	const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc")
	const {
		excluded,
		toggle: toggleExcluded,
		reset: resetExcluded,
		selectAll: selectAllSources,
	} = useBestPriceSources()

	const {
		enabled,
		allCurrencies,
		defaultCurrencies,
		currencies,
		toggleCurrency,
		resetCurrencies,
	} = useVisibleCurrencies(data, from)

	// 可见货币签名（仅主数据 + 启用集合，不含额外行）：用于构造请求 key。
	// 额外行新增的货币列不应触发整批额外行重置，故 key 只随主数据/启用集变化
	const baseCurrencies = useBaseVisibleCurrencies(data, from, enabled)
	const visibleCurrenciesKey = React.useMemo(
		() => [...baseCurrencies].sort().join(","),
		[baseCurrencies]
	)
	const rowParamsKey =
		`${from}-${amount}-p${precision}-${crossRates ? "bfs" : "direct"}-` +
		`${reverse ? "reverse" : "forward"}-r${refreshGeneration}-${visibleCurrenciesKey}`

	const {
		displayData,
		extraRows,
		sourceStatus,
		sourceError,
		handleLoadSource,
	} = useMatrixExtraRows({
		data,
		from,
		amount,
		precision,
		reverse,
		crossRates,
		slowSources,
		sourceCurrencies,
		currencies,
		rowParamsKey,
		priceType,
	})

	const sources = React.useMemo(
		() => matrixSources(displayData, getName),
		[displayData]
	)
	const best = React.useMemo(
		() =>
			matrixBestByCurrency(
				sources,
				currencies,
				displayData,
				priceType,
				excluded
			),
		[sources, currencies, displayData, priceType, excluded]
	)

	const handleSort = (c: string) => {
		if (sortKey == c) {
			setSortDir((d) => (d == "asc" ? "desc" : "asc"))
		} else {
			setSortKey(c)
			setSortDir("asc")
		}
	}

	const sortedSources = React.useMemo(
		() =>
			sortMatrixSources(sources, displayData, priceType, sortKey, sortDir),
		[sources, displayData, priceType, sortKey, sortDir]
	)
	const visibleSources = React.useMemo(
		() => visibleMatrixSources(sortedSources, currencies, displayData, priceType),
		[sortedSources, currencies, displayData, priceType]
	)

	// 主数据在矩阵刷新后可能新增来源行（如 MasterCard 全表恢复）：自动补查对
	// 非慢源以「主数据是否存在该来源」判断，而不是只看 displayData（含额外行）
	const extraRowsReady = extraRows.key == rowParamsKey
	const extraSources = React.useMemo(
		() =>
			slowSources.filter(
				(s) =>
					extraRowsReady &&
					!(s in extraRows.data) &&
					sourceStatus[s] != "success"
			),
		[slowSources, extraRowsReady, extraRows.data, sourceStatus]
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
							onClick={(e) => setBestSourceAnchor(e.currentTarget)}
						>
							参与高亮{" "}
							{visibleSources.filter((s) => !excluded.has(s)).length}/
							{visibleSources.length} 家
						</Button>
						<Button
							size="small"
							variant="outlined"
							color="inherit"
							startIcon={<ChecklistIcon />}
							onClick={(e) => setPickerAnchor(e.currentTarget)}
						>
							显示货币 {currencies.length}/{allCurrencies.length}
						</Button>
						<ToggleButtonGroup
							size="small"
							exclusive
							value={priceType}
							aria-label="报价类型"
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
									// 选中项：暗色 primary.dark 于 brandSoft 仅 3.4:1，须换 primary.main（4.8:1）
									"&.Mui-selected": {
										bgcolor: "brandSoft",
										color: (t: { palette: { mode: string } }) =>
											t.palette.mode == "dark"
												? "primary.main"
												: "primary.dark",
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
				<CurrencyPickerPopover
					anchor={pickerAnchor}
					onClose={() => setPickerAnchor(null)}
					allCurrencies={allCurrencies}
					defaultCurrencies={defaultCurrencies}
					enabled={enabled}
					onToggle={toggleCurrency}
					onReset={resetCurrencies}
				/>
				<BestPricePickerPopover
					anchor={bestSourceAnchor}
					onClose={() => setBestSourceAnchor(null)}
					sources={visibleSources.map((s) => ({ source: s, label: getName(s) }))}
					excluded={excluded}
					onToggle={toggleExcluded}
					onSelectAll={selectAllSources}
					onReset={resetExcluded}
				/>
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ display: { xs: "block", sm: "none" }, mb: 1 }}
				>
					左右滑动查看已选货币 →
				</Typography>
				<MatrixTable
					displayData={displayData}
					from={from}
					amount={amount}
					reverse={reverse}
					priceType={priceType}
					currencies={currencies}
					sources={visibleSources}
					best={best}
					excluded={excluded}
					sortKey={sortKey}
					sortDir={sortDir}
					onSort={handleSort}
					sourceStatus={sourceStatus}
					sourceError={sourceError}
					extraRowsReady={extraRowsReady}
					extraSources={extraSources}
					onLoadSource={handleLoadSource}
				/>
			</Box>
		</StatsTipProvider>
	)
}
