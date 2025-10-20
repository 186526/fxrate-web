"use client";
import * as React from "react";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

import Autocomplete, {
	AutocompleteRenderInputParams,
} from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";

import IconButton from "@mui/material/IconButton";
import { East, West, North, South } from "@mui/icons-material";

import { code } from "currency-codes-ts";

import { getAllCountries } from "country-locale-map";

import { getCurrenciesDetails } from "@/componets/tools";

const countries = getAllCountries()
	.sort()
	.filter(
		(x) =>
			!(
				(x.currency == "USD" && x.alpha2 != "US") ||
				(x.currency == "EUR" && x.alpha2 != "EU") ||
				(x.currency == "GBP" && x.alpha2 != "GB")
			)
	)
	.map((x) => {
		return {
			alpha2: x.alpha2,
			name: x.name,
			currency: x.currency,
			emoji: x.emoji,
		};
	});

countries.push({
	alpha2: "EU",
	name: "European Union",
	currency: "EUR",
	emoji: "🇪🇺",
});

countries.push({
	alpha2: "CN",
	name: "China",
	currency: "CNH",
	emoji: "🇨🇳",
})

const mapCurrency2Country = (currency: string) =>
	countries.find((x) => x.currency === currency);

export default function CurrencyChooser({
	currencies,
	toCurrency,
	fromCurrency,
	setToCurrency,
	setFromCurrency,
	reverse,
	setReverse,
	setIsLoading,
	setResult,
	rawCurrencies,
}: {
	currencies: string[];
	toCurrency: string;
	fromCurrency: string;
	rawCurrencies: { [source: string]: string[] };
	setToCurrency: (v: string) => void;
	setFromCurrency: (v: string) => void;
	setResult: (v: any) => void;
	reverse: boolean;
	setReverse: (v: boolean) => void;
	setIsLoading: (v: boolean) => void;
}) {
	const router = useRouter();
	const pathname = usePathname();

	const result = currencies
		.map((currency) => {
			const option = currency === "CNH" ? {
				code: "CNH",
				currency: "Yuan Renmenbi (Oversea)",
			} : code(currency);
			const country = mapCurrency2Country(currency);
			if (!country) return;
			return {
				code: option?.code,
				currency: option?.currency,
				label: `${country?.emoji} ${option?.code}`,
				country: country,
			};
		})
		.filter((x) => x);

	function renderOption(
		props: React.HTMLAttributes<HTMLLIElement>,
		option: (typeof result)[0]
	) {
		return (
			<Box
				component="li"
				sx={{ "& > img": { mr: 2, flexShrink: 0 } }}
				{...props}
			>
				{option?.country?.emoji} {option?.country?.name} - {option?.currency} (
				{option?.code})
			</Box>
		);
	}

	function renderInput(label: string) {
		const renderInput = (params: AutocompleteRenderInputParams) => (
			<TextField
				{...params}
				label={label}
				inputProps={{
					...params.inputProps,
					autoComplete: "new-password", // disable autocomplete and autofill
				}}
			/>
		);
		return renderInput;
	}

	const searchParams = useSearchParams();

	React.useEffect(() => {
		setIsLoading(true);

		if (
			(toCurrency == searchParams.get("to") &&
				fromCurrency == searchParams.get("from")) ||
			(searchParams.get("from") == null && searchParams.get("to") == null)
		) {
			return;
		}

		getCurrenciesDetails(rawCurrencies, toCurrency, fromCurrency, setResult);

		setIsLoading(false);
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [toCurrency, fromCurrency, rawCurrencies]);

	React.useEffect(() => {
		const params = new URLSearchParams();
		params.set("from", fromCurrency);
		params.set("to", toCurrency);

		router.push(pathname + "?" + params.toString());
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [toCurrency, fromCurrency]);

	return (
		<div>
			<Autocomplete
				id="to-currency"
				options={result}
				autoHighlight
				clearOnBlur
				selectOnFocus
				onChange={(event, value) => setToCurrency(value?.code ?? "USD")}
				getOptionLabel={(option) => option?.label ?? ""}
				defaultValue={result.find((k) => k?.code == toCurrency)}
				renderOption={renderOption}
				renderInput={renderInput("Converted Currency")}
			></Autocomplete>

			<IconButton
				aria-label="exchange"
				// onClick={() => setReverse(!reverse)}
				size="large"
			>
				{reverse ? <South /> : <North />}
			</IconButton>

			<Autocomplete
				id="from-currency"
				options={result}
				autoHighlight
				clearOnBlur
				selectOnFocus
				onChange={(event, value) => setFromCurrency(value?.code ?? "USD")}
				getOptionLabel={(option) => option?.label ?? ""}
				renderOption={renderOption}
				defaultValue={result.find((k) => k?.code == fromCurrency)}
				renderInput={renderInput("Base Currency")}
			></Autocomplete>
		</div>
	);
}
