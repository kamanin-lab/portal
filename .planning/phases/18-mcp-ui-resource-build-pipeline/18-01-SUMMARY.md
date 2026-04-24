---
phase: 18
plan: 01
subsystem: mcp-poc/widgets
tags: [react-19, build-pipeline, mcp-poc, widget-restructure]
dependency_graph:
  requires: []
  provides:
    - "mcp-poc React 19 devDependency stack (D-18-01)"
    - "Per-widget directory shape (D-18-02): widgets/{daily-briefing,revenue-today}/{index.html,tsconfig.json,src/*}"
    - "Directory-scanning build runner (D-18-02a) — ready for Plan 02 vite.config.ts files"
  affects:
    - "Plan 18-02 (per-widget vite configs + shared base)"
    - "Plan 18-03 (widgets/shared/ module + useHostTokens hook)"
tech_stack:
  added:
    - "react@^19.2.5 + react-dom@^19.2.5 (devDeps)"
    - "@types/react@^19.2.14 + @types/react-dom@^19.2.3"
    - "@vitejs/plugin-react@^5.2.0"
    - "vite-plugin-singlefile@^2.3.3"
  patterns:
    - "fs.readdirSync-based widget discovery (D-18-02a)"
    - "JSX global ambient shim (temporary — Phase 19 deletes)"
key_files:
  created:
    - "mcp-poc:widgets/jsx-global.d.ts"
    - "mcp-poc:widgets/daily-briefing/index.html"
    - "mcp-poc:widgets/daily-briefing/tsconfig.json"
    - "mcp-poc:widgets/daily-briefing/src/main.tsx"
    - "mcp-poc:widgets/daily-briefing/src/App.tsx (rename from widgets/src/DailyBriefingApp.tsx, 100% content match)"
    - "mcp-poc:widgets/daily-briefing/src/styles.css (rename from widgets/src/daily-briefing.css, 100%)"
    - "mcp-poc:widgets/revenue-today/index.html"
    - "mcp-poc:widgets/revenue-today/tsconfig.json"
    - "mcp-poc:widgets/revenue-today/src/main.tsx"
    - "mcp-poc:widgets/revenue-today/src/App.tsx (rename from widgets/src/App.tsx, 100%)"
    - "mcp-poc:widgets/revenue-today/src/styles.css (rename from widgets/src/styles.css, 100%)"
  modified:
    - "mcp-poc:package.json (devDependencies bump)"
    - "mcp-poc:package-lock.json"
    - "mcp-poc:scripts/build-widgets.mjs (refactor: dir scan)"
  deleted:
    - "mcp-poc:widgets/daily-briefing.html (→ widgets/daily-briefing/index.html)"
    - "mcp-poc:widgets/revenue-today.html (→ widgets/revenue-today/index.html)"
    - "mcp-poc:widgets/src/ (entire directory)"
decisions:
  - "React 19 global JSX namespace removal handled via widgets/jsx-global.d.ts ambient shim — avoids editing 670 LOC byte-frozen v1 code; shim is deleted alongside v1 in Phase 19 (project_v1_widget_cleanup)"
  - "tsconfig.widgets.json untouched — its existing widgets/**/*.ts(x) glob already covers the new per-widget subdirs"
  - "Git rename detection preserved history for all 4 moved files (100% content match for App.tsx + styles.css on both widgets)"
metrics:
  duration: "~15 minutes (single-session sequential executor)"
  completed: "2026-04-24"
---

# Phase 18 Plan 01: MCP UI Build Pipeline Foundations Summary

React 19 devDependency upgrade in mcp-poc + widgets/ restructure to per-widget directory shape (D-18-02) + scripts/build-widgets.mjs refactored to fs.readdirSync-based discovery (D-18-02a). All v1 widget code migrated byte-identical; no logic edits.

## Work Completed

### Task 1 — React 19 upgrade (commit `af053cb`)

Single atomic `npm install --save-dev` bumped 6 packages:

