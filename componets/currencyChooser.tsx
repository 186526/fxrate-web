"use client";
import * as React from "react";

import Autocomplete, {
	AutocompleteRenderInputParams,
} from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import TextField from "@mui/material/TextField";

import IconButton from "@mui/material/IconButton";
import LoadingButton from "@mui/lab/LoadingButton";
import { East, West, North, South } from "@mui/icons-material";

import Grid from "@mui/material/Unstable_Grid2";

import { code } from "currency-codes-ts";

import { getAllCountries } from "country-locale-map";

const countries = getAllCountries()
	.sort()
	.filter(
		(x) =>
			!(
				(x.currency == "USD" && x.alpha2 != "US") ||
				(x.currency == "EUR" && x.alpha2 != "EU")
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

const mapCurrency2Country = (currency: string) =>
	countries.find((x) => x.currency === currency);

export default function CurrencyChooser({
	currencies,
	fromCurrency,
	toCurrency,
	setFromCurrency,
	setToCurrency,
	reverse,
	setReverse,
	isLoading,
}: {
	currencies: string[];
	fromCurrency: string;
	toCurrency: string;
	setFromCurrency: (v: string) => void;
	setToCurrency: (v: string) => void;
	reverse: boolean;
	setReverse: (v: boolean) => void;
	isLoading: boolean;
}) {
	const result = currencies
		.map((currency) => {
			const option = code(currency);
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

	return (
		<div>
			<Autocomplete
				id="from-currency"
				options={result}
				autoHighlight
				clearOnBlur
				selectOnFocus
				onChange={(event, value) => setFromCurrency(value?.code ?? "USD")}
				getOptionLabel={(option) => option?.label ?? ""}
				defaultValue={result.find((k) => k?.code == fromCurrency)}
				renderOption={renderOption}
				renderInput={renderInput("From Currency")}
			></Autocomplete>

			<IconButton
				aria-label="exchange"
				// onClick={() => setReverse(!reverse)}
				size="large"
			>
				{reverse ? <North /> : <South />}
			</IconButton>

			<Autocomplete
				id="to-currency"
				options={result}
				autoHighlight
				clearOnBlur
				selectOnFocus
				onChange={(event, value) => setToCurrency(value?.code ?? "USD")}
				getOptionLabel={(option) => option?.label ?? ""}
				renderOption={renderOption}
				defaultValue={result.find((k) => k?.code == toCurrency)}
				renderInput={renderInput("To Currency")}
			></Autocomplete>
		</div>
	);
}
