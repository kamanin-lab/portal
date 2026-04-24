---
phase: 19-revenue-intelligence-widget-v2
plan: 01
subsystem: ui
tags: [react, typescript, vitest, intl, de-DE, mcp-poc, daily-briefing-widget]

requires:
  - phase: 17-kamanda-mcp-server-expansion
    provides: BriefingPayload + bridge data shapes (RunRateData, HeatmapData, RepeatData, BasketData, PaymentAttentionPayload) — locked source of truth for type duplication
  - phase: 18-mcp-ui-resource-build-pipeline
    provides: useHostTokens hook + 12-token shared module + per-widget vite config + vitest setup — foundation rails consumed by theme.ts re-export

provides:
  - "BriefingPayload type duplication mirrored from mcp-server.ts (D-19-12) — no cross-boundary import"
  - "Block<T> discriminated union + 5 data-shape types ready for downstream block consumption"
  - "de-DE formatters: formatCurrency, formatPercent, formatPP, formatDate (11/11 vitest cases green)"
  - "theme.ts thin wrapper: re-exports useHostTokens + adds applyTokens helper for non-React consumers"
  - "BlockSkeleton component with loading + error variants (German-locked copy, no retry button)"

affects:
  - "19-02-* (block plans HeuteBlock/HeatmapBlock/RepeatBlock/BasketOrAovBlock — all import from these foundation files)"
  - "19-03-* (App.tsx composition + bundle-size verification)"
  - "Future widget plans needing de-DE formatting helpers"

tech-stack:
  added: []  # No new dependencies — used existing Intl + React 19 + vitest from Phase 18
  patterns:
    - "KEEP IN SYNC header for cross-boundary type duplication (Phase 18 D-18-03 pattern applied to BriefingPayload)"
    - "TDD vertical slice: failing test commit (RED) → implementation commit (GREEN)"
    - "Single component with variant prop instead of two sibling components (BlockSkeleton)"
    - "Inline CSS custom-property references via style prop instead of arbitrary Tailwind classes (token consumption)"

key-files:
  created:
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/types.ts (115 LOC)"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/formatters.ts (36 LOC)"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/theme.ts (18 LOC)"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/BlockSkeleton.tsx (50 LOC)"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/__tests__/formatters.test.ts (56 LOC)"
  modified: []

key-decisions:
  - "Use U+202F NARROW NO-BREAK SPACE (DIN 5008 thin space) before % and PP per D-19-10"
  - "Use U+2212 MINUS SIGN (typographic) instead of U+002D hyphen-minus for negative percentages"
  - "Currency space character is U+00A0 (whatever Intl.NumberFormat de-DE emits) — verified via Node REPL probe before writing test assertions"
  - "BlockSkeleton uses single component with variant prop (not two sibling components) — simpler imports for downstream blocks"
  - "Date matcher tolerant of both 'Di.' (Node ICU) and 'Di' (browser-typical) weekday short forms — keeps suite portable"

patterns-established:
  - "TDD execution: separate test commit (RED) and implementation commit (GREEN) for visible vertical slice"
  - "Whitespace probing before assertion: Node REPL inspection of Intl output to discover actual codepoints"
  - "Acceptance criteria pragmatism: TS literal types (variant: 'loading' | 'error') retained as public API contract even when grep-only criterion would flag them"

requirements-completed: [WIDG-STRUCT-01, WIDG-STRUCT-03, WIDG-STRUCT-05]

duration: 6min
completed: 2026-04-24
---

# Phase 19 Plan 01: Foundation Lib + BlockSkeleton Summary

**de-DE formatter suite (vitest 11/11 green) + BriefingPayload duplication header + theme.ts re-export + BlockSkeleton single-variant component — five files, zero new deps, downstream blocks unblocked**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-04-24T21:47:00Z
- **Completed:** 2026-04-24T21:53:11Z
- **Tasks:** 4
- **Files created:** 5
- **Tests:** 11 (formatters), all green
- **New external deps:** 0

## Accomplishments

- BriefingPayload + Block<T> + 5 data-shape types duplicated from mcp-server.ts under a KEEP IN SYNC header (D-19-12) — downstream blocks (04/05/06) can import all required types
- de-DE formatter suite ships with TDD vertical slice (failing test commit → implementation commit); covers currency thousands-dot + non-breaking space, percent with U+2212 minus + thin space, percentage-points, weekday-short date
- theme.ts re-exports useHostTokens + adds applyTokens helper iterating all 12 WIDGET_TOKENS (WIDG-STRUCT-03 satisfied)
- BlockSkeleton ships with German-locked copy 'Daten nicht verfügbar' + 'Bitte Seite neu laden', ARIA-labeled (aria-busy + role=status), zero buttons (D-19-08 no-retry rule)

