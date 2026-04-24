---
phase: 18
plan: 02
subsystem: mcp-poc/widgets
tags: [vite, tailwind-v4, motion, build-pipeline, mcp-poc, single-file, bundle-budget]
dependency_graph:
  requires:
    - "Plan 18-01 (React 19 stack + per-widget dirs + dir-scan build runner)"
  provides:
    - "Shared buildWidgetConfig() factory at widgets/shared/vite.base.ts"
    - "Per-widget vite.config.ts for daily-briefing and revenue-today"
    - "Working npm run build:widgets producing flat dist/widgets/<name>.html single-file artifacts"
    - "300 KB gz bundle budget enforcer (scripts/check-widget-bundle-size.mjs)"
    - "Baseline bundle sizes for Phase 19 headroom tracking (~150 KB gz v1 code)"
  affects:
    - "Plan 18-03 (widgets/shared/ module + useHostTokens hook — pipeline is now ready for shared token consumer)"
    - "Plan 18-04 (portal-side publisher + sandbox-proxy relay)"
    - "Plan 18-05 (harness wiring + final smoke test — uses check:bundle-size)"
tech_stack:
  added:
    - "@tailwindcss/vite@4.2.4 (runtime dep, widgets bundle)"
    - "tailwindcss@4.2.4 (runtime dep)"
    - "motion@12.38.0 (runtime dep)"
  patterns:
    - "Vite factory config (buildWidgetConfig) + per-widget thin-wrapper configs"
    - "Custom kmn:rename-html-asset plugin for flat HTML output (replaces broken entryFileNames approach)"
    - "In-process gzipSync bundle-size enforcement (no shell piping, cross-platform)"
key_files:
  created:
    - "mcp-poc:widgets/shared/vite.base.ts"
    - "mcp-poc:widgets/daily-briefing/vite.config.ts"
    - "mcp-poc:widgets/revenue-today/vite.config.ts"
    - "mcp-poc:scripts/check-widget-bundle-size.mjs"
  modified:
    - "mcp-poc:package.json (deps + scripts block)"
    - "mcp-poc:package-lock.json"
    - "mcp-poc:widgets/daily-briefing/src/styles.css (prepended @import tailwindcss)"
    - "mcp-poc:widgets/revenue-today/src/styles.css (prepended @import tailwindcss)"
  deleted:
    - "mcp-poc:vite.config.ts (deprecated env-gated multi-entry hack)"
decisions:
  - "Custom kmn:rename-html-asset Vite plugin replaces rollupOptions.output.entryFileNames for HTML renaming — entryFileNames targets JS entry chunks, and forcing a .html value there makes Rollup emit the JS chunk with a .html name, which then crashes vite-plugin-singlefile's .html-extension asset detection (accesses .source on a JS chunk that only has .code)"
  - "Tailwind v4 CSS imports (@import \"tailwindcss\") added as first line of v1 widget stylesheets so the pipeline processes Tailwind even though v1 code does not use utility classes (Phase 19 strips v1 token duplication and uses utilities)"
  - "Bundle-size check kept as standalone npm script rather than chained into build — Plan 05 wires it into the final smoke test gate"
metrics:
  duration: "~20 minutes (sequential executor; one Rule 1 deviation for the entryFileNames bug)"
  completed: "2026-04-24"
  bundle_sizes_gz:
    daily_briefing: "154056 bytes (150.4 KB)"
    revenue_today: "150702 bytes (147.2 KB)"
    budget: "307200 bytes (300 KB)"
    headroom: "~150 KB (v1 pre-Tailwind, pre-Motion — Phase 19 rewrites consume headroom)"
---

# Phase 18 Plan 02: Build-Pipeline Dependencies + Per-Widget Vite Configs Summary

Installed Tailwind v4 and Motion as runtime deps in mcp-poc, authored the `widgets/shared/vite.base.ts` factory, wired per-widget `vite.config.ts` wrappers for daily-briefing and revenue-today, deleted the deprecated root `vite.config.ts`, and added the 300 KB gz bundle-size budget enforcer. `npm run build:widgets` now produces flat single-file artifacts at `dist/widgets/<name>.html` and `npm run check:bundle-size` passes with ~50% headroom remaining.

## Work Completed

