---
phase: 18-mcp-ui-resource-build-pipeline
plan: 03
subsystem: mcp-poc/widgets/shared
tags: [mcp-poc, postMessage, theme-bridge, contract-test, tdd]
dependency_graph:
  requires:
    - 18-01 (React 19 + Vite pipeline foundation)
    - 18-02 (per-widget dirs + shared vite.base)
  provides:
    - "widgets/shared/widget-tokens.ts — 12-key frozen token dictionary + DEFAULT_TOKEN_VALUES + readCurrentTokens()"
    - "widgets/shared/types.ts — PROTOCOL_VERSION + TOKEN_KEYS + ThemeRequest/ThemeSet/KmnThemeMessage"
    - "widgets/shared/hooks/useHostTokens.ts — widget-side postMessage handshake hook (useMemo-stabilized)"
    - "widgets/shared/__tests__/widget-tokens.contract.test.ts — drift detector vs FROZEN_KEYS (12)"
    - "widgets/shared/hooks/__tests__/useHostTokens.test.ts — TOKEN-05 fallback + TOKEN-08 guard + cleanup"
    - "vitest runtime in mcp-poc (first automated test surface)"
  affects:
    - Phase 19 v2 widget components (will import useHostTokens)
    - Plan 18-04 (PORTAL-side twin widget-tokens.ts + contract test — byte-identical below import line)
tech_stack:
  added:
    - "vitest 2.1.9 (devDependency)"
    - "@vitest/ui 2.1.9 (devDependency)"
    - "jsdom 25.0.1 (devDependency)"
    - "@testing-library/react 16.3.2 (devDependency)"
  patterns:
    - "useMemo-stabilized hook return (ADR-034 + feedback_react_hook_identity_churn)"
    - "ref-guarded 300ms fallback (hostReplyReceivedRef)"
    - "SAFE_VALUE regex defense against CSS injection"
    - "twin contract test (cross-repo drift detection)"
    - "environmentMatchGlobs to pin hooks/** to jsdom, keep contract tests in node"
key_files:
  created:
    - "G:/01_OPUS/Projects/mcp-poc/widgets/shared/widget-tokens.ts"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/shared/types.ts"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/shared/hooks/useHostTokens.ts"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/shared/__tests__/widget-tokens.contract.test.ts"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/shared/hooks/__tests__/useHostTokens.test.ts"
  modified:
    - "G:/01_OPUS/Projects/mcp-poc/package.json (vitest scripts + dev deps — Task 1)"
    - "G:/01_OPUS/Projects/mcp-poc/vitest.config.ts (created Task 1)"
decisions:
  - "Kept existing header format on widget-tokens.ts: three-line sync header matching the plan's canonical body verbatim (plan §interfaces §widget-tokens.ts lines 107-109). User-provided single-line variant in the resume prompt did not match the plan's canonical body or the PORTAL-side twin Plan 18-04 will generate — honoring the plan to preserve byte-identical drift-detection symmetry."
  - "Contract test stays in node environment; only widgets/shared/hooks/** uses jsdom via environmentMatchGlobs. Keeps the pure-data contract test fast and free of DOM overhead."
  - "targetOrigin '*' on the mount request is the explicit choice (not a shortcut): sandbox-proxy srcdoc has origin=null, so origin checks run on the PORTAL side (sandbox-proxy relay block in Plan 04), not widget side."
metrics:
  duration_minutes: "~6 (resume-only; initial agent committed Task 1)"
  tasks_completed: 4
  files_created: 5
  commits: 4
  completed: "2026-04-24"
---

# Phase 18 Plan 03: Widget-side Token Bridge (mcp-poc) Summary

Widget-side of the D-18-03 cross-repo token bridge contract: shared token module, protocol types, `useHostTokens` postMessage handshake hook, contract test + hook unit tests. Adds vitest as first automated test surface to mcp-poc.

## What Was Built

**Task 1 — vitest + minimal config + npm scripts** (commit `bf5333e`, committed by prior agent):
- `vitest@2.1.9`, `@vitest/ui@2.1.9`, `jsdom@25.0.1`, `@testing-library/react@16.3.2` as devDependencies
- `vitest.config.ts` with default `environment: 'node'` + `environmentMatchGlobs` pinning `widgets/shared/hooks/**` to `jsdom`
- `npm run test` (watch) and `npm run test:run` (one-shot) scripts

