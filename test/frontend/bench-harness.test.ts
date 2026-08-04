// scripts/bench harness 聚焦测试（offline，零浏览器/零 next）：
// 覆盖 review 重点的失败路径——stopChildren 对已退出子进程立即返回、
// SIGTERM 超时后 SIGKILL 且不挂起；prepareOutputDir 每-run 0700 目录与
// 符号链接拒绝；normalizeCategories 去空白去空项；getFreePort 返回可绑定端口。
import { spawn } from "node:child_process"
import net from "node:net"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
	BENCH_PARENT_DIR,
	getFreePort,
	normalizeCategories,
	parseFlags,
	prepareOutputDir,
	stopChildren,
} from "../../scripts/bench/harness.mjs"

describe("scripts/bench harness", () => {
	it("parseFlags accepts --key value and --key=value forms", () => {
		const spec = {
			preset: (v: string) => v,
			"chrome-port": (v: string) => Number(v),
		}
		expect(
			parseFlags(["--preset", "desktop", "--chrome-port=9400"], spec, ""),
		).toEqual({ preset: "desktop", "chrome-port": 9400 })
		expect(parseFlags(["--preset=both"], spec, "")).toEqual({
			preset: "both",
		})
		expect(() => parseFlags(["--nope"], spec, "")).toThrow(/unknown option/)
	})

	it("normalizeCategories trims whitespace and drops empty entries", () => {
		expect(normalizeCategories(" a ,, b , c ")).toEqual(["a", "b", "c"])
		expect(normalizeCategories("")).toEqual([])
		expect(normalizeCategories("x")).toEqual(["x"])
	})

	it("prepareOutputDir creates a per-run 0700 dir under /tmp/fxrate-benchmark", () => {
		const dir = prepareOutputDir(null)
		try {
			expect(dir.startsWith(path.join(BENCH_PARENT_DIR, "run-"))).toBe(true)
			expect(fs.statSync(dir).isDirectory()).toBe(true)
			expect(fs.statSync(dir).mode & 0o777).toBe(0o700)
		} finally {
			fs.rmSync(dir, { recursive: true, force: true })
		}
	})

	it("prepareOutputDir creates and reuses an explicit directory", () => {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "fxrate-bench-out-"))
		const target = path.join(base, "out")
		try {
			expect(prepareOutputDir(target)).toBe(path.resolve(target))
			expect(fs.statSync(target).isDirectory()).toBe(true)
			expect(fs.statSync(target).mode & 0o777).toBe(0o700)
			expect(prepareOutputDir(target)).toBe(path.resolve(target))
		} finally {
			fs.rmSync(base, { recursive: true, force: true })
		}
	})

	it("prepareOutputDir rejects a symlinked output directory", () => {
		const base = fs.mkdtempSync(path.join(os.tmpdir(), "fxrate-bench-link-"))
		const real = path.join(base, "real")
		const link = path.join(base, "link")
		fs.mkdirSync(real)
		fs.symlinkSync(real, link)
		try {
			expect(() => prepareOutputDir(link)).toThrow(/symlink/)
		} finally {
			fs.rmSync(base, { recursive: true, force: true })
		}
	})

	it("getFreePort returns a bindable port", async () => {
		const port = await getFreePort()
		expect(port).toBeGreaterThan(0)
		await new Promise((resolve, reject) => {
			const srv = net.createServer()
			srv.unref()
			srv.once("error", reject)
			srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(null)))
		})
	})

	it("stopChildren handles an already-exited child immediately", async () => {
		const child = spawn(process.execPath, ["-e", "process.exit(3)"])
		await new Promise((resolve) => child.once("exit", resolve))
		const started = Date.now()
		await stopChildren([child], 5000)
		expect(child.exitCode).toBe(3)
		expect(Date.now() - started).toBeLessThan(1000)
	})

	it("stopChildren SIGTERMs a cooperative child", async () => {
		const child = spawn(process.execPath, [
			"-e",
			"process.on('SIGTERM',()=>process.exit(0)); console.log('ready'); setInterval(()=>{},1000)",
		])
		// 等子进程注册完 SIGTERM handler（读 stdout 的 ready 标记），否则启动期的
		// SIGTERM 走默认动作（信号杀死），测不到「handler 退出 0」的路径。
		await new Promise((resolve) => child.stdout.once("data", resolve))
		const started = Date.now()
		await stopChildren([child], 5000)
		expect(child.exitCode).toBe(0)
		expect(Date.now() - started).toBeLessThan(2000)
	})

	it("stopChildren escalates to SIGKILL for a SIGTERM-ignoring child", async () => {
		const child = spawn(process.execPath, [
			"-e",
			"process.on('SIGTERM',()=>{}); console.log('ready'); setInterval(()=>{},1000)",
		])
		await new Promise((resolve) => child.stdout.once("data", resolve))
		const started = Date.now()
		await stopChildren([child], 500)
		expect(child.exitCode).toBeNull()
		expect(child.signalCode).toBe("SIGKILL")
		expect(Date.now() - started).toBeLessThan(3000)
	})
})
