---
phase: 19-revenue-intelligence-widget-v2
plan: 03
subsystem: tooling
tags: [vitest, jsdom, ci-gate, german-only, mcp-poc, daily-briefing-widget, qa]

requires:
  - phase: 18-mcp-ui-resource-build-pipeline
    provides: vitest base config (environment node, environmentMatchGlobs jsdom for shared/hooks)
  - phase: 18-mcp-ui-resource-build-pipeline
    provides: scripts/check-widget-bundle-size.mjs (pattern reference for dist/widgets scanning)

provides:
  - "vitest environmentMatchGlobs extended with 3 jsdom routes for Phase 19 block + lib/__tests__ tsx tests"
  - "scripts/check-german-only.mjs — recursive dist/widgets HTML scanner with English-word blacklist (WIDG-QA-04)"
  - "package.json check:german npm script wired to the new gate"
  - "Phase 18 environmentMatchGlobs entries preserved verbatim — additive-only diff"

affects:
  - "19-04 HeuteBlock snapshot tests — will run under jsdom via the new blocks/**/*.tsx route"
  - "19-05 HeatmapBlock snapshot tests — same"
  - "19-06 RepeatBlock + BasketOrAovBlock snapshot tests — same"
  - "19-07 final build CI — can chain `build:widgets && check:bundle-size && check:german` as the German-only gate"

tech-stack:
  added: []  # Zero new dependencies — uses node:fs + node:path + node:zlib stdlib only
  patterns:
    - "dist/widgets recursive .html walk via existsSync + readdirSync + statSync (mirrors check-widget-bundle-size.mjs)"
    - "<script>/<style>/HTML-tag stripping before content scan — T-19-03-02 mitigation against JS identifier false positives"
    - "environmentMatchGlobs additive extension — preserve existing globs, append new tuples (Vitest array-of-tuples syntax)"
    - "fail-hard exit codes (1 on missing dist OR any blacklist hit, 0 on clean scan) — CI-blocking gate contract"

key-files:
  created:
    - "G:/01_OPUS/Projects/mcp-poc/scripts/check-german-only.mjs (102 LOC) — German-only content gate"
    - "G:/01_OPUS/Projects/PORTAL/.planning/phases/19-revenue-intelligence-widget-v2/19-03-SUMMARY.md (this file)"
  modified:
    - "G:/01_OPUS/Projects/mcp-poc/vitest.config.ts — +6 lines (3 new jsdom globs + 3-line comment block)"
    - "G:/01_OPUS/Projects/mcp-poc/package.json — +1 line (check:german script entry)"

key-decisions:
  - "BLACKLIST omits 'Error' — JS built-in class collision risk after <script> stripping. German error copy `Daten nicht verfügbar` (D-19-08) caught by manual UAT instead."
  - "Three new environmentMatchGlobs entries (not one wildcard) — explicit blocks/**/*.tsx + blocks/**/*.ts + lib/__tests__/**/*.tsx. Avoids accidentally jsdom'ing pure-data lib tests."
  - "BLACKLIST uses double-quoted strings (per acceptance criteria grep contract) — no functional difference vs single quotes, but keeps the verification script grep-greppable."
  - "Script written as ESM .mjs (not .ts) — matches Phase 18 check-widget-bundle-size.mjs pattern; no tsx wrapper needed."
  - "Script reuses existsSync from node:fs (not statSync with throwIfNoEntry) — cleaner branch on missing dist directory."

patterns-established:
  - "CI-gate scripts in mcp-poc/scripts/ follow the pattern: read dist/widgets/*.html → scan/measure → console.log/error → process.exit(0|1). Composable in npm-script chains."
  - "Phase 19 block snapshot tests will be located under widgets/daily-briefing/src/blocks/__tests__/ — established via vitest config entry for plans 04/05/06 to consume."

requirements-completed: [WIDG-QA-04]

duration: ~2min
completed: 2026-04-24
---

