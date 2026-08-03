import Index from "@/componets/index";
import {
	showCurrencyAllRates,
	getCurrenciesDetails,
	FXRate,
	withSSRTimeout,
} from "@/componets/tools";
import type { infoResponse } from "@/lib/fxrate/src/client";

import packageJson from "../package.json";
import buildId from "next-build-id";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Suspense } from "react";

// SSR 预取：首屏直接带默认货币对数据，客户端不再白屏等请求；超时自动降级为 CSR
export default async function Home({
	searchParams,
}: {
	searchParams: Promise<{ from?: string; to?: string; amount?: string }>;
}) {
	// Turbopack 下 __dirname 不可靠，用 import.meta.url 推导（next-build-id 需要真实目录）
	const dir = dirname(fileURLToPath(import.meta.url));
	const build = await buildId({ dir, describe: true });

	const params = await searchParams;
	const from = params.from ?? "CNY";
	const to = params.to ?? "USD";
	const amount = Number(params.amount) || 100;

	let initialCurrencies: { [source: string]: string[] } | null = null;
	let initialResult: Awaited<
		ReturnType<typeof getCurrenciesDetails>
	> | null = null;
	let initialBackendVersion = "";

	try {
		// 注意：info() 必须在 showCurrencyAllRates 之后串行调用——
		// 后者内部会开启 batch，并行的 info() 会被吞进批量队列拿不到结果
		const cur = await withSSRTimeout(showCurrencyAllRates());
		if (cur) {
			initialCurrencies = cur;
			const info = await withSSRTimeout(
				Promise.resolve(FXRate.info())
			);
			if (info) {
				initialBackendVersion = (info as infoResponse).version;
			}
			initialResult = await withSSRTimeout(
				getCurrenciesDetails(cur, to, from)
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
					initialResult={
						initialResult
							? initialResult.map((r) => ({
									...r,
									// 防御后端个别源返回无效日期导致 toISOString 抛错
									updated: Number.isNaN(r.updated.getTime())
										? new Date().toISOString()
										: r.updated.toISOString(),
							  }))
							: null
					}
					initialBackendVersion={initialBackendVersion}
				/>
			</Suspense>
		</main>
	);
}
