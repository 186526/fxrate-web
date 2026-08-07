import type { ReactNode } from "react"

import Box from "@mui/material/Box"
import Divider from "@mui/material/Divider"
import Link from "@mui/material/Link"
import Typography from "@mui/material/Typography"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"

import type { infoResponse } from "@/lib/fxrate/src/client"
import { OPERATIONS, SOURCE_CATEGORIES } from "./model"
import type { BackendMeta } from "./request"
import { MethodBadge } from "./ui"

export type AsyncState<T> =
	| { status: "loading" }
	| { status: "success"; data: T }
	| { status: "error"; message: string }

const MONOSPACE_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

const REFERENCE_SECTION_SX = {
	py: { xs: 3, sm: 3.5 },
	borderTop: 1,
	borderColor: "divider",
	scrollMarginTop: "72px",
} as const

function MetadataItem({
	label,
	children,
	wide = false,
}: {
	label: string
	children: ReactNode
	wide?: boolean
}) {
	return (
		<Box sx={{ minWidth: 0, gridColumn: { sm: wide ? "span 2" : "span 1" } }}>
			<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.125 }}>
				{label}
			</Typography>
			<Typography
				component="div"
				sx={{
					fontFamily: MONOSPACE_FONT,
					fontSize: "0.76rem",
					fontWeight: 600,
					lineHeight: 1.55,
					overflowWrap: "anywhere",
				}}
			>
				{children}
			</Typography>
		</Box>
	)
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
	return (
		<Typography
			id={id}
			component="h2"
			variant="h6"
			sx={{ fontSize: { xs: 17, sm: 18 }, fontWeight: 700, mb: 1.5 }}
		>
			{children}
		</Typography>
	)
}

export function InstancePanel({
	infoState,
	metaState,
	endpointHost,
}: {
	infoState: AsyncState<infoResponse>
	metaState: AsyncState<BackendMeta>
	endpointHost: string
}) {
	const statusColor = infoState.status == "success"
		? "success.main"
		: infoState.status == "error"
			? "error.main"
			: "text.disabled"
	const statusText = infoState.status == "success"
		? infoState.data.status
		: infoState.status == "error"
			? "未取得"
			: "读取中"

	return (
		<Box
			component="section"
			aria-labelledby="api-instance-title"
			sx={{
				py: { xs: 1.5, sm: 2 },
				borderTop: 1,
				borderBottom: 1,
				borderColor: "divider",
			}}
		>
			<Box sx={{ display: "flex", alignItems: "center", gap: 0.75, mb: 1.25 }}>
				<Box aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: statusColor }} />
				<Typography id="api-instance-title" component="h2" variant="subtitle2">
					后端实例
				</Typography>
				<Typography variant="caption" color="text.secondary">
					{statusText}
				</Typography>
			</Box>

			<Box
				sx={{
					display: "grid",
					gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" },
					gap: { xs: 1, sm: 1.5 },
				}}
			>
				<MetadataItem label="同源 RPC" wide>
					{endpointHost ? `${endpointHost}/api/fxrate` : "…"}
				</MetadataItem>
				{infoState.status == "success" ? (
					<>
						<MetadataItem label="版本">{infoState.data.version}</MetadataItem>
						<MetadataItem label="API">{infoState.data.apiVersion}</MetadataItem>
						<MetadataItem label="数据源">{infoState.data.sources.length} 个</MetadataItem>
					</>
				) : infoState.status == "error" ? (
					<Box sx={{ gridColumn: { sm: "span 2" }, minWidth: 0 }}>
						<Typography variant="caption" color="error.main" role="alert" sx={{ overflowWrap: "anywhere" }}>
							实例信息获取失败：{infoState.message}
						</Typography>
					</Box>
				) : (
					<Typography variant="caption" color="text.secondary" role="status">
						正在获取实例信息…
					</Typography>
				)}
				{metaState.status == "success" && (
					<>
						<MetadataItem label="后端 RPC" wide>{metaState.data.rpcUrl}</MetadataItem>
						<MetadataItem label="后端 REST" wide>{metaState.data.restBase}</MetadataItem>
					</>
				)}
			</Box>
			{metaState.status == "error" && (
				<Typography variant="caption" color="error.main" role="alert" sx={{ display: "block", mt: 1, overflowWrap: "anywhere" }}>
					后端地址获取失败：{metaState.message}
				</Typography>
			)}
		</Box>
	)
}

