import * as React from "react"

import Box from "@mui/material/Box"
import Checkbox from "@mui/material/Checkbox"
import IconButton from "@mui/material/IconButton"
import LinearProgress from "@mui/material/LinearProgress"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import TextField from "@mui/material/TextField"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import { useTheme } from "@mui/material/styles"
import CheckIcon from "@mui/icons-material/Check"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"

import type { ParamDef, ParamValues } from "./model"
import type { RequestState } from "./request"

const MONOSPACE_FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

const CODE_BLOCK_SX = {
	width: "100%",
	maxWidth: "100%",
	minWidth: 0,
	backgroundColor: "surfaceMuted",
	border: 1,
	borderColor: "divider",
	borderRadius: "6px",
	px: { xs: 1.25, sm: 1.5 },
	py: 1.25,
	overflowX: "auto",
	fontFamily: MONOSPACE_FONT,
	fontSize: { xs: "0.71rem", sm: "0.75rem" },
	lineHeight: 1.65,
	whiteSpace: "pre",
	color: "text.primary",
	m: 0,
} as const

const RESULT_PLACEHOLDER_SX = {
	position: "relative",
	minHeight: 92,
	display: "flex",
	alignItems: "center",
	backgroundColor: "surfaceMuted",
	border: 1,
	borderColor: "divider",
	borderRadius: "6px",
	px: 1.5,
	py: 1.25,
	overflow: "hidden",
} as const

export function CodeBlock({
	children,
	ariaLabel,
}: {
	children: React.ReactNode
	ariaLabel?: string
}) {
	return (
		<Box
			component="pre"
			tabIndex={0}
			aria-label={ariaLabel ?? "代码内容"}
			sx={CODE_BLOCK_SX}
		>
			<code>{children}</code>
		</Box>
	)
}

const JSON_TOKEN_RE =
	/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?=\s*:)|"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/g

function PrettyJson({ text }: { text: string }) {
	const theme = useTheme()
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		return <CodeBlock ariaLabel="响应内容">{text}</CodeBlock>
	}
	const pretty = JSON.stringify(parsed, null, 2)
	const nodes: React.ReactNode[] = []
	let last = 0
	for (const match of pretty.matchAll(JSON_TOKEN_RE)) {
		const index = match.index ?? 0
		if (index > last) nodes.push(pretty.slice(last, index))
		const token = match[0]
		let color = "text.secondary"
		if (token.startsWith('"') && /^\s*:/.test(pretty.slice(index + token.length))) {
			color = "primary.main"
		} else if (/^-?\d/.test(token)) {
			color = theme.palette.mode == "dark" ? "primary.light" : "primary.dark"
		} else if (token == "true" || token == "false" || token == "null") {
			color = "error.main"
		}
		nodes.push(
			<Box component="span" key={index} sx={{ color }}>
				{token}
			</Box>
		)
		last = index + token.length
	}
	if (last < pretty.length) nodes.push(pretty.slice(last))
	return <CodeBlock ariaLabel="JSON 响应内容">{nodes}</CodeBlock>
}

export function RequestResult({ state }: { state: RequestState }) {
	if (state.status == "idle") {
		return (
			<Box sx={RESULT_PLACEHOLDER_SX} role="status">
				<Typography variant="caption" color="text.secondary">
					尚未发送请求
				</Typography>
			</Box>
		)
	}
	if (state.status == "loading") {
		return (
			<Box sx={RESULT_PLACEHOLDER_SX} role="status" aria-live="polite">
				<LinearProgress sx={{ position: "absolute", top: 0, left: 0, right: 0 }} />
				<Typography variant="caption" color="text.secondary">
					请求中…
				</Typography>
			</Box>
		)
	}
	if (state.status == "error") {
		return (
			<Box sx={{ ...RESULT_PLACEHOLDER_SX, borderColor: "error.main" }} role="alert">
				<Typography variant="caption" color="error.main" sx={{ overflowWrap: "anywhere" }}>
					{state.message}
				</Typography>
			</Box>
		)
	}
	return <PrettyJson text={state.body} />
}

export function MethodBadge({ method }: { method: "GET" | "POST" }) {
	return (
		<Box
			component="span"
			sx={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				minWidth: 38,
				px: 0.75,
				py: 0.2,
				border: 1,
				borderColor: "primary.main",
				borderRadius: "4px",
				fontSize: "0.68rem",
				fontWeight: 700,
				lineHeight: 1.45,
				color: "primary.dark",
				backgroundColor: "brandSoft",
				fontFamily: MONOSPACE_FONT,
				flexShrink: 0,
			}}
		>
			{method}
		</Box>
	)
}

