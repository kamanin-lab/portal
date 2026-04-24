---
phase: 18-mcp-ui-resource-build-pipeline
plan: 04
subsystem: PORTAL/revenue-intelligence
tags: [portal, postMessage, theme-bridge, contract-test, sandbox-proxy]
dependency_graph:
  requires:
    - 18-02 (per-widget dirs + shared vite.base in mcp-poc)
    - 18-03 (mcp-poc widget-tokens.ts + useHostTokens hook landed — commit f778f32)
  provides:
    - "PORTAL/src/shared/styles/widget-tokens.ts — canonical 12-key token dictionary for PORTAL host"
    - "PORTAL/src/shared/styles/__tests__/widget-tokens.contract.test.ts — drift detector (twin of mcp-poc test)"
    - "PORTAL/src/modules/revenue-intelligence/hooks/useThemePublisher.ts — host-side kmn/theme/request responder + MutationObserver re-emit"
    - "PORTAL/public/sandbox-proxy.html — kmn/theme/* prefix relay block (MCPAPP-TOKEN-02)"
    - "PORTAL/src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx — hook wire-up (+2 lines)"
  affects:
    - Phase 19 v2 widget will receive kmn/theme/set from this publisher on mount
    - PORT-02 (sandbox-proxy relay present) — now grep-provable
    - PORT-03 (multi-mount survival) — listener + observer scoped to component lifecycle, survives mount/unmount
    - PORT-04 (zero-diff baseline) — measured from end-of-Phase-18 (including these +2 lines in RevenueIntelligencePage.tsx), NOT from current main
tech_stack:
  added: []
  patterns:
    - "useMemo-stabilized hook return (ADR-034 + feedback_react_hook_identity_churn)"
    - "targetOrigin '*' for sandbox-proxy srcdoc (origin=null per Pitfall 4)"
    - "MutationObserver scoped to <html> attributes only (class/data-theme/style)"
    - "Early-return prefix dispatch BEFORE AppBridge gate (duplicate-with-comment pattern)"
    - "Twin contract test (cross-repo byte-identity below header)"
key_files:
  created:
    - "G:/01_OPUS/Projects/PORTAL/src/shared/styles/widget-tokens.ts"
    - "G:/01_OPUS/Projects/PORTAL/src/shared/styles/__tests__/widget-tokens.contract.test.ts"
    - "G:/01_OPUS/Projects/PORTAL/src/modules/revenue-intelligence/hooks/useThemePublisher.ts"
  modified:
    - "G:/01_OPUS/Projects/PORTAL/src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx (+2 lines)"
    - "G:/01_OPUS/Projects/PORTAL/public/sandbox-proxy.html (+14 lines — kmn/theme/* relay block)"
decisions:
  - "RevenueIntelligencePage.tsx diff = exactly +2 lines (1 import + 1 hook call); zero JSX change preserves the PORT-04 zero-diff bar for Phase 19 measurement."
  - "Dropped unused WIDGET_TOKENS import from useThemePublisher.ts per plan note — canonical body in <interfaces> imports both WIDGET_TOKENS and readCurrentTokens but only uses readCurrentTokens; the plan action explicitly directed dropping WIDGET_TOKENS to avoid unused-import lint."
  - "Pre-existing 14 test failures (stashed-test verification) in task-list-utils / ticket comments / overview-interpretation suites unchanged by this plan — out-of-scope per CLAUDE.md scope-boundary rule."
  - "Byte-identity verified via `diff <(tail -n +2 PORTAL-twin) <(tail -n +2 mcp-poc-twin)` — both widget-tokens.ts AND contract test identical below header line."
metrics:
  duration_minutes: "~5"
  tasks_completed: 3
  files_created: 3
  files_modified: 2
  commits: 3
  completed: "2026-04-24"
---

# Phase 18 Plan 04: PORTAL-side Token Bridge Summary

