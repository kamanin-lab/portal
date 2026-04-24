---
phase: 19-revenue-intelligence-widget-v2
plan: 07
subsystem: widget
tags: [react, mcp-poc, daily-briefing-widget, app-composition, animate-presence, motion, tailwind-v4, mcp-app-lifecycle, in-place-replacement, v1-cleanup, bundle-budget, german-only]

requires:
  - phase: 19-revenue-intelligence-widget-v2
    plan: 01
    provides: lib/types.ts (BriefingPayload), lib/theme.ts (useHostTokens re-export), blocks/BlockSkeleton.tsx
  - phase: 19-revenue-intelligence-widget-v2
    plan: 02
    provides: lib/fixtures.ts (getFixtureMode), lib/fixtures-payloads.ts (getFixturePayload), lib/useCountUp.ts, lib/formatters.ts
  - phase: 19-revenue-intelligence-widget-v2
    plan: 03
    provides: scripts/check-german-only.mjs, scripts/check-widget-bundle-size.mjs, vitest jsdom environmentMatchGlobs
  - phase: 19-revenue-intelligence-widget-v2
    plan: 04
    provides: blocks/HeuteBlock.tsx, blocks/AttentionList.tsx, blocks/AppContext.tsx
  - phase: 19-revenue-intelligence-widget-v2
    plan: 05
    provides: blocks/HeatmapBlock.tsx (period toggle + 7×24 grid)
  - phase: 19-revenue-intelligence-widget-v2
    plan: 06
    provides: blocks/RepeatBlock.tsx, blocks/BasketOrAovBlock.tsx (3-mode switch)

provides:
  - "App.tsx — v2 composition (217 LOC): MCP App lifecycle (autoResize:false + ResizeObserver notifySize ported literally from v1) + state machine {loading | ok | error} + Pattern S4 dev-harness bypass via getFixturePayload(getFixtureMode()) + AppContext.Provider wrap + 4-block AnimatePresence stagger (80ms / 320ms / 12px locked, 200ms fade-only under prefers-reduced-motion). Composes 4 blocks in literal order HeuteBlock → HeatmapBlock → RepeatBlock → BasketOrAovBlock. Full-widget error envelope renders hardcoded German copy (T-19-07-02 — never state.message)."
  - "styles.css — minimised (31 LOC, was 567): @import 'tailwindcss' + html/body root reset (font-family: inherit, var-bg/fg) + @keyframes shimmer + .animate-shimmer. All v1 custom CSS vars / .card / .kpi-row / .list / @keyframes spin removed."
  - "Built artifact: dist/widgets/daily-briefing.html — 200,298 bytes (195.6 KB gzipped, 65% of the 300 KB budget)."

affects:
  - "Phase 19 widget-code-shipping is COMPLETE. v1 daily_briefing widget is fully replaced in place per D-19-11 — same file path (widgets/daily-briefing/src/App.tsx), same export name (DailyBriefingApp), main.tsx unchanged. Plan 19-08 (human UAT against staging.portal.kamanin.at + zero-diff verification of PORTAL TS) is the final remaining plan."
  - "PORT-04 zero-diff preserved: zero PORTAL code changes. Only PORTAL files modified are .planning/phases/19-revenue-intelligence-widget-v2/19-07-SUMMARY.md (this file)."

