// view-utils 的依赖方向：数据层 components/fxrate/matrix-rates.ts 复用 view-utils 的
// matrixViewCacheKey，因此 view-utils 对 ./tools 只能有 type-only import。若它重新从
// ./tools 取运行时值（如 SLOW_SOURCES），matrix-rates → view-utils → tools →
// matrix-rates 会再次构成模块循环，且数据层反向依赖视图层。这里直接读源文件断言，
// 因为循环在运行时只表现为求值顺序，import 本身不会报错。

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = join(import.meta.dirname, "..", "..")

const readSource = (relativePath: string) =>
	readFileSync(join(repoRoot, relativePath), "utf8")

// 取所有 import/export ... from "..." 语句，返回 [整条语句, 模块说明符]
const importStatements = (source: string): [string, string][] =>
	Array.from(
		source.matchAll(/^(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm),
		(match) => [match[0], match[1]]
	)

const isTypeOnly = (statement: string) => /^import\s+type\s/.test(statement)

describe("view-utils 对数据层的依赖只有类型", () => {
	const source = readSource("components/view-utils.ts")
	const statements = importStatements(source)

	it("不 import ./tools 的运行时值", () => {
		const toolsImports = statements.filter(([, specifier]) =>
			["./tools", "@/components/tools"].includes(specifier)
		)
		expect(toolsImports.length).toBeGreaterThan(0)
		for (const [statement] of toolsImports) {
			expect(
				/^import\s+type\s/.test(statement),
				`view-utils 对 tools 的 import 必须是 type-only：${statement}`
			).toBe(true)
		}
	})

	it("SLOW_SOURCES 取自定义处 ./fxrate/source-links", () => {
		const slowSourceImport = statements.find(([, specifier]) =>
			["./fxrate/source-links", "@/components/fxrate/source-links"].includes(
				specifier
			)
		)
		expect(slowSourceImport).toBeDefined()
		expect(slowSourceImport![0]).toContain("SLOW_SOURCES")
		expect(isTypeOnly(slowSourceImport![0])).toBe(false)
	})

	it("不 import 其它数据层运行时入口", () => {
		const runtimeDataLayer = statements.filter(
			([statement, specifier]) =>
				!isTypeOnly(statement) &&
				/^(?:\.\/fxrate\/|@\/components\/fxrate\/|\.\/tools$|@\/components\/tools$)/.test(
					specifier
				)
		)
		expect(runtimeDataLayer.map(([, specifier]) => specifier)).toEqual([
			"./fxrate/source-links",
		])
	})
})

describe("循环链上的三段 import 各就各位", () => {
	it("matrix-rates 从 view-utils 取 matrixViewCacheKey", () => {
		const statements = importStatements(
			readSource("components/fxrate/matrix-rates.ts")
		)
		const viewUtilsImport = statements.find(
			([, specifier]) => specifier == "@/components/view-utils"
		)
		expect(viewUtilsImport?.[0]).toContain("matrixViewCacheKey")
	})

	it("tools 仍 re-export matrix-rates（循环的第三段）", () => {
		const source = readSource("components/tools.ts")
		expect(source).toMatch(/from\s+"\.\/fxrate\/matrix-rates"/)
	})

	it("view-utils 不再从 tools 取运行时值，循环不闭合", () => {
		const runtimeTools = importStatements(
			readSource("components/view-utils.ts")
		).filter(
			([statement, specifier]) =>
				["./tools", "@/components/tools"].includes(specifier) &&
				!/^import\s+type\s/.test(statement)
		)
		expect(runtimeTools).toEqual([])
	})
})
