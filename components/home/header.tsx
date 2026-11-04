"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Tabs from "@mui/material/Tabs"
import Tab from "@mui/material/Tab"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import Button from "@mui/material/Button"
import MenuItem from "@mui/material/MenuItem"
import Menu from "@mui/material/Menu"
import TextField from "@mui/material/TextField"
import { alpha, useTheme } from "@mui/material/styles"
import RefreshIcon from "@mui/icons-material/Refresh"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import TuneIcon from "@mui/icons-material/Tune"
import DarkModeIcon from "@mui/icons-material/DarkMode"
import LightModeIcon from "@mui/icons-material/LightMode"
import MenuBookIcon from "@mui/icons-material/MenuBook"
import MoreVertIcon from "@mui/icons-material/MoreVert"

import { RelativeTime } from "../rateStats"
import { useThemeMode } from "../theme"
import type { View } from "../view-utils"

const PRECISION_OPTIONS: { value: number; label: string }[] = [
	{ value: -1, label: "原样" },
	{ value: 0, label: "0 位" },
	{ value: 2, label: "2 位" },
	{ value: 4, label: "4 位" },
	{ value: 6, label: "6 位" },
]

export interface HeaderProps {
	view: View
	onViewChange: (view: View) => void
	sourceCount: number | null
	lastUpdated: Date | null
	precision: number
	onPrecisionChange: (value: number) => void
	onPrecisionReset: () => void
	crossRates: boolean
	onCrossRatesToggle: () => void
	onRefresh: () => void
	onOpenApiDocs: () => void
}