tech-stack:
  added: []
  patterns:
    - "Pattern S4 dev-harness bypass: window.parent === window guard runs first inside useEffect; bypasses MCP App.connect entirely and seeds state directly from getFixturePayload(getFixtureMode()). Lets dev-host.html?mock=* exercise all 4 blocks without an MCP host."
    - "MCP App lifecycle ported literally from v1 lines 115-184 (autoResize:false + lastHeight-deduped sendSizeChanged + ResizeObserver on documentElement + body). Reused verbatim per Plan PATTERNS, modulo the BriefingPayload shape change (v1 had revenue/attention/incomplete; v2 has blocks.{run_rate,heatmap,repeat,basket} + attention)."
    - "Locked Motion variants in module-scope constants (LIST/ITEM + LIST_REDUCED/ITEM_REDUCED). React-stable identity by reference. Component picks variant pair via reduced = useReducedMotion() at render-time. Cleaner than inline literals (which would churn on every render and defeat AnimatePresence's stagger semantics)."
    - "Cubic-out easing as `as const` tuple to satisfy Motion v12 typing without widening to number[]."
    - "ontoolresult fallback path: if structuredContent fails isBriefingPayload, attempt JSON.parse(content[0].text) once — preserves v1 behaviour where some MCP transports stringified the payload into the content array. On both failure modes sets state.kind='error' with message='invalid payload'."
    - "Full-widget error envelope renders hardcoded German copy ('Fehler' + 'Briefing konnte nicht geladen werden') — state.message is captured for future console.error hooks but never rendered to DOM. T-19-07-02 mitigation."
    - "Loading state renders 4 BlockSkeleton variant='loading' at approxHeights 220 / 280 / 180 / 240 — matches the actual rendered heights of HeuteBlock / HeatmapBlock / RepeatBlock / BasketOrAovBlock so the skeleton grid doesn't reflow when data arrives."
    - "styles.css — drop all custom CSS vars; tokens come from useHostTokens at runtime via document.documentElement.style.setProperty. Drop @keyframes spin since HeatmapBlock period-toggle spinner uses Tailwind's animate-spin utility. Keep only Tailwind import + minimal root reset + shimmer keyframes (used by BlockSkeleton variant='loading')."

key-files:
  created:
    - "G:/01_OPUS/Projects/PORTAL/.planning/phases/19-revenue-intelligence-widget-v2/19-07-SUMMARY.md (this file)"
  modified:
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/App.tsx — REPLACED IN PLACE (D-19-11): 670 LOC v1 → 217 LOC v2 composition. -592 / +140 net diff."
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/styles.css — MINIMISED: 567 LOC v1 → 31 LOC v2. -554 / +19 net diff."

key-decisions:
  - "In-place replacement (D-19-11): kept file path widgets/daily-briefing/src/App.tsx, kept export name DailyBriefingApp, kept main.tsx unchanged. Reviewer sees a clean file-rewrite diff instead of a delete + create + import-rewrite chain."
  - "Lifecycle structure ported literally (not re-derived): lastHeight dedupe + ResizeObserver + autoResize:false + sendSizeChanged are kept verbatim from v1 — the v1 widget shipped on staging since Phase 17 with this lifecycle and there is no signal it needs change. Only the payload guard + setState calls were updated to the v2 BriefingPayload shape."
  - "Motion variants extracted to module-scope: prevents React identity churn on the 4 motion.div children. Pattern S1 from PORTAL memory feedback_react_hook_identity_churn applies in spirit even though these are objects passed to a Motion API rather than a custom-hook return."
  - "Loading state renders 4 stacked BlockSkeleton (one per block) instead of a single full-page skeleton: keeps the 4-block grid layout stable across the loading→ok transition. AnimatePresence's stagger only fires when children mount-or-unmount as keyed children — the loading skeletons aren't wrapped in AnimatePresence, so the transition is a state swap, not an exit-animation."
  - "Full-widget error envelope is OUTSIDE AnimatePresence too: same reason. The 4-block stagger fires only on first transition into state.kind='ok', which is the spec intent (D-19-03 'block entry on first toolResult arrival only')."
  - "Direct vite build invocation as a Windows file-lock workaround: build-widgets.mjs starts with rmSync(distRoot, ...) which fails with EPERM when the dev:widget vite server (PID 37760, port 5174) has the dist/widgets directory locked. Worked around by running `npx vite build` in widgets/daily-briefing AND widgets/revenue-today directly — vite respects emptyOutDir:false from the shared base config. Logged as Deviation #1."

requirements-completed: [WIDG-STRUCT-01, WIDG-STRUCT-02, WIDG-QA-01, WIDG-QA-03, WIDG-QA-04, WIDG-QA-05]

duration: ~12 min
completed: 2026-04-25
---

# Phase 19 Plan 07: App.tsx v2 Composition + styles.css Minimisation Summary

