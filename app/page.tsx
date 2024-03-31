"use sever";

import Index from "@/componets/index";
import FXRates from "@/lib/fxrate/src/client";

import packageJson from "../package.json";
import buildId from "next-build-id";

const FXRate = new FXRates(new URL("https://fxrate.186526.eu.org/v1/jsonrpc"));

async function showCurrencyAllRates() {
	const Info = await FXRate.info();

	const sources: string[] = (Info as any).sources;

	const answer: { [source: string]: string[] } = {};

	FXRate.batch();

	for (let k of sources) {
		const x = k;
		FXRate.listCurrencies(x, (resp) => {
			answer[x] = resp.currency;
		});
	}

	await FXRate.done();

	return answer;
}

export default async function Home() {
	return (
		<main style={{ width: "100%" }}>
			<Index currencies={await showCurrencyAllRates()}></Index>
			<code>{((await FXRate.info()) as any).version}</code>
			<br />
			<code>
				{packageJson.name}/{await buildId({ dir: __dirname, describe: true })}
			</code>
		</main>
	);
}
