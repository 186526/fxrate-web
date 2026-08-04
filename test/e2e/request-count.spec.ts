import { expect, Page, test } from "@playwright/test"
import { mockJsonRpcRoutes } from "./helpers/mockJsonRpc"

const MOCK_PORT = Number(process.env.MOCK_PORT || 8188)
const MOCK = `http://127.0.0.1:${MOCK_PORT}`

async function mockCounters() {
	const res = await fetch(`${MOCK}/__counters`)
	return (await res.json()) as { batches: number; methods: Record<string, number> }
}

function collectPageErrors(page: Page) {
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(String(e)))
	return () => errors
}

// 薄壳架构（app/*.tsx 不做 SSR 数据拉取）下，所有汇率数据都由浏览器客户端经
// page.route 拦截的 /api/fxrate 拉取，因此浏览器层计数即是完整、确定的数据路径：
// - 首屏 pair：showCurrencyAllRates（instanceInfo + 4×listCurrencies = 2 批量）+
//   挂载期后端版本 instanceInfo（1 批量）+ 主批量（3 快源 ×2 方向 = 6 getFXRate）+
//   visa 慢源后台（2 getFXRate）= 5 条批量、8 个 getFXRate、0 个 listFXRates。
// - 切矩阵：路径变化触发 Index 重挂载（mount effect 再拉一次后端版本 info = +1 批量）
//   + getRatesMatrix 矩阵批量（1 条 listFXRates）= +2 批量。
// - 切回 pair：重挂载 info（+1 批量），pair 数据命中浏览器 tools LRU 零新增。
// mock server 端计数应恒为 0：SSR 侧（含 webServer 就绪探测与 RSC 导航）不再发任何
// JSON-RPC 数据请求。
test.describe("request-count", () => {
	test.beforeEach(async () => {
		await fetch(`${MOCK}/__reset`)
	})

	test("薄壳：首屏 pair 单一浏览器数据路径；切矩阵 +1 矩阵数据；切回 pair 数据零新增；SSR 零数据请求", async ({
		page,
	}) => {
		const mock = mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)

		await page.goto("/")
		await expect(page.getByText("bankA").first()).toBeVisible({ timeout: 60_000 })

		// 浏览器层初始加载：5 条批量（instanceInfo×2 + listCurrencies + 主批量 + visa 后台）
		await expect
			.poll(() => mock.count("getFXRate"), { timeout: 15_000 })
			.toBeGreaterThan(0)
		await page.waitForTimeout(1500)
		expect(mock.batches()).toBe(5)
		expect(mock.count("instanceInfo")).toBe(2)
		expect(mock.count("listCurrencies")).toBe(4)
		expect(mock.count("getFXRate")).toBe(8)
		expect(mock.count("listFXRates")).toBe(0)

		// 切矩阵：重挂载 info +1、矩阵数据 +1 条 listFXRates 批量
		await page.getByRole("tab", { name: "全对矩阵" }).click()
		await expect(page.getByText(/以 CNY 为基准/)).toBeVisible({ timeout: 30_000 })
		await expect
			.poll(() => mock.count("listFXRates"), { timeout: 20_000 })
			.toBeGreaterThan(0)
		await page.waitForTimeout(1500)
		expect(mock.batches()).toBe(7)
		expect(mock.count("listFXRates")).toBe(3)

		// 切回单对：pair 数据命中浏览器 tools LRU → getFXRate/listFXRates 零新增，
		// 仅重挂载 info +1
		await page.getByRole("tab", { name: "单对报价" }).click()
		await expect(page.getByText("bankA").first()).toBeVisible({ timeout: 30_000 })
		await page.waitForTimeout(1500)
		expect(mock.count("getFXRate")).toBe(8)
		expect(mock.count("listFXRates")).toBe(3)
		expect(mock.batches()).toBe(8)

		// mock server：薄壳 SSR 零 JSON-RPC 数据请求（读就绪探测与 RSC 均不再打后端数据接口）
		const total = await mockCounters()
		expect(total.batches).toBe(0)

		expect(getErrors()).toEqual([])
	})
})
