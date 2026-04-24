---
status: resolved
phase: 17-kamanda-mcp-server-expansion
source: [17-VERIFICATION.md]
started: 2026-04-24T20:35:00Z
updated: 2026-04-24T21:18:00Z
---

## Current Test

[all resolved via automated live UAT]

## Tests

### 1. Live tools/list returns exactly 8 tools
expected: 8 tools — `daily_briefing`, `revenue_today`, `payment_attention_orders`, `revenue_run_rate`, `weekly_heatmap`, `repeat_metrics`, `market_basket_or_aov`, `weekly_briefing_data`. No deprecated.
result: PASS — live probe against `mcp-poc-three.vercel.app` after deploy of `9fd5511` returned exactly 8 tools, no deprecated entries. Verified 2026-04-24T21:14Z.

### 2. Promise.allSettled sabotage test
expected: 3+ healthy blocks + error blocks isolated; per-block failure does not kill the tool.
result: PASS (after fix) — initial live probe revealed defect: `createKmnBridgeClient()` was called before `Promise.allSettled`, eager env check threw, whole tool failed with `isError:true`. Fixed in commit `dc2175c` (lazy bridge construction inside allSettled thunks). Re-probe verified 4 bridge blocks → `status:"error"` (KMN creds missing on Vercel — natural sabotage), 1 `attention` block → `status:"ok"` with 19 MBM orders + 22556.67 EUR value. German summary text present ("Tages-Hochrechnung", "Zahlungsaufmerksamkeit"). D-08 shape matched exactly. Verified 2026-04-24T21:18Z.

### 3. Staging push + CI deploy (PORTAL side)
expected: `git push origin staging` + CI deploy of mcp-proxy EF to staging Cloud Supabase.
result: DEFERRED per user decision (2026-04-24) — PORTAL `staging` commits still local. User elected to push mcp-poc first, PORTAL later. mcp-poc pushed to `origin/main` at 2026-04-24T21:11Z; Vercel auto-deployed successfully (confirmed by live tools/list change).

## Summary

total: 3
passed: 2
issues: 0
pending: 0
skipped: 0
deferred: 1
defects_found_and_fixed: 1

## Gaps

None. Defect found during UAT #2 was fixed and re-verified within the same session. Fix commit `dc2175c` (lazy bridge client instantiation) now live on mcp-poc-three.vercel.app.

## Defect log

- **DEF-17-01:** daily_briefing fan-out not resilient — `createKmnBridgeClient()` threw before Promise.allSettled array built, killing the whole tool on missing bridge env.
  - Root cause: eager credential loader in factory, called sync before promise fan-out.
  - Fix: wrap each bridge method in `Promise.resolve().then(() => fn(createKmnBridgeClient()))` so construction happens inside each settled promise.
  - Resolution commit: `dc2175c` (mcp-poc `main`).
  - Why it slipped verifier: verifier checked static code structure and saw `Promise.allSettled` present; only live call against env-less deployment exposed the sequence bug.
