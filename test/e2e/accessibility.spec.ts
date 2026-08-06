import { expect, Page, test } from "@playwright/test"
import AxeBuilder from "@axe-core/playwright"
import { mockJsonRpcRoutes } from "./helpers/mockJsonRpc"

function collectPageErrors(page: Page) {
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(String(e)))
	return () => errors
}

// axe 节点白名单：只放行"既有设计层"的精确节点（rule id + target/html 都须匹配），
// 一个违规若含任何未白名单节点仍会失败——gate 不会随名单整体放宽。
// 证据（全部为 color-contrast，serious，实测 axe 输出）：
// - 表头 muted（已加深为 #5a666e，见 componets/theme.tsx）于 surfaceMuted (#f3f0ea) 对比度
//   5.19:1、矩阵价格类型未选中 ToggleButton muted 于 action.hover 对比度 5.18:1，均已达标，
//   不再需要白名单（曾放行 MuiTableSortLabel/MuiTableCell-head/MuiToggleButtonGroup）。
// - fxlistgrid "更新时间" RelativeTime caption 与 footer 两个版本 caption 同为 text.secondary，
//   非交互装饰性次要文字。
// 均为既有主题设计层问题；此处逐节点精确放行，不整体跳过 serious 级。
const WHITELIST: {
	id: string
	target?: RegExp
	html?: RegExp
}[] = [
	// RelativeTime"更新时间"（aria-label 出现在 axe target 里）
	{ id: "color-contrast", target: /数据更新时间/, html: /数据更新时间/ },
	// footer 两个版本 tooltip caption（按 aria-label 在 html 中匹配）
	{ id: "color-contrast", html: /aria-label="后端 fxrate@/ },
	{ id: "color-contrast", html: /aria-label="fxrate-web v/ },
]

function nodeWhitelisted(
	id: string,
	node: { target: unknown; html: string }
): boolean {
	// axe NodeResult.target 的类型是 UnlabelledFrameSelector（联合类型），运行时是 CSS 选择器数组
	const targetText = Array.isArray(node.target)
		? node.target.join(" ")
		: String(node.target ?? "")
	return WHITELIST.some(
		(w) =>
			w.id == id &&
			((w.target && w.target.test(targetText)) ||
				(w.html && w.html.test(node.html)))
	)
}

async function assertNoSeriousViolations(page: Page) {
	const results = await new AxeBuilder({ page }).analyze()
	const failing = results.violations
		.filter((v) => v.impact == "serious" || v.impact == "critical")
		.map((v) => ({
			id: v.id,
			impact: v.impact,
			help: v.help,
			nodes: v.nodes
				.filter((n) => !nodeWhitelisted(v.id, n))
				.map((n) => ({ target: n.target, html: n.html })),
		}))
		.filter((v) => v.nodes.length > 0)
	expect(failing, JSON.stringify(failing, null, 2)).toEqual([])
}

test.describe("accessibility smoke", () => {
	test("单对视图无 axe serious+critical 违规（白名单仅限既有对比度节点）", async ({
		page,
	}) => {
		mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)
		await page.goto("/")
		await expect(page.getByText("bankA").first()).toBeVisible({
			timeout: 60_000,
		})

		await assertNoSeriousViolations(page)
		expect(getErrors()).toEqual([])
	})

	test("矩阵视图无 axe serious+critical 违规", async ({ page }) => {
		mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)
		await page.goto("/matrix?from=CNY&amount=100&precision=4")
		await expect(page.getByText(/以 CNY 为基准/)).toBeVisible({
			timeout: 60_000,
		})
		await expect(page.getByText("bankA").first()).toBeVisible({
			timeout: 60_000,
		})

		await assertNoSeriousViolations(page)
		expect(getErrors()).toEqual([])
	})

	for (const width of [320, 360]) {
		for (const view of ["pair", "matrix"] as const) {
			test(`${width}px ${view == "pair" ? "单对" : "矩阵"} header/chooser/ISO/Tab 焦点与操作目标可用`, async ({
				page,
			}, testInfo) => {
				await page.setViewportSize({ width, height: 720 })
				mockJsonRpcRoutes(page)
				const getErrors = collectPageErrors(page)
				await page.goto(
					view == "pair" ? "/" : "/matrix?from=CNY&amount=100&precision=4"
				)
				await expect(page.getByText("bankA").first()).toBeVisible({
					timeout: 60_000,
				})

				const layout = await page.evaluate((currentView) => {
					const header = document.querySelector("header")!.getBoundingClientRect()
					const chooser = document
						.querySelector("#from-currency")!
						.closest(".MuiPaper-root")!
						.getBoundingClientRect()
					const inputIds =
						currentView == "pair"
							? ["from-currency", "to-currency"]
							: ["from-currency"]
					const isoInputs = inputIds.map((id) => {
						const input = document.querySelector<HTMLInputElement>(`#${id}`)!
						const target = input.closest(".MuiInputBase-root")!.getBoundingClientRect()
						return {
							value: input.value,
							textFits: input.scrollWidth <= input.clientWidth,
							left: target.left,
							right: target.right,
							width: target.width,
							height: target.height,
						}
					})
					return {
						documentWidth: document.documentElement.scrollWidth,
						viewportWidth: document.documentElement.clientWidth,
						headerLeft: header.left,
						headerRight: header.right,
						chooserLeft: chooser.left,
						chooserRight: chooser.right,
						isoInputs,
					}
				}, view)
				expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
				expect(layout.headerLeft).toBeGreaterThanOrEqual(0)
				expect(layout.headerRight).toBeLessThanOrEqual(width)
				expect(layout.chooserLeft).toBeGreaterThanOrEqual(0)
				expect(layout.chooserRight).toBeLessThanOrEqual(width)
				for (const input of layout.isoInputs) {
					expect(input.value).toMatch(/\b[A-Z]{3}\b/)
					expect(input.textFits).toBe(true)
					expect(input.left).toBeGreaterThanOrEqual(layout.chooserLeft)
					expect(input.right).toBeLessThanOrEqual(layout.chooserRight)
					expect(input.width).toBeGreaterThanOrEqual(40)
					expect(input.height).toBeGreaterThanOrEqual(40)
				}

				// xs 下五个 header 操作收进「更多」溢出菜单：触发按钮可见且 ≥40px，
				// 五个操作按钮本身 display:none（不进 a11y 树）；「切换金额单位」仍在
				// 选择器内可见。focus 检查需在打开菜单之前进行（菜单会捕获焦点）。
				const moreBtn = page.getByRole("button", { name: "更多", exact: true })
				await expect(moreBtn).toBeVisible()
				const moreBox = await moreBtn.boundingBox()
				expect(moreBox?.width).toBeGreaterThanOrEqual(40)
				expect(moreBox?.height).toBeGreaterThanOrEqual(40)
				for (const name of ["小数精度", "交叉汇率", "刷新", "API 文档", "切换主题"]) {
					await expect(
						page.getByRole("button", { name, exact: true })
					).toHaveCount(0)
				}
				const unitBox = await page
					.getByRole("button", { name: "切换金额单位" })
					.boundingBox()
				expect(unitBox?.width).toBeGreaterThanOrEqual(40)
				expect(unitBox?.height).toBeGreaterThanOrEqual(40)
				for (const name of ["单对报价", "全对矩阵"]) {
					const box = await page.getByRole("tab", { name }).boundingBox()
					expect(box?.width).toBeGreaterThanOrEqual(40)
					expect(box?.height).toBeGreaterThanOrEqual(40)
				}

				// 键盘 Tab 进入选中 Tab（MUI Tabs roving tabindex：仅选中 Tab 在 tab 序中）。
				// 此时顺序导航起点在文档开头，header 内首个可聚焦元素即选中 Tab。
				// 不能用程序化 .focus()：按钮类元素只有键盘导航才匹配 :focus-visible，
				// 且聚焦金额输入会把顺序导航起点挪到其后，导致 Tab 落不到 Tab 上。
				const activeTab = page.getByRole("tab", {
					name: view == "pair" ? "单对报价" : "全对矩阵",
				})
				await page.keyboard.press("Tab")
				await expect(activeTab).toBeFocused()
				const tabFocus = await activeTab.evaluate((tab) => {
					const tabRect = tab.getBoundingClientRect()
					const scroller = tab.closest(".MuiTabs-scroller")!.getBoundingClientRect()
					const style = getComputedStyle(tab)
					return {
						outlineStyle: style.outlineStyle,
						outlineWidth: parseFloat(style.outlineWidth),
						outlineOffset: parseFloat(style.outlineOffset),
						tabLeft: tabRect.left,
						tabRight: tabRect.right,
						tabTop: tabRect.top,
						tabBottom: tabRect.bottom,
						scrollerLeft: scroller.left,
						scrollerRight: scroller.right,
						scrollerTop: scroller.top,
						scrollerBottom: scroller.bottom,
					}
				})
				expect(tabFocus.outlineStyle).not.toBe("none")
				expect(tabFocus.outlineWidth).toBeGreaterThanOrEqual(2)
				expect(tabFocus.outlineOffset).toBeLessThanOrEqual(-2)
				expect(tabFocus.tabLeft).toBeGreaterThanOrEqual(tabFocus.scrollerLeft)
				expect(tabFocus.tabRight).toBeLessThanOrEqual(tabFocus.scrollerRight)
				expect(tabFocus.tabTop).toBeGreaterThanOrEqual(tabFocus.scrollerTop)
				expect(tabFocus.tabBottom).toBeLessThanOrEqual(tabFocus.scrollerBottom)

				// 原生金额输入：获得焦点后必须命中品牌 focus-visible 环
				// （Chrome 对文本/数字输入无论聚焦方式都匹配 :focus-visible，可用程序化 focus）。
				const amountInput = page.getByRole("spinbutton")
				await amountInput.focus()
				const inputFocusStyle = await page.evaluate(() => {
					const active = document.activeElement as HTMLElement
					const style = getComputedStyle(active)
					return {
						outlineStyle: style.outlineStyle,
						outlineWidth: parseFloat(style.outlineWidth),
					}
				})
				expect(inputFocusStyle.outlineStyle).not.toBe("none")
				expect(inputFocusStyle.outlineWidth).toBeGreaterThanOrEqual(2)

				// 打开溢出菜单：五个操作以 menuitem 呈现，保持 ≥40px 目标与键盘可达。
				// MUI Menu 用 Grow 动画进入（~225ms），动画期间 boundingBox 是缩放中的
				// 瞬态值（高度约 40*0.6），先 poll 到高度稳定再测量
				await moreBtn.click()
				for (const name of ["小数精度", "交叉汇率", "刷新", "API 文档", "切换主题"]) {
					const item = page.getByRole("menuitem", { name, exact: true })
					await expect(item).toBeVisible()
					// boundingBox 是异步的：poll 回调必须 await，否则 .height 取在
					// Promise 上恒为 undefined（→0），predicate 永不通过
					await expect
						.poll(async () => (await item.boundingBox())?.height ?? 0)
						.toBeGreaterThanOrEqual(40)
					const box = await item.boundingBox()
					expect(box?.width).toBeGreaterThanOrEqual(40)
					expect(box?.height).toBeGreaterThanOrEqual(40)
				}
				await page.keyboard.press("Escape")
				await expect(moreBtn).toBeVisible()

				await testInfo.attach(`${view}-${width}px`, {
					body: await page.screenshot({ fullPage: true }),
					contentType: "image/png",
				})
				expect(getErrors()).toEqual([])
			})
		}
	}
})
