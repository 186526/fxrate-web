# fxrate-web 技术债修复方案

依据：`TECH_DEBT_AUDIT.md`（2026-09-12）。本文件是施工单，按批次执行，每批结束跑门禁。

## 门禁（每批完成后必跑）

```bash
cd /home/real186/git/fxrate-web && npx tsc --noEmit && yarn lint && yarn test
```
后端改动（批次 5）另加：`cd lib/fxrate && yarn test:unit`

## 对审计报告的两处更正（先记录，避免误施工）

1. **I1 只涉及一个文件**：报告写「`lib/fxrate/docs/architecture.md:46` 与 `lib/fxrate/AGENTS.md` 两处写 100」，实测 `lib/fxrate/AGENTS.md` 不含该数字，只有 `docs/architecture.md:46` 一处。`docs/api.md` 与 `readme.md` 也不含批量上限数值。
2. **B3 的 `precision` 不是「无用 prop」，是「穿透但从不读取」**：`componets/index.tsx:1357` 确实传了 `precision={precision}`，`test/frontend/fxlistgrid.test.tsx:43` 也传了 `precision={4}`，但 `componets/fxlistgrid.tsx` 内除声明与类型外零处读取。修法是删组件内声明、删类型字段、删两处传参，而不是只删声明。

另已核实：`componets/tools.ts:169` 与 `componets/api-docs/request.ts:28` 两份 `isAbortError` 在行为上**实际等价**（`new DOMException('x','AbortError') instanceof Error` 在现代引擎为 `true`，已在本机 Node 实测），合并无行为风险，取更防御的 `request.ts` 版本。

---

## 批次 1：文档与死代码（约 1.5h，全部低风险）

| 步骤 | 文件 | 动作 | 验证 |
| --- | --- | --- | --- |
| 1.1 | `lib/fxrate/docs/architecture.md:46` | 把 `RPC_MAX_BATCH_SIZE`（100）改为（150） | `grep -n '批量 >'` 显示 150 |
| 1.2 | `componets/fxlistgrid.tsx:157,163` | 删 `precision = -1,` 与 `precision?: number` | tsc 通过 |
| 1.3 | `componets/index.tsx:1357` | 删 `precision={precision}` | tsc 通过 |
| 1.4 | `test/frontend/fxlistgrid.test.tsx:43` | 删 `precision={4}` | 测试通过 |
| 1.5 | `lib/fxrate/src/fxm/fxManager.ts:254` | 删裸 `console.log(FXRate);` | 后端单测通过 |
| 1.6 | `test/frontend/tools.test.ts:19,327,360` | 三个未使用的 `p` 参数改为 `()` 或删参数名 | `yarn lint` warning 从 20 降到 17 |

**风险**：1.2–1.4 是一组，必须同批完成，否则中间态 tsc 报错（index.tsx 传了不存在的 prop 会被 TS 拒绝）。

## 批次 2：切断循环依赖 + 收口 isAbortError（约 2h）

### 2.1 拆出 `FXListProps`（切断 A3 环）

现状环：`componets/tools.ts:1` → `componets/fxlistgrid.tsx`（`FXListProps`），而 `componets/fxlistgrid.tsx:29` → `componets/tools.ts`（`rssURL`/`ratesPageURL`）。

新建 `componets/types.ts`，把 `componets/fxlistgrid.tsx:44-57` 的 `FXListProps` 接口整体移入，`fxlistgrid.tsx` 改为 re-export 以保持既有导入路径可用：

```ts
// componets/types.ts
export interface FXListProps { /* 原样搬移，含 path/alias 注释 */ }
```

改 `componets/fxlistgrid.tsx`：删除接口定义，加 `export type { FXListProps } from "./types"` 并 import 自用。
改 `componets/tools.ts:1`：`import type { FXListProps } from "@/componets/types"`。
`componets/ssr-prefetch.ts:6`、`componets/index.tsx:29`、4 个测试文件的导入路径**保持不变**（经 re-export 解析），若要彻底可后续统一改指 `./types`。

**验证环已断**：`grep -n 'from "@/componets/tools"' componets/fxlistgrid.tsx` 仍有一处（保留），但 `tools.ts` 不再 import `fxlistgrid`。运行 `yarn test`。

### 2.2 合并 `isAbortError`

把 `componets/api-docs/request.ts:28-32` 的实现提升为唯一实现，放到 `componets/types.ts`（或新建 `componets/utils.ts`，选 types.ts 以少建文件）。
`componets/tools.ts:169` 改为 re-export；`componets/api-docs/request.ts` 改为从新位置 import。两处调用方（`index.tsx`、`fxmatrixgrid.tsx`、`api-docs/*`）导入路径不变。

## 批次 3：补测试（约 3h）

### 3.1 布局 UA 分支测试（新增 `test/frontend/layout.test.tsx`）

`app/layout.tsx:35-39` 的 Windows 判定目前零覆盖。因为它 `await headers()`，测试需 mock `next/headers`：

```tsx
// @vitest-environment jsdom
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers(ua)) }))
```
断言两例：UA 含 `Windows NT` → `body` 的 `style.fontFamily` 含 `Noto Color Emoji Flags`；UA 为 Android/iOS → 不含。同时断言 `<body>` 始终带 `inter.className`（防回归时丢掉 Inter）。

