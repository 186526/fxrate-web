"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Popover from "@mui/material/Popover"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"

import { currencyEmoji } from "../sourceIcon"

// 「显示货币」弹层：勾选矩阵展示的货币列，支持搜索与恢复默认常用币种。
export default function CurrencyPickerPopover({
	anchor,
	onClose,
	allCurrencies,
	enabled,
	onToggle,
	onReset,
}: {
	anchor: HTMLElement | null
	onClose: () => void
	allCurrencies: string[]
	// null 表示未自定义，使用默认常用币种
	enabled: string[] | null
	onToggle: (currency: string) => void
	onReset: () => void
}) {
	const [search, setSearch] = React.useState("")
	const filtered = React.useMemo(
		() =>
			allCurrencies.filter((c) =>
				c.toLowerCase().includes(search.trim().toLowerCase())
			),
		[allCurrencies, search]
	)

	return (
		<Popover
			open={Boolean(anchor)}
			anchorEl={anchor}
			onClose={onClose}
			anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
			transformOrigin={{ vertical: "top", horizontal: "right" }}
		>
			<Box
				sx={{
					p: 1.5,
					width: { xs: 280, sm: 320 },
					maxHeight: 420,
					overflow: "auto",
				}}
			>
				<Typography variant="subtitle2" sx={{ mb: 1 }}>
					选择显示的货币
				</Typography>
				<TextField
					size="small"
					placeholder="搜索货币..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					sx={{ mb: 1 }}
				/>
				<Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.5 }}>
					{filtered.map((c) => (
						<FormControlLabel
							key={c}
							control={
								<Checkbox
									size="small"
									checked={(enabled ?? allCurrencies).includes(c)}
									onChange={() => onToggle(c)}
								/>
							}
							label={`${currencyEmoji(c) ?? ""} ${c}`}
							componentsProps={{ typography: { variant: "body2" } }}
						/>
					))}
				</Box>
				<Box
					sx={{
						borderTop: 1,
						borderColor: "divider",
						mt: 1,
						pt: 1,
						display: "flex",
						justifyContent: "flex-end",
					}}
				>
					<Button
						size="small"
						variant="tonal"
						onClick={() => {
							onReset()
							onClose()
						}}
					>
						恢复默认（常用 12 币）
					</Button>
				</Box>
			</Box>
		</Popover>
	)
}