export function CopyButton({
	copied,
	onCopy,
}: {
	copied: boolean
	onCopy: () => void
}) {
	return (
		<Tooltip title={copied ? "已复制" : "复制 curl"}>
			<IconButton
				onClick={onCopy}
				aria-label={copied ? "curl 已复制" : "复制 curl"}
				sx={{
					minWidth: 40,
					minHeight: 40,
					color: copied ? "success.main" : "text.secondary",
				}}
			>
				{copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
			</IconButton>
		</Tooltip>
	)
}

function ParamInput({
	param,
	value,
	onChange,
}: {
	param: ParamDef
	value: string
	onChange: (value: string) => void
}) {
	if (param.type == "boolean") {
		return (
			<Checkbox
				checked={value == "true"}
				onChange={(event) => onChange(event.target.checked ? "true" : "false")}
				slotProps={{ input: { "aria-label": `参数 ${param.name}` } }}
				sx={{ minWidth: 40, minHeight: 40 }}
			/>
		)
	}
	return (
		<TextField
			fullWidth
			size="small"
			type={param.type == "number" ? "number" : "text"}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			slotProps={{ htmlInput: { "aria-label": `参数 ${param.name}` } }}
			sx={{
				width: "100%",
				minWidth: 0,
				maxWidth: "none",
				"& .MuiInputBase-root": { minHeight: 40 },
				"& input": { minWidth: 0, fontSize: "0.78rem" },
			}}
		/>
	)
}

export function ParamsTable({
	params,
	values,
	editing,
	onChange,
}: {
	params: readonly ParamDef[]
	values: ParamValues
	editing: boolean
	onChange: (name: string, value: string) => void
}) {
	if (params.length == 0) {
		return (
			<Box sx={{ minHeight: 56, display: "flex", alignItems: "center", borderTop: 1, borderBottom: 1, borderColor: "divider" }}>
				<Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
					无参数
				</Typography>
			</Box>
		)
	}
	return (
		<TableContainer sx={{ width: "100%", maxWidth: "100%", overflowX: "hidden" }}>
			<Table
				size="small"
				aria-label="端点参数"
				sx={{
					tableLayout: { sm: "fixed" },
					"& .MuiTableHead-root": { display: { xs: "none", sm: "table-header-group" } },
					"& .MuiTableBody-root": { display: { xs: "block", sm: "table-row-group" } },
					"& .MuiTableRow-root": {
						display: { xs: "block", sm: "table-row" },
						py: { xs: 1.25, sm: 0 },
						borderTop: { xs: 1, sm: 0 },
						borderColor: { xs: "divider", sm: "transparent" },
					},
					"& .MuiTableBody-root .MuiTableRow-root:last-of-type": {
						borderBottom: { xs: 1, sm: 0 },
						borderColor: { xs: "divider", sm: "transparent" },
					},
					"& .MuiTableCell-root": {
						display: { xs: "block", sm: "table-cell" },
						width: { xs: "100%", sm: "auto" },
						maxWidth: "100%",
						borderBottom: { xs: 0, sm: 1 },
						borderColor: "divider",
						px: { xs: 1, sm: 1.25 },
						py: { xs: 0.25, sm: 1 },
					},
				}}
			>
				<TableHead>
					<TableRow>
						<TableCell sx={{ fontWeight: 600, width: "26%" }}>参数</TableCell>
						<TableCell sx={{ fontWeight: 600 }}>说明</TableCell>
						<TableCell sx={{ fontWeight: 600, width: "30%" }}>值</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{params.map((param) => (
						<TableRow key={`${param.location ?? "rpc"}:${param.name}`}>
							<TableCell sx={{ verticalAlign: "top", width: { sm: "26%" } }}>
								<Typography sx={{ fontFamily: MONOSPACE_FONT, fontSize: "0.78rem", fontWeight: 700, overflowWrap: "anywhere" }}>
									{param.name}
								</Typography>
								<Typography variant="caption" color="text.secondary" component="div">
									{param.type}
									{param.location ? ` · ${param.location}` : ""}
									{param.required ? " · 必填" : ""}
									{` · 默认 ${param.defaultValue}`}
								</Typography>
							</TableCell>
							<TableCell sx={{ fontSize: "0.8rem", color: "text.secondary", overflowWrap: "anywhere" }}>
								{param.description}
							</TableCell>
							<TableCell sx={{ verticalAlign: "top", width: { sm: "30%" }, pt: { xs: 0.75, sm: 1 } }}>
								{editing ? (
									<ParamInput
										param={param}
										value={values[param.name] ?? param.defaultValue}
										onChange={(value) => onChange(param.name, value)}
									/>
								) : (
									<Typography sx={{ fontFamily: MONOSPACE_FONT, fontSize: "0.78rem", color: "text.primary", overflowWrap: "anywhere" }}>
										{values[param.name] ?? param.defaultValue}
									</Typography>
								)}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</TableContainer>
	)
}
