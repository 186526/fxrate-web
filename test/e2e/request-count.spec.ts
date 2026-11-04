import { expect, Page, test } from "@playwright/test"
import { mockJsonRpcRoutes } from "./helpers/mockJsonRpc"
import {
	getMockServerCounters,
	resetMockServer,
} from "./helpers/mockServer"

function collectPageErrors(page: Page) {
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(String(e)))
	return () => errors
}

// 默认视图 SSR 预取架构下，/ 首屏数据由 page.tsx 服务端拉取并随 RSC 下发
// （initialCurrencies/initialResult/initialBackendVersion props），浏览器 hydration
// 不再重复拉货币列表/版本——因此浏览器层契约：
// - 首屏 pair（initial 命中后 300ms SWR 刷新）：主批量（3 快源 ×2 方向 = 6 getFXRate）+
//   visa 慢源后台（2 getFXRate）= 2 条批量、8 个 getFXRate、0 个 instanceInfo/listCurrencies
//   （浏览器从不拉货币列表，证明 SSR 已提供）。
// - 切矩阵：/matrix 是纯客户端薄壳（无 SSR），重挂载时浏览器 currenciesCache 冷
//   （首屏被 SSR 跳过故从未填充）→ 1×（instanceInfo + 4×listCurrencies）+ 矩阵批量
//   = +3 批量（累计 5），instanceInfo 累计 1、listCurrencies 累计 4、listFXRates 3。
// - 切回 pair：RSC 重渲染 page.tsx 命中服务端 SWR 缓存再次下发 initial props，
//   浏览器 tools LRU 命中 → 数据零新增。
test.describe("request-count", () => {
	test.beforeEach(async () => {
		await resetMockServer()
	})

	test("SSR 首屏：浏览器 hydration 零货币列表/版本请求；切矩阵 +6；切回 pair 数据零新增", async ({
		page,
	}) => {
		const mock = mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)

		// Playwright webServer 的 readiness probe 会访问默认 /（precision=4）并预热
		// 服务端 SWR/currencies cache。用独立 precision=3 key，确保本次 document
		// 请求确实执行 SSR getCurrenciesDetails，而不是误把缓存命中当成 SSR 覆盖。
		await page.goto("/?precision=3")
		await expect(page.getByText("bankA").first()).toBeVisible({ timeout: 60_000 })

		// 服务端计数来自真实 mock backend（浏览器 /api/fxrate 已被 page.route 拦截，
		// 不会污染这里）：SSR 至少包含独立 info + 3 个快源双向的 6 次 getFXRate。
		// 货币列表可能已被 readiness probe 写入进程级 currencies cache，因此不把
		// listCurrencies 计数误写成必须发生的契约。
		await expect
			.poll(async () => (await getMockServerCounters()).methods.getFXRate ?? 0, {
				timeout: 20_000,
			})
			.toBe(6)
		const ssrCounters = await getMockServerCounters()
		expect(ssrCounters.methods.instanceInfo ?? 0).toBeGreaterThanOrEqual(1)
		expect(ssrCounters.methods.getFXRate).toBe(6)

		// 浏览器层初始加载：2 条批量（主批量 + visa 后台 = 8 个 getFXRate），
		// 且 instanceInfo/listCurrencies 恒为 0 —— SSR 已随 RSC 提供，浏览器不重复拉
		await expect
			.poll(() => mock.count("getFXRate"), { timeout: 15_000 })
			.toBeGreaterThan(0)
		await page.waitForTimeout(1500)
		expect(mock.batches()).toBe(2)
		expect(mock.count("instanceInfo")).toBe(0)
		expect(mock.count("listCurrencies")).toBe(0)
		expect(mock.count("getFXRate")).toBe(8)
		expect(mock.count("listFXRates")).toBe(0)

		// 切矩阵：薄壳重挂载（无 initial props），货币列表缓存冷 → 版本（1）
		// + 货币列表（4 个来源同批）+ 矩阵（1）= +3 批量；浏览器层累计 5 批次
		await page.getByRole("tab", { name: "全对矩阵" }).click()
		await expect(page.getByText(/以 CNY 为基准/)).toBeVisible({ timeout: 30_000 })
		await expect
			.poll(() => mock.count("listFXRates"), { timeout: 20_000 })
			.toBeGreaterThan(0)
		await page.waitForTimeout(1500)
		expect(mock.batches()).toBe(5)
		expect(mock.count("instanceInfo")).toBe(1)
		expect(mock.count("listCurrencies")).toBe(4)
		expect(mock.count("listFXRates")).toBe(3)

		// 切回单对：服务端 SWR 缓存命中再次下发 initial props + 浏览器 LRU 命中
		// → getFXRate/listFXRates/instanceInfo/listCurrencies 全部零新增
		await page.getByRole("tab", { name: "单对报价" }).click()
		await expect(page.getByText("bankA").first()).toBeVisible({ timeout: 30_000 })
		await page.waitForTimeout(1500)
		expect(mock.count("getFXRate")).toBe(8)
		expect(mock.count("listFXRates")).toBe(3)
		expect(mock.count("instanceInfo")).toBe(1)
		expect(mock.count("listCurrencies")).toBe(4)
		expect(mock.batches()).toBe(5)

		expect(getErrors()).toEqual([])
	})
})
