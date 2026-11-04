export type ApiProtocol = "rest" | "rpc"
export type ProtocolFilter = "all" | ApiProtocol
export type ParamType = "string" | "number" | "boolean"

export const ENDPOINT_IDS = [
	"rest-source",
	"rest-source-rates",
	"rest-pair",
	"rest-convert",
	"rpc-instance-info",
	"rpc-list-currencies",
	"rpc-list-rates",
	"rpc-get-rate",
] as const

export type EndpointId = (typeof ENDPOINT_IDS)[number]

export interface ParamDef {
	name: string
	type: ParamType
	description: string
	defaultValue: string
	location?: "path" | "query"
	required?: boolean
}

interface EndpointBase {
	id: EndpointId
	protocol: ApiProtocol
	method: "GET" | "POST"
	title: string
	description: string
}

export interface RestEndpoint extends EndpointBase {
	protocol: "rest"
	method: "GET"
	path: string
	pathParams: readonly ParamDef[]
	queryParams: readonly ParamDef[]
	responseNote?: string
}

export interface RpcEndpoint extends EndpointBase {
	protocol: "rpc"
	method: "POST"
	methodName: "instanceInfo" | "listCurrencies" | "listFXRates" | "getFXRate"
	params: readonly ParamDef[]
	responseNote?: string
}

export type ApiEndpoint = RestEndpoint | RpcEndpoint
export type ParamValues = Record<string, string>

const sourceParam: ParamDef = {
	name: "source",
	type: "string",
	description: "数据源英文名（如 boc、icbc、hsbc.cn）",
	defaultValue: "boc",
	location: "path",
	required: true,
}

const fromParam: ParamDef = {
	name: "from",
	type: "string",
	description: "基准货币代码，ISO 4217 三字母",
	defaultValue: "USD",
	location: "path",
	required: true,
}

const toParam: ParamDef = {
	name: "to",
	type: "string",
	description: "目标货币代码，ISO 4217 三字母",
	defaultValue: "CNY",
	location: "path",
	required: true,
}

const typeParam: ParamDef = {
	name: "type",
	type: "string",
	description: "报价类型：cash、remit 或 middle",
	defaultValue: "remit",
	location: "path",
	required: true,
}

const amountPathParam: ParamDef = {
	name: "amount",
	type: "number",
	description: "换算金额",
	defaultValue: "100",
	location: "path",
	required: true,
}

const restPrecisionParam: ParamDef = {
	name: "precision",
	type: "number",
	description: "输出小数位；-1 表示原样不四舍五入",
	defaultValue: "5",
	location: "query",
}

const amountQueryParam: ParamDef = {
	name: "amount",
	type: "number",
	description: "换算金额",
	defaultValue: "100",
	location: "query",
}

const feesQueryParam: ParamDef = {
	name: "fees",
	type: "number",
	description: "加收手续费百分比（乘 1 + fees/100）",
	defaultValue: "0",
	location: "query",
}

const reverseQueryParam: ParamDef = {
	name: "reverse",
	type: "boolean",
	description: "反向换算（from/to 互换语义）",
	defaultValue: "false",
	location: "query",
}

const bfsQueryParam: ParamDef = {
	name: "bfs",
	type: "boolean",
	description: "启用交叉汇率 BFS，无直连时经中间货币折算",
	defaultValue: "false",
	location: "query",
}

const prettyQueryParam: ParamDef = {
	name: "pretty",
	type: "boolean",
	description: "缩进 JSON 输出",
	defaultValue: "false",
	location: "query",
}

const restRateQueryParams = [
	amountQueryParam,
	restPrecisionParam,
	feesQueryParam,
	reverseQueryParam,
	bfsQueryParam,
	prettyQueryParam,
] as const

