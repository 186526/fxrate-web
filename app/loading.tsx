"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Skeleton from "@mui/material/Skeleton"
import Typography from "@mui/material/Typography"
import { ListTableSkeleton } from "@/componets/tableSkeleton"

// 路由加载骨架：薄壳下数据全部由浏览器端 Index 拉取，路由导航期间这里
// 只渲染与正式页面结构对应的最小骨架（sticky 顶栏 + 货币选择器 + 表格骨架），
// 布局结构与 index.tsx 保持一致，避免加载/就绪切换时的大幅布局跳动；
// 表格骨架与客户端加载骨架共用 componets/tableSkeleton.tsx
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

				<Box sx={{ mt: 2 }}>
					<ListTableSkeleton />
				</Box>
			</Box>
		</Box>
	)
}
