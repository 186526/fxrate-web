# AGENTS.md

## 项目概览

FXRate-web 是外汇汇率查看网页应用（前端），配套后端仓库 [186526/fxrate](https://github.com/186526/fxrate) 以 git submodule 挂在 `lib/fxrate/` 下。前端经 JSON-RPC 调用其 `FXRates` client 获取汇率，用轻量 MUI Table 展示多家银行/平台的买卖价、中间价与最优价高亮。

技术栈：Next.js 16.3（App Router，`output: "standalone"`）+ React 19 + TypeScript + MUI v6（`@mui/material` + `@mui/icons-material`）+ Emotion + Tailwind。

## 目录结构

```
app/                 # 路由（layout/page 默认视图 SSR 预取+薄壳降级、loading 骨架、matrix 薄壳）
componets/           # 目录名拼写错误是有意为之，勿改名
  index.tsx          # 客户端主组件（orchestrator）：状态、拉数、视图切换、视图缓存、sticky Header/Footer
  apidocs.tsx / api-docs/  # API 文档页 orchestrator + typed endpoint model、请求协调器、导航/工作台组件
  currencyChooser.tsx # 货币选择器（受控 Autocomplete + 换向 + 金额；矩阵视图只显示基准货币/金额）
  fxlistgrid.tsx     # 单对报价表（排序、最优价高亮、相对更新时间、首列 sticky、来源 logo）
  fxmatrixgrid.tsx   # 全对矩阵表（source × 货币，现钞/现汇/中间价切换、列高亮、常用币种筛选、列头国旗）
  footer.tsx         # 页脚（版权/by 链接、前后端版本 tooltip、GitHub 链接）
  bestPriceSources.ts# 最优价高亮来源集合 hook（默认排除央行/卡组织，localStorage 持久化）
  sourceIcon.tsx     # 来源图标（本地 logo 优先，类型图标兜底）+ 货币国旗映射
  theme.tsx / theme-init.ts  # MUI 主题 Provider（Sunoaki 风）+ 预绘制主题脚本（beforeInteractive 注入）
  tools.ts           # FXRate client 单例、批量查询、LRU 缓存（货币列表/单对/矩阵）
  ssr-prefetch.ts    # 默认视图 SSR 预取（server-only）：SWR 缓存 TTL 45s + 8s 超时降级
  web-vitals.tsx     # Web Vitals 内存记录（window.__FX_WEB_VITALS__，不发网络请求）
lib/fxrate/          # git submodule（后端库，含 src/client JSON-RPC client）
public/bank-logos/   # 59 源 logo SVG（source 代码命名，如 hsbc.cn.svg）+ cfets/hkma PNG；SourceIcon 兜底
                     # iconfont 来源 SVG 统一标准：1024² 画布 → canvas 检测非白像素边界 → viewBox 裁剪「图形 ~93%、留 ~7% 内边距」；
                     # 横向徽章（HSBC 菱形）品牌固有形状，裁剪后偏矮属正常，勿强行方形化
```

## 关键实现要点

- **数据流**：`app/page.tsx` 仅对默认视图（`/` 且参数缺省或默认 from=CNY/to=USD/amount=100/precision=4）做 SSR 预取（`ssr-prefetch.ts` → `showCurrencyAllRates()` + `info()` + `getCurrenciesDetails()`），结果以 `initialCurrencies`/`initialResult`/`initialBackendVersion` props 随 RSC 下发，hydration 不重复拉货币列表/版本；服务端模块级 SWR 缓存 TTL 45s + 8s `withTimeout`，任何失败/超时/空结果降级为薄壳（客户端照常自拉），绝不阻塞首屏。**非默认参数/矩阵视图保持纯客户端，URL 参数变化绝不触发服务端数据请求**（历史卡顿根因）；`/matrix` 路由仍是薄壳。挂载后 300ms 客户端仍触发一次 SWR 刷新（补 visa 慢源行 + 最新值）。k8s web 部署 `FXRATE_API` 指向集群内 `http://fxrate:8080/v1/jsonrpc`（SSR 直连），`FXRATE_PROXY` 保持公网 URL 供浏览器 `/api/fxrate` 代理。
- **加载骨架与 Web Vitals**：`app/loading.tsx` + `componets/tableSkeleton.tsx`（`ListTableSkeleton`/`MatrixTableSkeleton`，sticky 名称列 + 真实列名 + 8 行无假数据，共用 `LIST_COLUMNS`）让路由段等待与浏览器拉数阶段的骨架视觉一致，避免加载/就绪布局跳动；`web-vitals.tsx` 用 `useReportWebVitals` 记录 TTFB/FCP/LCP/CLS/INP 到环形缓冲（挂根 layout 跨路由常驻，静默、不发请求）。
- **视图数据缓存（SWR）**：`index.tsx` 的 `pairCacheRef`/`matrixCacheRef` 按参数 key 存最近数据，同视图参数重拉先显旧数据再后台刷新；`/`↔`/matrix` 切换重挂载 `Index`，由 `tools.ts` 模块级 LRU 零网络恢复。已有**实际渲染报价**的后台刷新失败 → 继续展示旧快照 + 固定定位 warning（明示陈旧语义与重试入口，不插入布局不位移）；空快照不算陈旧。单对回调 `FXDetailsUpdate`（`{data, fastFailed}`）：`fastFailed=false` 按行合并只保留旧 `SLOW_SOURCES` 行、快源未返回即移除；`fastFailed=true` 保留全部旧行且**不清错误提示**，慢源结果只能追加。
- **`tools.ts`**：`FXRate` 为浏览器默认 client 单例（兼容既有导入）；`getFXRateClient()` 统一入口——浏览器返回单例，服务端经 `React.cache` 返回请求级 client（防共享 `batch()/done()` 可变状态）。批量请求一律经 `runBatch(client, queue, signal?)` 兜底（保证 `done()` 被调、异常不残留污染后续请求）。`getCurrenciesDetails()` 按 `from-to-amount-p{precision}[-bfs]|来源支持指纹` 缓存（指纹含参与来源及其支持货币，变化自动失效）；`getRatesMatrix()` 用 `listFXRates`（key 含精度/方向 + 来源/支持指纹 + 排序后 `skipSources` 指纹）；源过滤条件「来源列表含 from 或 to 任一」（部分货币列表时缺失条目安全跳过），让后端 BFS 算交叉汇率（如 CNY↔CNH）；矩阵每格保留 `{middle, cash, remit, updated}`。
- **交叉汇率（单对）**：Header 按钮（localStorage `fxrate-cross-rates`）切换 `bfs` 参数（默认关闭，有累积误差）；交叉行银行名旁「经 HKD 折算」虚线标识，tooltip 展示完整路径。
- **慢源拆分（Visa）**：`SLOW_SOURCES`（tools.ts）标记慢源（Visa chromium 降级查询不支持的货币可达 30s+；**MasterCard 毫秒级不在此列**）。单对视图把慢源拆出主批量 fire-and-forget 单独后台请求（**仅浏览器端**——SSR 不启动，请求级 client 渲染作用域结束即失效），完成后按 source 合并回调一次；有慢源时快源与慢源都成功（`slowOk`）才写缓存，慢源失败/未完成都不落（下次仍重试）。缓存写入经**代际守卫**（`slowSourceLatestGen` bounded LRU + 全局单调 id，**请求开始时登记**）：过期慢源批完成仍回调活跃调用方但不覆盖缓存，单调 id 防 key 重建后撞号。矩阵默认不请求慢源，底部「点击加载」行经 `getSourceMatrixRow()` 用 `getFXRate` 逐货币合并（后端对卡组织全表 403；只查支持货币避免 chromium 重建超时），每格写 `safeUpdated`；MasterCard 行在矩阵中 autoLoad 自动补查（该行为空/403 时），参数变化重置，单独加载行透传 `bfs`。
- **视图与交互**：Header Tabs 切「单对报价」/「全对矩阵」。换向交换 from/to；金额防抖 300ms；单对 60s 自动刷新（仅页面可见时强刷）；手动刷新同时强刷矩阵。金额单位 `ToggleButton`（`selected`→`aria-pressed`，可访问名称动态描述当前模式与点击效果）；矩阵反向时金额标签「每种货币金额」。精度 select（原样/-1、0/2/4/6）持久化 `fxrate-precision` 并纳入缓存 key。xs（≤599.95px）把「精度/交叉汇率/刷新/API 文档/切换主题」收进「更多」溢出菜单（MoreVert 触发，精度项二级菜单锚定同按钮，交叉汇率项带 `selected`），sm+ 常规控件。
- **AbortSignal 传播**：cross-rates/amount/from/to/precision/view 变化时 abort 对应视图的 `AbortController`（pair/matrix 独立），signal 传给 `getCurrenciesDetails`/`getRatesMatrix`/`getSourceMatrixRow`；`runBatch` 预中止直接抛 `AbortError`（零请求、不触碰 client 队列），在途用 `abortable(client.done(), signal)` 竞态。**被取消契约**：不写缓存、不回调、不启动慢源后台批（`isAbortError` 跳过错误提示，reqId 代际守卫兜底）；已启动的慢源批 detached 不受影响；额外行补查在 `rowParamsKey` 变化或关闭交叉汇率时同样 abort。
- **矩阵视图**：`?from=X` 正向（买入），`?to=X` 反向（`reverse=true`），前端不做算术倒数。默认 12 常用币种（`DEFAULT_COMMON_CURRENCIES`），「显示货币」弹层勾选（localStorage `fxrate-matrix-currencies`）；「中间价/现钞/现汇」ToggleButtonGroup 切列值，「最优价」弹层控高亮来源。主数据与补查行**单元格字段级深合并**（`mergeCellRows`：重叠字段主数据优先、补查独有字段保留，`false`/`0`/字符串等合法值不受影响）；额外行以 **keyed 快照** `{key, data}` 存储，参数变化按 key 隔离旧行，异步写回要求 key 与 `rowParamsRef`（`useLayoutEffect` 同步）一致，新增货币列不触发整批重置。自动补查按来源维护 `idle/loading/success/error`：失败渲染「加载失败，重试」行且不被永久去重（参数变化/主数据更新重新评估）；**unchanged-key AbortError 复位**：StrictMode 双挂载 cleanup 提前 abort 时，参数未变（`rowParamsRef.current == requestKey`）则复位源状态与 `autoAttemptedRef` 让 auto-load 重试，参数已变静默忽略。
- **最优价高亮**：`useBestPriceSources()` 两视图共用，默认排除 `NON_BANK_SOURCES`（pboc/unionpay/mastercard/wise/visa/jcb/ecb/cfets/hkma/alipay），localStorage `fxrate-best-price-sources`；高亮 = `primary.main` 加粗 + `brandSoft` 底色（品牌色 14% 透明）+ 非颜色标记 `BestPriceMark`（★ `role="img"` + `aria-label="最优价"`，不包裹数字 span）。Header「参与高亮 X/Y 家」分子分母同取**可见**来源集，避免隐藏源计入分母超限。
- **表格视觉（Phase 4B）**：轻量斑马纹画在**单元格层**而非行层（半透明 brandSoft 高亮格与行层底色合成会把对比度压到 4.22:1 触发 axe；格层合成维持 4.57:1），sticky 首列同步斑马底色，行 hover 经 `.MuiTableRow-hover:hover` 覆盖。矩阵角落格（表头「银行/平台」）`zIndex: 3` 高于 MUI stickyHeader 默认 2（双轴滚动下必须最高覆盖交叉区）。窄屏：来源列 `SOURCE_COL_MIN_WIDTH`（xs 116/sm 150）+ 首列 sticky 长名截断；数值列 `NUMERIC_CELL_LAYOUT`（min xs 64/sm 80、max xs 104/sm 136、nowrap + ellipsis），320px 可读。
- **统计 Tooltip（Phase 4B 任务 12）**：`rateStats.tsx` 桌面端 `StatsTipProvider` 持有**唯一受控 Tooltip**（`anchorEl` 指向活动触发格，disableHover/Focus/TouchListener），每格仅触发元素，活动格 `aria-describedby` 关联浮层（describeChild 语义），卸载 cleanup 防悬空；移动端为点击 Popover（`aria-haspopup=dialog` + Enter/Space 激活，`MobileContext` 顶层算一次 matchMedia）。
- **URL 参数与视图记忆**：默认 `from=CNY&to=USD&amount=100&precision=4`。同路径参数变化用 Native History API `replaceState(state, "", nextUrl)` 防抖 300ms 原地同步（保留 Next history state、不触发 RSC GET）；**视图切换（路径变化）仍走 `router.push`**（push 前取消待写 timer 并推进 URL 写入代际，timer 回调校验代际与预定 pathname，旧路径写入不覆盖新路径）。pair 与 matrix 独立 state/存档（pair 写 `fxrate-pair-from/to`、`fxrate-reverse`，matrix 写 `fxrate-matrix-base/reverse`；直接加载与 popstate 当前 URL 优先，跨视图往返恢复存档）。pair URL 恒带 from+to；matrix 正/反向只带 `?from=` 或 `?to=`（不携冲突方向参数），均带 amount/precision。`page.tsx` 是薄壳不解析 searchParams（客户端 `useSearchParams` 读取，支持 `?precision=` 显式指定，默认 4）。
- **主题**：`theme.tsx`（`ThemeProvider` + `useThemeMode()`）以 `<html data-theme>` 为单一事实来源（`useSyncExternalStore`，`getServerSnapshot` 恒 light 保证 hydration 无 mismatch，提交后自动校正为预绘制主题）。**预绘制初始化**（消除 dark 背景白闪）：layout `beforeInteractive` 注入 `themeInitScript`（`theme-init.ts`），把 `localStorage["fxrate-theme"]`（仅 light/dark）→ `prefers-color-scheme: dark` 回落结果写 `<html data-theme>` 与 `style.colorScheme`（每步独立 try，绝不被拦/不抛错），`globals.css` 的 `html[data-theme]` 规则 hydration 前就着色 html/body。**FOUC 评估结论（Phase 4B 任务 13）**：不做组件级 CSS 反色（深色文字落深色表面反而不可读）也不做 SSR 暗色预渲染（主题模式 SSR 不可知，会破坏 `getServerSnapshot` 恒 light 契约与 palette 色值计算）；只做安全过渡——sticky header 加 `background-color 0.2s ease`（body/Paper 已有）。持久化 effect 只在 mode 与 DOM 解析一致时写回（hydration 中间态 light 不覆盖 dark 存档）。根 `proxy.ts` 按 Next 16 文档模式生成每请求唯一 CSP nonce（`crypto.getRandomValues`+`btoa`）：请求头带 `x-nonce` + 同 nonce CSP（layout 读 `x-nonce` 传 Script），响应头 production CSP（`script-src 'self' 'nonce-…'` 无 unsafe-inline + 显式 analytics host；`style-src` 保留 unsafe-inline 供 MUI/Emotion；dev 不注入避免干扰 HMR）；布局因 `headers()` 动态渲染。设计语言（sunoaki.net，`mui.d.ts` 含 `brandSoft`/`surfaceMuted`/Button `tonal` 类型增强）：暖色纸张感（浅 `#fbfaf7`/暗 `#10171c`）+ 深青绿 accent（`#2f6f73`/`#8fc3c6`）、`borderRadius=14`、卡片 14px 圆角 + 1px 暖沙边框、pill 按钮、表头 `surfaceMuted` 600 字重、tooltip inverse 惯例、表格 `tabular-nums`、`fontFamily="inherit"`（next/font Inter）；交互元素 2px 品牌色 `focus-visible` 轮廓（移动端 Tab 内嵌轮廓防 Tabs scroller 裁切），**Tab 的 `transition` 只覆盖背景/文字色**（`index.tsx` 的 `"& .MuiTab-root"`，改回 `all` 会让键盘聚焦 outline 0→2px 动画、e2e 聚焦截图截到 1px 中值）；常规可交互控件 ≥40px 目标。`test/e2e/accessibility.spec.ts` 在 320/360px 检查目标尺寸/焦点环（未覆盖控件不据此宣称通过完整门禁）。
- **页脚**：`footer.tsx`（client）渲染在 Index 底部，props `buildId`/`buildTime`/`version`/`backendVersion`；版权 `@real186526` → https://186526.xyz；tooltip 显示 `fxrate-web@短hash + 构建时间 + 完整 hash`（构建时间格式对齐后端 BUILDTIME：`2025-10-20T23:29:04+08:00` 本地时区 ISO），GitHub 链接指后端仓库。
- **构建元数据注入**：`next.config.mjs` 构建开始时冻结 `FXBUILD_ID`（CD 注入完整 commit，本地回落 `production`/`development`）、`FXBUILD_TIME`（CD 可注入否则 ISO）、`FXRATE_PROXY_BUILD`（与 rewrites 同源构建期解析值）；页面只读内联常量，运行时不执行 git/读 `.git`。`/api/backend-meta` 同读 `FXRATE_PROXY_BUILD`，报告的 RPC/REST 地址恒与 standalone 已固化的 rewrite 一致，避免「文档地址已变但代理未变」漂移。
- **响应安全头**：`next.config.mjs headers()` 全路由加 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、严格来源 Referrer Policy、禁用 camera/geolocation/microphone 的 Permissions Policy；`proxy.ts` CSP 另含 `frame-ancestors 'none'`；`x-fx-release`/`x-fx-build-time` 暴露构建标识与时间。
- **已知问题（勿"顺手修"）**：`next.config.mjs` 关闭构建时 ESLint/TS 检查（`ignoreBuildErrors`/`ignoreDuringBuilds`）；CI 需单独跑 `npx tsc --noEmit`、`yarn lint`、`yarn test`、`yarn build`（四道独立门禁，任一失败即红）。

## 构建与运行

```bash
yarn install          # 需先确保 lib/fxrate 子模块已 init/update
yarn dev              # 连默认 API https://fxrate.sunoaki.net/v1/jsonrpc
yarn full-dev         # 同时跑 lib/fxrate 后端（8080）与前端，FXRATE_API 指向本地
yarn build            # 生产构建（standalone 输出）
yarn lint             # eslint .（构建时默认跳过）
yarn test             # vitest run（node 环境，组件测试文件内 `// @vitest-environment jsdom`）
yarn test:watch       # vitest watch
yarn test:e2e         # playwright：自动拉起本地 mock JSON-RPC 后端 + next dev，不碰真实上游
yarn test:all         # test + test:e2e
yarn bench:lighthouse # Lighthouse 基准（mobile+desktop，输出 /tmp/fxrate-benchmark）
yarn bench:trace      # Chrome CDP performance trace（输出 /tmp/fxrate-benchmark）
```

### 测试基础设施（test/）

- **单元/组件（`test/frontend/`）**：Vitest 4 + RTL + jsdom；`vitest.config.mts` 用 `@/*`；`setup.ts` 装可委托 `fetch` 桩（`__fxSetFetch`——`tools.ts` import 时即绑定 `globalThis.fetch`）+ `matchMedia`/`ResizeObserver` 兜底；`jsonrpc.ts` 提供批处理 mock（按 method 分派、部分失败）与 `createDeferredBatchMock`（延迟响应批供 AbortSignal 测试控时序）。已覆盖：`showCurrencyAllRates` 部分结果不缓存、部分货币列表安全跳过 / runBatch 失败后 client 复位 / 来源支持指纹缓存 key / 慢源（visa）缓存完整性（任一失败不落缓存）/ 矩阵缓存 key / `getSourceMatrixRow` 过滤与 updated 时间戳 / 单元格深合并与 rowParamsKey 重置 / Index 矩阵请求作废与单对陈旧行移除 / AbortSignal 传播全套（预中止零请求、中途 abort 不写缓存不回调、关闭交叉汇率不启旧 BFS 慢源批、慢源 fire-and-forget 不被 abort 打断、快速改金额取消旧批次、单对 abort 不影响矩阵）。
- **端到端（`test/e2e/`）**：Playwright + @axe-core/playwright。webServer 先起本地 mock（`test/e2e/mock-server/index.cjs`，`/v1/jsonrpc` + `/__counters` + `/__reset`），再以 `FXRATE_API`/`FXRATE_PROXY` 指向它启动 `next dev`——SSR 与浏览器代理都走 mock，零真实上游。**baseURL 必须用 `localhost` 而非 `127.0.0.1`**（Next 16 allowedDevOrigins 拦 127.0.0.1 Host 导致 React 不水合）；mock 与 dev 都只绑 loopback，mock body 上限 1 MiB（413 不计批次），端口 `MOCK_PORT`/`WEB_PORT` 可覆盖。`helpers/mockJsonRpc.ts` 拦截 `/api/fxrate` 做确定性应答/计数（`paramsOf(method)` 供方向/参数断言），`{ hold: [method] }` + `release(method)` 控制响应时序。断言语义（`request-count.spec.ts`）：**默认视图 SSR 预取 + hydration 不重复拉**——首屏 pair 浏览器层 = 主批量（3 快源×2 方向）+ visa 慢源后台 = 2 批量、8 getFXRate、instanceInfo/listCurrencies 恒 0；切矩阵（薄壳无 initial props + dev StrictMode 双挂载）→ +6 批量；切回 pair 命中服务端 SWR + 浏览器 LRU 零新增。`navigation-race.spec.ts` 相对增量断言（切货币/金额 = +2 批量、+8 getFXRate、零 document 导航）；`route-loading.spec.ts` hold listFXRates 断言矩阵客户端骨架（`role=status`）保持、release 后换真实表格；`matrix-reverse.spec.ts` 覆盖 `?to=` 反向（URL、文案、零导航、`reverse=true`、footer 后端版本 + 浏览器层 instanceInfo）；`mock-server.spec.ts` 直连 mock 验 loopback 与 413；`scroll-corner.spec.ts` 双轴滚动角落格 `zIndex>2` + `elementFromPoint` 命中交叉区；`api-docs.spec.ts` 的「试试看」先等 `#<endpoint-id>` 工作台挂载再限定 `workbench` 内点击（避免点击 SSR 瞬态按钮发错端点）；a11y gate 断言 serious+critical，白名单仅放行既有对比度节点（表头 muted 已加深 `#5a666e` 达 AA 后移除表头/ToggleButton 条目；仍放行 RelativeTime 与 footer 版本 caption）。
- **React 19 renderOption key 警告**：`currencyChooser.tsx` 的 `renderOption` 显式解构 `key` 传给根元素（React 19 禁止展开含 key 的 props）；`currencychooser.test.tsx` 断言打开两个下拉无 key 展开 console.error。

### 性能基准（scripts/bench/）

本地确定性基准，**零真实上游**：复用 `test/e2e/mock-server/index.cjs` + `next dev -H 127.0.0.1`（双 FXRATE 环境变量指向 mock），输出 `/tmp/fxrate-benchmark/` 下**每-run 独立子目录**。`harness.mjs` 共享：动态探测空闲 `MOCK_PORT`/`WEB_PORT`、就绪轮询、**预热一次首页请求**（让 Next dev 按需编译在测量前完成——本地确定性关键）、SIGINT/SIGTERM 与异常路径清理子进程，日志落 `mock-server.log`/`next-dev.log`。要点：`prepareOutputDir` 拒绝符号链接/非目录的 `--output-dir`；`stopChildren` SIGTERM → **5s 未退出 SIGKILL**，已退出立即跳过，子进程提前退出立即报错不等满超时（防 `.next/dev` 锁死场景）；`withShutdown` 先 await cleanup 再 exit（幂等）。Lighthouse（`lighthouse-bench.mjs`）：chrome-launcher 动态空闲 debug 端口 + `--headless --no-sandbox` 拉 Playwright Chromium（`CHROME_PATH` 可覆盖），预热后跑 mobile/desktop preset（`--preset`，默认 both），**lighthouse() 不落盘、需自己写 `result.report`**（`output:"json"`），默认只审 performance（`--categories` 可改）。CDP trace（`chrome-trace.mjs`）：`Tracing.start` 的 **categories 必须是逗号拼接字符串（数组被 CDP 拒绝）**，`Tracing.end` 前**先注册 `once("Tracing.tracingComplete")` 再 send**，`IO.close` 放 finally 必关。`parseFlags` 接受 `--key value`/`--key=value`，未知旗标抛错。聚焦测试 `bench-harness.test.ts` 离线断言以上行为。依赖 `lighthouse`/`chrome-launcher` 为 devDependency（不进运行时包），Chrome 复用 Playwright 已下载 Chromium。

环境变量：`FXRATE_API` 覆盖后端 JSON-RPC 地址（默认 `https://fxrate.sunoaki.net/v1/jsonrpc`，见 `tools.ts`）。

### 开发用本地后端（端口 8081）

```bash
cd lib/fxrate && PORT=8081 nohup node --unhandled-rejections=warn dist/index.cjs > /tmp/fxrate-backend-8081.log 2>&1 &
```

- 代码默认端口 8080，本地用 8081 避免与 `yarn full-dev` 的 tsx 实例冲突。
- dist 需最新：`lib/fxrate` 内 `yarn build`（esbuild 重建 `dist/index.cjs`，注入 BUILDTIME/GITBUILD），改源码后重建再重启。
- 版本检查：`curl http://127.0.0.1:8081/info` 或 JSON-RPC `instanceInfo`（footer「后端 fxrate@短hash」来自后者）。
- 重启旧进程：SIGTERM 一次可能不生效（SNsl 睡眠态），确认端口释放，必要时 SIGKILL。

### 前端连本地后端必须同时设 FXRATE_API 与 FXRATE_PROXY

**坑**：`process.env.FXRATE_API` 只在服务端（SSR）注入——浏览器端看不到，客户端 fallback 到同源代理 `/api/fxrate`，其目标由 `FXRATE_PROXY` 决定（默认线上）。只设 `FXRATE_API` → 客户端所有请求仍走线上代理（footer 版本号暴露真相）。

```bash
FXRATE_API=http://localhost:8081/v1/jsonrpc FXRATE_PROXY=http://localhost:8081/v1/jsonrpc yarn dev
```

判断连接目标：footer「后端 fxrate@短hash」应为本地 `lib/fxrate` 当前 HEAD hash。

## 约定与注意事项

- `componets/` 目录名拼写错误是历史遗留，保持原样；新组件放里面。
- UI 面向中文用户：表头/文案用中文，数据源名经 `lib/fxrate/src/constant.ts` 的 `sourceNamesInZH` 映射。
- 依赖用 yarn（1.22）管理（`yarn.lock`），勿混用 npm/pnpm。
- `lib/fxrate` 是 submodule（`.gitmodules`），改动需到子模块仓库单独提交；`tsconfig.json` exclude 它（前端 tsc 只连带检查被 import 的 `src/client/index.ts`）。
- **CI 门禁**（`.github/workflows/ci.yml`）：push/PR 跑 `npx tsc --noEmit` + `yarn lint`（非变更性，`eslint .` 无 `--fix`）+ `yarn test` + `yarn build`；checkout 需 `submodules: recursive`（tsc 要解析 `lib/fxrate/src/client`）；第三方 actions 锁不可变 commit SHA，Node 固定 24.15.0。`workflow_call` 供 Phase 6 发布门禁（`cd.yml` `build-smoke-push` `needs: gates`，仅 v* tag 触发；构建前强制 `v<版本> == package.json.version`，注入 `FXBUILD_ID`/`FXBUILD_TIME`；顶层 concurrency 按 ref 串行）。**两级 smoke + 推精确测试产物**：① 构建发布镜像（push:false + load，**无 `FXRATE_PROXY` build-arg → 生产默认代理**）；② Tier-1 `image-smoke.sh --exact --image <tag> --expected-proxy <生产地址>` 对精确发布镜像跑确定性 smoke（前端 `/` + 安全/构建响应头 + `/api/backend-meta` 精确 proxy + 容器存活，只验契约形状**不访问真实银行**）；③ Tier-2 默认构建**契约镜像（不发布）**（`--build-arg FXRATE_PROXY` 指向 smoke 后端 + 确定性元数据），验后端 `/info`、`/readyz`、`/metrics` 8 family、`instanceInfo`、`/api/backend-meta` 与浏览器代理 `/api/fxrate`；④ 对已 Tier-1 smoke 的**同一批 tag** 逐个 `docker push`（绝不重新构建）+ attestation。tag：`:版本` + `:主.次` + `:sha-…`，非预发布 v* 额外 `:latest`。`image-smoke.sh --local`（无 Docker：`node lib/fxrate/dist/index.cjs` + `next dev`，跑 Tier-2 同组断言）供本地预检——`next dev` 同目录只能起一个（.next/dev 锁），与 e2e 并发用 docker contract 模式。
- Dockerfile：`node:24-alpine` 锁定多架构 manifest digest；`.dockerignore` 排除 `.git`，builder 仅接收 `FXRATE_PROXY`/`FXBUILD_ID`/`FXBUILD_TIME` build args，runner 无 git、无仓库历史、无运行时 `FXRATE_PROXY`。rewrites 的 `/api/fxrate` 目标在 `next build` 时固化进 standalone，自定义代理必须构建期注入，不传自动回落生产默认。
- 代码风格：缩进 tab、双引号、无分号。

## 对 AI 助手的约定

- 思考/推理过程（chain-of-thought）使用英文；与用户对话时使用中文。
- 代码修改若导致本文档描述的架构、目录结构、数据流、构建方式或约定发生变化，必须同步更新本文件。
