import { describe, expect, it } from "vitest"
import { assertLighthouseSla } from "../../scripts/bench/lighthouse-sla.mjs"

const report = (fcp: number, lcp: number, score: number) => ({
	 audits: {
		"first-contentful-paint": { numericValue: fcp },
		"largest-contentful-paint": { numericValue: lcp },
	 },
	 categories: { performance: { score: score / 100 } },
})

describe("lighthouse SLA", () => {
	it("accepts metrics within configured thresholds", () => {
		expect(() => assertLighthouseSla(report(900, 1800, 90), {
			"max-fcp-ms": 1000,
			"max-lcp-ms": 2000,
			"min-performance-score": 85,
		})).not.toThrow()
	})

	it("reports threshold failures", () => {
		expect(() => assertLighthouseSla(report(1100, 2200, 80), {
			"max-fcp-ms": 1000,
			"max-lcp-ms": 2000,
			"min-performance-score": 85,
		}, "mobile")).toThrow(/mobile/)
	})
})
