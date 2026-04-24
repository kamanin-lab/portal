---
phase: 17-kamanda-mcp-server-expansion
plan: 03
subsystem: api
tags: [mcp-poc, node, server-wiring, tool-registration, refactor, fan-out, daily-briefing]

requires:
  - phase: 17-01
    provides: "createKmnBridgeClient() + KmnBridgeError + payload types"
  - phase: 17-02
    provides: "5 kmn tool-builder modules (buildRevenueRunRate, buildWeeklyHeatmap, buildRepeatMetrics, buildMarketBasketOrAov, buildWeeklyBriefingData)"

provides:
  - "mcp-server.ts: buildMcpServer() returning exactly 8-tool surface"
  - "daily_briefing handler: resilient Promise.allSettled fan-out over 4 kmn bridge calls + WooCommerce attention"
  - "BriefingPayload type: blocks (4 keys) + attention (1 key) — Phase 19 widget contract"

affects:
  - 17-04 (env vars already documented; no further server changes needed)
  - 17-05 (portal mcp-proxy ALLOWED_TOOLS whitelist update — references this 8-tool surface)
  - Phase 19 (widget HTML reads blocks/attention shape; load-bearing invariants preserved)

tech-stack:
  added: []
  patterns:
    - "Promise.allSettled fan-out: 5 parallel ops, each wrapped via toBlock() → Block<T>; no global try/catch on daily_briefing"
    - "Block<T> = {status:'ok', data} | {status:'error', message} — per-block error isolation (MCPS-03)"
    - "toBlock() helper converts PromiseSettledResult<T> → Block<T> in 3 lines"
    - "BriefingPayload type at module level: blocks (4 analytics) + attention (WC REST) — D-08 asymmetry preserved"
    - "errorMessage() multi-branch: WooApiError → WC format; KmnBridgeError → KMN bridge <code> — <msg>; fallback"
    - "summarizeBriefing() German 4-block + attention with n/v (Fehler) per-block fallback (WIDG-QA-04)"

key-files:
  created: []
  modified:
    - mcp-poc:src/mcp-server.ts
  deleted:
    - mcp-poc:src/tools/incomplete-orders.ts

key-decisions:
  - "Removed WeeklyBriefingData from mcp-server.ts imports — BriefingPayload doesn't reference it; structuredContent type is inferred; avoids unused-import tsc warning"
  - "payment-attention.ts comment referencing 'incomplete-orders (0-48h)' not modified per MCPS-05 unchanged constraint — comment is documentation, not a code dependency; tsc passes cleanly"
  - "Promise.allSettled appears in both code and a comment — grep count of 2 is correct; tool handler uses it exactly once"

requirements-completed: [MCPS-02, MCPS-03, MCPS-04, MCPS-05, MCPS-06]

duration: 15min
completed: "2026-04-24"
---

# Phase 17 Plan 03: mcp-server.ts Integration Wave — Summary

**mcp-server.ts refactored to 8-tool surface with Promise.allSettled daily_briefing fan-out, 5 new kmn bridge tool registrations, deprecated tools removed, incomplete-orders.ts deleted**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-04-24
- **Tasks:** 3 (delete, refactor, smoke-check)
- **Files modified:** 1 (`mcp-server.ts`)
- **Files deleted:** 1 (`src/tools/incomplete-orders.ts`)

## Accomplishments

- `incomplete-orders.ts` deleted via `git rm` (D-11)
- `mcp-server.ts` rewritten: imports updated, 3 deprecated registrations removed, 5 new `server.registerTool()` blocks added
- `daily_briefing` handler replaced `Promise.all([rev, attn, incomplete])` with `Promise.allSettled` over 4 bridge calls + `buildPaymentAttention` — per-block error isolation (MCPS-03, T-17-10)
- `Block<T>` + `BriefingPayload` types added at module level (D-08 contract for Phase 19 widget)
- `toBlock()` helper converts `PromiseSettledResult<T>` to `Block<T>` in 3 lines
- `summarizeBriefing()` rewritten: German labels for all 4 blocks + attention, `n/v (Fehler: …)` per-block fallback (WIDG-QA-04)
- `errorMessage()` extended: new `KmnBridgeError` branch (`KMN bridge <code> — <message>`)
- Load-bearing invariants preserved: `DAILY_BRIEFING_URI = "ui://widgets/daily-briefing.html"`, `registerAppTool` for `daily_briefing`, `_meta: { ui: { resourceUri: DAILY_BRIEFING_URI } }`, `revenue_today` + `payment_attention_orders` handler bodies unchanged
- `tsc --noEmit` exits 0 after each commit; `npm run build` (widgets + tsc) succeeds

## Task Commits (mcp-poc repo, branch `main`)

| Task | Commit | Message |
|------|--------|---------|
| 1 — Delete incomplete-orders.ts | `c8f1ffe` | chore(17-03): delete src/tools/incomplete-orders.ts |
| 2 — Refactor mcp-server.ts | `9fd5511` | feat(17-03): refactor mcp-server.ts — 8-tool surface + Promise.allSettled daily_briefing |
| 3 — Smoke-check | (no files changed) | tsc + build verified; no new commit needed |

