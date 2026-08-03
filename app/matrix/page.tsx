import Index from "@/componets/index";
import {
	showCurrencyAllRates,
	getRatesMatrix,
	withSSRTimeout,
} from "@/componets/tools";

import packageJson from "../../package.json";
import buildId from "next-build-id";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Suspense } from "react";

// SSR 预取：矩阵首屏直接带基准货币与矩阵数据；超时自动降级为 CSR
export default async function MatrixPage({
	searchParams,
}: {
	searchParams: Promise<{ from?: string; amount?: string }>;
}) {
	// Turbopack 下 __dirname 不可靠，用 import.meta.url 推导（next-build-id 需要真实目录）
	const dir = dirname(fileURLToPath(import.meta.url));
	const build = await buildId({ dir, describe: true });

	const params = await searchParams;
	const from = params.from ?? "CNY";
	const amount = Number(params.amount) || 100;

	let initialCurrencies: { [source: string]: string[] } | null = null;
	let initialMatrix: Awaited<
		ReturnType<typeof getRatesMatrix>
	> | null = null;

	try {
		initialCurrencies = await withSSRTimeout(showCurrencyAllRates());
		if (initialCurrencies) {
			initialMatrix = await withSSRTimeout(
				getRatesMatrix(initialCurrencies, from, { amount })
			);
		}
	} catch (e) {
		console.error("SSR 预取失败，降级为客户端加载:", e);
	}

	return (
		<main style={{ width: "100%" }}>
			<Suspense>
				<Index
					buildId={build}
					buildTime={process.env.FXBUILD_TIME ?? ""}
					version={packageJson.version}
					initialCurrencies={initialCurrencies}
					initialMatrix={initialMatrix}
				/>
			</Suspense>
		</main>
	);
}
