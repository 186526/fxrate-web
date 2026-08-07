import { expect, test } from "@playwright/test"
import { mockJsonRpcRoutes } from "./helpers/mockJsonRpc"
import {
	collectPageErrors,
	collectStaticResource404s,
} from "./helpers/pageDiagnostics"

test.describe("route loading shell", () => {
	test("矩阵路由加载阶段由客户端 MatrixTableSkeleton 接管，listFXRates 返回前不回退成单对骨架", async ({
		page,
	}) => {
		// 持有浏览器层第一个 listFXRates JSON-RPC 批次：矩阵数据未到达前，页面
		// 必须保持矩阵客户端骨架（role=status + 货币列头、无单对列头）。不再依赖
		// loading.tsx 边界——/matrix 是同步薄壳，路由壳并不保证出现，实际 UX 是
		// Index 的客户端 MatrixTableSkeleton（初始加载态 + 浏览器 JSON-RPC 拉数）。
		const mock = mockJsonRpcRoutes(page, { hold: ["listFXRates"] })
		const getErrors = collectPageErrors(page)
		const getStatic404s = collectStaticResource404s(page)
		await page.goto("/matrix?from=CNY&amount=100&precision=4")

		// 释放前：listFXRates 被 latch 持有 → 矩阵骨架必须保持，且请求确实已发出
		const loading = page.getByRole("status", { name: "正在加载汇率数据" })
		await expect(loading).toBeVisible({ timeout: 15_000 })
		await expect(loading.getByRole("columnheader", { name: /USD/ })).toBeVisible()
		await expect(
			loading.getByRole("columnheader", { name: "购钞价" })
		).toHaveCount(0)
		await expect
			.poll(() => mock.count("listFXRates"), { timeout: 15_000 })
			.toBeGreaterThanOrEqual(1)

		// 释放后：矩阵数据到达，骨架被真实表格替换
		mock.release("listFXRates")
		await expect(page.getByText(/以 CNY 为基准/)).toBeVisible({
			timeout: 30_000,
		})
		await expect(page.getByText("bankA").first()).toBeVisible({
			timeout: 30_000,
		})
		await expect(loading).toHaveCount(0)

		expect(getErrors()).toEqual([])
		expect(getStatic404s()).toEqual([])
	})
})
