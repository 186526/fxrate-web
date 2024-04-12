"use client";
import CurrencyChooser from "./currencyChooser";
import { useState, useEffect } from "react";
import FXListGrid, { FXListProps } from "./fxlistgrid";

import FXRates from "@/lib/fxrate/src/client";

export default function Index({
	currencies,
}: {
	currencies: { [source: string]: string[] };
}) {
	const [fromCurrency, setFromCurrency] = useState<string>("USD");
	const [toCurrency, setToCurrency] = useState<string>("CNY");

	const [reverse, setReverse] = useState<boolean>(false);

	const [isLoading, setIsLoading] = useState<boolean>(false);

	const [result, setResult] = useState<FXListProps[]>([]);

	useEffect(() => {
		const fetchData = async () => {
			const data: { [source: string]: FXListProps } = {};
			setIsLoading(true);
			try {
				for (let k in currencies) {
					const FXRate = new FXRates(
						new URL("https://fxrate.186526.eu.org/v1/jsonrpc")
					);

					FXRate.batch();

					const x = k;
					if (
						currencies[x].includes(fromCurrency) &&
						currencies[x].includes(toCurrency)
					) {
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

					FXRate.done()
						.catch((e) => {
							console.error("Error geting currency details:", e);
						})
						.then(() => {
							setResult(Object.values(data));
						});
				}

				setIsLoading(false);
			} catch (error) {
				console.error("Error geting currency details:", error);
			}
		};

		fetchData();
	}, [fromCurrency, toCurrency, currencies]);

	return (
		<>
			<CurrencyChooser
				currencies={
					Array.from(
						new Set(Object.values(currencies).flat(Infinity))
					) as string[]
				}
				fromCurrency={fromCurrency}
				toCurrency={toCurrency}
				setFromCurrency={setFromCurrency}
				setToCurrency={setToCurrency}
				reverse={reverse}
				setReverse={setReverse}
				isLoading={isLoading}
			></CurrencyChooser>
			{(() => {
				if (!isLoading) {
					return <FXListGrid props={result}></FXListGrid>;
				}
			})()}
		</>
	);
}
