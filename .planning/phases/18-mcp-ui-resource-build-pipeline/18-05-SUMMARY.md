---
phase: 18-mcp-ui-resource-build-pipeline
plan: 05
subsystem: widget-dev-harness
tags: [dev-harness, fixture-parser, bundle-budget, phase-close]
one_liner: "Dev harness with theme toggle + fixture dropdown + handshake log; fixtures.ts parser; dev:widget Vite script; end-of-phase bundle-size re-verification"
dependency_graph:
  requires:
    - 18-02   # per-widget Vite pipeline
    - 18-03   # widgets/shared/ + DEFAULT_TOKEN_VALUES
    - 18-04   # twin widget-tokens.ts in PORTAL + publisher
  provides:
    - "dev-harness:localhost:5174/dev-host.html (theme toggle + fixture dropdown + handshake log)"
    - "fixture-parser:widgets/daily-briefing/src/lib/fixtures.ts"
    - "npm-script:dev:widget"
  affects:
    - mcp-poc/widgets/daily-briefing/dev-host.html (new)
    - mcp-poc/widgets/daily-briefing/src/lib/fixtures.ts (new)
    - mcp-poc/package.json (scripts block)
tech_stack:
  added: []
  patterns:
    - "dev harness uses iframe + postMessage (mock-host inverse of sandbox-proxy relay)"
    - "URL-param parser uses narrow union return type as security gate (T-18-05-01 mitigation)"
    - "Vite dev --open auto-routes to dev-host.html for instant dev loop"
key_files:
  created:
    - "mcp-poc:widgets/daily-briefing/dev-host.html"
    - "mcp-poc:widgets/daily-briefing/src/lib/fixtures.ts"
  modified:
    - "mcp-poc:package.json"
decisions:
  - "D-18-04 full-scope harness honored: theme toggle + fixture dropdown + handshake log + auto-responder all shipped in one file"
  - "fixtures.ts placed at widgets/daily-briefing/src/lib/ per 18-PATTERNS §8 (not at widgets/shared/) — parser is widget-local, Phase 19 block code imports from within same widget dir"
  - "dev-host.html imports ../shared/widget-tokens.ts directly (Vite dev transforms TS); documented as NOT file://-compatible in file header comments"
metrics:
  duration: "~10 min"
  completed: "2026-04-24"
  commits: 1
  files_changed: 3
  lines_added: 106
---

# Phase 18 Plan 05: Dev Harness + Fixture Parser + End-of-Phase Bundle Re-Verification

## Summary

Closed Phase 18 with the developer loop and bundle budget re-verification. Shipped a full-scope dev harness at `http://localhost:5174/dev-host.html` that gives Phase 19 contributors a no-parent-required iteration surface for block components: theme toggle sends `kmn/theme/set` payloads, fixture dropdown reloads the widget iframe with `?mock=*` URL param, and a visible handshake log removes the need for DevTools postMessage archaeology. The `getFixtureMode()` parser is shipped alongside the harness with a whitelist-only return type so Phase 19 block code can consume it safely from day one. Bundle size re-check passed with comfortable headroom (~50% of 300 KB gz budget spent for v1 widgets).

## What Was Built

### 1. `widgets/daily-briefing/dev-host.html` (new)

Full-scope dev harness per D-18-04:

- **Theme toggle UI** — two buttons: `Hell` (DEFAULT_TOKEN_VALUES), `Dunkel (Platzhalter)` (DARK_MOCK with 6 dark overrides: bg, surface, fg, muted, subtle, border). Each click posts `kmn/theme/set` with `protocolVersion: 1` and full 12-token payload to the widget iframe via `contentWindow.postMessage`.
- **Fixture-mode dropdown** — three options: `Basis-Fixture` (empty), `?mock=basket-aov`, `?mock=one-block-failing`. On change, reloads widget iframe by assigning `widget.src = './index.html?mock=<mode>'`.
- **Handshake log** — `<div class="log">` that appends timestamped entries (de-DE locale) for every incoming `kmn/theme/request` from the widget and every outgoing `kmn/theme/set` from the harness. Scrolls automatically.
- **Auto-responder** — `window.addEventListener('message')` catches `kmn/theme/request` from widget and replies with `DEFAULT_TOKEN_VALUES` (hell), mocking the production portal's `useThemePublisher` behavior for standalone dev.
- **German user-facing strings** — `Design-Harness`, `Hell`, `Dunkel (Platzhalter)`, `Basis-Fixture`, `Widget neu geladen`.
- **file:// incompatibility warning** — preserved in `<script>` header: harness imports `../shared/widget-tokens.ts` which requires Vite's TS transform; only the production `dist/widgets/daily-briefing.html` works via `file://`.

