// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
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

describe("Index decimal amount 契约", () => {
	beforeEach(() => {
		mockSearchParams.delete("amount")
		getCurrenciesDetailsMock.mockReset()
		getCurrenciesDetailsMock.mockImplementation(
			async (_currencies, _to, _from, setResult) => {
				const rows = [liveRow("bankA", 7.1)]
				if (setResult) setResult({ data: rows, fastFailed: false })
				return rows
			}
		)
	})

	it("URL amount=100.5 解析为小数：透传请求且输入框显示原值", async () => {
		mockSearchParams.set("amount", "100.5")
		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{ bankA: ["CNY", "USD"] }}
				/>
			</ThemeProvider>
		)

		await waitFor(() => expect(getCurrenciesDetailsMock).toHaveBeenCalled())
		expect(getCurrenciesDetailsMock.mock.calls[0][4]?.amount).toBe(100.5)
		expect(
			(screen.getByRole("spinbutton") as HTMLInputElement).value
		).toBe("100.5")
	})

	it("非法金额（0/负数/非数字/空）回退默认 100", async () => {
		for (const bad of ["0", "-5", "abc", ""]) {
			mockSearchParams.set("amount", bad)
			const { unmount } = render(
				<ThemeProvider>
					<Index
						buildId="build"
						buildTime="2026-01-01T00:00:00.000Z"
						version="1.0.0"
						initialCurrencies={{ bankA: ["CNY", "USD"] }}
					/>
				</ThemeProvider>
			)
			await waitFor(() =>
				expect(getCurrenciesDetailsMock).toHaveBeenCalled()
			)
			expect(
				getCurrenciesDetailsMock.mock.calls.at(-1)?.[4]?.amount
			).toBe(100)
			expect(
				(screen.getByRole("spinbutton") as HTMLInputElement).value
			).toBe("100")
			unmount()
		}
	})
})

describe("Index oneWay 源可见性", () => {
	beforeEach(() => {
		getCurrenciesDetailsMock.mockReset()
		getCurrenciesDetailsMock.mockImplementation(
			async (_currencies, _to, _from, setResult) => {
				const rows: FXListProps[] = [
					{
						name: "alipay",
						type: {
							middle: 0.1477,
							buy: { cash: 0.1477, remit: 0.1477 },
						},
						updated: new Date("2026-01-01T00:00:00Z"),
					},
				]
				if (setResult) setResult({ data: rows, fastFailed: false })
				return rows
			}
		)
	})

	it("仅购汇方向报价（alipay oneWay）的源行可见，结汇列为空占位", async () => {
		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{ alipay: ["CNY", "USD"] }}
				/>
			</ThemeProvider>
		)

		// 只有购汇报价的行不被买卖价过滤规则隐藏
		await screen.findByText("支付宝 (alipay)")
		const row = screen.getByText("支付宝 (alipay)").closest("tr")!
		// 购钞/购汇（含中间价）有值
		expect(within(row).getAllByText("0.1477").length).toBeGreaterThanOrEqual(
			2
		)
		// 结钞/结汇无结汇业务 → 空占位
		expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(2)
	})
})

describe("单对表格语义", () => {
	it("表格带语义 caption，首列银行名为 scope=row 行表头", () => {
		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{ bankA: ["CNY", "USD"] }}
					initialResult={[initialRow("bankA", 7.1)]}
				/>
			</ThemeProvider>
		)

		expect(
			screen.getByRole("table", { name: /银行\/平台买卖牌价表/ })
		).toBeInTheDocument()
		const nameTh = screen.getByText("bankA").closest("th")
		expect(nameTh).toHaveAttribute("scope", "row")
	})

	it("StatsTip 触发格键盘可聚焦；交叉路径格带经路径折算的 aria-label", () => {
		const crossRow: Omit<FXListProps, "updated"> & { updated: string } = {
			name: "bankA",
			type: {
				middle: 7.1,
				buy: { cash: 7.11, remit: 7.12 },
				sell: { cash: 7.0, remit: 7.02 },
			},
			path: ["CNH", "HKD", "USD"],
			updated: "2026-01-01T00:00:00.000Z",
		}
		// 整行过桥：该行所有报价格都带路径 aria-label
		const normalRow: Omit<FXListProps, "updated"> & { updated: string } = {
			name: "bankB",
			type: {
				middle: 8.1,
				buy: { cash: 8.11, remit: 8.12 },
				sell: { cash: 8.0, remit: 8.02 },
			},
			updated: "2026-01-01T00:00:00.000Z",
		}
		render(
			<ThemeProvider>
				<Index
					buildId="build"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialCurrencies={{ bankA: ["CNY", "USD"], bankB: ["CNY", "USD"] }}
					initialResult={[crossRow, normalRow]}
				/>
			</ThemeProvider>
		)

		const buyCash = screen.getByText("7.11")
		expect(buyCash).toHaveAttribute(
			"aria-label",
			"7.11，经 CNH → HKD → USD 折算"
		)
		expect(buyCash).toHaveAttribute("tabindex", "0")

		// 无路径的普通行格以可见数字作为名称，并同样可聚焦
		const normalMiddle = screen.getByText("8.1")
		expect(normalMiddle).toHaveAttribute("aria-label", "8.1")
		expect(normalMiddle).toHaveAccessibleName("8.1")
		expect(normalMiddle).toHaveAttribute("tabindex", "0")
	})

	it("仅让含额外信息的 footer tooltip 进入 Tab 顺序；更新时间表头保留可见名称", async () => {
		render(
			<ThemeProvider>
				<Index
					buildId="build123456"
					buildTime="2026-01-01T00:00:00.000Z"
					version="1.0.0"
					initialBackendVersion="fxrate@mock"
					initialCurrencies={{ bankA: ["CNY", "USD"] }}
					initialResult={[initialRow("bankA", 7.1)]}
				/>
			</ThemeProvider>
		)

		const backend = screen.getByText("后端 fxrate@mock")
		expect(backend).toHaveAttribute("tabindex", "0")
		expect(backend).toHaveAccessibleName("后端 fxrate@mock")
		const webVersion = screen.getByText("fxrate-web v1.0.0")
		expect(webVersion).toHaveAttribute("tabindex", "0")
		expect(webVersion).toHaveAccessibleName("fxrate-web v1.0.0")
		fireEvent.mouseOver(webVersion)
		const versionTooltip = await screen.findByRole("tooltip")
		expect(versionTooltip).toHaveTextContent(/fxrate-web@build12/)
		expect(webVersion).toHaveAttribute(
			"aria-describedby",
			versionTooltip.id
		)
		expect(webVersion).toHaveAccessibleName("fxrate-web v1.0.0")

		// Tooltip 只是展开已可见的「更新时间」文案，不新增键盘停靠点
		const updatedHeader = screen.getByText("更新时间")
		expect(updatedHeader).not.toHaveAttribute("tabindex")
		expect(updatedHeader).toHaveAccessibleName("更新时间")
	})
})