| Package | Before | After |
|---------|--------|-------|
| `react` | `^18.3.1` | `^19.2.5` |
| `react-dom` | `^18.3.1` | `^19.2.5` |
| `@types/react` | `^18.3.18` | `^19.2.14` |
| `@types/react-dom` | `^18.3.5` | `^19.2.3` |
| `@vitejs/plugin-react` | `^4.3.4` | `^5.2.0` |
| `vite-plugin-singlefile` | `^2.0.3` | `^2.3.3` |

`vite` stayed on `^6.0.5`. No `npm audit fix`.

**Deviation applied (Rule 3 — blocking issue):** React 19 + `@types/react@19` removed the global `JSX` namespace. The v1 widget code (670-LOC `DailyBriefingApp.tsx` + 202-LOC `App.tsx`) uses `JSX.Element` return annotations, which broke tsc with 10 errors.

Per `project_v1_widget_cleanup` (Phase 19 deletes all v1 widget code), editing those soon-to-die files was the wrong trade-off. Instead, created a minimal ambient declaration file `widgets/jsx-global.d.ts` that re-publishes `React.JSX` as the global `JSX` namespace. This is the standard React 19 migration escape hatch documented in React's migration guide. The shim is explicitly marked temporary and will be deleted when Phase 19 removes the v1 widget code it protects.

tsc verifications post-fix:
- `npx tsc -p tsconfig.widgets.json --noEmit` → exit 0
- `npx tsc --noEmit` → exit 0

### Task 2 — per-widget directory restructure (commit `042c061`)

Created `widgets/daily-briefing/` and `widgets/revenue-today/` subdirectories conforming to the D-18-02 canonical shape. Git recorded 8 renames with 100% content match for the two `App.tsx` files and both CSS files (byte-identical carry-over verified mechanically by the rename detector).

| Old path | New path | Content diff |
|----------|----------|--------------|
| `widgets/daily-briefing.html` | `widgets/daily-briefing/index.html` | script `src` path only |
| `widgets/src/daily-briefing-main.tsx` | `widgets/daily-briefing/src/main.tsx` | 2 import paths only |
| `widgets/src/DailyBriefingApp.tsx` | `widgets/daily-briefing/src/App.tsx` | byte-identical (669 LOC) |
| `widgets/src/daily-briefing.css` | `widgets/daily-briefing/src/styles.css` | byte-identical |
| `widgets/revenue-today.html` | `widgets/revenue-today/index.html` | script `src` path only |
| `widgets/src/main.tsx` | `widgets/revenue-today/src/main.tsx` | byte-identical (already uses `./App` + `./styles.css`) |
| `widgets/src/App.tsx` | `widgets/revenue-today/src/App.tsx` | byte-identical (202 LOC) |
| `widgets/src/styles.css` | `widgets/revenue-today/src/styles.css` | byte-identical |

Per-widget `tsconfig.json` created for both widgets, extending `../../tsconfig.widgets.json` and including `src/**/*`. No modifications to the root `tsconfig.widgets.json` — its existing `widgets/**/*.{ts,tsx}` include glob already covers the new subdirs.

No `vite.config.ts` added to either widget dir (Plan 02 scope). No `widgets/shared/` created (Plan 03 scope).

Post-restructure tsc: `npx tsc -p tsconfig.widgets.json --noEmit` exits 0.

### Task 3 — build-widgets.mjs refactor (commit `21eb838`)

Rewrote `scripts/build-widgets.mjs` to the dir-scan pattern (33 LOC before, 33 LOC after — same size, different semantics). Key changes:

- Dropped hardcoded `const WIDGETS = ["revenue-today", "daily-briefing"]` array
- Dropped `env: { ...process.env, WIDGET: widget }` env-var plumbing
- Added `rmSync(distRoot, { recursive: true, force: true })` once at start (replaces per-widget `emptyOutDir`)
- Added `readdirSync(widgetsRoot, { withFileTypes: true }).filter(...)` dir scan
- Filter excludes `'shared'` (future Plan 03 shared module dir)
- Filter requires `vite.config.ts` presence (safety net until Plan 02 adds the configs)
- Spawn now uses per-widget `cwd: join(widgetsRoot, widget)` instead of env-var

