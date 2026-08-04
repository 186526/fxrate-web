import { defineConfig } from "@playwright/test"
import path from "node:path"

// e2e 完全本地化：mock JSON-RPC 后端（SSR 与浏览器代理都指向它）先行，
// 再启动 next dev（FXRATE_API/FXRATE_PROXY 指向 mock），测试不触碰真实上游。
// 注意 baseURL 必须用 localhost 而非 127.0.0.1：Next 16 dev 的 allowedDevOrigins
// 会拦截 127.0.0.1 Host 的 dev 资源，导致 React 不水合（无事件/无 CSR 请求）。
// 两个服务都只绑定 loopback（127.0.0.1），不暴露到局域网/公网接口；
// 端口可用 MOCK_PORT / WEB_PORT 环境变量覆盖，避免本地并行跑测试撞端口。
const MOCK_PORT = Number(process.env.MOCK_PORT || 8188)
const WEB_PORT = Number(process.env.WEB_PORT || 3111)
const mockServer = path.resolve(__dirname, "test/e2e/mock-server/index.cjs")
const mockApi = `http://127.0.0.1:${MOCK_PORT}/v1/jsonrpc`

export default defineConfig({
	testDir: "./test/e2e",
	timeout: 60_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1,
	retries: 0,
	reporter: [["list"]],
	use: {
		baseURL: `http://localhost:${WEB_PORT}`,
		trace: "retain-on-failure",
	},
	webServer: [
		{
			command: `node ${mockServer}`,
			url: `http://127.0.0.1:${MOCK_PORT}/__ping`,
			reuseExistingServer: false,
			timeout: 30_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				PORT: String(MOCK_PORT),
			},
		},
		{
			// -H 127.0.0.1：dev server 只监听 loopback（默认 0.0.0.0 会暴露所有网卡）；
			// baseURL 仍用 localhost 访问，浏览器 happy-eyeballs 会回落到 127.0.0.1
			command: `yarn dev -p ${WEB_PORT} -H 127.0.0.1`,
			url: `http://localhost:${WEB_PORT}`,
			reuseExistingServer: false,
			timeout: 180_000,
			stdout: "pipe",
			stderr: "pipe",
			env: {
				...process.env,
				FXRATE_API: mockApi,
				FXRATE_PROXY: mockApi,
			},
		},
	],
})
