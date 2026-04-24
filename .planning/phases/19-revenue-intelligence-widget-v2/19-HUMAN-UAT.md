---
phase: 19-revenue-intelligence-widget-v2
source: 19-08-PLAN.md
status: partial
started: 2026-04-24
updated: 2026-04-24
---

# Phase 19 — Human UAT Contract

These 4 UAT items from Plan 19-08 cannot be automated from the build host because they require either:

- Summerfield DDEV (`https://summerfield.ddev.site/`) — only reachable from Yuri's local machine
- Portal-embedded runtime (logged-in session at `https://staging.portal.kamanin.at/revenue`) behind Vercel SSO
- Wall-clock timing on a seeded production-shape day
- Multi-route navigation in the portal SPA with DevTools observation

The automated subset (UAT-1 / UAT-3-fixture / UAT-4) is recorded in `19-08-SUMMARY.md`. This file persists the deferred subset so it can be executed and signed off later.

## Tests

### UAT-2 — `-85%` bug non-reproducible at 09:00 / 11:00 / 14:00 / 17:00 Europe/Vienna

- **expected:** Load `https://staging.portal.kamanin.at/revenue` against Summerfield DDEV at the four clock times on the same seeded day, capture HeuteBlock pace screenshots; pass = no universally-negative pace render across all 4 captures (i.e. the `-85%` bug from earlier sprint does not reappear at any of the four wall-clock points).
- **result:** [pending]

### UAT-3 (full) — Real upstream ability sabotage

- **expected:** Temporarily make `kmn/repeat-metrics` HTTP 500 (or kill-switch the WP option that toggles the ability); reload `/revenue` in the portal; pass = RepeatBlock renders the error skeleton (`Daten nicht verfügbar` + `Bitte Seite neu laden`) while the other 3 blocks (HeuteBlock, HeatmapBlock, BasketOrAovBlock) render normally with healthy data; restore the ability and reload to confirm the widget returns to a 4-block healthy state.
- **result:** [pending]

### UAT-5 — Period-toggle end-to-end network round-trip

- **expected:** Open DevTools Network panel filtered by `mcp-proxy` on `/revenue`; click `[4 Wochen]` then `[12 Wochen]` in HeatmapBlock; pass = exactly one POST per click with body `{"method":"tools/call","params":{"name":"weekly_heatmap","arguments":{"weeks":N}}}` (or equivalent JSON-RPC envelope), heatmap dims to 60% opacity during the in-flight fetch, sibling blocks (HeuteBlock / RepeatBlock / BasketOrAovBlock) do NOT re-render — verified via React DevTools Profiler showing only HeatmapBlock in the commit list.
- **result:** [pending]

### UAT-6 (optional) — Theme publisher survives remount

- **expected:** Open browser console with a listener for `kmn/theme/*` postMessages; navigate `/revenue` → `/tickets` → `/revenue` three times in sequence; pass = a `kmn/theme/set tokens` message fires on each return to `/revenue`, the widget renders cleanly without stale tokens (background / accent / text colours match the current portal theme), and no orphaned event listeners or memory growth visible in DevTools Memory tab.
- **result:** [pending]

## Summary

- **total:** 4
- **passed:** 0
- **issues:** 0
- **pending:** 4
- **skipped:** 0
- **blocked:** 0

## Gaps

_None recorded — all 4 deferred items have a clear execution recipe and reachable environment from Yuri's machine._