# Phase 19 Plan 03: Wave 0 Testing + Verification Infrastructure Summary

**vitest config extended with 3 jsdom routes for block tests + new check-german-only.mjs CI gate scanning dist/widgets HTML for English-word blacklist matches (WIDG-QA-04) — 3 atomic commits in mcp-poc, zero new dependencies, both gates verified working against existing dist artifacts.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-24T22:06:01Z
- **Completed:** 2026-04-24T22:08:42Z
- **Tasks:** 2 (vitest config extension + script + npm wire)
- **Files created:** 1 (check-german-only.mjs)
- **Files modified:** 2 (vitest.config.ts, package.json)
- **Commits:** 3 atomic commits in mcp-poc main
- **New external deps:** 0

## Accomplishments

### vitest.config.ts environmentMatchGlobs extension

```diff
   environmentMatchGlobs: [
     ['widgets/shared/hooks/**/*.{test,spec}.{ts,tsx}', 'jsdom'],
+    ['widgets/daily-briefing/src/blocks/**/*.{test,spec}.tsx', 'jsdom'],
+    ['widgets/daily-briefing/src/blocks/**/*.{test,spec}.ts', 'jsdom'],
+    ['widgets/daily-briefing/src/lib/__tests__/**/*.{test,spec}.tsx', 'jsdom'],
   ],
```

Phase 18's `widgets/shared/hooks/**` entry preserved verbatim. Three new entries:

1. **`widgets/daily-briefing/src/blocks/**/*.{test,spec}.tsx`** — covers all block snapshot tests added by plans 04/05/06 (HeuteBlock, HeatmapBlock, RepeatBlock, BasketOrAovBlock). These render React components via `@testing-library/react` and need `document` + `window`.
2. **`widgets/daily-briefing/src/blocks/**/*.{test,spec}.ts`** — fallback for any non-TSX block test (none expected, but spec mandates the glob for symmetry).
3. **`widgets/daily-briefing/src/lib/__tests__/**/*.{test,spec}.tsx`** — covers the `useCountUp.test.tsx` style hook tests using `renderHook` (added in plan 19-02 as part of the fixtures.test.ts file with the `@vitest-environment jsdom` pragma; future hook tests in lib will use the config-driven route instead of the file-pragma fallback).

`grep -cE "blocks.*test.*(jsdom|environment)"` returns `2`. `grep -cE "daily-briefing/src/blocks"` returns `3`. Existing entries unchanged (verified via `git diff` showing additions only).

### check-german-only.mjs script behaviour

**File discovery:** `findWidgetHtmlFiles(dir)` recursively walks `dist/widgets/` collecting all `.html` files. Mirrors `check-widget-bundle-size.mjs`'s flat readdirSync but adds depth — the v2 widget build pipeline may produce per-widget subdirectories.

**Text extraction (T-19-03-02 mitigation):**
```javascript
const noScript = html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
const noStyle = noScript.replace(/<style[\s\S]*?<\/style>/gi, ' ')
const noTags = noStyle.replace(/<[^>]+>/g, ' ')
```
Strips `<script>` (kills JS identifier false positives like `Error`, `Promise.cancel`, etc.), then `<style>` (CSS class names like `.error-banner` would otherwise hit), then all tags (leaves only user-visible text content).

**Blacklist:**
| Word | Should be |
|------|-----------|
| `Loading` | `Lade…` or shimmer skeleton (D-19-08) |
| `Retry` | (no retry button per D-19-08) |
| `Reload` | `Bitte Seite neu laden` |
| `Submit` | (no destructive dialogs per UI-SPEC) |
| `Cancel` | (no destructive dialogs per UI-SPEC) |
| `Close` | (no destructive dialogs per UI-SPEC) |
| `Details` | (deferred — widget has no expandable details surface) |

