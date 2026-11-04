import * as React from "react"

import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Divider from "@mui/material/Divider"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import CloseIcon from "@mui/icons-material/Close"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"

import {
	buildRestPath,
	buildRpcBody,
	getEndpointParams,
	type ApiEndpoint,
	type ParamValues,
} from "./model"
import {
	EndpointRequestCoordinator,
	fetchRest,
	fetchRpc,
	type BackendMeta,
	type RequestState,
} from "./request"
import { CodeBlock, CopyButton, MethodBadge, ParamsTable, RequestResult } from "./ui"

const WORKBENCH_SX = {
	minWidth: 0,
	overflow: "hidden",
	border: 1,
	borderColor: "divider",
	borderRadius: "8px",
	boxShadow: 1,
	scrollMarginTop: "72px",
} as const

const WORKBENCH_HEADER_SX = {
	px: { xs: 1.5, sm: 2.5 },
	py: { xs: 1.5, sm: 2 },
	backgroundColor: "surfaceMuted",
	borderBottom: 1,
	borderColor: "divider",
} as const

const WORKBENCH_BODY_SX = {
	px: { xs: 1.5, sm: 2.5 },
	py: { xs: 1.5, sm: 2.5 },
	minWidth: 0,
} as const

const SECTION_HEADER_SX = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	gap: 1,
	mb: 1,
} as const

async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch (clipboardError) {
		if (typeof document.execCommand != "function") {
			console.error("无法复制 curl", clipboardError)
			return false
		}
		const textarea = document.createElement("textarea")
		textarea.value = text
		textarea.style.position = "fixed"
		textarea.style.opacity = "0"
		document.body.appendChild(textarea)
		textarea.select()
		const copied = document.execCommand("copy")
		document.body.removeChild(textarea)
		return copied
	}
}

