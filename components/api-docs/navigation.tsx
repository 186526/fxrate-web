import * as React from "react"

import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Divider from "@mui/material/Divider"
import IconButton from "@mui/material/IconButton"
import InputAdornment from "@mui/material/InputAdornment"
import TextField from "@mui/material/TextField"
import ToggleButton from "@mui/material/ToggleButton"
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import useMediaQuery from "@mui/material/useMediaQuery"
import { useTheme } from "@mui/material/styles"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted"
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp"
import SearchIcon from "@mui/icons-material/Search"

import {
	API_ENDPOINTS,
	filterEndpoints,
	type ApiProtocol,
	type EndpointId,
	type ProtocolFilter,
} from "./model"
import { MethodBadge } from "./ui"

const GROUPS: readonly { protocol: ApiProtocol; label: string }[] = [
	{ protocol: "rest", label: "REST API" },
	{ protocol: "rpc", label: "JSON-RPC" },
]

const REFERENCE_LINKS = [
	{ id: "operations", label: "运维接口" },
	{ id: "rss", label: "RSS / Atom" },
	{ id: "sources", label: "数据源" },
] as const

const NAV_SX = {
	width: "100%",
	minWidth: 0,
	alignSelf: "start",
	position: { md: "sticky" },
	top: { md: 72 },
	maxHeight: { md: "calc(100vh - 88px)" },
	overflowY: { md: "auto" },
	pr: { md: 2.5 },
	borderRight: { md: 1 },
	borderColor: { md: "divider" },
} as const

const GROUP_BUTTON_SX = {
	minHeight: 40,
	justifyContent: "space-between",
	borderRadius: "6px",
	px: 1,
	color: "text.primary",
	"&:hover": { backgroundColor: "surfaceMuted" },
} as const

