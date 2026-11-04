import FXRates from "@/lib/fxrate/src/client"
import { cache as reactCache } from "react"

// 构造 FXRates client：优先 FXRATE_API（仅服务端注入），否则走同源代理 /api/fxrate
function buildClient(): FXRates {
	return new FXRates(
		process.env.FXRATE_API
			? new URL(process.env.FXRATE_API)
			: new URL(
					"/api/fxrate",
					typeof window == "undefined"
						? "http://localhost:3000"
						: window.location.origin
			  )
	)
}

// 浏览器端默认 client：客户端 JS 单上下文，模块级单例即可（兼容既有 FXRate 导入）
export const FXRate = buildClient()

// 服务端请求级 client：React.cache 让每次 RSC 请求拿到独立 FXRates 实例，
// 不共享 batch()/done()/请求队列等可变状态，避免并发请求互相污染
const getServerClient = reactCache(() => buildClient())

// 取当前执行环境适用的 client：浏览器返回默认单例，服务端返回请求级实例。
// 所有数据拉取都经此入口（injection 模式）
export function getFXRateClient(): FXRates {
	return typeof window == "undefined" ? getServerClient() : FXRate
}

// 后端个别源（如 cfets）可能返回 "Invalid Date" 字符串：
// 无效日期回退为当前时间，避免 toISOString() 抛 RangeError 导致整页 500
export function safeUpdated(v: Date | string | number | undefined): Date {
	const d = new Date(v as string | number | Date)
	return Number.isNaN(d.getTime()) ? new Date() : d
}
