import {
	cellOf,
	toNumber,
	type MatrixDisplayData,
	type PriceType,
} from "../matrix-utils"

// 矩阵展示层的纯函数：可见来源集、每列最优价、排序、更新时间与统计输入。
// 从 fxmatrixgrid.tsx 抽出，便于单测直测计数与排序契约。

export const matrixSources = (
	displayData: MatrixDisplayData,
	getName: (source: string) => string
): string[] =>
	Object.keys(displayData).sort((a, b) => getName(a).localeCompare(getName(b)))

// 每列最优价：只看参与高亮（未被排除）的来源
export const matrixBestByCurrency = (
	sources: string[],
	currencies: string[],
	displayData: MatrixDisplayData,
	priceType: PriceType,
	excluded: Set<string>
): { [currency: string]: number } => {
	const best: { [currency: string]: number } = {}
	for (const c of currencies) {
		let max: number | undefined
		for (const s of sources) {
			if (excluded.has(s)) continue
			const n = toNumber(cellOf(displayData[s][c], priceType))
			if (n == undefined) continue
			if (max == undefined || n > max) max = n
		}
		if (max != undefined) best[c] = max
	}
	return best
}

// 所有可见货币列都无数据的来源行隐藏，减少噪音
export const visibleMatrixSources = (
	sources: string[],
	currencies: string[],
	displayData: MatrixDisplayData,
	priceType: PriceType
): string[] =>
	sources.filter((s) =>
		currencies.some(
			(c) => toNumber(cellOf(displayData[s][c], priceType)) != undefined
		)
	)

export const sortMatrixSources = (
	sources: string[],
	displayData: MatrixDisplayData,
	priceType: PriceType,
	sortKey: string | null,
	sortDir: "asc" | "desc"
): string[] => {
	if (!sortKey) return sources
	return sources.slice().sort((a, b) => {
		const na = toNumber(cellOf(displayData[a][sortKey], priceType))
		const nb = toNumber(cellOf(displayData[b][sortKey], priceType))
		if (na == undefined && nb == undefined) return 0
		if (na == undefined) return 1
		if (nb == undefined) return -1
		return sortDir == "asc" ? na - nb : nb - na
	})
}

// 每个来源各货币的最新更新时间：任一 cell 超过 STALE_MS 视为整行可能不准确
export const matrixUpdatedBySource = (
	sources: string[],
	displayData: MatrixDisplayData
): { [source: string]: Date | null } => {
	const updated: { [source: string]: Date | null } = {}
	for (const source of sources) {
		updated[source] = Object.values(displayData[source] ?? {}).reduce<
			Date | null
		>((latest, cell) => {
			if (!cell?.updated) return latest
			return !latest || cell.updated.getTime() > latest.getTime()
				? cell.updated
				: latest
		}, null)
	}
	return updated
}

// 每货币列的统计输入（排除不参与高亮的来源），供单元格 hover 分析
export const matrixColumnValues = (
	currencies: string[],
	sources: string[],
	displayData: MatrixDisplayData,
	priceType: PriceType,
	excluded: Set<string>
): { [currency: string]: (number | undefined)[] } => {
	const values: { [currency: string]: (number | undefined)[] } = {}
	const participating = sources.filter((s) => !excluded.has(s))
	for (const c of currencies) {
		values[c] = participating.map((s) =>
			toNumber(cellOf(displayData[s][c], priceType))
		)
	}
	return values
}
