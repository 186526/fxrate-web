import { NextResponse } from "next/server"

// 供 API 文档页「试试看」生成可复制的 curl：
// 读取 next.config.mjs 与 rewrites 共用的构建期常量；standalone 中运行时修改
// FXRATE_PROXY 不会改变已固化的代理路由，因此这里也不能返回运行时值。
// rpcUrl = 后端 JSON-RPC 地址；restBase = REST 基址（去掉 /v1/jsonrpc 后缀）。
export const dynamic = "force-dynamic"

export function GET() {
	const proxy = process.env.FXRATE_PROXY_BUILD || "https://fxrate.sunoaki.net/v1/jsonrpc"
	return NextResponse.json({
		rpcUrl: proxy,
		restBase: proxy.replace(/\/v1\/jsonrpc\/?$/, ""),
	})
}
