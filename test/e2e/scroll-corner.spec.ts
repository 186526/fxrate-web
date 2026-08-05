import { expect, Page, test } from "@playwright/test"
import { mockJsonRpcRoutes } from "./helpers/mockJsonRpc"

function collectPageErrors(page: Page) {
	const errors: string[] = []
	page.on("pageerror", (e) => errors.push(String(e)))
	return () => errors
}

test.describe("scroll-corner", () => {
	test("矩阵双轴滚动：角落格钉在容器左上角、层级最高，覆盖表头×首列交叉区", async ({
		page,
	}, testInfo) => {
		mockJsonRpcRoutes(page)
		const getErrors = collectPageErrors(page)

		// 窄视口制造横向滚动（矩阵 minWidth xs 780 / sm 960）；容器限高制造纵向滚动
		await page.setViewportSize({ width: 640, height: 800 })
		await page.goto("/matrix?from=CNY&amount=100&precision=4")
		await expect(page.getByText(/以 CNY 为基准/)).toBeVisible({
			timeout: 60_000,
		})
		// 等 3 个快源行渲染完（来源按名称排序，bankC 最后）
		await expect(page.getByText("bankC").first()).toBeVisible({
			timeout: 60_000,
		})

		const metrics = await page.evaluate(() => {
			const container = document.querySelector(
				".MuiTableContainer-root"
			) as HTMLElement
			// 双轴滚动场景必需：限高后表体才能纵向滚动（sticky 表头才有意义）
			container.style.maxHeight = "160px"
			container.scrollLeft = container.scrollWidth
			container.scrollTop = 100

			const corner = container.querySelector("thead th") as HTMLElement
			const headerTh = container.querySelector(
				"thead th:nth-child(2)"
			) as HTMLElement
			const bodyTh = container.querySelector(
				"tbody th[scope='row']"
			) as HTMLElement

			const cornerRect = corner.getBoundingClientRect()
			const containerRect = container.getBoundingClientRect()
			const headerRect = headerTh.getBoundingClientRect()
			// 正文首列 sticky left：垂直滚动只影响其 top，left/宽仍代表首列位置
			const bodyRect = bodyTh.getBoundingClientRect()

			const center = {
				x: cornerRect.left + cornerRect.width / 2,
				y: cornerRect.top + cornerRect.height / 2,
			}
			const topEl = document.elementFromPoint(center.x, center.y)

			return {
				scrollLeft: container.scrollLeft,
				scrollTop: container.scrollTop,
				containerLeft: containerRect.left,
				containerTop: containerRect.top,
				corner: {
					left: cornerRect.left,
					top: cornerRect.top,
					right: cornerRect.right,
					bottom: cornerRect.bottom,
				},
				headerBottom: headerRect.bottom,
				bodyRight: bodyRect.right,
				cornerZ: Number.parseInt(getComputedStyle(corner).zIndex, 10) || 0,
				headerZ: Number.parseInt(getComputedStyle(headerTh).zIndex, 10) || 0,
				bodyZ: Number.parseInt(getComputedStyle(bodyTh).zIndex, 10) || 0,
				coveredByCorner: corner.contains(topEl),
			}
		})

		// 双轴确实发生了滚动（否则断言无意义）
		expect(metrics.scrollLeft).toBeGreaterThan(0)
		expect(metrics.scrollTop).toBeGreaterThan(0)

		// 角落格钉在容器可视区左上角 —— 即 sticky 表头行与 sticky 首列的交叉点
		expect(metrics.corner.left).toBeGreaterThanOrEqual(
			metrics.containerLeft - 1
		)
		expect(metrics.corner.left).toBeLessThanOrEqual(metrics.containerLeft + 1)
		expect(metrics.corner.top).toBeGreaterThanOrEqual(metrics.containerTop - 1)
		expect(metrics.corner.top).toBeLessThanOrEqual(metrics.containerTop + 1)
		// 角落横向覆盖整个首列宽、纵向覆盖整个表头高
		expect(metrics.corner.right).toBeGreaterThanOrEqual(metrics.bodyRight - 1)
		expect(metrics.corner.bottom).toBeGreaterThanOrEqual(
			metrics.headerBottom - 1
		)

		// 层级：正文首列 1 < 表头（MUI stickyHeader 默认 2）< 角落（3）
		expect(metrics.bodyZ).toBe(1)
		expect(metrics.headerZ).toBe(2)
		expect(metrics.cornerZ).toBeGreaterThan(metrics.headerZ)

		// 命中测试：角落格中心的最上层元素属于角落格。横向滚动后货币表头会滑到
		// 角落下方，若角落与表头同层（zIndex 2），靠后的表头会盖住它 → 此处即回归
		expect(metrics.coveredByCorner).toBe(true)

		await testInfo.attach("matrix-dual-axis-scroll-corner", {
			body: await page.screenshot(),
			contentType: "image/png",
		})
		expect(getErrors()).toEqual([])
	})
})
