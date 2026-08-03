import APIDocs from "@/componets/apidocs";

// 后端 API 文档页：内容基于 lib/fxrate/docs/api.md，客户端实时拉取实例信息。
// 直接渲染 APIDocs（组件内部自带 main），避免 SSR 时外层 main/Suspense 与 Emotion 全局样式注入顺序错位导致 hydration mismatch
export default function APIDocsPage() {
	return <APIDocs />;
}