### 2. `widgets/daily-briefing/src/lib/fixtures.ts` (new)

```typescript
export type FixtureMode = 'basket-aov' | 'one-block-failing'

export function getFixtureMode(): FixtureMode | null {
  const params = new URLSearchParams(window.location.search)
  const mode = params.get('mock')
  if (mode === 'basket-aov' || mode === 'one-block-failing') return mode
  return null
}
```

- Narrow union return type prevents arbitrary string interpolation (T-18-05-01 mitigation).
- Not consumed by v1 widget code — Phase 19 block components will import it.

### 3. `package.json` — `dev:widget` script added

```json
"dev:widget": "cd widgets/daily-briefing && npx vite --port 5174 --open /dev-host.html"
```

Position: inserted between `dev` and `start` in scripts block. Final scripts block:

```json
{
  "scripts": {
    "build:widgets": "node scripts/build-widgets.mjs",
    "build:server": "tsc -p tsconfig.json",
    "build": "npm run build:widgets && npm run build:server",
    "check:bundle-size": "node scripts/check-widget-bundle-size.mjs",
    "dev": "npm run build:widgets && tsx watch src/server.ts",
    "dev:widget": "cd widgets/daily-briefing && npx vite --port 5174 --open /dev-host.html",
    "start": "node dist/server.js",
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit && tsc -p tsconfig.widgets.json --noEmit"
  }
}
```

## Bundle-Size Re-Verification (End-of-Phase Gate, MCPAPP-BUILD-04)

Clean rebuild from scratch (`rm -rf dist && npm run build:widgets`) + `npm run check:bundle-size`:

| Widget | Size (gz) | Budget | Headroom | Status |
|---|---|---|---|---|
| `dist/widgets/daily-briefing.html` | **153,307 bytes** (150.6 KB gz) | 307,200 bytes (300 KB gz) | **150.6 KB (49%)** | ✓ |
| `dist/widgets/revenue-today.html` | **149,899 bytes** (147.2 KB gz) | 307,200 bytes (300 KB gz) | **152.6 KB (50%)** | ✓ |

Both widgets well under budget. Phase 19's `daily_briefing` v2 has ~150 KB gz to spend on: 4 block components + attention block + Motion animations + Tailwind JIT CSS. Comfortable.

## Cross-Repo Twin Integrity

`diff <(tail -n +2 mcp-poc/widgets/shared/widget-tokens.ts) <(tail -n +2 PORTAL/src/shared/styles/widget-tokens.ts)` → **empty output** (byte-identical below header lines). No twin drift across Wave 3 commits.

## Commits

| Task | Commit | Message | Repo |
|---|---|---|---|
| 1 | `3ef175e` | `feat(18-05): dev harness — theme toggle + fixture dropdown + handshake log (D-18-04)` | mcp-poc/main |

Only one commit this plan; Task 2 of plan was automated verification (no file changes); Task 3 (human-verify checkpoint) is handled by orchestrator after this executor returns.

## Human-Verify Pending

Yuri must perform the following manual checks before the plan is fully closed. The dev server must be running: `cd G:/01_OPUS/Projects/mcp-poc && npm run dev:widget` → browser auto-opens at `http://localhost:5174/dev-host.html`.

1. **Harness loads + initial handshake**
   - Browser should show: `Design-Harness` label, Hell/Dunkel buttons, fixture dropdown, empty log box, widget iframe.
   - Within ~1s of iframe mount, the handshake log shows:
     - `HH:MM:SS — ← kmn/theme/request vom Widget`
     - `HH:MM:SS — → kmn/theme/set (hell, Auto-Antwort)`

2. **Theme toggle visibly changes CSS variables** (DevTools required)
   - Open DevTools → Inspect the widget iframe's `<html>` element → Computed styles.
   - Initial: `--color-bg: #FAFAF9`, `--color-fg: #333333`, `--color-surface: #FFFFFF`.
   - Click **Dunkel (Platzhalter)** → within 50ms the same vars show `#0B1220`, `#F1F5F9`, `#14192B`.
   - Log appends `→ kmn/theme/set (dunkel, manuell)`.
   - Click **Hell** → vars revert; log appends `→ kmn/theme/set (hell, manuell)`.

3. **Fixture dropdown reloads widget with URL param**
   - Select `?mock=basket-aov` → widget iframe reloads.
   - DevTools Elements tab shows the iframe `src` ends with `./index.html?mock=basket-aov`.
   - Log appends `↻ Widget neu geladen mit ?mock=basket-aov`.
   - Repeat with `?mock=one-block-failing` and `Basis-Fixture` (empty).

