import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "FXRate-web",
	description: "Yet another fx rates helper | by @real186526.",
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
					src="https://analytics.186526.net/script.js"
					data-website-id="8d0c94df-838f-45ac-9ea9-218603f061a4"
				></script>
			</head>
			<body className={inter.className}>{children}</body>
		</html>
	);
}
