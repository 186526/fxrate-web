# AGENTS.md

## 项目概览

FXRate-web 是一个外汇汇率查看网页应用（前端），配套仓库 [186526/fxrate](https://github.com/186526/fxrate)（后端数据服务）。本仓库将 fxrate 以 git submodule 形式挂在 `lib/fxrate/` 下，前端通过 JSON-RPC 调用其 `FXRates` client 获取汇率数据，并用轻量 MUI Table 展示多家银行/平台的买卖价、中间价与最优价高亮。

技术栈：Next.js 16（App Router，`output: "standalone"`）+ React 19 + TypeScript + MUI v6（`@mui/material`，含 `@mui/icons-material`）+ Emotion + Tailwind。

## 目录结构

```
app/                 # 路由页面（layout.tsx、page.tsx 服务端组件）
componets/           # 注意：目录名拼写如此（components 的 typo），是有意为之，勿改名
  index.tsx          # 客户端主组件（orchestrator）：状态、数据拉取、视图切换、视图数据缓存、sticky Header、Footer
  currencyChooser.tsx# 货币选择器（受控 Autocomplete + 换向 + 金额；矩阵视图只显示基准货币/金额）
  fxlistgrid.tsx     # 单对报价表（MUI Table：排序、最优价高亮、相对更新时间、首列 sticky、来源 logo）
  fxmatrixgrid.tsx   # 全对矩阵表（source × 货币，现钞/现汇/中间价切换、列高亮、常用币种筛选、列头国旗 emoji）
  footer.tsx         # 页脚（版权/by 链接、前后端版本 tooltip、GitHub 链接）
  bestPriceSources.ts# 共享 hook：参与最优价高亮的来源集合（默认排除央行/卡组织，localStorage 持久化）
  sourceIcon.tsx     # 共享来源图标（本地银行 logo 优先，无则类型图标兜底）+ 货币国旗 emoji 映射
  theme.tsx          # MUI 主题 Provider（Sunoaki 风格 dark/light，localStorage 持久化）
  tools.ts           # FXRate client 单例、批量查询、LRU 缓存（货币列表/单对/矩阵）
lib/fxrate/          # git submodule（fxrate 后端库，含 src/client 的 JSON-RPC client）
public/
  bank-logos/        # 本地银行/平台 SVG logo（source 代码命名，如 hsbc.cn.svg；来源：Wikimedia Commons / GitHub 开源集合 / iconfont.cn 图标库（cid=23316 银行合集，补全无开源源的小众银行）；均保留 SourceIcon 图标兜底机制）。
                     # iconfont 来源的 SVG 统一处理标准：原始 1024×1024 画布 → 用浏览器 canvas 渲染检测非白像素真实边界 → viewBox 裁剪为「图形占 ~93%、居中、四周留 ~7% 内边距」（与 xib/icbc/pab/cmb/boc 等一致，保证 16px 下所有图标视觉大小统一；勿裁剪到 100% 贴满，会显得比其他图标大）。
                     # 横向徽章（HSBC 菱形 2:1 等）是品牌固有形状，裁剪后 contain 显示自然偏矮，属正常，勿强行方形化。
                     # 特例：cfets/hkma 为 PNG（hkma 取官网 jpg 白底转透明），SourceIcon 的 LOGO_EXT 映射；全部 59 源 icon 与官方牌价链接（tools.ts sourceRatesURL）已齐全。
```

## 关键实现要点

- **数据流（客户端驱动）**：`app/page.tsx` 是薄壳（只渲染 `<Index buildId buildTime version />`，不做服务端拉数）；所有汇率数据由客户端 `componets/index.tsx` 经 `componets/tools.ts` → `FXRates` client → fxrate 后端 JSON-RPC 拉取，结果按 key 缓存进 LRUCache（TTL 5 分钟），切换货币对/金额命中缓存时零请求。**切勿把数据拉取搬回 `page.tsx`**——那会让每次 URL 变化都触发整轮服务端重拉（历史卡顿根因）。
- **视图数据缓存（stale-while-revalidate）**：`index.tsx` 内 `pairCacheRef`/`matrixCacheRef` 各自按参数 key 保存当前 `Index` 挂载期间对应视图最近一次数据，用于同一视图参数重拉时先显示旧数据再后台刷新；`/` 与 `/matrix` 路径切换会重挂载 `Index`，此时由 `tools.ts` 的模块级 LRU 按更完整参数 key 零网络恢复。单对刷新回调携带 `FXDetailsUpdate`（`{data, fastFailed}`）：`fastFailed=false`（正常成功刷新）按行合并时只保留旧 `SLOW_SOURCES` 行（慢源后台批未归/失败兜底），快源行本次未返回（失败/已下线）即移除，避免陈旧报价残留；`fastFailed=true`（快源批量失败/不完整，回调只含慢源或部分快源结果）保留既有全部行并**不清除错误提示**，后到的慢源结果只能追加，不能把有效表格退化为慢源单行、也不能掩盖失败现场。`showCurrencyAllRates()` 允许部分来源失败（如上游被反爬拦截时 `done()` 抛错）并返回成功部分做降级，避免单个来源拖垮整个货币列表。
- **`tools.ts`**：`FXRate` 是浏览器端默认 client 单例（兼容既有导入）；`getFXRateClient()` 是统一入口——浏览器返回该单例，服务端经 `React.cache` 返回**请求级 client**（薄壳下 SSR 不再拉数，此分支为防御性保留：若未来任何服务端代码调用 tools 数据函数，也不会共享 `batch()/done()/请求队列` 可变状态），所有数据拉取都走它。批量请求一律经 `runBatch(client, queue, signal?)` 生命周期兜底：无论排队阶段是否抛错都保证 `done()` 被调用复位 `inBatch`/队列（幂等），异常不残留污染后续请求。`showCurrencyAllRates()` 批量取各来源支持的货币列表（结果缓存，允许部分来源失败降级返回部分结果）；`getCurrenciesDetails()` 用 `client.batch()` 合并请求，参数含 `amount`（换算金额，默认 100）/ `precision`（默认 4）/ `force`（绕过缓存读）/ `bfs`（交叉汇率开关）/ `signal`（取消信号，见下），按 `from-to-amount-p{precision}[-bfs]|来源支持指纹` 缓存——指纹（`sourceSupportFingerprint`）把参与请求的来源及其支持货币排序后纳入 key，来源/支持货币变化时缓存自动失效，避免命中缺新源的旧数据；回调类型为 `FXDetailsUpdate`（`{data, fastFailed}`，`fastFailed` 表示本次快源批量失败/不完整）；`getRatesMatrix()` 用 `listFXRates` 拉全对矩阵（同样缓存，key 含精度与方向 + 来源/支持指纹 + 排序后的 `skipSources` 指纹）。`getCurrenciesDetails` 的源过滤条件是「来源列表含 from 或 to 任一」（货币列表为部分结果时缺失条目安全跳过），让后端 BFS 路径引擎算交叉汇率（如 CNY↔CNH）；矩阵保留每格的 `{middle, cash, remit, updated}`。
- **交叉汇率（单对视图）**：Header「交叉汇率」按钮（localStorage key `fxrate-cross-rates`）切换 `bfs` 参数——开启后无直连报价时后端 BFS 找中间货币路径折算（有累积误差，默认关闭）；交叉行银行名旁显示「经 HKD 折算」虚线标识，tooltip 展示完整路径（如 `CNY → HKD → CNH`）。
- **慢源拆分（Visa）**：`SLOW_SOURCES`（tools.ts）标记反爬抓取慢的源（Visa 走 headless chromium 降级，查询不支持的货币时单次可达 30s+；**MasterCard 实测毫秒级，不在此列**）。单对视图把慢源拆出主批量**单独后台请求**（fire-and-forget，完成后按 source 合并回 data 再回调一次，**仅限浏览器端**——SSR 不启动，请求级 client 在渲染作用域结束后失效且 30s+ 抓取不应残留服务端进程），避免慢源拖垮整批导致 client 30s 超时；有慢源时主流程不写快源-only 缓存，快源与慢源都成功（`slowOk`）才由 `mergeAndNotify` 统一写缓存——慢源失败或尚未完成都不落缓存，保证下次请求仍会重试慢源（快源失败 `failed=true` 同样不写）。缓存写入另经**代际守卫**：`slowSourceLatestGen`（bounded LRU，`max:100`）+ 全局单调递增 id 记录每个 key 的最新慢源代际，**代际在请求开始（快源批启动前）登记**，过期慢源批（更晚的 force/普通请求已接管）完成时仍回调自己仍活跃的调用方，但**不得覆盖缓存**——登记若延后到慢源批启动，会留下「先发的慢源批先完成、新 force 快源批尚未完成」的窗口让旧结果写进缓存；全局单调 id 保证 key 被清理重建后新旧请求不会撞号（per-key 计数器删除后会从 1 重新计数导致碰撞）。矩阵视图默认不请求慢源，表格底部显示「点击加载」行，点击后经 `getSourceMatrixRow()` 用 `getFXRate` 逐货币查询合并（不走 `listFXRates` 全表——后端对卡组织全表返回 403；只查该源支持的货币，避免触发不支持的货币导致 chromium 重建超时），每格写入 `safeUpdated(resp.updated)` 时间戳。**MasterCard 在矩阵中自动加载**（`fxmatrixgrid.tsx` 的 autoLoad effect：主数据里该行为空（403）时自动用 `getSourceMatrixRow` 补查，参数变化时重置重新加载）；单独加载的行（MasterCard 自动 / Visa 点击）透传 `bfs` 交叉汇率参数。
- **视图**：Header 内 Tabs 切换「单对报价」（`fxlistgrid.tsx`）与「全对矩阵」（`fxmatrixgrid.tsx`）。
- **交互**：换向按钮交换 from/to；金额输入防抖 300ms 后重拉；单对视图 60s 自动刷新（仅页面可见时强制重拉）；手动刷新按钮同时强刷矩阵。Header 右侧「精度」select（原样/-1、0/2/4/6 位）持久化到 localStorage（key `fxrate-precision`）并纳入缓存 key。
- **AbortSignal 传播（Phase 4）**：`cross-rates/amount/from/to/precision/view` 任一变化时，`index.tsx` 的作废 effect 与新的 `fetchPair`/`fetchMatrix` 会 abort 对应视图的 `AbortController`（pair/matrix 各自独立，互不影响），把 `signal` 传给 `getCurrenciesDetails`/`getRatesMatrix`/`getSourceMatrixRow`；`runBatch` 在 `client.batch()` 前检查 `signal.aborted`（已中止直接抛 `AbortError`，零请求、不触碰 client 队列），在途时用 `abortable(client.done(), signal)` 竞态——abort 立即以 `AbortError` 拒绝等待（client 的 `done()` 不接受外部 signal，网络层取消由后端/客户端超时兜底，这里取消的是调用方等待）。**被取消的请求契约**：不写缓存、不回调、不启动慢源后台批（`AbortError` 向上抛，调用方 `isAbortError` 跳过错误提示，reqId 代际守卫兜底）；已启动的慢源后台批 detached 不受影响（fire-and-forget 完成并合并，代际守卫决定缓存），`getSourceMatrixRow` 的额外行补查（MasterCard 自动 / Visa 点击 / 交叉补查）在 `rowParamsKey` 变化或关闭交叉汇率时同样 abort。
- **矩阵视图**：`?from=X` 使用后端正向汇率（买入方向），`?to=X` 使用后端 `reverse=true` 的反向汇率（卖出方向），前端不做算术倒数；默认只显示 12 个常用币种（`fxmatrixgrid.tsx` 的 `DEFAULT_COMMON_CURRENCIES`），「显示货币」弹层可勾选启用其他，localStorage（key `fxrate-matrix-currencies`）持久化；「中间价/现钞/现汇」ToggleButtonGroup 切换列值，「最优价」弹层控制参与高亮的来源。主数据与单独补查行按**单元格字段级深合并**（`mergeCellRows`）：主数据对实际存在的重叠字段优先，补查独有字段（cash/remit/path/updated）保留，`false`/`0`/字符串等合法值不受影响。额外行以 **keyed 快照**（`{key, data}`）存储，key 对应当前请求参数——参数变化时渲染先按 key 隔离旧行（新参数绝不渲染旧行），异步响应写回要求 key 与已提交的 `rowParamsRef`（`useLayoutEffect` 同步）一致；请求 key 只随主数据/启用币种变化，额外行新增货币列不触发整批重置。自动补查（MasterCard 等空行源）按来源维护 `idle/loading/success/error` 状态：失败渲染「加载失败，重试」行可手动重试，失败不被永久去重（参数变化或主数据更新会重新评估）。
- **最优价高亮**：`bestPriceSources.ts` 的 `useBestPriceSources()` 管理参与高亮的来源集合（两个视图共用），默认排除央行/卡组织/非商业银行基准源（`NON_BANK_SOURCES`：pboc/unionpay/mastercard/wise/visa/jcb/ecb/cfets/hkma/alipay），localStorage（key `fxrate-best-price-sources`）持久化；高亮样式为 `primary.main` 加粗 + `brandSoft` 底色（品牌色 14% 透明，Sunoaki 状态层惯例）。Header「最优价 X/Y 家」计数分子分母同取当前**可见**来源集（非排除可见源数 / 可见源总数），避免隐藏源计入分子导致 58/20 式分母超限。
- **URL 参数与视图记忆**：默认 `from=CNY&to=USD&amount=100&precision=4`；同一路径下 from/to/amount/precision/方向变化由 `index.tsx` 用 Next.js 16 支持的 **Native History API** `window.history.replaceState(window.history.state, "", nextUrl)` 防抖 300ms 原地同步，保留 Next 内部 history state 且不触发 RSC GET。**视图切换（路径变化）仍走 `router.push`**；push 前取消待写 timer 并推进 URL 写入代际，timer 回调同时校验代际与预定 pathname，旧路径写入不能覆盖新路径。浏览器前进/后退经 `usePathname`/`useSearchParams` 按当前路径恢复 URL 状态。pair 与 matrix 使用独立 React state 和存档：pair 的 from/to/reverse 仅由 pair 路径写入 `fxrate-pair-from`/`fxrate-pair-to`/`fxrate-reverse`，matrix 的 base/reverse 仅由 matrix 路径写入 `fxrate-matrix-base`/`fxrate-matrix-reverse`；直接加载与 popstate 时当前 URL 优先，跨视图往返则恢复各自存档。pair URL 始终携带 `from` 与 `to`；matrix 正向只用 `?from=X`，反向只用 `?to=X`，不携带冲突方向参数；两个视图均一致携带 amount/precision。`page.tsx` 是薄壳不解析 searchParams——`amount`/`precision`/方向全部由客户端 `useSearchParams` 读取（支持 `?precision=` 显式指定，默认 4）。
- **主题**：`theme.tsx` 提供 `ThemeProvider` 与 `useThemeMode()`；挂载后读取 localStorage / `prefers-color-scheme`，避免 hydration 不匹配。设计语言源自 sunoaki.net（`mui.d.ts` 含自定义 palette 键 `brandSoft`/`surfaceMuted` 与 Button `tonal` 变体的类型增强）：暖色纸张感（浅 bg `#fbfaf7` / 暗 bg `#10171c`）+ 深青绿 accent（`#2f6f73` / `#8fc3c6`）、`shape.borderRadius=14`、卡片 14px 圆角 + 1px 暖沙边框（`#e5dfd5` / `#334044`）+ 大软阴影、按钮全圆 pill（含 tonal 变体）、表头 `surfaceMuted` 浅底 600 字重、tooltip 用 inverse 惯例（浅色深墨底 / 暗色浅墨底）、表格数字 `tabular-nums`、`typography.fontFamily="inherit"`（继承 next/font Inter）。
- **页脚**：`footer.tsx`（client）渲染在 Index 底部，接受 `buildId`/`buildTime`/`version`/`backendVersion` props；版权行含 `@real186526` → https://186526.xyz 链接，右侧「fxrate-web v{version}」tooltip 显示 `fxrate-web@短hash + 构建时间 + 完整 hash`（构建时间格式对齐后端 BUILDTIME：`2025-10-20T23:29:04+08:00` 本地时区 ISO），另有 GitHub 链接指向后端仓库。
- **构建时间注入**：`next.config.mjs` 构建时 `new Date().toISOString()` 写入 `env.FXBUILD_TIME`，`page.tsx` 经 `process.env.FXBUILD_TIME` 传给 Index/Footer。
- **已知问题（勿"顺手修"）**：
  - `next.config.mjs` 关闭了构建时的 ESLint/TS 检查（`ignoreBuildErrors` / `ignoreDuringBuilds`）；CI 仍需单独运行 `npx tsc --noEmit`、`yarn lint`、`yarn test` 与 `yarn build`（四道门禁独立成步，任一失败即红）。

## 构建与运行

```bash
yarn install          # 需先确保 lib/fxrate 子模块已 init/update
yarn dev              # 前端 dev，连默认 API https://fxrate.sunoaki.net/v1/jsonrpc
yarn full-dev         # 同时跑 lib/fxrate 后端（端口 8080）与前端，且 FXRATE_API 指向本地
yarn build            # 生产构建（standalone 输出）
yarn lint             # eslint .（构建时默认跳过）
yarn test             # vitest run：test/frontend 单元/组件测试（node 环境，组件测试文件内 `// @vitest-environment jsdom`）
yarn test:watch       # vitest watch
yarn test:e2e         # playwright test：test/e2e 端到端（自动拉起本地 mock JSON-RPC 后端 + next dev，不碰真实上游）
yarn test:all         # test + test:e2e
```

### 测试基础设施（test/）

- **单元/组件（`test/frontend/`）**：Vitest 4 + React Testing Library + jsdom。`vitest.config.mts` 用 `@/*` 别名；`test/frontend/setup.ts` 在模块加载前装好可委托的 `fetch` 桩（`__fxSetFetch`，因为 `tools.ts` 在 import 时就构造 FXRates client 并绑定 `globalThis.fetch`），jsdom 环境补 `matchMedia`/`ResizeObserver` 兜底；`test/frontend/jsonrpc.ts` 提供 JSON-RPC 批处理 mock（按 method 分派、支持部分请求失败）与 `createDeferredBatchMock`（延迟响应批，供 AbortSignal 测试控制响应时序）。已覆盖：`showCurrencyAllRates` 部分结果不缓存、`getCurrenciesDetails` 部分货币列表安全跳过 / runBatch 失败后 client 复位 / 来源支持指纹缓存 key（partial map）/ 慢源（visa）缓存完整性（快源/慢源任一失败均不落缓存、成功才合并入库）、`getRatesMatrix` 缓存 key（含来源与 skipSources 指纹）、`getSourceMatrixRow` 支持过滤与 updated 时间戳、`FXMatrixGrid` 单元格深合并（含缺值格 undefined 字段）与 rowParamsKey 重置、Index 层矩阵请求作废（防抖窗口陈旧响应）与单对快源陈旧行移除、AbortSignal 传播（预中止零请求 / 中途 abort 不写缓存不回调 / 关闭交叉汇率不启动旧 BFS 慢源批 / 慢源 fire-and-forget 不被 abort 打断 / 快速改金额取消旧批次 / 单对视图 abort 不影响矩阵）。
- **端到端（`test/e2e/`）**：Playwright + @axe-core/playwright。`playwright.config.ts` 的 webServer 先起本地 mock JSON-RPC 后端（`test/e2e/mock-server/index.cjs`，`/v1/jsonrpc` + `/__counters` + `/__reset`），再以 `FXRATE_API`/`FXRATE_PROXY` 指向它启动 `next dev`——SSR 与浏览器代理都走 mock，测试零真实上游依赖。**baseURL 必须用 `localhost` 而非 `127.0.0.1`**：Next 16 dev 的 allowedDevOrigins 会拦截 127.0.0.1 Host 的 dev 资源，导致 React 不水合。安全硬化：mock 与 next dev 都只绑定 loopback（mock `listen(PORT, "127.0.0.1")`、next 用 `-H 127.0.0.1`，不暴露局域网/公网），mock 请求体上限 1 MiB（超限 413 且不计批次）；端口可用 `MOCK_PORT`/`WEB_PORT` 环境变量覆盖避免撞端口。`test/e2e/helpers/mockJsonRpc.ts` 拦截浏览器端 `/api/fxrate` 做确定性应答与请求计数（含 `paramsOf(method)` 供方向/参数断言）；断言语义：**薄壳下单浏览器数据路径**——首屏 pair = 货币列表（instanceInfo + 4×listCurrencies）+ 挂载期版本 instanceInfo + 主批量（3 快源 ×2 方向）+ visa 慢源后台批量（2 getFXRate）= 5 条批量、8 个 getFXRate；切矩阵/切回 pair 因路径变化 Index 重挂载各 +1 次版本 info，数据本体命中浏览器 tools LRU 零新增；mock server 端计数恒为 0（SSR 不再发 JSON-RPC 数据请求）。`matrix-reverse.spec.ts` 覆盖矩阵反向（`?to=` 方向 URL、反向文案、零 document 导航、listFXRates 带 `reverse=true`、直接加载 footer 显示 `后端 fxrate@mock` 且浏览器层 instanceInfo 发生）；`mock-server.spec.ts` 覆盖 loopback 可达与 413；a11y gate 断言 serious+critical，白名单仅放行既有对比度节点（表头 4.34:1 / ToggleButton / caption，见文件内证据注释）。
- **React 19 renderOption key 警告**：`currencyChooser.tsx` 的 `renderOption` 从 MUI props 中显式解构 `key` 传给根元素（React 19 禁止展开含 key 的 props 对象）；`test/frontend/currencychooser.test.tsx` 打开两个货币下拉并断言无 key 展开 console.error。

环境变量：`FXRATE_API` 覆盖后端 JSON-RPC 地址（默认 `https://fxrate.sunoaki.net/v1/jsonrpc`，见 `tools.ts`）。

### 开发用本地后端（端口 8081）

本地开发后端用 `PORT=8081` 启动（**代码默认端口是 8080**，不设 PORT 会与 `yarn full-dev` 的 tsx 实例冲突）：

```bash
cd lib/fxrate && PORT=8081 nohup node --unhandled-rejections=warn dist/index.cjs > /tmp/fxrate-backend-8081.log 2>&1 &
```

- dist 需保持最新：`lib/fxrate` 内 `yarn build`（esbuild 重建 `dist/index.cjs`，BUILDTIME/GITBUILD 注入版本号），改源码后记得重建再重启。
- 版本检查：`curl http://127.0.0.1:8081/info`（REST）或 JSON-RPC `instanceInfo`；footer 的「后端 fxrate@短hash」来自后者。
- 重启旧进程：SIGTERM 一次可能不生效（进程进入 SNsl 睡眠态），需 `kill` 后确认端口释放，必要时 SIGKILL。
- 换端口后若页面 footer 版本号没变，先确认前端代理指向（见下）。

### 前端连本地后端必须同时设 FXRATE_API 与 FXRATE_PROXY

**坑**：`process.env.FXRATE_API` 只在服务端（SSR）注入——浏览器端 JS 看不到它，客户端会 fallback 到同源代理 `/api/fxrate`，而该代理目标由 `FXRATE_PROXY` 决定（`next.config.mjs` rewrites，默认线上 `https://fxrate.sunoaki.net/v1/jsonrpc`）。

只设 `FXRATE_API` 的结果：SSR 侧虽指向本地 8081（薄壳下 SSR 不拉数据，仅作为配置存在），但**客户端所有数据请求仍走线上代理**——footer 版本号暴露真相（显示线上旧 commit 而非本地）。

正确启动方式：

```bash
FXRATE_API=http://localhost:8081/v1/jsonrpc FXRATE_PROXY=http://localhost:8081/v1/jsonrpc yarn dev
```

判断当前连的是哪个后端：看 footer「后端 fxrate@短hash」——本地 8081 应为 `lib/fxrate` 当前 HEAD 的 hash。

## 约定与注意事项

- `componets/` 目录名拼写错误是历史遗留，保持原样；新组件放里面。
- 前端 UI 面向中文用户：表格表头与文案用中文，数据源名经 `lib/fxrate/src/constant.ts` 的 `sourceNamesInZH` 映射。
- 依赖通过 `yarn`（1.22）管理，锁文件为 `yarn.lock`；勿混用 npm/pnpm 安装。
- `lib/fxrate` 是 submodule（见 `.gitmodules`），涉及其中的改动需到子模块仓库单独提交。
- `tsconfig.json` 的 `exclude` 含 `lib/fxrate`：submodule 的类型由其自身仓库的 CI 检查，前端 `tsc` 只连带检查被 import 的 `src/client/index.ts`。
- CI 门禁：`.github/workflows/ci.yml` 对每个分支 push/PR 跑 `npx tsc --noEmit` + `yarn lint`（非变更性，`eslint .` 无 `--fix`）+ `yarn test`（vitest 单元测试）+ `yarn build`（next build 生产构建），checkout 需 `submodules: recursive`（tsc 要解析 `lib/fxrate/src/client`）。
- 代码风格：缩进使用 tab，双引号，无分号；与现有文件保持一致。

## 对 AI 助手的约定

- 思考/推理过程（chain-of-thought）使用英文；与用户对话时使用中文。
- 代码修改若导致本文档描述的架构、目录结构、数据流、构建方式或约定发生变化，必须同步更新本文件，保持文档与代码一致。
