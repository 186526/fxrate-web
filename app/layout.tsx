import type { Metadata } from "next"
import { headers } from "next/headers"
import Script from "next/script"
import { Inter } from "next/font/google"
import "./globals.css"
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter"
import { ThemeProvider } from "@/componets/theme"
import { themeInitScript } from "@/componets/theme-init"
import { WebVitals } from "@/componets/web-vitals"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
	title: "FXRate-web",
	description: "外汇牌价查询 · 多家银行/平台汇率对比 | by @real186526",
}

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	// Phase 4B 任务 13：预绘制主题初始化。proxy 按 Next 16 文档模式生成每请求
	// 唯一 nonce 并通过请求头 x-nonce 注入；beforeInteractive 脚本在 hydration / 首帧
	// 绘制前把主题写入 <html data-theme>（消除 dark-mode 背景白闪）。MUI 组件的完整
	// 暗色 palette 仍在 hydration 后由 ThemeProvider 校正。headers() 是动态 API，
	// 布局因此动态渲染——与 nonce-based CSP 的要求一致（每次请求的 nonce 都是新的）。
	const nonce = (await headers()).get("x-nonce") ?? undefined

	return (
		<html lang="zh-CN" suppressHydrationWarning>
			<head>
				<script
					async
					defer
					src="https://analytics.real186526.cn/script.js"
					data-website-id="ca55ec9e-d5f0-4c73-8abd-f7e2272225ed"
				></script>
				<Script
					id="theme-init"
					strategy="beforeInteractive"
					nonce={nonce}
					dangerouslySetInnerHTML={{ __html: themeInitScript }}
				/>
			</head>
			<body className={inter.className}>
				<WebVitals />
				<AppRouterCacheProvider>
					<ThemeProvider>{children}</ThemeProvider>
				</AppRouterCacheProvider>
			</body>
		</html>
	)
}
