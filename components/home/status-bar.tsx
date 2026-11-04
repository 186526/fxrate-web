"use client"
import * as React from "react"

import Alert from "@mui/material/Alert"
import Button from "@mui/material/Button"
import Snackbar from "@mui/material/Snackbar"
import Typography from "@mui/material/Typography"

// 刷新失败提示条：已有可见报价时以固定定位 Snackbar 展示，不替换表格、
// 不造成布局位移；首次无数据失败由内容区渲染内联 error。
export default function StatusBar({
	error,
	hasVisibleData,
	onRetry,
}: {
	error: string | null
	hasVisibleData: boolean
	onRetry: () => void
}) {
	return (
		<Snackbar
			open={Boolean(error && hasVisibleData)}
			anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
			sx={{
				bottom: { xs: 16, sm: 24 },
				maxWidth: { xs: "calc(100% - 16px)", sm: 640 },
			}}
		>
			<Alert
				severity="warning"
				variant="filled"
				action={
					<Button color="inherit" size="small" onClick={onRetry}>
						重试
					</Button>
				}
				sx={{ width: "100%", alignItems: "center" }}
			>
				<Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>
					刷新失败，当前显示的是上次成功获取的数据。
				</Typography>{" "}
				<Typography component="span" variant="body2">
					{error}
				</Typography>
			</Alert>
		</Snackbar>
	)
}