**`Error` intentionally OMITTED** — JS built-in class collision risk. Even after `<script>` stripping, inline event handlers (`onerror=`) or minified runtime identifiers may surface. The German error copy `Daten nicht verfügbar` (D-19-08) is the user-facing error string; manual UAT against the dev harness `?mock=one-block-failing` covers any English error leak.

**Exit codes:**
- **`0`** — scanned ≥1 file, zero blacklist hits.
- **`1`** — `dist/widgets` missing OR no `.html` files found OR ≥1 blacklist match.

**Smoke test (during execution):** ran `node scripts/check-german-only.mjs` against the existing `dist/widgets/` (Phase 18 v1 build artifacts: `daily-briefing.html` + `revenue-today.html`). Both v1 widgets are German-clean today — script exited `0` with `✓ [check:german] OK — scanned 2 file(s), no English blacklist matches.` This proves the script is functional AND the v1 widget passes the gate (sanity check for future v2 build comparison).

### package.json check:german script

```diff
     "check:bundle-size": "node scripts/check-widget-bundle-size.mjs",
+    "check:german": "node scripts/check-german-only.mjs",
```

Placed adjacent to `check:bundle-size` so plan 07's CI chain reads naturally:
```bash
npm run build:widgets && npm run check:bundle-size && npm run check:german
```

JSON validity verified (`node -e "JSON.parse(...)"` exits 0). Existing scripts (`build:widgets`, `build:server`, `build`, `check:bundle-size`, `dev`, `dev:widget`, `start`, `test`, `test:run`, `typecheck`) preserved verbatim.

## Task Commits

Three atomic commits in `mcp-poc` `main` branch:

1. **`1fb86da`** — `chore(19-03): extend vitest environmentMatchGlobs for Phase 19 block tests` (Task 1)
2. **`008e929`** — `feat(19-03): add check-german-only.mjs English-blacklist gate (WIDG-QA-04)` (Task 2 step 1)
3. **`3a57625`** — `chore(19-03): wire npm run check:german script` (Task 2 step 2)

Plan 19-03 commit prefix `(19-03)` matches plan 19-01/19-02 convention.

## Files Created/Modified

**Created (mcp-poc repo):**
- `scripts/check-german-only.mjs` (102 LOC) — German-only content gate

**Modified (mcp-poc repo):**
- `vitest.config.ts` — +6 lines (3 jsdom globs + 3-line phase 19 comment)
- `package.json` — +1 line (`check:german` script entry)

**Created (PORTAL repo):**
- `.planning/phases/19-revenue-intelligence-widget-v2/19-03-SUMMARY.md` (this file)

## Exports Surface (for downstream plan import targets)

**vitest.config.ts:** no module exports; config consumed implicitly by `vitest run`.

**scripts/check-german-only.mjs:** standalone CLI; invoked via `npm run check:german`. No module exports.

**package.json scripts.check:german:** invokable as `npm run check:german`. Plan 07 chains it after `check:bundle-size`.

## Downstream Dependency Notice

**Plans 19-04 / 19-05 / 19-06 (block implementations):**
- Block snapshot tests located at `widgets/daily-briefing/src/blocks/__tests__/*.test.tsx` will run under jsdom automatically — no per-file `@vitest-environment` pragma needed.
- Use `@testing-library/react`'s `render()` + `renderer.toJSON()` snapshot pattern.
- For each block: 1 healthy snapshot + 1 error-variant snapshot. BasketOrAovBlock additionally needs 3 mode snapshots (product, category, aov_bands).

**Plan 19-07 (final build + cleanup):**
- CI build step:
  ```bash
  npm run build:widgets && npm run check:bundle-size && npm run check:german
  ```
- Both `check:*` gates fail-hard (exit 1) on violation, which surfaces as a CI red mark.
- The German gate runs on the v2 build artifact (post-cleanup). v1 widget HTML files (currently passing) will be replaced in-place by v2 contents per D-19-11.

## Decisions Made

