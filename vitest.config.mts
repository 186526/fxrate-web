import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		include: ["test/frontend/**/*.test.{ts,tsx}"],
		exclude: ["test/e2e/**", "node_modules/**"],
		environment: "node",
		setupFiles: ["./test/frontend/setup.ts"],
		restoreMocks: true,
		clearMocks: true,
		globals: true,
		env: {
			FXRATE_API: "http://127.0.0.1:1/v1/jsonrpc",
		},
	},
	resolve: {
		alias: {
			"@": import.meta.dirname,
		},
	},
})
