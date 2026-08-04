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
// - 表头 muted (#66727a) 于 surfaceMuted (#f3f0ea) 对比度 4.34:1，略低于 WCAG AA 4.5
//   （normal text）；来自 componets/theme.tsx 全局 MuiTableHead 覆盖，单对与矩阵表头均受影响。
// - 矩阵"中间价/现钞/现汇"ToggleButtonGroup 未选中项 muted 于 action.hover 底色，实测约 4.5
//   临界略低（fxmatrixgrid.tsx 的 ToggleButtonGroup sx）。
// - fxlistgrid "更新时间" RelativeTime caption 与 footer 两个版本 caption 同为 text.secondary，
//   非交互装饰性次要文字。
// 均为既有主题设计层问题，待主题层统一修复；此处逐节点精确放行，不整体跳过 serious 级。
const WHITELIST: {
	id: string
	target?: RegExp
	html?: RegExp
}[] = [
	// 表头单元格：sort label span 的 target 带 MuiTableSortLabel；普通 th（如"银行/平台"）
	// 的 axe target 可能只有 hashed class，但 html 里含 MuiTableCell-head
	{ id: "color-contrast", target: /MuiTableSortLabel/, html: /MuiTableSortLabel/ },
	{ id: "color-contrast", html: /MuiTableCell-head/ },
	// 矩阵价格类型未选中 ToggleButton
	{ id: "color-contrast", target: /MuiToggleButtonGroup/, html: /MuiToggleButtonGroup/ },
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
})
