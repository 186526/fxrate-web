import type { Page } from "@playwright/test"

export function collectPageErrors(page: Page): () => string[] {
	const errors: string[] = []
	page.on("pageerror", (error) => errors.push(String(error)))
	return () => errors
}

export function collectStaticResource404s(page: Page): () => string[] {
	const notFound: string[] = []
	const staticTypes = new Set(["stylesheet", "script", "image", "font"])
	page.on("response", (response) => {
		const request = response.request()
		const url = new URL(response.url())
		if (url.hostname != "localhost" && url.hostname != "127.0.0.1") return
		if (response.status() != 404 || !staticTypes.has(request.resourceType())) {
			return
		}
		// /bank-logos/* 图片 404 属预期：mock 环境没有这些 logo 文件，SourceIcon
		// 有设计的 onError 本地兜底（降级类型图标）；其余 static 404 仍按异常上报。
		if (
			request.resourceType() == "image" &&
			url.pathname.startsWith("/bank-logos/")
		) {
			return
		}
		notFound.push(`${request.resourceType()} ${response.url()}`)
	})
	return () => notFound
}
