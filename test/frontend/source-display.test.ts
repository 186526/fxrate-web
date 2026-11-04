import { describe, expect, it } from "vitest"
import { sourceNamesInZH } from "@/lib/fxrate/src/constant"
import { getName } from "@/components/fxrate/source-display"
import { NUMERIC_CELL_LAYOUT, SOURCE_COL_MIN_WIDTH } from "@/components/fxrate/table-layout"

describe("来源显示名 getName", () => {
	it("已知来源返回中文名并附来源代码", () => {
		expect(getName("boc")).toBe(`${sourceNamesInZH.boc} (boc)`)
	})

	it("未知来源原样返回", () => {
		expect(getName("unknown-bank")).toBe("unknown-bank")
	})
})

describe("报价表窄屏列宽常量", () => {
	it("来源列与数值列宽度为同一份定义", () => {
		expect(SOURCE_COL_MIN_WIDTH).toEqual({ xs: 116, sm: 150 })
		expect(NUMERIC_CELL_LAYOUT.minWidth).toEqual({ xs: 64, sm: 80 })
		expect(NUMERIC_CELL_LAYOUT.maxWidth).toEqual({ xs: 104, sm: 136 })
	})
})
