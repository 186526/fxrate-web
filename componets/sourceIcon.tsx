"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import { useTheme } from "@mui/material/styles"
import AccountBalanceIcon from "@mui/icons-material/AccountBalance"
import CreditCardIcon from "@mui/icons-material/CreditCard"
import CurrencyExchangeIcon from "@mui/icons-material/CurrencyExchange"

import { getAllCountries } from "country-locale-map"

// 货币 → 国旗 emoji（多国共用货币优先主国，其余用 country-locale-map 映射）
const PRIMARY_FLAGS: Record<string, string> = {
	AUD: "🇦🇺",
	CAD: "🇨🇦",
	CHF: "🇨🇭",
	CNY: "🇨🇳",
	CNH: "🇨🇳",
	EUR: "🇪🇺",
	GBP: "🇬🇧",
	HKD: "🇭🇰",
	JPY: "🇯🇵",
	KRW: "🇰🇷",
	NZD: "🇳🇿",
	SGD: "🇸🇬",
	THB: "🇹🇭",
	USD: "🇺🇸",
}
const flagMap = new Map<string, string>()
for (const c of getAllCountries()) {
	if (c.currency) flagMap.set(c.currency, c.emoji)
}
for (const [cur, flag] of Object.entries(PRIMARY_FLAGS)) {
	flagMap.set(cur, flag)
}

export function currencyEmoji(currency: string): string | undefined {
	return flagMap.get(currency)
}

// 无本地 SVG logo 的来源（当前全部来源均有，保留兜底机制防未来新增来源）
const NO_LOGO = new Set<string>()
const CARD_SOURCES = new Set(["unionpay", "visa", "mastercard", "jcb"])
const FX_SOURCES = new Set(["wise"])
// 本地 logo 文件扩展名（默认 svg；PNG 版用于源文件本身是 PNG 的情况）
const LOGO_EXT: Record<string, string> = {
	cfets: "png",
	hkma: "png",
	hkab: "png",
	ocbc: "png",
	ocbchk: "png",
}

export function SourceIcon({
	source,
	size = 16,
}: {
	source: string
	size?: number
}) {
	const dark = useTheme().palette.mode == "dark"
	// 本地 SVG 缺失/加载失败（如后端新增来源暂无 logo）时降级为类型图标
	const [broken, setBroken] = React.useState(false)
	if (broken || NO_LOGO.has(source)) {
		const Icon = CARD_SOURCES.has(source)
			? CreditCardIcon
			: FX_SOURCES.has(source)
				? CurrencyExchangeIcon
				: AccountBalanceIcon
		return (
			<Icon
				sx={{ fontSize: size, flexShrink: 0, opacity: 0.85 }}
				color="action"
			/>
		)
	}
	return (
		<Box
			sx={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				// 深色模式下白底圆角，保证深色字标 logo（wise/visa/hsbc 等）可读
				...(dark
					? {
							width: size + 6,
							height: size + 6,
							bgcolor: "#ffffff",
							borderRadius: "4px",
							boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
					  }
					: {}),
				flexShrink: 0,
			}}
		>
			<img
				src={`/bank-logos/${source}.${LOGO_EXT[source] ?? "svg"}`}
				alt=""
				loading="lazy"
				onError={() => setBroken(true)}
				style={{
					display: "block",
					borderRadius: 4,
					width: size,
					height: size,
					// 保持 SVG 原始纵横比（如 ECB/HSBC 横向徽章），避免方形拉伸
					objectFit: "contain",
				}}
			/>
		</Box>
	)
}
