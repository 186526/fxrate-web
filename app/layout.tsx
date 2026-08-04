import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter"
import { ThemeProvider } from "@/componets/theme"
import { WebVitals } from "@/componets/web-vitals"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
	title: "FXRate-web",
	description: "外汇牌价查询 · 多家银行/平台汇率对比 | by @real186526",
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html lang="zh-CN">
			<head>
				<script
					async
					defer
					src="https://analytics.real186526.cn/script.js"
					data-website-id="ca55ec9e-d5f0-4c73-8abd-f7e2272225ed"
				></script>
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
