import Index from "@/componets/index"
import { prefetchDefaultView } from "@/componets/ssr-prefetch"

import packageJson from "../package.json"
import buildId from "next-build-id"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { Suspense } from "react"

// 默认视图（/ 且参数为默认）做 SSR 预取，首屏直接带数据、客户端不再白屏等请求；
// 非默认参数保持纯客户端（历史卡顿根因 = 每次 URL 变化都触发整轮服务端重拉，
// 因此 URL 参数变化绝不触发服务端数据请求）。预取失败降级为薄壳，行为同旧版。
export default async function Home({
	searchParams,
}: {
	searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
	// Turbopack 下 __dirname 不可靠，用 import.meta.url 推导（next-build-id 需要真实目录）
	const dir = dirname(fileURLToPath(import.meta.url))
	const build = await buildId({ dir, describe: true })

	const params = await searchParams
	const initial = await prefetchDefaultView(params)

	return (
		<main style={{ width: "100%" }}>
			<Suspense>
				<Index
					buildId={build}
					buildTime={process.env.FXBUILD_TIME ?? ""}
					version={packageJson.version}
					initialCurrencies={initial.initialCurrencies}
					initialResult={initial.initialResult}
					initialBackendVersion={initial.initialBackendVersion}
				/>
			</Suspense>
		</main>
	)
}
