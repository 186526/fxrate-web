"use client"

import * as React from "react"

import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"
import DarkModeIcon from "@mui/icons-material/DarkMode"
import LightModeIcon from "@mui/icons-material/LightMode"

import { useMounted } from "@/componets/rateStats"
import { useThemeMode } from "@/componets/theme"
import { EndpointNavigation } from "./api-docs/navigation"
import {
	API_ENDPOINTS,
	getDefaultValues,
	getEndpointById,
	isEndpointId,
	type EndpointId,
	type ParamValues,
} from "./api-docs/model"
import {
	EndpointRequestCoordinator,
	fetchBackendMeta,
	fetchInstanceInfo,
	isAbortError,
	type BackendMeta,
} from "./api-docs/request"
import { InstancePanel, ReferenceSections, type AsyncState } from "./api-docs/reference"
import { EndpointWorkbench } from "./api-docs/workbench"
import type { infoResponse } from "@/lib/fxrate/src/client"

const DEFAULT_ENDPOINT_ID: EndpointId = API_ENDPOINTS[0].id

const HEADER_SX = {
	position: "sticky",
	top: 0,
	zIndex: 1100,
	backgroundColor: "background.paper",
	borderBottom: 1,
	borderColor: "divider",
} as const

const HEADER_INNER_SX = {
	width: "100%",
	maxWidth: 1360,
	minHeight: 56,
	mx: "auto",
	px: { xs: 1, sm: 3 },
	display: "flex",
	alignItems: "center",
	gap: { xs: 0.5, sm: 1 },
	minWidth: 0,
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

const WORKSPACE_SX = {
	display: "grid",
	gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "232px minmax(0, 1fr)" },
	columnGap: { md: 3, lg: 4 },
	rowGap: 2,
	alignItems: "start",
	mt: { xs: 2, sm: 3 },
	minWidth: 0,
} as const

function subscribeHash(listener: () => void): () => void {
	window.addEventListener("hashchange", listener)
	return () => window.removeEventListener("hashchange", listener)
}

function getHashSnapshot(): EndpointId {
	try {
		const value = decodeURIComponent(window.location.hash.slice(1))
		return isEndpointId(value) ? value : DEFAULT_ENDPOINT_ID
	} catch (error) {
		console.warn("忽略无效 API 文档 hash", error)
		return DEFAULT_ENDPOINT_ID
	}
}

function getHashServerSnapshot(): EndpointId {
	return DEFAULT_ENDPOINT_ID
}

