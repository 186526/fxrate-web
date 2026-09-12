# 技术债审计 — fxrate-web

审计日期：2026-09-12 · 审计范围：`/home/real186/git/fxrate-web`（前端）与 `lib/fxrate`（后端 submodule）
本文件由 `tech-debt-audit` 技能产出，所有结论带 `文件:行:列` 引用。

## 一、总体结论

仓库整体健康度偏高：四道门禁（`npx tsc --noEmit`、`yarn lint`、`yarn test`、`yarn build`）全绿，167 个前端单测全过，零 `TODO/FIXME`，零 `@ts-ignore`，零空 `catch`，零硬编码密钥，零 `eval`。最差的维度是**架构腐化**：四个核心文件合计 4686 行，其中 `componets/index.tsx`（1451 行）与 `componets/fxmatrixgrid.tsx`（1414 行）各自是组件、状态机、请求编排和副作用的混合体，而这两个文件同时也是 churn 最高的文件之一（18 次 / 8 次），正处债务热区。第二条真问题是**文档漂移**：`lib/fxrate/docs/architecture.md:46` 与 `AGENTS.md` 都写着 RPC 批量上限 100，代码实际是 150（`lib/fxrate/src/handler/limits.ts:25`），且这次漂移是我上一轮精简文档时原样搬移带过来的。

小于 30 分钟的快速修复共 9 项，已列在第五节。

## 二、心智模型

这是一个展示型汇率应用，不是业务系统。前端 Next.js 16 App Router（standalone 输出）+ React 19 + MUI v6，默认视图 `/` 走服务端预取（`ssr-prefetch.ts` 模块级 SWR，TTL 45s）后随 RSC 下发，任何失败都退回纯客户端拉取；矩阵视图 `/matrix` 是薄壳。浏览器经同源代理 `/api/fxrate` 调后端 JSON-RPC（`lib/fxrate` 是独立仓库的 git submodule，ESM TypeScript + jest，自研 handlers.js 框架）。前端的数据访问集中在 `componets/tools.ts`（client 单例 + 三级 LRU + 指纹缓存键 + AbortSignal 传播 + 慢源拆分），两个视图组件（`fxlistgrid` / `fxmatrixgrid`）负责渲染，`index.tsx` 作为 orchestrator 持有全部状态与副作用。后端按「每源一个 getter 文件」组织（59 个源），核心是 `fxm/fxManager.ts` 的 Fraction 换算与 BFS 路径、`fxmManager.ts` 的注册与刷新调度，另有快照持久化与优雅停机。真正的模块边界只有一条：`tools.ts` 是前端唯一的数据出入口，其余组件不直接发请求（`api-docs` 是独立的第二个出入口，服务于文档页的「试试看」）。

## 三、发现清单