## Task Commits

Each task committed atomically in mcp-poc repo (`main` branch):

1. **Task 1: types.ts BriefingPayload duplication** — `f135e6f` feat(19-01): add BriefingPayload + bridge types duplication (D-19-12)
2. **Task 2 RED: failing formatters test** — `c2eedc2` test(19-01): add failing formatters test suite (D-19-10)
3. **Task 2 GREEN: formatters.ts implementation** — `5379e18` feat(19-01): implement de-DE formatters (D-19-10)
4. **Task 3: theme.ts re-export + applyTokens** — `8dfb987` feat(19-01): add theme.ts re-export + applyTokens helper (WIDG-STRUCT-03)
5. **Task 4: BlockSkeleton.tsx variants** — `01a2ab7` feat(19-01): add BlockSkeleton loading+error variants (D-19-08)

_TDD vertical slice followed for Task 2: separate RED + GREEN commits make the cycle visible in `git log`._

## Files Created/Modified

**Created (mcp-poc repo):**
- `widgets/daily-briefing/src/lib/types.ts` (115 LOC) — BriefingPayload + Block<T> + RunRateData + HeatmapBucket + HeatmapData + RepeatData + BasketPair + AovBand + BasketData + PaymentFailedEntry + InvoiceOverdueEntry + OnHoldEntry + PaymentAttentionPayload, all `export`
- `widgets/daily-briefing/src/lib/formatters.ts` (36 LOC) — formatCurrency / formatPercent / formatPP / formatDate (de-DE Intl-based)
- `widgets/daily-briefing/src/lib/theme.ts` (18 LOC) — re-export of useHostTokens + applyTokens helper
- `widgets/daily-briefing/src/blocks/BlockSkeleton.tsx` (50 LOC) — single component with `variant: "loading" | "error"`
- `widgets/daily-briefing/src/lib/__tests__/formatters.test.ts` (56 LOC) — 11 vitest cases covering edge inputs (zero, negative, large, alternative currency)

**Created (PORTAL repo):**
- `.planning/phases/19-revenue-intelligence-widget-v2/deferred-items.md` — out-of-scope pre-existing TS errors in v1 App.tsx
- `.planning/phases/19-revenue-intelligence-widget-v2/19-01-SUMMARY.md` (this file)

**Modified:** None.

## Exports Surface (for downstream plan import targets)

**types.ts:** `Block<T>`, `BriefingPayload`, `RunRateData`, `HeatmapBucket`, `HeatmapData`, `RepeatData`, `BasketPair`, `AovBand`, `BasketData`, `PaymentFailedEntry`, `InvoiceOverdueEntry`, `OnHoldEntry`, `PaymentAttentionPayload` (13 type exports)

**formatters.ts:** `formatCurrency(amount: number, currency?: string)`, `formatPercent(ratio: number)`, `formatPP(pp: number)`, `formatDate(iso: string)`

**theme.ts:** `useHostTokens` (re-exported), `applyTokens(tokens?: Partial<Record<TokenKey,string>>)`

**BlockSkeleton.tsx:** `BlockSkeleton({ variant, approxHeight })`, `BlockSkeletonProps`

## Decisions Made

- **Whitespace probe before test assertions** — ran `node -e "const out = new Intl.NumberFormat('de-DE',...).format(1240); for(const c of out){console.log(c.charCodeAt(0).toString(16),...)}"` to confirm Intl emits U+00A0 NBSP before €. Avoided silent test mismatch from hand-typed regular spaces.
- **Thin space U+202F for percent/PP** — picked per D-19-10 ("Thin-space (U+202F) before %"). Implementation and tests use shared constant to prevent drift.
- **Date matcher tolerates "Di." weekday-with-period** — Node ICU emits trailing period on weekday-short in de-DE; browsers may omit. Regex `(Mo|Di|Mi|Do|Fr|Sa|So)\.?,` accepts both forms so suite is portable across runtimes.
- **BlockSkeleton kept as single component with variant prop** — Claude's Discretion item from CONTEXT D-19-08; chose single component over two siblings for simpler imports and one shared height/border styling decision per block.

## Deviations from Plan

### Documentation-Only

