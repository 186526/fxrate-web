import { clearDataCaches } from "@/components/fxrate/test-cache-reset"
import { NextResponse } from "next/server"

// 仅供 e2e：next dev 进程跨用例存活，数据层模块级缓存（info/货币列表/单对/矩阵）
// 会被前一个用例或 webServer readiness probe 写入，导致服务端请求计数归零。
// e2e 的 resetMockServer() 重置 mock 计数后调用本路由清空这些缓存。
// 生产构建下返回 404：镜像暴露在公网，缓存清空入口不能对外可用。
// 路径段不能以 _ 开头：Next 把 _ 前缀目录视为私有目录，不生成路由。
export const dynamic = "force-dynamic"

export function POST() {
	if (process.env.NODE_ENV === "production") {
		return new NextResponse(null, { status: 404 })
	}
	clearDataCaches()
	return NextResponse.json({ cleared: true })
}
