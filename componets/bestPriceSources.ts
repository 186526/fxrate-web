"use client"
import * as React from "react"
import { usePersistentState } from "./persistent-state"

export const NON_BANK_SOURCES = [
	"pboc",
	"unionpay",
	"mastercard",
	"wise",
	"visa",
	"jcb",
	"ecb",
	"cfets",
	"hkma",
	"alipay",
]

const KEY = "fxrate-best-price-sources"

export function useBestPriceSources() {
	const parse = React.useCallback((saved: string | null) => {
		if (!saved) return new Set(NON_BANK_SOURCES)
		try {
			const parsed: unknown = JSON.parse(saved)
			return new Set(
				Array.isArray(parsed) ? parsed.filter((x) => typeof x == "string") : NON_BANK_SOURCES,
			)
		} catch {
			return new Set(NON_BANK_SOURCES)
		}
	}, [])
	const serialize = React.useCallback(
		(value: Set<string>) => JSON.stringify(Array.from(value)),
		[],
	)
	const [excluded, setExcluded] = usePersistentState(
		KEY,
		new Set(NON_BANK_SOURCES),
		parse,
		serialize,
	)

	const toggle = (source: string) => {
		setExcluded((prev) => {
			const next = new Set(prev)
			if (next.has(source)) {
				next.delete(source)
			} else {
				next.add(source)
			}
			return next
		})
	}

	const reset = () => {
		setExcluded(new Set(NON_BANK_SOURCES))
	}

	// 全选：清空排除集，所有来源参与最优价高亮
	const selectAll = () => {
		setExcluded(new Set())
	}

	const isExcluded = (source: string) => excluded.has(source)

	return { excluded, toggle, isExcluded, reset, selectAll }
}
