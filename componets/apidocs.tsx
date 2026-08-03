"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Card from "@mui/material/Card"
import Checkbox from "@mui/material/Checkbox"
import Chip from "@mui/material/Chip"
import Collapse from "@mui/material/Collapse"
import Divider from "@mui/material/Divider"
import IconButton from "@mui/material/IconButton"
import Link from "@mui/material/Link"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import TextField from "@mui/material/TextField"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"
import CheckIcon from "@mui/icons-material/Check"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"

import { FXRate, safeUpdated } from "@/componets/tools"
import { useMounted } from "@/componets/rateStats"
import type { infoResponse } from "@/lib/fxrate/src/client"

type TryState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "done"; body: string }
	| { status: "error"; message: string }

type ParamDef = { name: string; type: string; desc: string; def?: string; in?: "path" | "query" }

// 路径参数详细说明（表头渲染用，避免统一"路径参数"敷衍了事）
const PATH_PARAM_DEFS: Record<string, { type: string; desc: string }> = {
	source: { type: "string", desc: "数据源英文名（如 boc、icbc、hsbc.cn），见下方数据源列表" },
	from: { type: "string", desc: "基准货币代码（如 USD、EUR、HKD），ISO 4217 三字母" },
	to: { type: "string", desc: "目标货币代码（如 CNY），ISO 4217 三字母" },
	type: { type: "string", desc: "报价类型：cash（现钞）/ remit（现汇）/ middle（中间价）" },
	amount: { type: "number", desc: "换算金额，返回按该金额换算后的结果" },
}

const REST_ROUTES = [
	{
		path: "/:source",
		desc: "源信息（名称/支持货币数/更新时间）",
		example: "/boc",
	},
	{
		path: "/:source/:from",
		desc: "源内某基准货币对全部目标货币的汇率详情（全表）",
		example: "/boc/USD",
	},
	{
		path: "/:source/:from/:to",
		desc: "单对汇率详情（买卖价/中间价 JSON）",
		example: "/boc/USD/CNY",
		respNote:
			"响应含 remit/cash/middle（银行买入价）与 sell.remit/sell.cash（卖出价）。?bfs=1 时附加 path（实际兑换路径）；CNY/CNH 归一化命中时响应含 alias（如 \"CNH\"，源只用 CNH 报价、实际按 CNH 汇率计），REST 响应头同时设 X-FXRate-Alias。",
	},
	{
		path: "/:source/:from/:to/:type/:amount",
		desc: "单对换算（返回纯数值；:type 为 cash/remit/middle）",
		example: "/boc/USD/CNY/remit/100",
	},
] as const

const QUERY_PARAMS: ParamDef[] = [
	{ name: "amount", type: "number", def: "100", in: "query", desc: "换算金额（换算类路径）" },
	{ name: "precision", type: "number", def: "5", in: "query", desc: "输出小数位；-1 表示原样不四舍五入" },
	{ name: "reverse", type: "boolean", def: "false", in: "query", desc: "反向换算（from/to 互换语义）" },
	{ name: "bfs", type: "boolean", def: "false", in: "query", desc: "启用交叉汇率 BFS（无直连时经中间货币折算）；源只用 CNH 报价时响应含 alias 字段（如 CNH），实际按 CNH 汇率计" },
	{ name: "fees", type: "number", def: "0", in: "query", desc: "加收手续费百分比（乘 1 + fees/100）" },
	{ name: "pretty", type: "boolean", def: "false", in: "query", desc: "JSON 缩进输出" },
]

