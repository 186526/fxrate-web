import { expect, Page, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { mockJsonRpcRoutes } from "./helpers/mockJsonRpc"

function collectPageErrors(page: Page) {
	const errors: string[] = []
	page.on("pageerror", (error) => errors.push(String(error)))
	return () => errors
}

async function assertNoSeriousViolations(page: Page) {
	const results = await new AxeBuilder({ page }).analyze()
	const failing = results.violations
		.filter((violation) => violation.impact == "serious" || violation.impact == "critical")
		.map((violation) => ({
			id: violation.id,
			impact: violation.impact,
			help: violation.help,
			nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html })),
		}))
	expect(failing, JSON.stringify(failing, null, 2)).toEqual([])
}

test.describe("API Docs", () => {
	test("metadata、hash 深链、搜索选择与 Try-it-out 请求参数", async ({ page }) => {
		const mock = mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)
		await page.goto("/api-docs#rpc-get-rate")

		await expect(page).toHaveTitle("API 文档 | FXRate-web")
		await expect(page.getByRole("heading", { level: 1, name: /FXRate.*API 参考/ })).toBeVisible()
		await expect(page.getByRole("heading", { level: 2, name: "单对汇率" })).toBeVisible()
		await expect(page.getByRole("link", { name: /getFXRate/ })).toHaveAttribute(
			"aria-current",
			"location"
		)

		const search = page.getByRole("textbox", { name: "搜索端点" })
		await search.fill("listCurrencies")
		await expect(page.getByRole("link", { name: /listCurrencies/ })).toBeVisible()
		await expect(page.getByRole("link", { name: /getFXRate/ })).toHaveCount(0)
		await page.getByRole("link", { name: /listCurrencies/ }).click()
		await expect(page).toHaveURL(/#rpc-list-currencies$/)
		await expect(page.getByRole("heading", { level: 2, name: "数据源货币列表" })).toBeVisible()

		await search.fill("getFXRate")
		await page.getByRole("link", { name: /getFXRate/ }).click()
		await expect(page).toHaveURL(/#rpc-get-rate$/)
		await page.getByRole("button", { name: "试试看" }).click()
		await expect.poll(() => mock.count("getFXRate")).toBe(1)
		await expect(page.locator("#rpc-get-rate").getByLabel("JSON 响应内容")).toContainText('"middle"')

		const amount = page.getByRole("spinbutton", { name: "参数 amount" })
		await amount.fill("250")
		await expect.poll(() => mock.count("getFXRate")).toBe(2)
		const requests = mock.paramsOf("getFXRate")
		expect(requests.at(-1)?.amount).toBe(250)
		expect(getErrors()).toEqual([])
	})

	test("320px 工作台无文档横向溢出且参数目标均在边界内并至少 40px", async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 720 })
		mockJsonRpcRoutes(page)
		await page.goto("/api-docs#rpc-get-rate")
		await page.getByRole("button", { name: "试试看" }).click()
		const workbench = page.locator("#rpc-get-rate")
		await expect(workbench.getByRole("spinbutton", { name: "参数 amount" })).toBeVisible()

		const layout = await workbench.evaluate((article) => {
			const articleRect = article.getBoundingClientRect()
			const params = article.querySelector<HTMLElement>("section[aria-labelledby='rpc-get-rate-params-title']")
			if (!params) throw new Error("参数区域不存在")
			const controls = Array.from(params.querySelectorAll<HTMLElement>("button, input"))
				.map((control) => {
					const target = control.tagName == "INPUT"
						? control.closest<HTMLElement>(".MuiCheckbox-root, .MuiInputBase-root")
						: control
					if (!target) throw new Error("参数控件缺少可见目标")
					const rect = target.getBoundingClientRect()
					const style = getComputedStyle(target)
					return {
						name: control.getAttribute("aria-label") ?? control.textContent?.trim() ?? control.tagName,
						visible: style.display != "none" && style.visibility != "hidden" && rect.width > 0 && rect.height > 0,
						left: rect.left,
						right: rect.right,
						width: rect.width,
						height: rect.height,
					}
				})
				.filter((control) => control.visible)
			return {
				documentWidth: document.documentElement.scrollWidth,
				viewportWidth: document.documentElement.clientWidth,
				articleLeft: articleRect.left,
				articleRight: articleRect.right,
				controls,
			}
		})

		expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
		expect(layout.articleLeft).toBeGreaterThanOrEqual(0)
		expect(layout.articleRight).toBeLessThanOrEqual(320)
		expect(layout.controls.length).toBeGreaterThan(0)
		for (const control of layout.controls) {
			expect(control.left, control.name).toBeGreaterThanOrEqual(layout.articleLeft)
			expect(control.right, control.name).toBeLessThanOrEqual(layout.articleRight)
			expect(control.width, control.name).toBeGreaterThanOrEqual(40)
			expect(control.height, control.name).toBeGreaterThanOrEqual(40)
		}
	})

	test("无 axe serious 或 critical 违规", async ({ page }) => {
		mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)
		await page.goto("/api-docs#rpc-get-rate")
		await page.getByRole("button", { name: "试试看" }).click()
		await expect(page.locator("#rpc-get-rate").getByLabel("JSON 响应内容")).toContainText('"middle"')

		await assertNoSeriousViolations(page)
		expect(getErrors()).toEqual([])
	})
})