export const REST_ENDPOINTS: readonly RestEndpoint[] = [
	{
		id: "rest-source",
		protocol: "rest",
		method: "GET",
		title: "数据源信息",
		description: "返回数据源名称、支持货币与更新时间",
		path: "/:source",
		pathParams: [sourceParam],
		queryParams: [prettyQueryParam],
	},
	{
		id: "rest-source-rates",
		protocol: "rest",
		method: "GET",
		title: "数据源汇率表",
		description: "返回指定数据源内某基准货币到全部目标货币的汇率",
		path: "/:source/:from",
		pathParams: [sourceParam, fromParam],
		queryParams: restRateQueryParams,
	},
	{
		id: "rest-pair",
		protocol: "rest",
		method: "GET",
		title: "单对汇率详情",
		description: "返回买入价、卖出价、中间价与更新时间",
		path: "/:source/:from/:to",
		pathParams: [sourceParam, fromParam, toParam],
		queryParams: restRateQueryParams,
		responseNote:
			"启用 bfs 时可能返回 path；CNY/CNH 别名命中时响应体含 alias，REST 响应头同时设置 X-FXRate-Alias。",
	},
	{
		id: "rest-convert",
		protocol: "rest",
		method: "GET",
		title: "单对金额换算",
		description: "按报价类型换算金额，响应为纯数值文本",
		path: "/:source/:from/:to/:type/:amount",
		pathParams: [sourceParam, fromParam, toParam, typeParam, amountPathParam],
		queryParams: [restPrecisionParam, feesQueryParam, reverseQueryParam, bfsQueryParam],
	},
]

const rpcSourceParam: ParamDef = {
	...sourceParam,
	location: undefined,
}

const rpcFromParam: ParamDef = {
	...fromParam,
	location: undefined,
	defaultValue: "CNY",
}

const rpcToParam: ParamDef = {
	...toParam,
	location: undefined,
}

// REST 后端默认 precision=5；客户端 listFXRates/getFXRate 的签名默认值为 2。
// RPC 工作台采用客户端默认值 2，避免文档请求与实际 SDK 行为不一致。
const rpcPrecisionParam: ParamDef = {
	name: "precision",
	type: "number",
	description: "输出小数位（客户端默认 2；REST 默认 5）",
	defaultValue: "2",
}

const rpcAmountParam: ParamDef = {
	...amountQueryParam,
	location: undefined,
}

const rpcFeesParam: ParamDef = {
	...feesQueryParam,
	location: undefined,
}

const rpcReverseParam: ParamDef = {
	...reverseQueryParam,
	location: undefined,
}

const rpcBfsParam: ParamDef = {
	...bfsQueryParam,
	location: undefined,
}

const rpcTypeParam: ParamDef = {
	name: "type",
	type: "string",
	description: "cash、remit、middle 或 all",
	defaultValue: "all",
}

export const RPC_ENDPOINTS: readonly RpcEndpoint[] = [
	{
		id: "rpc-instance-info",
		protocol: "rpc",
		method: "POST",
		title: "实例信息",
		description: "返回版本、数据源列表与后端状态",
		methodName: "instanceInfo",
		params: [],
	},
	{
		id: "rpc-list-currencies",
		protocol: "rpc",
		method: "POST",
		title: "数据源货币列表",
		description: "返回指定数据源支持的全部货币",
		methodName: "listCurrencies",
		params: [rpcSourceParam],
	},
	{
		id: "rpc-list-rates",
		protocol: "rpc",
		method: "POST",
		title: "数据源汇率表",
		description: "返回指定数据源内某基准货币到全部目标货币的汇率",
		methodName: "listFXRates",
		params: [
			rpcSourceParam,
			rpcFromParam,
			rpcPrecisionParam,
			rpcAmountParam,
			rpcFeesParam,
			rpcReverseParam,
			rpcBfsParam,
		],
	},
	{
		id: "rpc-get-rate",
		protocol: "rpc",
		method: "POST",
		title: "单对汇率",
		description: "返回指定数据源的单对详情或单类型换算值",
		methodName: "getFXRate",
		params: [
			rpcSourceParam,
			{ ...rpcFromParam, defaultValue: "USD" },
			rpcToParam,
			rpcTypeParam,
			rpcPrecisionParam,
			rpcAmountParam,
			rpcFeesParam,
			rpcReverseParam,
			rpcBfsParam,
		],
	},
]

export const API_ENDPOINTS: readonly ApiEndpoint[] = [
	...REST_ENDPOINTS,
	...RPC_ENDPOINTS,
]

export interface OperationReference {
	path: "/" | "/info" | "/readyz" | "/metrics"
	title: string
	description: string
	responseKind: "json" | "text"
}

