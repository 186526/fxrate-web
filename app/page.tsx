import Index from "@/componets/index"

import packageJson from "../package.json"
import buildId from "next-build-id"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { Suspense } from "react"

// 薄壳：不做任何服务端数据拉取（所有汇率数据由客户端 Index 经 JSON-RPC 拉取），
// 只提供 buildId/buildTime/version 元数据 props；URL 状态由客户端 useSearchParams 恢复
export default async function Home() {
	// Turbopack 下 __dirname 不可靠，用 import.meta.url 推导（next-build-id 需要真实目录）
	const dir = dirname(fileURLToPath(import.meta.url))
	const build = await buildId({ dir, describe: true })

	return (
		<main style={{ width: "100%" }}>
			<Suspense>
				<Index
					buildId={build}
					buildTime={process.env.FXBUILD_TIME ?? ""}
					version={packageJson.version}
				/>
			</Suspense>
		</main>
	)
}
