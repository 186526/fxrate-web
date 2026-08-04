import { FXListProps } from "@/componets/fxlistgrid"
import FXRates, { infoResponse, fxRateResponse } from "@/lib/fxrate/src/client"
import { LRUCache } from "lru-cache"
import { cache as reactCache } from "react"

// 构造 FXRates client：优先 FXRATE_API（仅服务端注入），否则走同源代理 /api/fxrate
function buildClient(): FXRates {
	return new FXRates(
		process.env.FXRATE_API
			? new URL(process.env.FXRATE_API)
			: new URL(
					"/api/fxrate",
					typeof window == "undefined"
						? "http://localhost:3000"
						: window.location.origin
			  )
	)
}

// 浏览器端默认 client：客户端 JS 单上下文，模块级单例即可（兼容既有 FXRate 导入）
export const FXRate = buildClient()

// 服务端请求级 client：React.cache 让每次 RSC 请求拿到独立 FXRates 实例，
// 不共享 batch()/done()/请求队列等可变状态，避免并发请求互相污染
const getServerClient = reactCache(() => buildClient())

// 取当前执行环境适用的 client：浏览器返回默认单例，服务端返回请求级实例。
// 所有 tools.ts 数据拉取都经此入口（injection 模式）
export function getFXRateClient(): FXRates {
	return typeof window == "undefined" ? getServerClient() : FXRate
}

// 后端个别源（如 cfets）可能返回 "Invalid Date" 字符串：
// 无效日期回退为当前时间，避免 toISOString() 抛 RangeError 导致整页 500
export function safeUpdated(v: Date | string | number | undefined): Date {
	const d = new Date(v as string | number | Date)
	return Number.isNaN(d.getTime()) ? new Date() : d
}

// 不参与最优价高亮的数据源：央行参考牌价不可成交，高亮会误导
export const bestPriceExcludeSources = new Set(["pboc"])

// 反爬抓取慢的数据源（Visa 走 headless chromium 降级，查询不支持的货币时可达 30s+）：
// 单对视图拆出主批量单独请求，矩阵视图默认不请求、点击后单独加载
// （MasterCard 实测毫秒级，不在此列，单对走主批量、矩阵默认自动加载）
export const SLOW_SOURCES = new Set(["visa"])

