"use client"
import * as React from "react"

import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Popover from "@mui/material/Popover"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"

import { SourceIcon } from "./sourceIcon"

export interface BestPriceSource {
	source: string
	// 来源显示名（已含中文名与原始代码）
	label: string
}

// 「参与最优价高亮」弹层：单对视图与矩阵视图共用同一实现。
// 全选与恢复默认都会关闭弹层——两者都是整体操作，留在弹层内没有后续动作。
// 单对视图每次打开都清空搜索框；矩阵视图保留上次输入的过滤词（原有行为）。
export default function BestPricePickerPopover({
	anchor,
	onClose,
	sources,
	excluded,
	clearSearchOnOpen = false,
	onToggle,
	onSelectAll,
	onReset,
}: {
	anchor: HTMLElement | null
	onClose: () => void
	sources: BestPriceSource[]
	excluded: Set<string>
	clearSearchOnOpen?: boolean
	onToggle: (source: string) => void
	onSelectAll: () => void
	onReset: () => void
}) {
	const [search, setSearch] = React.useState("")
	// 打开瞬间清空：在渲染期比较上次的 anchor，避免多一帧显示旧过滤结果
	const [lastAnchor, setLastAnchor] = React.useState(anchor)
	if (anchor != lastAnchor) {
		setLastAnchor(anchor)
		if (anchor && clearSearchOnOpen && search != "") setSearch("")
	}
	const filtered = React.useMemo(
		() =>
			sources.filter((s) =>
				s.label.toLowerCase().includes(search.trim().toLowerCase())
			),
		[sources, search]
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
					参与最优价高亮的来源
				</Typography>
				<TextField
					size="small"
					placeholder="搜索银行..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					sx={{ mb: 1 }}
				/>
				{filtered.map((s) => (
					<FormControlLabel
						key={s.source}
						control={
							<Checkbox
								size="small"
								checked={!excluded.has(s.source)}
								onChange={() => onToggle(s.source)}
							/>
						}
						label={
							<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
								<SourceIcon source={s.source} size={14} />
								{s.label}
							</Box>
						}
						componentsProps={{ typography: { variant: "body2" } }}
					/>
				))}
				<Box
					sx={{
						borderTop: 1,
						borderColor: "divider",
						mt: 1,
						pt: 1,
						display: "flex",
						alignItems: "center",
					}}
				>
					<Button
						size="small"
						onClick={() => {
							onSelectAll()
							onClose()
						}}
					>
						全选
					</Button>
					<Box sx={{ flexGrow: 1 }} />
					<Button
						size="small"
						variant="tonal"
						onClick={() => {
							onReset()
							onClose()
						}}
					>
						恢复默认（仅银行）
					</Button>
				</Box>
			</Box>
		</Popover>
	)
}
