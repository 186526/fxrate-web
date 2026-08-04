import { spawn } from "node:child_process"
import net from "node:net"
import path from "node:path"
import fs from "node:fs"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "..", "..")

export const BENCH_PARENT_DIR = "/tmp/fxrate-benchmark"
export const DEFAULT_KILL_TIMEOUT_MS = 5000

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const getFreePort = () =>
	new Promise((resolve, reject) => {
		const srv = net.createServer()
		srv.unref()
		srv.on("error", reject)
		srv.listen(0, "127.0.0.1", () => {
			const { port } = srv.address()
			srv.close(() => resolve(port))
		})
	})

// CDP categories 归一化：接受 " a , b ,, c " 形式的输入，去空白、去空项。
export const normalizeCategories = (input) =>
	String(input)
		.split(",")
		.map((c) => c.trim())
		.filter(Boolean)

// 统一 CLI 解析：同时接受 `--key=value` 与 `--key value` 两种形式。
// spec 键为不带前导 `--` 的旗标名，值为 (值字符串) => 解析函数；未指定返回默认。
// `--help`/`-h` 打印 helpText 后退出；未知旗标抛错。
export const parseFlags = (argv, spec, helpText) => {
	const args = []
	for (const a of argv) {
		if (a.startsWith("--") && a.includes("=")) {
			const idx = a.indexOf("=")
			args.push(a.slice(0, idx), a.slice(idx + 1))
		} else {
			args.push(a)
		}
	}
	const opts = {}
	for (let i = 0; i < args.length; i++) {
		const key = args[i]
		if (key === "--help" || key === "-h") {
			console.log(helpText)
			process.exit(0)
		}
		const parse = spec[key.slice(2)]
		if (!parse) throw new Error(`unknown option ${key}`)
		opts[key.slice(2)] = parse(args[++i])
	}
	return opts
}

// 输出目录准备：未显式指定时在 /tmp/fxrate-benchmark 下建每-run 独立目录
// （fs.mkdtempSync，0700，随机后缀，规避多进程并发写同一文件）；
// 显式指定时校验最终目录组件不是符号链接且是目录（防符号链接劫持）。
export const prepareOutputDir = (given) => {
	if (!given) {
		fs.mkdirSync(BENCH_PARENT_DIR, { recursive: true, mode: 0o700 })
		return fs.mkdtempSync(path.join(BENCH_PARENT_DIR, "run-"), {
			mode: 0o700,
		})
	}
	const resolved = path.resolve(given)
	if (fs.existsSync(resolved)) {
		const st = fs.lstatSync(resolved)
		if (st.isSymbolicLink()) {
			throw new Error(`refusing symlink output dir: ${resolved}`)
		}
		if (!st.isDirectory()) {
			throw new Error(`output dir is not a directory: ${resolved}`)
		}
		return resolved
	}
	fs.mkdirSync(resolved, { recursive: true, mode: 0o700 })
	const st = fs.lstatSync(resolved)
	if (st.isSymbolicLink()) {
		throw new Error(`refusing symlink output dir: ${resolved}`)
	}
	if (!st.isDirectory()) {
		throw new Error(`output dir is not a directory: ${resolved}`)
	}
	return resolved
}

const childExited = (child) =>
	child.exitCode !== null || child.signalCode !== null

const waitFor = async (url, label, options = {}) => {
	const { timeoutMs = 180000, child, childName, logPath } = options
	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		if (child && childExited(child)) {
			// 子进程提前退出（如 Next 16 检测到同目录已有 dev server 而拒绝启动）：
			// 立即报错并给出日志路径，不等满超时。
			throw new Error(
				`${label} exited early (${childName} ${child.exitCode ?? child.signalCode}) — see ${logPath}`,
			)
		}
		try {
			const res = await fetch(url)
			if (res.status >= 200 && res.status < 500) return
		} catch {
			// 服务尚未就绪，继续轮询
		}
		await sleep(500)
	}
	throw new Error(`timed out waiting for ${label} at ${url}`)
}

// 子进程退出 promise：已退出（exitCode 或 signalCode 已设置——被信号杀死的进程
// exitCode 为 null、signalCode 非 null）立即 resolve，否则等 'exit' 事件。
// 检查与注册之间没有 await（单线程同步段），不存在事件先于监听的竞态。
const exited = (child) => {
	if (childExited(child)) {
		return Promise.resolve(child.exitCode ?? child.signalCode)
	}
	return new Promise((resolve) => child.once("exit", resolve))
}