export const OPERATIONS: readonly OperationReference[] = [
	{
		path: "/",
		title: "服务根路径",
		description: "返回服务简介",
		responseKind: "json",
	},
	{
		path: "/info",
		title: "实例信息",
		description: "返回版本、数据源列表与就绪状态；未就绪时为 HTTP 503",
		responseKind: "json",
	},
	{
		path: "/readyz",
		title: "就绪探针",
		description: "返回 readySources、staleSources、missing 与 pending",
		responseKind: "json",
	},
	{
		path: "/metrics",
		title: "Prometheus 指标",
		description: "返回 Prometheus text exposition 0.0.4，不是 JSON",
		responseKind: "text",
	},
]

export const SOURCE_CATEGORIES = [
	{
		title: "央行/卡组织",
		description: "中间价或单一报价",
		examples: ["pboc", "unionpay", "mastercard", "visa", "jcb", "ecb", "hkma", "cfets"],
	},
	{
		title: "中资银行",
		description: "主要提供买卖价与中间价",
		examples: ["boc", "bochk", "icbc", "ccb", "abc", "bocom", "psbc", "cmb", "cib", "citic.cn"],
	},
	{
		title: "外资银行",
		description: "不同法域使用独立 source",
		examples: ["hsbc.cn", "hsbc.hk", "hsbc.au", "dbs", "dbs.cn", "dbs.hk"],
	},
	{
		title: "其他",
		description: "Wise 中间价与支付宝单向结算汇率",
		examples: ["wise", "alipay"],
	},
] as const

export interface JsonRpcRequest {
	jsonrpc: "2.0"
	id: number
	method: RpcEndpoint["methodName"]
	params: Record<string, unknown>
}

export function getEndpointById(id: string): ApiEndpoint | undefined {
	return API_ENDPOINTS.find((endpoint) => endpoint.id == id)
}

export function isEndpointId(value: string): value is EndpointId {
	return ENDPOINT_IDS.some((id) => id == value)
}

export function getEndpointParams(endpoint: ApiEndpoint): readonly ParamDef[] {
	return endpoint.protocol == "rest"
		? [...endpoint.pathParams, ...endpoint.queryParams]
		: endpoint.params
}

export function getDefaultValues(endpoint: ApiEndpoint): ParamValues {
	return Object.fromEntries(
		getEndpointParams(endpoint).map((param) => [param.name, param.defaultValue])
	)
}

function valueForParam(param: ParamDef, values: ParamValues): string {
	return values[param.name] ?? param.defaultValue
}

export function buildRestPath(endpoint: RestEndpoint, values: ParamValues): string {
	const path = endpoint.path.replace(/:(\w+)/g, (_match, name: string) => {
		const param = endpoint.pathParams.find((item) => item.name == name)
		const value = param ? valueForParam(param, values) : values[name] ?? ""
		return encodeURIComponent(value)
	})
	const query = endpoint.queryParams.flatMap((param) => {
		const value = valueForParam(param, values)
		if (param.type == "boolean") {
			return value == "true" ? [`${param.name}=true`] : []
		}
		return value == "" ? [] : [`${param.name}=${encodeURIComponent(value)}`]
	})
	return query.length > 0 ? `${path}?${query.join("&")}` : path
}

export function buildRpcBody(endpoint: RpcEndpoint, values: ParamValues): JsonRpcRequest {
	const params: Record<string, unknown> = {}
	for (const param of endpoint.params) {
		const value = valueForParam(param, values)
		if (value == "") continue
		if (param.type == "number") {
			const number = Number(value)
			if (Number.isFinite(number)) params[param.name] = number
			continue
		}
		params[param.name] = param.type == "boolean" ? value == "true" : value
	}
	return {
		jsonrpc: "2.0",
		id: 1,
		method: endpoint.methodName,
		params,
	}
}

export function filterEndpoints(
	endpoints: readonly ApiEndpoint[],
	search: string,
	protocol: ProtocolFilter
): ApiEndpoint[] {
	const query = search.trim().toLocaleLowerCase("zh-CN")
	return endpoints.filter((endpoint) => {
		if (protocol != "all" && endpoint.protocol != protocol) return false
		if (query == "") return true
		const path = endpoint.protocol == "rest" ? endpoint.path : endpoint.methodName
		const haystack = [
			endpoint.id,
			endpoint.method,
			path,
			endpoint.title,
			endpoint.description,
			...getEndpointParams(endpoint).flatMap((param) => [
				param.name,
				param.description,
			]),
		]
			.join(" ")
			.toLocaleLowerCase("zh-CN")
		return haystack.includes(query)
	})
}
