import { expect, Page, test } from "@playwright/test"
import { mockJsonRpcRoutes } from "./helpers/mockJsonRpc"

function collectPageErrors(page: Page) {
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(String(e)))
	return () => errors
}

const expectNoErrorAlerts = (page: Page) =>
	expect(page.locator(".MuiAlert-standardError")).toHaveCount(0)

// 完整 document 加载计数（query-only replaceState 只改 URL，不发起 document 请求）
function countDocumentNavigations(page: Page) {
	let count = 0
	page.on("request", (r) => {
		if (r.resourceType() === "document") count++
	})
	return () => count
}

test.describe("navigation-race", () => {
	test("防抖窗口内快速来回切换视图：最终停在 '/' 且 pair 选中，无错误无覆盖", async ({
		page,
	}) => {
		mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)

		await page.goto("/")
		await expect(page.getByText("bankA").first()).toBeVisible({ timeout: 60_000 })

		const pairTab = page.getByRole("tab", { name: "单对报价" })
		const matrixTab = page.getByRole("tab", { name: "全对矩阵" })
		for (let i = 0; i < 3; i++) {
			await matrixTab.click()
			await pairTab.click()
		}

		await expect(page.getByText("bankA").first()).toBeVisible({ timeout: 30_000 })
		await expect(pairTab).toHaveAttribute("aria-selected", "true")
		await expect
			.poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
			.toBe("/")
		// 等待 RSC 导航与 URL 同步完全落地后确认没有被后续覆盖
		await page.waitForTimeout(2000)
		expect(new URL(page.url()).pathname).toBe("/")
		await expect(pairTab).toHaveAttribute("aria-selected", "true")
		await expectNoErrorAlerts(page)
		expect(getErrors()).toEqual([])
	})

	test("query-only 货币切换：零 document 导航，防抖后恰好一条 pair 数据路径，URL 同步", async ({
		page,
	}) => {
		const mock = mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)
		const navs = countDocumentNavigations(page)

		await page.goto("/")
		await expect(page.getByText("bankA").first()).toBeVisible({ timeout: 60_000 })
		await expect
			.poll(() => mock.count("getFXRate"), { timeout: 15_000 })
			.toBeGreaterThan(0)
		// 等初始加载的主批量与 visa 后台批量都落地后再取基线，保证后续增量断言确定
		await page.waitForTimeout(1500)
		const batchesBefore = mock.batches()
		const fxBefore = mock.count("getFXRate")
		const navsBefore = navs()

		// 用输入框键入过滤，再从弹出的 option 里选择 EUR
		const toCombobox = page.getByRole("combobox", { name: "目标货币" })
		await toCombobox.click()
		await toCombobox.fill("EUR")
		await page.getByRole("option").filter({ hasText: "EUR" }).first().click()

		await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("to=EUR")
		await expect(toCombobox).toHaveValue(/EUR/)
		await expect
			.poll(() => mock.count("getFXRate"), { timeout: 15_000 })
			.toBeGreaterThan(fxBefore)

		// 防抖窗口过后恰好一条 pair 数据路径（主批量 + visa 慢源后台 = 2 条批量，8 个 getFXRate），
		// 且全程无 document 级导航
		await page.waitForTimeout(1500)
		expect(mock.batches() - batchesBefore).toBe(2)
		expect(mock.count("getFXRate") - fxBefore).toBe(8)
		expect(mock.count("listFXRates")).toBe(0)
		expect(navs() - navsBefore).toBe(0)
		expect(getErrors()).toEqual([])
	})

	test("query-only 金额切换：零 document 导航，防抖后恰好一条 pair 数据路径，URL 同步", async ({
		page,
	}) => {
		const mock = mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)
		const navs = countDocumentNavigations(page)

		await page.goto("/")
		await expect(page.getByText("bankA").first()).toBeVisible({ timeout: 60_000 })
		await expect
			.poll(() => mock.count("getFXRate"), { timeout: 15_000 })
			.toBeGreaterThan(0)
		// 等初始加载的主批量与 visa 后台批量都落地后再取基线，保证后续增量断言确定
		await page.waitForTimeout(1500)
		const batchesBefore = mock.batches()
		const fxBefore = mock.count("getFXRate")
		const navsBefore = navs()

		await page.getByRole("spinbutton", { name: /金额/ }).fill("500")

		await expect.poll(() => page.url(), { timeout: 15_000 }).toContain("amount=500")
		await expect
			.poll(() => mock.count("getFXRate"), { timeout: 15_000 })
			.toBeGreaterThan(fxBefore)

		await page.waitForTimeout(1500)
		expect(mock.batches() - batchesBefore).toBe(2)
		expect(mock.count("getFXRate") - fxBefore).toBe(8)
		expect(navs() - navsBefore).toBe(0)
		expect(getErrors()).toEqual([])
	})
})