### Task 1 — Install Tailwind v4 + Motion runtime deps (commit `44e8528`)

Single `npm install --save` added three packages to `dependencies` (not `devDependencies`) because widgets bundle them at build time:

| Package | Installed version | Requirement |
|---------|-------------------|-------------|
| `@tailwindcss/vite` | `4.2.4` | MCPAPP-BUILD-02 |
| `tailwindcss` | `4.2.4` | MCPAPP-BUILD-02 |
| `motion` | `12.38.0` | MCPAPP-BUILD-03 |

Post-install verification:
- `npx tsc -p tsconfig.widgets.json --noEmit` → exit 0 (React 19 types still resolve; Motion peerDeps are happy)
- `node_modules/@tailwindcss/vite/`, `node_modules/tailwindcss/`, `node_modules/motion/` all present

No devDependencies touched. Preact was deliberately not installed (Preact fallback is documentation-only per MCPAPP-BUILD-05).

### Task 2 — Per-widget Vite configs + shared factory + root delete (commit `ce6db86`)

Four file changes + one delete:

1. **`widgets/shared/vite.base.ts`** (new) — exports `buildWidgetConfig({ root, outFileName })` factory.
   - Plugin order (stable, per Pitfall 3): `react()` → `tailwindcss()` → `viteSingleFile({ removeViteModuleLoader: true })` → `renameHtmlAsset(outFileName)` (custom, see deviation below).
   - `build.outDir = resolve(here, '../../dist/widgets')` — absolute from shared/ up to mcp-poc root, so every per-widget run writes to the same flat dist.
   - `build.emptyOutDir = false` — the Plan 01 runner empties `dist/widgets/` once at the top of the loop.
   - `assetsInlineLimit: 100_000_000`, `cssCodeSplit: false`, `rollupOptions.output.inlineDynamicImports: true` (MCPAPP-BUILD-01).
   - Trailing block of Preact-fallback documentation with all 4 numbered steps verbatim (MCPAPP-BUILD-05).

2. **`widgets/daily-briefing/vite.config.ts`** (new) — thin wrapper: imports `buildWidgetConfig`, passes `{ root: here, outFileName: 'daily-briefing.html' }`.

3. **`widgets/revenue-today/vite.config.ts`** (new) — same wrapper, `outFileName: 'revenue-today.html'`.

4. **`vite.config.ts`** at mcp-poc root — deleted via `git rm`. Prevents vitest (Plan 03) from picking it up as a default config and removes the misleading env-gated hack.

5. **Both widget `styles.css` files** — prepended `@import "tailwindcss";` as first line. v1 code does not use Tailwind utilities yet (Phase 19 adds them), but this ensures the pipeline processes Tailwind end-to-end.

Build output verification (clean rebuild after `rm -rf dist`):

```
→ Building widget: daily-briefing
✓ 157 modules transformed.
  [vite:singlefile] Inlining: index-BY8_2dmg.js
  [vite:singlefile] Inlining: style-CXp0XySs.css
  ../../dist/widgets/daily-briefing.html  575.68 kB │ gzip: 154.06 kB
  ✓ built in 3.69s

→ Building widget: revenue-today
✓ 157 modules transformed.
  [vite:singlefile] Inlining: index-DdUc7B0j.js
  [vite:singlefile] Inlining: style-BVdg7h90.css
  ../../dist/widgets/revenue-today.html  562.26 kB │ gzip: 150.70 kB
  ✓ built in 3.75s

✓ All widgets built.
```

Single-file assertions:
- `grep -c "<script" dist/widgets/daily-briefing.html` → 2
- `grep -c "<style" dist/widgets/daily-briefing.html` → 1
- `ls dist/widgets/*.css` → no match (no separate CSS)
- `ls dist/widgets/*.js` → no match (no separate JS)
- `test -d dist/widgets/daily-briefing` → absent (flat file, NOT a directory — Pitfall 7 satisfied)

### Task 3 — Bundle-size enforcer (commit `6fdca07`)

