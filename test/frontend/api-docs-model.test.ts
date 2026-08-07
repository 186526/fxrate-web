import { describe, expect, it } from "vitest"

import {
	API_ENDPOINTS,
	REST_ENDPOINTS,
	RPC_ENDPOINTS,
	buildRestPath,
	buildRpcBody,
	filterEndpoints,
	getDefaultValues,
} from "@/componets/api-docs/model"

describe("API Docs endpoint model", () => {
	it("builds REST paths with the documented precision default and typed query values", () => {
		const endpoint = REST_ENDPOINTS.find((item) => item.id == "rest-pair")
		expect(endpoint).toBeDefined()
		if (!endpoint) return

		const defaults = getDefaultValues(endpoint)
		expect(defaults.precision).toBe("5")
		expect(buildRestPath(endpoint, defaults)).toBe(
			"/boc/USD/CNY?amount=100&precision=5&fees=0"
		)
		expect(
			buildRestPath(endpoint, {
				...defaults,
				source: "hsbc.cn",
				from: "US D",
				reverse: "true",
				bfs: "true",
				pretty: "true",
			})
		).toBe(
			"/hsbc.cn/US%20D/CNY?amount=100&precision=5&fees=0&reverse=true&bfs=true&pretty=true"
		)
	})

	it("matches the actual JSON-RPC client signatures and defaults", () => {
		const listCurrencies = RPC_ENDPOINTS.find((item) => item.id == "rpc-list-currencies")
		const listRates = RPC_ENDPOINTS.find((item) => item.id == "rpc-list-rates")
		const getRate = RPC_ENDPOINTS.find((item) => item.id == "rpc-get-rate")
		expect(listCurrencies?.params.map((param) => param.name)).toEqual(["source"])
		expect(listRates?.params.map((param) => param.name)).toEqual([
			"source",
			"from",
			"precision",
			"amount",
			"fees",
			"reverse",
			"bfs",
		])
		expect(getRate?.params.map((param) => param.name)).toEqual([
			"source",
			"from",
			"to",
			"type",
			"precision",
			"amount",
			"fees",
			"reverse",
			"bfs",
		])
		if (!getRate) return
		expect(buildRpcBody(getRate, getDefaultValues(getRate))).toEqual({
			jsonrpc: "2.0",
			id: 1,
			method: "getFXRate",
			params: {
				source: "boc",
				from: "USD",
				to: "CNY",
				type: "all",
				precision: 2,
				amount: 100,
				fees: 0,
				reverse: false,
				bfs: false,
			},
		})
	})

	it("filters locally by protocol, method, path, title, and parameter text", () => {
		expect(filterEndpoints(API_ENDPOINTS, "", "rest")).toHaveLength(4)
		expect(filterEndpoints(API_ENDPOINTS, "listCurrencies", "all").map((item) => item.id)).toEqual([
			"rpc-list-currencies",
		])
		expect(filterEndpoints(API_ENDPOINTS, "手续费", "rpc").map((item) => item.id)).toEqual([
			"rpc-list-rates",
			"rpc-get-rate",
		])
		expect(filterEndpoints(API_ENDPOINTS, "/:source/:from/:to", "rest").map((item) => item.id)).toEqual([
			"rest-pair",
			"rest-convert",
		])
	})
})
