# AGENTS.md

## 项目概览

FXRate-web 是一个外汇汇率查看网页应用（前端），配套仓库 [186526/fxrate](https://github.com/186526/fxrate)（后端数据服务）。本仓库将 fxrate 以 git submodule 形式挂在 `lib/fxrate/` 下，前端通过 JSON-RPC 调用其 `FXRates` client 获取汇率数据，并用轻量 MUI Table 展示多家银行/平台的买卖价、中间价与最优价高亮。

技术栈：Next.js 16（App Router，`output: "standalone"`）+ React 19 + TypeScript + MUI v6（`@mui/material`，含 `@mui/icons-material`）+ Emotion + Tailwind。

## 目录结构

```
app/                 # 路由页面（layout.tsx、page.tsx 薄壳、loading.tsx 加载骨架）
componets/           # 注意：目录名拼写如此（components 的 typo），是有意为之，勿改名
  index.tsx          # 客户端主组件（orchestrator）：状态、数据拉取、视图切换、视图数据缓存、sticky Header、Footer
  currencyChooser.tsx# 货币选择器（受控 Autocomplete + 换向 + 金额；矩阵视图只显示基准货币/金额）
  fxlistgrid.tsx     # 单对报价表（MUI Table：排序、最优价高亮、相对更新时间、首列 sticky、来源 logo）
  fxmatrixgrid.tsx   # 全对矩阵表（source × 货币，现钞/现汇/中间价切换、列高亮、常用币种筛选、列头国旗 emoji）
  footer.tsx         # 页脚（版权/by 链接、前后端版本 tooltip、GitHub 链接）
  bestPriceSources.ts# 共享 hook：参与最优价高亮的来源集合（默认排除央行/卡组织，localStorage 持久化）
  sourceIcon.tsx     # 共享来源图标（本地银行 logo 优先，无则类型图标兜底）+ 货币国旗 emoji 映射
  theme.tsx          # MUI 主题 Provider（Sunoaki 风格 dark/light，useSyncExternalStore 读 <html data-theme>）
  theme-init.ts      # 预绘制主题脚本字符串 + THEME_KEY/THEME_ATTR 常量（layout beforeInteractive 注入）
  tools.ts           # FXRate client 单例、批量查询、LRU 缓存（货币列表/单对/矩阵）
  web-vitals.tsx     # Web Vitals 埋点（useReportWebVitals：TTFB/FCP/LCP/CLS/INP 内存环形缓冲记录，挂载于根 layout，不发网络请求）
lib/fxrate/          # git submodule（fxrate 后端库，含 src/client 的 JSON-RPC client）
public/
  bank-logos/        # 本地银行/平台 SVG logo（source 代码命名，如 hsbc.cn.svg；来源：Wikimedia Commons / GitHub 开源集合 / iconfont.cn 图标库（cid=23316 银行合集，补全无开源源的小众银行）；均保留 SourceIcon 图标兜底机制）。
                     # iconfont 来源的 SVG 统一处理标准：原始 1024×1024 画布 → 用浏览器 canvas 渲染检测非白像素真实边界 → viewBox 裁剪为「图形占 ~93%、居中、四周留 ~7% 内边距」（与 xib/icbc/pab/cmb/boc 等一致，保证 16px 下所有图标视觉大小统一；勿裁剪到 100% 贴满，会显得比其他图标大）。
                     # 横向徽章（HSBC 菱形 2:1 等）是品牌固有形状，裁剪后 contain 显示自然偏矮，属正常，勿强行方形化。
                     # 特例：cfets/hkma 为 PNG（hkma 取官网 jpg 白底转透明），SourceIcon 的 LOGO_EXT 映射；全部 59 源 icon 与官方牌价链接（tools.ts sourceRatesURL）已齐全。
```

## 关键实现要点

- **数据流（客户端驱动）**：`app/page.tsx` 是薄壳（只渲染 `<Index buildId buildTime version />`，不做服务端拉数）；所有汇率数据由客户端 `componets/index.tsx` 经 `componets/tools.ts` → `FXRates` client → fxrate 后端 JSON-RPC 拉取，结果按 key 缓存进 LRUCache（TTL 5 分钟），切换货币对/金额命中缓存时零请求。**切勿把数据拉取搬回 `page.tsx`**——那会让每次 URL 变化都触发整轮服务端重拉（历史卡顿根因）。
- **路由加载骨架与 Web Vitals（Phase 4）**：`app/loading.tsx`（client）在路由导航/首屏流式的路由段等待期间渲染与正式页面结构对应的最小骨架（sticky 顶栏 + 货币选择器 + 报价表骨架，真实列名无假数据）；薄壳提交后由 `Index` 自身的**表格结构客户端骨架**接管浏览器 JSON-RPC 拉数阶段——`componets/tableSkeleton.tsx` 导出 `ListTableSkeleton`（单对列：银行/平台、购钞/购汇/结钞/结汇、中间价、更新时间）与 `MatrixTableSkeleton`（来源列 + 默认 12 常用币种列头带国旗 emoji），均 sticky 名称列 + 真实列名 + 8 行无假数据，与 `app/loading.tsx` 共用同一 `LIST_COLUMNS` 定义（路由骨架与客户端骨架视觉一致，避免加载/就绪切换的大幅布局跳动）。`componets/web-vitals.tsx` 经 `next/web-vitals` 的 `useReportWebVitals` 记录 TTFB/FCP/LCP/CLS/INP 到模块级环形缓冲（快照暴露在 `window.__FX_WEB_VITALS__`），只做内存记录、不发网络请求/日志、异常静默忽略，渲染 null 挂载于根 layout 跨路由常驻。
- **视图数据缓存（stale-while-revalidate）**：`index.tsx` 内 `pairCacheRef`/`matrixCacheRef` 各自按参数 key 保存当前 `Index` 挂载期间对应视图最近一次数据，用于同一视图参数重拉时先显示旧数据再后台刷新；`/` 与 `/matrix` 路径切换会重挂载 `Index`，此时由 `tools.ts` 的模块级 LRU 按更完整参数 key 零网络恢复。已有**实际渲染报价**的后台刷新失败时继续展示上次成功快照，并用固定定位的 warning 明示陈旧语义与重试入口（不插入表格布局、不产生位移）；空成功快照（单对 `[]`、矩阵 `{}`）或仅含最终不会渲染为报价的空行不算陈旧数据，后续失败仍使用内联 error。单对刷新回调携带 `FXDetailsUpdate`（`{data, fastFailed}`）：`fastFailed=false`（正常成功刷新）按行合并时只保留旧 `SLOW_SOURCES` 行（慢源后台批未归/失败兜底），快源行本次未返回（失败/已下线）即移除，避免陈旧报价残留；`fastFailed=true`（快源批量失败/不完整，回调只含慢源或部分快源结果）保留既有全部行并**不清除错误提示**，后到的慢源结果只能追加，不能把有效表格退化为慢源单行、也不能掩盖失败现场。`showCurrencyAllRates()` 允许部分来源失败（如上游被反爬拦截时 `done()` 抛错）并返回成功部分做降级，避免单个来源拖垮整个货币列表。
- **`tools.ts`**：`FXRate` 是浏览器端默认 client 单例（兼容既有导入）；`getFXRateClient()` 是统一入口——浏览器返回该单例，服务端经 `React.cache` 返回**请求级 client**（薄壳下 SSR 不再拉数，此分支为防御性保留：若未来任何服务端代码调用 tools 数据函数，也不会共享 `batch()/done()/请求队列` 可变状态），所有数据拉取都走它。批量请求一律经 `runBatch(client, queue, signal?)` 生命周期兜底：无论排队阶段是否抛错都保证 `done()` 被调用复位 `inBatch`/队列（幂等），异常不残留污染后续请求。`showCurrencyAllRates()` 批量取各来源支持的货币列表（结果缓存，允许部分来源失败降级返回部分结果）；`getCurrenciesDetails()` 用 `client.batch()` 合并请求，参数含 `amount`（换算金额，默认 100）/ `precision`（默认 4）/ `force`（绕过缓存读）/ `bfs`（交叉汇率开关）/ `signal`（取消信号，见下），按 `from-to-amount-p{precision}[-bfs]|来源支持指纹` 缓存——指纹（`sourceSupportFingerprint`）把参与请求的来源及其支持货币排序后纳入 key，来源/支持货币变化时缓存自动失效，避免命中缺新源的旧数据；回调类型为 `FXDetailsUpdate`（`{data, fastFailed}`，`fastFailed` 表示本次快源批量失败/不完整）；`getRatesMatrix()` 用 `listFXRates` 拉全对矩阵（同样缓存，key 含精度与方向 + 来源/支持指纹 + 排序后的 `skipSources` 指纹）。`getCurrenciesDetails` 的源过滤条件是「来源列表含 from 或 to 任一」（货币列表为部分结果时缺失条目安全跳过），让后端 BFS 路径引擎算交叉汇率（如 CNY↔CNH）；矩阵保留每格的 `{middle, cash, remit, updated}`。
- **交叉汇率（单对视图）**：Header「交叉汇率」按钮（localStorage key `fxrate-cross-rates`）切换 `bfs` 参数——开启后无直连报价时后端 BFS 找中间货币路径折算（有累积误差，默认关闭）；交叉行银行名旁显示「经 HKD 折算」虚线标识，tooltip 展示完整路径（如 `CNY → HKD → CNH`）。
- **慢源拆分（Visa）**：`SLOW_SOURCES`（tools.ts）标记反爬抓取慢的源（Visa 走 headless chromium 降级，查询不支持的货币时单次可达 30s+；**MasterCard 实测毫秒级，不在此列**）。单对视图把慢源拆出主批量**单独后台请求**（fire-and-forget，完成后按 source 合并回 data 再回调一次，**仅限浏览器端**——SSR 不启动，请求级 client 在渲染作用域结束后失效且 30s+ 抓取不应残留服务端进程），避免慢源拖垮整批导致 client 30s 超时；有慢源时主流程不写快源-only 缓存，快源与慢源都成功（`slowOk`）才由 `mergeAndNotify` 统一写缓存——慢源失败或尚未完成都不落缓存，保证下次请求仍会重试慢源（快源失败 `failed=true` 同样不写）。缓存写入另经**代际守卫**：`slowSourceLatestGen`（bounded LRU，`max:100`）+ 全局单调递增 id 记录每个 key 的最新慢源代际，**代际在请求开始（快源批启动前）登记**，过期慢源批（更晚的 force/普通请求已接管）完成时仍回调自己仍活跃的调用方，但**不得覆盖缓存**——登记若延后到慢源批启动，会留下「先发的慢源批先完成、新 force 快源批尚未完成」的窗口让旧结果写进缓存；全局单调 id 保证 key 被清理重建后新旧请求不会撞号（per-key 计数器删除后会从 1 重新计数导致碰撞）。矩阵视图默认不请求慢源，表格底部显示「点击加载」行，点击后经 `getSourceMatrixRow()` 用 `getFXRate` 逐货币查询合并（不走 `listFXRates` 全表——后端对卡组织全表返回 403；只查该源支持的货币，避免触发不支持的货币导致 chromium 重建超时），每格写入 `safeUpdated(resp.updated)` 时间戳。**MasterCard 在矩阵中自动加载**（`fxmatrixgrid.tsx` 的 autoLoad effect：主数据里该行为空（403）时自动用 `getSourceMatrixRow` 补查，参数变化时重置重新加载）；单独加载的行（MasterCard 自动 / Visa 点击）透传 `bfs` 交叉汇率参数。
- **视图**：Header 内 Tabs 切换「单对报价」（`fxlistgrid.tsx`）与「全对矩阵」（`fxmatrixgrid.tsx`）。
- **交互**：换向按钮交换 from/to；金额输入防抖 300ms 后重拉；单对视图 60s 自动刷新（仅页面可见时强制重拉）；手动刷新按钮同时强刷矩阵。金额单位切换是 `ToggleButton`（`selected` 映射 `aria-pressed`），可访问名称动态描述当前模式与点击效果（如「切换金额单位：当前按目标货币 USD 计，点击切换为按基准货币 CNY 计」）；矩阵反向时金额输入标签为「每种货币金额」。Header 右侧「精度」select（原样/-1、0/2/4/6 位）持久化到 localStorage（key `fxrate-precision`）并纳入缓存 key。Header 在 xs（≤599.95px）把「小数精度/交叉汇率/刷新/API 文档/切换主题」五个操作收进**「更多」溢出菜单**（MoreVert IconButton 触发，aria-label 更多；「小数精度」项打开锚定在同一按钮的二级精度菜单，其余项直接执行动作，交叉汇率项带 `selected` 状态），sm+ 保持常规控件（精度 select + 按钮 + 图标按钮），窄屏下 header 第一行只留 logo + 更多 + Tabs。
- **AbortSignal 传播（Phase 4）**：`cross-rates/amount/from/to/precision/view` 任一变化时，`index.tsx` 的作废 effect 与新的 `fetchPair`/`fetchMatrix` 会 abort 对应视图的 `AbortController`（pair/matrix 各自独立，互不影响），把 `signal` 传给 `getCurrenciesDetails`/`getRatesMatrix`/`getSourceMatrixRow`；`runBatch` 在 `client.batch()` 前检查 `signal.aborted`（已中止直接抛 `AbortError`，零请求、不触碰 client 队列），在途时用 `abortable(client.done(), signal)` 竞态——abort 立即以 `AbortError` 拒绝等待（client 的 `done()` 不接受外部 signal，网络层取消由后端/客户端超时兜底，这里取消的是调用方等待）。**被取消的请求契约**：不写缓存、不回调、不启动慢源后台批（`AbortError` 向上抛，调用方 `isAbortError` 跳过错误提示，reqId 代际守卫兜底）；已启动的慢源后台批 detached 不受影响（fire-and-forget 完成并合并，代际守卫决定缓存），`getSourceMatrixRow` 的额外行补查（MasterCard 自动 / Visa 点击 / 交叉补查）在 `rowParamsKey` 变化或关闭交叉汇率时同样 abort。
- **矩阵视图**：`?from=X` 使用后端正向汇率（买入方向），`?to=X` 使用后端 `reverse=true` 的反向汇率（卖出方向），前端不做算术倒数；默认只显示 12 个常用币种（`fxmatrixgrid.tsx` 的 `DEFAULT_COMMON_CURRENCIES`），「显示货币」弹层可勾选启用其他，localStorage（key `fxrate-matrix-currencies`）持久化；「中间价/现钞/现汇」ToggleButtonGroup 切换列值，「最优价」弹层控制参与高亮的来源。主数据与单独补查行按**单元格字段级深合并**（`mergeCellRows`）：主数据对实际存在的重叠字段优先，补查独有字段（cash/remit/path/updated）保留，`false`/`0`/字符串等合法值不受影响。额外行以 **keyed 快照**（`{key, data}`）存储，key 对应当前请求参数——参数变化时渲染先按 key 隔离旧行（新参数绝不渲染旧行），异步响应写回要求 key 与已提交的 `rowParamsRef`（`useLayoutEffect` 同步）一致；请求 key 只随主数据/启用币种变化，额外行新增货币列不触发整批重置。自动补查（MasterCard 等空行源）按来源维护 `idle/loading/success/error` 状态：失败渲染「加载失败，重试」行可手动重试，失败不被永久去重（参数变化或主数据更新会重新评估）。
- **最优价高亮**：`bestPriceSources.ts` 的 `useBestPriceSources()` 管理参与高亮的来源集合（两个视图共用），默认排除央行/卡组织/非商业银行基准源（`NON_BANK_SOURCES`：pboc/unionpay/mastercard/wise/visa/jcb/ecb/cfets/hkma/alipay），localStorage（key `fxrate-best-price-sources`）持久化；高亮样式为 `primary.main` 加粗 + `brandSoft` 底色（品牌色 14% 透明，Sunoaki 状态层惯例），并在最优价单元格数字旁渲染非颜色语义标记 `BestPriceMark`（★ 兄弟元素，`role="img"` + `aria-label="最优价"`，不包裹数字 span，避免影响按文本精确匹配的测试）。Header「参与高亮 X/Y 家」计数分子分母同取当前**可见**来源集（非排除可见源数 / 可见源总数），避免隐藏源计入分子导致 58/20 式分母超限；文案弃用「最优价 X/Y 家」以免被误读为「X/Y 家银行当前最优」，语义不变。
- **表格视觉与窄屏宽度规则（Phase 4B）**：两表均轻量斑马纹——奇数行数据格 `surfaceMuted` 低对比底色，sticky 首列同步斑马底色避免横向滚动露白；**斑马画在单元格层而非行层**（半透明 brandSoft 高亮格若与行层底色合成会把对比度压到 4.22:1 触发 axe 失败；画在单元格层则高亮格仍与 paper 合成维持 4.57:1），斑马格行 hover 经 `.MuiTableRow-hover:hover` 子选择器覆盖为 `action.hover` 与偶数行行级 hover 表现一致，焦点/40px 目标行为不变。矩阵角落格（表头「银行/平台」）`zIndex: 3`，高于 MUI `stickyHeader` 默认 2（与 `fxlistgrid` 头部名称格一致）——同层时靠后的货币表头会盖住角落，双轴滚动下角落必须最高才能覆盖表头行×首列交叉区。窄屏宽度规则：来源列 `SOURCE_COL_MIN_WIDTH`（xs 116 / sm 150，表头与正文首列共用同一 minWidth）配合首列 sticky 长名截断；数值列 `NUMERIC_CELL_LAYOUT`（min xs 64/sm 80、max xs 104/sm 136、nowrap + text-overflow ellipsis 截断超长值），320px 下保持可读。
- **统计 Tooltip（共享浮层，Phase 4B 任务 12）**：`rateStats.tsx` 的 `StatsTip` 桌面端不再每格挂载 Tooltip 组件实例——`StatsTipProvider` 持有**唯一 Tooltip**（受控 `open` + `PopperProps.anchorEl` 指向活动触发格，`disableHover/Focus/TouchListener`），每格只是触发元素：hover/focus 调 `show(tipId, content, trigger)`，失焦/移出 `hide(tipId)`，活动格经 `aria-describedby` 关联浮层（`describeChild` 语义：不覆盖格自身 `aria-label`），卸载时 cleanup 关闭浮层避免悬空。移动端分支不变（点击 Popover + `aria-haspopup=dialog` + Enter/Space 激活，`MobileContext` 顶层算一次 matchMedia）。
- **URL 参数与视图记忆**：默认 `from=CNY&to=USD&amount=100&precision=4`；同一路径下 from/to/amount/precision/方向变化由 `index.tsx` 用 Next.js 16 支持的 **Native History API** `window.history.replaceState(window.history.state, "", nextUrl)` 防抖 300ms 原地同步，保留 Next 内部 history state 且不触发 RSC GET。**视图切换（路径变化）仍走 `router.push`**；push 前取消待写 timer 并推进 URL 写入代际，timer 回调同时校验代际与预定 pathname，旧路径写入不能覆盖新路径。浏览器前进/后退经 `usePathname`/`useSearchParams` 按当前路径恢复 URL 状态。pair 与 matrix 使用独立 React state 和存档：pair 的 from/to/reverse 仅由 pair 路径写入 `fxrate-pair-from`/`fxrate-pair-to`/`fxrate-reverse`，matrix 的 base/reverse 仅由 matrix 路径写入 `fxrate-matrix-base`/`fxrate-matrix-reverse`；直接加载与 popstate 时当前 URL 优先，跨视图往返则恢复各自存档。pair URL 始终携带 `from` 与 `to`；matrix 正向只用 `?from=X`，反向只用 `?to=X`，不携带冲突方向参数；两个视图均一致携带 amount/precision。`page.tsx` 是薄壳不解析 searchParams——`amount`/`precision`/方向全部由客户端 `useSearchParams` 读取（支持 `?precision=` 显式指定，默认 4）。
- **主题**：`theme.tsx` 提供 `ThemeProvider` 与 `useThemeMode()`；**Phase 4B 预绘制主题初始化**（消除 dark-mode 背景白闪）：根 layout 用 `next/script` `beforeInteractive` 注入 `themeInitScript`（`componets/theme-init.ts`，hydration/首帧绘制前执行），把 `localStorage["fxrate-theme"]`（仅接受 light/dark）→ `prefers-color-scheme: dark` 回落的解析结果写到 `<html data-theme>` 与 `style.colorScheme`（每步独立 try，绝不被拦/不抛错）；`globals.css` 的 `html[data-theme]` 规则在 hydration 前就按主题着色 html/body（`html[data-theme=dark] body` 特异性高于 Emotion CssBaseline，SSR 浅色 body 背景不覆盖首帧）。**这只保证页面背景首帧正确**；MUI/Emotion SSR 组件仍以浅色 theme 输出，完整暗色 palette 在 hydration 后由 `ThemeProvider` 校正。**Phase 4B 任务 13（组件级 FOUC）评估结论**：不做「只改表面背景」的 CSS 覆盖——header/tabs/按钮/选择器输入/表格表头的文字全部用 SSR 浅色 palette 的具体颜色（如 tabs `primary.dark`、按钮 `text.primary`），单独把表面反色会让深色文字落在深色表面上，flash 窗口内反而不可读（比浅色可读表面更糟）；完整暗色 palette 预渲染（SSR 直接用暗色 theme 输出组件）需要主题模式在 SSR 时已知，而主题只在客户端经 beforeInteractive 脚本解析 localStorage/matchMedia 得到，SSR 端渲染错误 palette 会破坏 `getServerSnapshot` 恒 light 的 hydration 契约（theme.test.tsx）且可能与预绘制属性产生 mismatch；`alpha(background.paper, 0.85)` + `backdropFilter`（非 iOS）与 iOS 不透明分支都依赖具体色值，MUI palette 改 CSS 变量会破坏这些 JS 色值计算。因此只做**安全过渡**：`globals.css` 给 sticky `header` 加 `background-color 0.2s ease` 过渡（body/Paper 已有），让 hydration 主题校正从硬切变平滑淡入；`color-scheme`/原生滚动条/首帧背景已由 `html[data-theme]` 规则覆盖。`ThemeProvider` 用 `useSyncExternalStore` 以 `<html data-theme>` 为单一事实来源（缺省回落 localStorage → matchMedia），`getServerSnapshot` 恒为 light 保证 hydration 无 mismatch，提交后自动校正为预绘制主题；持久化 effect 只在 mode 与 DOM 解析一致时写回（hydration 中间态 light 不覆盖 dark 存档），toggle 同步更新属性 + 存档。根 `proxy.ts` 按 Next 16 文档模式生成每请求唯一 CSP nonce（`crypto.getRandomValues`+`btoa`，base64-value）：请求头克隆带 `x-nonce` 和同 nonce 的 `Content-Security-Policy`（layout 读取 `x-nonce` 并传给 Script，Next 渲染器从请求 CSP 头提取 nonce 自动加到自身脚本/style），响应头带 `x-nonce` 与 production CSP（`script-src 'self' 'nonce-…'` 无 unsafe-inline，显式允许 analytics host；`style-src` 保留 unsafe-inline 供 MUI/Emotion；dev 不注入 CSP 避免干扰 HMR/React dev eval）；布局因 `headers()` 变为动态渲染（与 nonce-based CSP 要求一致）。设计语言源自 sunoaki.net（`mui.d.ts` 含自定义 palette 键 `brandSoft`/`surfaceMuted` 与 Button `tonal` 变体的类型增强）：暖色纸张感（浅 bg `#fbfaf7` / 暗 bg `#10171c`）+ 深青绿 accent（`#2f6f73` / `#8fc3c6`）、`shape.borderRadius=14`、卡片 14px 圆角 + 1px 暖沙边框（`#e5dfd5` / `#334044`）+ 大软阴影、按钮全圆 pill（含 tonal 变体）、表头 `surfaceMuted` 浅底 600 字重、tooltip 用 inverse 惯例（浅色深墨底 / 暗色浅墨底）、表格数字 `tabular-nums`、`typography.fontFamily="inherit"`（继承 next/font Inter）。链接、按钮、原生输入与既有 ARIA 可交互元素统一使用 2px 品牌色 `focus-visible` 轮廓，移动端 Tab 改用内嵌轮廓避免被 Tabs scroller 裁切；Tab 的 `transition` 只覆盖背景/文字色（`componets/index.tsx` 的 `"& .MuiTab-root"`），不得改回 `all`——否则键盘聚焦时 outline 会从 0→2px 动画，e2e 在聚焦后立即读取会被截到 1px 中值；常规按钮/图标按钮/标签页/切换按钮/菜单项/复选框至少 40px 目标。`test/e2e/accessibility.spec.ts` 在 320/360px 的单对和矩阵视图检查 header/chooser 页面边界、货币 ISO 文本、两个 Tab 与已列 header 控件的目标尺寸、原生金额输入焦点环、Tab 焦点环边界及截图附件；未覆盖的控件不据此宣称通过完整目标尺寸门禁。
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
yarn bench:lighthouse # 本地 Lighthouse 基准（mobile+desktop 两个 preset，输出到 /tmp/fxrate-benchmark）
yarn bench:trace      # 本地 Chrome CDP performance trace（输出到 /tmp/fxrate-benchmark）
```

### 测试基础设施（test/）

- **单元/组件（`test/frontend/`）**：Vitest 4 + React Testing Library + jsdom。`vitest.config.mts` 用 `@/*` 别名；`test/frontend/setup.ts` 在模块加载前装好可委托的 `fetch` 桩（`__fxSetFetch`，因为 `tools.ts` 在 import 时就构造 FXRates client 并绑定 `globalThis.fetch`），jsdom 环境补 `matchMedia`/`ResizeObserver` 兜底；`test/frontend/jsonrpc.ts` 提供 JSON-RPC 批处理 mock（按 method 分派、支持部分请求失败）与 `createDeferredBatchMock`（延迟响应批，供 AbortSignal 测试控制响应时序）。已覆盖：`showCurrencyAllRates` 部分结果不缓存、`getCurrenciesDetails` 部分货币列表安全跳过 / runBatch 失败后 client 复位 / 来源支持指纹缓存 key（partial map）/ 慢源（visa）缓存完整性（快源/慢源任一失败均不落缓存、成功才合并入库）、`getRatesMatrix` 缓存 key（含来源与 skipSources 指纹）、`getSourceMatrixRow` 支持过滤与 updated 时间戳、`FXMatrixGrid` 单元格深合并（含缺值格 undefined 字段）与 rowParamsKey 重置、Index 层矩阵请求作废（防抖窗口陈旧响应）与单对快源陈旧行移除、AbortSignal 传播（预中止零请求 / 中途 abort 不写缓存不回调 / 关闭交叉汇率不启动旧 BFS 慢源批 / 慢源 fire-and-forget 不被 abort 打断 / 快速改金额取消旧批次 / 单对视图 abort 不影响矩阵）。
- **端到端（`test/e2e/`）**：Playwright + @axe-core/playwright。`playwright.config.ts` 的 webServer 先起本地 mock JSON-RPC 后端（`test/e2e/mock-server/index.cjs`，`/v1/jsonrpc` + `/__counters` + `/__reset`），再以 `FXRATE_API`/`FXRATE_PROXY` 指向它启动 `next dev`——SSR 与浏览器代理都走 mock，测试零真实上游依赖。**baseURL 必须用 `localhost` 而非 `127.0.0.1`**：Next 16 dev 的 allowedDevOrigins 会拦截 127.0.0.1 Host 的 dev 资源，导致 React 不水合。安全硬化：mock 与 next dev 都只绑定 loopback（mock `listen(PORT, "127.0.0.1")`、next 用 `-H 127.0.0.1`，不暴露局域网/公网），mock 请求体上限 1 MiB（超限 413 且不计批次）；端口可用 `MOCK_PORT`/`WEB_PORT` 环境变量覆盖避免撞端口。`test/e2e/helpers/mockJsonRpc.ts` 拦截浏览器端 `/api/fxrate` 做确定性应答与请求计数（含 `paramsOf(method)` 供方向/参数断言）；断言语义：**薄壳下单浏览器数据路径**——首屏 pair = 货币列表（instanceInfo + 4×listCurrencies）+ 挂载期版本 instanceInfo + 主批量（3 快源 ×2 方向）+ visa 慢源后台批量（2 getFXRate）= 5 条批量、8 个 getFXRate；切矩阵/切回 pair 因路径变化 Index 重挂载各 +1 次版本 info，数据本体命中浏览器 tools LRU 零新增；mock server 端计数恒为 0（SSR 不再发 JSON-RPC 数据请求）。`matrix-reverse.spec.ts` 覆盖矩阵反向（`?to=` 方向 URL、反向文案、零 document 导航、listFXRates 带 `reverse=true`、直接加载 footer 显示 `后端 fxrate@mock` 且浏览器层 instanceInfo 发生）；`mock-server.spec.ts` 覆盖 loopback 可达与 413；`scroll-corner.spec.ts` 覆盖矩阵双轴滚动（窄视口 + 容器限高制造横/纵滚动）：角落格钉在容器左上角、`zIndex > 2`、`elementFromPoint` 命中角落（表头货币列不盖住交叉区），附截图；a11y gate 断言 serious+critical，白名单仅放行既有对比度节点（表头 muted 已加深为 `#5a666e` 达 AA 后移除表头/ToggleButton 条目；仍放行 RelativeTime 与 footer 版本 caption，见文件内证据注释）。
- **React 19 renderOption key 警告**：`currencyChooser.tsx` 的 `renderOption` 从 MUI props 中显式解构 `key` 传给根元素（React 19 禁止展开含 key 的 props 对象）；`test/frontend/currencychooser.test.tsx` 打开两个货币下拉并断言无 key 展开 console.error。

### 性能基准（scripts/bench/）

本地确定性性能基准，**零真实上游**：复用 `test/e2e/mock-server/index.cjs` + `next dev -H 127.0.0.1`（`FXRATE_API`/`FXRATE_PROXY` 都指向 mock），输出统一落在 `/tmp/fxrate-benchmark/`（父目录）下的**每-run 独立子目录**。`scripts/bench/harness.mjs` 是共享 harness：动态探测空闲 `MOCK_PORT`/`WEB_PORT`（环境变量可覆盖）、就绪轮询（mock `/__ping` + web `/`）、**预热一次首页请求让 Next dev 按需编译在测量前完成**（本地基准确定性的关键）、SIGINT/SIGTERM 与异常路径都清理子进程，服务与 next 日志落到 run 目录下的 `mock-server.log`/`next-dev.log`。

- **输出目录**：默认 `fs.mkdtempSync("/tmp/fxrate-benchmark/run-*")`（0700、随机后缀、隔离并发 run）；显式 `--output-dir` 时校验最终组件**不是符号链接**且是目录（防符号链接劫持），父目录 `/tmp/fxrate-benchmark` 恒保留。
- **子进程回收**（`stopChildren`）：先 SIGTERM，**5s 超时未退出则 SIGKILL**（SIGKILL 必然终止，绝不挂起）；已退出子进程（`exitCode` 或 `signalCode` 已设置——信号杀死的进程 exitCode 为 null）立即跳过。`waitFor` 轮询期间子进程提前退出立即报错并给日志路径，**不等满超时**——典型场景：Next 16 检测到同目录已有 dev server（`.next/dev/` 锁，如队友并行 `next dev`）拒绝启动第二个，harness 秒级失败并提示日志。
- **信号处理**（`withShutdown`）：normal/error 路径走 try/finally 执行 cleanup（不 process.exit）；SIGINT/SIGTERM **先 await cleanup**（关闭 Chrome/Playwright + harness）再 exit——process.exit 绝不绕过 cleanup；cleanup 幂等（finally 与信号可能各触发一次）。
- **Lighthouse**（`scripts/bench/lighthouse-bench.mjs`，`yarn bench:lighthouse`）：chrome-launcher 用**动态空闲 debug 端口**（`--chrome-port` 可显式指定，chromeFlags 含 `--headless --no-sandbox`）拉起 Playwright Chromium（`CHROME_PATH` 可覆盖，无则回落系统 Chrome），预热导航后对每个 preset（`--preset=mobile|desktop|both`，默认 both）跑 Lighthouse **内置 desktop/mobile preset**，`output: "json"` 经 `result.report` 写盘（**注意：lighthouse() API 不落盘，outputPath 只由 CLI 处理，文件必须自己写 `result.report`**）。默认只审 performance 类目（`--categories=a11y,seo,...` 可改，经 `normalizeCategories` 归一化去空白/空项），终端打印四类分数（未审类目为 null）+ FCP/LCP/TBT/CLS/SI/TTI 审计值。Chrome 用 Playwright 的 `connectOverCDP` 复用同一实例做预热。dev 模式下绝对分数偏低属正常（未压缩 bundle），本工具定位是**同环境对比/回归检测**。
- **Chrome CDP trace**（`scripts/bench/chrome-trace.mjs`，`yarn bench:trace`）：Playwright Chromium 起页面后经 `context.newCDPSession(page)` 走 CDP——`Tracing.start({ transferMode: "ReturnAsStream", categories: "..." })`（**categories 必须是逗号拼接字符串，传数组会被 CDP 拒绝**）→ 导航 → 等 `--settle-ms`（默认 3000）→ `Tracing.end` 后 **先注册 `once("Tracing.tracingComplete")` 再 send**，取 `stream` 句柄 → `IO.read` 循环到 `eof` → **`IO.close` 放 finally 保证句柄必关** → 写 `trace-<ts>.json`。预热导航不进入 trace（首次编译噪音被排除）。默认 categories 为 `devtools.timeline,v8.execute,blink.user_timing,loading,navigation,network`。
- **CLI 解析**（`parseFlags`）：统一接受 `--key value` 与 `--key=value`，未知旗标抛错，`--help` 打印用法。
- **聚焦测试**：`test/frontend/bench-harness.test.ts`（`yarn test` 覆盖）离线断言 `parseFlags`/`normalizeCategories`/`prepareOutputDir`（0700 + 符号链接拒绝）/`getFreePort`/`stopChildren`（已退出立即返回、SIGTERM 正常退出、顽固子进程 SIGKILL 升级且不挂起）。
- **依赖**：`lighthouse` 与 `chrome-launcher` 都是 devDependency（仅本地基准用，不进运行时包）；两者随 `yarn install` 安装，Chrome 复用 Playwright 已下载的 Chromium，无需额外浏览器安装。

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
- CI 门禁：`.github/workflows/ci.yml` 对每个分支 push/PR 跑 `npx tsc --noEmit` + `yarn lint`（非变更性，`eslint .` 无 `--fix`）+ `yarn test`（vitest 单元测试）+ `yarn build`（next build 生产构建），checkout 需 `submodules: recursive`（tsc 要解析 `lib/fxrate/src/client`）。ci.yml 另含 `workflow_call` 触发——Phase 6 发布门禁：`.github/workflows/cd.yml` 的 `build-smoke-push` job `needs: gates`（复用同一组 CI 门禁，任一失败发布即被阻断），仅 release tag（v*）触发，顶层 `concurrency` 按 ref 串行（release: published 与 push: tags 同 ref 不竞态）。**两级 smoke + 推精确测试产物**：① 构建发布镜像（`build-push-action` push:false + load，**无 `FXRATE_PROXY` build-arg → 生产默认代理**）；② Tier-1 `scripts/image-smoke.sh --exact --image <tag>` 对「精确发布镜像」跑确定性运行时 smoke（前端 `/` + 应用根内容 + 容器存活；只验契约形状，**不等真实银行就绪**）；③ Tier-2 默认 `scripts/image-smoke.sh` 构建**契约镜像（不发布）**——`--build-arg FXRATE_PROXY` 指向 smoke 后端，验证后端 `/info`、`/readyz`、`/metrics` 8 family、JSON-RPC `instanceInfo` 与浏览器代理 `/api/fxrate`（证明 build-arg 生效；绝不把内部 smoke hostname 烤进发布镜像）；④ 对本地 daemon 中**已被 Tier-1 smoke 的同一批 tag** 逐个 `docker push`（绝不重新构建），再生成 attestation。镜像 tag：`:版本` + `:主.次` + `:sha-…`，非预发布 v*（无 `-`）额外 `:latest`。`scripts/image-smoke.sh` 支持 `--local`（无 Docker：`node lib/fxrate/dist/index.cjs` + `next dev`，跑 Tier-2 同一组断言）供本地预检——注意 `next dev` 同项目目录同时只能起一个（.next/dev 锁），与 e2e 并发时请用 docker contract 模式。
- Dockerfile（`ARG FXRATE_PROXY` + builder/runner 两阶段 `ENV`）：`next.config.mjs` rewrites 的 `/api/fxrate` 代理目标在 `next build` 时被固化进 standalone 产物，故镜像 smoke / 部署需在构建期注入 `FXRATE_PROXY`；不传 build-arg 时为空串，`env.FXRATE_PROXY || 默认线上地址` 自动回落，行为与旧镜像一致。
- 代码风格：缩进使用 tab，双引号，无分号；与现有文件保持一致。

## 对 AI 助手的约定

- 思考/推理过程（chain-of-thought）使用英文；与用户对话时使用中文。
- 代码修改若导致本文档描述的架构、目录结构、数据流、构建方式或约定发生变化，必须同步更新本文件，保持文档与代码一致。
