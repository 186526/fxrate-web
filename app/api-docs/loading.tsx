"use client"

import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Skeleton from "@mui/material/Skeleton"

const HEADER_SX = {
	position: "sticky",
	top: 0,
	zIndex: 1100,
	backgroundColor: "background.paper",
	borderBottom: 1,
	borderColor: "divider",
} as const

const MAIN_SX = {
	width: "100%",
	maxWidth: 1360,
	mx: "auto",
	px: { xs: 1.5, sm: 3 },
	py: { xs: 2, sm: 3 },
	minWidth: 0,
	overflowX: "clip",
} as const

export default function APIDocsLoading() {
	return (
		<>
			<Box component="header" sx={HEADER_SX}>
				<Box
					sx={{
						width: "100%",
						maxWidth: 1360,
						minHeight: 56,
						mx: "auto",
						px: { xs: 1, sm: 3 },
						display: "flex",
						alignItems: "center",
						gap: 1,
					}}
				>
					<Skeleton variant="circular" width={40} height={40} sx={{ flexShrink: 0 }} />
					<Skeleton variant="text" width={150} height={28} />
					<Box sx={{ flexGrow: 1 }} />
					<Skeleton variant="text" width={120} height={22} sx={{ display: { xs: "none", sm: "block" } }} />
					<Skeleton variant="circular" width={40} height={40} sx={{ flexShrink: 0 }} />
				</Box>
			</Box>

			<Box component="main" role="status" aria-label="正在加载 API 文档" sx={MAIN_SX}>
				<Box sx={{ py: { xs: 1.5, sm: 2 }, borderTop: 1, borderBottom: 1, borderColor: "divider" }}>
					<Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.25 }}>
						<Skeleton variant="circular" width={8} height={8} />
						<Skeleton variant="text" width={120} height={22} />
					</Box>
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
							gap: 1.5,
						}}
					>
						{Array.from({ length: 4 }, (_, index) => (
							<Box key={index}>
								<Skeleton variant="text" width={72} height={18} />
								<Skeleton variant="text" width="min(100%, 220px)" height={22} />
							</Box>
						))}
					</Box>
				</Box>

				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "232px minmax(0, 1fr)" },
						columnGap: { md: 3, lg: 4 },
						rowGap: 2,
						alignItems: "start",
						mt: { xs: 2, sm: 3 },
					}}
				>
					<Box sx={{ pr: { md: 2.5 }, borderRight: { md: 1 }, borderColor: { md: "divider" }, minWidth: 0 }}>
						<Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
							<Skeleton variant="rounded" height={40} sx={{ flex: 1, minWidth: 0, borderRadius: "6px" }} />
							<Skeleton variant="circular" width={40} height={40} sx={{ display: { xs: "block", md: "none" }, flexShrink: 0 }} />
						</Box>
						<Box sx={{ display: { xs: "none", md: "block" }, mt: 1.25 }}>
							<Skeleton variant="rounded" height={40} sx={{ borderRadius: "6px" }} />
							{Array.from({ length: 6 }, (_, index) => (
								<Skeleton key={index} variant="text" height={42} sx={{ mt: 0.5 }} />
							))}
						</Box>
					</Box>

					<Box sx={{ minWidth: 0 }}>
						<Paper
							elevation={0}
							sx={{ overflow: "hidden", border: 1, borderColor: "divider", borderRadius: "8px", boxShadow: 1 }}
						>
							<Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: 2, backgroundColor: "surfaceMuted", borderBottom: 1, borderColor: "divider" }}>
								<Skeleton variant="text" width="min(100%, 240px)" height={30} />
								<Skeleton variant="text" width="min(100%, 360px)" height={22} />
							</Box>
							<Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: { xs: 1.5, sm: 2.5 } }}>
								<Skeleton variant="text" width={110} height={24} />
								<Skeleton variant="rounded" height={210} sx={{ mt: 1, borderRadius: "6px" }} />
								<Skeleton variant="text" width={72} height={24} sx={{ mt: 2.5 }} />
								<Skeleton variant="rounded" height={96} sx={{ mt: 1, borderRadius: "6px" }} />
								<Skeleton variant="text" width={72} height={24} sx={{ mt: 2.5 }} />
								<Skeleton variant="rounded" height={92} sx={{ mt: 1, borderRadius: "6px" }} />
							</Box>
						</Paper>

						{Array.from({ length: 3 }, (_, index) => (
							<Box key={index} sx={{ py: 3, borderTop: 1, borderColor: "divider", mt: index == 0 ? 4 : 0 }}>
								<Skeleton variant="text" width={140} height={28} />
								<Skeleton variant="text" width="min(100%, 560px)" height={22} sx={{ mt: 1 }} />
								<Skeleton variant="text" width="min(100%, 460px)" height={22} />
							</Box>
						))}
					</Box>
				</Box>
			</Box>
		</>
	)
}
