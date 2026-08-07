import { expect, test } from "@playwright/test"
import {
	getMockServerCounters,
	resetMockServer,
	setMockServerScenario,
} from "./helpers/mockServer"
import {
	collectPageErrors,
	collectStaticResource404s,
} from "./helpers/pageDiagnostics"

const SOURCES = ["bankA", "mastercard", "visa"]

test.describe("card-source matrix fallback", () => {
	test.beforeEach(async () => {
		await resetMockServer()
		await setMockServerScenario({
			sources: SOURCES,
			matrixForbiddenSources: ["mastercard"],
			emptyRateSources: ["mastercard", "visa"],
		})
	})

	test("MasterCard 全表 403 与卡组织空单对响应均显示可重试状态，恢复后完整落表", async ({
		page,
	}) => {
		const getErrors = collectPageErrors(page)
		const getStatic404s = collectStaticResource404s(page)

		// 不使用 page.route：instanceInfo/listCurrencies/listFXRates/getFXRate 全部走
		// Next /api/fxrate rewrite → 本地 mock backend，覆盖完整浏览器代理链路。
		await page.goto("/matrix?from=CNY&amount=137&precision=3")
		await expect(page.getByText("bankA").first()).toBeVisible({ timeout: 60_000 })

		const mastercardRow = page
			.getByRole("row")
			.filter({ hasText: "MasterCard (mastercard)" })
		const mastercardRetry = mastercardRow.getByRole("button", {
			name: "加载失败，重试",
		})
		await expect(mastercardRetry).toBeVisible({ timeout: 30_000 })

		let counters = await getMockServerCounters()
		expect(counters.methodsBySource.listFXRates?.mastercard ?? 0).toBeGreaterThan(0)
		expect(counters.methodsBySource.getFXRate?.mastercard ?? 0).toBeGreaterThan(0)

		// 后端恢复 MasterCard 单对接口；手动重试后空状态必须变为真实报价行。
		await setMockServerScenario({
			sources: SOURCES,
			matrixForbiddenSources: ["mastercard"],
			emptyRateSources: ["visa"],
		})
		await mastercardRetry.click()
		await expect(mastercardRow.locator("td").first()).toHaveText(/\d/, {
			timeout: 30_000,
		})
		await expect(mastercardRetry).toHaveCount(0)

		// Visa 是慢源：先点击加载；空响应不能被当成 success 静默吞掉，必须给出
		// 同样的重试入口。恢复后再次点击，报价完整写入矩阵。
		const visaRow = page.getByRole("row").filter({ hasText: "Visa (visa)" })
		await visaRow.getByRole("button", { name: "点击加载" }).click()
		const visaRetry = visaRow.getByRole("button", {
			name: "加载失败，重试",
		})
		await expect(visaRetry).toBeVisible({ timeout: 30_000 })

		await setMockServerScenario({
			sources: SOURCES,
			matrixForbiddenSources: ["mastercard"],
			emptyRateSources: [],
		})
		await visaRetry.click()
		await expect(visaRow.locator("td").first()).toHaveText(/\d/, {
			timeout: 30_000,
		})
		await expect(visaRetry).toHaveCount(0)

		counters = await getMockServerCounters()
		expect(counters.methodsBySource.getFXRate?.mastercard ?? 0).toBeGreaterThanOrEqual(2)
		expect(counters.methodsBySource.getFXRate?.visa ?? 0).toBeGreaterThanOrEqual(2)
		expect(getErrors()).toEqual([])
		expect(getStatic404s()).toEqual([])
	})
})
