import { NextResponse, type NextRequest } from "next/server";

// Phase 4B 任务 13：nonce-based CSP（Next 16 文档模式，不用 unsafe-inline）。
// proxy 为每个 HTML 请求生成唯一 nonce，写入请求头 x-nonce（供 layout 的
// beforeInteractive 主题脚本与 Next 自身脚本/style 使用）与响应头 CSP。
// 仅在 production 注入 CSP：dev 的 HMR websocket / React dev eval 不受 nonce 保护，
// 注入会干扰开发工具链；x-nonce 恒设置，保证主题脚本随时合规。

const CSP_SCRIPT_HOSTS = "https://analytics.real186526.cn";

// 生成每请求唯一 CSP nonce：16 随机字节 → base64（CSP nonce-source 语法要求
// base64-value）。只用 Web Crypto API，兼容 Next proxy 的 Node 运行时。
export const generateCspNonce = (): string => {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
};

// 构建 nonce-based CSP。script-src 显式列 host + nonce（无 'unsafe-inline'）；
// style-src 保留 'unsafe-inline'（MUI/Emotion 运行时注入 <style> 与 style 属性）。
export const buildCspHeader = (nonce: string): string =>
	[
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}' ${CSP_SCRIPT_HOSTS}`,
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self' data:",
		`connect-src 'self' https://fxrate.sunoaki.net ${CSP_SCRIPT_HOSTS}`,
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join("; ");

export function proxy(request: NextRequest) {
	const nonce = generateCspNonce();

	// 请求头注入 x-nonce：layout 的 headers() 读取它，Next 渲染器也从请求 CSP 头
	// 提取 nonce 并自动加到自身的脚本/style（文档模式，见 Next CSP guide）。
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-nonce", nonce);
	const csp =
		process.env.NODE_ENV === "production" ? buildCspHeader(nonce) : null;
	if (csp) requestHeaders.set("Content-Security-Policy", csp);

	const response = NextResponse.next({ request: { headers: requestHeaders } });

	// 响应头：构建标识/时间 + nonce + production CSP（浏览器执行用）。
	response.headers.set("x-fx-release", process.env.FXBUILD_ID ?? "dev");
	response.headers.set("x-fx-build-time", process.env.FXBUILD_TIME ?? "dev");
	response.headers.set("x-nonce", nonce);
	if (csp) response.headers.set("Content-Security-Policy", csp);
	return response;
}

export const config = {
	matcher: [
		"/",
		"/matrix",
		"/api-docs",
		// API 响应也保留 x-fx-release（nginx 缓存键），但忽略 next/link 的 RSC 预取：
		// 预取不需要 nonce/CSP，避免给预取请求也做动态渲染。
		{
			source: "/api/:path*",
			missing: [{ type: "header", key: "next-router-prefetch" }],
		},
	],
};