const JSONRPC_METHODS = [
	{
		name: "instanceInfo",
		params: [] as ParamDef[],
		desc: "同 GET /info（版本、source 列表、后端状态）",
	},
	{
		name: "listCurrencies",
		params: [
			{ name: "source", type: "string", def: "boc", desc: "数据源英文名（如 boc），必填" },
		] as ParamDef[],
		desc: "该源支持的全部货币列表",
	},
	{
		name: "listFXRates",
		params: [
			{ name: "source", type: "string", def: "boc", desc: "数据源英文名（如 boc）" },
			{ name: "from", type: "string", def: "CNY", desc: "基准货币代码" },
			{ name: "precision", type: "number", def: "4", desc: "输出小数位" },
			{ name: "amount", type: "number", def: "100", desc: "换算金额" },
			{ name: "bfs", type: "boolean", def: "false", desc: "交叉汇率 BFS 开关；CNH-only 源命中 CNY/CNH 归一化时响应含 alias 字段" },
		] as ParamDef[],
		desc: "该货币对全部来源的汇率详情",
	},
	{
		name: "getFXRate",
		params: [
			{ name: "source", type: "string", def: "boc", desc: "数据源英文名（如 boc）" },
			{ name: "from", type: "string", def: "USD", desc: "基准货币代码" },
			{ name: "to", type: "string", def: "CNY", desc: "目标货币代码" },
			{ name: "type", type: "string", def: "remit", desc: "cash / remit / middle" },
			{ name: "precision", type: "number", def: "4", desc: "输出小数位" },
			{ name: "amount", type: "number", def: "100", desc: "换算金额" },
			{ name: "fees", type: "number", def: "0", desc: "手续费百分比" },
			{ name: "bfs", type: "boolean", def: "false", desc: "交叉汇率 BFS 开关；CNH-only 源命中 CNY/CNH 归一化时响应含 alias 字段" },
		] as ParamDef[],
		desc: "单源单对汇率详情（type 为 cash/remit/middle）",
	},
] as const

const SOURCE_CATEGORIES = [
	{
		title: "央行/卡组织",
		desc: "中间价或单一报价，无买卖价（pboc/unionpay/mastercard/visa/jcb/ecb/hkma/cfets）",
		examples: ["pboc", "unionpay", "mastercard", "visa", "jcb", "ecb", "hkma", "cfets"],
	},
	{
		title: "中资银行",
		desc: "买卖价 + 中间价齐全",
		examples: ["boc", "bochk", "icbc", "ccb", "abc", "bocom", "psbc", "cmb", "cib", "citic.cn"],
	},
	{
		title: "外资银行",
		desc: "hsbc/dbs 各法域独立 source",
		examples: ["hsbc.cn", "hsbc.hk", "hsbc.au", "dbs", "dbs.cn", "dbs.hk"],
	},
	{
		title: "其他",
		desc: "wise 中间价；alipay 单向结算汇率（oneWay，无反向）",
		examples: ["wise", "alipay"],
	},
] as const

function CodeBlock({ children }: { children: React.ReactNode }) {
	return (
		<Box
			component="pre"
			sx={{
				backgroundColor: "surfaceMuted",
				border: 1,
				borderColor: "divider",
				borderRadius: "10px",
				p: 1.5,
				overflowX: "auto",
				fontSize: "0.75rem",
				lineHeight: 1.6,
				m: 0,
			}}
		>
			<code>{children}</code>
		</Box>
	)
}