// 停掉子进程：先 SIGTERM，KILL_TIMEOUT_MS 内未退出则 SIGKILL。
// 已退出的子进程立即跳过；SIGKILL 必然终止，因此本函数绝不挂起。
export const stopChildren = async (
	children,
	timeoutMs = DEFAULT_KILL_TIMEOUT_MS,
) => {
	for (const child of children) {
		if (!childExited(child)) child.kill("SIGTERM")
	}
	const deadline = Date.now() + timeoutMs
	await Promise.all(
		children.map(async (child) => {
			if (childExited(child)) return
			await Promise.race([
				exited(child),
				sleep(Math.max(0, deadline - Date.now())),
			])
			if (!childExited(child)) child.kill("SIGKILL")
		}),
	)
	await Promise.allSettled(children.map(exited))
}

// 资源生命周期包装：normal/error 路径走 finally 执行 cleanup（不 process.exit），
// SIGINT/SIGTERM 信号先 await cleanup（关闭 Chrome/Playwright + harness）再 exit——
// process.exit 绝不绕过 cleanup。cleanup 必须幂等（可能被 finally 与信号各触发一次）。
export const withShutdown = async (cleanup, run) => {
	let shuttingDown = false
	let finished = false
	const shutdown = async (code) => {
		if (shuttingDown || finished) return
		shuttingDown = true
		try {
			await cleanup()
		} catch {
			// 清理失败也要退出，不留孤儿进程
		}
		process.exit(code)
	}
	process.once("SIGINT", () => void shutdown(130))
	process.once("SIGTERM", () => void shutdown(143))
	try {
		return await run()
	} finally {
		finished = true
		if (!shuttingDown) await cleanup()
	}
}

// 启动与 test/e2e 完全一致的本地 harness：mock JSON-RPC 后端（SSR 与浏览器代理都指向它）
// + next dev（-H 127.0.0.1 只绑 loopback）。浏览器统一用 http://localhost:PORT 访问
// （Next 16 dev 的 allowedDevOrigins 会拦截 127.0.0.1 Host 的 dev 资源，导致 React 不水合）。
// 端口默认动态探测空闲端口（MOCK_PORT/WEB_PORT 可覆盖），输出日志落到 outputDir。
// 信号处理不在此安装（脚本层经 withShutdown 统一关 Chrome/Playwright + stop）。
export const startHarness = async (options = {}) => {
	const outputDir = options.outputDir ?? BENCH_PARENT_DIR
	fs.mkdirSync(outputDir, { recursive: true })
	const mockPort =
		options.mockPort ??
		(process.env.MOCK_PORT ? Number(process.env.MOCK_PORT) : await getFreePort())
	const webPort =
		options.webPort ??
		(process.env.WEB_PORT ? Number(process.env.WEB_PORT) : await getFreePort())

	const writeLog = (name) => (data) => {
		try {
			fs.appendFileSync(path.join(outputDir, `${name}.log`), data)
		} catch {
			// 日志写失败不阻断测量
		}
	}

	const mock = spawn(
		process.execPath,
		[path.join(repoRoot, "test/e2e/mock-server/index.cjs")],
		{
			cwd: repoRoot,
			env: { ...process.env, PORT: String(mockPort) },
			stdio: ["ignore", "pipe", "pipe"],
		},
	)
	mock.stdout.on("data", writeLog("mock-server"))
	mock.stderr.on("data", writeLog("mock-server"))

	const web = spawn(
		process.execPath,
		[
			path.join(repoRoot, "node_modules/next/dist/bin/next"),
			"dev",
			"-p",
			String(webPort),
			"-H",
			"127.0.0.1",
		],
		{
			cwd: repoRoot,
			env: {
				...process.env,
				FXRATE_API: `http://127.0.0.1:${mockPort}/v1/jsonrpc`,
				FXRATE_PROXY: `http://127.0.0.1:${mockPort}/v1/jsonrpc`,
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	)
	web.stdout.on("data", writeLog("next-dev"))
	web.stderr.on("data", writeLog("next-dev"))

	const children = [mock, web]

	const failEarly = (child, name) => {
		if (child.exitCode !== null) {
			throw new Error(
				`${name} exited early with code ${child.exitCode} — see ${outputDir}/${name === "mock-server" ? "mock-server" : "next-dev"}.log`,
			)
		}
	}

	try {
		await waitFor(`http://127.0.0.1:${mockPort}/__ping`, "mock server", {
			child: mock,
			childName: "mock-server",
			logPath: path.join(outputDir, "mock-server.log"),
		})
		failEarly(mock, "mock-server")
		const baseUrl = `http://localhost:${webPort}`
		await waitFor(`${baseUrl}/`, "next dev", {
			child: web,
			childName: "next-dev",
			logPath: path.join(outputDir, "next-dev.log"),
		})
		failEarly(web, "next-dev")
		// 预热：首次请求触发 Next dev 编译（页面 + 客户端 bundle），编译完成后再等一拍，
		// 保证真正测量时的加载不包含首访编译噪音（本地基准的确定性来源之一）。
		await fetch(`${baseUrl}/`)
		await sleep(400)
		return { baseUrl, mockPort, webPort, stop: () => stopChildren(children) }
	} catch (error) {
		await stopChildren(children)
		throw error
	}
}
