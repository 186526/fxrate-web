export const assertLighthouseSla = (lhr, options = {}, preset = "unknown") => {
	const fcp = lhr.audits["first-contentful-paint"]?.numericValue
	const lcp = lhr.audits["largest-contentful-paint"]?.numericValue
	const performanceScore = (lhr.categories.performance?.score ?? 0) * 100
	const failures = []
	if (options["max-fcp-ms"] != null && (fcp == null || fcp > options["max-fcp-ms"])) failures.push("FCP threshold exceeded")
	if (options["max-lcp-ms"] != null && (lcp == null || lcp > options["max-lcp-ms"])) failures.push("LCP threshold exceeded")
	if (options["min-performance-score"] != null && performanceScore < options["min-performance-score"]) failures.push("performance score below threshold")
	if (failures.length > 0) throw new Error("Lighthouse SLA failed (" + preset + "): " + failures.join("; "))
}
