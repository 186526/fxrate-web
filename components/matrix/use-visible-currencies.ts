"use client"
import * as React from "react"

import { usePersistentState } from "../persistent-state"
import {
	compareCurrencies,
	DEFAULT_COMMON_CURRENCIES,
	type MatrixDisplayData,
} from "../matrix-utils"

const parseCurrencies = (saved: string | null): string[] | null => {
	if (!saved) return null
	try {
		const parsed: unknown = JSON.parse(saved)
		if (!Array.isArray(parsed)) return null
		return parsed.filter((x) => typeof x == "string")
	} catch {
		return null
	}
}

const serializeCurrencies = (value: string[] | null): string =>
	JSON.stringify(value ?? [])

// 矩阵可见货币集合：null 表示「默认常用币种中主数据有的那些」。
// 用户勾选后持久化到 localStorage；恢复默认即清空偏好。
export function useVisibleCurrencies(data: MatrixDisplayData, from: string) {
	const [enabled, setEnabled] = usePersistentState(
		"fxrate-matrix-currencies",
		null as string[] | null,
		parseCurrencies,
		serializeCurrencies
	)

	// 主数据里出现过的全部货币（不含基准货币本身）
	const allCurrencies = React.useMemo(() => {
		const currencySet = new Set<string>()
		for (const source in data) {
			for (const currency in data[source]) {
				if (currency == from) continue
				currencySet.add(currency)
			}
		}
		return Array.from(currencySet).sort(compareCurrencies)
	}, [data, from])

	// 默认（未自定义）只显示主数据里存在的常用币种
	const defaultCurrencies = React.useMemo(() => {
		const present = new Set(allCurrencies)
		return DEFAULT_COMMON_CURRENCIES.filter((c) => present.has(c))
	}, [allCurrencies])

	const currencies = React.useMemo(() => {
		const activeSet = new Set(enabled ?? defaultCurrencies)
		return allCurrencies.filter((c) => activeSet.has(c))
	}, [allCurrencies, enabled, defaultCurrencies])

	const toggleCurrency = (c: string) => {
		setEnabled((prev) => {
			const base = prev ?? defaultCurrencies
			return base.includes(c) ? base.filter((x) => x != c) : [...base, c]
		})
	}

	return {
		enabled,
		allCurrencies,
		defaultCurrencies,
		currencies,
		toggleCurrency,
		resetCurrencies: () => setEnabled(null),
	}
}

// 主数据（不含额外行）的可见货币签名：用于构造额外行请求 key。
// 额外行新增的货币列不应触发整批额外行重置，故 key 只随主数据/启用集变化
export function useBaseVisibleCurrencies(
	data: MatrixDisplayData,
	from: string,
	enabled: string[] | null
): string[] {
	return React.useMemo(() => {
		const currencySet = new Set<string>()
		for (const source in data) {
			for (const currency in data[source]) {
				if (currency == from) continue
				currencySet.add(currency)
			}
		}
		const activeSet = new Set(enabled ?? currencySet)
		return Array.from(currencySet)
			.filter((c) => activeSet.has(c))
			.sort(compareCurrencies)
	}, [data, from, enabled])
}
