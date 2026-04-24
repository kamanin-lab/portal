---
phase: 19
slug: revenue-intelligence-widget-v2
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-24
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 2.1.9 (mcp-poc repo — separate from PORTAL vitest) |
| **Config file** | `G:/01_OPUS/Projects/mcp-poc/vitest.config.ts` (Phase 18; extend `environmentMatchGlobs` jsdom array to include `widgets/daily-briefing/src/blocks/**/*.{test,spec}.{ts,tsx}`) |
| **Quick run command** | `cd G:/01_OPUS/Projects/mcp-poc && npm run test:run -- widgets/daily-briefing` |
| **Full suite command** | `cd G:/01_OPUS/Projects/mcp-poc && npm run test:run && npm run build:widgets && npm run check:bundle-size` |
| **Estimated runtime** | ~30 seconds quick / ~90 seconds full (includes widget build + gz size check) |

---

## Sampling Rate

- **After every task commit:** Run `cd G:/01_OPUS/Projects/mcp-poc && npm run test:run -- widgets/daily-briefing` + `npm run typecheck`
- **After every plan wave:** Run `cd G:/01_OPUS/Projects/mcp-poc && npm run test:run && npm run build:widgets && npm run check:bundle-size`
- **Before `/gsd-verify-work`:** Full suite green + bundle ≤ 300 KB gz + manual UAT checklist complete
- **Max feedback latency:** 30 seconds (quick) / 90 seconds (full)

---

## Per-Task Verification Map

