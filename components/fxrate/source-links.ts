import { getFXRateClient } from "./client"

// 不参与最优价高亮的数据源：央行参考牌价不可成交，高亮会误导
export const bestPriceExcludeSources = new Set(["pboc"])

// 反爬抓取慢的数据源（Visa 走 headless chromium 降级，查询不支持的货币时可达 30s+）：
// 单对视图拆出主批量单独请求，矩阵视图默认不请求、点击后单独加载
// （MasterCard 实测毫秒级，不在此列，单对走主批量、矩阵默认自动加载）
export const SLOW_SOURCES = new Set(["visa"])

// 请求范围指纹：参与请求的来源及其各自支持的货币稳定化后纳入缓存 key。
// 来源列表或支持货币变化（如新增银行、上游货币覆盖变化）时缓存自动失效，
// 避免命中缺少新源/新货币的旧数据；undefined/非数组（部分结果）安全处理
export const sourceSupportFingerprint = (currencies: {
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

// 构建期冻结的公开 REST 基址。next.config.mjs 的 env 块把 FXRATE_PROXY_BUILD
// 内联进浏览器 bundle，去掉 /v1/jsonrpc 后缀即后端 REST 根（与 app/api/backend-meta
// 的 restBase 同源同算法）。取不到或后缀不匹配时返回空串，由调用方回落同源代理。
function publicRestBase(): string {
	const proxy = process.env.FXRATE_PROXY_BUILD
	if (!proxy) return ""
	const base = proxy.replace(/\/v1\/jsonrpc\/?$/, "")
	return base == proxy ? "" : base
}

// RSS 订阅链接：优先给公开后端地址（fxrate.sunoaki.net/rss/USD/CNY），
// 复制出去在任意前端部署下都能订阅；取不到构建期地址时回落同源 /api/rest 代理。
export function rssURL(from: string, to: string): string {
	const path = `/rss/${encodeURIComponent(from)}/${encodeURIComponent(to)}`
	const base = publicRestBase()
	if (base) {
		try {
			return new URL(`${base.replace(/\/+$/, "")}${path}`).toString()
		} catch {
			// 非绝对地址（如仅路径的代理）时回落同源处理
		}
	}
	const endpoint = getFXRateClient().endpoint
	const restPrefix = endpoint.pathname.replace(/\/+$/, "") == "/api/fxrate"
		? "/api/rest"
		: ""
	return new URL(`${restPrefix}${path}`, endpoint.origin).toString()
}
