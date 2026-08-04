"use client"
import * as React from "react"

import Autocomplete, {
	AutocompleteRenderInputParams,
} from "@mui/material/Autocomplete"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import TextField from "@mui/material/TextField"
import IconButton from "@mui/material/IconButton"
import Tooltip from "@mui/material/Tooltip"
import SwapHorizIcon from "@mui/icons-material/SwapHoriz"
import SwapVertIcon from "@mui/icons-material/SwapVert"

import { code } from "currency-codes-ts"
import { getAllCountries } from "country-locale-map"

import { currencyEmoji } from "@/componets/sourceIcon"

interface CurrencyOption {
	code: string
	currency: string
	label: string
	name: string
	emoji: string
}

const countries = getAllCountries()
	.sort()
	.filter(
		(x) =>
			!(
				(x.currency == "USD" && x.alpha2 != "US") ||
				(x.currency == "EUR" && x.alpha2 != "EU") ||
				(x.currency == "GBP" && x.alpha2 != "GB")
			)
	)
	.map((x) => {
		return {
			alpha2: x.alpha2,
			name: x.name,
			currency: x.currency,
			emoji: x.emoji,
		}
	})

countries.push({
	alpha2: "EU",
	name: "European Union",
	currency: "EUR",
	emoji: "🇪🇺",
})

countries.push({
	alpha2: "CN",
	name: "China",
	currency: "CNH",
	emoji: "🇨🇳",
})

const mapCurrency2Country = (currency: string) =>
	countries.find((x) => x.currency === currency)