function messageFrom(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

export default function APIDocs() {
	const selectedId = React.useSyncExternalStore(
		subscribeHash,
		getHashSnapshot,
		getHashServerSnapshot
	)
	const selectedEndpoint = getEndpointById(selectedId) ?? API_ENDPOINTS[0]
	const [endpointValues, setEndpointValues] = React.useState(
		() => new Map<EndpointId, ParamValues>(
			API_ENDPOINTS.map((endpoint) => [endpoint.id, getDefaultValues(endpoint)])
		)
	)
	const [infoState, setInfoState] = React.useState<AsyncState<infoResponse>>({ status: "loading" })
	const [metaState, setMetaState] = React.useState<AsyncState<BackendMeta>>({ status: "loading" })
	const [coordinator] = React.useState(() => new EndpointRequestCoordinator())
	const mounted = useMounted()
	const { mode, toggle } = useThemeMode()
	const endpointHost = mounted ? window.location.origin : ""

	React.useEffect(() => {
		const controller = new AbortController()
		fetchInstanceInfo(controller.signal)
			.then((data) => setInfoState({ status: "success", data }))
			.catch((error: unknown) => {
				if (!isAbortError(error)) setInfoState({ status: "error", message: messageFrom(error) })
			})
		fetchBackendMeta(controller.signal)
			.then((data) => setMetaState({ status: "success", data }))
			.catch((error: unknown) => {
				if (!isAbortError(error)) setMetaState({ status: "error", message: messageFrom(error) })
			})
		return () => controller.abort()
	}, [])

	React.useEffect(() => {
		return () => coordinator.dispose()
	}, [coordinator])

	const selectEndpoint = (id: EndpointId) => {
		const nextHash = `#${id}`
		if (window.location.hash != nextHash) window.location.hash = nextHash
	}

	const instanceLabel = infoState.status == "success"
		? `${infoState.data.status} · ${infoState.data.sources.length} 个数据源`
		: infoState.status == "error"
			? "实例信息不可用"
			: "正在获取实例信息"
	const instanceColor = infoState.status == "success"
		? "success.main"
		: infoState.status == "error"
			? "error.main"
			: "text.disabled"

	return (
		<>
			<Box component="header" sx={HEADER_SX}>
				<Box sx={HEADER_INNER_SX}>
					<Tooltip title="返回汇率查询">
						<IconButton component="a" href="/" aria-label="返回汇率查询" color="inherit">
							<ArrowBackIcon fontSize="small" />
						</IconButton>
					</Tooltip>
					<Typography
						component="h1"
						sx={{
							fontSize: { xs: 17, sm: 19 },
							fontWeight: 700,
							lineHeight: 1.2,
							whiteSpace: "nowrap",
							overflow: "hidden",
							textOverflow: "ellipsis",
							minWidth: 0,
						}}
					>
						FXRate
						{" "}
						<Box component="span" sx={{ color: "text.secondary", fontWeight: 500, ml: 0.75 }}>
							API 参考
						</Box>
					</Typography>
					<Box sx={{ flexGrow: 1 }} />
					<Tooltip title={instanceLabel}>
						<Box
							role="status"
							aria-label={`后端实例：${instanceLabel}`}
							sx={{ display: "flex", alignItems: "center", gap: 0.75, minHeight: 40, px: 0.75 }}
						>
							<Box
								aria-hidden="true"
								sx={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: instanceColor, flexShrink: 0 }}
							/>
							<Typography
								variant="caption"
								color="text.secondary"
								sx={{ display: { xs: "none", sm: "block" }, whiteSpace: "nowrap" }}
							>
								{instanceLabel}
							</Typography>
						</Box>
					</Tooltip>
					<Tooltip title={mode == "dark" ? "切换浅色模式" : "切换暗色模式"}>
						<IconButton aria-label="切换主题" onClick={toggle}>
							{mode == "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
						</IconButton>
					</Tooltip>
				</Box>
			</Box>

			<Box component="main" sx={MAIN_SX}>
				<InstancePanel
					infoState={infoState}
					metaState={metaState}
					endpointHost={endpointHost}
				/>

				<Box sx={WORKSPACE_SX}>
					<EndpointNavigation selectedId={selectedId} onSelect={selectEndpoint} />
					<Box component="section" aria-label="API 端点与补充参考" sx={{ minWidth: 0 }}>
						<EndpointWorkbench
							key={selectedEndpoint.id}
							endpoint={selectedEndpoint}
							values={endpointValues.get(selectedEndpoint.id) ?? getDefaultValues(selectedEndpoint)}
							onValuesChange={(values) => {
								setEndpointValues((current) => {
									const next = new Map(current)
									next.set(selectedEndpoint.id, values)
									return next
								})
							}}
							backendMeta={metaState.status == "success" ? metaState.data : null}
							endpointHost={endpointHost}
							coordinator={coordinator}
						/>
						<ReferenceSections
							info={infoState.status == "success" ? infoState.data : null}
							endpointHost={endpointHost}
						/>
					</Box>
				</Box>

				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ display: "block", borderTop: 1, borderColor: "divider", mt: 4, pt: 2 }}
				>
					数据版权归各来源所有 · 所有 GET 接口支持 CORS（ENABLE_CORS 时）
				</Typography>
			</Box>
		</>
	)
}
