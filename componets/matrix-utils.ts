import type { RatesMatrix, RatesMatrixCell } from "./tools"

// 矩阵视图的纯函数：类型与值归一、方向化、单元格字段级合并。
// 从 fxmatrixgrid.tsx 抽出，便于单测覆盖（此前这些函数只经组件间接验证）。

export type CellValue = number | string | boolean

export type MatrixCell = Omit<RatesMatrixCell, "middle"> & {
	middle?: RatesMatrixCell["middle"]
}

export type MatrixRow = { [currency: string]: MatrixCell }
export type MatrixDisplayData = { [source: string]: MatrixRow }

export type PriceType = "middle" | "cash" | "remit"

export const priceTypeLabels: { [k in PriceType]: string } = {
	middle: "中间价",
	cash: "现钞",
	remit: "现汇",
}

export const toNumber = (v: CellValue | undefined): number | undefined => {
	if (v == undefined) return undefined
	if (typeof v == "number") return v
	if (typeof v == "string" && v.trim() != "") {
		const n = Number(v)
		return Number.isNaN(n) ? undefined : n
	}
	return undefined
}

export const formatValue = (v: CellValue | undefined): string =>
	typeof v == "number" || typeof v == "string" ? String(v) : "—"

export const cellOf = (
	cell: MatrixCell | undefined,
	type: PriceType
): CellValue | undefined => {
	if (!cell) return undefined
	if (type == "middle") return cell.middle
	return cell[type]
}

export const orientMatrixRowPaths = (
	row: RatesMatrix[string],
	from: string,
	reverse: boolean
): RatesMatrix[string] => {
	if (!reverse) return row

	let changed = false
	const oriented: RatesMatrix[string] = {}
	for (const currency in row) {
		const cell = row[currency]
		const path = cell.path
		if (path && path.length > 1 && path[0] == from) {
			oriented[currency] = { ...cell, path: [...path].reverse() }
			changed = true
		} else {
			oriented[currency] = cell
		}
	}

	return changed ? oriented : row
}

// 单元格合并：b（优先侧）的已定义字段覆盖 a。b 对缺值格会显式写
// cash/remit/path 为 undefined（getRatesMatrix 行为），直接用 ?? 回落 a
// 的补查值（false/0/字符串等合法值保留），避免整格浅合并丢字段
export const mergeCell = (
	a: MatrixCell | undefined,
	b: MatrixCell | undefined
): MatrixCell => {
	const middle = b?.middle ?? a?.middle
	return {
		...(middle != undefined ? { middle } : {}),
		cash: b?.cash ?? a?.cash,
		remit: b?.remit ?? a?.remit,
		path: b?.path ?? a?.path,
		alias: b?.alias ?? a?.alias,
		updated: b?.updated ?? a?.updated,
	}
}

// 单元格字段级合并：同一来源同一货币按字段 merge，b 对重叠字段优先、
// a 独有字段（path/alias/updated 等）保留。主数据与单独补查行可能对同一
// 格各持有部分字段（如主数据只有 middle、补查带回 cash/remit/path），
// 浅合并整格会丢字段，这里逐字段合并
export const mergeCellRows = (
	a: MatrixRow | undefined,
	b: MatrixRow | undefined
): MatrixRow => {
	if (!a) return b ?? {}
	if (!b) return a
	const currencyKeys = new Set([...Object.keys(a), ...Object.keys(b)])
	const merged: MatrixRow = {}
	for (const c of currencyKeys) {
		merged[c] = mergeCell(a[c], b[c])
	}
	return merged
}
