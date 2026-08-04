"use client"
import * as React from "react"

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
	const [excluded, setExcluded] = React.useState<Set<string>>(
		() => new Set(NON_BANK_SOURCES)
	)
	// hydration 门闩：读档前持久化 effect 不得写回，避免 StrictMode 双执行下用默认值覆盖存档
	const [hydrated, setHydrated] = React.useState(false)

	React.useEffect(() => {
		try {
			const saved = localStorage.getItem(KEY)
			if (saved) {
				const parsed: unknown = JSON.parse(saved)
				if (Array.isArray(parsed)) {
					setExcluded(new Set(parsed.filter((x) => typeof x == "string")))
				}
			}
		} catch {
			// localStorage 不可用时使用默认排除集
		}
		setHydrated(true)
	}, [])

	// 提交后持久化：仅在 hydration 完成后写回当前已提交的排除集，事件处理器不再触碰 localStorage
	React.useEffect(() => {
		if (!hydrated) return
		try {
			localStorage.setItem(KEY, JSON.stringify(Array.from(excluded)))
		} catch {
			// localStorage 不可用时忽略持久化
		}
	}, [excluded, hydrated])

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
		try {
			localStorage.removeItem(KEY)
		} catch {
			// localStorage 不可用时忽略
		}
		setExcluded(new Set(NON_BANK_SOURCES))
	}

	// 全选：清空排除集，所有来源参与最优价高亮
	const selectAll = () => {
		setExcluded(new Set())
	}

	const isExcluded = (source: string) => excluded.has(source)

	return { excluded, toggle, isExcluded, reset, selectAll }
}
