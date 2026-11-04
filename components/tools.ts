// 数据层统一导出入口：实现分布在 components/fxrate/ 下，components/ 内除 fxrate/
// 内部外一律从 "@/components/tools" 导入，不直连子模块。
export { FXRate, getFXRateClient, safeUpdated } from "./fxrate/client"
export {
	DEFAULT_TIMEOUT_MS,
	withTimeout,
	runBatch,
	createAbortError,
} from "./fxrate/request"
export {
	clearBackendInfoCache,
	getCachedBackendInfo,
	getBackendInfo,
	showCurrencyAllRates,
} from "./fxrate/metadata"
export {
	bestPriceExcludeSources,
	SLOW_SOURCES,
	sourceRatesURL,
	ratesPageURL,
	rssURL,
} from "./fxrate/source-links"
export {
	getCurrenciesDetails,
	type FXDetailsOptions,
	type FXDetailsUpdate,
} from "./fxrate/pair-rates"
export {
	getRatesMatrix,
	getSourceMatrixRow,
	type RatesMatrixCell,
	type RatesMatrix,
} from "./fxrate/matrix-rates"
export { getName } from "./fxrate/source-display"
export { SOURCE_COL_MIN_WIDTH, NUMERIC_CELL_LAYOUT } from "./fxrate/table-layout"

// 识别取消错误：唯一实现见 components/shared.ts（此处 re-export 供既有导入使用）
export { isAbortError } from "./shared"