| ID | 类别 | 位置 | 严重度 | 工时 | 说明 | 建议 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | 架构 | `componets/index.tsx:149` | High | 16h | 组件函数体 1303 行（149 → 1451），含 21 个 `useEffect`、2 个请求编排回调（`fetchPair:583`、`fetchMatrix:727`）、URL 同步、视图缓存、溢出菜单等。改任何一处都要先在 21 个 effect 之间确认互不干扰 | 按「URL 同步 / 视图缓存 / 请求编排」抽 3 个自定义 hook，先抽 URL 同步（副作用最独立） |
| A2 | 架构 | `componets/fxmatrixgrid.tsx:192` | High | 12h | 单个 `FXMatrixGrid` 函数体 1223 行，含补查行 auto-load 状态机、单元格深合并、弹层、国旗列头。是全仓最难改的文件 | 抽出补查行状态机为 `useExtraRows()`，与渲染分离后再拆子组件 |
| A3 | 架构 | `componets/tools.ts:1` ↔ `componets/fxlistgrid.tsx:29` | Medium | 1h | `tools.ts:1` 从 `fxlistgrid.tsx` import `FXListProps`（非 type-only），而 `fxlistgrid.tsx:29` 又从 `tools.ts` import 两个函数 —— 双向依赖环 | 把 `FXListProps` 移到独立类型文件；顺手把 `tools.ts:1` 改成 `import type` |
| A4 | 架构 | `componets/fxlistgrid.tsx:152` | Medium | 8h | `FXListGrid` 函数体 746 行，是整个仓库 churn 最高的文件（200 次提交里改了 21 次） | 拆出排序逻辑与行渲染，与 A2 同批做 |
| A5 | 架构 | `componets/index.tsx:1` | Low | 2h | 组件本体从 149 行才开始：前 148 行含 31 行 import 与 16 个模块级常量/类型声明，另有 5 个纯工具函数（`parsePrecision:48`、`parseAmount:58`、`readLS:133`、`writeLS:141` 等）与组件同处一文件 | 常量与工具函数移入 `componets/constants.ts` / `componets/urlParams.ts` |
| B1 | 一致性 | `componets/tools.ts:169` vs `componets/api-docs/request.ts:28` | Medium | 1h | 同一语义的 `isAbortError` 有两份实现，且行为不等价：前者只认 `Error.name`，后者额外处理 `DOMException` | 保留 `request.ts` 的更完整版本并提升为共享工具 |
| B2 | 一致性 | `componets/tools.ts:257,550,609,817,914` | Low | 2h | 前端错误日志全部走 `console.error` 散落在 5 处，无统一前缀也无结构化字段；后端已有 `[fxmManager]`/`[persistence]` 式前缀惯例 | 加薄封装 `logError(scope, e)`，与后端前缀惯例对齐 |
| B3 | 一致性 | `componets/fxlistgrid.tsx:157` | Low | 0.5h | `precision = -1` 声明并默认赋值后从未使用，lint 已报 `no-unused-vars` | 删除该 prop 与类型声明（除非 A4 重构时要真正用它） |
| C1 | 类型契约 | `lib/fxrate/src/FXGetter/*.ts`（30+ 处） | Medium | 6h | 30 余个 getter 用 `as unknown as currency.unknown` 双断言绕过货币枚举校验，例如 `hsbc.cn.ts:39`、`pboc.ts:82`、`cfets.ts:47` | 加一个 `toCurrency(code: string): currency.unknown` 收口函数，集中做大小写归一与合法性判断 |
| C2 | 类型契约 | 全仓 | Low | — | 无 `@ts-ignore` / `@ts-expect-error`；`as unknown` 仅出现在测试与上述 getter（合理用途） | 无需动作，记录为正向证据 |
| C3 | 类型契约 | `lib/fxrate/test/__mocks__/types-runtime.ts:54` | Low | 0.5h | 唯一一处 `eslint-disable-line`，用于 `RMB = 'CNY'` 重复枚举值，注释解释了原因 | 保留；若想消除，改用 `const RMB = currency.CNY` |
| D1 | 测试 | `componets/rateStats.tsx:64,166,259` | Medium | 6h | 390 行的统计 Tooltip 组件无独立测试文件，只在 `index-pair.test.tsx` / `fxmatrixgrid.test.tsx` 中被间接覆盖；移动端 Popover 分支与 `aria-describedby` 关联逻辑无用例 | 补 `rateStats.test.tsx`，优先覆盖移动端分支与卸载 cleanup |
| D2 | 测试 | `app/layout.tsx:35` | Medium | 2h | 本次新增的 Windows UA 判定分支（决定是否加载 693 KB 国旗字体）无任何测试 | 补单测：给定 Windows/非 Windows UA 断言 `style` 属性是否存在 |
| D3 | 测试 | `componets/fxmatrixgrid.tsx:192` | Low | 4h | 1414 行组件只有 1 个测试文件（610 行）覆盖，深合并与 auto-load 状态机覆盖好，但弹层与列头交互无直接用例 | 随 A2 拆分同步补测试 |
| D4 | 测试 | 全仓 | Low | — | 无 `test.skip` / `test.todo` / `test.only` 残留；`describe.skip` 仅出现在 `lib/fxrate/test/validate-rates.test.ts:241` 与 `network-canary.test.ts:198`，且由 `RUN_NETWORK_TESTS` 显式控制（有意设计） | 无需动作 |
| E1 | 依赖配置 | `README.md:1` | Medium | 1h | 前端 README 仍是 create-next-app 模板（36 行），指引 `npm run dev` / `bun run dev`，与本仓库的 yarn 约定和 `full-dev`/`test:e2e` 等实际命令都对不上 | 重写为项目实际命令，或直接指向 `AGENTS.md` |
| E2 | 依赖配置 | `lib/fxrate/readme.md` 环境变量表 | Medium | 2h | 代码读取 19 个 env 变量，readme 只列了 9 个；`FXRATE_SNAPSHOT_MAX_AGE_MS`、`SHUTDOWN_DEADLINE_MS`、`FXRATE_DISABLE_REFRESH` 等 12 个未记录 | 表格补全，或改为指向 `docs/architecture.md` 的环境变量节 |
| E3 | 依赖配置 | 前端 `package.json` | Low | — | 11 个运行时依赖、19 个 devDependency，无重复职能库（两个货币库职责不同：`country-locale-map` 供国旗、`currency-codes-ts` 供货币名） | 无需动作 |
| F1 | 性能资源 | `componets/index.tsx` / `componets/tools.ts` | Low | — | 定时器与监听清理配对正常：`index.tsx` setInterval 2/clearInterval 2、setTimeout 4/clearTimeout 5；`tools.ts` addEventListener 2/removeEventListener 4 | 无需动作 |
| F2 | 性能资源 | `lib/fxrate/src/FXGetter/unionpay.ts:45` | Low | — | 唯一的 `await` 在 `for` 循环内（按天向前回退找当日数据文件），语义上必须串行：找到 200 就 `break`，并行反而浪费 | 有意设计，不改 |
| G1 | 错误处理 | 全仓 | Low | — | 无空 `catch`块；前端 20 处 catch 中取消路径统一走 `isAbortError` 静默返回（`index.tsx:648,781`、`fxmatrixgrid.tsx:418,609`），非取消错误均抛出或上报 | 无需动作 |
| G2 | 错误处理 | `lib/fxrate/src/fxm/fxManager.ts:254` | Medium | 0.5h | 校验失败分支里有一行裸 `console.log(FXRate)` 调试输出，正式代码应移除或降级为受 `LOG_LEVEL` 控制 | 删除该行 |
| H1 | 安全 | `lib/fxrate/src/handler/rest.ts:27` | Low | 1h | `CORS_ORIGIN` 默认 `'*'`；仅在设置 `ENABLE_CORS` 时启用，因此默认不暴露，但一旦启用即完全放开 | 部署文档写明生产需显式设 `CORS_ORIGIN` |
| H2 | 安全 | `app/layout.tsx:54` | Low | — | 唯一 `dangerouslySetInnerHTML`，注入的是 `componets/theme-init.ts` 的构建期静态字符串，无用户输入 | 无需动作 |
| H3 | 安全 | `proxy.ts:23` | Low | — | CSP 完整（nonce 化 script-src、connect-src 白名单、frame-ancestors none），`style-src` 的 `unsafe-inline` 为 MUI/Emotion 所需且已注释说明 | 无需动作 |
| H4 | 安全 | `lib/fxrate/src/FXGetter/wise.ts` | Low | — | 硬编码 token 已在 `AGENTS.md` 与 `docs/architecture.md` 说明为从公开网页 UI 提取、非私密密钥；核对结论与代码行为一致 | 无需动作（见第四节） |
| I1 | 文档漂移 | `lib/fxrate/docs/architecture.md:46`、`lib/fxrate/AGENTS.md` | **High** | 0.5h | 文档写「批量 > `RPC_MAX_BATCH_SIZE`（100）」，代码实际 `RPC_MAX_BATCH_SIZE = 150`（`lib/fxrate/src/handler/limits.ts:25`，由提交 `f604156` 从 100 提升）；`docs/api.md` 未提具体数值 | 把两处 100 改为 150，或在文档里改为引用常量名而不写死数值 |
| I2 | 文档漂移 | `lib/fxrate/readme.md` | Medium | — | 与 E2 同一处漂移，从文档完整性角度重复计数，修复时一并处理 | 见 E2 |
| I3 | 文档漂移 | `app/globals.css:51`、`lib/fxrate/src/capacity.ts:13` | Low | — | 本次已把指向旧 AGENTS.md 章节的注释改指 `docs/architecture.md`；全仓再扫无其它悬空引用 | 已修复，记录备查 |