## Final Tool Surface (D-14, tools/list)

| # | Tool name | Registration | Data source |
|---|-----------|-------------|-------------|
| 1 | `daily_briefing` | `registerAppTool` | 4x kmn bridge + 1x WooCommerce (Promise.allSettled) |
| 2 | `revenue_today` | `server.registerTool` | WooCommerce REST v3 (unchanged) |
| 3 | `payment_attention_orders` | `server.registerTool` | WooCommerce REST v3 (unchanged) |
| 4 | `revenue_run_rate` | `server.registerTool` | kmn bridge → `buildRevenueRunRate` |
| 5 | `weekly_heatmap` | `server.registerTool` | kmn bridge → `buildWeeklyHeatmap` |
| 6 | `repeat_metrics` | `server.registerTool` | kmn bridge → `buildRepeatMetrics` |
| 7 | `market_basket_or_aov` | `server.registerTool` | kmn bridge → `buildMarketBasketOrAov` |
| 8 | `weekly_briefing_data` | `server.registerTool` | kmn bridge → `buildWeeklyBriefingData` |

Total: **8 tools** (1 via `registerAppTool` + 7 via `server.registerTool`). Deprecated removed: `incomplete_orders`, `stuck_orders`, `low_stock_products`.

## Verification Results

| Check | Result |
|-------|--------|
| `tsc --noEmit` exits 0 | PASS |
| `npm run build` succeeds | PASS |
| `(registerAppTool\|registerTool)\(` count in mcp-server.ts | 8 |
| `Promise.allSettled` present | 1 usage in handler (+ 1 in comment) |
| `incomplete-orders.ts` deleted | PASS |
| Zero dangling code references to `incomplete-orders` in `src/` | PASS (1 comment in payment-attention.ts — not a code dep) |
| `DAILY_BRIEFING_URI = "ui://widgets/daily-briefing.html"` | PASS |
| `resourceUri: DAILY_BRIEFING_URI` in `_meta.ui` | PASS |
| `registerAppTool` used for `daily_briefing` | PASS |
| German labels: Tages-Hochrechnung, Bester Slot, Stammkunden-Quote, Warenkorb, Zahlungsaufmerksamkeit | PASS |
| `n/v (Fehler` per-block fallback | 5 occurrences (4 blocks + 1 attention) |
| `KmnBridgeError` branch in `errorMessage()` | PASS |
| No `buildIncompleteOrders` / `IncompleteOrdersPayload` imports | PASS |

## Deviations from Plan

### Minor deviation (no impact)

**[Rule 2 - Correctness] Omitted `WeeklyBriefingData` from mcp-server.ts imports**

- **Found during:** Task 2 import construction
- **Issue:** Plan's `<action>` block included `type WeeklyBriefingData` in the kmn-bridge import. This type is not referenced in `BriefingPayload` or any explicit type annotation in `mcp-server.ts` — `structuredContent` for `weekly_briefing_data` is inferred from `buildWeeklyBriefingData()`'s return type. Including it would produce an unused-import tsc warning.
- **Fix:** Omitted `WeeklyBriefingData` from the import. `tsc --noEmit` passes cleanly.
- **Impact:** Zero — the type flows correctly through inference.

## Threat Mitigations Applied

| Threat | Mitigation | Verified |
|--------|------------|---------|
| T-17-10 (DoS via hung bridge call) | `Promise.allSettled` — one hung ability produces one `{status:'error'}` block; other 4 ops finish on their own schedule | daily_briefing handler |
| T-17-11 (info disclosure in summarizeBriefing) | `errorMessage()` normalises `KmnBridgeError` to `KMN bridge <code> — <message>`; no raw WP response body in text | errorMessage() function |
| T-17-12 (DAILY_BRIEFING_URI tampering) | Invariants verified by grep in acceptance criteria above | All 3 grep checks pass |
| T-17-13 (removed tool still in Portal whitelist) | `incomplete_orders` removed from server; Plan 05 aligns the Portal proxy whitelist | Plan 05 scope |

## Known Stubs

None — all 8 tool registrations delegate to complete implementations. No placeholder values or TODOs.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes beyond what the plan's threat model documents.

## Self-Check: PASSED

- FOUND: `G:/01_OPUS/Projects/mcp-poc/src/mcp-server.ts` (modified)
- NOT FOUND: `G:/01_OPUS/Projects/mcp-poc/src/tools/incomplete-orders.ts` (correctly deleted)
- FOUND commit `c8f1ffe` in mcp-poc git log
- FOUND commit `9fd5511` in mcp-poc git log
- `tsc --noEmit` exit 0 (confirmed — no output)
- `npm run build` exit 0 (widgets + tsc both succeeded)
- Tool registration count: 8 (grep confirmed)
- Deprecated tools absent: 0 matches for incomplete_orders/stuck_orders/low_stock_products
- Load-bearing invariants: all 4 grep checks pass

---
*Phase: 17-kamanda-mcp-server-expansion*
*Completed: 2026-04-24*
