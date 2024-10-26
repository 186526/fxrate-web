"use client";
import CurrencyChooser from "./currencyChooser";
import { useState } from "react";
import FXListGrid, { FXListProps } from "./fxlistgrid";

import { useSearchParams } from "next/navigation";

export default function Index({
	currencies,
	defaultResult,
}: {
	currencies: { [source: string]: string[] };
	defaultResult: FXListProps[];
}) {
	const searchParams = useSearchParams();

	const defaultToCurrency = searchParams.get("to") ?? "USD";
	const defaultFromCurrency = searchParams.get("from") ?? "CNY";

	const [toCurrency, setToCurrency] = useState<string>(defaultToCurrency);
	const [fromCurrency, setFromCurrency] = useState<string>(defaultFromCurrency);

	const [reverse, setReverse] = useState<boolean>(false);

	const [isLoading, setIsLoading] = useState<boolean>(false);

	const [result, setResult] = useState<FXListProps[]>(defaultResult);

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
				reverse={reverse}
				setToCurrency={setToCurrency}
				setFromCurrency={setFromCurrency}
				setResult={setResult}
				setReverse={setReverse}
				setIsLoading={setIsLoading}
				rawCurrencies={currencies}
			></CurrencyChooser>
			<FXListGrid props={result}></FXListGrid>
		</>
	);
}
