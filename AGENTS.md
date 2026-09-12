# AGENTS.md

## 项目概览

FXRate-web 是外汇汇率查看网页应用（前端），配套后端仓库 [186526/fxrate](https://github.com/186526/fxrate) 以 git submodule 挂在 `lib/fxrate/` 下：前端经 JSON-RPC 调用其 `FXRates` client 获取汇率，用轻量 MUI Table 展示多家银行/平台的买卖价、中间价与最优价高亮。

技术栈：Next.js 16.3（App Router，`output: "standalone"`）+ React 19 + TypeScript + MUI v6 + Emotion + Tailwind。

## 必须遵守的约定

- `componets/` 目录名拼写错误是历史遗留，保持原样；新组件放里面。
- UI 面向中文用户：表头/文案用中文，数据源名经 `lib/fxrate/src/constant.ts` 的 `sourceNamesInZH` 映射。
- 依赖用 yarn（1.22）管理（`yarn.lock`），勿混用 npm/pnpm。
- 代码风格：缩进 tab、双引号、无分号。
- 思考/推理过程用英文；与用户对话用中文。
- `lib/fxrate` 是 submodule（`.gitmodules`），改动需到子模块仓库单独提交；`tsconfig.json` exclude 它（前端 tsc 只连带检查被 import 的 `src/client/index.ts`）。
- 代码修改若导致架构、目录结构、数据流、构建方式或约定变化，同步更新本文件与 `docs/architecture.md`。

## 已知问题（勿"顺手修"）

- `next.config.mjs` 关闭构建时 ESLint/TS 检查（`ignoreBuildErrors`/`ignoreDuringBuilds`）；CI 单独跑四道门禁：`npx tsc --noEmit`、`yarn lint`、`yarn test`、`yarn build`，任一失败即红。
- 浏览器端连本地后端必须同时设 `FXRATE_API` 与 `FXRATE_PROXY`。`process.env.FXRATE_API` 只在服务端（SSR）注入，浏览器端看不到，客户端 fallback 到同源代理 `/api/fxrate`，其目标由 `FXRATE_PROXY` 决定（默认线上）；只设 `FXRATE_API` 时客户端所有请求仍走线上代理，footer 版本号暴露真相。
- e2e 的 baseURL 必须用 `localhost`，不能用 `127.0.0.1`（Next 16 allowedDevOrigins 拦 127.0.0.1 Host 会导致 React 不水合）。
- `currencyChooser.tsx` 的 `renderOption` 显式解构 `key` 传给根元素（React 19 禁止展开含 key 的 props）。
- Tab 的 `transition` 只覆盖背景/文字色（`index.tsx` 的 `"& .MuiTab-root"`）；改回 `all` 会让键盘聚焦 outline 从 0px 动画到 2px，e2e 聚焦截图截到 1px 中间值。

## 构建与运行

```bash
yarn install          # 需先确保 lib/fxrate 子模块已 init/update
yarn dev              # 连默认 API https://fxrate.sunoaki.net/v1/jsonrpc
yarn full-dev         # 同时跑 lib/fxrate 后端（8080）与前端，FXRATE_API 指向本地
yarn build            # 生产构建（standalone 输出）
yarn lint             # eslint .（构建时默认跳过）
yarn test             # vitest run（node 环境，组件测试文件内 // @vitest-environment jsdom）
yarn test:e2e         # playwright：拉起本地 mock JSON-RPC 后端 + next dev，不碰真实上游
yarn test:all         # test + test:e2e
yarn bench:lighthouse # Lighthouse 基准（mobile+desktop，输出 /tmp/fxrate-benchmark）
yarn bench:trace      # Chrome CDP performance trace（输出 /tmp/fxrate-benchmark）
```

`FXRATE_API` 覆盖后端 JSON-RPC 地址（默认 `https://fxrate.sunoaki.net/v1/jsonrpc`，见 `tools.ts`）。

## 深入材料：`docs/architecture.md`

改动下列任一处之前先读它：

- 仓库结构与逐文件职责
- SSR 预取与薄壳降级、`tools.ts` 的 client 与 LRU 缓存、视图数据缓存（SWR）
- 单对视图的交叉汇率、慢源（Visa）拆分、AbortSignal 传播与「被取消契约」
- 矩阵视图的单元格深合并、补查行 keyed 快照与 auto-load 状态机
- URL 参数同步与视图记忆、主题与预绘制脚本、CSP nonce、构建元数据注入、安全响应头
- 测试基础设施（vitest 的 fetch 桩、playwright mock 后端与 request-count 断言语义）、`scripts/bench/`

它还记录了本地起 8081 后端与连本地的完整步骤，以及 CI 门禁与镜像两级 smoke 的流程。
