---
phase: 18
slug: mcp-ui-resource-build-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-24
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. The planner will populate the Per-Task Verification Map once PLAN.md files are created; RESEARCH.md §Validation Architecture enumerates the observable dimensions.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (PORTAL: existing v1.x setup; mcp-poc: Wave 0 install) |
| **Config file** | `vitest.config.ts` (PORTAL existing) / `vitest.config.ts` (mcp-poc Wave 0) |
| **Quick run command** | `npm run test -- --run` (per repo) |
| **Full suite command** | `npm run test:coverage` (PORTAL) / `npm run test -- --run` (mcp-poc) |
| **Estimated runtime** | PORTAL ~20s / mcp-poc <5s |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run` in the affected repo
- **After every plan wave:** Run full suite in both repos touched by the wave
- **Before `/gsd-verify-work`:** Both suites green + build-widget smoke passes + bundle-size assertion passes
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Populated by planner after PLAN.md files are produced. Below is a skeleton tied to the observable dimensions from RESEARCH.md §Validation Architecture.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-XX | 01 | 1 | MCPAPP-BUILD-07 | — | React 19 resolves in mcp-poc type-check | type | `npx tsc --noEmit -p tsconfig.widgets.json` | ❌ W0 | ⬜ pending |
| 18-02-XX | 02 | 2 | MCPAPP-BUILD-01,02,03 | — | `dist/widgets/<name>.html` produced per widget dir | cli | `npm run build && ls dist/widgets/*.html` | ❌ W0 | ⬜ pending |
| 18-02-XX | 02 | 2 | MCPAPP-BUILD-04 | — | gzip ≤ 300 KB per widget artifact | cli | `gzip -c dist/widgets/daily-briefing.html \| wc -c` | ❌ W0 | ⬜ pending |
| 18-03-XX | 03 | 3 | MCPAPP-TOKEN-07 | — | `widget-tokens.ts` exports exactly 12 frozen keys (both repos) | unit | `vitest run widget-tokens.contract` | ❌ W0 | ⬜ pending |
| 18-03-XX | 03 | 3 | MCPAPP-TOKEN-01,02,05 | — | `useHostTokens` applies theme or falls back at 300ms | unit | `vitest run useHostTokens` | ❌ W0 | ⬜ pending |
| 18-04-XX | 04 | 3 | MCPAPP-TOKEN-03 | — | sandbox-proxy relays `kmn/theme/*` both directions | unit | `vitest run sandbox-proxy-relay` (or integration harness) | ❌ W0 | ⬜ pending |
| 18-04-XX | 04 | 3 | MCPAPP-TOKEN-06 | — | publisher re-emits on theme change; survives widget remount | unit | `vitest run useThemePublisher` | ❌ W0 | ⬜ pending |
| 18-04-XX | 04 | 3 | MCPAPP-TOKEN-08 | — | widget ignores `protocolVersion: 2`; logs warning | unit | `vitest run useHostTokens.protocol-version` | ❌ W0 | ⬜ pending |
| 18-05-XX | 05 | 4 | MCPAPP-BUILD-06 | — | dev harness responds on `:5174` with theme toggle + fixture modes | manual | see Manual-Only Verifications | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] mcp-poc: `npm i -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom` — vitest install (Plan 03 Wave 0 task)
- [ ] mcp-poc: `vitest.config.ts` — minimal config with `test.include: ['widgets/**/*.test.ts','widgets/**/*.test.tsx']`
- [ ] mcp-poc: `widgets/shared/__tests__/widget-tokens.contract.test.ts` — twin contract test stub
- [ ] PORTAL: `src/shared/styles/__tests__/widget-tokens.contract.test.ts` — twin contract test stub (new file)
- [ ] mcp-poc: `package.json` adds `"test": "vitest run"` script
- [ ] `scripts/check-widget-bundle-size.mjs` (in mcp-poc) — gzip assertion harness used by Plan 02/05

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dev harness renders at `http://localhost:5174` with theme toggle producing visible style change | MCPAPP-BUILD-06 | Requires live Vite dev server + browser; HMR verification needs human observation | `cd mcp-poc/widgets/daily-briefing && npm run dev` → open `localhost:5174` → click light/dark toggle → verify CSS vars change via DevTools computed styles |
| Standalone `dist/widgets/daily-briefing.html` renders offline (no parent frame) | MCPAPP-TOKEN-05 fallback | Bundled-defaults fallback only observable when no parent responds | `npm run build` → open `dist/widgets/daily-briefing.html` via `file://` → confirm component renders with default tokens after 300ms |
| Portal + sandbox-proxy end-to-end theme exchange (staging) | MCPAPP-TOKEN-01,02,03 integrated | Full roundtrip requires live PORTAL + deployed mcp-poc + browser DevTools | Deploy staging → open `staging.portal.kamanin.at/umsatz-intelligenz` → DevTools Network tab → verify `kmn/theme/request` → `kmn/theme/set` sequence → verify widget CSS vars match `documentElement` tokens |
| Preact/compat fallback docs are actionable | MCPAPP-BUILD-05 | Documentation-only in Phase 18; fallback never exercised | Human reads `mcp-poc/widgets/shared/PREACT_FALLBACK.md` → verifies switch procedure is complete (alias config + peer-dep pin + test run) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (mcp-poc vitest install + twin contract tests + bundle size script)
- [ ] No watch-mode flags (all commands use `--run` / one-shot equivalents)
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter once planner populates Per-Task Verification Map and checker signs off

**Approval:** pending
