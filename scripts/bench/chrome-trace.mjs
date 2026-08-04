import path from "node:path"
import fs from "node:fs"
import { chromium } from "@playwright/test"
import {
	startHarness,
	normalizeCategories,
	parseFlags,
	prepareOutputDir,
	sleep,
	withShutdown,
} from "./harness.mjs"

const DEFAULT_CATEGORIES =
	"devtools.timeline,v8.execute,blink.user_timing,loading,navigation,network"
const DEFAULT_SETTLE_MS = 3000

const opts = parseFlags(
	process.argv.slice(2),
	{
		"output-dir": (v) => v,
		categories: (v) => v,
		"settle-ms": (v) => Number(v),
	},
	[
		"usage: node scripts/bench/chrome-trace.mjs [options]",
		"  --output-dir <dir>     output directory (default: per-run dir under /tmp/fxrate-benchmark)",
		`  --categories <a,b,c>   trace categories (default ${DEFAULT_CATEGORIES})`,
		"  --settle-ms <n>        settle time after load before stopping trace (default 3000)",
	].join("\n"),
)

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-")

let browser = null
let harness = null
const cleanup = async () => {
	if (browser) {
		try {
			await browser.close()
		} catch {
			// 浏览器已关闭则忽略
		}
		browser = null
	}
	if (harness) {
		await harness.stop()
		harness = null
	}
}

const settleMs = opts["settle-ms"] ?? DEFAULT_SETTLE_MS

await withShutdown(cleanup, async () => {
	const outputDir = prepareOutputDir(opts["output-dir"])
	console.log(`[chrome-trace] output dir: ${outputDir}`)
	harness = await startHarness({ outputDir })

	browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] })
	const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
	const page = await context.newPage()
	const cdp = await context.newCDPSession(page)

	const categories = normalizeCategories(opts.categories ?? DEFAULT_CATEGORIES).join(",")

	// 预热导航：first-visit 编译噪音不进入 trace（本地基准确定性）。
	await page.goto(`${harness.baseUrl}/`, { waitUntil: "load" })
	await sleep(settleMs)

	await cdp.send("Tracing.start", {
		transferMode: "ReturnAsStream",
		// CDP 契约：categories 必须是逗号拼接的字符串（传数组会被拒绝）
		categories,
	})
	await page.goto(`${harness.baseUrl}/`, { waitUntil: "load" })
	await sleep(settleMs)

	const completePromise = new Promise((resolve) =>
		cdp.once("Tracing.tracingComplete", resolve),
	)
	await cdp.send("Tracing.end")
	const complete = await completePromise

	let stream = null
	try {
		stream = complete.stream
		let raw = ""
		for (;;) {
			const chunk = await cdp.send("IO.read", { handle: stream, size: 1048576 })
			raw += chunk.data ?? ""
			if (chunk.eof) break
		}
		const outFile = path.join(outputDir, `trace-${stamp()}.json`)
		fs.writeFileSync(outFile, raw)
		console.log(`[chrome-trace] ${outFile}`)
		console.log(`  bytes=${Buffer.byteLength(raw)} categories=${categories} settleMs=${settleMs}`)
	} finally {
		// IO stream 句柄必须关闭，否则 trace 数据残留占住浏览器进程资源
		if (stream) {
			try {
				await cdp.send("IO.close", { handle: stream })
			} catch {
				// CDP 会话已断（如浏览器被信号清理）则忽略
			}
		}
	}
})