// 顶部 sticky Header：标题、视图 Tabs、更新时间、精度、交叉汇率、刷新、API 文档、主题切换。
// xs（≤599.95px）把后五个操作收进「更多」溢出菜单，精度为锚定同按钮的二级菜单。
export default function Header(props: HeaderProps) {
	const {
		view,
		onViewChange,
		sourceCount,
		lastUpdated,
		precision,
		onPrecisionChange,
		onPrecisionReset,
		crossRates,
		onCrossRatesToggle,
		onRefresh,
		onOpenApiDocs,
	} = props
	const { mode, toggle } = useThemeMode()
	const theme = useTheme()
	// iOS Safari：backdrop-filter 合成层 bug 会吞掉页面触摸事件（点不动），降级为纯色背景
	const isIOS =
		typeof navigator != "undefined" &&
		/iPad|iPhone|iPod/.test(navigator.userAgent)

	// 移动端精度弹层锚点
	const [precisionAnchor, setPrecisionAnchor] =
		React.useState<HTMLElement | null>(null)
	// xs 溢出菜单锚点：五个 header 操作收纳进「更多」，窄屏下保持 header 干净
	const [overflowAnchor, setOverflowAnchor] =
		React.useState<HTMLElement | null>(null)

	const themeToggleTooltip = mode == "dark" ? "切换浅色模式" : "切换暗色模式"

	return (
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
					gap: { xs: 0.125, sm: 2 },
					flexWrap: "wrap",
					width: "100%",
					minWidth: 0,
				}}
			>
				<Box sx={{ display: "flex", alignItems: "center", mr: { xs: 0.25, sm: 0 } }}>
					<Typography
						variant="h6"
						component="h1"
						sx={{ fontWeight: 700, fontSize: { xs: 18, sm: 20 }, letterSpacing: 0 }}
					>
						FXRate
					</Typography>
				</Box>
				<Tabs
					value={view}
					onChange={(_, v) => onViewChange(v as View)}
					sx={(theme) => ({
						minHeight: 40,
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
							minHeight: 40,
							py: { xs: 0.25, sm: 0 },
							px: { xs: 1.5, sm: 2 },
							flex: { xs: 1, sm: 0 },
							borderRadius: { xs: "9999px", sm: 0 },
							fontSize: { xs: "0.8125rem", sm: "0.875rem" },
							fontWeight: 600,
							transition: "background-color 0.2s ease, color 0.2s ease",
							// 移动端选中 Tab：浅色用 primary.dark（于 brandSoft 7.3:1），
							// 暗色 primary.dark 仅 3.93:1，须换 primary.main（5.62:1）
							"&.Mui-selected": {
								bgcolor: { xs: "brandSoft", sm: "transparent" },
								color: {
									xs:
										theme.palette.mode == "dark"
											? "primary.main"
											: "primary.dark",
									sm: "primary.main",
								},
								fontWeight: 700,
							},
						},
					})}
				>
					<Tab value="pair" label="单对报价" />
					<Tab value="matrix" label="全对矩阵" />
				</Tabs>
				<Box sx={{ flexGrow: 1 }} />
				{sourceCount != null && (
					<Typography
						variant="caption"
						color="text.secondary"
						sx={{ display: { xs: "none", sm: "block" } }}
					>
						{sourceCount} 家来源
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
							onPrecisionReset()
						} else {
							onPrecisionChange(Number(e.target.value))
						}
					}}
					sx={{
						display: { xs: "none", sm: "block" },
						width: 84,
					}}
					inputProps={{ "aria-label": "小数精度" }}
				>
					{PRECISION_OPTIONS.map((option) => (
						<MenuItem key={option.value} value={option.value}>
							{option.label}
						</MenuItem>
					))}
					<MenuItem value="default">恢复默认</MenuItem>
				</TextField>
				{/* xs 精度子菜单：由溢出菜单的「小数精度」打开（锚定在更多按钮） */}
				<Menu
					anchorEl={precisionAnchor}
					open={Boolean(precisionAnchor)}
					onClose={() => setPrecisionAnchor(null)}
				>
					{PRECISION_OPTIONS.map((option) => (
						<MenuItem
							key={option.value}
							selected={precision == option.value}
							onClick={() => {
								onPrecisionChange(option.value)
								setPrecisionAnchor(null)
							}}
						>
							{option.label}
						</MenuItem>
					))}
					<MenuItem
						onClick={() => {
							onPrecisionReset()
							setPrecisionAnchor(null)
						}}
					>
						恢复默认
					</MenuItem>
				</Menu>
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
						onClick={onCrossRatesToggle}
						sx={{
							display: { xs: "none", sm: "inline-flex" },
							color: crossRates ? "primary.main" : "inherit",
							whiteSpace: "nowrap",
						}}
					>
						交叉汇率
					</Button>
				</Tooltip>
				<Tooltip title="刷新">
					<IconButton
						aria-label="刷新"
						size="small"
						onClick={onRefresh}
						sx={{ display: { xs: "none", sm: "inline-flex" } }}
					>
						<RefreshIcon fontSize="small" />
					</IconButton>
				</Tooltip>
				<Tooltip title="API 文档">
					<IconButton
						aria-label="API 文档"
						size="small"
						onClick={onOpenApiDocs}
						sx={{ display: { xs: "none", sm: "inline-flex" } }}
					>
						<MenuBookIcon fontSize="small" />
					</IconButton>
				</Tooltip>
				<Tooltip title={themeToggleTooltip}>
					<IconButton
						aria-label="切换主题"
						size="small"
						onClick={toggle}
						sx={{ display: { xs: "none", sm: "inline-flex" } }}
					>
						{mode == "dark" ? (
							<LightModeIcon fontSize="small" />
						) : (
							<DarkModeIcon fontSize="small" />
						)}
					</IconButton>
				</Tooltip>
				{/* xs 溢出菜单触发器：其余 header 操作收进「更多」，窄屏下保持 header 干净 */}
				<Box sx={{ display: { xs: "inline-flex", sm: "none" }, flexShrink: 0 }}>
					<Tooltip title="更多操作">
						<IconButton
							aria-label="更多"
							size="small"
							onClick={(e) => setOverflowAnchor(e.currentTarget)}
						>
							<MoreVertIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				</Box>
				<Menu
					anchorEl={overflowAnchor}
					open={Boolean(overflowAnchor)}
					onClose={() => setOverflowAnchor(null)}
				>
					<MenuItem
						aria-haspopup="menu"
						aria-expanded={Boolean(precisionAnchor)}
						onClick={() => {
							setPrecisionAnchor(overflowAnchor)
							setOverflowAnchor(null)
						}}
					>
						<TuneIcon fontSize="small" sx={{ mr: 1 }} />
						小数精度
					</MenuItem>
					<MenuItem
						selected={crossRates}
						onClick={() => {
							onCrossRatesToggle()
							setOverflowAnchor(null)
						}}
					>
						<SwapHorizIcon fontSize="small" sx={{ mr: 1 }} />
						交叉汇率
					</MenuItem>
					<MenuItem
						onClick={() => {
							onRefresh()
							setOverflowAnchor(null)
						}}
					>
						<RefreshIcon fontSize="small" sx={{ mr: 1 }} />
						刷新
					</MenuItem>
					<MenuItem
						onClick={() => {
							onOpenApiDocs()
							setOverflowAnchor(null)
						}}
					>
						<MenuBookIcon fontSize="small" sx={{ mr: 1 }} />
						API 文档
					</MenuItem>
					<MenuItem
						onClick={() => {
							toggle()
							setOverflowAnchor(null)
						}}
					>
						{mode == "dark" ? (
							<LightModeIcon fontSize="small" sx={{ mr: 1 }} />
						) : (
							<DarkModeIcon fontSize="small" sx={{ mr: 1 }} />
						)}
						切换主题
					</MenuItem>
				</Menu>
			</Box>
		</Box>
	)
}
