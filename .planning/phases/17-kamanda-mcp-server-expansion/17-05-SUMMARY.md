---
phase: 17-kamanda-mcp-server-expansion
plan: "05"
subsystem: portal/edge-functions/mcp-proxy
tags: [portal, edge-function, mcp-proxy, whitelist, staging-deploy, PORT-01]

dependency_graph:
  requires:
    - 17-01: mcp-poc bridge client (provides kmn tool names)
    - 17-03: mcp-poc tool registrations (defines the 8-tool surface)
  provides:
    - Updated ALLOWED_TOOLS Set in mcp-proxy EF (8 tools, no incomplete_orders)
  affects:
    - supabase/functions/mcp-proxy/index.ts (portal staging EF)
    - Revenue Intelligence widget (Phase 19) — now unblocked for new tool names
    - Weekly briefing email EF (Phase 20) — new tool names can reach mcp-poc

tech_stack:
  added: []
  patterns:
    - Set-based whitelist guard in Deno Edge Function

key_files:
  modified:
    - supabase/functions/mcp-proxy/index.ts

decisions:
  - "Kept ALLOWED_TOOLS Set inside the request handler body (per-request construction) — consistent with existing file style; acceptable cost at Edge Function scale"
  - "Tool order: 3 legacy tools in original order first, 5 new tools in mcp-poc registration sequence — matches D-23 specification"
  - "Comment above Set preserved verbatim (already updated in prior commit bf4e64d to reference kmn/mcp-poc)"

metrics:
  duration: "5 minutes"
  completed: "2026-04-24"
  tasks_completed: 1
  files_changed: 1
---

# Phase 17 Plan 05: mcp-proxy ALLOWED_TOOLS Whitelist Update Summary

**One-liner:** Replaced 4-tool ALLOWED_TOOLS Set with 8-tool kmn surface — drops `incomplete_orders`, adds `revenue_run_rate`, `weekly_heatmap`, `repeat_metrics`, `market_basket_or_aov`, `weekly_briefing_data`.

## What Was Done

Edited `supabase/functions/mcp-proxy/index.ts` lines 141-146: replaced the `ALLOWED_TOOLS` Set declaration to match the D-23 specification exactly. Net diff: +5 lines, -1 line inside the Set block. No other line in the file was touched.

## Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace ALLOWED_TOOLS Set contents | `6bf4072` | `supabase/functions/mcp-proxy/index.ts` |
| 2 | Commit on staging branch | `6bf4072` | same |

## Verification Results

| Check | Result |
|-------|--------|
| 5 new tool names present | 5/5 (grep count == 5) |
| `incomplete_orders` absent | 0 occurrences |
| 3 legacy tools retained | 3/3 |
| Exactly 1 ALLOWED_TOOLS declaration | confirmed |
| `tools/call` guard intact at line 151 | confirmed |
| `uri.startsWith("ui://")` guard intact at line 167 | confirmed |
| `git diff --stat` | 1 file changed, 5 insertions(+), 1 deletion(-) |
| Branch at commit time | staging |

## Deploy Status

**Push to staging:** DEFERRED — awaiting supervisor approval per project rules (CLAUDE.md §Supervisor Role "Must NOT Do": pushing to staging triggers CI deploy to production-adjacent environment). The commit `6bf4072` is ready on the local `staging` branch.

**To deploy**, run:
```bash
git push origin staging
```
This triggers `.github/workflows/deploy-edge-functions-staging.yml` which deploys the updated `mcp-proxy` EF to Cloud Supabase project `ahlthosftngdcryltapu` (staging).

**Post-deploy smoke check** (after CI completes, ~2-3 min):
```bash
# Get STAGING_ANON_KEY from docs/staging-env-reference.txt
curl -s "https://ahlthosftngdcryltapu.supabase.co/functions/v1/mcp-proxy" \
  -H "Authorization: Bearer $STAGING_ANON_KEY" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"weekly_heatmap","arguments":{"weeks":8}}}' \
  | jq
# Expected: NOT BAD_REQUEST. (Upstream mcp-poc may still error if env vars not set, but proxy whitelist is no longer the blocker.)
```

## Deviations from Plan

None — plan executed exactly as written. The prior commit `bf4e64d` had already updated the 2-line comment above the Set from `kamanda-mcp-poc` to `kmn MCP server (mcp-poc Vercel deployment)`, so no comment change was needed here.

## Known Stubs

None.

## Threat Flags

No new network endpoints, auth paths, or trust boundary surfaces introduced. The Set change is purely additive (new tool names) minus one removal (`incomplete_orders`). T-17-18 fully mitigated: `incomplete_orders` removed from whitelist.

## Self-Check: PASSED

- File `supabase/functions/mcp-proxy/index.ts` exists and contains all 8 expected tool names
- Commit `6bf4072` exists on `staging` branch
- No unexpected file deletions in the commit
