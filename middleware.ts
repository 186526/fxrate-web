import { NextResponse } from "next/server";

// 响应头带构建标识（FXBUILD_TIME 每次构建不同）：
// nginx proxy_cache_key 引用 $upstream_http_x_fx_release，
// 发版后构建时间变化 → 缓存 key 变化 → 整站缓存自动失效，无需手动清缓存。
export function middleware() {
	const res = NextResponse.next();
	res.headers.set("x-fx-release", process.env.FXBUILD_TIME ?? "dev");
	return res;
}

export const config = {
	matcher: ["/", "/matrix", "/api-docs", "/api/:path*"],
};
