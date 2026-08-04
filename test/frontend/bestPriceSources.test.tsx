// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { StrictMode } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import {
	useBestPriceSources,
	NON_BANK_SOURCES,
} from "@/componets/bestPriceSources"

const KEY = "fxrate-best-price-sources"

function Harness() {
	const { excluded, toggle, reset, selectAll } = useBestPriceSources()
	return (
		<div>
			<span data-testid="excluded">
				{Array.from(excluded).sort().join(",")}
			</span>
			<button onClick={() => toggle("pboc")}>toggle pboc</button>
			<button onClick={() => toggle("icbc")}>toggle icbc</button>
			<button onClick={reset}>reset</button>
			<button onClick={selectAll}>selectAll</button>
		</div>
	)
}

const readStored = (): string[] => {
	const raw = window.localStorage.getItem(KEY)
	if (!raw) return []
	const parsed: unknown = JSON.parse(raw)
	return Array.isArray(parsed) ? parsed.filter((x) => typeof x == "string") : []
}

describe("useBestPriceSources StrictMode 持久化", () => {
	beforeEach(() => {
		window.localStorage.clear()
	})

	it("预置排除集在 StrictMode 挂载时不被默认集覆盖", async () => {
		const saved = ["pboc", "unionpay", "mastercard"]
		window.localStorage.setItem(KEY, JSON.stringify(saved))
		const setItemSpy = vi.spyOn(Storage.prototype, "setItem")
		try {
			render(
				<StrictMode>
					<Harness />
				</StrictMode>
			)
			await waitFor(() => {
				expect(screen.getByTestId("excluded")).toHaveTextContent(
					"mastercard,pboc,unionpay"
				)
			})
			// 挂载全程写回的必须是读档后的排除集，不得出现默认集覆盖
			const writes = setItemSpy.mock.calls
				.filter(([key]) => key == KEY)
				.map(([, value]) => value)
			expect(writes.length).toBeGreaterThan(0)
			expect(writes.every((value) => value == JSON.stringify(saved))).toBe(
				true
			)
			expect(readStored()).toEqual(saved)
		} finally {
			setItemSpy.mockRestore()
		}
	})

	it("toggle 持久化提交后的排除集", async () => {
		render(
			<StrictMode>
				<Harness />
			</StrictMode>
		)
		await waitFor(() => {
			expect(screen.getByTestId("excluded")).toHaveTextContent(
				NON_BANK_SOURCES.slice().sort().join(",")
			)
		})

		// pboc 在默认排除集内：toggle 移出
		fireEvent.click(screen.getByRole("button", { name: "toggle pboc" }))
		await waitFor(() => {
			expect(screen.getByTestId("excluded")).toHaveTextContent(
				NON_BANK_SOURCES.filter((s) => s != "pboc")
					.sort()
					.join(",")
			)
		})
		expect(readStored().sort()).toEqual(
			NON_BANK_SOURCES.filter((s) => s != "pboc").sort()
		)

		fireEvent.click(screen.getByRole("button", { name: "toggle pboc" }))
		await waitFor(() => {
			expect(screen.getByTestId("excluded")).toHaveTextContent(
				NON_BANK_SOURCES.slice().sort().join(",")
			)
		})
		expect(readStored().sort()).toEqual(NON_BANK_SOURCES.slice().sort())

		// icbc 不在默认排除集内：toggle 加入
		fireEvent.click(screen.getByRole("button", { name: "toggle icbc" }))
		await waitFor(() => {
			expect(screen.getByTestId("excluded")).toHaveTextContent(
				[...NON_BANK_SOURCES, "icbc"].sort().join(",")
			)
		})
		expect(readStored().sort()).toEqual([...NON_BANK_SOURCES, "icbc"].sort())
	})

	it("reset 恢复默认排除集并持久化", async () => {
		window.localStorage.setItem(KEY, JSON.stringify(["pboc"]))
		render(
			<StrictMode>
				<Harness />
			</StrictMode>
		)
		await waitFor(() => {
			expect(screen.getByTestId("excluded")).toHaveTextContent("pboc")
		})

		fireEvent.click(screen.getByRole("button", { name: "reset" }))
		await waitFor(() => {
			expect(screen.getByTestId("excluded")).toHaveTextContent(
				NON_BANK_SOURCES.slice().sort().join(",")
			)
		})
		expect(readStored().sort()).toEqual(NON_BANK_SOURCES.slice().sort())
	})

	it("selectAll 清空排除集并持久化", async () => {
		window.localStorage.setItem(KEY, JSON.stringify(["pboc", "wise"]))
		render(
			<StrictMode>
				<Harness />
			</StrictMode>
		)
		await waitFor(() => {
			expect(screen.getByTestId("excluded")).toHaveTextContent("pboc,wise")
		})

		fireEvent.click(screen.getByRole("button", { name: "selectAll" }))
		await waitFor(() => {
			expect(screen.getByTestId("excluded")).toHaveTextContent("")
		})
		expect(readStored()).toEqual([])
	})
})
