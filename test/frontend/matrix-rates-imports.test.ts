// 数据层模块之间不得构成运行时 import 环：ESM 下环只表现为求值顺序，import 本身
// 不会报错，所以这里直接读源文件、沿 import 图做可达性检查。
// M22 把 test-cache-reset 对 matrix-rates 的 import 改成「matrix-rates 在模块求值时
// 登记清空钩子」，同时把 pair-rates 需要的 sourceSupportFingerprint 移到
// source-links.ts。若 test-cache-reset 重新 import matrix-rates，会再次成环
// test-cache-reset → matrix-rates → test-cache-reset；若 pair-rates 重新从
// matrix-rates 取值，会再次成环 pair-rates → matrix-rates → test-cache-reset →
// pair-rates。

import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const repoRoot = join(import.meta.dirname, "..", "..")
const COMPONENTS = join(repoRoot, "components")

const readSource = (absolutePath: string) => readFileSync(absolutePath, "utf8")

// 取所有 import/export ... from "..." 语句，返回 [整条语句, 模块说明符]
const importStatements = (source: string): [string, string][] =>
	Array.from(
		source.matchAll(/^(?:import|export)\s[^;]*?from\s+"([^"]+)"/gm),
		(match) => [match[0], match[1]]
	)

const isTypeOnly = (statement: string) => /^import\s+type\s/.test(statement)

const listModules = (dir: string): string[] =>
	readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name)
		if (entry.isDirectory()) return listModules(path)
		return /\.tsx?$/.test(entry.name) ? [path] : []
	})

// 运行依赖图：只收非 type-only 的 import/export from，把相对路径与 @/components
// 别名解析到 components/ 下的实际文件
const buildRuntimeGraph = (): Map<string, Set<string>> => {
	const modules = listModules(COMPONENTS)
	const known = new Set(modules)
	const resolve = (from: string, specifier: string): string | undefined => {
		const base = specifier.startsWith("@/components/")
			? join(COMPONENTS, specifier.slice("@/components/".length))
			: specifier.startsWith(".")
				? join(from, "..", specifier)
				: undefined
		if (base == undefined) return undefined
		for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
			if (known.has(candidate)) return candidate
		}
		return undefined
	}
	const graph = new Map<string, Set<string>>()
	for (const file of modules) {
		const deps = new Set<string>()
		for (const [statement, specifier] of importStatements(readSource(file))) {
			if (isTypeOnly(statement)) continue
			const target = resolve(file, specifier)
			if (target != undefined) deps.add(target)
		}
		graph.set(file, deps)
	}
	return graph
}

const relativePath = (path: string) => relative(repoRoot, path)

// 从 start 出发能否回到 target（沿运行依赖边）
const reaches = (
	graph: Map<string, Set<string>>,
	start: string,
	target: string
): boolean => {
	const seen = new Set<string>()
	const stack = [start]
	while (stack.length > 0) {
		const current = stack.pop()!
		if (current == target) return true
		if (seen.has(current)) continue
		seen.add(current)
		for (const next of graph.get(current) ?? []) stack.push(next)
	}
	return false
}

// 全图环检测（三色 DFS），返回每条环的路径
const findCycles = (graph: Map<string, Set<string>>): string[][] => {
	const WHITE = 0
	const GRAY = 1
	const BLACK = 2
	const color = new Map<string, number>()
	for (const file of graph.keys()) color.set(file, WHITE)
	const cycles: string[][] = []
	const stack: string[] = []
	const visit = (file: string): void => {
		color.set(file, GRAY)
		stack.push(file)
		for (const next of graph.get(file) ?? []) {
			if (color.get(next) == GRAY) {
				cycles.push([...stack.slice(stack.indexOf(next)), next])
			} else if (color.get(next) == WHITE) {
				visit(next)
			}
		}
		stack.pop()
		color.set(file, BLACK)
	}
	for (const file of graph.keys()) {
		if (color.get(file) == WHITE) visit(file)
	}
	return cycles
}

const MATRIX_RATES = join(COMPONENTS, "fxrate/matrix-rates.ts")
const TEST_CACHE_RESET = join(COMPONENTS, "fxrate/test-cache-reset.ts")
const PAIR_RATES = join(COMPONENTS, "fxrate/pair-rates.ts")

describe("matrix-rates 与 test-cache-reset 之间没有运行时双向 import", () => {
	const graph = buildRuntimeGraph()

	it("test-cache-reset 沿运行依赖回不到 matrix-rates", () => {
		expect(
			reaches(graph, TEST_CACHE_RESET, MATRIX_RATES),
			"test-cache-reset 经任何路径回到 matrix-rates 都会与 matrix-rates → test-cache-reset 成环"
		).toBe(false)
	})

	it("pair-rates 不再 import matrix-rates", () => {
		expect(reaches(graph, PAIR_RATES, MATRIX_RATES)).toBe(false)
	})

	it("matrix-rates 仍经 test-cache-reset 登记清空钩子", () => {
		const hookImports = importStatements(readSource(MATRIX_RATES)).filter(
			([, specifier]) => specifier == "./test-cache-reset"
		)
		expect(hookImports.length).toBe(1)
		expect(isTypeOnly(hookImports[0][0])).toBe(false)
		expect(hookImports[0][0]).toMatch(/registerDataCacheClearHook/)
	})

	it("components/ 下的运行依赖图无环", () => {
		const cycles = findCycles(graph).map((cycle) =>
			cycle.map(relativePath).join(" → ")
		)
		expect(cycles).toEqual([])
	})
})

describe("循环链上的两段登记各就各位", () => {
	const source = readSource(MATRIX_RATES)
	const registrationLines = source
		.split("\n")
		.filter((line) => !line.startsWith("//"))

	it("matrix-rates 在模块求值时登记清空，不依赖调用方先调用", () => {
		expect(registrationLines).toContain(
			"registerDataCacheClearHook(clearMatrixCache)"
		)
	})

	it("登记不在 clearMatrixCache 函数体内", () => {
		const clearBody = source.slice(
			source.indexOf("export function clearMatrixCache"),
			source.indexOf("\n}\n", source.indexOf("export function clearMatrixCache"))
		)
		expect(clearBody).not.toMatch(/registerData/)
	})

	it("test-cache-reset 的登记项按函数身份去重，重复登记不重复执行", () => {
		const resetSource = readSource(TEST_CACHE_RESET)
		expect(resetSource).toMatch(/new Set<DataCacheHook>\(\)/)
		expect(resetSource).toMatch(/\.add\(/)
	})

	it("test-cache-reset 仍导出清空入口", () => {
		const resetSource = readSource(TEST_CACHE_RESET)
		for (const name of [
			"clearDataCaches",
			"clearBundleCaches",
			"registerDataCacheClearHook",
		]) {
			expect(resetSource).toMatch(
				new RegExp(`export (?:async )?function ${name}\\(`)
			)
		}
	})
})
