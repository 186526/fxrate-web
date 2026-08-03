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
	"alipay",
]

const KEY = "fxrate-best-price-sources"

export function useBestPriceSources() {
	const [excluded, setExcluded] = React.useState<Set<string>>(
		() => new Set(NON_BANK_SOURCES)
	)

	// 读档完成前禁止写入：避免挂载时用默认排除集覆盖用户 localStorage 存档
	const loadedRef = React.useRef(false)

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
	}, [])

	React.useEffect(() => {
		if (!loadedRef.current) return
		try {
			localStorage.setItem(KEY, JSON.stringify(Array.from(excluded)))
		} catch {
			// localStorage 不可用时忽略持久化
		}
	}, [excluded])

	// 标记读档完成（须声明在持久化 effect 之后：首轮渲染持久化先跳过，state 更新后再写）
	React.useEffect(() => {
		loadedRef.current = true
	}, [])

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
