"use client"
import * as React from "react"

import Paper from "@mui/material/Paper"
import Skeleton from "@mui/material/Skeleton"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import { currencyEmoji } from "@/componets/sourceIcon"

// 客户端加载骨架（Phase 4B 任务 10）：浏览器 JSON-RPC 拉数阶段由 Index 渲染
// 与正式表格同构的最小骨架——真实列名（sticky 名称列 + 数值列），8 行无假数据。
// 与 app/loading.tsx 共用同一 LIST_COLUMNS，保证路由骨架与客户端骨架视觉一致。
export const LIST_COLUMNS: {
	key: string
	label: string
	align: "left" | "right"
}[] = [
	{ key: "name", label: "银行/平台", align: "left" },
	{ key: "buyCash", label: "购钞价", align: "left" },
	{ key: "buyRemit", label: "购汇价", align: "left" },
	{ key: "sellCash", label: "结钞价", align: "left" },
	{ key: "sellRemit", label: "结汇价", align: "left" },
	{ key: "middle", label: "中间价", align: "left" },
	{ key: "updated", label: "更新时间", align: "right" },
]

// 矩阵骨架列：默认常用币种（与 fxmatrixgrid 的 DEFAULT_COMMON_CURRENCIES 一致），
// 表头带国旗 emoji，保证与真实矩阵列头形状一致
export const MATRIX_COLUMNS: string[] = [
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

const SKELETON_ROWS = 8

const stickyNameCellSx = {
	position: "sticky" as const,
	left: 0,
	borderRight: "1px solid",
	borderColor: "divider",
	bgcolor: "background.paper",
	py: { xs: 0.75, sm: 1 },
	px: { xs: 0.75, sm: 1.5 },
}

const bodyCellSx = {
	py: { xs: 0.75, sm: 1 },
	px: { xs: 1, sm: 1.5 },
}

function SkeletonBar({
	width,
	height = 18,
}: {
	width: number
	height?: number
}) {
	return (
		<Skeleton
			width={width}
			height={height}
			sx={{ bgcolor: "surfaceMuted", borderRadius: 6 }}
		/>
	)
}

export function ListTableSkeleton() {
	return (
		<TableContainer
			component={Paper}
			elevation={1}
			sx={{ overflow: "auto" }}
			role="status"
			aria-label="正在加载汇率数据"
		>
			<Table size="small" sx={{ minWidth: { xs: 640, sm: 720 } }}>
				<TableHead>
					<TableRow>
						{LIST_COLUMNS.map((col) => (
							<TableCell
								key={col.key}
								align={col.align}
								sx={{
									position: col.key == "name" ? "sticky" : "static",
									left: col.key == "name" ? 0 : "auto",
									zIndex: col.key == "name" ? 3 : "auto",
									bgcolor: col.key == "name" ? "background.paper" : "inherit",
									borderRight: col.key == "name" ? "1px solid" : "none",
									borderColor: "divider",
									py: { xs: 0.75, sm: 1 },
									px: { xs: 1, sm: 1.5 },
									fontSize: { xs: 12, sm: 14 },
								}}
							>
								{col.label}
							</TableCell>
						))}
					</TableRow>
				</TableHead>
				<TableBody>
					{Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
						<TableRow key={rowIndex}>
							<TableCell sx={stickyNameCellSx}>
								<SkeletonBar width={112} height={20} />
							</TableCell>
							{Array.from({ length: 5 }, (_, cellIndex) => (
								<TableCell key={cellIndex} sx={bodyCellSx}>
									<SkeletonBar width={cellIndex % 2 == 0 ? 56 : 40} />
								</TableCell>
							))}
							<TableCell align="right" sx={bodyCellSx}>
								<SkeletonBar width={48} />
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableContainer>
	)
}

export function MatrixTableSkeleton() {
	return (
		<TableContainer
			component={Paper}
			elevation={1}
			sx={{ overflow: "auto" }}
			role="status"
			aria-label="正在加载汇率数据"
		>
			<Table size="small" sx={{ minWidth: { xs: 780, sm: 960 } }}>
				<TableHead>
					<TableRow>
						<TableCell
							key="source"
							sx={{
								position: "sticky",
								left: 0,
								zIndex: 3,
								bgcolor: "background.paper",
								borderRight: "1px solid",
								borderColor: "divider",
								py: { xs: 0.75, sm: 1 },
								px: { xs: 0.75, sm: 1.5 },
								fontSize: { xs: 12, sm: 14 },
							}}
						>
							银行/平台
						</TableCell>
						{MATRIX_COLUMNS.map((c) => (
							<TableCell
								key={c}
								align="right"
								sx={{
									py: { xs: 0.75, sm: 1 },
									px: { xs: 1, sm: 1.5 },
									fontSize: { xs: 12, sm: 14 },
								}}
							>
								{currencyEmoji(c) ? `${currencyEmoji(c)} ${c}` : c}
							</TableCell>
						))}
					</TableRow>
				</TableHead>
				<TableBody>
					{Array.from({ length: SKELETON_ROWS }, (_, rowIndex) => (
						<TableRow key={rowIndex}>
							<TableCell sx={stickyNameCellSx}>
								<SkeletonBar width={112} height={20} />
							</TableCell>
							{MATRIX_COLUMNS.map((_, cellIndex) => (
								<TableCell key={cellIndex} align="right" sx={bodyCellSx}>
									<SkeletonBar width={cellIndex % 3 == 0 ? 56 : 44} />
								</TableCell>
							))}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableContainer>
	)
}
