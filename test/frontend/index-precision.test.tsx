// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { ThemeProvider } from "@/components/theme"
import Index from "@/components/index"

const { mockSearchParams } = vi.hoisted(() => ({
	mockSearchParams: new URLSearchParams(),
}))

vi.mock("next/navigation", () => ({
	useSearchParams: () => mockSearchParams,
	useRouter: () => ({ push: vi.fn() }),
	usePathname: () => "/",
}))

vi.mock("@/components/tools", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/components/tools")>()
	return {
		...actual,
		getRatesMatrix: vi.fn(),
		getCurrenciesDetails: vi.fn(),
		showCurrencyAllRates: vi.fn(),
		FXRate: { info: vi.fn() },
	}
})

import { getCurrenciesDetails } from "@/components/tools"
import { DEFAULT_PRECISION } from "@/components/view-utils"

const getCurrenciesDetailsMock = vi.mocked(getCurrenciesDetails)
const PRECISION_KEY = "fxrate-precision"

const home = () => (
	<ThemeProvider>
		<Index
			buildId="build"
			buildTime="2026-01-01T00:00:00.000Z"
			version="1.0.0"
			initialCurrencies={{ bankA: ["CNY", "USD"] }}
		/>
	</ThemeProvider>
)

describe("Index 精度偏好首挂载", () => {
	beforeEach(() => {
		window.localStorage.clear()
		mockSearchParams.delete("precision")
		getCurrenciesDetailsMock.mockReset()
		getCurrenciesDetailsMock.mockResolvedValue([])
	})

	it("首挂载不覆盖已保存的精度，并按保存值请求报价", async () => {
		window.localStorage.setItem(PRECISION_KEY, "6")
		const replaceState = vi.spyOn(window.history, "replaceState")

		render(home())

		await waitFor(() => expect(getCurrenciesDetailsMock).toHaveBeenCalled())
		expect(getCurrenciesDetailsMock.mock.calls[0][4]?.precision).toBe(6)
		expect(window.localStorage.getItem(PRECISION_KEY)).toBe("6")
		expect(screen.getByRole("spinbutton")).toBeInTheDocument()
		// URL 同步不得先写入默认精度再改写
		await waitFor(() => expect(replaceState).toHaveBeenCalled(), {
			timeout: 3000,
		})
		const written = replaceState.mock.calls.map((call) => String(call[2]))
		expect(written).not.toContain(`/?precision=${DEFAULT_PRECISION}`)
		expect(written.at(-1)).toContain("precision=6")
		replaceState.mockRestore()
	})

	// 真实首屏是服务端渲染 + 客户端 hydrate：客户端首帧读到的是服务端快照，
	// 存储尚未读回。此时若写回精度，就会用默认值覆盖用户设置。
	it("hydrate 首帧不写回默认精度，并按保存值请求报价", async () => {
		window.localStorage.setItem(PRECISION_KEY, "6")
		const setItem = vi.spyOn(Storage.prototype, "setItem")

		const container = document.createElement("div")
		container.innerHTML = renderToString(home())
		document.body.appendChild(container)

		let root: ReturnType<typeof hydrateRoot> | null = null
		await act(async () => {
			root = hydrateRoot(container, home())
		})

		await waitFor(() => expect(getCurrenciesDetailsMock).toHaveBeenCalled())
		expect(getCurrenciesDetailsMock.mock.calls[0][4]?.precision).toBe(6)

		const precisionWrites = setItem.mock.calls
			.filter((call) => call[0] == PRECISION_KEY)
			.map((call) => String(call[1]))
		expect(precisionWrites[0]).not.toBe(String(DEFAULT_PRECISION))
		expect(window.localStorage.getItem(PRECISION_KEY)).toBe("6")

		await act(async () => root?.unmount())
		container.remove()
		setItem.mockRestore()
	})
})
