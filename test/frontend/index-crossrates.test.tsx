// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { StrictMode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { ThemeProvider } from "@/componets/theme"
import Index from "@/componets/index"
import type { FXListProps } from "@/componets/fxlistgrid"

const { mockSearchParams } = vi.hoisted(() => ({
	mockSearchParams: new URLSearchParams(),
}))

vi.mock("next/navigation", () => ({
	useSearchParams: () => mockSearchParams,
	useRouter: () => ({ push: vi.fn() }),
	usePathname: () => "/",
}))

vi.mock("@/componets/tools", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/componets/tools")>()
	return {
		...actual,
		getRatesMatrix: vi.fn(),
		getCurrenciesDetails: vi.fn(),
		showCurrencyAllRates: vi.fn(),
		FXRate: { info: vi.fn() },
	}
})

import { getCurrenciesDetails } from "@/componets/tools"

const CROSS_KEY = "fxrate-cross-rates"

const initialRow = (
	name: string,
	middle: number
): Omit<FXListProps, "updated"> & { updated: string } => ({
	name,
	type: {
		middle,
		buy: { cash: 7.11, remit: 7.12 },
		sell: { cash: 7.0, remit: 7.02 },
	},
	updated: "2026-01-01T00:00:00.000Z",
})

const liveRow = (name: string, middle: number): FXListProps => ({
	name,
	type: {
		middle,
		buy: { cash: 7.11, remit: 7.12 },
		sell: { cash: 7.0, remit: 7.02 },
	},
	updated: new Date("2026-01-01T00:00:00Z"),
})

function renderCrossRates() {
	render(
		<StrictMode>
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{
						bankA: ["CNY", "USD"],
						bankB: ["CNY", "USD"],
					}}
					initialResult={[initialRow("bankA", 7.1)]}
				/>
			</ThemeProvider>
		</StrictMode>
	)
}

const crossRatesButton = (): HTMLButtonElement => {
	const label = screen.getByText("交叉汇率")
	return label.closest("button") as HTMLButtonElement
}

const crossWrites = (spy: ReturnType<typeof vi.spyOn>): string[] =>
	spy.mock.calls
		.filter((call: string[]) => call[0] == CROSS_KEY)
		.map((call: string[]) => String(call[1]))

describe("Index 交叉汇率 StrictMode 持久化", () => {
	beforeEach(() => {
		window.localStorage.clear()
		vi.mocked(getCurrenciesDetails).mockReset()
		vi.mocked(getCurrenciesDetails).mockImplementation(
			async (_currencies, _to, _from, setResult) => {
				const rows = [liveRow("bankA", 7.1)]
				if (setResult) setResult({ data: rows, fastFailed: false })
				return rows
			}
		)
	})

	it("预置 fxrate-cross-rates=true 在 StrictMode 挂载时不被覆盖，且开关恢复开启", async () => {
		window.localStorage.setItem(CROSS_KEY, "1")
		const setItemSpy = vi.spyOn(Storage.prototype, "setItem")
		try {
			renderCrossRates()
			await waitFor(() => {
				expect(crossRatesButton()).toHaveClass("MuiButton-tonal")
			})
			// 挂载全程写回的必须是 1，不得出现默认值 0 覆盖存档
			const writes = crossWrites(setItemSpy)
			expect(writes.length).toBeGreaterThan(0)
			expect(writes.every((value) => value == "1")).toBe(true)
			expect(window.localStorage.getItem(CROSS_KEY)).toBe("1")
		} finally {
			setItemSpy.mockRestore()
		}
	})

	it("用户切换交叉汇率后持久化提交后的状态", async () => {
		window.localStorage.setItem(CROSS_KEY, "0")
		renderCrossRates()
		await waitFor(() => {
			expect(crossRatesButton()).toHaveClass("MuiButton-outlined")
		})

		fireEvent.click(crossRatesButton())
		await waitFor(() => {
			expect(crossRatesButton()).toHaveClass("MuiButton-tonal")
		})
		expect(window.localStorage.getItem(CROSS_KEY)).toBe("1")

		fireEvent.click(crossRatesButton())
		await waitFor(() => {
			expect(crossRatesButton()).toHaveClass("MuiButton-outlined")
		})
		expect(window.localStorage.getItem(CROSS_KEY)).toBe("0")
	})
})
