"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Tooltip from "@mui/material/Tooltip"
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

// 超过 24 小时未更新的数据视为可能不准确
export const STALE_MS = 24 * 60 * 60 * 1000

export const isStale = (updated: Date) =>
	Date.now() - updated.getTime() > STALE_MS

// hydration 安全：SSR 与客户端首帧都返回 false，
// 挂载后才计算（避免 Date.now() 边界导致 server/client 渲染不一致）
export function useMounted() {
	const [mounted, setMounted] = React.useState(false)
	React.useEffect(() => setMounted(true), [])
	return mounted
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
	const theme = useTheme()
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
