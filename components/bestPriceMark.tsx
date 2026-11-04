"use client"
import * as React from "react"

// 最优价非颜色语义标记：最优价高亮目前靠 加粗 + 品牌色文字 + brandSoft 底色，
// 颜色/加粗对色弱与屏幕阅读器用户不可靠；在报价数字旁以兄弟元素渲染该标记，
// 与数字 span 并列（不包裹），保证 getByText("7.1") 精确匹配数字本身不受影响。
export default function BestPriceMark() {
	return (
		<span
			role="img"
			aria-label="最优价"
			title="最优价"
			style={{
				display: "inline-flex",
				alignItems: "center",
				fontSize: 11,
				lineHeight: 1,
				marginLeft: 4,
				verticalAlign: "middle",
			}}
		>
			★
		</span>
	)
}
