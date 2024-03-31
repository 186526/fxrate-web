"use sever";

import Index from "@/componets/index";

import FXRates from "@/lib/fxrate/src/client";

const FXRate = new FXRates(new URL("https://fxrate.186526.eu.org/v1/jsonrpc"));

async function showCurrencyAllRates() {
	const Info = await FXRate.info();

	const sources: string[] = (Info as any).sources;

	const answer: { [source: string]: string[] } = {};

	FXRate.batch();

	for (let x of sources) {
		FXRate.listCurrencies(
			x,
			((x) => {
				return (resp) => {
					answer[x] = resp.currency;
				};
			})(x)
		);
	}

	await FXRate.done();

	return answer;
}

export default async function Home() {
	return (
		<main style={{ width: "100%" }}>
			<Index currencies={await showCurrencyAllRates()}></Index>
		</main>
	);
}
