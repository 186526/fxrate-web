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

	function renderOption(
		props: React.HTMLAttributes<HTMLLIElement>,
		option: CurrencyOption
	) {
		return (
			<Box
				component="li"
				sx={{ "& > img": { mr: 2, flexShrink: 0 } }}
				{...props}
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
				gap: 1,
				p: { xs: 1, sm: 1.5 },
				borderRadius: 1,
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
				renderInput={renderInput("基准货币")}
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
							// 触控目标 ≥40px，移动端更易点按
							width: { xs: 40, sm: 36 },
							height: { xs: 40, sm: 36 },
							border: 1,
							borderColor: "divider",
							"&:hover": {
								bgcolor: "primary.main",
								color: "primary.contrastText",
								borderColor: "primary.main",
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

			<TextField
				label="金额"
				type="number"
				size="small"
				value={amountText}
				onChange={(e) => handleAmountChange(e.target.value)}
				inputProps={{ min: 1, step: 100, style: { textAlign: "right" } }}
				sx={{
					width: { xs: "100%", sm: 140 },
					flexShrink: 0,
					gridColumn: {
						xs: showTo ? "1 / -1" : "auto",
						sm: "auto",
					},
				}}
			/>
		</Paper>
	)
}