PORTAL host side of the D-18-03 cross-repo token bridge: canonical 12-token `widget-tokens.ts` (twin of mcp-poc), `useThemePublisher` hook (postMessage responder + MutationObserver re-emit), and `sandbox-proxy.html` `kmn/theme/*` relay block. The bridge round-trip widget→sandbox-proxy→PORTAL→sandbox-proxy→widget is now code-complete on both sides; Plan 18-05 harness will validate behaviorally.

## What Was Built

**Task 1 — PORTAL widget-tokens.ts + contract test** (commit `d3394ea`):
- `src/shared/styles/widget-tokens.ts` — 12-key frozen dictionary + `DEFAULT_TOKEN_VALUES` + `readCurrentTokens()`. Header: `// KEEP IN SYNC WITH mcp-poc/widgets/shared/widget-tokens.ts`. Body below header byte-identical to mcp-poc twin (`diff` empty).
- `src/shared/styles/__tests__/widget-tokens.contract.test.ts` — twin drift detector; asserts `Object.keys(WIDGET_TOKENS).sort() === FROZEN_KEYS.sort()` and every value matches `/^--[a-z0-9-]+$/`. Byte-identical below import line with mcp-poc twin.
- Vitest auto-discovers via `include: ['src/**/*.{test,spec}.{ts,tsx}']`. 2/2 new tests pass.

**Task 2 — useThemePublisher hook** (commit `2d5b55a`):
- `src/modules/revenue-intelligence/hooks/useThemePublisher.ts` (64 LOC).
- Listens for `kmn/theme/request`, validates `type` and numeric `protocolVersion`.
- Rejects `protocolVersion > 1` with `console.warn('[kmn-theme] widget protocolVersion=… > portal=1 — ignoring')` (MCPAPP-TOKEN-08).
- Replies via `(e.source as Window)?.postMessage({ type: 'kmn/theme/set', protocolVersion: 1, tokens: readCurrentTokens() }, '*')`. `'*'` chosen because sandbox-proxy srcdoc has `origin=null` (Pitfall 4) — origin gate lives on the sandbox-proxy side.
- `MutationObserver` on `document.documentElement` with `attributeFilter: ['class', 'data-theme', 'style']` — re-emits to all iframes on any theme-driving attribute change (MCPAPP-TOKEN-06 + D-18-05). Portal has no dark mode yet; observer sits idle until a future toggle.
- Returns `useMemo(() => ({ protocolVersion: PROTOCOL_VERSION }), [])` — stable identity per ADR-034 + `feedback_react_hook_identity_churn`.
- No `getComputedStyle` (design-doc §6b rejection — prevents leaking 120+ portal tokens; only the curated 12 ship).

**Task 3 — Wire-up** (commit `3cdcc1d`):
- `RevenueIntelligencePage.tsx` diff = **exactly +2 lines**:
  1. `import { useThemePublisher } from '../hooks/useThemePublisher'` (line 12)
  2. `useThemePublisher()` after `useMcpProxy()` destructure (line 22)
- `public/sandbox-proxy.html` — inserted 14-line `kmn/theme/*` prefix relay block inside the existing message handler (line 67-80), **before** the AppBridge source-identity gate. Grep-able via `kmn/theme/` and `MCPAPP-TOKEN-02`. Early-return keeps existing AppBridge branch untouched.
- Production build (`npm run build`) exits 0.

## API Surface

```ts
// src/modules/revenue-intelligence/hooks/useThemePublisher.ts
export function useThemePublisher(): {
  protocolVersion: 1    // useMemo-stabilized; side-effect-only hook
}
```

Side effects (scoped to component mount/unmount):
- `window.addEventListener('message', onMessage)` — handles `kmn/theme/request`
- `MutationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] })` — re-emits `kmn/theme/set` to all iframes on theme changes
- Cleanup: `removeEventListener` + `observer.disconnect()`

## Protocol Invariants Preserved