// 各来源官方外汇牌价页 URL（用于银行行跳转"查看官方牌价"）。
// 全部经 exa 搜索确认为各银行官网公开牌价栏目；boc/ccb/cmb/icbc/abc/bocom 另经 Chrome 实测打开。
export const sourceRatesURL: Record<string, string> = {
	"pboc": "https://www.pbc.gov.cn/zhengcehuobisi/125207/125217/125925/index.html",
	"unionpay": "https://www.unionpayintl.com/cn/rate/",
	"mastercard": "https://www.mastercard.com/cn/zh/personal/get-support/currency-exchange-rate-converter.html",
	"wise": "https://wise.com/zh-cn/currency-converter/",
	"visa": "https://www.visa.cn/support/consumer/travel-support/exchange-rate-calculator.html",
	"jcb": "https://www.specialoffers.jcb/zh-tw/services/other/rate/",
	"abc": "https://ewealth.abchina.com.cn/ForeignExchange/ListPrice/",
	"cmb": "https://fx.cmbchina.com/hq",
	"icbc": "https://www.icbc.com.cn/column/1438058341489590354.html",
	"boc": "https://www.boc.cn/sourcedb/whpj/",
	"bochk": "https://www.bochk.com/sc/investment/rates/fxrates.html",
	"ccb": "https://www2.ccb.com/chn/forex/exchange-quotations.shtml",
	"psbc": "https://www.psbc.com/cn/common/bjfw/whpjcx/",
	"bocom": "https://www.bankcomm.com/BankCommSite/shtml/jyjr/cn/7158/7161/8091/list.shtml",
	"cibHuanyu": "https://www.cib.com.cn/cn/demo/corporate/HeadWeb/customer/foreignBulletin/index.html?FUNID=580000%7C690050",
	"cib": "https://www.cib.com.cn/cn/demo/corporate/HeadWeb/customer/foreignBulletin/index.html?FUNID=580000%7C690050",
	"hsbc.cn": "https://www.services.cn-banking.hsbc.com.cn/PublicContent/common/rate/zh/exchange-rates.html",
	"hsbc.hk": "https://www.hsbc.com.hk/investments/products/foreign-exchange/currency-rate/",
	"hsbc.au": "https://www.hsbc.com.au/foreign-exchange/real-time-rates/",
	"citic.cn": "https://go.citicbank.com/ywrk_whpj",
	"spdb": "https://www.spdb.com.cn/wh_pj/index.shtml",
	"ncb.cn": "https://www.ncbchina.cn/website/ncb-zh/view/marketFinance/market_02_01.html",
	"ncb.hk": "https://www.ncb.com.hk/nanyang_bank/zh-hans/html/14ab.html",
	"xib": "https://www.xib.com.cn/foreign-exchange/",
	"pab": "https://bank.pingan.com/geren/waihuipaijia.shtml",
	"ceb": "https://www.cebbank.com/site/ygzx/whpj/index.html",
	"cfets": "https://www.chinamoney.com.cn/chinese/index.html",
	"dbs": "https://www.dbs.com.sg/personal/rates-online/foreign-currency-foreign-exchange.page",
	"dbs.cn": "https://www.dbs.com.cn/personal/rates-online/foreign-currency-foreign-exchange.page",
	"dbs.hk": "https://www.dbs.com.hk/personal/rates-online/foreign-currency-foreign-exchange.page",
	"alipay": "https://render.alipay.com/p/s/currency-converter-sem/",
	"cmbc": "https://www.cmbc.com.cn/sy/xqsj/wh/dgjsh/",
	"cgb": "https://www.cgbchina.com.cn/Info/12154717",
	"hxb": "https://sbank.hxb.com.cn/gateway/forexquote.jsp",
	"cbhb": "https://www.cbhb.com.cn/cbhbank/jrgj/whpj/index.shtml",
	"bob": "https://www.bankofbeijing.com.cn/personal/personalExchangeRate",
	"bosc": "https://www.bosc.cn/zh/dtjr/whpj/",
	"njcb": "https://ebank.njcb.com.cn/perbank/PB00000016exchangeRateQry.do",
	"hzbank": "http://www.hzbank.com.cn/hzyh/gjyw/bjfw24/whpj/index.html",
	"gzcb": "http://www.gzcb.com.cn/sy/ywbl/flbz/whhlb/",
	"hsbank": "https://www.hsbank.com.cn/Channel/23998",
	"bcq": "https://www.cqcbank.com/cn/home/kjrk/sykj/341.html",
	"bcs": "https://www.bankofchangsha.com/site/col138/index.html",
	"cqtg": "https://www.ccqtgb.com/col118/list.html",
	"ghb": "https://www.ghbank.com.cn/khfw/wh/whpj/",
	"hfbank": "https://www.hfbank.com.cn/bjfw/hqzx/whpj/index.shtml",
	"zybank": "https://pibs.zyebank.com/pweb/HistoryRateQryPre.do",
	"bojs": "https://www.jsbchina.cn/CNNEW/kjfsnew/jrxinxinew/whpjnew/index.html?flag=2",
	"ecb": "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html",
	"hkma": "https://www.hkma.gov.hk/eng/data-publications-and-research/data-and-statistics/monthly-statistical-bulletin/",
	"hkab": "https://www.hkab.org.hk/sc/rates/exchange-rates",
	"hsb": "https://www.hangseng.com/zh-hk/personal/banking/rates/foreign-exchange-rates/",
	"bea": "https://www.hkbea.com/cgi-bin/rate_ttfx.jsp?language=sc",
	"ocbc": "https://www.ocbc.com/rates/daily_price_fx.html",
	"ocbchk": "https://www.ocbc.com.hk/personal-banking/sc/ocbc-bank-foreign-exchange-rates-for-personal-banking",
	"icbca": "https://www.icbcasia.com/hk/sc/personal/banking/rate/foreign-exchange-rate/default.html",
	"cncbi": "https://www.cncbinternational.com/rate-table/exchange_rate_en.html",
	"ccba": "https://www.asia.ccb.com/hongkong_sc/personal/accounts/exchange_rate_enquiry.html",
	"cmbwl": "https://www.cmbwinglungbank.com/wlb_corporate/cn/personal/investments/financial-information/exchange-rates/index.html",
}

// 来源是否有官方牌价页链接（无映射的来源返回空）
export function ratesPageURL(source: string): string | undefined {
	return sourceRatesURL[source]
}

// RSS 订阅链接：后端提供 /rss/:from/:to Atom feed（origin 取自 API 端点，兼容本地后端）
export function rssURL(from: string, to: string): string {
	return `${getFXRateClient().endpoint.origin}/rss/${from}/${to}`
}