// 轻量 JSON 语法高亮：正则逐 token 分色，不引第三方库。
// 颜色取自 Sunoaki 主题语义（key=primary、string=success-ish 绿、number=amber、bool/null=error 红）
const JSON_TOKEN_RE =
	/("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?=\s*:)|"(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/g

function PrettyJson({ text }: { text: string }) {
	const colors = {
		key: "primary.main",
		string: "#7cb342",
		number: "#ffb74d",
		literal: "#ef5350",
	}
	let parsed: unknown
	try {
		parsed = JSON.parse(text)
	} catch {
		// 非 JSON 响应（如换算纯数值）原样显示
		return <CodeBlock>{text}</CodeBlock>
	}
	const pretty = JSON.stringify(parsed, null, 2)
	const nodes: React.ReactNode[] = []
	let last = 0
	for (const m of pretty.matchAll(JSON_TOKEN_RE)) {
		const idx = m.index!
		if (idx > last) nodes.push(pretty.slice(last, idx))
		const token = m[0]
		let color = colors.string
		if (token.startsWith('"') && pretty.slice(idx + token.length).match(/^\s*:/)) {
			color = colors.key
		} else if (/^-?\d/.test(token)) {
			color = colors.number
		} else if (token == "true" || token == "false" || token == "null") {
			color = colors.literal
		}
		nodes.push(
			<Box component="span" key={idx} sx={{ color }}>
				{token}
			</Box>
		)
		last = idx + token.length
	}
	if (last < pretty.length) nodes.push(pretty.slice(last))
	return <CodeBlock>{nodes}</CodeBlock>
}

function TryResult({ state }: { state: TryState }) {
	if (state.status == "loading") {
		return (
			<Typography variant="caption" color="text.secondary">
				请求中…
			</Typography>
		)
	}
	if (state.status == "idle") return null
	if (state.status == "error") {
		return (
			<Typography variant="caption" color="error.main" sx={{ wordBreak: "break-all" }}>
				{state.message}
			</Typography>
		)
	}
	return <PrettyJson text={state.body} />
}

// Swagger 风格 HTTP 方法徽章（GET 绿 / POST 蓝）
const METHOD_COLORS: Record<string, string> = {
	GET: "#61affe",
	POST: "#49cc90",
}

function MethodBadge({ method }: { method: string }) {
	return (
		<Box
			component="span"
			sx={{
				display: "inline-block",
				px: 0.75,
				py: 0.25,
				borderRadius: "6px",
				fontSize: "0.72rem",
				fontWeight: 700,
				lineHeight: 1.4,
				color: "#fff",
				backgroundColor: METHOD_COLORS[method] ?? "#8a8a8a",
				fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
				flexShrink: 0,
			}}
		>
			{method}
		</Box>
	)
}

function EndpointItem({
	method,
	path,
	desc,
	children,
	expanded,
	onToggle,
}: {
	method: string
	path: string
	desc: string
	children?: React.ReactNode
	expanded: boolean
	onToggle: () => void
}) {
	return (
		<Box sx={{ border: 1, borderColor: "divider", borderRadius: "12px", overflow: "hidden" }}>
			<Box
				component="button"
				onClick={onToggle}
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 1,
					width: "100%",
					border: "none",
					background: "none",
					cursor: "pointer",
					textAlign: "left",
					color: "text.primary",
					px: 1.5,
					py: 1,
					"&:hover": { backgroundColor: "surfaceMuted" },
				}}
			>
				<MethodBadge method={method} />
				<Typography
					sx={{
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
						fontSize: "0.82rem",
						fontWeight: 600,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
					}}
				>
					{path}
				</Typography>
				<Box sx={{ flexGrow: 1 }} />
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ display: { xs: "none", sm: "block" }, mr: 0.5 }}
				>
					{desc}
				</Typography>
				<KeyboardArrowDownIcon
					fontSize="small"
					sx={{
						color: "text.secondary",
						transform: expanded ? "rotate(180deg)" : "none",
						transition: "transform 0.2s",
					}}
				/>
			</Box>
			<Collapse in={expanded}>
				<Box sx={{ px: 1.5, pb: 1.5, borderTop: expanded ? 1 : 0, borderColor: "divider", pt: expanded ? 1.5 : 0 }}>
					{children}
				</Box>
			</Collapse>
		</Box>
	)
}

// 路径模板 :name 占位符 → 参数名列表（如 "/:source/:from/:to" → ["source","from","to"]）
function pathParamNames(template: string): string[] {
	return [...template.matchAll(/:(\w+)/g)].map((m) => m[1])
}

// 从示例 URL 解析路径参数默认值（如 "/boc/USD/CNY" → {source:"boc", from:"USD", to:"CNY"}）
function pathParamDefaults(template: string, example: string): Record<string, string> {
	const names = pathParamNames(template)
	const segs = example.split("/").filter(Boolean)
	const out: Record<string, string> = {}
	names.forEach((n, i) => {
		out[n] = segs[i] ?? ""
	})
	return out
}

