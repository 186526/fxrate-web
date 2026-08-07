// @vitest-environment jsdom
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { createTheme, ThemeProvider } from "@mui/material/styles"

import Loading from "@/app/loading"
import MatrixLoading from "@/app/matrix/loading"
import { ListTableSkeleton, MatrixTableSkeleton } from "@/componets/tableSkeleton"

const theme = createTheme({
	palette: {
		primary: { main: "#2f6f73" },
		brandSoft: "rgba(47,111,115,0.14)",
		surfaceMuted: "#f1ede4",
	},
})

function renderLoading(component: React.ReactNode) {
	return render(<ThemeProvider theme={theme}>{component}</ThemeProvider>)
}

describe("route loading skeleton", () => {
	it("根路由显示单对报价骨架", () => {
		renderLoading(<Loading />)
		expect(screen.getByRole("columnheader", { name: "购钞价" })).toBeInTheDocument()
		expect(screen.queryByRole("columnheader", { name: /USD/ })).not.toBeInTheDocument()
	})

	it("矩阵路由显示货币矩阵骨架", () => {
		renderLoading(<MatrixLoading />)
		expect(screen.getByRole("columnheader", { name: /USD/ })).toBeInTheDocument()
		expect(screen.queryByRole("columnheader", { name: "购钞价" })).not.toBeInTheDocument()
	})

	it("客户端单对骨架自身暴露 role=status 加载语义", () => {
		renderLoading(<ListTableSkeleton />)
		expect(
			screen.getByRole("status", { name: "正在加载汇率数据" })
		).toBeInTheDocument()
	})

	it("客户端矩阵骨架自身暴露 role=status 加载语义", () => {
		renderLoading(<MatrixTableSkeleton />)
		expect(
			screen.getByRole("status", { name: "正在加载汇率数据" })
		).toBeInTheDocument()
	})

	it("路由加载壳恰好渲染一个 status 区域（骨架自带，不嵌套重复 live region）", () => {
		renderLoading(<Loading />)
		expect(screen.getAllByRole("status")).toHaveLength(1)
	})
})
