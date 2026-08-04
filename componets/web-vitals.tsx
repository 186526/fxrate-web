"use client"
import { useReportWebVitals } from "next/web-vitals"

// next/web-vitals 未直接导出 Metric 类型：从 useReportWebVitals 回调签名推导
type WebVitalsMetric = Parameters<typeof useReportWebVitals>[0] extends (
	metric: infer M
) => void
	? M
	: never

declare global {
	interface Window {
		__FX_WEB_VITALS__?: WebVitalsMetric[]
	}
}

// 指标环形缓冲：长期驻留页面时防止无界增长，只保留最近 MAX_RECORDED 条。
// 同 metric（id+name）重复回调（如 StrictMode 双注册、LCP/CLS/INP 更新）原地替换保留最新值
const MAX_RECORDED = 50
const GLOBAL_KEY = "__FX_WEB_VITALS__"
const recordedMetrics: WebVitalsMetric[] = []

function record(metric: WebVitalsMetric): void {
	try {
		const index = recordedMetrics.findIndex(
			(m) => m.name == metric.name && m.id == metric.id
		)
		if (index >= 0) {
			recordedMetrics.splice(index, 1)
		}
		recordedMetrics.push(metric)
		if (recordedMetrics.length > MAX_RECORDED) {
			recordedMetrics.shift()
		}
		window[GLOBAL_KEY] = recordedMetrics.slice()
	} catch {
		// 记录失败静默忽略：Web Vitals 埋点绝不影响页面运行
	}
}

// 全局 Web Vitals 埋点：挂载于根 layout，跨路由常驻，覆盖 TTFB/FCP/LCP/CLS/INP；
// 只做内存记录（不发任何网络请求/日志），组件渲染 null 不产生 UI。
// 回调为模块级稳定引用，useReportWebVitals 内部 effect 只注册一次
export function WebVitals() {
	useReportWebVitals(record)
	return null
}

export default WebVitals