// 数据请求超时阈值（默认）：超过则放弃等待，让调用方降级处理（如客户端首屏不被慢后端拖住）
export const DEFAULT_TIMEOUT_MS = 3000

export async function withTimeout<T>(
	p: Promise<T>,
	ms = DEFAULT_TIMEOUT_MS
): Promise<T | null> {
	return Promise.race([
		p,
		new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
	])
}

// 批量请求生命周期兜底：batch() → 排队 → done()。无论排队阶段是否抛错，
// 都确保 done() 被调用复位 inBatch/请求队列（done() 空队列时直接返回，幂等），
// 异常不会残留污染同一 client 的后续请求。第一个错误（排队异常或批量内部分
// 失败）向上抛给调用方按既有降级逻辑处理。
async function runBatch(client: FXRates, queue: () => void): Promise<void> {
	client.batch()
	let error: unknown = null
	try {
		queue()
	} catch (e) {
		error = e
	}
	try {
		await client.done()
	} catch (e) {
		if (error == null) error = e
	}
	if (error != null) throw error
}

const currenciesCache = new LRUCache<string, { [source: string]: string[] }>({
	max: 1,
	ttl: 1000 * 60 * 5,
})

export async function showCurrencyAllRates(): Promise<{
	[source: string]: string[]
}> {
	const cached = currenciesCache.get("all")
	if (cached) return cached

	const client = getFXRateClient()
	const Info = (await client.info()) as infoResponse

	const sources = Info.sources

	const answer: { [source: string]: string[] } = {}

	// 部分来源失败（如上游被反爬拦截）时 done() 会抛错：
	// 返回已成功的部分结果做降级，不要拖垮整个货币列表
	try {
		await runBatch(client, () => {
			for (const x of sources) {
				client.listCurrencies(x, (resp) => {
					answer[x] = resp.currency
				})
			}
		})
	} catch (e) {
		console.error("部分来源货币列表获取失败，使用部分结果:", e)
	}

	// 只有全部 source 都返回成功才缓存，避免把部分结果缓存 5 分钟
	if (sources.every((s) => Array.isArray(answer[s]))) {
		currenciesCache.set("all", answer)
	}

	return answer
}

const cache = new LRUCache<string, FXListProps[]>({
	max: 100,
	ttl: 1000 * 60 * 5,
})

const matrixCache = new LRUCache<string, RatesMatrix>({
	max: 100,
	ttl: 1000 * 60 * 5,
})

// 请求范围指纹：参与请求的来源及其各自支持的货币稳定化后纳入缓存 key。
// 来源列表或支持货币变化（如新增银行、上游货币覆盖变化）时缓存自动失效，
// 避免命中缺少新源/新货币的旧数据；undefined/非数组（部分结果）安全处理
const sourceSupportFingerprint = (currencies: {
	[source: string]: string[]
}): string => {
	return Object.keys(currencies)
		.sort()
		.map((s) => {
			const supported = currencies[s]
			return Array.isArray(supported)
				? `${s}:${[...supported].sort().join("+")}`
				: `${s}:?`
		})
		.join("|")
}

export interface FXDetailsOptions {
	amount?: number
	precision?: number
	force?: boolean
	// 启用交叉汇率：后端 BFS 找中间货币路径（如 CNY→CNH 经 HKD 折算），
	// 有累积误差，默认关闭；响应中会带 path 字段
	bfs?: boolean
}

// 交叉汇率响应在 fxRateResponse 基础上多了 path 字段（client 类型未声明，运行时已透传）；
// alias 为 CNY/CNH 归一化提示：源只用 CNH 报价时实际使用 CNH 汇率（如 dbs/ocbc）
interface FXRateWithPath extends fxRateResponse {
	path?: string[]
	alias?: string
}

const isUsableFXRateResponse = (response: unknown): response is FXRateWithPath => {
	if (typeof response != "object" || response == null) return false
	const rate = response as Record<string, unknown>
	return [rate.middle, rate.cash, rate.remit].some(
		(value) =>
			typeof value == "number" ||
			(typeof value == "string" && value.trim() != "")
	)
}

// getCurrenciesDetails 回调携带的数据更新：data 为本次合并结果。
// fastFailed=true 表示本次快源批量失败/不完整（回调可能是慢源单独完成或部分快源结果），
// 调用方应保留既有快源行与错误展示，避免慢源回调覆盖失败现场
export interface FXDetailsUpdate {
	data: FXListProps[]
	fastFailed: boolean
}