- `PROTOCOL_VERSION = 1 as const` (locked — matches mcp-poc `types.ts`)
- 12 frozen tokens (byte-identical across both repos, drift-tested on both sides)
- `targetOrigin: '*'` for widget replies (sandbox-proxy srcdoc origin=null)
- Host rejects `protocolVersion > 1` with console.warn; does not crash or speak higher versions
- MutationObserver scoped narrowly (3 attributes on `<html>`); no animation-frame DDoS risk
- Hook return is useMemo-stabilized — safe for downstream effect deps

## Cross-Repo Byte-Identity Verification

```bash
$ diff <(tail -n +2 PORTAL/src/shared/styles/widget-tokens.ts) \
       <(tail -n +2 mcp-poc/widgets/shared/widget-tokens.ts)
(empty — byte-identical below header) ✓

$ diff <(tail -n +2 PORTAL/src/shared/styles/__tests__/widget-tokens.contract.test.ts) \
       <(tail -n +2 mcp-poc/widgets/shared/__tests__/widget-tokens.contract.test.ts)
(empty — byte-identical below line-1 sync comment) ✓
```

## Contract Test Results

```
$ npm run test -- --run src/shared/styles

 ✓ src/shared/styles/__tests__/widget-tokens.contract.test.ts  (2 tests)

 Test Files  1 passed (1)
      Tests  2 passed (2)
```

## sandbox-proxy.html Relay Block Location

Inserted at lines **66-80** of `public/sandbox-proxy.html` (inside `function relay(e)`, after the `!e.data` guard, before the existing `if (e.source === inner.contentWindow)` branch).

```javascript
if (typeof e.data.type === 'string' && e.data.type.indexOf('kmn/theme/') === 0) {
  if (e.source === inner.contentWindow) {
    // widget → host
    window.parent.postMessage(e.data, selfOrigin);
  } else if (e.source === window.parent && e.origin === selfOrigin) {
    // host → widget
    if (inner.contentWindow) inner.contentWindow.postMessage(e.data, '*');
  }
  return;
}
```

Existing AppBridge path (inner→host, host→inner) is byte-identical to pre-edit state.

## Token Bridge Round-Trip (now code-complete on both sides)

1. Widget mounts (mcp-poc iframe) → `useHostTokens` posts `{type:'kmn/theme/request', protocolVersion:1}` via `window.parent.postMessage('*')`.
2. Message reaches sandbox-proxy inner iframe source. Sandbox-proxy relay block matches `kmn/theme/` prefix → forwards to `window.parent` (PORTAL) with `selfOrigin`.
3. PORTAL `useThemePublisher.onMessage` receives `kmn/theme/request`, validates, replies to `e.source` with `{type:'kmn/theme/set', protocolVersion:1, tokens: DEFAULT_TOKEN_VALUES}`.
4. Message lands in sandbox-proxy outer window. Relay block matches `kmn/theme/` prefix → forwards to `inner.contentWindow.postMessage('*')`.
5. Widget's `useHostTokens` listener receives `kmn/theme/set`, validates, applies all 12 tokens via `document.documentElement.style.setProperty(...)` (with SAFE_VALUE regex gate).

Fallback: if step 3-5 don't deliver within 300ms, widget's `useHostTokens` applies `DEFAULT_TOKEN_VALUES` locally (MCPAPP-TOKEN-05).

## PORT-02, PORT-03 Acceptance Mapping