Created `scripts/check-widget-bundle-size.mjs` (28 LOC) that:
- Reads every `.html` file in `dist/widgets/`
- Gzips in-process via `node:zlib` `gzipSync`
- Compares to `BUDGET_BYTES = 307200` (exactly 300 × 1024)
- Prints per-widget line: `✓ <file>: <bytes> bytes (<kb> KB gz) — budget 307200 bytes (300 KB gz)`
- Exits 1 if `dist/widgets/` missing, has no `.html` files, or any widget exceeds budget
- Exits 0 with final `✓ All widgets within 300 KB gz budget.` line otherwise

Added `"check:bundle-size": "node scripts/check-widget-bundle-size.mjs"` to package.json scripts. Deliberately NOT chained into `build` yet — Plan 05 wires it into the final smoke gate.

Positive test (after `npm run build:widgets`):
```
✓ daily-briefing.html: 154056 bytes (150.4 KB gz) — budget 307200 bytes (300 KB gz)
✓ revenue-today.html: 150702 bytes (147.2 KB gz) — budget 307200 bytes (300 KB gz)

✓ All widgets within 300 KB gz budget.
EXIT=0
```

Negative test (after `rm dist/widgets/*.html`):
```
✗ No widget HTML files found in dist/widgets
EXIT=1
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `rollupOptions.output.entryFileNames` approach for flat HTML output was broken**

- **Found during:** Task 2, first `npm run build:widgets` attempt
- **Issue:** The plan prescribed `rollupOptions.output.entryFileNames: opts.outFileName` (literally `'daily-briefing.html'`) to force flat `dist/widgets/<name>.html` output. But `entryFileNames` applies to **JS entry chunks**, not to HTML assets. With Vite 6.4.2 + rollup this caused:
  - The JS entry chunk was named `daily-briefing.html` (a JS chunk with `.code`, not an HTML asset with `.source`)
  - The actual HTML output kept its Vite default name `index.html`
  - `vite-plugin-singlefile` walked the bundle and classified any key ending in `.html` as an HTML asset, then tried `htmlChunk.source.replace(...)` on the JS chunk → `Cannot read properties of undefined (reading 'replace')`
- **Root cause evidence** (custom debug plugin output):
  ```
  DEBUG bundle: name=daily-briefing.html type=chunk fileName=daily-briefing.html hasSource=false hasCode=true
  DEBUG bundle: name=style-CXp0XySs.css    type=asset fileName=style-CXp0XySs.css    hasSource=true  hasCode=false
  DEBUG bundle: name=index.html            type=asset fileName=index.html            hasSource=true  hasCode=false
  ```
- **Fix:** Removed `entryFileNames` from `rollupOptions.output`. Authored a custom post-enforcement Vite plugin `kmn:rename-html-asset` that runs after singlefile has inlined JS+CSS into `index.html`, then renames the HTML asset (`bundle[index.html].fileName = outFileName` and reinserts under the new key). Preserves the flat output shape required by `src/widget-bundle.ts` (`dist/widgets/daily-briefing.html`) without naming collision.
- **Files modified:** `widgets/shared/vite.base.ts` (added `renameHtmlAsset` helper + comment explaining the pitfall)
- **Commit:** `ce6db86`

This is a real bug in the upstream pattern — the plan's `<interfaces>` block and `18-PATTERNS.md §3` both prescribed the broken approach. The fix is encoded in the source comment so future plans don't regress.

## Verification Results

```
cd G:/01_OPUS/Projects/mcp-poc
rm -rf dist && npm run build:widgets          → EXIT 0, both widgets built
test -f dist/widgets/daily-briefing.html       → DB-BUILT
test -f dist/widgets/revenue-today.html        → RT-BUILT
! test -d dist/widgets/daily-briefing          → NO-NESTED-DIR-OK
! ls dist/widgets/*.css                        → NO-SEPARATE-CSS-OK
! ls dist/widgets/*.js                         → NO-SEPARATE-JS-OK
grep -q "<script" dist/widgets/daily-briefing.html → JS-INLINED-OK
grep -q "<style"  dist/widgets/daily-briefing.html → CSS-INLINED-OK
npm run check:bundle-size                      → EXIT 0, BUDGET-OK
rm dist/widgets/*.html && npm run check:bundle-size → EXIT 1, BUDGET-NEGATIVE-OK
npx tsc -p tsconfig.widgets.json --noEmit      → EXIT 0 (post Task 1)
```

All acceptance-criteria gates from 18-02-PLAN.md pass:
- Per-widget configs exist and import from `../shared/vite.base`
- Shared factory exports `buildWidgetConfig` with canonical plugin order
- `PREACT FALLBACK` comment block present in `vite.base.ts`
- `@import "tailwindcss"` is the first line of both widget styles.css files
- `dist/widgets/{daily-briefing,revenue-today}.html` exist as flat single-file artifacts
- Bundle-size script exits 0 on healthy build, 1 when no HTML files present
- `"check:bundle-size":` npm script wired
- 3 commits on mcp-poc `main` with prefixes `chore(18-02):`, `feat(18-02):`, `feat(18-02):`

## Bundle Baseline for Phase 19

With only v1 widget code (pre-Tailwind utilities, pre-Motion), the artifacts weigh in at:

| Widget | Bytes | Gzip (KB) | Budget (KB) | Headroom |
|--------|------:|----------:|------------:|---------:|
| `daily-briefing.html` | 154,056 | 150.4 | 300.0 | 149.6 KB |
| `revenue-today.html`  | 150,702 | 147.2 | 300.0 | 152.8 KB |

Phase 19 must fit its 4-block dashboard rewrite (Tailwind utilities + Motion animations + SVG charts) within ~150 KB gz headroom. The MCPAPP-BUILD-05 Preact fallback documented in `widgets/shared/vite.base.ts` buys an estimated ~30 KB more if needed.

## Preact Fallback Pointer

Full 4-step activation recipe is embedded as a trailing comment block in `G:/01_OPUS/Projects/mcp-poc/widgets/shared/vite.base.ts` (below the `buildWidgetConfig` export). It is kept inline so Phase 19 executors encounter it naturally when editing the build config rather than having to cross-reference an external doc.

## mcp-poc Commits (branch: `main`)

| Commit | Type | Summary |
|--------|------|---------|
| `44e8528` | chore | install @tailwindcss/vite ^4.2.4 + tailwindcss ^4.2.4 + motion ^12.38.0 as runtime deps |
| `ce6db86` | feat | per-widget vite.config.ts + shared vite.base.ts factory + delete deprecated root config + tailwind @import on both styles.css |
| `6fdca07` | feat | check-widget-bundle-size.mjs enforces 300 KB gz budget (MCPAPP-BUILD-04) |

## What Unblocks Next Waves

- **Plan 18-03** (shared token module + useHostTokens hook): pipeline now processes Tailwind + Motion runtime deps; `widgets/shared/` directory is already a recognized Vite import source.
- **Plan 18-04** (portal-side publisher + sandbox-proxy relay): widget artifacts built at stable flat paths `dist/widgets/<name>.html`; `src/widget-bundle.ts` still resolves both bundles without modification.
- **Plan 18-05** (harness + final smoke test): `npm run check:bundle-size` is ready to wire into the final gate; baseline sizes captured for regression detection.

## Self-Check: PASSED

- File `G:/01_OPUS/Projects/mcp-poc/widgets/shared/vite.base.ts` → FOUND
- File `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/vite.config.ts` → FOUND
- File `G:/01_OPUS/Projects/mcp-poc/widgets/revenue-today/vite.config.ts` → FOUND
- File `G:/01_OPUS/Projects/mcp-poc/scripts/check-widget-bundle-size.mjs` → FOUND
- File `G:/01_OPUS/Projects/mcp-poc/dist/widgets/daily-briefing.html` → FOUND (154,056 bytes)
- File `G:/01_OPUS/Projects/mcp-poc/dist/widgets/revenue-today.html` → FOUND (150,702 bytes)
- File `G:/01_OPUS/Projects/mcp-poc/vite.config.ts` → ABSENT (deleted as required)
- Commit `44e8528` (mcp-poc main) → FOUND (`chore(18-02): install Tailwind v4 + Motion as runtime deps`)
- Commit `ce6db86` (mcp-poc main) → FOUND (`feat(18-02): Vite pipeline per-widget + shared vite.base factory`)
- Commit `6fdca07` (mcp-poc main) → FOUND (`feat(18-02): check-widget-bundle-size.mjs for 300 KB gz budget (MCPAPP-BUILD-04)`)