// 把参数值套进路径模板并拼接查询串，得到实际请求 URL（同源代理相对路径）
function buildRequestUrl(
	template: string,
	pathVals: Record<string, string>,
	queryVals: Record<string, string>
): string {
	const path = template.replace(/:(\w+)/g, (_, n) => encodeURIComponent(pathVals[n] ?? ""))
	const pathNames = new Set(pathParamNames(template))
	const qs = QUERY_PARAMS.filter((q) => !pathNames.has(q.name))
		.map((q) => {
			const v = queryVals[q.name] ?? q.def ?? ""
			if (q.type == "boolean") return v == "true" ? `${q.name}=true` : null
			if (v == "") return null
			return `${q.name}=${encodeURIComponent(v)}`
		})
		.filter(Boolean)
		.join("&")
	return path + (qs ? "?" + qs : "")
}

// JSON-RPC 请求体：按参数表 + 当前输入值构建（数字/布尔做类型转换，空值跳过）
function buildRpcBody(method: string, params: ParamDef[], vals: Record<string, string>): unknown {
	const body: Record<string, unknown> = {}
	for (const p of params) {
		const v = vals[p.name]
		if (v == null || v == "") continue
		if (p.type == "number") {
			const n = Number(v)
			if (Number.isFinite(n)) body[p.name] = n
		} else if (p.type == "boolean") {
			body[p.name] = v == "true"
		} else {
			body[p.name] = v
		}
	}
	return { jsonrpc: "2.0", id: 1, method, params: body }
}