// 慢源后台批代际守卫：同一缓存 key 可能同时存在多个进行中的请求（手动刷新/自动刷新
// 会发起 force 请求，先前的非 force 慢源批仍在后台抓取）。全局单调递增 id 标记每个
// 请求，bounded LRU 保存每个 key 的最新代际；慢源批完成时只允许最新代际写缓存，
// 过期的慢源结果不得覆盖新数据。全局单调 id 保证 key 被清理/重建后新旧请求不会撞号
// （per-key 计数器删除后会从 1 重新计数，旧请求与重建后的新请求会碰撞）
const slowSourceLatestGen = new LRUCache<string, number>({
	max: 100,
})
let slowSourceGenCounter = 0

export async function getCurrenciesDetails(
	currencies: { [source: string]: string[] },
	toCurrency: string,
	fromCurrency: string,
	setResult?: (update: FXDetailsUpdate) => void,
	options: FXDetailsOptions = {}
): Promise<FXListProps[]> {
	const { amount = 100, precision = 4, force = false, bfs = false } = options

	const key = `${fromCurrency}-${toCurrency}-${amount}-p${precision}${bfs ? "-bfs" : ""}|${sourceSupportFingerprint(currencies)}`
	if (!force) {
		const cached = cache.get(key)
		if (cached) {
			if (setResult) setResult({ data: cached, fastFailed: false })
			return cached
		}
	}

	// client 须先于任何 await 捕获：服务端请求级实例在渲染作用域结束后失效
	const client = getFXRateClient()

	const data: { [source: string]: FXListProps } = {}
	let failed = false
	let failedMessage = "获取报价失败：所有数据源均不可用，请稍后重试"

	// 慢源（Visa/MasterCard 反爬抓取可达 30s+）拆出主批量：
	// 主批量只等快源，慢源单独后台请求，完成后合并回 data 再回调
	const slowSources = Object.keys(currencies).filter((s) =>
		SLOW_SOURCES.has(s)
	)
	const fastSources = Object.keys(currencies).filter(
		(s) => !SLOW_SOURCES.has(s)
	)

	// 代际登记须在快源批启动前完成：更晚的 force/普通请求在自身快源批阶段就登记
	// 新代际，使先前请求的过期慢源批完成后不可能写缓存（若登记延后到慢源批启动，
	// 「先发的慢源批先完成、新 force 快源批尚未完成」的窗口内旧结果仍会写缓存）
	const slowGeneration =
		slowSources.length > 0 && typeof window != "undefined"
			? ++slowSourceGenCounter
			: null
	if (slowGeneration != null) {
		slowSourceLatestGen.set(key, slowGeneration)
	}

	// 只请求来源货币列表含 from/to 任一的数据源；货币列表可能为部分结果，
	// 缺失条目（undefined）安全跳过，避免批次排队中途抛错
	const sourceSupportsPair = (x: string): boolean => {
		const supported = currencies[x]
		return (
			Array.isArray(supported) &&
			(supported.includes(toCurrency) ||
				supported.includes(fromCurrency))
		)
	}

	const requestSource = (x: string) => {
		client.getFXRate(
			x,
			toCurrency,
			fromCurrency,
			(resp) => {
				if (!isUsableFXRateResponse(resp)) return
				const withPath = resp

				data[x] = data[x] ?? {
					name: x,
					updated: safeUpdated(resp.updated),
					type: {},
				}

				data[x].type.middle = resp.middle

				data[x].type.sell = {
					cash: resp.cash,
					remit: resp.remit,
				}

				if (withPath.path && withPath.path.length > 0) {
					data[x].path = withPath.path
				}
			},
			"all",
			precision,
			amount,
			0,
			false,
			bfs
		)

		client.getFXRate(
			x,
			fromCurrency,
			toCurrency,
			(resp) => {
				if (!isUsableFXRateResponse(resp)) return
				const withPath = resp

				data[x] = data[x] ?? {
					name: x,
					updated: safeUpdated(resp.updated),
					type: {},
				}

				// 反向请求（本币→外币）返回的是"卖出价倒数"口径：
				// resp.cash = amount 本币可换的外币数（如 100 CNY = 12.7857 EUR），
				// 银行卖出价 = amount 外币折本币 = amount² / resp.cash（如 10000/12.7857 = 782.12）。
				// 注意：本请求必须用高精度（precision=8）避免反向值被提前舍入导致换算误差放大
				// （不能用 precision=-1：后端对 Fraction 无限小数会输出 "14.(7642…)" 字符串无法解析），
				// 换算结果再按请求精度四舍五入
				const num = (v: unknown): number | undefined => {
					if (typeof v == "number") return v
					if (typeof v == "string" && v.trim() != "") {
						const n = Number(v)
						return Number.isNaN(n) ? undefined : n
					}
					return undefined
				}
				const invert = (v: unknown): number | string | undefined => {
					const n = num(v)
					if (n == undefined || n == 0) {
						return typeof v == "boolean"
							? undefined
							: (v as number | string | undefined)
					}
					const raw = (amount * amount) / n
					return precision >= 0
						? Math.round(raw * 10 ** precision) / 10 ** precision
						: raw
				}

				data[x].type.buy = {
					cash: invert(resp.cash),
					remit: invert(resp.remit),
				}

				if (withPath.path && withPath.path.length > 0) {
					data[x].path = withPath.path
				}

				if (withPath.alias) {
					data[x].alias = withPath.alias
				}
			},
			"all",
			8,
			amount,
			0,
			false,
			bfs
		)
	}

	try {
		await runBatch(client, () => {
			for (const x of fastSources) {
				if (sourceSupportsPair(x)) {
					requestSource(x)
				}
			}
		})
		const requestedFastSources = fastSources.filter(sourceSupportsPair)
		if (
			requestedFastSources.length > 0 &&
			!requestedFastSources.some((source) => data[source] != undefined)
		) {
			failed = true
		}
	} catch (error) {
		console.error("Error getting currency details:", error)
		failed = true
		failedMessage =
			error instanceof Error && /timed out/i.test(error.message)
				? "请求超时：部分数据源响应缓慢（如 Visa/MasterCard 反爬抓取），请稍后重试"
				: "获取报价失败：所有数据源均不可用，请稍后重试"
	}

	// 慢源后台单独请求（不阻塞主流程），完成后合并结果再回调一次。
	// 服务端 SSR 不启动：渲染作用域结束后请求级 client 失效，且 30s+ 抓取不应
	// 残留服务端进程；客户端挂载后自会补拉慢源
	if (slowGeneration != null) {
		// 快源与慢源都成功才写缓存：慢源失败时只降级展示已成功部分，
		// 不落缓存，保证下次请求仍会重试慢源
		let slowOk = false
		const mergeAndNotify = () => {
			const merged = Object.values(data)
			if (merged.length > 0) {
				// 快速源失败（failed=true）、慢源失败（slowOk=false）或本请求已不是
				// 该 key 最新代际（更晚的 force/普通请求已接管）都不写缓存，避免把
				// 部分结果或过期慢源数据写进缓存导致下次请求不再重试缺失源
				if (
					!failed &&
					slowOk &&
					slowSourceLatestGen.get(key) == slowGeneration
				) {
					cache.set(key, merged)
				}
				if (setResult) setResult({ data: merged, fastFailed: failed })
			}
		}
		;(async () => {
			try {
				await runBatch(client, () => {
					for (const x of slowSources) {
						if (sourceSupportsPair(x)) {
							requestSource(x)
						}
					}
				})
				slowOk = slowSources
					.filter(sourceSupportsPair)
					.every((source) => data[source] != undefined)
			} catch (error) {
				console.error("Error getting slow source details:", error)
			} finally {
				mergeAndNotify()
			}
		})()
	}

	const result = Object.values(data)

	// 请求失败不写缓存，保证下次还能重试；
	// 有慢源待后台批处理时也不写快源结果（慢源成功后才统一写缓存，
	// 避免命中快源-only 数据）——慢源完成前缓存仍保持缺失状态
	if (!failed && result.length > 0 && slowSources.length == 0) {
		cache.set(key, result)
	}

	// 全部来源都失败时向上抛错，让调用方显示错误（部分成功仍降级返回）
	if (failed && result.length == 0) {
		throw new Error(failedMessage)
	}

	if (setResult) setResult({ data: result, fastFailed: failed })
	return result
}

