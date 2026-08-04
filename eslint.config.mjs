import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

export default defineConfig([
	...nextVitals,
	...nextTs,
	globalIgnores([
		".next/**",
		"out/**",
		"build/**",
		"next-env.d.ts",
		"lib/fxrate/**",
	]),
	{
		// 客户端 hydration/SWR 模块：挂载 effect 中同步外部系统（localStorage/URL）到 state
		// 属必要模式，降为 warning；其余文件维持默认 error。核心规则保持 error。
		files: [
			"componets/index.tsx",
			"componets/fxmatrixgrid.tsx",
			"componets/theme.tsx",
			"componets/bestPriceSources.ts",
		],
		rules: {
			"react-hooks/set-state-in-effect": "warn",
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/refs": "error",
		},
	},
	{
		files: ["test/e2e/mock-server/**/*.cjs"],
		rules: {
			"@typescript-eslint/no-require-imports": "off",
		},
	},
])
