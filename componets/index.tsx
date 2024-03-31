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
		const FXRate = new FXRates(
			new URL("https://fxrate.186526.eu.org/v1/jsonrpc")
		);

		const fetchData = async () => {
			const data: { [source: string]: FXListProps } = {};
			setIsLoading(true);
			try {
				FXRate.batch();

				for (let k in currencies) {
					const x = k;
					if (currencies[x].includes(fromCurrency)) {
						FXRate.listFXRates(
							x,
							fromCurrency,
							(resp) => {
								if (resp[toCurrency]) {
									data[x] = data[x] ?? {
										name: x,
										updated: resp[toCurrency].updated,
										type: {},
									};

									data[x].type.middle = resp[toCurrency].middle;

									data[x].type.sell = {
										cash: resp[toCurrency].cash,
										remit: resp[toCurrency].remit,
									};
								}
							},
							5
						);
					}

					if (currencies[x].includes(toCurrency)) {
						FXRate.listFXRates(
							x,
							toCurrency,
							(resp) => {
								if (resp[fromCurrency]) {
									data[x] = data[x] ?? {
										name: x,
										updated: resp[fromCurrency].updated,
										type: {},
									};

									data[x].type.buy = {
										cash: resp[fromCurrency].cash,
										remit: resp[fromCurrency].remit,
									};
								}
							},
							5,
							100,
							0,
							true
						);
					}
				}

				await FXRate.done();

				setIsLoading(false);
				setResult(Object.values(data));
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