function quoteShell(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`
}

function requestTask(endpoint: ApiEndpoint, values: ParamValues) {
	if (endpoint.protocol == "rest") {
		const path = buildRestPath(endpoint, values)
		return (signal: AbortSignal) => fetchRest(path, signal)
	}
	const body = buildRpcBody(endpoint, values)
	return (signal: AbortSignal) => fetchRpc(body, signal)
}

export function EndpointWorkbench({
	endpoint,
	values,
	onValuesChange,
	backendMeta,
	endpointHost,
	coordinator,
}: {
	endpoint: ApiEndpoint
	values: ParamValues
	onValuesChange: (values: ParamValues) => void
	backendMeta: BackendMeta | null
	endpointHost: string
	coordinator: EndpointRequestCoordinator
}) {
	const [editing, setEditing] = React.useState(false)
	const [state, setState] = React.useState<RequestState>({ status: "idle" })
	const [copied, setCopied] = React.useState(false)
	const [copyError, setCopyError] = React.useState("")
	const copyTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const params = getEndpointParams(endpoint)
	const restPath = endpoint.protocol == "rest" ? buildRestPath(endpoint, values) : null
	const rpcBody = endpoint.protocol == "rpc" ? buildRpcBody(endpoint, values) : null
	const curl = endpoint.protocol == "rest"
		? `curl -X GET "${backendMeta?.restBase ?? `${endpointHost}/api/rest`}${restPath}"`
		: `curl -X POST "${backendMeta?.rpcUrl ?? `${endpointHost}/api/fxrate`}" -H 'Content-Type: application/json' -d ${quoteShell(JSON.stringify(rpcBody))}`

	React.useEffect(() => {
		return () => {
			coordinator.cancel(endpoint.id)
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
		}
	}, [coordinator, endpoint.id])

	const run = (nextValues: ParamValues) => {
		coordinator.run(endpoint.id, requestTask(endpoint, nextValues), setState)
	}

	const schedule = (nextValues: ParamValues) => {
		coordinator.schedule(endpoint.id, requestTask(endpoint, nextValues), setState)
	}

	const handleCopy = () => {
		copyText(curl).then((ok) => {
			if (!ok) {
				setCopyError("复制失败，请手动选择 curl 命令")
				return
			}
			setCopyError("")
			setCopied(true)
			if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
			copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
		})
	}

	return (
		<Paper
			component="article"
			id={endpoint.id}
			aria-labelledby={`${endpoint.id}-title`}
			elevation={0}
			sx={WORKBENCH_SX}
		>
			<Box sx={WORKBENCH_HEADER_SX}>
				<Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
					<MethodBadge method={endpoint.method} />
					<Typography
						id={`${endpoint.id}-title`}
						component="h2"
						variant="h6"
						sx={{ fontSize: { xs: 18, sm: 20 }, fontWeight: 700 }}
					>
						{endpoint.title}
					</Typography>
				</Box>
				<Typography
					component="div"
					sx={{
						mt: 0.75,
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: { xs: "0.78rem", sm: "0.84rem" },
						fontWeight: 600,
						overflowWrap: "anywhere",
					}}
				>
					{endpoint.protocol == "rest" ? endpoint.path : endpoint.methodName}
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, maxWidth: 760 }}>
					{endpoint.description}
				</Typography>
			</Box>

			<Box sx={WORKBENCH_BODY_SX}>
				<Box component="section" aria-labelledby={`${endpoint.id}-params-title`}>
					<Box sx={SECTION_HEADER_SX}>
						<Box>
							<Typography id={`${endpoint.id}-params-title`} component="h3" variant="subtitle2">
								请求参数
							</Typography>
							<Typography variant="caption" color="text.secondary">
								{editing ? "修改后将在 300ms 内重新请求" : `${params.length} 个参数`}
							</Typography>
						</Box>
						{editing ? (
							<Button
								variant="outlined"
								color="inherit"
								startIcon={<CloseIcon fontSize="small" />}
								onClick={() => {
									coordinator.cancel(endpoint.id)
									setState({ status: "idle" })
									setEditing(false)
								}}
								sx={{ minHeight: 40, flexShrink: 0 }}
							>
								结束编辑
							</Button>
						) : (
							<Button
								variant="tonal"
								startIcon={<PlayArrowIcon fontSize="small" />}
								onClick={() => {
									setEditing(true)
									run(values)
								}}
								sx={{ minHeight: 40, flexShrink: 0 }}
							>
								试试看
							</Button>
						)}
					</Box>

					<ParamsTable
						params={params}
						values={values}
						editing={editing}
						onChange={(name, value) => {
							const next = { ...values, [name]: value }
							onValuesChange(next)
							schedule(next)
						}}
					/>
					{endpoint.responseNote && (
						<Box
							sx={{
								mt: 1.25,
								pl: 1.25,
								borderLeft: 3,
								borderColor: "primary.main",
							}}
						>
							<Typography variant="caption" color="text.secondary">
								{endpoint.responseNote}
							</Typography>
						</Box>
					)}
				</Box>

				<Divider sx={{ my: { xs: 2, sm: 2.5 } }} />

				<Box component="section" aria-labelledby={`${endpoint.id}-curl-title`}>
					<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 0.75 }}>
						<Typography id={`${endpoint.id}-curl-title`} component="h3" variant="subtitle2">
							curl
						</Typography>
						<CopyButton copied={copied} onCopy={handleCopy} />
					</Box>
					<CodeBlock ariaLabel="curl 请求命令">{curl}</CodeBlock>
					{copyError && (
						<Typography variant="caption" color="error.main" role="alert" sx={{ display: "block", mt: 0.5 }}>
							{copyError}
						</Typography>
					)}
				</Box>

				<Divider sx={{ my: { xs: 2, sm: 2.5 } }} />

				<Box component="section" aria-labelledby={`${endpoint.id}-response-title`}>
					<Typography id={`${endpoint.id}-response-title`} component="h3" variant="subtitle2" sx={{ mb: 0.75 }}>
						响应
					</Typography>
					<RequestResult state={state} />
				</Box>
			</Box>
		</Paper>
	)
}
