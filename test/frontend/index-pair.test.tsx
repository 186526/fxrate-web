// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import { ThemeProvider } from "@/componets/theme"
import Index from "@/componets/index"
import {
	getRatesMatrix,
	getCurrenciesDetails,
	showCurrencyAllRates,
} from "@/componets/tools"
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

const getCurrenciesDetailsMock = vi.mocked(getCurrenciesDetails)
vi.mocked(getRatesMatrix)
vi.mocked(showCurrencyAllRates)

// initialResult 走 string 时间戳（page.tsx 序列化格式）；
// FXListGrid 会过滤买卖价全缺的行，测试行须带 buy/sell
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

// getCurrenciesDetails 运行时返回 Date（tools 内部格式）
const liveRow = (name: string, middle: number): FXListProps => ({
	name,
	type: {
		middle,
		buy: { cash: 7.11, remit: 7.12 },
		sell: { cash: 7.0, remit: 7.02 },
	},
	updated: new Date("2026-01-01T00:00:00Z"),
})

describe("Index 单对刷新替换陈旧快源行", () => {
	beforeEach(() => {
		getCurrenciesDetailsMock.mockReset()
		getCurrenciesDetailsMock.mockImplementation(
			async (_currencies, _to, _from, setResult) => {
				const rows = [liveRow("bankB", 7.2), liveRow("visa", 7.3)]
				if (setResult) setResult({ data: rows, fastFailed: false })
				return rows
			}
		)
	})

	it("快源本次未返回（失败）时其旧行被移除，仅保留旧慢源行兜底", async () => {
		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{
						bankA: ["CNY", "USD"],
						bankB: ["CNY", "USD"],
						visa: ["CNY", "USD"],
					}}
					initialResult={[
						initialRow("bankA", 7.1),
						initialRow("bankB", 7.2),
						initialRow("visa", 7.3),
					]}
				/>
			</ThemeProvider>
		)

		// 初始渲染：三行都在
		expect(screen.getByText("bankA")).toBeInTheDocument()
		expect(screen.getByText("bankB")).toBeInTheDocument()
		expect(screen.getByText("Visa (visa)")).toBeInTheDocument()

		// 300ms 防抖后刷新：bankA 未返回 → 其旧行从视图中移除，bankB/visa 保留
		await waitFor(
			() => {
				expect(screen.queryByText("bankA")).not.toBeInTheDocument()
			},
			{ timeout: 3000 }
		)
		expect(screen.getByText("bankB")).toBeInTheDocument()
		expect(screen.getByText("Visa (visa)")).toBeInTheDocument()
	})

	it("快源批量失败后 Visa 单独回调保留既有快源行与错误提示", async () => {
		getCurrenciesDetailsMock.mockReset()
		getCurrenciesDetailsMock.mockImplementation(
			async (_currencies, _to, _from, setResult) => {
				// 模拟：快源批量全失败 → 主流程抛错；稍后慢源（visa）单独完成
				// → 带 fastFailed 标记的合并回调
				setTimeout(() => {
					if (setResult) {
						setResult({
							data: [liveRow("visa", 7.35)],
							fastFailed: true,
						})
					}
				}, 50)
				throw new Error("获取报价失败：所有数据源均不可用，请稍后重试")
			}
		)

		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{
						bankA: ["CNY", "USD"],
						bankB: ["CNY", "USD"],
						visa: ["CNY", "USD"],
					}}
					initialResult={[
						initialRow("bankA", 7.1),
						initialRow("bankB", 7.2),
						initialRow("visa", 7.3),
					]}
				/>
			</ThemeProvider>
		)

		// 初始渲染：三行都在
		expect(screen.getByText("bankA")).toBeInTheDocument()
		expect(screen.getByText("bankB")).toBeInTheDocument()
		expect(screen.getByText("Visa (visa)")).toBeInTheDocument()

		// 300ms 防抖后主批量失败 → 错误提示出现
		await waitFor(
			() => {
				expect(
					screen.getByText("获取报价失败：所有数据源均不可用，请稍后重试")
				).toBeInTheDocument()
			},
			{ timeout: 3000 }
		)

		// visa 单独回调到达后：既有快源行 bankA/bankB 仍保留，错误不被慢源回调清除
		await waitFor(
			() => {
				expect(screen.getByText("Visa (visa)")).toBeInTheDocument()
				expect(screen.getByText("bankA")).toBeInTheDocument()
				expect(screen.getByText("bankB")).toBeInTheDocument()
				expect(
					screen.getByText("获取报价失败：所有数据源均不可用，请稍后重试")
				).toBeInTheDocument()
			},
			{ timeout: 3000 }
		)
	})
})
