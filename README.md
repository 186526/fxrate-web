# FXRate-web

外汇牌价查询前端：对比多家银行/平台的买入价、卖出价与中间价，并高亮最优价。

数据来自后端仓库 [186526/fxrate](https://github.com/186526/fxrate)，以 git submodule 挂在 `lib/fxrate/`。

## 快速开始

```bash
git submodule update --init --recursive   # 首次克隆后必须初始化后端 submodule
yarn install
yarn dev                                  # http://localhost:3000
```

默认连线上后端 `https://fxrate.sunoaki.net/v1/jsonrpc`。

## 连本地后端

浏览器端只能通过同源代理 `/api/fxrate` 访问后端，代理目标由构建期注入的 `FXRATE_PROXY` 决定。**只设 `FXRATE_API` 不够**：它只在服务端（SSR）生效，浏览器端所有请求仍会走线上代理。

```bash
FXRATE_API=http://localhost:8081/v1/jsonrpc \
FXRATE_PROXY=http://localhost:8081/v1/jsonrpc \
yarn dev
```

判断是否真的连上本地：页脚「后端 fxrate@短hash」应等于 `lib/fxrate` 当前 HEAD 的短 hash。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `yarn dev` | 开发服务器（连默认线上后端） |
| `yarn full-dev` | 同时起 `lib/fxrate` 后端（8080）与前端 |
| `yarn build` | 生产构建（standalone 输出） |
| `yarn start` | 运行生产构建 |
| `yarn lint` | `eslint .`（构建时默认跳过 lint） |
| `yarn test` | 单元/组件测试（vitest，node 环境；组件测试文件内声明 jsdom） |
| `yarn test:watch` | 单元测试 watch |
| `yarn test:e2e` | 端到端测试（playwright + 本地 mock 后端，不触碰真实上游） |
| `yarn test:all` | `test` + `test:e2e` |
| `yarn bench:lighthouse` | Lighthouse 基准（mobile + desktop） |
| `yarn bench:trace` | Chrome CDP 性能 trace |

基准结果输出到 `/tmp/fxrate-benchmark/`。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `FXRATE_API` | 服务端（SSR）直连的 JSON-RPC 地址，默认线上 |
| `FXRATE_PROXY` | 浏览器 `/api/fxrate` 代理目标，**构建期**固化进 standalone，默认线上 |

## 更多文档

- `AGENTS.md` — 项目约定、已知问题与易踩的坑
- `docs/architecture.md` — 数据流、缓存、慢源拆分、AbortSignal、矩阵合并、URL 同步、主题与构建元数据