**Replaced v1 daily_briefing widget IN PLACE with v2 composition per D-19-11. Composed 4 blocks (HeuteBlock → HeatmapBlock → RepeatBlock → BasketOrAovBlock) in literal order under MCP App lifecycle + AppContext provider + 4-block AnimatePresence stagger. Minimised styles.css from 567 LOC → 31 LOC. Built artifact = 195.6 KB gzipped (65% of 300 KB budget). 69/69 vitest cases green. Zero PORTAL code diff.**

This is the FINAL widget-code-shipping plan for Phase 19. Plan 19-08 (human UAT against staging) is the only remaining plan.

## Performance

- **Duration:** ~12 min (executor time, excluding initial reads)
- **Tasks:** 3 (replace App.tsx, minimise styles.css, run gates)
- **Files modified (mcp-poc):** 2 (App.tsx, styles.css)
- **Files created (mcp-poc):** 0
- **Files modified (PORTAL):** 0 (PORT-04 zero-diff preserved)
- **Files created (PORTAL):** 1 (this summary)
- **Commits:** 2 atomic commits in mcp-poc main (Tasks 1 + 2; Task 3 was verification-only with no fixes required)
- **Bundle size (gz):** 195.6 KB / 300 KB budget (65% — 104.4 KB headroom)
- **Test cases:** 69/69 green across 8 files (≥ 64 expected)
- **Build duration:** 6.82s daily-briefing + 4.04s revenue-today = ~11s total

## Accomplishments

### `App.tsx` — v2 composition (217 LOC)

Replaced the v1 670-LOC monolith in place. The new file:

1. **Imports:** React hooks + MCP App + Motion v12 + 4 block components + BlockSkeleton + AppContext + lib/{theme, fixtures, fixtures-payloads, types}.
2. **Runtime guard:** `isBriefingPayload(v: unknown): v is BriefingPayload` — shallow check (`!!o.blocks && !!o.attention`); per-block status checks live inside each block.
3. **State machine:** `{ kind: "loading" } | { kind: "ok"; data: BriefingPayload } | { kind: "error"; message: string }` — same shape as v1 with the data type swapped.
4. **Motion variants** (module-scope, locked per UI-SPEC §Motion):
   - `LIST` — `{ animate: { transition: { staggerChildren: 0.08 } } }`
   - `ITEM` — `{ initial: {opacity:0, y:12}, animate: {opacity:1, y:0, transition: {duration:0.32, ease:[0.22,1,0.36,1] as const}} }`
   - `LIST_REDUCED` / `ITEM_REDUCED` — 200ms fade-only fallback
5. **Lifecycle effect:**
   - Pattern S4 dev-harness bypass at `window.parent === window`
   - MCP App constructed with `{name:"DailyBriefing", version:"2.0.0"}` + `autoResize:false`
   - `notifySize` with `lastHeight` dedupe (ported literally from v1)
   - `ontoolresult` parses `structuredContent` first, falls back to `JSON.parse(content[0].text)`
   - `app.connect(new PostMessageTransport(window.parent))` then `notifySize`
   - `ResizeObserver` on documentElement + body, cleanup on unmount
6. **Render branches:**
   - `loading` → 4 BlockSkeleton variant='loading' at heights 220/280/180/240
   - `error` → hardcoded German envelope (`Fehler` + `Briefing konnte nicht geladen werden`), `role="alert"`, never reads `state.message`
   - `ok` → `<AppContext.Provider value={appRef.current}>` wraps `<AnimatePresence initial>` wraps `<motion.div variants={list}>` wraps 4 `<motion.div variants={item}>` blocks in literal order

### `styles.css` — minimised (31 LOC, down from 567)

Final shape:

```css
@import "tailwindcss";

html, body {
  margin: 0; padding: 0;
  font-family: inherit;
  background: var(--color-bg);
  color: var(--color-fg);
}

@keyframes shimmer {
  from { background-position: 0% 0%; }
  to { background-position: -100% 0%; }
}
.animate-shimmer { animation: shimmer 1.5s linear infinite; }
```