Runner verified via `node scripts/build-widgets.mjs` — prints `✓ All widgets built.` and exits 0. Since no `vite.config.ts` files exist yet, `widgetDirs` is empty and zero builds run. That's the expected state until Plan 02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] React 19 global JSX namespace removal**
- **Found during:** Task 1 (post-install `tsc` check)
- **Issue:** `@types/react@19` no longer exposes `JSX` as a global namespace. 10 errors of the form `TS2503: Cannot find namespace 'JSX'` in `widgets/src/DailyBriefingApp.tsx` (9 occurrences) and `widgets/src/App.tsx` (1 occurrence), each on function return type annotations like `(): JSX.Element`.
- **Fix:** Created `widgets/jsx-global.d.ts` — ambient declaration that imports `React.JSX` and re-publishes it globally. This matches the React 19 migration guide's "global JSX shim" pattern and avoids editing byte-frozen v1 files that Phase 19 deletes.
- **Files modified:** `widgets/jsx-global.d.ts` (new, 28 LOC)
- **Commit:** `af053cb`
- **Future cleanup:** Delete this shim when Phase 19 removes `widgets/daily-briefing/src/App.tsx`. The shim's header comment documents this.

## Verification Results

```
cd G:/01_OPUS/Projects/mcp-poc
npx tsc -p tsconfig.widgets.json --noEmit  → EXIT 0  (WIDGET-TYPES-OK)
npx tsc --noEmit                            → EXIT 0  (SERVER-TYPES-OK)
ls widgets/daily-briefing/{index.html,src/App.tsx}       → present
ls widgets/revenue-today/{index.html,src/App.tsx}        → present
ls widgets/daily-briefing.html                           → absent  (FLAT-DELETED-OK)
ls widgets/src/                                          → absent
node scripts/build-widgets.mjs                           → EXIT 0, prints "✓ All widgets built."  (RUNNER-OK)
wc -l widgets/daily-briefing/src/App.tsx                 → 669 LOC  (≥600 acceptance)
wc -l widgets/revenue-today/src/App.tsx                  → 202 LOC
grep 'readdirSync' scripts/build-widgets.mjs             → 2 matches
grep "const WIDGETS =" scripts/build-widgets.mjs         → 0 matches
grep "WIDGET: widget" scripts/build-widgets.mjs          → 0 matches
grep "e.name !== 'shared'" scripts/build-widgets.mjs     → 1 match
grep "rmSync(distRoot" scripts/build-widgets.mjs         → 1 match
```

All 4 end-to-end gates pass: WIDGET-TYPES-OK, SERVER-TYPES-OK, DIRS-OK, FLAT-DELETED-OK, RUNNER-OK.

## mcp-poc Commits (branch: `main`)

| Commit | Type | Summary |
|--------|------|---------|
| `af053cb0901abc85ead05d2ddc64f52882b815e2` | chore | upgrade mcp-poc React 18→19 + plugin-react 4→5 + singlefile bump |
| `042c06103d40f825035ffa643cdcad93e745e069` | feat | migrate widgets/ to per-widget directory structure |
| `21eb8388abb6dea3c2b53c4535eefbd1de10a618` | refactor | build-widgets.mjs dir-scan + single dist empty |

## What Unblocks Plan 02

- Per-widget dirs exist in canonical shape → Plan 02 adds `widgets/{daily-briefing,revenue-today}/vite.config.ts`
- `widgets/shared/vite.base.ts` factory can be authored (Plan 02) and imported by per-widget configs
- `scripts/build-widgets.mjs` already iterates `widgets/*/vite.config.ts` — when Plan 02 adds the configs, the same runner picks them up without further edits

## Self-Check: PASSED

- File `G:/01_OPUS/Projects/mcp-poc/widgets/jsx-global.d.ts` → FOUND
- File `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/index.html` → FOUND
- File `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/App.tsx` → FOUND (669 LOC)
- File `G:/01_OPUS/Projects/mcp-poc/widgets/revenue-today/src/App.tsx` → FOUND (202 LOC)
- File `G:/01_OPUS/Projects/mcp-poc/scripts/build-widgets.mjs` → FOUND (dir-scan shape)
- Commit `af053cb` (mcp-poc main) → FOUND
- Commit `042c061` (mcp-poc main) → FOUND
- Commit `21eb838` (mcp-poc main) → FOUND
