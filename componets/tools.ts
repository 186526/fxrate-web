import { FXListProps } from "@/componets/fxlistgrid";
import FXRates from "@/lib/fxrate/src/client";

export const FXRate = new FXRates(new URL("https://fxrate.186526.dev/v1/jsonrpc"));

export async function showCurrencyAllRates() {
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

export async function getCurrenciesDetails(
	currencies: { [source: string]: string[] },
	toCurrency: string,
	fromCurrency: string,
	setResult?: (result: FXListProps[]) => void
): Promise<FXListProps[]> {
	const data: { [source: string]: FXListProps } = {};
	try {
		for (let k in currencies) {
			FXRate.batch();

			const x = k;
			if (
				currencies[x].includes(toCurrency) &&
				currencies[x].includes(fromCurrency)
			) {
				console.log(`Getting ${x}...`);

				FXRate.getFXRate(
					x,
					toCurrency,
					fromCurrency,
					(resp) => {
						if (typeof resp != "object") {
							return;
						}

						data[x] = data[x] ?? {
							name: x,
							updated: resp.updated,
							type: {},
						};

						data[x].type.middle = resp.middle;

						data[x].type.sell = {
							cash: resp.cash,
							remit: resp.remit,
						};
					},
					"all",
					5
				);

				FXRate.getFXRate(
					x,
					fromCurrency,
					toCurrency,
					(resp) => {
						if (typeof resp != "object") {
							return;
						}

						data[x] = data[x] ?? {
							name: x,
							updated: resp.updated,
							type: {},
						};

						data[x].type.buy = {
							cash: resp.cash,
							remit: resp.remit,
						};
					},
					"all",
					5,
					100,
					0,
					true
				);
			}

			await FXRate.done()
				.catch((e) => {
					console.error("Error geting currency details:", e);
				})
				.then(() => {
					if (setResult) setResult(Object.values(data));
				});
		}
	} catch (error) {
		console.error("Error geting currency details:", error);
	}
	return Object.values(data);
}