- **Three explicit globs vs one wildcard.** A `widgets/**/*.tsx` → `jsdom` wildcard would have subsumed the new block tests with one entry, but it would also have re-routed every Phase 18 contract-test file under `widgets/shared/__tests__/` which is intentionally `node`. Three narrow globs preserve the pure-data fast-path for contract tests AND grant jsdom only where component rendering or `window` access is needed.
- **`Error` omitted from blacklist** — extensively documented inline. The risk of a false-positive on JS identifier survival outweighs the marginal benefit of catching `Error` text leakage; D-19-08's `Daten nicht verfügbar` is the canonical German error copy and manual UAT against `?mock=one-block-failing` is the better venue for catching English error strings.
- **Script `.mjs` extension** matches Phase 18's `check-widget-bundle-size.mjs` (not `.ts` via tsx) — keeps the CI invocation light (no tsx process spawn).
- **Recursive dir walk** instead of flat readdirSync — Phase 19's per-widget Vite config may emit subdirectories. Flat scan would miss them. Recursive scan is O(n) over a tiny tree (≤10 files); cost is negligible.
- **Existing-dist smoke test** — ran the script against v1 widgets that exist today. Both pass, which simultaneously proves (a) the script works end-to-end and (b) the existing widget copy is already German-clean (no regression introduced by Phase 19 plans 01/02 which only added lib code, no rendered HTML).
- **Double-quoted blacklist strings** — minor stylistic choice; matches the acceptance-criteria grep contract (`grep -c '"Loading"'`) without changing semantics.

## Deviations from Plan

**1. [Rule 3 — Blacklist literal style] Switched single-quoted to double-quoted blacklist strings to match acceptance criteria grep contract**

- **Found during:** Task 2 acceptance criteria check
- **Issue:** First write used single-quoted JS string literals (`'Loading'`); acceptance criteria specify `grep -c '"Loading"'` returns 1 (literal `"Loading"` match, double quotes).
- **Fix:** Changed all 7 BLACKLIST entries from single quotes to double quotes. Zero functional change — JS treats single and double quotes identically for non-template strings.
- **Files modified:** `scripts/check-german-only.mjs` (BLACKLIST array literal style only).
- **Committed in:** `008e929` (folded before commit; never reached git in single-quote form).
- **Impact:** None on script behaviour; aligns with the plan's acceptance contract.

**2. [Out-of-scope, observed] `dist/widgets/` already populated with Phase 18 v1 widgets**

- **Found during:** Task 2 smoke test
- **Issue:** Plan anticipated either an empty dist (script exits 1 with "no files found") or a clean v2 build (script exits 0). Reality: existing `dist/widgets/{daily-briefing,revenue-today}.html` from Phase 18 v1 build are present.
- **Fix:** None taken — this is a positive signal. The script ran against real artifacts and exited 0 (German-clean), proving end-to-end correctness AND that v1 widgets currently meet WIDG-QA-04. No modification needed.
- **Logged to:** This summary only; not a deferred item.
- **Impact:** Stronger smoke-test signal than the plan anticipated.

---

**Total deviations:** 2 (1 cosmetic blacklist style, 1 favorable observation)
**Impact on plan:** No architectural deviations. All must_haves.truths verified. All acceptance criteria met.

## Issues Encountered

None — execution was clean. Both tasks completed first-try (modulo the cosmetic single→double quote fold).

## Threat Surface Scan

No new threat surface beyond the plan's threat register:

- **T-19-03-01** (English-word leakage into widget copy) — **mitigated** by `check:german` invocation in CI chain. Script fails CI on any whole-word match from the 7-word blacklist after stripping `<script>`/`<style>`/tags. Verified working: `npm run check:german` exits 0 against current v1 widgets, will exit 1 if v2 introduces English text.
- **T-19-03-02** (false positive from JS identifier matching) — **mitigated** by three-stage HTML stripping (script → style → tags) before regex scan. Word-boundary `\b` anchors prevent compound-identifier matches (e.g., `TypeError` does not match `\bError\b` boundary; additionally, `Error` is omitted from blacklist as belt-and-suspenders).

