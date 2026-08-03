/** @type {import('next').NextConfig} */
import buildId from "next-build-id";
import { dirname } from "node:path";
import { env } from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// 构建时注入时间戳（对应后端 esbuild --define 注入的 BUILDTIME）
const buildTime = new Date().toISOString();

const nextConfig = {
	typescript: {
		// !! WARN !!
		// Dangerously allow production builds to successfully complete even if
		// your project has type errors.
		// !! WARN !!
		ignoreBuildErrors: true,
	},
	generateBuildId: async () => {
		return await buildId({ dir: __dirname, describe: true }).catch((e) => {
			return env.NODE_ENV === "production" ? "production" : "development";
		});
	},
	output: "standalone",
	env: {
		FXBUILD_TIME: buildTime,
	},
	// 同源代理：浏览器请求 /api/fxrate，服务端转发到 fxrate 后端，
	// 绕开后端无 CORS 头导致的浏览器跨域拦截（dev / 部署一致）。
	// FXRATE_PROXY 可覆盖代理目标（如本地后端 yarn full-dev）。
	// /api/rest 同样转发：供 API 文档页的 REST「试试看」调用（docs/api.md 的 REST 路由）。
	async rewrites() {
		const proxy = env.FXRATE_PROXY || "https://fxrate.sunoaki.net/v1/jsonrpc"
		const restOrigin = proxy.replace(/\/v1\/jsonrpc\/?$/, "")
		return [
			{
				source: "/api/fxrate",
				destination: proxy,
			},
			{
				source: "/api/rest/:path*",
				destination: `${restOrigin}/:path*`,
			},
		]
	},
};

export default nextConfig;
