"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Skeleton from "@mui/material/Skeleton"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Typography from "@mui/material/Typography"

// 单对报价表列（与 fxlistgrid.tsx 一致）：加载骨架显示真实列名，不伪造数据
const LIST_COLUMNS: {
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

const SKELETON_ROWS = 8

// 路由加载骨架：薄壳下数据全部由浏览器端 Index 拉取，路由导航期间这里
// 只渲染与正式页面结构对应的最小骨架（sticky 顶栏 + 货币选择器 + 表格），
// 布局结构与 index.tsx 保持一致，避免加载/就绪切换时的大幅布局跳动
export default function Loading() {
	return (
		<Box role="status" aria-label="正在加载汇率数据">
			<Box
				component="header"
				sx={{
					position: "sticky",
					top: 0,
					zIndex: 1100,
					bgcolor: "background.paper",
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
						gap: { xs: 0.25, sm: 2 },
						flexWrap: "wrap",
					}}
				>
					<Typography
						variant="h6"
						component="h1"
						sx={{ fontWeight: 700 }}
					>
						FXRate
					</Typography>
					<Skeleton
						variant="rounded"
						sx={{
							width: { xs: 168, sm: 224 },
							height: { xs: 32, sm: 40 },
							bgcolor: "surfaceMuted",
							borderRadius: "9999px",
						}}
					/>
					<Box sx={{ flexGrow: 1 }} />
					<Skeleton
						variant="rounded"
						sx={{
							width: { xs: 28, sm: 128 },
							height: { xs: 28, sm: 36 },
							bgcolor: "surfaceMuted",
							borderRadius: "9999px",
						}}
					/>
				</Box>
			</Box>

			<Box
				sx={{
					width: "100%",
					maxWidth: 1080,
					mx: "auto",
					px: { xs: 1, sm: 2 },
					py: 2,
				}}
			>
				<Paper
					elevation={1}
					sx={{
						display: "flex",
						alignItems: "center",
						flexWrap: "wrap",
						gap: { xs: 1.25, sm: 1.5 },
						p: { xs: 1.25, sm: 1.5 },
						borderRadius: 1,
						border: "1px solid",
						borderColor: "divider",
					}}
				>
					<Skeleton
						variant="rounded"
						sx={{
							width: { xs: "100%", sm: 180 },
							height: 40,
							bgcolor: "surfaceMuted",
							flex: { xs: "1 1 180px", sm: "none" },
						}}
					/>
					<Skeleton
						variant="rounded"
						sx={{
							width: 36,
							height: 36,
							flexShrink: 0,
							bgcolor: "brandSoft",
							borderRadius: "50%",
						}}
					/>
					<Skeleton
						variant="rounded"
						sx={{
							width: { xs: "100%", sm: 180 },
							height: 40,
							bgcolor: "surfaceMuted",
							flex: { xs: "1 1 180px", sm: "none" },
						}}
					/>
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: 0.5,
							width: { xs: "100%", sm: 190 },
							flexShrink: 0,
						}}
					>
						<Skeleton
							variant="rounded"
							sx={{
								flex: 1,
								minWidth: 0,
								height: 40,
								bgcolor: "surfaceMuted",
							}}
						/>
						<Skeleton
							variant="rounded"
							sx={{
								width: 36,
								height: 36,
								flexShrink: 0,
								bgcolor: "brandSoft",
								borderRadius: "50%",
							}}
						/>
					</Box>
				</Paper>

				<TableContainer
					component={Paper}
					elevation={1}
					sx={{ mt: 2, overflow: "auto" }}
				>
					<Table size="small" sx={{ minWidth: { xs: 640, sm: 720 } }}>
						<TableHead>
							<TableRow>
								{LIST_COLUMNS.map((col) => (
									<TableCell
										key={col.key}
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
									<TableCell
										sx={{
											position: "sticky",
											left: 0,
											zIndex: 1,
											bgcolor: "background.paper",
											borderRight: "1px solid",
											borderColor: "divider",
											py: { xs: 0.75, sm: 1 },
											px: { xs: 0.75, sm: 1.5 },
										}}
									>
										<Skeleton
											width={112}
											height={20}
											sx={{ bgcolor: "surfaceMuted", borderRadius: 6 }}
										/>
									</TableCell>
									{Array.from({ length: 5 }, (_, cellIndex) => (
										<TableCell
											key={cellIndex}
											sx={{
												py: { xs: 0.75, sm: 1 },
												px: { xs: 1, sm: 1.5 },
											}}
										>
											<Skeleton
												width={cellIndex % 2 == 0 ? 56 : 40}
												height={18}
												sx={{ bgcolor: "surfaceMuted", borderRadius: 6 }}
											/>
										</TableCell>
									))}
									<TableCell
										align="right"
										sx={{
											py: { xs: 0.75, sm: 1 },
											px: { xs: 1, sm: 1.5 },
										}}
									>
										<Skeleton
											width={48}
											height={18}
											sx={{ bgcolor: "surfaceMuted", borderRadius: 6 }}
										/>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</TableContainer>
			</Box>
		</Box>
	)
}