export function EndpointNavigation({
	selectedId,
	onSelect,
}: {
	selectedId: EndpointId
	onSelect: (id: EndpointId) => void
}) {
	const theme = useTheme()
	const compact = useMediaQuery(theme.breakpoints.down("md"))
	const [search, setSearch] = React.useState("")
	const [protocol, setProtocol] = React.useState<ProtocolFilter>("all")
	const [mobileOpen, setMobileOpen] = React.useState(false)
	const [expanded, setExpanded] = React.useState<Record<ApiProtocol, boolean>>({
		rest: true,
		rpc: true,
	})
	const endpoints = filterEndpoints(API_ENDPOINTS, search, protocol)
	const navigationVisible = !compact || mobileOpen

	const scrollToReference = (id: string) => {
		document.getElementById(id)?.scrollIntoView({ block: "start" })
		if (compact) setMobileOpen(false)
	}

	return (
		<Box component="nav" aria-label="API 端点导航" sx={NAV_SX}>
			<Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
				<TextField
					fullWidth
					size="small"
					label="搜索端点"
					value={search}
					onChange={(event) => {
						setSearch(event.target.value)
						if (compact) setMobileOpen(true)
					}}
					slotProps={{
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<SearchIcon fontSize="small" sx={{ color: "text.secondary" }} />
								</InputAdornment>
							),
						},
					}}
					sx={{
						minWidth: 0,
						"& .MuiInputBase-root": { minHeight: 40, backgroundColor: "background.paper" },
					}}
				/>
				<Tooltip title={mobileOpen ? "收起端点导航" : "浏览端点"}>
					<IconButton
						aria-label={mobileOpen ? "收起端点导航" : "浏览端点"}
						aria-expanded={mobileOpen}
						aria-controls="api-endpoint-navigation"
						onClick={() => setMobileOpen((open) => !open)}
						sx={{ display: { xs: "inline-flex", md: "none" }, flexShrink: 0 }}
					>
						{mobileOpen ? <KeyboardArrowUpIcon /> : <FormatListBulletedIcon />}
					</IconButton>
				</Tooltip>
			</Box>

			{navigationVisible && (
				<Box id="api-endpoint-navigation" sx={{ pt: 1.25 }}>
					<ToggleButtonGroup
						exclusive
						fullWidth
						size="small"
						value={protocol}
						onChange={(_event, value: ProtocolFilter | null) => {
							if (value) setProtocol(value)
						}}
						aria-label="按 API 协议筛选"
						sx={{
							"& .MuiToggleButton-root": {
								minWidth: 0,
								minHeight: 40,
								px: 0.5,
								borderRadius: "6px",
							},
						}}
					>
						<ToggleButton value="all">全部</ToggleButton>
						<ToggleButton value="rest">REST</ToggleButton>
						<ToggleButton value="rpc">RPC</ToggleButton>
					</ToggleButtonGroup>

					<Box sx={{ mt: 1.5 }}>
						{GROUPS.map((group) => {
							const groupEndpoints = endpoints.filter((endpoint) => endpoint.protocol == group.protocol)
							if (protocol != "all" && protocol != group.protocol) return null
							const contentId = `api-nav-${group.protocol}`
							return (
								<Box key={group.protocol} sx={{ mb: 0.75 }}>
									<Button
										fullWidth
										color="inherit"
										onClick={() =>
											setExpanded((current) => ({
												...current,
												[group.protocol]: !current[group.protocol],
											}))
										}
										aria-expanded={expanded[group.protocol]}
										aria-controls={contentId}
										sx={GROUP_BUTTON_SX}
									>
										<span>{group.label}</span>
										<ExpandMoreIcon
											fontSize="small"
											sx={{
												color: "text.secondary",
												transform: expanded[group.protocol] ? "rotate(180deg)" : "none",
												transition: "transform 0.2s ease",
											}}
										/>
									</Button>
									{expanded[group.protocol] && (
										<Box id={contentId} sx={{ mt: 0.25 }}>
											{groupEndpoints.map((endpoint) => {
												const path = endpoint.protocol == "rest" ? endpoint.path : endpoint.methodName
												const selected = selectedId == endpoint.id
												return (
													<Button
														key={endpoint.id}
														component="a"
														href={`#${endpoint.id}`}
														aria-label={path}
														onClick={() => {
															onSelect(endpoint.id)
															if (compact) setMobileOpen(false)
														}}
														aria-current={selected ? "location" : undefined}
														color="inherit"
														sx={{
															width: "100%",
															minHeight: 48,
															justifyContent: "flex-start",
															alignItems: "flex-start",
															gap: 0.75,
															px: 1,
															py: 0.75,
															borderLeft: 3,
															borderColor: selected ? "primary.main" : "transparent",
															borderRadius: "0 6px 6px 0",
															backgroundColor: selected ? "brandSoft" : "transparent",
															"&:hover": { backgroundColor: selected ? "brandSoft" : "surfaceMuted" },
														}}
													>
														<MethodBadge method={endpoint.method} />
														<Box sx={{ minWidth: 0, textAlign: "left", pt: 0.125 }}>
															<Typography
																component="span"
																sx={{
																	display: "block",
																	fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
																	fontSize: "0.74rem",
																	fontWeight: selected ? 700 : 600,
																	overflow: "hidden",
																	textOverflow: "ellipsis",
																	whiteSpace: "nowrap",
																}}
															>
																{path}
															</Typography>
															<Typography
																component="span"
																variant="caption"
																color="text.secondary"
																sx={{ display: "block", lineHeight: 1.35 }}
															>
																{endpoint.title}
															</Typography>
														</Box>
													</Button>
												)
											})}
											{groupEndpoints.length == 0 && (
												<Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 1, py: 1 }}>
													没有匹配端点
												</Typography>
											)}
										</Box>
									)}
								</Box>
							)
						})}
					</Box>

					<Divider sx={{ my: 1.25 }} />
					<Typography variant="caption" color="text.secondary" sx={{ display: "block", px: 1, mb: 0.5 }}>
						补充参考
					</Typography>
					<Box sx={{ display: "flex", flexDirection: "column" }}>
						{REFERENCE_LINKS.map((item) => (
							<Button
								key={item.id}
								color="inherit"
								onClick={() => scrollToReference(item.id)}
								sx={{ minHeight: 40, justifyContent: "flex-start", borderRadius: "6px", px: 1 }}
							>
								{item.label}
							</Button>
						))}
					</Box>
				</Box>
			)}
		</Box>
	)
}
