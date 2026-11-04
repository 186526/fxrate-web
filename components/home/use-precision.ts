"use client"
import * as React from "react"

import { usePersistentState, useHydratedStorage } from "../persistent-state"
import { DEFAULT_PRECISION, parsePrecision } from "../view-utils"

const PRECISION_KEY = "fxrate-precision"

// 小数精度偏好（localStorage）。URL 的 ?precision= 由调用方优先处理。
// 只有存储已读取完成（hydrated）后才把当前精度写回存储，否则首挂载会用
// 默认值覆盖用户此前保存的精度。
export function usePrecision() {
	const [precisionState, setPrecisionState] = React.useState(DEFAULT_PRECISION)
	const stored = useHydratedStorage(
		PRECISION_KEY,
		null as number | null,
		(value) => parsePrecision(value)
	)
	const precision = stored.value ?? precisionState
	const precisionHydrated = stored.hydrated

	React.useEffect(() => {
		if (!precisionHydrated) return
		try {
			localStorage.setItem(PRECISION_KEY, String(precision))
		} catch {
			// localStorage 不可用时忽略持久化
		}
	}, [precision, precisionHydrated])

	const setPrecision = (value: number) => setPrecisionState(value)
	const resetPrecision = () => {
		try {
			localStorage.removeItem(PRECISION_KEY)
		} catch {
			// localStorage 不可用时忽略
		}
		setPrecisionState(DEFAULT_PRECISION)
	}

	return { precision, precisionHydrated, setPrecision, resetPrecision }
}

// 交叉汇率开关：开启后单对视图请求带 bfs=true，无直连报价时经中间货币折算
export function useCrossRates() {
	return usePersistentState(
		"fxrate-cross-rates",
		false,
		(value) => value == "1" || value == "true",
		(value) => (value ? "1" : "0")
	)
}
