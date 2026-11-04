// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest"
import { getSourceMatrixRow } from "@/components/tools"
import { createDeferredBatchMock } from "./jsonrpc"

const isoNow = () => new Date().toISOString()

const okRate = () => ({
	middle: 7.1,
	cash: 7.05,
	remit: 7.08,
	updated: isoNow(),
})

// 等待补查名额的请求在下一轮微任务里被唤醒；用轮转让出事件循环，避免依赖具体轮数
const flush = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe("getSourceMatrixRow 补查并发名额", () => {
	afterEach(() => {
		vi.spyOn(console, "error").mockRestore()
	})

	it("占满名额的等待者被 abort 移除后，后续等待者仍被唤醒", async () => {
		const { stats, handles } = createDeferredBatchMock({ getFXRate: okRate })
		const row = (source: string) =>
			getSourceMatrixRow(source, ["USD"], ["USD"], "CNY")

		// 并发上限 4：前 4 个直接占用名额，其余排队
		const running = [
			row("bankA"),
			row("bankB"),
			row("bankC"),
			row("bankD"),
		]
		await flush()
		expect(stats.batches).toBe(4)

		const aborted = new AbortController()
		const abortedRow = getSourceMatrixRow("bankE", ["USD"], ["USD"], "CNY", {
			signal: aborted.signal,
		})
		const waiting = row("bankF")
		await flush()
		expect(stats.batches).toBe(4)

		// 排在最前的等待者被取消：名额应继续传给后面的等待者
		aborted.abort()
		await expect(abortedRow).rejects.toMatchObject({ name: "AbortError" })
		await flush()
		expect(stats.batches).toBe(5)

		handles.forEach((handle) => handle.resolve())
		await Promise.all([...running, waiting])
	})
})
