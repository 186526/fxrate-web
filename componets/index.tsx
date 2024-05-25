"use client";
import CurrencyChooser from "./currencyChooser";
import { useState, useEffect, useCallback } from "react";
import FXListGrid, { FXListProps } from "./fxlistgrid";

import FXRates from "@/lib/fxrate/src/client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

export default function Index({
	currencies,
}: {
	currencies: { [source: string]: string[] };
}) {
	const searchParams = useSearchParams();
	const router = useRouter();
	const pathname = usePathname();

	const defaultToCurrency = searchParams.get("to") ?? "USD";
	const defaultFromCurrency = searchParams.get("from") ?? "CNY";

	const [toCurrency, setToCurrency] = useState<string>(defaultToCurrency);
	const [fromCurrency, setFromCurrency] = useState<string>(defaultFromCurrency);

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
	}, [toCurrency, fromCurrency, currencies]);

	useEffect(() => {
		const params = new URLSearchParams();
		params.set("from", fromCurrency);
		params.set("to", toCurrency);

		router.push(pathname + "?" + params.toString());
	}, [toCurrency, fromCurrency]);

	return (
		<>
			<CurrencyChooser
				currencies={
					Array.from(
						new Set(Object.values(currencies).flat(Infinity))
					) as string[]
				}
				toCurrency={toCurrency}
				fromCurrency={fromCurrency}
				setToCurrency={setToCurrency}
				setFromCurrency={setFromCurrency}
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