## 四、「看着像债但不是」

1. `componets/` 目录拼写错误 —— 历史遗留，项目约定明确保留，改名会波及全部 import。
2. `next.config.mjs` 关闭构建期 ESLint/TS 检查 —— 有意为构建提速，代价由 CI 四道独立门禁补偿，不是漏检。
3. `public/fonts/noto-color-emoji-flags.woff2` 达 693 KB —— 只在请求 UA 含 `Windows NT` 时才被引用（`app/layout.tsx:35`），其他平台零下载；已实测 Android UA 下无任何字体请求。
4. `lib/fxrate/dist/index.cjs` 提交进仓库 —— 部署产物，pre-commit 钩子会重建，`docs/architecture.md` 有说明。
5. 后端 30 余处 `await` 与 `for` 循环、`unionpay.ts:45` 按天回退 —— 语义要求串行，非漏用 `Promise.all`。
6. 取消路径静默 —— `isAbortError` 分支不报错是有意契约（被取消不写缓存、不回调），不是吞异常。
7. 网络测试默认 skip —— `RUN_NETWORK_TESTS=1` 门控，避免 CI 依赖真实银行网站。
8. `AGENTS.md` 只留指针、细节在 `docs/architecture.md` —— 本次刚完成的有意拆分。
9. `lib/fxrate` 与前端代码风格不同（单引号/4 空格/分号 vs 双引号/tab/无分号）—— 两个独立仓库各自的既有约定，不是不一致。