*Rows are placeholders — gsd-planner fills Task ID, Plan, and Wave columns as it writes PLAN.md files. Each task row must reference at least one automated command OR a Wave 0 file dependency.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | 01 | 0 | WIDG-STRUCT-05 | — | N/A | unit | `npm run test:run -- widgets/daily-briefing/src/lib/__tests__/formatters` | ❌ W0 | ⬜ pending |
| TBD | 01 | 0 | WIDG-STRUCT-04 | V5 Input Validation | Fixture union rejects unknown modes | unit | `npm run test:run -- widgets/daily-briefing/src/lib/__tests__/fixtures` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | WIDG-BLOCK-01 + WIDG-BLOCK-05 | V7 Error Handling | Confidence=low swaps number for reason, no "NaN %" leak | render | `npm run test:run -- widgets/daily-briefing/src/blocks/__tests__/HeuteBlock` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | WIDG-BLOCK-02 | V4 Access Control | Period toggle only invokes whitelisted `weekly_heatmap` | render | `npm run test:run -- widgets/daily-briefing/src/blocks/__tests__/HeatmapBlock` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | WIDG-BLOCK-03 | — | N/A | render | `npm run test:run -- widgets/daily-briefing/src/blocks/__tests__/RepeatBlock` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | WIDG-BLOCK-04 | — | 3-mode branch coverage | render | `npm run test:run -- widgets/daily-briefing/src/blocks/__tests__/BasketOrAovBlock` | ❌ W0 | ⬜ pending |
| TBD | 02 | 1 | WIDG-QA-03 | V7 Error Handling | Error block isolates — siblings still render | render | `npm run test:run -- widgets/daily-briefing/src/blocks/__tests__/HeuteBlock` (and all block files — status:'error' variants) | ❌ W0 | ⬜ pending |
| TBD | 03 | 2 | WIDG-QA-04 | — | All user-facing text German | grep | `node scripts/check-german-only.mjs` (new — blocks CI if English leaks into dist) | ❌ W0 | ⬜ pending |
| TBD | 03 | 2 | WIDG-QA-05 | — | Dist ≤ 300 KB gz | automated | `cd G:/01_OPUS/Projects/mcp-poc && npm run build:widgets && npm run check:bundle-size` | ✓ (Phase 18 script) | ⬜ pending |
| TBD | 03 | 2 | PORT-04 | — | Zero TS diff in PORTAL | git | `cd G:/01_OPUS/Projects/PORTAL && git diff --stat src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` returns empty | — (git-level) | ⬜ pending |
| TBD | 03 | 2 | PORT-02 | V4 Access Control | Sandbox-proxy relay intact | grep | `grep -c 'kmn/theme/' G:/01_OPUS/Projects/PORTAL/public/sandbox-proxy.html` ≥ 2 | ✓ (Phase 18) | ⬜ pending |
| TBD | 03 | 2 | WIDG-QA-01 | — | ≤ 2s first paint | manual UAT | PerformanceObserver on staging.portal.kamanin.at/umsatz-intelligenz | — (manual) | ⬜ pending |
| TBD | 03 | 2 | WIDG-QA-02 | — | -85% bug non-reproducible | manual UAT | 4 clock-time reloads on staging (09:00/11:00/14:00/17:00), inspect pace indicator | — (manual) | ⬜ pending |
| TBD | 03 | 2 | PORT-03 | — | Theme publisher survives remount | manual UAT | Navigate `/umsatz-intelligenz` → `/tickets` → back; DevTools postMessage log shows `kmn/theme/set` twice | — (manual) | ⬜ pending |
| TBD | 03 | 2 | PORT-05 | V7 Error Handling | McpErrorBoundary renders German error + reload | manual UAT | Force-throw widget; visual inspect German error screen | — (manual) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `widgets/daily-briefing/src/lib/__tests__/formatters.test.ts` — covers WIDG-STRUCT-05 (formatCurrency, formatPercent, formatPP, formatDate, negative/zero edges)
- [ ] `widgets/daily-briefing/src/lib/__tests__/fixtures.test.ts` — covers WIDG-STRUCT-04 (getFixtureMode + getFixturePayload for all 3 basket modes + error path)
- [ ] `widgets/daily-briefing/src/blocks/__tests__/HeuteBlock.test.tsx` — covers WIDG-BLOCK-01 + WIDG-BLOCK-05 (healthy + error + confidence=low + attention sub-section)
- [ ] `widgets/daily-briefing/src/blocks/__tests__/HeatmapBlock.test.tsx` — covers WIDG-BLOCK-02 (168-cell render + best-slot callout + error variant)
- [ ] `widgets/daily-briefing/src/blocks/__tests__/RepeatBlock.test.tsx` — covers WIDG-BLOCK-03 (rate + benchmark + median + error variant)
- [ ] `widgets/daily-briefing/src/blocks/__tests__/BasketOrAovBlock.test.tsx` — covers WIDG-BLOCK-04 (market_basket_product + market_basket_category + aov_bands + error variant)
- [ ] Extend `vitest.config.ts` `environmentMatchGlobs` to include `widgets/daily-briefing/src/blocks/**/*.{test,spec}.{ts,tsx}` under jsdom
- [ ] `vi.mock('motion/react', ...)` or `matchMedia` stub helper — forces `useReducedMotion()` → true in block tests (mitigates Motion-inline-style snapshot flake per Research Pitfall 7)
- [ ] `scripts/check-german-only.mjs` (mcp-poc) — greps built `dist/widgets/daily-briefing.html` for an English-word blacklist (`Loading`, `Error`, `Details`, `Submit`, `Cancel`, `Retry`, `Close`) — fails CI on any match; covers WIDG-QA-04