export function ReferenceSections({
	info,
	endpointHost,
}: {
	info: infoResponse | null
	endpointHost: string
}) {
	const rssUrl = endpointHost ? `${endpointHost}/api/rest/rss/USD/CNY` : "/api/rest/rss/USD/CNY"

	return (
		<Box component="aside" aria-label="API 补充参考" sx={{ mt: { xs: 3, sm: 4 } }}>
			<Box component="section" id="operations" aria-labelledby="operations-title" sx={REFERENCE_SECTION_SX}>
				<SectionHeading id="operations-title">运维接口</SectionHeading>
				<Box component="dl" sx={{ m: 0 }}>
					{OPERATIONS.map((operation, index) => (
						<Box
							key={operation.path}
							sx={{
								display: "grid",
								gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "180px minmax(0, 1fr) auto" },
								gap: { xs: 0.5, sm: 1.5 },
								alignItems: "start",
								py: 1.25,
								borderTop: index == 0 ? 1 : 0,
								borderBottom: 1,
								borderColor: "divider",
							}}
						>
							<Box component="dt" sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0, m: 0 }}>
								<MethodBadge method="GET" />
								<Typography component="code" sx={{ fontFamily: MONOSPACE_FONT, fontSize: "0.78rem", fontWeight: 700, overflowWrap: "anywhere" }}>
									{operation.path}
								</Typography>
							</Box>
							<Box component="dd" sx={{ minWidth: 0, m: 0 }}>
								<Typography component="div" variant="body2" sx={{ fontWeight: 600 }}>
									{operation.title}
								</Typography>
								<Typography component="div" variant="caption" color="text.secondary">
									{operation.description}
								</Typography>
							</Box>
							<Typography component="dd" variant="caption" color="text.secondary" sx={{ fontFamily: MONOSPACE_FONT, m: 0 }}>
								<code>{operation.responseKind == "json" ? "application/json" : "text/plain"}</code>
							</Typography>
						</Box>
					))}
				</Box>
			</Box>

			<Box component="section" id="rss" aria-labelledby="rss-title" sx={REFERENCE_SECTION_SX}>
				<SectionHeading id="rss-title">RSS / Atom</SectionHeading>
				<Typography variant="body2" color="text.secondary" sx={{ maxWidth: 760, mb: 1 }}>
					<code>GET /rss/:from/:to</code> 聚合全部来源的货币对买卖价，每条 item 使用来源中文名。
				</Typography>
				<Link
					href={rssUrl}
					target="_blank"
					rel="noreferrer"
					sx={{
						display: "inline-flex",
						alignItems: "center",
						gap: 0.75,
						maxWidth: "100%",
						minHeight: 40,
						fontFamily: MONOSPACE_FONT,
						fontSize: "0.78rem",
						overflowWrap: "anywhere",
					}}
				>
					<Box component="span" sx={{ minWidth: 0 }}>
						{rssUrl}
					</Box>
					<OpenInNewIcon fontSize="small" sx={{ flexShrink: 0 }} />
				</Link>
			</Box>

			<Box component="section" id="sources" aria-labelledby="sources-title" sx={REFERENCE_SECTION_SX}>
				<SectionHeading id="sources-title">数据源</SectionHeading>
				<Box
					sx={{
					display: "grid",
					gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" },
					columnGap: 3,
				}}
				>
					{SOURCE_CATEGORIES.map((category) => (
						<Box key={category.title} sx={{ py: 1.25, borderTop: 1, borderColor: "divider", minWidth: 0 }}>
							<Typography component="h3" variant="subtitle2">{category.title}</Typography>
							<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75 }}>
								{category.description}
							</Typography>
							<Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1.25, rowGap: 0.5 }}>
								{category.examples.map((source) => (
									<Typography key={source} component="code" sx={{ fontFamily: MONOSPACE_FONT, fontSize: "0.75rem", color: "text.primary" }}>
										{source}
									</Typography>
								))}
							</Box>
						</Box>
					))}
				</Box>

				<Divider sx={{ my: 1.5 }} />
				<Typography variant="caption" color="text.secondary">
					完整 source 列表以 <code>GET /info</code> 为准（当前 {info?.sources.length ?? "…"} 个）。
				</Typography>
				{info ? (
					<Box
						component="ul"
						sx={{
							m: 0,
							mt: 1,
							p: 1.25,
							listStyle: "none",
							display: "grid",
							gridTemplateColumns: "repeat(auto-fill, minmax(88px, 1fr))",
							gap: 0.5,
							backgroundColor: "surfaceMuted",
							borderTop: 1,
							borderBottom: 1,
							borderColor: "divider",
						}}
					>
						{info.sources.map((source) => (
							<Typography key={source} component="li" sx={{ fontFamily: MONOSPACE_FONT, fontSize: "0.73rem", overflowWrap: "anywhere" }}>
								{source}
							</Typography>
						))}
					</Box>
				) : (
					<Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
						尚未获取…
					</Typography>
				)}
			</Box>
		</Box>
	)
}
