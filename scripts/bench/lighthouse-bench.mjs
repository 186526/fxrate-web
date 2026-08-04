import path from "node:path"
import fs from "node:fs"
import lighthouse from "lighthouse"
import { launch } from "chrome-launcher"
import { chromium } from "@playwright/test"
import {
	startHarness,
	getFreePort,
	normalizeCategories,
	parseFlags,
	prepareOutputDir,
	sleep,
	withShutdown,
} from "./harness.mjs"

const DEFAULT_CATEGORIES = "performance"

const opts = parseFlags(
	process.argv.slice(2),
	{
		preset: (v) => v,
		"chrome-port": (v) => Number(v),
		"output-dir": (v) => v,
		categories: (v) => v,
	},
	[
		"usage: node scripts/bench/lighthouse-bench.mjs [options]",
		"  --preset <mobile|desktop|both>  lighthouse preset (default both)",
		"  --chrome-port <port>           explicit Chrome remote-debugging port (default: free port)",
		"  --output-dir <dir>             output directory (default: per-run dir under /tmp/fxrate-benchmark)",
		"  --categories <a,b,c>           comma-separated category ids (default performance)",
	].join("\n"),
)
const presets =
	opts.preset === "both" ? ["mobile", "desktop"] : [opts.preset ?? "both"]

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-")

const resolveChromePath = () => {
	if (process.env.CHROME_PATH) return process.env.CHROME_PATH
	try {
		return chromium.executablePath()
	} catch {
		return undefined
	}
}

const score = (lhr, id) => {
	const cat = lhr.categories[id]
	return cat ? Math.round(cat.score * 100) : null
}

let chrome = null
let harness = null
const cleanup = async () => {
	if (chrome) {
		try {
			await Promise.resolve(chrome.kill())
		} catch {
			// Chrome 已退出则忽略
		}
		chrome = null
	}
	if (harness) {
		await harness.stop()
		harness = null
	}
}

await withShutdown(cleanup, async () => {
	const outputDir = prepareOutputDir(opts["output-dir"])
	console.log(`[lighthouse-bench] output dir: ${outputDir}`)
	harness = await startHarness({ outputDir })

	const chromePath = resolveChromePath()
	chrome = await launch({
		...(chromePath ? { chromePath } : {}),
		port: opts["chrome-port"] ?? (await getFreePort()),
		chromeFlags: ["--headless", "--no-sandbox", "--disable-dev-shm-usage"],
	})

	const browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`)
	try {
		// 预热导航：让 next dev 的按需编译在真实审计前完成（本地基准确定性）。
		const warmup = await browser.newPage()
		try {
			await warmup.goto(`${harness.baseUrl}/`, { waitUntil: "load" })
			await sleep(500)
		} finally {
			await warmup.close()
		}
	} finally {
		await browser.close()
	}

	const categories = opts.categories
		? normalizeCategories(opts.categories)
		: [DEFAULT_CATEGORIES]

	for (const preset of presets) {
		const outFile = path.join(outputDir, `lighthouse-${preset}-${stamp()}.json`)
		const result = await lighthouse(`${harness.baseUrl}/`, {
			port: chrome.port,
			output: "json",
			preset,
			logLevel: "error",
			onlyCategories: categories,
		})
		// lighthouse() API 只返回 result.report（JSON 字符串），文件落盘由调用方完成
		// （outputPath 仅 CLI 处理；库函数直接传会被忽略）。
		fs.writeFileSync(outFile, result.report)
		const lhr = result.lhr
		const fmt = (id) => {
			const a = lhr.audits[id]
			return a ? a.displayValue ?? a.numericValue : "-"
		}
		console.log(`[lighthouse ${preset}] ${outFile}`)
		console.log(
			`  score: performance=${score(lhr, "performance")} a11y=${score(lhr, "accessibility")} best-practices=${score(lhr, "best-practices")} seo=${score(lhr, "seo")}`,
		)
		console.log(
			`  FCP=${fmt("first-contentful-paint")} LCP=${fmt("largest-contentful-paint")} TBT=${fmt("total-blocking-time")} CLS=${fmt("cumulative-layout-shift")} SI=${fmt("speed-index")} TTI=${fmt("interactive")}`,
		)
		console.log(`  total-ms=${lhr.timing?.total} runWarnings=${(lhr.runWarnings ?? []).length}`)
	}
})
