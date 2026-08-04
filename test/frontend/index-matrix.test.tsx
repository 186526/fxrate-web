// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeProvider } from "@/componets/theme"
import Index from "@/componets/index"
import {
	getRatesMatrix,
	getCurrenciesDetails,
	showCurrencyAllRates,
} from "@/componets/tools"
import type { RatesMatrix } from "@/componets/tools"

const { mockSearchParams } = vi.hoisted(() => ({
	mockSearchParams: new URLSearchParams(),
}))

vi.mock("next/navigation", () => ({
	useSearchParams: () => mockSearchParams,
	useRouter: () => ({ push: vi.fn() }),
	usePathname: () => "/matrix",
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

const getRatesMatrixMock = vi.mocked(getRatesMatrix)
vi.mocked(getCurrenciesDetails)
vi.mocked(showCurrencyAllRates)

interface DeferredMatrix {
	promise: Promise<RatesMatrix>
	resolve: (value: RatesMatrix) => void
	reject: (reason?: unknown) => void
}

const deferredMatrix = (): DeferredMatrix => {
	let resolve!: (value: RatesMatrix) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<RatesMatrix>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

let pending: DeferredMatrix[] = []

const waitForPending = (count: number, timeout = 3000) =>
	waitFor(() => expect(pending).toHaveLength(count), { timeout })

describe("Index 矩阵请求作废（stale matrix race）", () => {
	beforeEach(() => {
		pending = []
		getRatesMatrixMock.mockReset()
		getRatesMatrixMock.mockImplementation(() => {
			const d = deferredMatrix()
			pending.push(d)
			return d.promise
		})
	})

	it("参数变化后 300ms 防抖窗口内完成的旧请求响应不得落地污染矩阵缓存", async () => {
		const user = userEvent.setup()
		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{ bankA: ["CNY", "USD", "EUR"] }}
				/>
			</ThemeProvider>
		)

		// 首次进入矩阵：300ms 防抖后发起 amount=100 请求并渲染 7.1
		await waitForPending(1)
		const first = pending[0]
		await act(async () => {
			first.resolve({ bankA: { USD: { middle: 7.1 } } })
			await Promise.resolve()
		})
		expect(await screen.findByText("7.1")).toBeInTheDocument()

		// 手动刷新：同一 key 的 in-flight 请求（模拟响应较慢）
		await user.click(screen.getByRole("button", { name: "refresh" }))
		await waitForPending(2)
		const refresh = pending[1]

		// 刷新响应未归时把金额改为 200：旧请求进入 300ms 防抖窗口
		const amountInput = screen.getByRole("spinbutton")
		await user.clear(amountInput)
		await user.type(amountInput, "200")

		// 在防抖窗口内完成旧刷新响应（新数值 7.9）：
		// 作废后不得覆盖 matrixCacheRef 里的 7.1
		await act(async () => {
			refresh.resolve({ bankA: { USD: { middle: 7.9 } } })
			await Promise.resolve()
		})

		// 新金额 200 的请求（防抖后发起）让它失败
		await waitForPending(3)
		await act(async () => {
			pending[2].reject(new Error("matrix failed"))
			await Promise.resolve()
		})

		// 切回金额 100：应恢复缓存中的原始 7.1，而不是陈旧刷新写入的 7.9
		await user.clear(amountInput)
		await user.type(amountInput, "100")

		expect(await screen.findByText("7.1")).toBeInTheDocument()
		expect(screen.queryByText("7.9")).not.toBeInTheDocument()
	})
})
