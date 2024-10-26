"use sever";

import Index from "@/componets/index";

import packageJson from "../package.json";
import buildId from "next-build-id";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

import {
	showCurrencyAllRates,
	getCurrenciesDetails,
	FXRate,
} from "@/componets/tools";

export default async function Home({
	searchParams,
}: {
	searchParams: Promise<{ [key: string]: string }>;
}) {
	const result = await getCurrenciesDetails(
		await showCurrencyAllRates(),
		(await searchParams)["to"] ?? "USD",
		(await searchParams)["from"] ?? "CNY"
	);

	return (
		<main style={{ width: "100%" }}>
			<Suspense>
				<Index
					currencies={await showCurrencyAllRates()}
					defaultResult={result}
				></Index>
			</Suspense>
			<code>{((await FXRate.info()) as any).version}</code>
			<br />
			<code>
				{packageJson.name}/{await buildId({ dir: __dirname, describe: true })}
			</code>
		</main>
	);
}
