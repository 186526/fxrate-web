// matrix-utils：从 fxmatrixgrid.tsx 抽出的纯函数契约测试。
// 覆盖：值归一（数字字符串/空串/布尔）、展示格式、按报价类型取值、
// 反向路径方向化、单元格字段级合并（b 优先、a 独有字段保留、false/0 合法值不丢）。
// 零 DOM：这些函数与 React/浏览器无关，node 环境即可。

import { describe, expect, it } from "vitest"

import {
	cellOf,
	formatValue,
	mergeCell,
	mergeCellRows,
	orientMatrixRowPaths,
	priceTypeLabels,
	toNumber,
} from "@/componets/matrix-utils"

describe("toNumber 值归一", () => {
	it("数字原样返回", () => {
		expect(toNumber(7.1)).toBe(7.1)
		expect(toNumber(0)).toBe(0)
		expect(toNumber(-3)).toBe(-3)
	})

	it("数字字符串转为数字，空串与空白返回 undefined", () => {
		expect(toNumber("7.15")).toBe(7.15)
		expect(toNumber(" 7.15 ")).toBe(7.15)
		expect(toNumber("")).toBeUndefined()
		expect(toNumber("   ")).toBeUndefined()
	})

	it("非数字字符串与布尔返回 undefined", () => {
		expect(toNumber("abc")).toBeUndefined()
		expect(toNumber(true)).toBeUndefined()
		expect(toNumber(false)).toBeUndefined()
		expect(toNumber(undefined)).toBeUndefined()
	})
})

describe("formatValue 展示格式", () => {
	it("数字与字符串直接字符串化，其余占位破折号", () => {
		expect(formatValue(7.1)).toBe("7.1")
		expect(formatValue("7.15")).toBe("7.15")
		expect(formatValue(0)).toBe("0")
		expect(formatValue(undefined)).toBe("—")
		expect(formatValue(true)).toBe("—")
		expect(formatValue(false)).toBe("—")
	})
})

describe("cellOf 按报价类型取值", () => {
	const cell = { middle: 7.1, cash: 7.05, remit: 7.08 }

	it("按类型取对应字段", () => {
		expect(cellOf(cell, "middle")).toBe(7.1)
		expect(cellOf(cell, "cash")).toBe(7.05)
		expect(cellOf(cell, "remit")).toBe(7.08)
	})

	it("缺格返回 undefined", () => {
		expect(cellOf(undefined, "middle")).toBeUndefined()
	})
})

describe("orientMatrixRowPaths 反向路径方向化", () => {
	it("reverse=false 原样返回同一对象引用", () => {
		const row = { USD: { middle: 7, path: ["CNY", "HKD", "USD"] } }
		expect(orientMatrixRowPaths(row, "CNY", false)).toBe(row)
	})

	it("reverse=true 且 path 起点匹配时反转路径", () => {
		const row = { USD: { middle: 7, path: ["CNY", "HKD", "USD"] } }
		const out = orientMatrixRowPaths(row, "CNY", true)
		expect(out.USD.path).toEqual(["USD", "HKD", "CNY"])
		// 不改动原对象
		expect(row.USD.path).toEqual(["CNY", "HKD", "USD"])
	})

	it("path 起点不匹配或长度不足时保留原值", () => {
		const row = {
			USD: { middle: 7, path: ["HKD", "USD"] },
			EUR: { middle: 7.6, path: ["CNY"] },
			JPY: { middle: 0.05 },
		}
		const out = orientMatrixRowPaths(row, "CNY", true)
		expect(out.USD.path).toEqual(["HKD", "USD"])
		expect(out.EUR.path).toEqual(["CNY"])
		expect(out.JPY.path).toBeUndefined()
	})

	it("无任何路径被反转时返回原对象引用（避免无谓重渲染）", () => {
		const row = { USD: { middle: 7, path: ["HKD", "USD"] } }
		expect(orientMatrixRowPaths(row, "CNY", true)).toBe(row)
	})
})

describe("mergeCell 单元格字段级合并", () => {
	it("b 的已定义字段覆盖 a", () => {
		const merged = mergeCell(
			{ middle: 7.1, cash: 7.05 },
			{ middle: 7.2, remit: 7.08 }
		)
		expect(merged.middle).toBe(7.2)
		expect(merged.cash).toBe(7.05)
		expect(merged.remit).toBe(7.08)
	})

	it("a 独有字段（path/alias/updated）在 b 未提供时保留", () => {
		const updated = new Date("2026-08-04T00:00:00Z")
		const merged = mergeCell(
			{ middle: 7.1, path: ["CNY", "USD"], alias: "CNH", updated },
			{ middle: 7.2 }
		)
		expect(merged.path).toEqual(["CNY", "USD"])
		expect(merged.alias).toBe("CNH")
		expect(merged.updated).toBe(updated)
	})

	it("false/0/空字符串等合法值不被 ?? 回落成 a 的值", () => {
		const merged = mergeCell(
			{ middle: 7.1, cash: 7.05, remit: 7.08 },
			{ middle: 7.2, cash: 0, remit: "" as never }
		)
		expect(merged.cash).toBe(0)
		expect(merged.remit).toBe("")
	})

	it("middle 在两侧都缺省时不出现该键", () => {
		const merged = mergeCell({ cash: 7.05 }, { remit: 7.08 })
		expect("middle" in merged).toBe(false)
	})

	it("两侧都为空时返回空对象", () => {
		expect(mergeCell(undefined, undefined)).toEqual({})
	})
})

describe("mergeCellRows 行级合并", () => {
	it("a 缺省时返回 b（或空对象）", () => {
		const b = { USD: { middle: 7.1 } }
		expect(mergeCellRows(undefined, b)).toBe(b)
		expect(mergeCellRows(undefined, undefined)).toEqual({})
	})

	it("b 缺省时返回 a 同一引用", () => {
		const a = { USD: { middle: 7.1 } }
		expect(mergeCellRows(a, undefined)).toBe(a)
	})

	it("按货币键取并集，逐格字段级合并", () => {
		const merged = mergeCellRows(
			{ USD: { middle: 7.1, cash: 7.05 }, EUR: { middle: 7.6 } },
			{ USD: { middle: 7.2, remit: 7.08 }, JPY: { middle: 0.05 } }
		)
		expect(Object.keys(merged).sort()).toEqual(["EUR", "JPY", "USD"])
		expect(merged.USD.middle).toBe(7.2)
		expect(merged.USD.cash).toBe(7.05)
		expect(merged.USD.remit).toBe(7.08)
		expect(merged.EUR.middle).toBe(7.6)
		expect(merged.JPY.middle).toBe(0.05)
	})
})

describe("priceTypeLabels", () => {
	it("三种报价类型都有中文标签", () => {
		expect(priceTypeLabels.middle).toBe("中间价")
		expect(priceTypeLabels.cash).toBe("现钞")
		expect(priceTypeLabels.remit).toBe("现汇")
	})
})
