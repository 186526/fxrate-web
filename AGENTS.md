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
                     # 特例：cfets/hkma 为 PNG（hkma 取官网 jpg 白底转透明），SourceIcon 的 LOGO_EXT 映射；全部 50 源 icon 与官方牌价链接（tools.ts sourceRatesURL）已齐全。
```

## 关键实现要点

- **数据流（客户端驱动）**：`app/page.tsx` 是薄壳（只渲染 `<Index buildId buildTime version />`，不做服务端拉数）；所有汇率数据由客户端 `componets/index.tsx` 经 `componets/tools.ts` → `FXRates` client → fxrate 后端 JSON-RPC 拉取，结果按 key 缓存进 LRUCache（TTL 5 分钟），切换货币对/金额命中缓存时零请求。**切勿把数据拉取搬回 `page.tsx`**——那会让每次 URL 变化都触发整轮服务端重拉（历史卡顿根因）。
- **视图数据缓存（stale-while-revalidate）**：`index.tsx` 内 `pairCacheRef`/`matrixCacheRef` 按参数 key 保存两个视图最近一次数据（含 SSR 首屏数据），切换视图时先渲染缓存数据再后台刷新——切回已看过的视图零白屏零等待；LRU 命中时甚至零请求。`showCurrencyAllRates()` 允许部分来源失败（如上游被反爬拦截时 `done()` 抛错）并返回成功部分做降级，避免单个来源拖垮整个货币列表。
- **`tools.ts`**：导出 `FXRate` 单例；`showCurrencyAllRates()` 批量取各来源支持的货币列表（结果缓存）；`getCurrenciesDetails()` 用 `FXRate.batch()` 合并请求，参数含 `amount`（换算金额，默认 100）/ `precision`（默认 4）/ `force`（绕过缓存读）/ `bfs`（交叉汇率开关），按 `from-to-amount-p{precision}[-bfs]` 缓存；`getRatesMatrix()` 用 `listFXRates` 拉全对矩阵（同样缓存，key 含精度）。`getCurrenciesDetails` 的源过滤条件是「来源列表含 from 或 to 任一」，让后端 BFS 路径引擎算交叉汇率（如 CNY↔CNH）；矩阵保留每格的 `{middle, cash, remit}`。
- **交叉汇率（单对视图）**：Header「交叉汇率」按钮（localStorage key `fxrate-cross-rates`）切换 `bfs` 参数——开启后无直连报价时后端 BFS 找中间货币路径折算（有累积误差，默认关闭）；交叉行银行名旁显示「经 HKD 折算」虚线标识，tooltip 展示完整路径（如 `CNY → HKD → CNH`）。
- **慢源拆分（Visa）**：`SLOW_SOURCES`（tools.ts）标记反爬抓取慢的源（Visa 走 headless chromium 降级，查询不支持的货币时单次可达 30s+；**MasterCard 实测毫秒级，不在此列**）。单对视图把慢源拆出主批量**单独后台请求**（fire-and-forget，完成后合并回 data 再回调一次），避免慢源拖垮整批导致 client 30s 超时；矩阵视图默认不请求慢源，表格底部显示「点击加载」行，点击后经 `getSourceMatrixRow()` 用 `getFXRate` 逐货币查询合并（不走 `listFXRates` 全表——后端对卡组织全表返回 403；只查该源支持的货币，避免触发不支持的货币导致 chromium 重建超时）。**MasterCard 在矩阵中自动加载**（`fxmatrixgrid.tsx` 的 autoLoad effect：主数据里该行为空（403）时自动用 `getSourceMatrixRow` 补查，参数变化时重置重新加载）；单独加载的行（MasterCard 自动 / Visa 点击）透传 `bfs` 交叉汇率参数。
- **视图**：Header 内 Tabs 切换「单对报价」（`fxlistgrid.tsx`）与「全对矩阵」（`fxmatrixgrid.tsx`）。
- **交互**：换向按钮交换 from/to；金额输入防抖 300ms 后重拉；单对视图 60s 自动刷新（仅页面可见时强制重拉）；手动刷新按钮同时强刷矩阵。Header 右侧「精度」select（原样/-1、0/2/4/6 位）持久化到 localStorage（key `fxrate-precision`）并纳入缓存 key。
- **矩阵视图**：默认只显示 12 个常用币种（`fxmatrixgrid.tsx` 的 `DEFAULT_COMMON_CURRENCIES`），「显示货币」弹层可勾选启用其他，localStorage（key `fxrate-matrix-currencies`）持久化；「中间价/现钞/现汇」ToggleButtonGroup 切换列值，「最优价」弹层控制参与高亮的来源。
- **最优价高亮**：`bestPriceSources.ts` 的 `useBestPriceSources()` 管理参与高亮的来源集合（两个视图共用），默认排除央行/卡组织（`NON_BANK_SOURCES`：pboc/unionpay/mastercard/wise/visa/jcb），localStorage（key `fxrate-best-price-sources`）持久化；高亮样式为 `primary.main` 加粗 + `brandSoft` 底色（品牌色 14% 透明，Sunoaki 状态层惯例）。
- **URL 参数**：默认 `from=CNY&to=USD&amount=100`；`index.tsx` 用 `router.replace` 防抖同步（`page.tsx` 已瘦身，replace 不产生服务端请求），初始值从 `useSearchParams` 读取。
- **主题**：`theme.tsx` 提供 `ThemeProvider` 与 `useThemeMode()`；挂载后读取 localStorage / `prefers-color-scheme`，避免 hydration 不匹配。设计语言源自 sunoaki.net（`mui.d.ts` 含自定义 palette 键 `brandSoft`/`surfaceMuted` 与 Button `tonal` 变体的类型增强）：暖色纸张感（浅 bg `#fbfaf7` / 暗 bg `#10171c`）+ 深青绿 accent（`#2f6f73` / `#8fc3c6`）、`shape.borderRadius=14`、卡片 14px 圆角 + 1px 暖沙边框（`#e5dfd5` / `#334044`）+ 大软阴影、按钮全圆 pill（含 tonal 变体）、表头 `surfaceMuted` 浅底 600 字重、tooltip 用 inverse 惯例（浅色深墨底 / 暗色浅墨底）、表格数字 `tabular-nums`、`typography.fontFamily="inherit"`（继承 next/font Inter）。
- **页脚**：`footer.tsx`（client）渲染在 Index 底部，接受 `buildId`/`buildTime`/`version`/`backendVersion` props；版权行含 `@real186526` → https://186526.xyz 链接，右侧「fxrate-web v{version}」tooltip 显示 `fxrate-web@短hash + 构建时间 + 完整 hash`（构建时间格式对齐后端 BUILDTIME：`2025-10-20T23:29:04+08:00` 本地时区 ISO），另有 GitHub 链接指向后端仓库。
- **构建时间注入**：`next.config.mjs` 构建时 `new Date().toISOString()` 写入 `env.FXBUILD_TIME`，`page.tsx` 经 `process.env.FXBUILD_TIME` 传给 Index/Footer。
- **已知问题（勿"顺手修"）**：
  - `next.config.mjs` 关闭了构建时的 ESLint/TS 检查（`ignoreBuildErrors` / `ignoreDuringBuilds`），构建脚本 `yarn build` 为 `next build --debug --no-lint`。

## 构建与运行

```bash
yarn install          # 需先确保 lib/fxrate 子模块已 init/update
yarn dev              # 前端 dev，连默认 API https://fxrate.sunoaki.net/v1/jsonrpc
yarn full-dev         # 同时跑 lib/fxrate 后端（端口 8080）与前端，且 FXRATE_API 指向本地
yarn build            # 生产构建（standalone 输出）
yarn lint             # next lint（构建时默认跳过）
```

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

只设 `FXRATE_API` 的结果：SSR 首屏连本地 8081，但**客户端所有数据请求走线上后端**——footer 版本号暴露真相（显示线上旧 commit 而非本地）。

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
- CI 门禁：`.github/workflows/ci.yml` 对每个分支 push/PR 跑 `npx tsc --noEmit`，checkout 需 `submodules: recursive`（tsc 要解析 `lib/fxrate/src/client`）。
- 代码风格：缩进使用 tab，双引号，无分号；与现有文件保持一致。

## 对 AI 助手的约定

- 思考/推理过程（chain-of-thought）使用英文；与用户对话时使用中文。
- 代码修改若导致本文档描述的架构、目录结构、数据流、构建方式或约定发生变化，必须同步更新本文件，保持文档与代码一致。