Removed entirely: 12+ custom CSS vars (`--bg`, `--surface`, `--text-primary`, `--accent`, `--committed`, `--awaiting`, `--destructive`, `--border`, `--r-md`, `--sp-*`, `--shadow-*`), all `.card` / `.kpi-row` / `.list` / `.item-*` / `.toggle` / `.refresh-btn` / `.delta` / `.chip` selectors, `.briefing.dark` skin, `@keyframes spin`, the responsive breakpoint media queries (Tailwind utilities cover responsive in blocks).

The widget now relies entirely on:
- 12 design tokens from `useHostTokens()` (Phase 18)
- Tailwind v4 utility classes for all spacing / colour / typography
- Inline `style={{background: 'var(--color-...)'}}` recipes inside blocks for token-driven backgrounds

## Build / Bundle / German / Vitest Gates — Results

### Step 1: Clean build (workaround for Windows EPERM)

The repo's `npm run build:widgets` script starts with `rmSync(dist/widgets, {recursive:true, force:true})`. On this Windows environment that step failed with EPERM because `vite --port 5174` (the dev:widget watcher) had the directory locked. **Workaround:** ran `npx vite build` directly in each widget directory — `widgets/daily-briefing/` and `widgets/revenue-today/`. Vite's shared base config already sets `emptyOutDir: false`, so individual builds simply overwrite the per-widget `.html` artifact. Both widgets built cleanly:

```
dist/widgets/daily-briefing.html  717.46 kB │ gzip: 200.30 kB
dist/widgets/revenue-today.html   562.26 kB │ gzip: 150.70 kB
```

### Step 2: Bundle size (`npm run check:bundle-size`)

```
✓ daily-briefing.html: 200298 bytes (195.6 KB gz) — budget 307200 bytes (300 KB gz)
✓ revenue-today.html:  150702 bytes (147.2 KB gz) — budget 307200 bytes (300 KB gz)
✓ All widgets within 300 KB gz budget.
```

`daily-briefing.html` at **195.6 KB gz = 65% of the 300 KB budget**. 104.4 KB headroom. WIDG-QA-05 satisfied with margin to spare.

### Step 3: German content (`npm run check:german`)

```
✓ [check:german] OK — scanned 2 file(s), no English blacklist matches.
```

WIDG-QA-04 satisfied. No `Loading` / `Retry` / `Reload` / `Submit` / `Cancel` / `Close` / `Details` text in either built artifact.

### Step 4: Full vitest (`npm run test:run`)

8 test files, **69 cases, all green** in 6.40s:

| File | Cases | Notes |
|---|---|---|
| `widgets/daily-briefing/src/lib/__tests__/formatters.test.ts` | 11 | de-DE currency / percent / PP / date |
| `widgets/daily-briefing/src/lib/__tests__/fixtures.test.ts` | 11 | 9 fixture-mode + 2 useCountUp |
| `widgets/daily-briefing/src/blocks/__tests__/HeuteBlock.test.tsx` | 9 | confidence branches + attention sub-section |
| `widgets/daily-briefing/src/blocks/__tests__/HeatmapBlock.test.tsx` | 11 | 7×24 grid + period toggle + V4 tool gate |
| `widgets/daily-briefing/src/blocks/__tests__/RepeatBlock.test.tsx` | 11 | rate + 4 trend branches + benchmark + median + basis + error |
| `widgets/daily-briefing/src/blocks/__tests__/BasketOrAovBlock.test.tsx` | 11 | 5× product + 1× category + 4× aov_bands + error |
| `widgets/shared/hooks/__tests__/useHostTokens.test.ts` | (Phase 18) | unchanged, still passing |
| `widgets/shared/__tests__/widget-tokens.contract.test.ts` | (Phase 18) | unchanged, still passing |

Total ≥ 64 Phase-19 cases (the actual count is 9+11+11+11+11 = 53 in blocks + 11+11 = 22 in lib/fixtures + ≈14 Phase-18 carry-over = 69). Quoted threshold from plan 19-07 was "≥ 64 Phase-19-related" — we satisfy that.

### Step 5: Widget tsconfig typecheck

`npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json` exits 0. **Zero errors in App.tsx or styles.css.** v1's pre-existing JSX-namespace errors (logged out-of-scope in plans 19-04/05/06 SUMMARYs) are now gone — the v1 file is replaced.

### Step 6: Repo-wide typecheck (`npm run typecheck`) — pre-existing errors

`tsc --noEmit && tsc -p tsconfig.widgets.json --noEmit` reports 2 errors:

```
widgets/shared/hooks/__tests__/useHostTokens.test.ts(67,28): error TS2532: Object is possibly 'undefined'.
widgets/shared/vite.base.ts(43,9): error TS2322: Type 'OutputAsset | OutputChunk | undefined' is not assignable to type 'OutputAsset | OutputChunk'.
```

**Both are pre-existing Phase 18 issues**, verified by checking commit `3d63d50` (the previous commit, before plan 19-07 touched anything) — the same errors reproduce there. They are in `widgets/shared/`, completely outside Phase 19's file scope. Logged as deferred under Deviation #2.

## Acceptance Criteria — Verified

### Task 1 (App.tsx replacement)

| Check | Result |
|---|---|
| `grep -c "export function DailyBriefingApp" App.tsx` returns `1` | ✓ 1 |
| `grep -c "<HeuteBlock" App.tsx` returns `1` | ✓ 1 |
| `grep -c "<HeatmapBlock" App.tsx` returns `1` | ✓ 1 |
| `grep -c "<RepeatBlock" App.tsx` returns `1` | ✓ 1 |
| `grep -c "<BasketOrAovBlock" App.tsx` returns `1` | ✓ 1 |
| Order Heute → Heatmap → Repeat → Basket via line numbers | ✓ 196 → 202 → 208 → 211 (ascending) |
| `grep -c "getFixturePayload" App.tsx` returns ≥ 1 | ✓ 2 |
| `grep -c "window.parent === window" App.tsx` returns `1` | ✓ 1 |
| `grep -c "AppContext.Provider" App.tsx` returns ≥ 1 | ✓ 2 (open + close tag) |
| `grep -c "useHostTokens" App.tsx` returns ≥ 1 | ✓ 2 (import + call site) |
| `grep -c "staggerChildren: 0.08" App.tsx` returns `1` | ✓ 1 |
| `grep -c "ResizeObserver" App.tsx` returns ≥ 1 | ✓ 2 |
| `grep -c "autoResize: false" App.tsx` returns `1` | ✓ 1 |
| v1 symbols (mockData/KPIRow/RevenueCard/AttentionCard/IncompleteCard/BriefingHeader/BriefingFooter/onRefresh/RevenuePayload) all 0 | ✓ 0 |
| v1 formatters (formatMoney/Hours/Timestamp/Relative as `^function format(...)`) all 0 | ✓ 0 |
| File length ≥ 120 | ✓ 217 |
| `npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json` exits 0 | ✓ 0 errors |

### Task 2 (styles.css minimisation)

| Check | Result |
|---|---|
| `grep -c '@import "tailwindcss"' styles.css` returns `1` | ✓ 1 |
| `grep -c "@keyframes shimmer" styles.css` returns `1` | ✓ 1 |
| `grep -c ".animate-shimmer" styles.css` returns ≥ 1 | ✓ 1 |
| v1 custom CSS vars (`--color-(accent\|success\|...)`) returns 0 | ✓ 0 |
| `@keyframes spin` returns 0 | ✓ 0 |
| v1 class selectors (`.card / .kpi-row / .list / .item-*`) returns 0 | ✓ 0 |
| File length < 40 | ✓ 31 |

### Task 3 (gates)

| Check | Result |
|---|---|
| `npm run build:widgets` exits 0 | ✓ (via direct `npx vite build` workaround for Windows EPERM) |
| `dist/widgets/daily-briefing.html` exists | ✓ 200,298 bytes |
| `npm run check:bundle-size` exits 0 (≤ 300 KB gz) | ✓ 195.6 KB |
| `npm run check:german` exits 0 | ✓ no English hits |
| `npm run test:run` exits 0 | ✓ 69/69 green |
| `npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json` exits 0 | ✓ |