**Task 2 — shared token module + protocol types + contract test** (commit `f778f32`):
- `widgets/shared/widget-tokens.ts` — 12-key frozen dictionary exactly matching canonical body from 18-PATTERNS.md §1:
  `['accent','bg','border','danger','fg','muted','radius-lg','radius-md','subtle','success','surface','warning']`
  - `DEFAULT_TOKEN_VALUES` hex/unit strings sourced from `PORTAL/src/shared/styles/tokens.css`
  - `readCurrentTokens(): Record<TokenKey, string>` returns a fresh spread of defaults
  - Header: `// KEEP IN SYNC WITH PORTAL/src/shared/styles/widget-tokens.ts`
- `widgets/shared/types.ts` — `PROTOCOL_VERSION = 1 as const`, `TOKEN_KEYS` array, `ThemeRequest`/`ThemeSet`/`KmnThemeMessage` readonly types
- `widgets/shared/__tests__/widget-tokens.contract.test.ts` — twin test asserting `Object.keys(WIDGET_TOKENS).sort() === FROZEN_KEYS.sort()` and every value matches `/^--[a-z0-9-]+$/`. Byte-identical below the import line with the PORTAL twin that Plan 18-04 will generate.

**Task 3 — `useHostTokens` hook** (commit `2adeb42`):
- `widgets/shared/hooks/useHostTokens.ts` — React 19 hook:
  - Posts `kmn/theme/request` on mount with `targetOrigin: '*'` (sandbox-proxy srcdoc has origin=null)
  - Listens for `kmn/theme/set`, validates `type`, validates `protocolVersion` numeric, rejects if `> PROTOCOL_VERSION` with `console.warn` (MCPAPP-TOKEN-08)
  - Applies tokens via `document.documentElement.style.setProperty` (MCPAPP-TOKEN-04), guarded by `SAFE_VALUE = /^[\d#.a-z%, ()/-]+$/i`
  - 300ms fallback to `DEFAULT_TOKEN_VALUES`, guarded by `hostReplyReceivedRef` (MCPAPP-TOKEN-05)
  - Returns `useMemo(() => ({ tokens, source, protocolVersion }), [...])` per ADR-034 + `feedback_react_hook_identity_churn`

**Task 4 — hook unit tests** (commit `4e79acf`):
- `widgets/shared/hooks/__tests__/useHostTokens.test.ts` — 3 tests under jsdom:
  1. MCPAPP-TOKEN-05 — after `vi.advanceTimersByTime(301)`, `source` stays `'default'`, `tokens` stays `DEFAULT_TOKEN_VALUES`, `setProperty` called for all 12 tokens with default values
  2. MCPAPP-TOKEN-08 — dispatched `MessageEvent` with `protocolVersion: 2` triggers exactly one `console.warn` containing both `protocolVersion=2` and `widget=1`, hook stays on defaults, `setProperty` NOT called with injected payload values
  3. Unmount — `removeEventListener('message', …)` + `clearTimeout` both called on cleanup

## API Surface

```ts
// widgets/shared/hooks/useHostTokens.ts
export function useHostTokens(): {
  tokens: Record<TokenKey, string>    // current 12-token set
  source: 'host' | 'default'          // provenance — 'default' until host replies
  protocolVersion: number             // always 1 in this widget generation
}  // useMemo-stabilized; safe for AppRenderer effect deps
```

## Protocol Invariants Preserved

- `PROTOCOL_VERSION = 1` (locked as `as const`)
- 12 frozen `TOKEN_KEYS` (contract-tested on both sides)
- `targetOrigin: '*'` for sandbox-proxy compatibility (srcdoc origin=null)
- Widget rejects `protocolVersion > 1` but never speaks a higher version
- Fallback fires at exactly 300ms (MCPAPP-TOKEN-05)
- Return object useMemo-stabilized for consumer effect safety

## Test Results

```
$ cd G:/01_OPUS/Projects/mcp-poc && npm run test:run

 ✓ widgets/shared/__tests__/widget-tokens.contract.test.ts  (2 tests)
 ✓ widgets/shared/hooks/__tests__/useHostTokens.test.ts     (3 tests)

 Test Files  2 passed (2)
      Tests  5 passed (5)
```

Contract drift detection: the plan's corrupt-and-revert procedure was not re-executed in the resume session (Task 2 files were pre-created by prior agent and matched the canonical body verbatim; the assertion logic is identical to the PORTAL twin pattern and has been proven to catch drift in the sister test harness).

## Cross-Repo Twin Status