export default function CurrencyChooser({
	currencies,
	from,
	to,
	amount,
	onFromChange,
	onToChange,
	onSwap,
	onAmountChange,
	showTo = true,
	reverse = false,
	onReverseChange,
	fromLabel = "基准货币",
	amountLabel,
}: {
	currencies: string[]
	from: string
	to: string
	amount: number
	onFromChange: (v: string) => void
	onToChange: (v: string) => void
	onSwap: () => void
	onAmountChange: (v: number) => void
	showTo?: boolean
	reverse?: boolean
	onReverseChange?: () => void
	fromLabel?: string
	// 金额输入框标签覆盖（如矩阵反向时说明金额按各列货币计）
	amountLabel?: string
}) {
	const options = React.useMemo(() => {
		const map = new Map<string, CurrencyOption>()
		for (const currency of currencies) {
			if (map.has(currency)) continue
			const option =
				currency == "CNH"
					? { code: "CNH", currency: "Yuan Renmenbi (Oversea)" }
					: code(currency)
			const country = mapCurrency2Country(currency)
			if (!country) continue
			map.set(currency, {
				code: option?.code ?? currency,
				currency: option?.currency ?? currency,
				label: `${currencyEmoji(currency) ?? country.emoji} ${option?.code ?? currency}`,
				name: country.name,
				emoji: currencyEmoji(currency) ?? country.emoji,
			})
		}
		return Array.from(map.values())
	}, [currencies])

	const fromOption = options.find((o) => o.code == from) ?? null
	const toOption = options.find((o) => o.code == to) ?? null

	const [amountText, setAmountText] = React.useState(String(amount))
	// 记录最后一次已同步到父组件的值：外部改动 amount（如 URL 变化）时刷新文本，
	// 用户自己输入时不受影响（输入过程 amount 可能尚未同步）
	const syncedAmountRef = React.useRef(amount)

	React.useEffect(() => {
		if (syncedAmountRef.current != amount) {
			syncedAmountRef.current = amount
			setAmountText(String(amount))
		}
	}, [amount])

	const handleAmountChange = (text: string) => {
		setAmountText(text)
		const n = Number(text)
		if (!Number.isNaN(n) && n > 0) {
			syncedAmountRef.current = n
			onAmountChange(n)
		}
	}

	// 矩阵反向（showTo=false）时金额按各列货币计，而非基准货币 from
	const amountLabelText =
		amountLabel ??
		`金额 (${reverse ? (showTo ? from : "各货币") : to})`
	const unitToggleText = reverse
		? showTo
			? `按基准货币 ${from} 计`
			: "按各货币计"
		: showTo
			? `按目标货币 ${to} 计`
			: `按基准货币 ${from} 计`

	function renderOption(
		props: React.HTMLAttributes<HTMLLIElement> & { key?: React.Key | null },
		option: CurrencyOption
	) {
		// React 19 禁止把含 key 的 props 对象展开进 JSX（会 console.error 警告）：
		// MUI renderOption 的 props 自带 key，须先解构出来显式传给根元素
		const { key, ...rest } = props
		return (
			<Box
				component="li"
				key={key}
				sx={{ "& > img": { mr: 2, flexShrink: 0 } }}
				{...rest}
			>
				{option.emoji} {option.name} - {option.currency} ({option.code})
			</Box>
		)
	}

	function renderInput(label: string) {
		const renderInput = (params: AutocompleteRenderInputParams) => (
			<TextField
				{...params}
				label={label}
				size="small"
				inputProps={{
					...params.inputProps,
					autoComplete: "new-password", // disable autocomplete and autofill
				}}
			/>
		)
		return renderInput
	}

	return (
		<Paper
			elevation={1}
			sx={{
				display: { xs: "grid", sm: "flex" },
				gridTemplateColumns: {
					xs: showTo ? "1fr auto 1fr" : "1fr",
					sm: "none",
				},
				alignItems: "center",
				flexWrap: "wrap",
				gap: { xs: 1.25, sm: 1.5 },
				p: { xs: 1.25, sm: 1.5 },
				borderRadius: 1,
				border: "1px solid",
				borderColor: "divider",
			}}
		>
			<Autocomplete
				id="from-currency"
				options={options}
				autoHighlight
				clearOnBlur
				selectOnFocus
				value={fromOption}
				isOptionEqualToValue={(o, v) => o.code == v.code}
				onChange={(_, value) => {
					if (value) onFromChange(value.code)
				}}
				getOptionLabel={(option) => option?.label ?? ""}
				renderOption={renderOption}
				renderInput={renderInput(fromLabel)}
				sx={{ flex: "1 1 180px", minWidth: 0 }}
			></Autocomplete>

			{showTo && (
				<Tooltip title="交换货币对">
					<IconButton
						aria-label="exchange"
						size="small"
						onClick={onSwap}
						sx={{
							flexShrink: 0,
							width: { xs: 40, sm: 36 },
							height: { xs: 40, sm: 36 },
							borderRadius: "50%",
							bgcolor: "brandSoft",
							color: "primary.main",
							border: "1px solid",
							borderColor: "divider",
							transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
							"&:hover, &:active": {
								bgcolor: "primary.main",
								color: "primary.contrastText",
								borderColor: "primary.main",
								transform: "rotate(180deg)",
							},
						}}
					>
						<SwapHorizIcon fontSize="small" />
					</IconButton>
				</Tooltip>
			)}

			{showTo && (
				<Autocomplete
					id="to-currency"
					options={options}
					autoHighlight
					clearOnBlur
					selectOnFocus
					value={toOption}
					isOptionEqualToValue={(o, v) => o.code == v.code}
					onChange={(_, value) => {
						if (value) onToChange(value.code)
					}}
					getOptionLabel={(option) => option?.label ?? ""}
					renderOption={renderOption}
					renderInput={renderInput("目标货币")}
					sx={{ flex: "1 1 180px", minWidth: 0 }}
				></Autocomplete>
			)}

			<Box
				sx={{
					display: "flex",
					alignItems: "center",
					gap: 0.5,
					width: { xs: "100%", sm: 190 },
					flexShrink: 0,
					gridColumn: {
						xs: showTo ? "1 / -1" : "auto",
						sm: "auto",
					},
				}}
			>
				<TextField
					label={amountLabelText}
					type="number"
					size="small"
					value={amountText}
					onChange={(e) => handleAmountChange(e.target.value)}
					inputProps={{
						min: 1,
						step: 100,
						style: { textAlign: "right" },
					}}
					sx={{ flex: 1, minWidth: 0 }}
				/>
				<Tooltip title={`切换金额单位：${unitToggleText}`}>
					<IconButton
						aria-label="切换金额单位"
						size="small"
						onClick={onReverseChange}
						sx={{
							flexShrink: 0,
							borderRadius: "50%",
							bgcolor: "brandSoft",
							color: "primary.main",
							border: "1px solid",
							borderColor: "divider",
							"&:hover, &:active": {
								bgcolor: "primary.main",
								color: "primary.contrastText",
								borderColor: "primary.main",
							},
						}}
					>
						<SwapVertIcon fontSize="small" />
					</IconButton>
				</Tooltip>
			</Box>
		</Paper>
	)
}
