// @vitest-environment jsdom
// view-utils：从 index.tsx 抽出的 URL/缓存 key/快照判定/视图记忆契约测试。
// 覆盖：精度与金额的 URL 解析边界、URL 构造的正反向参数、缓存 key 形状、
// 快照「有报价」判定（含空表与假值）、localStorage 读写与异常兜底。

import { beforeEach, describe, expect, it } from "vitest"

import {
	buildViewUrl,
	hasMatrixQuotes,
	hasPairQuotes,
	MATRIX_BASE_KEY,
	matrixViewCacheKey,
	PAIR_FROM_KEY,
	pairViewCacheKey,
	parseAmount,
	parsePrecision,
	readLS,
	writeLS,
} from "@/componets/view-utils"

describe("parsePrecision URL 解析", () => {
	it("接受 [-1, 6] 的整数", () => {
		expect(parsePrecision("-1")).toBe(-1)
		expect(parsePrecision("0")).toBe(0)
		expect(parsePrecision("4")).toBe(4)
		expect(parsePrecision("6")).toBe(6)
	})

	it("缺省返回 null", () => {
		expect(parsePrecision(null)).toBeNull()
	})

	it("越界、非整数与非数字返回 null", () => {
		expect(parsePrecision("-2")).toBeNull()
		expect(parsePrecision("7")).toBeNull()
		expect(parsePrecision("2.5")).toBeNull()
		expect(parsePrecision("abc")).toBeNull()
	})

	it("空串被 Number 转成 0，故返回 0 而非 null（既有行为）", () => {
		// Number("") === 0，落在 [-1, 6] 内。这是抽取前 index.tsx 的既有语义，
		// 此处如实锁定；若日后判定 `?precision=` 空值应回落默认精度，需同时改
		// view-utils 与 ssr-prefetch.ts 的两份 parsePrecision。
		expect(parsePrecision("")).toBe(0)
	})
})

describe("parseAmount URL 解析", () => {
	it("接受正有限数（含小数）", () => {
		expect(parseAmount("100")).toBe(100)
		expect(parseAmount("100.5")).toBe(100.5)
		expect(parseAmount("0.01")).toBe(0.01)
	})

	it("缺省、零、负数与非法值回退默认 100", () => {
		expect(parseAmount(null)).toBe(100)
		expect(parseAmount("0")).toBe(100)
		expect(parseAmount("-5")).toBe(100)
		expect(parseAmount("abc")).toBe(100)
		expect(parseAmount("")).toBe(100)
		expect(parseAmount("Infinity")).toBe(100)
	})
})

describe("buildViewUrl", () => {
	it("pair 视图恒带 from+to", () => {
		expect(buildViewUrl("pair", "CNY", "USD", "EUR", false, 100, 4)).toBe(
			"/?from=CNY&to=USD&amount=100&precision=4"
		)
	})

	it("matrix 正向只带 from，反向只带 to（不携冲突方向参数）", () => {
		expect(buildViewUrl("matrix", "CNY", "USD", "EUR", false, 100, 4)).toBe(
			"/matrix?from=EUR&amount=100&precision=4"
		)
		expect(buildViewUrl("matrix", "CNY", "USD", "EUR", true, 100, 4)).toBe(
			"/matrix?to=EUR&amount=100&precision=4"
		)
	})

	it("小数金额原样保留", () => {
		expect(buildViewUrl("pair", "CNY", "USD", "EUR", false, 100.5, 4)).toContain(
			"amount=100.5"
		)
	})
})

describe("缓存 key 形状", () => {
	it("pair key 含精度标记，bfs 开启时追加后缀", () => {
		expect(pairViewCacheKey("CNY", "USD", 100, 4, false)).toBe(
			"CNY-USD-100-p4"
		)
		expect(pairViewCacheKey("CNY", "USD", 100, 4, true)).toBe(
			"CNY-USD-100-p4-bfs"
		)
	})

	it("matrix key 区分正反向", () => {
		expect(matrixViewCacheKey("EUR", 100, 4, false)).toBe(
			"EUR-100-p4-forward"
		)
		expect(matrixViewCacheKey("EUR", 100, 4, true)).toBe(
			"EUR-100-p4-reverse"
		)
	})
})

describe("hasPairQuotes 快照有效性", () => {
	const row = (buy: boolean, sell: boolean) => ({
		name: "bankA",
		type: {
			buy: buy ? { cash: 7.05, remit: 7.08 } : {},
			sell: sell ? { cash: 7.1, remit: 7.12 } : {},
		},
		updated: new Date(),
	})

	it("有任一行带买/卖价即有效", () => {
		expect(hasPairQuotes([row(true, false)])).toBe(true)
		expect(hasPairQuotes([row(false, true)])).toBe(true)
	})

	it("全部行只缺买卖价、空表与 null 都判无效", () => {
		expect(hasPairQuotes([row(false, false)])).toBe(false)
		expect(hasPairQuotes([])).toBe(false)
		expect(hasPairQuotes(null)).toBe(false)
	})
})

describe("hasMatrixQuotes 快照有效性", () => {
	it("任一格有数值或非空字符串即有效", () => {
		expect(hasMatrixQuotes({ boc: { USD: { middle: 7.1 } } })).toBe(true)
		expect(
			hasMatrixQuotes({ boc: { USD: { middle: "7.15" as never } } })
		).toBe(true)
	})

	it("空白字符串、空表与 null 判无效", () => {
		expect(hasMatrixQuotes({ boc: { USD: { middle: "   " as never } } })).toBe(
			false
		)
		expect(hasMatrixQuotes({})).toBe(false)
		expect(hasMatrixQuotes(null)).toBe(false)
	})
})

describe("视图记忆 localStorage 读写", () => {
	beforeEach(() => {
		localStorage.clear()
	})

	it("写入后可读回", () => {
		writeLS(PAIR_FROM_KEY, "CNY")
		expect(readLS(PAIR_FROM_KEY)).toBe("CNY")
	})

	it("键不存在时返回 null", () => {
		expect(readLS(MATRIX_BASE_KEY)).toBeNull()
	})
})
