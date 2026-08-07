// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	clearSSRPrefetchCache,
	prefetchDefaultView,
} from "@/componets/ssr-prefetch"
import {
	getCurrenciesDetails,
	getFXRateClient,
	showCurrencyAllRates,
} from "@/componets/tools"

const { mockShow, mockDetails, mockInfo } = vi.hoisted(() => ({
	mockShow: vi.fn(),
	mockDetails: vi.fn(),
	mockInfo: vi.fn(),
}))

vi.mock("@/componets/tools", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/componets/tools")>()
	return {
		...actual,
		showCurrencyAllRates: mockShow,
		getCurrenciesDetails: mockDetails,
		getFXRateClient: () => ({ info: mockInfo }),
	}
})

vi.mocked(getCurrenciesDetails)
vi.mocked(showCurrencyAllRates)

const currencies = { bankA: ["CNY", "USD"], bankB: ["CNY", "USD"] }
const liveRow = (name: string, middle: number) => ({
	name,
	type: { middle, buy: { cash: 7.11 }, sell: { cash: 7.0 } },
	updated: new Date("2026-01-01T00:00:00.000Z"),
})

beforeEach(() => {
	clearSSRPrefetchCache()
	vi.clearAllMocks()
	mockShow.mockResolvedValue(currencies)
	mockDetails.mockResolvedValue([liveRow("bankA", 7.1), liveRow("bankB", 7.2)])
	mockInfo.mockResolvedValue({ version: "fxrate@mock <test>" })
})

describe("prefetchDefaultView", () => {
	it("默认参数（缺省/CNY→USD/100/4）触发预取并序列化 string 时间戳", async () => {
		const r = await prefetchDefaultView({})
		expect(r.initialCurrencies).toEqual(currencies)
		expect(r.initialResult).toHaveLength(2)
		expect(typeof r.initialResult![0].updated).toBe("string")
		expect(r.initialResult![0].updated).toBe("2026-01-01T00:00:00.000Z")
		expect(r.initialBackendVersion).toBe("fxrate@mock <test>")
		expect(mockShow).toHaveBeenCalledTimes(1)
		expect(mockDetails).toHaveBeenCalledTimes(1)
	})

	it("显式默认参数同样触发预取", async () => {
		const r = await prefetchDefaultView({
			from: "CNY",
			to: "USD",
			amount: "100",
			precision: "4",
		})
		expect(r.initialResult).toHaveLength(2)
		expect(mockShow).toHaveBeenCalledTimes(1)
	})

	it("非默认参数（from/to/amount 任一）直接返回空，零数据请求", async () => {
		for (const params of [
			{ from: "EUR" },
			{ to: "JPY" },
			{ amount: "200" },
		]) {
			const r = await prefetchDefaultView(params)
			expect(r.initialCurrencies).toBeNull()
			expect(r.initialResult).toBeNull()
		}
		expect(mockShow).not.toHaveBeenCalled()
		expect(mockDetails).not.toHaveBeenCalled()
	})

	it("precision 是显示偏好：任意合法值（-1~6）都触发预取并透传", async () => {
		const r = await prefetchDefaultView({ precision: "2" })
		expect(r.initialResult).toHaveLength(2)
		expect(mockDetails).toHaveBeenCalledWith(
			expect.anything(),
			"USD",
			"CNY",
			undefined,
			{ amount: 100, precision: 2 }
		)
		await prefetchDefaultView({ precision: "-1" })
		expect(mockDetails).toHaveBeenLastCalledWith(
			expect.anything(),
			"USD",
			"CNY",
			undefined,
			{ amount: 100, precision: -1 }
		)
	})

	it("非法 precision 回退为 4，仍触发预取", async () => {
		const r = await prefetchDefaultView({ precision: "abc" })
		expect(r.initialResult).toHaveLength(2)
		expect(mockDetails).toHaveBeenCalledWith(
			expect.anything(),
			"USD",
			"CNY",
			undefined,
			{ amount: 100, precision: 4 }
		)
	})

	it("SWR 缓存：45s 内重复调用零网络（show/details 仅一次）", async () => {
		await prefetchDefaultView({})
		await prefetchDefaultView({})
		await prefetchDefaultView({})
		expect(mockShow).toHaveBeenCalledTimes(1)
		expect(mockDetails).toHaveBeenCalledTimes(1)
	})

	it("不同 precision 各自独立缓存（key 含 precision）", async () => {
		await prefetchDefaultView({ precision: "2" })
		await prefetchDefaultView({ precision: "4" })
		expect(mockShow).toHaveBeenCalledTimes(2)
		expect(mockDetails).toHaveBeenCalledTimes(2)
	})

	it("showCurrencyAllRates 失败降级为薄壳（空值），不抛错", async () => {
		mockShow.mockRejectedValue(new Error("backend down"))
		const r = await prefetchDefaultView({})
		expect(r.initialCurrencies).toBeNull()
		expect(r.initialResult).toBeNull()
		expect(r.initialBackendVersion).toBe("")
	})

	it("空汇率结果不写入 SWR 缓存（下次仍重试）", async () => {
		mockDetails.mockResolvedValue([])
		await prefetchDefaultView({})
		expect(mockDetails).toHaveBeenCalledTimes(1)
		mockDetails.mockResolvedValue([liveRow("bankA", 7.1)])
		await prefetchDefaultView({})
		expect(mockDetails).toHaveBeenCalledTimes(2)
	})

	it("无效日期回退为当前时间 ISO", async () => {
		mockDetails.mockResolvedValue([
			{ ...liveRow("bankA", 7.1), updated: new Date("invalid") },
		])
		const r = await prefetchDefaultView({})
		expect(r.initialResult![0].updated).toBe(new Date().toISOString())
	})
})
