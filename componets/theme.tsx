"use client"
import * as React from "react"

import {
	alpha,
	createTheme,
	ThemeProvider as MuiThemeProvider,
	type Shadows,
} from "@mui/material/styles"
import CssBaseline from "@mui/material/CssBaseline"

export type ThemeMode = "light" | "dark"

const ThemeModeContext = React.createContext<{
	mode: ThemeMode
	toggle: () => void
}>({
	mode: "light",
	toggle: () => undefined,
})

export function useThemeMode() {
	return React.useContext(ThemeModeContext)
}

const THEME_KEY = "fxrate-theme"

// Sunoaki 设计语言（源自 sunoaki.net 自研 VitePress 主题，CSS 实测提取）：
// 暖色纸张感（浅色 bg #fbfaf7 / 暗色 slate #10171c）+ 深青绿 accent（#2f6f73 / #8fc3c6），
// 卡片 14px 圆角 + 1px 暖沙边框 + 大而软的阴影，按钮全圆 pill，品牌 soft 底色做状态层
const sunoakiLight = {
	primary: "#2f6f73",
	onPrimary: "#ffffff",
	primaryLight: "#3f8589",
	primaryDark: "#17494d",
	brandSoft: "rgba(47,111,115,0.14)",
	bg: "#fbfaf7",
	surface: "#ffffff",
	surfaceMuted: "#f3f0ea",
	text: "#172026",
	muted: "#66727a",
	border: "#e5dfd5",
	error: "#a53f3f",
	onError: "#ffffff",
}

const sunoakiDark = {
	primary: "#8fc3c6",
	onPrimary: "#10171c",
	primaryLight: "#a7d5d7",
	primaryDark: "#6aa5a7",
	brandSoft: "rgba(143,195,198,0.14)",
	bg: "#10171c",
	surface: "#1c2830",
	surfaceMuted: "#1e2a33",
	text: "#e7ecef",
	muted: "#a6b0b6",
	border: "#334044",
	error: "#f29b9b",
	onError: "#10171c",
}

