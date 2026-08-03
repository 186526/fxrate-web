import { NextResponse } from "next/server"

// 供 API 文档页「试试看」生成可复制的 curl：
// 服务端读 FXRATE_PROXY 推导真实后端地址（浏览器端拿不到该 env）。
// rpcUrl = 后端 JSON-RPC 地址；restBase = REST 基址（去掉 /v1/jsonrpc 后缀）。
export const dynamic = "force-dynamic"

export function GET() {
	const proxy = process.env.FXRATE_PROXY || "https://fxrate.sunoaki.net/v1/jsonrpc"
	return NextResponse.json({
		rpcUrl: proxy,
		restBase: proxy.replace(/\/v1\/jsonrpc\/?$/, ""),
	})
}
