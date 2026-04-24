---
phase: 17-kamanda-mcp-server-expansion
plan: 04
subsystem: infra
tags: [mcp-poc, env-vars, runbook, kmn-bridge, woocommerce, config]

requires:
  - phase: 17-kamanda-mcp-server-expansion (plan 01)
    provides: loadKmnBridgeCredentialsFromEnv() reading KMN_BRIDGE_URL, WOOCOMMERCE_WP_USER, WOOCOMMERCE_WP_APP_PASS

provides:
  - ".env.example documents the 3 env vars consumed by kmn-bridge.ts with inline comments"
  - "MCPS-07 no-credential-coupling assertion documented inline (WOOCOMMERCE_WP_* vs WP_MCP_*)"
  - "DDEV-only scope for KMN_BRIDGE_URL documented with example URL"

affects:
  - 17-kamanda-mcp-server-expansion (all remaining plans needing local dev setup)
  - future MBM rollout milestone (KMN_BRIDGE_URL production value)

tech-stack:
  added: []
  patterns:
    - "env-var blocks grouped by subsystem; credentials pair shares single comment block (matching WOOCOMMERCE_CONSUMER_KEY+SECRET pattern)"

key-files:
  created: []
  modified:
    - mcp-poc:.env.example

key-decisions:
  - "New vars WOOCOMMERCE_WP_USER / WOOCOMMERCE_WP_APP_PASS are distinct from portal's WP_MCP_USER / WP_MCP_APP_PASS (D-19, MCPS-07 — no credential coupling)"
  - "KMN_BRIDGE_URL example points at https://summerfield.ddev.site/wp-json/mcp/kmn-revenue (DDEV only, v3.0 — D-20)"
  - "Credential pair shares one comment block, KMN_BRIDGE_URL gets its own block — mirrors existing CONSUMER_KEY+SECRET / INCLUDE_ON_HOLD style"

patterns-established:
  - "Credential pair sharing one comment block: describe both vars together above both NAME= lines"

requirements-completed: [MCPS-07]

duration: 5min
completed: 2026-04-24
---

# Phase 17 Plan 04: Env Var Runbook Summary

**`mcp-poc/.env.example` updated with 3 documented empty-value placeholders for the kmn-revenue bridge — WOOCOMMERCE_WP_USER, WOOCOMMERCE_WP_APP_PASS, KMN_BRIDGE_URL — with inline comments asserting the MCPS-07 no-credential-coupling distinction and DDEV-only scope for v3.0**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-24T00:00:00Z
- **Completed:** 2026-04-24T00:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Appended 3 new env var blocks to `mcp-poc/.env.example` between `WOOCOMMERCE_INCLUDE_ON_HOLD=false` and `# Local dev only`
- Comment on `WOOCOMMERCE_WP_USER` / `WOOCOMMERCE_WP_APP_PASS` explicitly names `WP_MCP_USER` / `WP_MCP_APP_PASS` and declares "no credential coupling (see MCPS-07)" — satisfies D-19 and T-17-15
- Comment on `KMN_BRIDGE_URL` includes example DDEV URL in indented sub-line and notes DDEV-only scope for v3.0 — satisfies D-20
- All 6 pre-existing vars (`WOOCOMMERCE_STORE_URL`, `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET`, `WOOCOMMERCE_ADMIN_URL`, `WOOCOMMERCE_INCLUDE_ON_HOLD`, `PORT`) preserved verbatim

## Task Commits

1. **Task 1: Append 3 new env vars with inline-comment docs** - `60f18d8` (chore)

**Plan metadata:** (see final commit below)

## Files Created/Modified

- `mcp-poc/.env.example` — added 13 lines (3 empty-value placeholders + comment blocks); existing 19 lines unchanged

## Decisions Made

- Credential pair `WOOCOMMERCE_WP_USER` + `WOOCOMMERCE_WP_APP_PASS` share one comment block (4 comment lines above both `NAME=` lines), matching how `WOOCOMMERCE_CONSUMER_KEY` + `WOOCOMMERCE_CONSUMER_SECRET` share one block in the existing file
- `KMN_BRIDGE_URL` gets its own comment block with indented example URL (2 spaces), matching existing doc style for example values

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

To set up for local dev, add to `mcp-poc/.env.local` (gitignored):

```
KMN_BRIDGE_URL=https://summerfield.ddev.site/wp-json/mcp/kmn-revenue
WOOCOMMERCE_WP_USER=<your-wp-username>
WOOCOMMERCE_WP_APP_PASS=<application-password-from-wp-admin>
```

For Vercel deployment: paste the same 3 vars into the mcp-poc project → Settings → Environment Variables dashboard (manual paste — no scripted env push, per D-21).

## Next Phase Readiness

- `mcp-poc/.env.example` documents all env vars required by Plan 17-01's `loadKmnBridgeCredentialsFromEnv()` — local dev and Vercel deployment are fully documented
- Remaining Phase 17 plans (17-02 through 17-05) can proceed; they depend on Plans 17-01 and 17-03 for the bridge client and tool wiring, not on this plan's config doc

## Self-Check

- [x] `mcp-poc/.env.example` exists and has 3 new empty-value vars
- [x] Commit `60f18d8` exists on `mcp-poc` `main` branch
- [x] All 6 pre-existing vars preserved (grep count == 6)
- [x] `WP_MCP_USER` / `WP_MCP_APP_PASS` referenced in comment (grep count == 1)
- [x] No secrets committed (all new `NAME=` lines have empty values)

## Self-Check: PASSED

---
*Phase: 17-kamanda-mcp-server-expansion*
*Completed: 2026-04-24*
