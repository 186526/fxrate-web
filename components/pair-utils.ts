import type { FXListProps } from "./shared"
import {
	computeStats,
	toNumber,
	type ColumnStats,
	type RateValue,
} from "./rateStats"

// 单对视图的纯函数：表格行构造、排序、最优价、列统计输入。
// 从 fxlistgrid.tsx 抽出，便于单测直测排序与最优价契约。

export type SortKey =
	| "name"
	| "buyCash"
	| "buyRemit"
	| "sellCash"
	| "sellRemit"
	| "middle"

export interface Column {
	key: SortKey | "updated"
	label: string
	align: "left" | "right"
	sortable?: boolean
}

export const LIST_COLUMNS: Column[] = [
	{ key: "name", label: "银行/平台", align: "left", sortable: true },
	{ key: "buyCash", label: "购钞价", align: "right", sortable: true },
	{ key: "buyRemit", label: "购汇价", align: "right", sortable: true },
	{ key: "sellCash", label: "结钞价", align: "right", sortable: true },
	{ key: "sellRemit", label: "结汇价", align: "right", sortable: true },
	{ key: "middle", label: "中间价", align: "right", sortable: true },
	{ key: "updated", label: "更新时间", align: "right" },
]

export interface ListRow {
	id: number
	source: string
	name: string
	updated: Date
	stale: boolean
	buyCash?: number | string | boolean
	buyRemit?: number | string | boolean
	sellCash?: number | string | boolean
	sellRemit?: number | string | boolean
	middle?: number | string | boolean
	path?: string[]
	alias?: string
}

export const formatValue = (v: RateValue): string =>
	typeof v == "number" || typeof v == "string" ? String(v) : "—"

// 买卖价都缺失的行整行隐藏（只有中间价/空数据的行对单对视图无意义）
export const buildListRows = (
	props: FXListProps[],
	getName: (source: string) => string,
	isStale: (updated: Date) => boolean,
	mounted: boolean
): ListRow[] =>
	props
		.slice()
		.sort((a, b) => a.name.localeCompare(b.name))
		.filter(
			(k) =>
				Boolean(k.type.buy?.cash) ||
				Boolean(k.type.buy?.remit) ||
				Boolean(k.type.sell?.cash) ||
				Boolean(k.type.sell?.remit)
		)
		.map((k, i) => ({
			id: i + 1,
			source: k.name,
			name: getName(k.name),
			updated: k.updated,
			stale: mounted && isStale(k.updated),
			buyCash: k.type.buy?.cash,
			buyRemit: k.type.buy?.remit,
			sellCash: k.type.sell?.cash,
			sellRemit: k.type.sell?.remit,
			middle: k.type.middle,
			path: k.path,
			alias: k.alias,
		}))

const numCmp = (a: number | undefined, b: number | undefined): number => {
	if (a == undefined && b == undefined) return 0
	if (a == undefined) return 1
	if (b == undefined) return -1
	return a - b
}

export const sortListRows = (
	rows: ListRow[],
	sortKey: SortKey,
	sortDir: "asc" | "desc"
): ListRow[] =>
	rows.slice().sort((a, b) => {
		let cmp = 0
		if (sortKey == "name") {
			cmp = a.name.localeCompare(b.name)
		} else {
			cmp = numCmp(toNumber(a[sortKey]), toNumber(b[sortKey]))
		}
		return sortDir == "asc" ? cmp : -cmp
	})

// 购钞/购汇取最低成本，结钞/结汇取最高所得
export const listBestPrices = (
	rows: ListRow[],
	excluded: Set<string>
): {
	buyCash?: number
	buyRemit?: number
	sellCash?: number
	sellRemit?: number
} => {
	const pick = (
		get: (r: ListRow) => RateValue,
		dir: "min" | "max"
	): number | undefined => {
		let found: number | undefined
		for (const r of rows) {
			if (excluded.has(r.source)) continue
			const n = toNumber(get(r))
			if (n == undefined) continue
			if (found == undefined || (dir == "min" ? n < found : n > found)) {
				found = n
			}
		}
		return found
	}
	return {
		buyCash: pick((r) => r.buyCash, "min"),
		buyRemit: pick((r) => r.buyRemit, "min"),
		sellCash: pick((r) => r.sellCash, "max"),
		sellRemit: pick((r) => r.sellRemit, "max"),
	}
}

// 统计某列所有有效数值（不含被排除来源）：平均/最高/最低
export const columnStats = (
	rows: ListRow[],
	excluded: Set<string>,
	get: (r: ListRow) => RateValue
): ColumnStats | undefined =>
	computeStats(
		rows.filter((r) => !excluded.has(r.source)).map((r) => toNumber(get(r)))
	)

// 当前数据中有报价的来源数（至少一个价格列有值）
export const rowsWithData = (rows: ListRow[]): ListRow[] =>
	rows.filter(
		(r) =>
			toNumber(r.buyCash) != undefined ||
			toNumber(r.buyRemit) != undefined ||
			toNumber(r.sellCash) != undefined ||
			toNumber(r.sellRemit) != undefined ||
			toNumber(r.middle) != undefined
	)