function CopyButton({ text, copied, onCopy }: { text: string; copied: boolean; onCopy: () => void }) {
	return (
		<Tooltip title={copied ? "已复制" : "复制 curl"}>
			<IconButton size="small" onClick={onCopy} sx={{ color: copied ? "success.main" : "text.secondary" }}>
				{copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
			</IconButton>
		</Tooltip>
	)
}

// 单个参数输入：boolean → Checkbox，number → 数字框，其余 → 文本框
function ParamInput({
	param,
	value,
	onChange,
}: {
	param: ParamDef
	value: string
	onChange: (v: string) => void
}) {
	if (param.type == "boolean") {
		return (
			<Checkbox
				size="small"
				checked={value == "true"}
				onChange={(e) => onChange(e.target.checked ? "true" : "false")}
			/>
		)
	}
	return (
		<TextField
			size="small"
			type={param.type == "number" ? "number" : "text"}
			value={value}
			onChange={(e) => onChange(e.target.value)}
			sx={{ minWidth: 140, maxWidth: 260, "& input": { fontSize: "0.78rem", py: 0.75 } }}
		/>
	)
}

// Swagger 风格参数表：Name（含类型/位置标注）| Description | Value。
// Value 列非编辑态只读显示默认值，Try it out 编辑态变成输入控件（布尔为 Checkbox）
function ParamsTable({
	params,
	vals,
	editing,
	onChange,
}: {
	params: ParamDef[]
	vals: Record<string, string>
	editing: boolean
	onChange: (name: string, v: string) => void
}) {
	return (
		<TableContainer>
			<Table size="small">
				<TableHead>
					<TableRow>
						<TableCell sx={{ fontWeight: 600, width: "38%" }}>Name</TableCell>
						<TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
						<TableCell sx={{ fontWeight: 600, width: "34%" }}>Value</TableCell>
					</TableRow>
				</TableHead>
				<TableBody>
					{params.map((p) => (
						<TableRow key={p.name}>
							<TableCell sx={{ verticalAlign: "top" }}>
								<Typography sx={{ fontFamily: "monospace", fontSize: "0.78rem", fontWeight: 600 }}>
									{p.name}
								</Typography>
								<Typography variant="caption" color="text.secondary" component="div">
									{p.type}
									{p.in ? ` (${p.in})` : ""}
									{p.def ? ` · 默认 ${p.def}` : ""}
								</Typography>
							</TableCell>
							<TableCell sx={{ fontSize: "0.8rem" }}>{p.desc}</TableCell>
							<TableCell sx={{ verticalAlign: "top" }}>
								{editing ? (
									<ParamInput param={p} value={vals[p.name] ?? ""} onChange={(v) => onChange(p.name, v)} />
								) : (
									<Typography sx={{ fontFamily: "monospace", fontSize: "0.78rem", color: "text.secondary" }}>
										{vals[p.name] || "—"}
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

// REST 试试看：经同源代理 /api/rest/:path 转发到后端（浏览器跨域由 next.config rewrites 解决）
function restTry(path: string): Promise<string> {
	return fetch(`/api/rest${path}`, { cache: "no-store" }).then(async (resp) => {
		const text = await resp.text()
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`)
		return text.slice(0, 4000)
	})
}

function rpcTry(body: unknown): Promise<string> {
	return fetch("/api/fxrate", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		cache: "no-store",
	}).then(async (resp) => {
		const text = await resp.text()
		if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`)
		return text.slice(0, 4000)
	})
}

async function copyToClipboard(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text)
		return true
	} catch {
		// clipboard API 不可用（非 https 等）时降级 textarea 复制
		const ta = document.createElement("textarea")
		ta.value = text
		ta.style.position = "fixed"
		ta.style.opacity = "0"
		document.body.appendChild(ta)
		ta.select()
		const ok = document.execCommand("copy")
		document.body.removeChild(ta)
		return ok
	}
}

export default function APIDocs() {
	const [info, setInfo] = React.useState<infoResponse | null>(null)
	const [infoError, setInfoError] = React.useState("")
	const [restStates, setRestStates] = React.useState<Record<string, TryState>>({})
	const [rpcStates, setRpcStates] = React.useState<Record<string, TryState>>({})
	const [expandedRest, setExpandedRest] = React.useState<string | null>(null)
	const [expandedRpc, setExpandedRpc] = React.useState<string | null>(null)
	const [backendMeta, setBackendMeta] = React.useState<{ rpcUrl: string; restBase: string } | null>(null)
	const [restVals, setRestVals] = React.useState<Record<string, Record<string, string>>>({})
	const [rpcVals, setRpcVals] = React.useState<Record<string, Record<string, string>>>({})
	// Try it out 编辑态：key(端点) → 是否可编辑参数
	const [restEditing, setRestEditing] = React.useState<Record<string, boolean>>({})
	const [rpcEditing, setRpcEditing] = React.useState<Record<string, boolean>>({})
	const [copiedKey, setCopiedKey] = React.useState<string | null>(null)
	const mounted = useMounted()
	const endpoint = FXRate.endpoint

	React.useEffect(() => {
		FXRate.info((resp) => {
			setInfo(resp)
			setInfoError("")
		})
		fetch("/api/backend-meta", { cache: "no-store" })
			.then((r) => r.json())
			.then((m) => setBackendMeta(m))
			.catch(() => {})
	}, [])

	const runRest = (key: string, path: string) => {
		setRestStates((prev) => ({ ...prev, [key]: { status: "loading" } }))
		restTry(path)
			.then((body) => setRestStates((prev) => ({ ...prev, [key]: { status: "done", body } })))
			.catch((e: unknown) =>
				setRestStates((prev) => ({
					...prev,
					[key]: { status: "error", message: e instanceof Error ? e.message : String(e) },
				}))
			)
	}

	const runRpc = (key: string, body: unknown) => {
		setRpcStates((prev) => ({ ...prev, [key]: { status: "loading" } }))
		rpcTry(body)
			.then((b) => setRpcStates((prev) => ({ ...prev, [key]: { status: "done", body: b } })))
			.catch((e: unknown) =>
				setRpcStates((prev) => ({
					...prev,
					[key]: { status: "error", message: e instanceof Error ? e.message : String(e) },
				}))
			)
	}

	const handleCopy = (key: string, text: string) => {
		copyToClipboard(text).then((ok) => {
			if (ok) {
				setCopiedKey(key)
				window.setTimeout(() => setCopiedKey((cur) => (cur == key ? null : cur)), 1500)
			}
		})
	}

	// 编辑态改参数防抖自动请求：timer 存 ref，每次改动重置 300ms
	const restTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const rpcTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
	const scheduleRest = (key: string, url: string) => {
		if (restTimerRef.current) clearTimeout(restTimerRef.current)
		restTimerRef.current = setTimeout(() => runRest(key, url), 300)
	}
	const scheduleRpc = (key: string, body: unknown) => {
		if (rpcTimerRef.current) clearTimeout(rpcTimerRef.current)
		rpcTimerRef.current = setTimeout(() => runRpc(key, body), 300)
	}
	const cancelRestTimer = () => {
		if (restTimerRef.current) {
			clearTimeout(restTimerRef.current)
			restTimerRef.current = null
		}
	}
	const cancelRpcTimer = () => {
		if (rpcTimerRef.current) {
			clearTimeout(rpcTimerRef.current)
			rpcTimerRef.current = null
		}
	}

	const endpointHost =
		typeof window == "undefined" ? "http://localhost:3000" : window.location.origin

	return (
		<main style={{ width: "100%", display: "flex", justifyContent: "center" }}>
			<Box
				sx={{
					width: "100%",
					maxWidth: 960,
					mx: "auto",
					px: { xs: 1.5, sm: 3 },
					py: 3,
					display: "flex",
					flexDirection: "column",
					gap: 3,
				}}
			>
			<Box>
				<Typography variant="h4" component="h1" sx={{ fontWeight: 700, letterSpacing: "-0.01em" }}>
					后端 API 文档
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
					提供 REST API v1、JSON-RPC v2 与 RSS/Atom 三种接口
				</Typography>
			</Box>

			<Card sx={{ p: { xs: 2, sm: 3 } }}>
				<Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
					当前后端实例
				</Typography>
				<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
					<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
						<Typography variant="body2" color="text.secondary">
							RPC 端点：
						</Typography>
						<Chip size="small" label={mounted ? endpoint.toString() : "…"} variant="outlined" />
					</Box>
					<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
						<Typography variant="body2" color="text.secondary">
							同源代理：
						</Typography>
						<Chip size="small" label={`${endpointHost}/api/fxrate`} variant="outlined" />
					</Box>
					{info ? (
						<Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
							<Typography variant="body2" color="text.secondary">版本：</Typography>
							<Chip size="small" label={info.version} color="primary" variant="outlined" />
							<Chip size="small" label={`${info.sources.length} 个数据源`} variant="outlined" />
							<Chip size="small" label={info.apiVersion} variant="outlined" />
						</Box>
					) : infoError ? (
						<Typography variant="caption" color="error.main">{infoError}</Typography>
					) : (
						<Typography variant="caption" color="text.secondary">正在获取实例信息…</Typography>
					)}
				</Box>
			</Card>

			<Card sx={{ p: { xs: 2, sm: 3 } }}>
				<Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
					REST API v1
				</Typography>
				<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
					点击端点展开详情。点「试试」进入编辑模式：可直接改参数、复制 curl 或发起请求（
					<code>{`${endpointHost}/api/rest/:path`}</code>
					同源代理，等价于直接访问后端）
				</Typography>
				<Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
					{REST_ROUTES.map((r) => {
						const key = r.path
						const pathParams = pathParamNames(r.path)
						const pathNames = new Set(pathParams)
						const queryParams = QUERY_PARAMS.filter((q) => !pathNames.has(q.name))
						const vals = restVals[key] ?? {
							...pathParamDefaults(r.path, r.example),
							...Object.fromEntries(queryParams.map((q) => [q.name, q.def ?? ""])),
						}
						const url = buildRequestUrl(r.path, vals, vals)
						const curlUrl = `${backendMeta?.restBase ?? endpointHost}${url}`
						const curl = `curl -X GET "${curlUrl}"`
						const setVal = (name: string, v: string) =>
							setRestVals((prev) => ({ ...prev, [key]: { ...vals, [name]: v } }))
						return (
							<EndpointItem
								key={key}
								method="GET"
								path={r.path}
								desc={r.desc}
								expanded={expandedRest == key}
								onToggle={() => setExpandedRest(expandedRest == key ? null : key)}
							>
								<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
									<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
										<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
											Parameters
										</Typography>
										{restEditing[key] ? (
											<Button
												size="small"
												variant="outlined"
												color="inherit"
												onClick={() => {
													cancelRestTimer()
													setRestEditing((prev) => ({ ...prev, [key]: false }))
												}}
												sx={{ textTransform: "none", flexShrink: 0 }}
											>
												Cancel
											</Button>
										) : (
											<Button
												size="small"
												variant="tonal"
												onClick={() => {
													setRestVals((prev) => ({ ...prev, [key]: vals }))
													setRestEditing((prev) => ({ ...prev, [key]: true }))
													runRest(key, url)
												}}
												sx={{ textTransform: "none", flexShrink: 0 }}
											>
												Try it out
											</Button>
										)}
									</Box>
									<ParamsTable
										params={[
											...pathParams.map((n) => ({
												name: n,
												type: PATH_PARAM_DEFS[n]?.type ?? "string",
												in: "path" as const,
												desc: PATH_PARAM_DEFS[n]?.desc ?? "路径参数",
												def: vals[n],
											})),
											...QUERY_PARAMS.filter((q) => !pathNames.has(q.name)),
										]}
										vals={vals}
										editing={restEditing[key] ?? false}
										onChange={(name, v) => {
											const next = { ...vals, [name]: v }
											setRestVals((prev) => ({ ...prev, [key]: next }))
											scheduleRest(key, buildRequestUrl(r.path, next, next))
										}}
									/>
									{"respNote" in r && r.respNote && (
										<Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
											{r.respNote}
										</Typography>
									)}
									{backendMeta && (
										<Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
											<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
												<Typography variant="caption" color="text.secondary">curl</Typography>
												<CopyButton
													text={curl}
													copied={copiedKey == `rest:${key}`}
													onCopy={() => handleCopy(`rest:${key}`, curl)}
												/>
											</Box>
											<CodeBlock>{curl}</CodeBlock>
										</Box>
									)}
									<TryResult state={restStates[key] ?? { status: "idle" }} />
								</Box>
							</EndpointItem>
						)
					})}
				</Box>
			</Card>

			<Card sx={{ p: { xs: 2, sm: 3 } }}>
				<Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
					JSON-RPC v2
				</Typography>
				<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 2 }}>
					端点：<code>POST /v1/jsonrpc</code>（本页经同源代理
					<code>{` ${endpointHost}/api/fxrate`}</code>）。支持 batch 批量请求
				</Typography>
				<Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
					{JSONRPC_METHODS.map((m) => {
						const key = m.name
						const vals = rpcVals[key] ?? Object.fromEntries(m.params.map((p) => [p.name, p.def ?? ""]))
						const body = buildRpcBody(m.name, m.params, vals)
						const curl = `curl -X POST "${backendMeta?.rpcUrl ?? `${endpointHost}/api/fxrate`}" -H 'Content-Type: application/json' -d '${JSON.stringify(body)}'`
						const setVal = (name: string, v: string) =>
							setRpcVals((prev) => ({ ...prev, [key]: { ...vals, [name]: v } }))
						return (
							<EndpointItem
								key={key}
								method="POST"
								path={m.name}
								desc={m.desc}
								expanded={expandedRpc == key}
								onToggle={() => setExpandedRpc(expandedRpc == key ? null : key)}
							>
								<Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
									<Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
										<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
											Parameters
										</Typography>
										{rpcEditing[key] ? (
											<Button
												size="small"
												variant="outlined"
												color="inherit"
												onClick={() => {
													cancelRpcTimer()
													setRpcEditing((prev) => ({ ...prev, [key]: false }))
												}}
												sx={{ textTransform: "none", flexShrink: 0 }}
											>
												Cancel
											</Button>
										) : (
											<Button
												size="small"
												variant="tonal"
												onClick={() => {
													setRpcVals((prev) => ({ ...prev, [key]: vals }))
													setRpcEditing((prev) => ({ ...prev, [key]: true }))
													runRpc(key, body)
												}}
												sx={{ textTransform: "none", flexShrink: 0 }}
											>
												Try it out
											</Button>
										)}
									</Box>
									{m.params.length > 0 ? (
										<ParamsTable
											params={m.params}
											vals={vals}
											editing={rpcEditing[key] ?? false}
											onChange={(name, v) => {
												const next = { ...vals, [name]: v }
												setRpcVals((prev) => ({ ...prev, [key]: next }))
												scheduleRpc(key, buildRpcBody(m.name, m.params, next))
											}}
										/>
									) : (
										<Typography variant="body2" color="text.secondary">
											无参数
										</Typography>
									)}
									<Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
										<Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
											<Typography variant="caption" color="text.secondary">curl</Typography>
											<CopyButton
												text={curl}
												copied={copiedKey == `rpc:${key}`}
												onCopy={() => handleCopy(`rpc:${key}`, curl)}
											/>
										</Box>
										<CodeBlock>{curl}</CodeBlock>
									</Box>
									<TryResult state={rpcStates[key] ?? { status: "idle" }} />
								</Box>
							</EndpointItem>
						)
					})}
				</Box>
			</Card>

			<Card sx={{ p: { xs: 2, sm: 3 } }}>
				<Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1 }}>
					RSS / Atom
				</Typography>
				<Typography variant="body2" sx={{ mb: 1 }}>
					路由：<code>GET /rss/:from/:to</code>，聚合全部来源该货币对的买卖价（买入：现汇/现钞/中间价；卖出：
					现汇/现钞/中间价），每条 item 的 title 为来源中文名
				</Typography>
				<Link
					href={`${endpointHost}/api/rest/rss/USD/CNY`}
					target="_blank"
					rel="noreferrer"
					sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}
				>
					{`${endpointHost}/api/rest/rss/USD/CNY`}
				</Link>
			</Card>

			<Card sx={{ p: { xs: 2, sm: 3 } }}>
				<Typography variant="h6" component="h2" sx={{ fontWeight: 700, mb: 1.5 }}>
					数据源
				</Typography>
				{SOURCE_CATEGORIES.map((cat) => (
					<Box key={cat.title} sx={{ mb: 2 }}>
						<Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
							{cat.title}
						</Typography>
						<Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
							{cat.desc}
						</Typography>
						<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
							{cat.examples.map((s) => (
								<Chip key={s} size="small" label={s} variant="outlined" />
							))}
						</Box>
					</Box>
				))}
				<Divider sx={{ my: 1.5 }} />
				<Typography variant="caption" color="text.secondary">
					完整 source 列表以 <code>GET /info</code> 为准（当前 {info?.sources.length ?? "…"} 个），
					已连接的实例来源：
				</Typography>
				<Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 1 }}>
					{info?.sources.map((s) => (
						<Chip key={s} size="small" label={s} variant="outlined" />
					)) ?? (
						<Typography variant="caption" color="text.secondary">尚未获取…</Typography>
					)}
				</Box>
			</Card>

			<Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
				数据版权归各来源所有 · 所有 GET 接口支持 CORS（ENABLE_CORS 时）· 更新于 {mounted ? safeUpdated(new Date()).toLocaleString() : "…"}
			</Typography>
			</Box>
		</main>
	)
}