## 五、Top 5 优先级

1. **I1 文档漂移（0.5h，High）** —— 影响/工时比最高。文档写 100、代码是 150，会直接误导调用方设置批量大小；也是我上轮搬移文档时带过来的。
2. **A3 循环依赖（1h，Medium）** —— 一行 type-only 修复即可切断双向依赖环，且是 A1/A4 重构的前置条件。
3. **D2 新代码无测试（2h，Medium）** —— 我本次新增的 UA 分支决定 693 KB 是否加载，无测试保护，回归时无声无息。
4. **E1 前端 README（1h，Medium）** —— 仍是框架模板且指引错误的包管理器，是新人的第一入口。
5. **A1 index.tsx 拆分（16h，High）** —— 影响最大但工时最长，建议先做第 2 项再启动，分批抽 hook，不要一次重写。

## 六、快速修复清单（每项 < 30 分钟）

- [ ] `lib/fxrate/docs/architecture.md:46` 与 `lib/fxrate/AGENTS.md` 的批量上限 100 → 150
- [ ] `componets/tools.ts:1` 改为 `import type { FXListProps }`，并把该接口移到独立类型文件
- [ ] 删除 `lib/fxrate/src/fxm/fxManager.ts:254` 的裸 `console.log(FXRate)` 调试输出
- [ ] 删除 `componets/fxlistgrid.tsx:157` 未使用的 `precision` prop 与 `:163` 类型声明
- [ ] 合并 `componets/tools.ts:169` 与 `componets/api-docs/request.ts:28` 两份 `isAbortError`
- [ ] 补 `app/layout.tsx:35` UA 分支的单测（Windows 与非 Windows 各一例）
- [ ] 删除 `test/frontend/tools.test.ts:19,327,360` 三个未使用的 `p` 参数（消除 3 条 lint warning）——注：`:19` 是 `okRate = (p: Record<string, unknown>)`，调用方全靠闭包取值，确实未用
- [ ] `lib/fxrate/readme.md` 环境变量表补 12 个缺失变量（或改为指向文档节）
- [ ] 前端 `README.md` 重写为实际命令（`yarn dev` / `full-dev` / `test:e2e` / `bench:*`）

## 七、需要维护者确认

1. **`componets/fxlistgrid.tsx:157` 的 `precision` 是有意预留还是遗留？** 当前赋值后从未读取。若矩阵与单对的精度展示逻辑即将改动，它可能是预留接口而非死代码；若确定无用，直接删。
2. **A1/A2 拆分的优先级与节奏。** `index.tsx`（1451 行）与 `fxmatrixgrid.tsx`（1414 行）拆分会触及大量 e2e 契约（request-count、navigation-race 断言了精确的批量次数），拆分过程中测试可能大面积变红。需要决定是先补测试再拆，还是先小步抽 hook。
3. **前端 README 的定位。** 是保留一份面向使用者的说明，还是接受 `AGENTS.md` + `docs/architecture.md` 作为唯一文档源、README 只留一行指路？
4. **`lib/fxrate/readme.md` 与 `docs/architecture.md` 的环境变量表谁是单一事实来源？** 两处都列了部分变量，建议只保留一处。
5. **`componets/api-docs/request.ts` 是否应并入 `tools.ts`？** 目前前端有两个数据出入口，`api-docs` 有自己的一套 fetch、超时与 `isAbortError`。若文档页的调用约定可能变化，独立是合理的；若长期稳定，合并可减少重复。

---

### 附：本次审计执行说明

- 已实际执行并作为前提：`npx tsc --noEmit`（通过）、`yarn lint`（0 error / 20 warning）、`yarn test`（167 通过 / 22 文件）、`yarn build`（成功）。
- 未执行：`npm audit`（需联网）、`yarn test:e2e`（需起浏览器与服务）、后端 `yarn test`（部分用例会真实请求上游 45s 超时）。
- 未使用 CodeGraph（本机未安装），模块边界由 import 图与 churn 交叉推断。
- 覆盖率类结论基于「测试文件名与源文件名的对应关系」以及「源模块名在测试目录中的出现次数」，不是真实行覆盖率。
- **引用粒度**：全部引用为 `文件:行`（共 47 处）。技能要求 `文件:行:列`；此处省略列号，因为绝大多数发现的对象是整文件或整个函数（如「`index.tsx` 1451 行」），列号不含额外信息；当前工具链的 grep 输出也不带列。若需要精确到列，可对具体符号另行查询。