**PORT-02 (sandbox-proxy kmn/theme/* relay present)** — PROVABLE now:
```bash
grep -n "kmn/theme/" public/sandbox-proxy.html
# returns lines 67-69 ✓
grep -n "MCPAPP-TOKEN-02" public/sandbox-proxy.html
# returns line 65 ✓
```

**PORT-03 (listener survives multi-mount cycles)** — PROVABLE via code inspection:
- `useEffect(..., [])` with empty dep array — setup runs once per mount.
- Cleanup function (`removeEventListener` + `observer.disconnect()`) runs on every unmount.
- No module-level listeners; all lifecycle is component-scoped. Next mount re-installs fresh handlers. No leaks, no double-fires.

Phase 18-05 harness will add the behavioral validation that closes both requirements definitively.

## PORT-04 Zero-Diff Baseline Note

PORT-04 measures: "after Phase 19 lands v2 widget blocks, the delta vs end-of-Phase-18 in PORTAL is ≤ 0 lines in widget-adjacent files other than explicit widget mount points." The +2 lines added to `RevenueIntelligencePage.tsx` here (the import + hook call) are the **only** PORTAL-side widget-related changes between now and Phase 19's start. Any future Phase 19 diff should be measured against **this commit's** `RevenueIntelligencePage.tsx`, not pre-Phase-18. Tracked in 18-RESEARCH §Pattern 5 closing note.

## Commits (PORTAL/staging)

| Task | Commit | Message |
|------|--------|---------|
| 1 | `d3394ea` | `feat(18-04): PORTAL src/shared/styles/widget-tokens.ts + contract test (D-18-03 PORTAL side)` |
| 2 | `2d5b55a` | `feat(18-04): useThemePublisher.ts — host-side postMessage responder + MutationObserver re-emit` |
| 3 | `3cdcc1d` | `feat(18-04): wire useThemePublisher into RevenueIntelligencePage + sandbox-proxy kmn/theme relay` |

## Deviations from Plan

None material. Two small clarifications:

1. **Unused-import drop** — Canonical body in `<interfaces>` imported `{ WIDGET_TOKENS, readCurrentTokens }` but only used `readCurrentTokens`. Plan action explicitly directed dropping `WIDGET_TOKENS` to avoid unused-import lint. Final import line: `import { readCurrentTokens } from '@/shared/styles/widget-tokens'`. Matches plan directive, not the literal interfaces snippet.

2. **Full PORTAL test-suite state** — `npm run test -- --run` exits with 14 pre-existing test failures across `task-list-utils`, ticket comments, and overview-interpretation suites. Verified these are **not** introduced by this plan by stashing all changes and re-running: same 14 failures, same suites. These failures are out-of-scope per CLAUDE.md scope-boundary rule and are logged for a future hardening pass. Contract tests (the only tests this plan adds) pass 2/2.

## Deferred Items

- **Pre-existing 14 test failures** in PORTAL vitest suite (`task-list-utils`, ticket comments, `overview-interpretation`). Not introduced by this plan (stashed-test verified). Not in scope. Flagged for a future hardening pass.
- **`npm run test:coverage` run** — Skipped because 14 pre-existing test failures would cause it to exit non-zero regardless of this plan's changes. The files added by this plan (`widget-tokens.ts`, contract test, `useThemePublisher.ts`) are already excluded from the coverage `include` glob (coverage targets `src/modules/tickets/lib/**`, `src/modules/projects/lib/**`, `src/shared/lib/**` only). No coverage-threshold regression is possible from this plan.

## Known Stubs

None. All new code is production-path; no placeholder rendering, no hardcoded empty data flow.

## Self-Check

Verified all 3 created files + 2 modified files present at declared paths:
- `G:/01_OPUS/Projects/PORTAL/src/shared/styles/widget-tokens.ts` ✓
- `G:/01_OPUS/Projects/PORTAL/src/shared/styles/__tests__/widget-tokens.contract.test.ts` ✓
- `G:/01_OPUS/Projects/PORTAL/src/modules/revenue-intelligence/hooks/useThemePublisher.ts` ✓
- `G:/01_OPUS/Projects/PORTAL/src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` (modified, +2 lines) ✓
- `G:/01_OPUS/Projects/PORTAL/public/sandbox-proxy.html` (modified, +14 lines) ✓

Verified all 3 commits exist on PORTAL `staging`: `d3394ea`, `2d5b55a`, `3cdcc1d` ✓
Verified contract test: 2/2 passing ✓
Verified production build: exits 0 ✓
Verified byte-identity vs mcp-poc twins: both `diff`s empty below header ✓
Verified diff size discipline: RevenueIntelligencePage.tsx = exactly +2 lines ✓
Verified `getComputedStyle` NOT used in useThemePublisher.ts (design §6b): grep returns nothing ✓

## Self-Check: PASSED
