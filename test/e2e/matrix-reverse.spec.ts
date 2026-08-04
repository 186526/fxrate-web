import { expect, Page, test } from "@playwright/test"
import { mockJsonRpcRoutes } from "./helpers/mockJsonRpc"

function collectPageErrors(page: Page) {
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(String(e)))
	return () => errors
}

// 完整 document 加载计数：矩阵反向切换是客户端内 replaceState/router.push，不应发起 document 请求
function countDocumentNavigations(page: Page) {
	let count = 0
	page.on("request", (r) => {
		if (r.resourceType() === "document") count++
	})
	return () => count
}

const REVERSE_SEMANTICS = /每 100 单位各货币可兑换的 CNY 数量/

test.describe("matrix-reverse", () => {
	test("反向切换：URL 方向参数 to=、反向文案、零 document 导航、请求带 reverse=true", async ({
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
		// 等初始 pair 主批量与 visa 后台批量落地后再切矩阵，保证增量断言确定
		await page.waitForTimeout(1500)

		await page.getByRole("tab", { name: "全对矩阵" }).click()
		await expect(page.getByText(/以 CNY 为基准/)).toBeVisible({ timeout: 30_000 })
		await expect
			.poll(() => mock.count("listFXRates"), { timeout: 20_000 })
			.toBeGreaterThan(0)
		// 等矩阵数据与 URL 同步（router.push 完成）后取基线
		await page.waitForTimeout(1500)
		const navsBefore = navs()
		const fxListBefore = mock.count("listFXRates")

		// 点击金额单位切换按钮 → 矩阵反向（卖出方向）
		await page.getByRole("button", { name: "切换金额单位" }).click()

		// 1) URL 方向：正向 from= → 反向 to=
		await expect
			.poll(() => page.url(), { timeout: 15_000 })
			.toContain("/matrix?to=CNY")
		// 2) 反向可见语义文案
		await expect(page.getByText(REVERSE_SEMANTICS)).toBeVisible({
			timeout: 30_000,
		})

		// 3) 请求方向：反向触发新一轮 listFXRates，参数 reverse=true 且 from=CNY
		await expect
			.poll(() => mock.count("listFXRates"), { timeout: 20_000 })
			.toBeGreaterThan(fxListBefore)
		const reverseParams = mock
			.paramsOf("listFXRates")
			.filter((p) => p.reverse === true)
		expect(reverseParams.length).toBeGreaterThan(0)
		expect(reverseParams.every((p) => p.from == "CNY")).toBe(true)

		// 4) 全程无 document 级整页导航（replaceState + RSC 均客户端内完成）
		await page.waitForTimeout(1500)
		expect(navs() - navsBefore).toBe(0)

		// 5) 薄壳下客户端负责拉后端版本：pair → matrix 全程 footer 最终显示 fxrate@mock
		await expect(page.getByText(/后端 fxrate@mock/)).toBeVisible({
			timeout: 30_000,
		})
		expect(getErrors()).toEqual([])
	})

	test("直接加载 /matrix?to=CNY：URL 保持 to= 方向，反向文案与请求方向一致", async ({
		page,
	}) => {
		const mock = mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)

		await page.goto("/matrix?to=CNY&amount=100&precision=4")
		await expect(page.getByText(REVERSE_SEMANTICS)).toBeVisible({
			timeout: 60_000,
		})
		await expect(page.getByText("bankA").first()).toBeVisible({
			timeout: 60_000,
		})

		// URL 方向参数不被改写（只带 to，不带冲突的 from）
		expect(new URL(page.url()).searchParams.get("to")).toBe("CNY")
		expect(new URL(page.url()).searchParams.get("from")).toBeNull()

		// 浏览器层 matrix 拉取带 reverse=true
		await expect
			.poll(() => mock.count("listFXRates"), { timeout: 20_000 })
			.toBeGreaterThan(0)
		await page.waitForTimeout(1500)
		const reverseParams = mock
			.paramsOf("listFXRates")
			.filter((p) => p.reverse === true)
		expect(reverseParams.length).toBeGreaterThan(0)

		// 薄壳：直接加载矩阵时客户端拉后端版本并显示在 footer（此前 SSR 预取会跳过客户端
		// info()，footer 缺失后端版本）；浏览器层应真实发生 instanceInfo 请求
		await expect(page.getByText(/后端 fxrate@mock/)).toBeVisible({
			timeout: 60_000,
		})
		await expect
			.poll(() => mock.count("instanceInfo"), { timeout: 15_000 })
			.toBeGreaterThan(0)
		expect(getErrors()).toEqual([])
	})
})