export interface RatesMatrixCell {
	middle: number | string | boolean
	cash?: number | string | boolean
	remit?: number | string | boolean
	// 交叉汇率补查时的过桥路径（如 ["CNY","HKD","CNH"]）
	path?: string[]
	// CNY/CNH 归一化：源只用 CNH 报价时实际使用 CNH 汇率
	alias?: string
	// 该汇率更新时间（用于 stale 判断）
	updated?: Date
}

export interface RatesMatrix {
	[source: string]: { [currency: string]: RatesMatrixCell }
}

export async function getRatesMatrix(
	currencies: { [source: string]: string[] },
	from: string,
	options: {
		amount?: number
		precision?: number
		force?: boolean
		reverse?: boolean
		// 跳过不请求的源（默认跳过反爬慢源，矩阵视图点击后单独加载）
		skipSources?: Set<string>
	} = {}
): Promise<RatesMatrix> {
	const {
		amount = 100,
		precision = 4,
		force = false,
		reverse = false,
		skipSources,
	} = options

	const skip = skipSources ?? SLOW_SOURCES
	// 来源/支持货币与 skip 策略（排序稳定）纳入缓存 key：
	// 请求范围变化时自动失效，避免命中缺失新源或不同 skip 策略的旧矩阵
	const skipFingerprint =
		skip.size > 0 ? Array.from(skip).sort().join("+") : "none"
	const key = `${from}-${amount}-p${precision}-${reverse ? "reverse" : "forward"}|${sourceSupportFingerprint(currencies)}|skip:${skipFingerprint}`
	if (!force) {
		const cached = matrixCache.get(key)
		if (cached) return cached
	}

	const client = getFXRateClient()

	const data: RatesMatrix = {}
	let failed = false

	try {
		await runBatch(client, () => {
			for (const k in currencies) {
				if (skip.has(k)) continue
				const x = k
				client.listFXRates(
					x,
					from,
					(resp) => {
						const row: { [currency: string]: RatesMatrixCell } = {}
						for (const currency in resp) {
							const item = resp[currency]
							// 不支持的 source（如卡组织全表 403）经 client transform
							// 会变成 { status, message } 之类非货币条目，跳过
							if (
								typeof item != "object" ||
								item === null ||
								!("middle" in item) ||
								currency == "status" ||
								currency == "message"
							) {
								continue
							}
							row[currency] = {
								middle: item.middle,
								cash: item.cash,
								remit: item.remit,
								updated: safeUpdated(item.updated),
							}
						}
						data[x] = row
					},
					precision,
					amount,
					0,
					reverse
				)
			}
		})
	} catch (error) {
		console.error("Error getting rates matrix:", error)
		failed = true
	}

	if (!failed && Object.keys(data).length > 0) {
		matrixCache.set(key, data)
	}

	// 全部来源都失败时向上抛错，让调用方显示错误（部分成功仍降级返回）
	if (failed && Object.keys(data).length == 0) {
		throw new Error("获取矩阵失败：所有数据源均不可用，请稍后重试")
	}

	return data
}

