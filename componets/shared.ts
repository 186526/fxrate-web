// 跨模块共享的零依赖类型与纯工具。放在这里的东西不得 import 任何 componets 内的模块，
// 否则会重新引入 tools.ts ↔ 组件的循环依赖。
//
// - FXListProps：单对报价行类型。原先定义在 fxlistgrid.tsx，被 tools.ts 引用，
//   而 fxlistgrid.tsx 又引用 tools.ts（rssURL/ratesPageURL），构成双向依赖环。
// - isAbortError：取消错误判定。tools.ts 与 api-docs/request.ts 原各有一份实现；
//   此处为唯一实现，另两处改为 import（api-docs 不 import tools.ts，避免把数据层
//   （client/LRU）打进文档页 bundle）。

export interface FXListProps {
	name: string
	type: {
		buy?: { cash?: number | string; remit?: number | string }
		sell?: { cash?: number | string; remit?: number | string }
		middle?: number | string
	}
	updated: Date
	id?: number
	// 交叉汇率时后端回传的实际兑换路径（如 ["CNH","HKD","JPY"]）
	path?: string[]
	// CNY/CNH 归一化：源只用 CNH 报价时实际使用 CNH 汇率（后端 alias 字段）
	alias?: string
}

// 识别取消错误：参数/视图变化引起的请求作废，不应展示为加载失败。
// DOMException 分支用于 fetch 的 abort（现代引擎下 DOMException 也 instanceof Error，
// 保留显式判断以兼容旧引擎与测试替身）。
export function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name == "AbortError"
		: error instanceof Error && error.name == "AbortError"
}