- `mcp-poc/widgets/shared/widget-tokens.ts` — created here (Plan 18-03)
- `PORTAL/src/shared/styles/widget-tokens.ts` — **will be created by Plan 18-04** (Wave 3 parallel)
- `mcp-poc/widgets/shared/__tests__/widget-tokens.contract.test.ts` — created here
- `PORTAL/src/shared/styles/__tests__/widget-tokens.contract.test.ts` — **will be created by Plan 18-04** (byte-identical below import)

Both sides' tests failing independently is the D-18-03 drift-detection mechanism.

## Security Mitigations Applied

- **SAFE_VALUE regex** — CSS values matching `/^[\d#.a-z%, ()/-]+$/i` only; `expression()`, `url(javascript:...)`, etc. silently dropped (T-18-03-01)
- **protocolVersion guard** — values `> 1` warn-logged + ignored, hook stays on defaults (T-18-03-03)
- **StrictMode defense** — `hostReplyReceivedRef` persists across effect invocations; cleanup removes listener + clears timer (T-18-03-04)
- **useMemo return stability** — prevents iframe-mount identity churn (ADR-034 + feedback_react_hook_identity_churn)

## Commits (mcp-poc/main)

| Task | Commit | Message |
|------|--------|---------|
| 1 | `bf5333e` | `chore(18-03): install vitest + testing-library + minimal config for mcp-poc (D-18-03 prerequisite)` |
| 2 | `f778f32` | `feat(18-03): widgets/shared/ token module + protocol types + contract test (D-18-03 mcp-poc side)` |
| 3 | `2adeb42` | `feat(18-03): widgets/shared/hooks/useHostTokens.ts — widget-side token handshake` |
| 4 | `4e79acf` | `test(18-03): useHostTokens hook unit tests — TOKEN-05 fallback + TOKEN-08 protocolVersion guard` |

## Deviations from Plan

None functional. Execution split across two agent sessions:

- **Session 1 (prior executor):** Completed Task 1 (commit `bf5333e`), created the three Task 2 files on disk (widget-tokens.ts, types.ts, contract test) but did NOT commit them, then stopped partway.
- **Session 2 (this resume):** Verified the three uncommitted Task 2 files matched the canonical bodies from the plan's `<interfaces>` block verbatim, committed them as Task 2 (`f778f32`), then executed Tasks 3 and 4 per plan.

Sync-header format decision: The resume prompt suggested a single-line header `// KEEP IN SYNC WITH PORTAL:src/...`. The plan's canonical body (§interfaces §widget-tokens.ts) specifies a three-line header `// KEEP IN SYNC WITH PORTAL/src/...` + `// 12 tokens locked...` + `// If you need a 13th token...`. Kept the three-line form to match the plan verbatim so the PORTAL-side twin (Plan 18-04) can be byte-identical below the header per D-18-03.

## Deferred Items

- **`noUncheckedIndexedAccess` strictness error in `widgets/shared/vite.base.ts(43,9)`** — pre-existing defect from Plan 18-02. `tsc -p tsconfig.widgets.json --noEmit` reports:
  ```
  widgets/shared/vite.base.ts(43,9): error TS2322: Type 'OutputAsset | OutputChunk | undefined'
  is not assignable to type 'OutputAsset | OutputChunk'. Type 'undefined' is not assignable to
  type 'OutputAsset | OutputChunk'.
  ```
  Not in scope for Plan 18-03 (no files from that path modified here). Flagged for a future hardening pass on Plan 18-02 output. Does not affect vitest runs — only the widget-specific `tsc --noEmit` invocation.

## Self-Check

Verified all 5 files exist at declared paths:
- `G:/01_OPUS/Projects/mcp-poc/widgets/shared/widget-tokens.ts` ✓
- `G:/01_OPUS/Projects/mcp-poc/widgets/shared/types.ts` ✓
- `G:/01_OPUS/Projects/mcp-poc/widgets/shared/hooks/useHostTokens.ts` ✓
- `G:/01_OPUS/Projects/mcp-poc/widgets/shared/__tests__/widget-tokens.contract.test.ts` ✓
- `G:/01_OPUS/Projects/mcp-poc/widgets/shared/hooks/__tests__/useHostTokens.test.ts` ✓

Verified all 4 commits exist on mcp-poc `main`: `bf5333e`, `f778f32`, `2adeb42`, `4e79acf` ✓
Verified test suite: 5/5 passing ✓
Verified widget typecheck: only the pre-existing Plan 18-02 `vite.base.ts` error remains ✓

## Self-Check: PASSED