**1. [Rule 3 — Pragmatism] Acceptance criterion `grep -iE "(Loading|Retry|Reload|Error)"` returns 0 not satisfiable while preserving public API**
- **Found during:** Task 4 (BlockSkeleton)
- **Issue:** Plan acceptance criterion required zero matches for an English-word blacklist regex over the source file. The component's required public-API prop is typed `variant: "loading" | "error"` — TypeScript discriminator literals which `grep -iE` matches.
- **Fix:** Cleaned the explanatory header comment to remove additional matches (replaced "no retry button" → "no interactive controls"; removed duplicate German strings from comments). Retained the `"loading" | "error"` literal types as the required public API.
- **Outcome:** Final state has 2 grep-matches for English words, both inside the `variant` prop type definition (lines 6 and 13). German-only intent is preserved at the rendered-UI level (must_haves.truth #4 satisfied: rendered text is exactly the two German strings).
- **No code-review action needed:** the variant strings ARE the API the plan mandated.

**2. [Rule 3 — Test fix folded into GREEN commit] Date regex updated to tolerate Node ICU weekday-with-period form**
- **Found during:** Task 2 GREEN run
- **Issue:** Initial regex `/(Mo|Di|...)/,/` rejected Node's `"Di., 21.04."` output (10/11 cases passing).
- **Fix:** Made the trailing period optional: `/(Mo|Di|...)\.?,/` — accepts both Node ICU and browser forms.
- **Files modified:** `formatters.test.ts`
- **Verification:** All 11 tests now pass.
- **Committed in:** `5379e18` (folded into GREEN commit, called out in commit message).

**3. [Pre-existing, out-of-scope] v1 App.tsx has 9 `TS2503: Cannot find namespace 'JSX'` errors**
- **Found during:** Task 1 typecheck
- **Issue:** Pre-existing v1 widget code (NOT introduced by this plan) fails React 19 JSX type lookup.
- **Fix:** None taken in this plan. Will be naturally resolved by D-19-11 (v1 App.tsx replaced in-place by v2 in a later plan).
- **Logged to:** `.planning/phases/19-revenue-intelligence-widget-v2/deferred-items.md` per scope-boundary rule.

---

**Total deviations:** 3 (1 acceptance-criterion pragmatism, 1 test fix folded into GREEN, 1 pre-existing out-of-scope)
**Impact on plan:** No code-architecture deviations. Plan executed as designed; criterion pragmatism documented for reviewer.

## Issues Encountered

- **Initial test file used regular spaces (U+0020) where Intl emits U+00A0 / U+202F.** Resolved by Node-REPL probe before GREEN — wrote `formatters.test.ts` with shared `NBSP`/`THIN`/`MINUS` constants so visible whitespace mismatches surface as compile-time intent rather than silent test failures.

## Threat Surface Scan

No new threat surface introduced. Per the plan's threat register:
- **T-19-01-01** (types.ts drift) — accepted per D-19-12; KEEP IN SYNC header is the visual discipline gate.
- **T-19-01-02** (BlockSkeleton info disclosure) — mitigated; primary text hardcoded to `Daten nicht verfügbar`, NOT `error.message`. Verified via grep: `grep "error.message\|err.message" widgets/daily-briefing/src/blocks/BlockSkeleton.tsx` returns 0 matches.
- **T-19-01-03** (applyTokens CSS injection) — transferred to Phase 18 `useHostTokens` SAFE_VALUE regex; applyTokens consumers receive already-validated tokens.

No `## Threat Flags` section needed (no new surface beyond what threat model already covered).

## Self-Check

**Files created (verified exist):**
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/types.ts`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/formatters.ts`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/theme.ts`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/BlockSkeleton.tsx`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/__tests__/formatters.test.ts`

**Commits exist (verified via `git log --oneline`):**
- ✓ `f135e6f` types.ts
- ✓ `c2eedc2` test (RED)
- ✓ `5379e18` formatters (GREEN)
- ✓ `8dfb987` theme.ts
- ✓ `01a2ab7` BlockSkeleton.tsx

**Verification commands rerun:**
- ✓ `npm run test:run -- widgets/daily-briefing/src/lib/__tests__/formatters` → 11 passed (1 file)
- ✓ Plan-01 source files report zero TS errors via `npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json` (pre-existing v1 App.tsx errors are out of scope, logged to deferred-items.md)

**Self-Check: PASSED**

## Next Plan Readiness

Foundation layer complete. Plans 04/05/06 (block implementations) can import:
- All 13 types from `lib/types.ts`
- All 4 formatters from `lib/formatters.ts`
- `useHostTokens` from `lib/theme.ts`
- `BlockSkeleton` from `blocks/BlockSkeleton.tsx`

No blockers for downstream plans. Wave 1 foundation gate met.

---
*Phase: 19-revenue-intelligence-widget-v2*
*Plan: 01*
*Completed: 2026-04-24*
