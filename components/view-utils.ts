import { SLOW_SOURCES, type RatesMatrix } from "./tools"
import type { FXListProps } from "./shared"

// Index 视图层的纯函数与常量：URL 构造/解析、缓存 key、快照有效性判定、视图记忆。
// 从 index.tsx 抽出，便于单测直测契约（此前只经组件与 e2e 间接验证）。

export type View = "pair" | "matrix"

export const parsePrecision = (value: string | null): number | null => {
	if (value == null) return null
	const precision = Number(value)
	return Number.isInteger(precision) && precision >= -1 && precision <= 6
		? precision
		: null
}

// 金额契约：接受正有限十进制数（如 100.5，前端/后端全程小数透传），
// 非法（NaN/Infinity/空）、零或负数一律回退默认 100，防止 URL 注入坏值
export const parseAmount = (value: string | null): number => {
	if (value == null) return 100
	const n = Number(value)
	return Number.isFinite(n) && n > 0 ? n : 100
}

export const buildViewUrl = (
	view: View,
	pairFrom: string,
	pairTo: string,
	matrixBase: string,
	matrixReverse: boolean,
	amount: number,
	precision: number
): string => {
	const params = new URLSearchParams()
	if (view == "matrix") {
		params.set(matrixReverse ? "to" : "from", matrixBase)
	} else {
		params.set("from", pairFrom)
		params.set("to", pairTo)
	}
	params.set("amount", String(amount))
	params.set("precision", String(precision))
	return `${view == "matrix" ? "/matrix" : "/"}?${params.toString()}`
}

export const pairViewCacheKey = (
	from: string,
	to: string,
	amount: number,
	precision: number,
	bfs: boolean
): string => `${from}-${to}-${amount}-p${precision}${bfs ? "-bfs" : ""}`

export const matrixViewCacheKey = (
	base: string,
	amount: number,
	precision: number,
	reverse: boolean
): string =>
	`${base}-${amount}-p${precision}-${reverse ? "reverse" : "forward"}`

export const MATRIX_SLOW_SOURCES = Array.from(SLOW_SOURCES)

export const hasPairQuotes = (data: FXListProps[] | null): boolean =>
	data?.some(
		(row) =>
			Boolean(row.type.buy?.cash) ||
			Boolean(row.type.buy?.remit) ||
			Boolean(row.type.sell?.cash) ||
			Boolean(row.type.sell?.remit)
	) ?? false

export const hasMatrixQuotes = (data: RatesMatrix | null): boolean =>
	data != null &&
	Object.values(data).some((row) =>
		Object.values(row).some((cell) =>
			[cell.middle, cell.cash, cell.remit].some(
				(value) =>
					typeof value == "number" ||
					(typeof value == "string" && value.trim() != "")
			)
		)
	)

// 视图记忆 localStorage keys：pair 记忆（from/to + reverse）与 matrix 记忆（基准/方向）分离，
// 各自仅在本视图路径写入，pair↔matrix 往返时互不重置；矩阵 URL 的 to 是基准货币，
// 不得污染 pair 目标货币
export const PAIR_FROM_KEY = "fxrate-pair-from"
export const PAIR_TO_KEY = "fxrate-pair-to"
export const PAIR_REVERSE_KEY = "fxrate-reverse"
export const MATRIX_BASE_KEY = "fxrate-matrix-base"
export const MATRIX_REVERSE_KEY = "fxrate-matrix-reverse"

export const readLS = (key: string): string | null => {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

export const writeLS = (key: string, value: string): void => {
	try {
		localStorage.setItem(key, value)
	} catch {
		// localStorage 不可用时忽略持久化
	}
}
