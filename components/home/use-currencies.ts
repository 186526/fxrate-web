"use client"
import * as React from "react"

import {
	FXRate,
	getCachedBackendInfo,
	showCurrencyAllRates,
	withTimeout,
} from "../tools"
import type { infoResponse } from "@/lib/fxrate/src/client"

// 来源货币列表与后端版本：薄壳下无 SSR 预取时全部由客户端负责。
// 失败写入 loadError，retry 递增尝试次数重跑。
export function useCurrencies({
	initialCurrencies,
	initialBackendVersion,
}: {
	initialCurrencies?: { [source: string]: string[] } | null
	initialBackendVersion?: string
}) {
	const [currencies, setCurrencies] = React.useState<{
		[source: string]: string[]
	} | null>(initialCurrencies ?? null)
	const [loadError, setLoadError] = React.useState<string | null>(null)
	const [currenciesLoadAttempt, setCurrenciesLoadAttempt] = React.useState(0)
	const [backendVersion, setBackendVersion] = React.useState(
		initialBackendVersion ?? ""
	)

	React.useEffect(() => {
		if (initialCurrencies) return
		let cancelled = false
		;(async () => {
			try {
				setLoadError(null)
				// info() 须在 showCurrencyAllRates 之后串行（后者内部开启 batch，
				// 并行的 info() 会被吞进批量队列拿不到结果）
				// 5s 超时降级：慢源（上游抓取 30s 超时）不应拖住首屏
				const cur = await withTimeout(showCurrencyAllRates(), 5000)
				if (cancelled) return
				if (!cur || Object.keys(cur).length == 0) {
					if (!cancelled) setLoadError("数据加载超时，请稍后刷新重试")
					return
				}
				setCurrencies(cur)
				setLoadError(null)
				try {
					const cachedInfo = getCachedBackendInfo()
					const info = await withTimeout(
						Promise.resolve(cachedInfo ?? FXRate.info()),
						5000
					)
					if (!cancelled && info) {
						setBackendVersion((info as infoResponse).version)
					}
				} catch {
					// 版本信息是可选元数据；报价基础数据已可用时不阻断页面。
				}
			} catch (e) {
				if (!cancelled) {
					setLoadError(
						e instanceof Error ? e.message : "加载数据失败，请稍后重试"
					)
				}
			}
		})()
		return () => {
			cancelled = true
		}
	}, [initialCurrencies, currenciesLoadAttempt])

	const allCurrencies = React.useMemo(() => {
		if (!currencies) return []
		return Array.from(new Set(Object.values(currencies).flat()))
	}, [currencies])

	return {
		currencies,
		allCurrencies,
		loadError,
		retry: () => setCurrenciesLoadAttempt((attempt) => attempt + 1),
		backendVersion,
	}
}