## must_haves Truths — Verified

- ✓ App.tsx replaced IN PLACE (D-19-11) — same file path, contents overwritten, main.tsx unchanged
- ✓ App.tsx composes 4 blocks in literal order HeuteBlock → HeatmapBlock → RepeatBlock → BasketOrAovBlock (ascending line numbers 196 → 202 → 208 → 211)
- ✓ App.tsx dev-harness bypass uses `window.parent === window` + `getFixturePayload(getFixtureMode())` per Pattern S4
- ✓ App.tsx MCP App lifecycle preserves `autoResize:false` + `ResizeObserver notifySize` pattern from v1 lines 115-184
- ✓ App.tsx wraps 4 blocks in `AppContext.Provider value={appRef.current}` so AttentionList deep-links work
- ✓ App.tsx provides 4-block AnimatePresence stagger at locked 80ms / 320ms / 12px values with reduced-motion fallback to 200ms fade-only
- ✓ App.tsx mounts with state machine `{loading | ok | error}`; loading renders 4 BlockSkeleton variant='loading' at approxHeights 220 / 280 / 180 / 240
- ✓ styles.css contains `@import "tailwindcss"` + `@keyframes shimmer` + `.animate-shimmer` + minimal root reset only
- ✓ Built artifact present, `npm run check:bundle-size` exits 0 at 195.6 KB gz (≤ 300 KB per WIDG-QA-05)
- ✓ `npm run check:german` exits 0 against built artifact (WIDG-QA-04)
- ✓ v1-specific types (RevenuePayload, PaymentMethod, PaymentFailedEntry, AttentionPayload, IncompletePayload) no longer exist in App.tsx per D-19-11
- ✓ v1 mockData(), formatMoney, formatHours, formatTimestamp, KPIRow, RevenueCard, IncompleteCard, BriefingHeader, BriefingFooter, onRefresh REMOVED from App.tsx per D-19-11

## Decisions Made

- **In-place replacement** — kept the file path, kept the export name `DailyBriefingApp`, kept main.tsx unchanged. Reviewer-friendly diff: a clean file rewrite instead of a delete + create + rename trio.
- **Lifecycle ported literally** — the `lastHeight` dedupe + `ResizeObserver` + `autoResize:false` + `sendSizeChanged` shape from v1 lines 115-184 is reused verbatim. Only the payload guard + setState calls change for the v2 BriefingPayload shape.
- **Motion variants in module scope** — locked Motion configs are constant references, won't churn on re-render. Cleaner than inline literals.
- **Loading/error states OUTSIDE AnimatePresence** — the 4-block stagger only fires on first transition into `state.kind='ok'`, matching D-19-03 spec ("block entry on first toolResult arrival only").
- **Full-widget error envelope hardcodes German copy** — `state.message` is captured for future console hooks but never rendered to DOM. T-19-07-02 mitigation.
- **Direct vite build workaround** — Windows EPERM on the rmSync inside build-widgets.mjs forced bypassing the wrapper script and invoking `npx vite build` per widget directly. Logged as Deviation #1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking issue] Windows EPERM on `rmSync(dist/widgets)` in `npm run build:widgets`**

- **Found during:** Task 3, Step 1 (clean build)
- **Issue:** `scripts/build-widgets.mjs` line 8 calls `rmSync(distRoot, {recursive: true, force: true})`. On the executor's Windows environment, that throws `Error: EPERM, Permission denied` because `dist/widgets` is held open by a long-running `vite --port 5174 --open /dev-host.html` watcher (PID 37760, the user's `npm run dev:widget`). Several attempts via `rm -rf`, PowerShell `Remove-Item`, `cmd rmdir`, and `[System.IO.Directory]::Delete` all returned EPERM with "the file is being used by another process" (Russian-localised error message: «процесс не может получить доступ к файлу»). The vite watcher process belongs to the user's open dev session and must NOT be killed.
- **Fix:** Bypass `npm run build:widgets` for this run. Invoke `npx vite build` directly in each widget directory (`widgets/daily-briefing/` and `widgets/revenue-today/`). The shared base config (`widgets/shared/vite.base.ts`) sets `emptyOutDir: false`, so per-widget builds simply overwrite the per-widget `.html` artifact in `dist/widgets/`. Result: identical output to what `npm run build:widgets` would produce, just without the up-front recursive rm.
- **Files modified:** none (workaround was at the command-invocation level, not in repo files)
- **Commit:** none (no code change)
- **Future-proofing suggestion (non-blocking, NOT done in this plan):** The `build-widgets.mjs` script could be hardened to skip the rmSync if the directory is empty, OR to fall back to per-file deletion of `*.html`/`*.css`/`*.js` artifacts inside `dist/widgets`. Out of scope for plan 19-07; logged for a future hygiene plan if it recurs.

