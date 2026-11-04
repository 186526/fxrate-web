// 窄屏宽度规则：来源列保证最小宽度（配合首列 sticky 截断长名）；
// 数值列设 min/max 宽度并截断超长值，避免极端数字在 320px 下撑爆横滚布局。
// 表头与正文首列单元格共用同一 minWidth，保证 sticky 列宽稳定不跳动。
export const SOURCE_COL_MIN_WIDTH = { xs: 116, sm: 150 } as const

export const NUMERIC_CELL_LAYOUT = {
	minWidth: { xs: 64, sm: 80 },
	maxWidth: { xs: 104, sm: 136 },
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
} as const