// 软阴影阶梯：卡片 ~0 2px 8px，悬浮 ~0 4px 12px，最高 ~0 18px 60px（站点实测值）
const buildShadows = (dark: boolean): Shadows => {
	const base = (low: number, high: number) =>
		dark ? `rgba(0,0,0,${high})` : `rgba(23,32,38,${low})`
	const levels = [
		"none",
		`0 2px 8px ${base(0.04, 0.15)}`,
		`0 4px 12px ${base(0.05, 0.17)}`,
		`0 8px 20px ${base(0.06, 0.19)}`,
		`0 12px 32px ${base(0.07, 0.21)}`,
		`0 18px 60px ${base(0.07, 0.24)}`,
	]
	return [...levels, ...Array(19).fill(levels[5])] as Shadows
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [mode, setMode] = React.useState<ThemeMode>("light")

	// 读档完成前禁止写入：避免挂载时用默认 light 覆盖用户 localStorage 存档
	const loadedRef = React.useRef(false)

	// 挂载后读取偏好，避免 SSR 首帧与客户端暗色偏好不一致导致 hydration 警告
	React.useEffect(() => {
		const stored = localStorage.getItem(THEME_KEY)
		if (stored == "light" || stored == "dark") {
			setMode(stored)
		} else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
			setMode("dark")
		}
	}, [])

	React.useEffect(() => {
		if (!loadedRef.current) return
		localStorage.setItem(THEME_KEY, mode)
	}, [mode])

	// 标记读档完成（须声明在持久化 effect 之后：首轮渲染持久化先跳过，state 更新后再写）
	React.useEffect(() => {
		loadedRef.current = true
	}, [])

	const theme = React.useMemo(
		() => {
			const dark = mode == "dark"
			const c = dark ? sunoakiDark : sunoakiLight
			return createTheme({
				palette: {
					mode,
					primary: {
						main: c.primary,
						contrastText: c.onPrimary,
						light: c.primaryLight,
						dark: c.primaryDark,
					},
					error: {
						main: c.error,
						contrastText: c.onError,
					},
					background: {
						default: c.bg,
						paper: c.surface,
					},
					text: {
						primary: c.text,
						secondary: c.muted,
						disabled: dark
							? "rgba(231,236,239,0.5)"
							: "rgba(23,32,38,0.38)",
					},
					divider: c.border,
					action: {
						hoverOpacity: 0.06,
						selectedOpacity: 0.1,
						disabledOpacity: 0.38,
					},
					brandSoft: c.brandSoft,
					surfaceMuted: c.surfaceMuted,
				},
				shadows: buildShadows(dark),
				shape: {
					borderRadius: 14,
				},
				typography: {
					fontFamily: "inherit",
					h6: {
						fontSize: 20,
						fontWeight: 600,
						lineHeight: 1.4,
					},
					subtitle2: {
						fontSize: 14,
						fontWeight: 600,
						lineHeight: 1.43,
					},
					caption: {
						fontSize: 12,
						fontWeight: 400,
						lineHeight: 1.66,
						letterSpacing: 0.02,
					},
					button: {
						fontSize: 14,
						fontWeight: 600,
						lineHeight: 1.43,
						textTransform: "none",
					},
				},
				components: {
					MuiCssBaseline: {
						styleOverrides: {
							body: {
								transition: "background-color 0.2s ease",
							},
						},
					},
					MuiPaper: {
						styleOverrides: {
							root: {
								backgroundImage: "none",
								transition:
									"box-shadow 0.2s ease, background-color 0.2s ease, border-color 0.2s ease",
							},
						},
					},
					MuiButton: {
						defaultProps: {
							disableElevation: true,
						},
						styleOverrides: {
							root: {
								textTransform: "none",
								borderRadius: "9999px",
								fontWeight: 600,
							},
							// 站点 primary 按钮：品牌深色底，hover 变主色
							contained: ({ theme }) => ({
								backgroundColor: theme.palette.primary.dark,
								"&:hover": {
									backgroundColor: theme.palette.primary.main,
								},
							}),
							// 站点 secondary 按钮：透明底 + 暖沙描边，hover 描边变品牌色
							outlined: ({ theme }) => ({
								borderColor: theme.palette.divider,
								color: theme.palette.text.primary,
								"&:hover": {
									borderColor: theme.palette.primary.main,
									backgroundColor: theme.palette.brandSoft,
									color: theme.palette.primary.dark,
								},
							}),
						},
						variants: [
							{
								props: { variant: "tonal" },
								style: ({ theme }) => ({
									backgroundColor: theme.palette.brandSoft,
									color: theme.palette.primary.dark,
									"&:hover": {
										backgroundColor: alpha(
											theme.palette.primary.main,
											0.22
										),
									},
								}),
							},
						],
					},
					MuiTableCell: {
						styleOverrides: {
							root: ({ theme }) => ({
								fontVariantNumeric: "tabular-nums",
								borderBottom: `1px solid ${theme.palette.divider}`,
							}),
							head: {
								fontWeight: 600,
							},
						},
					},
					MuiTableHead: {
						styleOverrides: {
							root: {
								"& .MuiTableCell-head": {
									backgroundColor: c.surfaceMuted,
									color: c.muted,
								},
							},
						},
					},
					MuiTabs: {
						styleOverrides: {
							indicator: {
								height: 2,
							},
						},
					},
					MuiTab: {
						styleOverrides: {
							root: {
								textTransform: "none",
								fontWeight: 600,
							},
						},
					},
					MuiTooltip: {
						styleOverrides: {
							tooltip: {
								fontVariantNumeric: "tabular-nums",
								// 站点 inverse 惯例：浅色用深墨底，暗色用浅墨底
								backgroundColor: dark ? "#e7ecef" : "#172026",
								color: dark ? "#10171c" : "#fbfaf7",
								fontSize: 12,
								borderRadius: 8,
								padding: "6px 10px",
							},
						},
					},
					MuiPopover: {
						styleOverrides: {
							paper: ({ theme }) => ({
								backgroundColor: theme.palette.background.paper,
								border: `1px solid ${theme.palette.divider}`,
								borderRadius: 14,
								boxShadow: theme.shadows[3],
							}),
						},
					},
					MuiMenu: {
						styleOverrides: {
							paper: ({ theme }) => ({
								backgroundColor: theme.palette.background.paper,
								border: `1px solid ${theme.palette.divider}`,
								borderRadius: 14,
								boxShadow: theme.shadows[3],
							}),
						},
					},
					MuiDialog: {
						styleOverrides: {
							paper: ({ theme }) => ({
								backgroundColor: theme.palette.background.paper,
								borderRadius: 22,
								boxShadow: theme.shadows[5],
							}),
						},
					},
					MuiToggleButton: {
						styleOverrides: {
							root: {
								textTransform: "none",
								fontWeight: 600,
							},
						},
					},
					MuiLinearProgress: {
						styleOverrides: {
							root: {
								backgroundColor: c.surfaceMuted,
							},
						},
					},
					MuiOutlinedInput: {
						styleOverrides: {
							root: {
								"&:hover .MuiOutlinedInput-notchedOutline": {
									borderColor: c.primary,
								},
							},
						},
					},
				},
			})
		},
		[mode]
	)

	const value = React.useMemo(
		() => ({
			mode,
			toggle: () => setMode((m) => (m == "light" ? "dark" : "light")),
		}),
		[mode]
	)

	return (
		<ThemeModeContext.Provider value={value}>
			<MuiThemeProvider theme={theme}>
				<CssBaseline />
				{children}
			</MuiThemeProvider>
		</ThemeModeContext.Provider>
	)
}