// 矩阵视图单独查询某个源（Visa 等反爬慢源或全表接口 403 的卡组织源）：
// 用 getFXRate 逐货币查询（不走 listFXRates 全表——后端对卡组织全表返回 403），
// 只查该源支持的货币，避免触发不支持的货币导致 chromium 重建超时
export async function getSourceMatrixRow(
	source: string,
	supportedCurrencies: string[],
	targetCurrencies: string[],
	from: string,
	options: {
		amount?: number
		precision?: number
		reverse?: boolean
		// 交叉汇率：开启后无直连的货币对经中间货币折算（与单对视图 bfs 一致）
		bfs?: boolean
	} = {}
): Promise<{ [currency: string]: RatesMatrixCell }> {
	const { amount = 100, precision = 4, reverse = false, bfs = false } = options
	const client = getFXRateClient()

	const row: { [currency: string]: RatesMatrixCell } = {}
	let invalidResponses = 0
	const targets = targetCurrencies.filter((c) =>
		supportedCurrencies.includes(c)
	)
	if (targets.length == 0) return row

	try {
		await runBatch(client, () => {
			for (const c of targets) {
				client.getFXRate(
					source,
					from,
					c,
					(resp) => {
						if (!isUsableFXRateResponse(resp)) {
							invalidResponses++
							return
						}
						const withPath = resp
						row[c] = {
							middle: resp.middle,
							cash: resp.cash,
							remit: resp.remit,
							updated: safeUpdated(resp.updated),
							path:
								withPath.path && withPath.path.length > 0
									? withPath.path
									: undefined,
							alias: withPath.alias,
						}
					},
					"all",
					precision,
					amount,
					0,
					reverse,
					bfs
				)
			}
		})
	} catch (error) {
		console.error(`Error getting matrix row for ${source}:`, error)
		throw error
	}
	if (Object.keys(row).length == 0 && invalidResponses > 0) {
		throw new Error(`${source} 暂无可用报价，请稍后重试`)
	}

	return row
}