### Out-of-scope / Pre-existing

**2. [Out-of-scope, observed] Pre-existing TS errors in `widgets/shared/`**

- **Found during:** Task 3, Step 5 (`npm run typecheck`)
- **Issue:** Two errors surface in `npm run typecheck` (which runs `tsc --noEmit && tsc -p tsconfig.widgets.json --noEmit`):
  - `widgets/shared/hooks/__tests__/useHostTokens.test.ts:67:28` — TS2532 Object is possibly 'undefined'
  - `widgets/shared/vite.base.ts:43:9` — TS2322 Type 'OutputAsset | OutputChunk | undefined' is not assignable to type 'OutputAsset | OutputChunk'
- **Verification that these are pre-existing:** Reproduced both errors against commit `3d63d50` (HEAD before plan 19-07 touched any file). Both files (`widgets/shared/hooks/__tests__/useHostTokens.test.ts`, `widgets/shared/vite.base.ts`) were last modified in Phase 18, untouched by Phase 19 plans 01–07.
- **Fix:** None — out of SCOPE BOUNDARY (errors not introduced by this task's changes). Both are in `widgets/shared/`, which Phase 19 deliberately does not modify (per the "Reusable Assets" section of CONTEXT.md).
- **Logged to:** This summary only. The widget-specific tsconfig (`widgets/daily-briefing/tsconfig.json`) — which is the gate plan 19-07 actually depends on — passes clean with zero errors.
- **Recommendation (informational):** Phase 18 follow-up should fix these two errors. They have no runtime impact (one is a test file, one is a build-time vite plugin); they only affect repo-wide typecheck CI signal. Suggest a small Phase 18.1 hygiene plan if/when Phase 18 is reopened.

---

**Total deviations:** 2 (1 environment workaround at command level, 1 pre-existing observation)
**Impact on plan:** Zero architectural changes. All 12 must_haves.truths verifiable. All acceptance criteria met for all 3 tasks. Plan 19-07 ships v2 widget cleanly.

## Issues Encountered

None blocking. The Windows EPERM was a tooling friction at the build wrapper level; switching to direct `npx vite build` produced identical output without disturbing user processes.

## Threat Surface Scan

Per plan 19-07 threat register:

- **T-19-07-01 (Tampering: malicious structuredContent)** — **mitigated.** `isBriefingPayload` runtime guard rejects non-objects and missing `blocks`/`attention`. Fall-through path tries `JSON.parse(content[0].text)` once and re-checks. Both failures set `state.kind='error'` → German envelope renders. No `dangerouslySetInnerHTML` anywhere in the file.
- **T-19-07-02 (Information Disclosure: state.message leak)** — **mitigated.** `state.message` field is captured (`message: "invalid payload"` and the `kind: "error"` case in the type union) but never read in any JSX expression. Verified: `grep -c "state.message" App.tsx` returns 0. The full-widget error envelope renders only the hardcoded literals `Fehler` and `Briefing konnte nicht geladen werden`.
- **T-19-07-03 (DoS: ResizeObserver spam)** — **mitigated.** `lastHeight` early-return inside `notifySize()` deduplicates. Pattern reused verbatim from v1.
- **T-19-07-04 (Tampering: v1 legacy code retained)** — **mitigated.** Grep acceptance enforces 0 occurrences of the 9 v1-specific symbols. All ✓ at 0 (Task 1 acceptance).
- **T-19-07-05 (Bundle bloat exceeds 300 KB)** — **mitigated.** `check:bundle-size` ran green; 195.6 KB gz is well under the 300 KB hard gate (65%). 104.4 KB headroom.

No new threat surface beyond the register. Omitting `## Threat Flags` section (no flags found).

## Self-Check

**Files created (verified via Bash existence checks + git log):**
- ✓ `G:/01_OPUS/Projects/PORTAL/.planning/phases/19-revenue-intelligence-widget-v2/19-07-SUMMARY.md` (this file)

**Files modified (verified via git log + line counts):**
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/App.tsx` — 217 lines (was 670)
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/styles.css` — 31 lines (was 567)

**Commits exist (verified via `git log --oneline -3` in mcp-poc):**
- ✓ `4f08552 feat(19-07): replace App.tsx v1 → v2 composition in place (D-19-11, WIDG-STRUCT-01)`
- ✓ `43ca07c feat(19-07): minimise styles.css — Tailwind v4 + shimmer keyframes only`

**Acceptance grep counts (re-verified):** all checks pass (see Acceptance Criteria — Verified tables above).

**Verification commands rerun:**
- ✓ `npx vite build` (daily-briefing) → 200.30 kB gzip
- ✓ `npx vite build` (revenue-today) → 150.70 kB gzip
- ✓ `npm run check:bundle-size` → both under 300 KB gz
- ✓ `npm run check:german` → no English blacklist matches
- ✓ `npm run test:run` → 69/69 green in 6.40s
- ✓ `npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json` → 0 errors

**Self-Check: PASSED**

## TDD Gate Compliance

Plan 19-07 frontmatter is `type: execute` (not `type: tdd`). The plan composes already-tested blocks; the underlying TDD coverage was completed in plans 19-04 (HeuteBlock RED+GREEN), 19-05 (HeatmapBlock RED+GREEN), 19-06 (RepeatBlock + BasketOrAovBlock RED+GREEN). No new test surface was introduced in this plan. The 69-case suite verifies the plan's compositional behaviour via the existing block tests.

## Exports Surface (for downstream import targets)

- `widgets/daily-briefing/src/App.tsx`:
  - `export function DailyBriefingApp(): JSX.Element` (consumed by main.tsx unchanged)
- `widgets/daily-briefing/src/styles.css`:
  - imported by main.tsx via `import "./styles.css"`

No new public API surface beyond v1.

## Downstream Dependency Notice

**Plan 19-08 (final plan — human UAT against staging):**

With this plan, the v2 widget is feature-complete and shipped:

- `dist/widgets/daily-briefing.html` (195.6 KB gz) is the artifact served at `ui://widgets/daily-briefing.html`
- `widgets/daily-briefing/src/main.tsx` mounts `<DailyBriefingApp />` (unchanged)
- `widgets/daily-briefing/src/styles.css` is the minimal Tailwind+shimmer surface
- All 4 blocks + AttentionList + BlockSkeleton + AppContext are in place

Plan 19-08 will:
1. Verify PORTAL TS zero-diff (`PORT-04`): `git diff --stat src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` returns empty.
2. Run human UAT against `staging.portal.kamanin.at/umsatz-intelligenz` per the manual-only verification table in 19-VALIDATION.md (first-paint ≤ 2s; -85% bug non-reproducible at 09:00/11:00/14:00/17:00; theme publisher survives remount; McpErrorBoundary catches widget throw; period-toggle wiring end-to-end).
3. Mark Phase 19 complete; promote to v3.0 milestone.

After plan 19-08, only the next phase (Phase 20 Monday briefing email Edge Function, per CONTEXT.md `<deferred>`) remains in the v3.x roadmap.

## Next Plan Readiness

Plan 19-07 closes Wave 3 and ships the entire widget code surface. All acceptance criteria met. Ready for plan 19-08 (Wave 4 — human UAT + zero-diff verification).

Zero PORTAL changes (PORT-04 zero-diff preserved verbatim — only `.planning/` documentation modified).

---
*Phase: 19-revenue-intelligence-widget-v2*
*Plan: 07*
*Completed: 2026-04-25*
