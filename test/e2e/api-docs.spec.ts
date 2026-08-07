import { expect, Page, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { mockJsonRpcRoutes } from "./helpers/mockJsonRpc"
import { ENDPOINT_IDS, type EndpointId } from "../../componets/api-docs/model"
import {
	collectPageErrors,
	collectStaticResource404s,
} from "./helpers/pageDiagnostics"

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

async function enableDarkMode(page: Page): Promise<void> {
	await page.addInitScript(() => {
		window.localStorage.setItem("fxrate-theme", "dark")
	})
}

async function selectEndpoint(page: Page, endpointId: EndpointId): Promise<void> {
	await page.evaluate((id) => {
		window.location.hash = id
	}, endpointId)
	await expect(page.locator(`#${endpointId}`)).toBeVisible()
}

test.describe("API Docs", () => {
	test("metadata、hash 深链、搜索选择与 Try-it-out 请求参数", async ({ page }) => {
		const mock = mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)
		const getStatic404s = collectStaticResource404s(page)
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
		// 等 hash 对应的工作台挂载后再点：旧端点工作台卸载有瞬时窗口，全页
		// getByRole 可能点到旧/SSR 按钮，把请求发往错误端点（getFXRate 不计数）
		const workbench = page.locator("#rpc-get-rate")
		await expect(workbench).toBeVisible()
		await workbench.getByRole("button", { name: "试试看" }).click()
		await expect.poll(() => mock.count("getFXRate")).toBe(1)
		await expect(workbench.getByLabel("JSON 响应内容")).toContainText('"middle"')

		const amount = page.getByRole("spinbutton", { name: "参数 amount" })
		await amount.fill("250")
		await expect.poll(() => mock.count("getFXRate")).toBe(2)
		const requests = mock.paramsOf("getFXRate")
		expect(requests.at(-1)?.amount).toBe(250)
		expect(getErrors()).toEqual([])
		expect(getStatic404s()).toEqual([])
	})

	test("320px 完整页面与全部 8 个端点工作台无横向溢出，所有编辑控件目标至少 40px", async ({ page }) => {
		await page.setViewportSize({ width: 320, height: 720 })
		mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)
		const getStatic404s = collectStaticResource404s(page)
		await page.goto(`/api-docs#${ENDPOINT_IDS[0]}`)
		await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

		// xs 导航本身也属于完整页面覆盖：展开后搜索、筛选、分组、8 个端点与
		// 三个参考入口都必须留在 viewport 内，并保持至少 40px 操作目标。
		await page.getByRole("button", { name: "浏览端点" }).click()
		const navigation = page.getByRole("navigation", { name: "API 端点导航" })
		await expect(navigation.locator("a[href^='#']")).toHaveCount(8)
		const navigationControls = await navigation.evaluate((nav) => {
			return Array.from(nav.querySelectorAll<HTMLElement>("button, input, a"))
				.map((control) => {
					const target = control.tagName == "INPUT"
						? control.closest<HTMLElement>(".MuiInputBase-root")
						: control
					if (!target) throw new Error("导航控件缺少可见目标")
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
		})
		for (const control of navigationControls) {
			expect(control.left, control.name).toBeGreaterThanOrEqual(0)
			expect(control.right, control.name).toBeLessThanOrEqual(320)
			expect(control.width, control.name).toBeGreaterThanOrEqual(40)
			expect(control.height, control.name).toBeGreaterThanOrEqual(40)
		}
		await page.getByRole("button", { name: "收起端点导航" }).click()

		const pageChromeControls = await page.evaluate(() => {
			return Array.from(
				document.querySelectorAll<HTMLElement>("header button, header a, aside a")
			)
				.map((control) => {
					const rect = control.getBoundingClientRect()
					const style = getComputedStyle(control)
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
		})
		for (const control of pageChromeControls) {
			expect(control.left, control.name).toBeGreaterThanOrEqual(0)
			expect(control.right, control.name).toBeLessThanOrEqual(320)
			expect(control.width, control.name).toBeGreaterThanOrEqual(40)
			expect(control.height, control.name).toBeGreaterThanOrEqual(40)
		}

		for (const endpointId of ENDPOINT_IDS) {
			await selectEndpoint(page, endpointId)
			const workbench = page.locator(`#${endpointId}`)
			await workbench.getByRole("button", { name: "试试看" }).click()
			await expect(
				workbench.getByRole("button", { name: "结束编辑" })
			).toBeVisible()

			const layout = await workbench.evaluate((article) => {
				const articleRect = article.getBoundingClientRect()
				const bounds = (element: Element) => {
					const rect = element.getBoundingClientRect()
					return { left: rect.left, right: rect.right }
				}
				const controls = Array.from(
					article.querySelectorAll<HTMLElement>("button, input, pre[tabindex='0']")
				)
					.map((control) => {
						const target = control.tagName == "INPUT"
							? control.closest<HTMLElement>(".MuiCheckbox-root, .MuiInputBase-root")
							: control
						if (!target) throw new Error("工作台控件缺少可见目标")
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
					header: bounds(document.querySelector("header")!),
					main: bounds(document.querySelector("main")!),
					navigation: bounds(document.querySelector("nav[aria-label='API 端点导航']")!),
					articleLeft: articleRect.left,
					articleRight: articleRect.right,
					references: ["operations", "rss", "sources"].map((id) =>
						bounds(document.getElementById(id)!)
					),
					controls,
				}
			})

			expect(layout.documentWidth, endpointId).toBeLessThanOrEqual(
				layout.viewportWidth
			)
			for (const area of [
				layout.header,
				layout.main,
				layout.navigation,
				...layout.references,
			]) {
				expect(area.left, endpointId).toBeGreaterThanOrEqual(0)
				expect(area.right, endpointId).toBeLessThanOrEqual(320)
			}
			expect(layout.articleLeft, endpointId).toBeGreaterThanOrEqual(0)
			expect(layout.articleRight, endpointId).toBeLessThanOrEqual(320)
			expect(layout.controls.length, endpointId).toBeGreaterThan(0)
			for (const control of layout.controls) {
				expect(control.left, `${endpointId}: ${control.name}`).toBeGreaterThanOrEqual(
					layout.articleLeft
				)
				expect(control.right, `${endpointId}: ${control.name}`).toBeLessThanOrEqual(
					layout.articleRight
				)
				expect(control.width, `${endpointId}: ${control.name}`).toBeGreaterThanOrEqual(40)
				expect(control.height, `${endpointId}: ${control.name}`).toBeGreaterThanOrEqual(40)
			}
		}

		expect(getErrors()).toEqual([])
		expect(getStatic404s()).toEqual([])
	})

	test("无 axe serious 或 critical 违规", async ({ page }) => {
		mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)
		const getStatic404s = collectStaticResource404s(page)
		await page.goto("/api-docs#rpc-get-rate")
		// #rpc-get-rate 工作台只在 hydration + hash 同步后才存在（SSR 只渲染默认
		// 端点 rest-source）。等它出现再点击，杜绝点击落在 SSR 瞬态"试试看"按钮上
		// 导致请求发往错误端点、JSON 响应永不出现（light axe 一次偶发失败的根因）
		const workbench = page.locator("#rpc-get-rate")
		await expect(workbench).toBeVisible()
		await workbench.getByRole("button", { name: "试试看" }).click()
		await expect(workbench.getByLabel("JSON 响应内容")).toContainText('"middle"')

		await assertNoSeriousViolations(page)
		expect(getErrors()).toEqual([])
		expect(getStatic404s()).toEqual([])
	})

	test("暗色模式无 axe serious 或 critical 违规", async ({ page }) => {
		await enableDarkMode(page)
		mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)
		const getStatic404s = collectStaticResource404s(page)
		await page.goto("/api-docs#rpc-get-rate")
		await expect(page.locator("html")).toHaveAttribute("data-theme", "dark")
		const workbench = page.locator("#rpc-get-rate")
		await expect(workbench).toBeVisible()
		await workbench.getByRole("button", { name: "试试看" }).click()
		await expect(workbench.getByLabel("JSON 响应内容")).toContainText('"middle"')

		await assertNoSeriousViolations(page)
		expect(getErrors()).toEqual([])
		expect(getStatic404s()).toEqual([])
	})
})