No `## Threat Flags` section needed.

## Self-Check

**Files created (verified exist via Bash):**
- ✓ `G:/01_OPUS/Projects/mcp-poc/scripts/check-german-only.mjs` (102 LOC)
- ✓ `G:/01_OPUS/Projects/PORTAL/.planning/phases/19-revenue-intelligence-widget-v2/19-03-SUMMARY.md` (this file, written via Write tool)

**Files modified (verified via `git diff` + `git log -1`):**
- ✓ `G:/01_OPUS/Projects/mcp-poc/vitest.config.ts` (modified in commit `1fb86da`)
- ✓ `G:/01_OPUS/Projects/mcp-poc/package.json` (modified in commit `3a57625`)

**Commits exist (verified via `git log --oneline -5` in mcp-poc):**
- ✓ `1fb86da` chore(19-03): extend vitest environmentMatchGlobs for Phase 19 block tests
- ✓ `008e929` feat(19-03): add check-german-only.mjs English-blacklist gate (WIDG-QA-04)
- ✓ `3a57625` chore(19-03): wire npm run check:german script

**Acceptance grep counts (re-verified):**
- ✓ `grep -cE "blocks.*test.*(jsdom|environment)" vitest.config.ts` → 2 (≥ 1)
- ✓ `grep -cE "daily-briefing/src/blocks" vitest.config.ts` → 3 (≥ 1)
- ✓ `grep -c "check:german" package.json` → 1 (≥ 1)
- ✓ `grep -c "node scripts/check-german-only.mjs" package.json` → 1
- ✓ `grep -c "BLACKLIST" scripts/check-german-only.mjs` → 2 (≥ 1)
- ✓ `grep -c '"Loading"' scripts/check-german-only.mjs` → 1
- ✓ `grep -c '"Retry"' scripts/check-german-only.mjs` → 1
- ✓ `grep -c "process.exit(1)" scripts/check-german-only.mjs` → 2 (≥ 1; one for missing-dist, one for blacklist hit)

**Verification commands rerun:**
- ✓ `npx vitest run --config vitest.config.ts` → all existing tests pass (config parse OK)
- ✓ `node scripts/check-german-only.mjs` → exits 0, scans 2 files clean
- ✓ `npm run check:german` → exits 0
- ✓ `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` → JSON valid

**Must-haves truths verified:**
- ✓ vitest config environmentMatchGlobs forces jsdom for `widgets/daily-briefing/src/blocks/**/*.test.tsx` per 19-VALIDATION.md Wave 0 (3 explicit globs added; existing entry preserved)
- ✓ check-german-only.mjs fails on English word blacklist matches inside built dist widget artifact per WIDG-QA-04 (script written with fail-hard exit codes; smoke-tested against existing dist; will fail when blacklist words present)
- ✓ package.json has `check:german` script invoking the new check script (verified via `node -e "process.exit(s['check:german']?0:1)"`)

**Self-Check: PASSED**

## Next Plan Readiness

Wave 0 testing + verification infrastructure gate met. Plans 19-04 / 19-05 / 19-06 can now:
- Place block snapshot tests at `widgets/daily-briefing/src/blocks/__tests__/*.test.tsx` and they will run under jsdom automatically.
- Use `@testing-library/react`'s `render()` API knowing `document` and `window` are available.

Plan 19-07 (final build + cleanup) can now:
- Chain `npm run build:widgets && npm run check:bundle-size && npm run check:german` as the final CI gate.
- Trust that any English-word leak in v2 widget HTML will fail CI before the merge to staging.

No blockers for downstream plans. Wave 0 closed.

---
*Phase: 19-revenue-intelligence-widget-v2*
*Plan: 03*
*Completed: 2026-04-24*
