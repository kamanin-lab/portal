---
phase: 17-kamanda-mcp-server-expansion
plan: 02
subsystem: api
tags: [mcp-poc, node, tools, tool-builders, kmn-bridge]

requires:
  - phase: 17-01
    provides: "createKmnBridgeClient() factory + KmnBridgeClient type + 5 payload types (RunRateData, HeatmapData, RepeatData, BasketData, WeeklyBriefingData)"

provides:
  - "revenue-run-rate.ts: buildRevenueRunRate(client) -> Promise<RunRateData>"
  - "weekly-heatmap.ts: buildWeeklyHeatmap(client, args?) -> Promise<HeatmapData>, default weeks=8"
  - "repeat-metrics.ts: buildRepeatMetrics(client, args?) -> Promise<RepeatData>, default days=90"
  - "market-basket-or-aov.ts: buildMarketBasketOrAov(client) -> Promise<BasketData>"
  - "weekly-briefing-data.ts: buildWeeklyBriefingData(client) -> Promise<WeeklyBriefingData>"

affects:
  - 17-03 (mcp-server.ts registers all 5 tools via these builders)

tech-stack:
  added: []
  patterns:
    - "Pure async builder functions: one file per tool, takes KmnBridgeClient, returns payload type"
    - "All imports from ../connectors/kmn-bridge.js — single import point for client type + payload types"
    - "No validation, no error-wrapping, no HTTP — 100% delegated to bridge client"

key-files:
  created:
    - mcp-poc:src/tools/revenue-run-rate.ts
    - mcp-poc:src/tools/weekly-heatmap.ts
    - mcp-poc:src/tools/repeat-metrics.ts
    - mcp-poc:src/tools/market-basket-or-aov.ts
    - mcp-poc:src/tools/weekly-briefing-data.ts
  modified: []

key-decisions:
  - "Files mirror plan spec verbatim — no deviation needed; plan provided exact content"
  - "CRLF line-ending warnings from git on Windows are cosmetic only — no functional impact"

requirements-completed: [MCPS-02]

duration: 5min
completed: "2026-04-24"
---

# Phase 17 Plan 02: 5 kmn Tool-Builder Modules — Summary

**5 thin tool-builder files in mcp-poc/src/tools/ — each a single async function delegating to KmnBridgeClient, with no validation or error-wrapping**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-04-24
- **Tasks:** 1
- **Files created:** 5 (all in mcp-poc/src/tools/)

## Accomplishments

- `revenue-run-rate.ts` — `buildRevenueRunRate(client)` → `client.runRate()`
- `weekly-heatmap.ts` — `buildWeeklyHeatmap(client, args?)` → `client.heatmap({ weeks })`, default 8
- `repeat-metrics.ts` — `buildRepeatMetrics(client, args?)` → `client.repeat({ days })`, default 90
- `market-basket-or-aov.ts` — `buildMarketBasketOrAov(client)` → `client.marketBasket()`
- `weekly-briefing-data.ts` — `buildWeeklyBriefingData(client)` → `client.weeklyBriefing()`
- `tsc --noEmit` exits 0 on full mcp-poc project after all 5 files added

## Task Commits (mcp-poc repo)

1. **Task 1: 5 tool-builder files** — `40f764b` feat(17-02): add 5 kmn tool-builder modules — on branch `main`

## Files Created

- `G:/01_OPUS/Projects/mcp-poc/src/tools/revenue-run-rate.ts` — 12 lines
- `G:/01_OPUS/Projects/mcp-poc/src/tools/weekly-heatmap.ts` — 15 lines
- `G:/01_OPUS/Projects/mcp-poc/src/tools/repeat-metrics.ts` — 15 lines
- `G:/01_OPUS/Projects/mcp-poc/src/tools/market-basket-or-aov.ts` — 13 lines
- `G:/01_OPUS/Projects/mcp-poc/src/tools/weekly-briefing-data.ts` — 12 lines

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| 5 files exist at specified paths | PASS |
| Each exports one `build*` function | PASS (1 per file, 5 total) |
| Every file imports from `../connectors/kmn-bridge.js` | PASS (5/5) |
| No file imports from `../connectors/woocommerce` | PASS (0 matches) |
| `buildWeeklyHeatmap` contains `args.weeks ?? 8` | PASS |
| `buildRepeatMetrics` contains `args.days ?? 90` | PASS |
| `tsc --noEmit` exits 0 | PASS |
| No `try` or `catch` in any file | PASS (0 matches) |
| No `z.` or `schema.parse` in any file | PASS (0 matches) |

## Deviations from Plan

None — plan executed exactly as written. All 5 files match the verbatim content specified in the plan's `<action>` block. Git reported CRLF line-ending warnings (Windows autocrlf behavior) — cosmetic only, no functional impact.

## Known Stubs

None — all 5 builders are complete single-line delegates. No placeholder values or TODOs.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. All trust-boundary concerns are handled by the bridge client (Plan 01). Threat mitigations T-17-08 and T-17-09 are satisfied: zero log statements and zero data transformation in these builders; `weeks`/`days` validation deferred to WP-side JSON Schema range constraints via bridge.

## Self-Check: PASSED

- FOUND: `G:/01_OPUS/Projects/mcp-poc/src/tools/revenue-run-rate.ts`
- FOUND: `G:/01_OPUS/Projects/mcp-poc/src/tools/weekly-heatmap.ts`
- FOUND: `G:/01_OPUS/Projects/mcp-poc/src/tools/repeat-metrics.ts`
- FOUND: `G:/01_OPUS/Projects/mcp-poc/src/tools/market-basket-or-aov.ts`
- FOUND: `G:/01_OPUS/Projects/mcp-poc/src/tools/weekly-briefing-data.ts`
- FOUND commit `40f764b` on mcp-poc branch `main`
- `tsc --noEmit` exit 0 (confirmed — no output)
- Export count: 5 (one per file)
- Bridge import count: 5 (one per file)
- Woocommerce import count: 0
- try/catch count: 0
- Zod usage count: 0

---
*Phase: 17-kamanda-mcp-server-expansion*
*Completed: 2026-04-24*
