import Index from "@/componets/index"

import packageJson from "../../package.json"

import { Suspense } from "react"

// 薄壳：不做任何服务端数据拉取（所有汇率数据由客户端 Index 经 JSON-RPC 拉取），
// 只提供 buildId/buildTime/version 元数据 props；矩阵方向/基准由客户端 URL 恢复
export default function MatrixPage() {
	return (
		<main style={{ width: "100%" }}>
			<Suspense>
				<Index
					buildId={process.env.FXBUILD_ID ?? "development"}
					buildTime={process.env.FXBUILD_TIME ?? ""}
					version={packageJson.version}
				/>
			</Suspense>
		</main>
	)
}
