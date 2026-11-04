import { sourceNamesInZH } from "@/lib/fxrate/src/constant"

const nameMapping: { [x: string]: string } = sourceNamesInZH

// 来源显示名：有中文映射时附来源代码（如「中国银行 (boc)」），否则原样返回
export function getName(name: string): string {
	if (nameMapping[name]) {
		return nameMapping[name] + ` (${name})`
	} else return name
}