4. **Standalone widget fallback (MCPAPP-TOKEN-05)**
   - Stop the dev server (Ctrl+C).
   - Open `file:///G:/01_OPUS/Projects/mcp-poc/dist/widgets/daily-briefing.html` directly in the browser.
   - Expected: widget renders with `DEFAULT_TOKEN_VALUES` applied after ~300ms (inspect `<html>` CSS vars via DevTools — should see `#FAFAF9` etc.).
   - No console errors (silent no-op postMessage to nonexistent parent is expected).

## Deviations from Plan

### Scope adjustment

The orchestrator explicitly deferred Task 4 (the checkpoint:human-verify gate from the original plan) to a human-verification step after this executor returns. This executor completed only the build tasks (equivalent to plan Task 1) plus the automatable portion of Task 4 (clean rebuild + bundle-size check + twin-diff + gz byte measurements). No deviations from the original implementation; just scope-narrowing per orchestrator direction.

### Pre-existing typecheck errors (out of scope)

`npm run typecheck` (full widget typecheck) reports 2 pre-existing errors not caused by Plan 05 changes (verified via `git stash`):

- `widgets/shared/hooks/__tests__/useHostTokens.test.ts:67:28` — TS2532 (introduced Plan 18-03, commit `4e79acf`)
- `widgets/shared/vite.base.ts:43:9` — TS2322 (introduced Plan 18-02)

Logged to `.planning/phases/18-mcp-ui-resource-build-pipeline/deferred-items.md`. Per GSD scope boundary rule: only auto-fix issues directly caused by current task. These pre-date Plan 05 and should be addressed in a dedicated cleanup (or absorbed by Phase 19 when v2 blocks replace the code paths that created them).

Build itself succeeds (`npm run build:widgets` exits 0), so the typecheck noise is purely in test/tooling files that don't affect runtime artifacts.

### Auto-fixed Issues

None — plan executed as written.

## Phase 19 Readiness

- ✅ **Widget pipeline** — per-widget Vite + Tailwind v4 + Motion + React 19 ready
- ✅ **Token bridge** — `kmn/theme/*` end-to-end (widget `useHostTokens` ↔ sandbox-proxy relay ↔ portal `useThemePublisher`)
- ✅ **Dev harness** — :5174 enables live iteration on block components with fixture modes
- ✅ **Fixture parser** — `getFixtureMode()` ready for Phase 19 block code to consume
- ✅ **Bundle budget tripwire** — `npm run check:bundle-size` with ~150 KB gz headroom per widget
- ⚠️ **v1 daily-briefing code still in place** — deletion deferred to Phase 19 per `project_v1_widget_cleanup` memory

## Critical Developer Notes for Phase 19

- **`dev-host.html` REQUIRES Vite dev server** — it imports `../shared/widget-tokens.ts` (a TypeScript module). Opening it directly via `file://` will fail because browsers cannot resolve `.ts` imports without Vite's transform pipeline. Always launch via `npm run dev:widget` → `http://localhost:5174/dev-host.html`.
- **Production widget IS file:// compatible** — `dist/widgets/daily-briefing.html` (single-file output from `viteSingleFile` with inlined JS + CSS) loads directly from the filesystem with no server. This is the MCPAPP-TOKEN-05 standalone fallback (300ms timeout → DEFAULT_TOKEN_VALUES applied).
- **`getFixtureMode()` should be imported in Phase 19 block components** at `widgets/daily-briefing/src/lib/fixtures.ts`. For Phase 19's WIDG-QA-03 (error-block skeleton test) and conditional basket/aov rendering, consume the return value at the top of the relevant block component and switch render branches.

## Self-Check: PASSED

- `widgets/daily-briefing/dev-host.html` — created, contains `id="theme-light"`, `id="theme-dark"`, `id="fixture-mode"`, `DARK_MOCK`, `DEFAULT_TOKEN_VALUES`, `kmn/theme/request`, `kmn/theme/set`, `Dunkel (Platzhalter)`, `Widget neu geladen`
- `widgets/daily-briefing/src/lib/fixtures.ts` — created, exports `FixtureMode`, `getFixtureMode`, uses `URLSearchParams`, whitelists `'basket-aov'` + `'one-block-failing'`
- `package.json` — `dev:widget` script present with `--port 5174` and `--open /dev-host.html`
- Commit `3ef175e` exists on mcp-poc/main
- `dist/widgets/daily-briefing.html` exists (153,307 gz bytes, under budget)
- `dist/widgets/revenue-today.html` exists (149,899 gz bytes, under budget)
- Twin byte-identity: identical below header

## Threat Flags

None — no new security surface introduced. URL-param parser is whitelist-only (T-18-05-01 mitigation codified in the return-type narrowing).