**No framework install needed** — vitest + @testing-library/react + jsdom already shipped in mcp-poc devDependencies (Phase 18).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First-paint ≤ 2s | WIDG-QA-01 | PerformanceObserver baseline requires real network + Vercel + mcp-proxy EF + WP bridge round-trip; not reproducible in unit tests | 1. Open staging.portal.kamanin.at/umsatz-intelligenz as MBM user, DevTools Performance tab active; 2. Start recording, hard-reload; 3. Measure from `daily_briefing` tool-call start to final block `onSizeChanged`; 4. Budget ≤ 2000ms. Repeat 3 times, report median. |
| -85% bug non-reproducibility | WIDG-QA-02 | Bug manifested at specific wall-clock times (09:00, 11:00, 14:00, 17:00) with real time-of-day logic; requires DDEV or staging clock | 1. Summerfield DDEV seeded + reachable; 2. On staging at 09:00 Europe/Vienna, hard-reload `/umsatz-intelligenz`, screenshot pace indicator; 3. Repeat at 11:00, 14:00, 17:00 same seeded day; 4. VERIFY: no render shows universally-negative pace indicator (the bug signature). |
| Theme publisher survives remount | PORT-03 | Requires DOM mount/unmount cycle + postMessage log; easier in browser than JSDOM | 1. Open DevTools → Network → WS/postMessage filter; 2. Navigate to `/umsatz-intelligenz` — expect `kmn/theme/set` message; 3. Navigate away (`/tickets`), then back — expect a SECOND `kmn/theme/set`; 4. Repeat 2× more. Widget re-renders cleanly each time. |
| McpErrorBoundary catches widget throw + renders German reload UI | PORT-05 | Requires forced-throw inside widget iframe; simpler as live manual test than mocked | 1. Temporarily add `throw new Error('test')` to widget `App.tsx` render path; 2. Build + deploy to staging; 3. Open `/umsatz-intelligenz`; 4. VERIFY: error screen shows German copy + "Neu laden" reload button; 5. Click reload — page reloads cleanly. Revert the throw and redeploy. |
| Period-toggle wiring end-to-end | WIDG-BLOCK-02 (D-19-05) | `app.callServerTool` depends on live MCP App harness; unit tests mock the bridge | 1. On staging, open `/umsatz-intelligenz`; 2. Click `[4 Wochen]` — verify heatmap block dims 60% + re-renders with 4-week data only (sibling blocks unchanged); 3. Click `[12 Wochen]` — re-render; 4. Click `[8 Wochen]` — re-render. DevTools Network tab shows 3 `mcp-proxy` POSTs, each with `{name:'weekly_heatmap', arguments:{weeks: N}}`. |

---

## Security Domain

### Applicable ASVS Categories

Sourced from RESEARCH.md §Security Domain:

| ASVS Category | Applies | Standard Control | Phase 19 Action |
|---------------|---------|-----------------|-----------------|
| V4 Access Control | yes | `mcp-proxy` EF enforces `ALLOWED_TOOLS` whitelist (Phase 17: `weekly_heatmap` already whitelisted line 145) | Verify intact via grep — no change needed |
| V5 Input Validation | yes | `getFixtureMode()` narrow union; `isBriefingPayload` runtime guard | Extend guards to v2 `BriefingPayload` shape in `lib/types.ts` |
| V7 Error Handling | yes | Per-block `status:'error'` → generic "Daten nicht verfügbar"; `McpErrorBoundary` wraps AppRenderer | Verify no stack-trace leak in block skeletons (`Daten nicht verfügbar` is hardcoded, not error.message) |
| V8 Data Protection | partial | Phase 17 server already minimizes `customer_name` to `"Anna M."` style | Widget just renders — no additional minimization needed; spot-check via dev harness |
| V14 Configuration | yes | Iframe sandbox: `allow-scripts allow-forms` (no `allow-same-origin`) | Verify intact in `public/sandbox-proxy.html` and AppRenderer `iframeSandbox` prop |

### Per-Threat Test Coverage

| Threat | Severity | Test | Automated Command |
|--------|----------|------|-------------------|
| Widget invokes non-whitelisted tool | medium | Contract — widget only uses `daily_briefing` + `weekly_heatmap` | `grep -c 'callServerTool' widgets/daily-briefing/src/` — count matches expected (~2-3); manual review each call-site for tool name |
| Malicious CSS in theme tokens | low | Phase 18 `SAFE_VALUE` regex in `useHostTokens` | Covered by Phase 18 tests — verify intact: `cd mcp-poc && npm run test:run -- widgets/shared/hooks/__tests__/useHostTokens` |
| Non-http admin deep-link | low | `handleOpenLink` rejects in PORTAL (Phase 17) | Widget-side: verify attention-list only ever builds https URLs via template |
| Period-toggle spam | low | D-19-05: toggle disabled during `loading:true` | Render test: toggle button has `disabled={loading}` prop |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify OR Wave 0 dependencies (planner fills table above)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify (planner's responsibility during PLAN.md writing)
- [ ] Wave 0 covers all MISSING references (9 Wave 0 gaps listed above; planner schedules them as Wave 0 tasks)
- [ ] No watch-mode flags (`--watch` forbidden in automated commands — only `test:run`)
- [ ] Feedback latency < 90 seconds (quick ≤ 30s, full ≤ 90s)
- [ ] `nyquist_compliant: true` set in frontmatter after planner fills the Per-Task Verification Map

**Approval:** pending
