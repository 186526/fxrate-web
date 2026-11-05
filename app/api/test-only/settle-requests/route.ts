import { settleDataRequests } from "@/components/fxrate/test-cache-reset"
import { NextResponse } from "next/server"

// 仅供 e2e：等前端仍在跑的数据请求落地。
// 矩阵请求在调用方离开后会继续跑完写缓存，用例切换时若不等它，它的请求会记进
// 下一个用例的 mock 计数、结果会落进下一个用例的缓存。
// 生产构建下返回 404：镜像暴露在公网，该入口不能对外可用。
export const dynamic = "force-dynamic"

export async function POST() {
	if (process.env.NODE_ENV === "production") {
		return new NextResponse(null, { status: 404 })
	}
	await settleDataRequests()
	return NextResponse.json({ settled: true })
}