### 3.2 `rateStats` 补测（新增 `test/frontend/ratestats.test.tsx`）

`componets/rateStats.tsx`（390 行）无独立测试。优先覆盖移动端 Popover 分支与卸载 cleanup（`StatsTipProvider` 的 `anchorEl` 悬空防护），因为这两处是最容易静默坏掉的。
不追求全覆盖——桌面 Tooltip 已被 `index-pair.test.tsx` 间接覆盖。

## 批次 4：文档补全（约 2h）

| 步骤 | 文件 | 动作 |
| --- | --- | --- |
| 4.1 | `lib/fxrate/readme.md` 环境变量表 | 补 12 个缺失变量：`CORS_ORIGIN`、`FXRATE_CACHE_DIR`、`FXRATE_CARD_DENSE_MATRIX`、`FXRATE_DISABLE_REFRESH`、`FXRATE_SNAPSHOT_FUTURE_SKEW_MS`、`FXRATE_SNAPSHOT_MAX_AGE_MS`、`FXRATE_SNAPSHOT_MAX_BYTES`、`FXRATE_SNAPSHOT_THROTTLE_MS`、`FXRATE_STALE_RATE_AGE_MS`、`SHUTDOWN_DEADLINE_MS`、`WISE_USE_TOKEN_FROM_WEB`（`NODE_ENV` 是框架变量，不列） |
| 4.2 | `lib/fxrate/readme.md` | 表格顶部加一句：完整变量说明见 `docs/architecture.md` 的环境变量节，避免两处再次漂移 |
| 4.3 | `README.md`（前端，36 行模板） | 重写为实际命令：`yarn install`（需 submodule）、`yarn dev` / `full-dev`、`yarn test` / `test:e2e`、`yarn bench:*`、`yarn build`；末尾指路 `AGENTS.md` 与 `docs/architecture.md` |

**待决策**：4.1 与 4.2 一起做会让环境变量有两处描述。若采用「readme 只指路、不列表」，则 4.1 可省略。默认按上表执行（readme 保留表格，因为它是使用者的第一入口）。

## 批次 5：后端收口（约 4h，可选）

`as unknown as currency.unknown` 出现在 30+ 个 getter（`hsbc.cn.ts:39`、`pboc.ts:82`、`cfets.ts:47` 等）。这是**既有模式**而非新债：`currency.unknown` 是枚举成员，双断言用于绕过 `^[A-Z]{3}$` 之外的源上报代码。

建议：在 `lib/fxrate/src/types.d.ts` 旁新增 `toCurrencyCode(raw: string): currency.unknown` 收口函数，集中做 `trim().toUpperCase()` 与合法性判断，然后按文件逐个替换。**逐文件提交**，每换一个跑一次 `yarn test:unit`。

**不建议现在做**：收益是可读性与校验集中化，但要动 30+ 文件，且这些 getter 没有单元测试覆盖（多为网络型），回归风险高于收益。除非你后面要新增数据源，可以顺手在那一个文件里先用新函数。

---

## 明确不做（附理由）

| 项 | 理由 |
| --- | --- |
| A1 `componets/index.tsx:149`（1303 行）拆分 | 会触及 e2e 的 `request-count.spec.ts` / `navigation-race.spec.ts` 精确批量次数断言，需先补/改测试再拆，属独立任务。16h 估算不含测试返工 |
| A2 `componets/fxmatrixgrid.tsx:192`（1223 行）拆分 | 同上，且它在 churn 榜前列，拆分窗口需避开功能开发 |
| A4 `componets/fxlistgrid.tsx` 拆分 | 与 A1/A2 同批更省事，单独做收益低 |
| H1 CORS 默认 `*` | 仅在 `ENABLE_CORS` 设置时生效，默认关闭。属部署文档事项，可在 4.3 的 README 里提一句生产需显式设 `CORS_ORIGIN` |
| E2 之外的依赖更新 | 无重复职能库，无已知 CVE 线索（未联网核对，不做结论） |
| `componets/api-docs` 并入 `tools.ts` | 两个出入口当前职责清晰（文档页 vs 数据页），合并收益不明确，属第七节待确认问题 |

## 执行顺序与提交切分

1. 批次 1 → 一个提交（`fix: 文档批量上限更正 + 死参数与调试日志清理`）
2. 批次 2 → 一个提交（`refactor: 拆出 FXListProps 切断 tools/fxlistgrid 循环依赖，收口 isAbortError`）
3. 批次 3 → 一个提交（`test: 补 layout UA 分支与 rateStats 覆盖`）
4. 批次 4 → 一个提交（`docs: readme 环境变量补全与前端 README 重写`）
5. 批次 5 单独评估，本次不做
6. 全部完成后删除 `TECH_DEBT_AUDIT.md`？——**不删**，保留为审计记录；若要保留则建议提交（当前未跟踪）

每批完成后跑门禁；批次 1 的 1.5（后端文件）需在 submodule 内单独提交（pre-commit 钩子会重建 `dist/index.cjs`）。
