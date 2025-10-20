import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "FXRate-web",
	description: "Yet another FX Rates helper | by @real186526",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<head>
				<script
					async
					defer
					src="https://analytics.real186526.cn/script.js"
					data-website-id="ca55ec9e-d5f0-4c73-8abd-f7e2272225ed"
				></script>
			</head>
			<body className={inter.className}>{children}</body>
		</html>
	);
}
