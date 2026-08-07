/** @type {import('next').NextConfig} */
import { env } from "node:process"

const DEFAULT_FXRATE_PROXY = "https://fxrate.sunoaki.net/v1/jsonrpc"
const buildIdentifier =
	env.FXBUILD_ID || (env.NODE_ENV === "production" ? "production" : "development")
// 构建时冻结版本元数据；Docker/CD 可注入精确 commit 与时间，本地构建安全回落。
const buildTime = env.FXBUILD_TIME || new Date().toISOString()
// rewrites 与 backend-meta 必须共享同一个构建期值，避免运行时 env 改写文档元数据、
// 但 standalone 内的代理目标仍保持旧构建值。
const fxrateProxy = env.FXRATE_PROXY || DEFAULT_FXRATE_PROXY
const restOrigin = fxrateProxy.replace(/\/v1\/jsonrpc\/?$/, "")

const SECURITY_HEADERS = [
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{
		key: "Permissions-Policy",
		value: "camera=(), geolocation=(), microphone=()",
	},
]

const nextConfig = {
	typescript: {
		// !! WARN !!
		// Dangerously allow production builds to successfully complete even if
		// your project has type errors.
		// !! WARN !!
		ignoreBuildErrors: true,
	},
	generateBuildId: async () => buildIdentifier,
	output: "standalone",
	env: {
		FXBUILD_ID: buildIdentifier,
		FXBUILD_TIME: buildTime,
		FXRATE_PROXY_BUILD: fxrateProxy,
	},
	async headers() {
		return [
			{
				source: "/(.*)",
				headers: SECURITY_HEADERS,
			},
		]
	},
	// 同源代理：浏览器请求 /api/fxrate，服务端转发到 fxrate 后端，
	// 绕开后端无 CORS 头导致的浏览器跨域拦截（dev / 部署一致）。
	// FXRATE_PROXY 可覆盖代理目标（如本地后端 yarn full-dev）。
	// /api/rest 同样转发：供 API 文档页的 REST「试试看」调用（docs/api.md 的 REST 路由）。
	async rewrites() {
		return [
			{
				source: "/api/fxrate",
				destination: fxrateProxy,
			},
			{
				source: "/api/rest/:path*",
				destination: `${restOrigin}/:path*`,
			},
		]
	},
}

export default nextConfig
