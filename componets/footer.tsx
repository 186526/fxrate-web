"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Tooltip from "@mui/material/Tooltip"
import Link from "@mui/material/Link"
import GitHubIcon from "@mui/icons-material/GitHub"

export default function Footer({
	buildId,
	buildTime,
	version,
	backendVersion,
}: {
	buildId: string
	buildTime: string
	version: string
	backendVersion: string
}) {
	const shortBuild =
		buildId.length > 7 ? `${buildId.slice(0, 7)}` : buildId
	const shortBackend = backendVersion.split(" ")[0]!

	// 后端 BUILDTIME 风格：2025-10-20T23:29:04+08:00（本地时区 ISO）
	const buildDate = buildTime
		? (() => {
				const d = new Date(buildTime)
				const pad = (n: number) => String(n).padStart(2, "0")
				const offset = -d.getTimezoneOffset()
				const sign = offset >= 0 ? "+" : "-"
				const abs = Math.abs(offset)
				return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
					d.getDate()
				)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(
					d.getSeconds()
				)}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
		  })()
		: ""

	return (
		<Box
			component="footer"
			sx={{
				borderTop: 1,
				borderColor: "divider",
				mt: { xs: 3, sm: 5 },
			}}
		>
			<Box
				sx={{
					maxWidth: 1080,
					mx: "auto",
					px: { xs: 1, sm: 2 },
					py: 2,
					display: "flex",
					flexDirection: { xs: "column", sm: "row" },
					alignItems: "center",
					justifyContent: "space-between",
					gap: 0.5,
				}}
			>
				<Typography variant="caption" color="text.secondary">
					外汇牌价查询 · 数据来自各银行/平台公开牌价，仅供参考 | by{" "}
					<Link
						href="https://186526.xyz"
						target="_blank"
						rel="noopener noreferrer"
						underline="hover"
						color="inherit"
					>
						@real186526
					</Link>
				</Typography>
				<Box
					sx={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						flexWrap: "wrap",
						gap: 1,
					}}
				>
					{backendVersion && (
						<Tooltip title={backendVersion} placement="bottom">
							<Typography
								component="span"
								variant="caption"
								color="text.secondary"
								sx={{
									fontFamily: "monospace",
									cursor: "help",
									opacity: 0.85,
								}}
							>
								后端 {shortBackend}
							</Typography>
						</Tooltip>
					)}
					<Tooltip
						title={`fxrate-web@${shortBuild}${buildDate ? ` ${buildDate}` : ""} · ${buildId}`}
						placement="top"
					>
						<Typography
							variant="caption"
							color="text.secondary"
							sx={{
								fontFamily: "monospace",
								opacity: 0.85,
								cursor: "help",
							}}
						>
							fxrate-web v{version}
						</Typography>
					</Tooltip>
					<Tooltip title="fxrate 后端 (GitHub)" placement="top">
						<Link
							href="https://github.com/186526/fxrate"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="fxrate 后端 GitHub"
							color="inherit"
							sx={{
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								verticalAlign: "middle",
								lineHeight: 0,
								opacity: 0.85,
								"&:hover": { opacity: 1 },
							}}
						>
							<GitHubIcon sx={{ fontSize: 14 }} />
						</Link>
					</Tooltip>
				</Box>
			</Box>
		</Box>
	)
}