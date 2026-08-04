"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import Popover from "@mui/material/Popover"
import Typography from "@mui/material/Typography"
import Tooltip from "@mui/material/Tooltip"
import { useMediaQuery } from "@mui/material"
import ScheduleIcon from "@mui/icons-material/Schedule"
import { useTheme } from "@mui/material/styles"

export type RateValue = number | string | boolean | undefined

export const toNumber = (v: RateValue): number | undefined => {
	if (typeof v == "number") return v
	if (typeof v == "string" && v.trim() != "") {
		const n = Number(v)
		return Number.isNaN(n) ? undefined : n
	}
	return undefined
}

export const fmt2 = (n: number) => n.toFixed(2)

export const fmtSigned = (n: number) => (n >= 0 ? `+${fmt2(n)}` : fmt2(n))

export interface ColumnStats {
	mean: number
	max: number
	min: number
}

// 统计集合内所有有效数值的平均/最高/最低；空集合返回 undefined
export function computeStats(
	values: (number | undefined)[]
): ColumnStats | undefined {
	const nums = values.filter((n): n is number => n != undefined)
	if (nums.length == 0) return undefined
	return {
		mean: nums.reduce((a, b) => a + b, 0) / nums.length,
		max: Math.max(...nums),
		min: Math.min(...nums),
	}
}

// 超过 36 小时未更新的数据视为可能不准确
export const STALE_MS = 36 * 60 * 60 * 1000

export const isStale = (updated: Date) =>
	Date.now() - updated.getTime() > STALE_MS

// hydration 安全：服务端快照返回 false，客户端挂载后经 useSyncExternalStore
// 检查翻转为 true（无 effect/setState，避免 Date.now() 边界渲染不一致）
const neverSubscribe = () => () => {}

export function useMounted() {
	return React.useSyncExternalStore(
		neverSubscribe,
		() => true,
		() => false
	)
}

export function StatsTooltip({
	title,
	current,
	stats,
	betterLower,
}: {
	title: string
	current: number
	stats: ColumnStats
	betterLower: boolean
}) {
	const red = "#ef5350"
	const green = "#66bb6a"

	return (
		<Box sx={{ py: 0.5 }}>
			<Typography
				variant="caption"
				sx={{ display: "block", fontWeight: 700, mb: 0.5 }}
			>
				{title}
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
				<span>{fmt2(current)}</span>
			</Typography>
			{[
				{ label: "平均", value: stats.mean },
				{ label: "最高", value: stats.max },
				{ label: "最低", value: stats.min },
			].map((row) => {
				const diff = current - row.value
				const pct =
					row.value != 0 ? (diff / row.value) * 100 : 0
				// 更优（买入更低/卖出或兑换更高）→ 红；更差 → 绿
				const isBetter = betterLower ? diff < 0 : diff > 0
				const isWorse = betterLower ? diff > 0 : diff < 0
				return (
					<Typography
						key={row.label}
						variant="caption"
						sx={{
							display: "flex",
							justifyContent: "space-between",
							gap: 2,
						}}
					>
						<span>
							{row.label} {fmt2(row.value)}
						</span>
						<span
							style={{
								color: isBetter
									? red
									: isWorse
										? green
										: "inherit",
								fontWeight:
									isBetter || isWorse ? 700 : "inherit",
							}}
						>
							{fmtSigned(diff)} ({fmtSigned(pct)}%)
						</span>
					</Typography>
				)
			})}
		</Box>
	)
}

// 移动端判定 context：表格顶层算一次，避免每个单元格 StatsTip 各建 matchMedia 监听（348+ 实例卡顿源）
const MobileContext = React.createContext(false)

// 表格容器用它包裹一次：把 isMobile 传给所有 StatsTip
export function StatsTipProvider({ children }: { children: React.ReactNode }) {
	const theme = useTheme()
	const isMobile = useMediaQuery(theme.breakpoints.down("sm"))
	return <MobileContext.Provider value={isMobile}>{children}</MobileContext.Provider>
}

// 统计信息容器：桌面端 hover Tooltip，移动端（触摸无 hover）点击 Popover 弹窗
// children 为触发元素（数字单元格）；content 为统计内容
export function StatsTip({
	content,
	children,
}: {
	content: React.ReactNode
	children: React.ReactElement<{ onClick?: (e: React.MouseEvent<HTMLElement>) => void }>
}) {
	const isMobile = React.useContext(MobileContext)
	const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)

	// 移动端：点击弹窗
	if (isMobile) {
		const child = React.cloneElement(children, {
			onClick: (e: React.MouseEvent<HTMLElement>) => {
				setAnchor(e.currentTarget)
				children.props.onClick?.(e)
			},
		})
		return (
			<>
				{child}
				<Popover
					open={Boolean(anchor)}
					anchorEl={anchor}
					onClose={() => setAnchor(null)}
					anchorOrigin={{ vertical: "center", horizontal: "center" }}
					transformOrigin={{ vertical: "center", horizontal: "center" }}
					slotProps={{
						paper: {
							sx: {
								p: 1.5,
								maxWidth: 280,
								borderRadius: "14px",
								boxShadow: 6,
							},
						},
					}}
				>
					{content}
				</Popover>
			</>
		)
	}
	// 桌面端：hover Tooltip（与移动端弹窗同色彩方案：主题 surface + 边框，避免 inverse 白底刺眼）
	return (
		<Tooltip
			title={content}
			slotProps={{
				tooltip: {
					sx: {
						fontSize: 12,
						backgroundColor: "background.paper",
						color: "text.primary",
						border: 1,
						borderColor: "divider",
						borderRadius: "14px",
						p: 1,
						boxShadow: 6,
					},
				},
			}}
		>
			{children}
		</Tooltip>
	)
}

export function StaleIcon({ title }: { title: string }) {
	return (
		<Tooltip
			title={title}
			slotProps={{ tooltip: { sx: { fontSize: 12 } } }}
		>
			<ScheduleIcon
				fontSize="inherit"
				sx={{
					fontSize: 14,
					color: "text.disabled",
					cursor: "help",
					display: "flex",
				}}
			/>
		</Tooltip>
	)
}
