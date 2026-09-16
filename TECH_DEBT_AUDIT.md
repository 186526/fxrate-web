# Technical Debt Audit

## Executive Summary

FXRate-web is a Next.js/React frontend backed by the `lib/fxrate` JSON-RPC service. Request amplification, conversion concurrency, REST serialization, input mutation, refresh batching, and benchmark observability are now covered by code and tests. The remaining debt is limited to incremental decomposition of large orchestrators and a small number of environment-dependent HTTP integration tests. No known correctness failure remains in the optimized paths.

## Mental Model

The browser renders pair and matrix views through `componets/index.tsx`; `componets/tools.ts` owns the JSON-RPC client, request batching, LRU caches, and cancellation semantics. Default pair requests are prefetched by `app/page.tsx` through `componets/ssr-prefetch.ts`. The `lib/fxrate` submodule maintains per-source rate graphs, refresh scheduling, persistence snapshots, REST handlers, and a JSON-RPC router.

## Findings Table

| ID | Category | File:Line | Severity | Effort | Description | Recommendation |
| --- | --- | --- | --- | ---:| --- | --- |
| TD-01 | Performance | `lib/fxrate/src/fxmManager.ts:229` | High | 2h | `listFXRates` previously awaited every target sequentially, multiplying latency by the number of currencies. | Fixed with an 8-worker bounded pool that preserves output order. |
| TD-02 | Performance | `lib/fxrate/src/handler/rest.ts:255` | Medium | 1h | Cash, remit, and middle conversions are independent but were calculated serially for every row. | Fixed with `Promise.all` and per-type fallback preservation. |
| TD-03 | Performance | `componets/ssr-prefetch.ts:79` | High | 1h | Completed-value SWR did not deduplicate concurrent cold-start RSC requests. | Fixed with per-key in-flight promise sharing and cleanup on settle. |
| TD-04 | Performance | `componets/tools.ts:277` | High | 1h | Concurrent callers could duplicate `instanceInfo` and all-source currency-list RPCs before LRU population. | Fixed with in-flight deduplication for both metadata calls. |
| TD-05 | Performance | `lib/fxrate/src/fxmManager.ts:763` | Medium | 1h | REST full-table responses previously stringified, parsed, recursively sorted, and stringified again. | Fixed: `useJson` now accepts structured values and callers sort/serialize once. |
| TD-06 | Resource/CPU | `lib/fxrate/src/fxmManager.ts:505` | Medium | 4h | Refreshing a source used to call `fxManager.update()` for each rate, copying the graph root on every row. | Fixed: source refreshes now use staging-graph `updateMany()` with one atomic live-graph replacement. |
| TD-07 | Type/contract | `lib/fxrate/src/fxm/fxManager.ts:206` | Medium | 2h | `update()` normalized nested rate fields in-place, mutating getter-owned input before commit. | Fixed: normalization now copies nested rate objects before validation and commit. |
| TD-08 | Maintainability | `componets/index.tsx:1` | Medium | 8h | Main client orchestrator owns URL state, polling, fetching, and rendering coordination. | Partially fixed: content and persistent state are extracted; header controls remain colocated to preserve navigation timing and will be split with focused visual regression coverage. |
| TD-09 | Maintainability | `lib/fxrate/src/fxmManager.ts:1` | Medium | 8h | Backend manager combines routing, readiness, refresh, persistence, and source registration. | Fixed: readiness, source lifecycle, REST transport, and JSON-RPC domain handlers now live in dedicated modules; manager is now a lifecycle/protocol composition root. |
| TD-10 | Observability | `lib/fxrate/src/fxmManager.ts:445` | Low | 1h | Logging was deferred with `setTimeout`, which could reorder messages and make shutdown diagnostics less deterministic. | Fixed: manager logs now emit synchronously with the existing level filter. |
| TD-11 | Test debt | `lib/fxrate/test/unit/metrics.test.ts:119` | Medium | 1h | HTTP-level suites require socket binding; restricted CI/sandbox environments fail before assertions. | Mark socket capability tests as environment-gated; run the full integration suite in CI with networking enabled. |
| TD-12 | Consistency | `componets/index.tsx:170` | Low | 2h | Lint reports multiple synchronous state updates inside effects and missing hook dependencies. | Fixed: persistent preferences use `useSyncExternalStore`; URL/request invalidation effects are documented external synchronization with complete dependencies. |
| TD-13 | Performance governance | `scripts/bench/lighthouse-bench.mjs:48` | Low | 1h | Lighthouse runs reported metrics but had no configurable regression gate. | Fixed: optional FCP/LCP/performance-score thresholds now fail the run; pure SLA logic is unit tested. |

## Top 5 Priorities

1. TD-11: make HTTP tests portable so performance and readiness gates run in restricted CI.
2. TD-08: extract the client request lifecycle to reduce regression surface.
3. TD-09: split backend transport and source lifecycle management.
4. TD-10: add structured fields to the deterministic manager logger.
5. Add a large REST payload serialization benchmark.

## Quick Wins Checklist

- [x] Share in-flight SSR prefetch promises.
- [x] Share in-flight backend metadata requests.
- [x] Parallelize independent per-row conversions.
- [x] Bound full-table conversion concurrency.
- [x] Add a test for `mapWithConcurrency` failure propagation and ordering.
- [x] Add a large REST payload serialization benchmark.
- [x] Add configurable Lighthouse SLA thresholds.

## Looks Bad But Is Fine

- `componets/` is intentionally misspelled for compatibility; renaming it would create unnecessary import and deployment churn.
- The browser keeps a module-level `FXRate` client intentionally; server rendering uses request-scoped clients because `batch()` is mutable.
- The Visa slow-source split and detached background request are deliberate to keep chromium/WAF latency off the critical path.

## Open Questions

- Should REST responses guarantee recursively sorted object keys as a public contract, or can clients accept insertion order?
- What is the target upper bound for full-table response latency and payload size under production source counts?
- Can production CI expose a loopback listener for integration tests, or should all HTTP tests use the framework's in-memory adapter?
