---
phase: 19-revenue-intelligence-widget-v2
plan: 02
subsystem: ui
tags: [react, typescript, vitest, mcp-poc, daily-briefing-widget, motion, fixtures]

requires:
  - phase: 18-mcp-ui-resource-build-pipeline
    provides: getFixtureMode() URL parser (2-mode union) — extended in-place to 3 modes
  - phase: 19-revenue-intelligence-widget-v2/01
    provides: types.ts (BriefingPayload + 13 type exports) — consumed by fixture factories

provides:
  - "FixtureMode narrow union extended to 3 modes (basket-aov | one-block-failing | run-rate-sparse) with guard"
  - "getFixturePayload(mode) factory returning BriefingPayload-shaped data for 4 cases (null + 3 modes)"
  - "useCountUp spring-physics hook with reduced-motion branch (D-19-03, UI-SPEC Motion locked params)"
  - "Seeded numerics anchored to Phase 16 Summerfield data (Do 20:00 peak, ~1099 paid orders, 20.1% repeat)"
  - "11 vitest cases green (5 getFixtureMode + 4 getFixturePayload + 2 useCountUp)"

affects:
  - "19-03 App.tsx composer — will wire getFixtureMode() → getFixturePayload(mode) as dev-harness bypass"
  - "19-04/05/06 block snapshot tests — will consume getFixturePayload(mode) for deterministic block rendering"
  - "HeuteBlock/RepeatBlock/BasketOrAovBlock — will import useCountUp for Display-role number animation"

tech-stack:
  added: []  # No new dependencies — motion/react already bundled since Phase 18
  patterns:
    - "@vitest-environment jsdom pragma at top of test file — opt-in browser env without touching global config"
    - "Fixture spread with targeted override — {...healthy, blocks: {...healthy.blocks, run_rate: {...}}} — narrows mutation surface"
    - "Narrow-union URL parser with string-equality guard (Phase 18 pattern preserved)"
    - "Primitive-return hook (number) bypasses useMemo return-stabilization rule — documented inline"

key-files:
  created:
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/fixtures-payloads.ts (197 LOC) — factories for healthy + 3 variants"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/useCountUp.ts (42 LOC) — spring hook with reduced-motion branch"
  modified:
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/fixtures.ts — union 2→3 modes + guard update"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/__tests__/fixtures.test.ts — 11 cases total (9 fixtures + 2 hook)"

key-decisions:
  - "Use @vitest-environment jsdom pragma instead of editing vitest.config.ts environmentMatchGlobs — zero config blast radius"
  - "Heatmap fixture uses 28 non-zero buckets (not full 168) — fits HeatmapData threat-T-19-02-03 disposition"
  - "useCountUp returns primitive (number) — memory feedback_react_hook_identity_churn rule DOES NOT apply; documented inline"
  - "Fixture numerics anchor to Phase 16 Summerfield seeded data — day_of_week=4 (Do), hour_of_day=20 peak; repeat 31% / 4 PP trend"
  - "matchMedia stub in useCountUp test uses addEventListener/removeEventListener shape — Motion v12 reads both"

patterns-established:
  - "Dev-harness fixture consumption pattern: getFixtureMode() → getFixturePayload(mode) → BriefingPayload (ready for downstream App.tsx wiring)"
  - "Spring hook with primitive return + reduced-motion branch — reusable shape for future count-up / animated-number needs"

requirements-completed: [WIDG-STRUCT-02, WIDG-STRUCT-04]

duration: 4min
completed: 2026-04-24
---

# Phase 19 Plan 02: Fixtures + useCountUp Summary

**3-mode fixture parser + BriefingPayload factories for 4 harness modes + useCountUp spring hook — two new files + in-place fixtures.ts extension, 11/11 vitest green, downstream blocks (04/05/06) fully unblocked**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-24T21:57:53Z
- **Completed:** 2026-04-24T22:02:34Z
- **Tasks:** 2 (both TDD vertical slice)
- **Files created:** 2
- **Files modified:** 2 (fixtures.ts, fixtures.test.ts)
- **Tests:** 11 green (9 fixtures + 2 useCountUp); plan 01 formatters suite (11) still green → 22 total for daily-briefing widget
- **New external deps:** 0

## Accomplishments

### fixtures.ts extension (2-mode → 3-mode)

```diff
- export type FixtureMode = 'basket-aov' | 'one-block-failing'
+ export type FixtureMode = 'basket-aov' | 'one-block-failing' | 'run-rate-sparse'
```

Guard extended symmetrically. The narrow-union discipline is preserved — unknown `?mock=bogus` still returns `null` (verified by test case "returns null for unknown mock values (narrow-union rejection)").

### fixtures-payloads.ts factory structure

Five private builders + one public factory:

| Builder | Output |
|---------|--------|
| `buildRunRate()` | Healthy `RunRateData` — confidence=high, projected=4280€, pace=+18%, Klarna/PayPal/Stripe split |
| `buildHeatmap()` | 28-bucket `HeatmapData` — 8 weeks, Do 20:00 peak (avg_orders=3.2), So 10:00 dimmest |
| `buildRepeat()` | Healthy `RepeatData` — 31% rate, +4 PP trend, 27% benchmark, 38 days median |
| `buildBasketProduct()` | `BasketData` in `market_basket_product` mode — 3 pairs (Boxspringbett/Lattenrost etc.) |
| `buildBasketAov()` | `BasketData` in `aov_bands` mode — 3 bands (< 500 € / 500–1.500 € / > 1.500 €) |
| `buildAttention()` | `PaymentAttentionPayload` — 1 payment_failed + 1 invoice_overdue + 1 on_hold |
| `buildHealthy()` | Composes all above into healthy `BriefingPayload` |

`getFixturePayload(mode)` branches:
- `null` → `buildHealthy()` as-is (basket in product mode)
- `'run-rate-sparse'` → spread healthy + override `run_rate.data` with `{confidence: "medium", baseline_days_used: 3}` (D-19-06 medium-confidence branch)
- `'basket-aov'` → spread healthy + override `basket` with `buildBasketAov()` (D-19-07 aov_bands mode)
- `'one-block-failing'` → spread healthy + override `repeat` with `{status: "error", message: "forced fixture error"}`

Spread with targeted override keeps the mutation surface minimal — other 3 blocks guaranteed healthy in each failing-mode fixture.

### useCountUp hook signature + spring params

```typescript
export function useCountUp(target: number): number {
  const reduced = useReducedMotion();
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { stiffness: 120, damping: 20, mass: 0.8 });
  const [display, setDisplay] = useState<number>(reduced ? target : 0);
  useEffect(() => { if (reduced) { setDisplay(target); return; } mv.set(target); }, [target, reduced, mv]);
  useMotionValueEvent(spring, "change", (v) => { setDisplay(v); });
  return display;
}
```

- **Signature:** `(target: number) => number` — primitive return
- **Spring params (locked by UI-SPEC Motion):** `stiffness: 120 / damping: 20 / mass: 0.8`
- **Reduced-motion branch:** `setDisplay(target)` immediately, skip motion value updates
- **Identity note (feedback_react_hook_identity_churn):** primitive return → no useMemo needed on return (rule applies to OBJECT returns only; documented inline in JSDoc)

## Task Commits

Each task committed atomically in `mcp-poc` repo (`main` branch):

1. **Task 1 RED: failing fixtures test** — `3bc2c9f` test(19-02): add failing fixtures + payloads test suite (WIDG-STRUCT-04)
2. **Task 1 GREEN: fixtures.ts extension + fixtures-payloads.ts** — `d385907` feat(19-02): extend fixtures to 3 modes + add fixture-payload factories
3. **Task 2: useCountUp hook + tests** — `33f8a14` feat(19-02): add useCountUp spring-physics hook (D-19-03) + tests

TDD vertical slice visible in `git log`: RED commit separates from GREEN for Task 1. Task 2 combined hook + tests into a single `feat` commit because the hook is very small (42 LOC) and the tests are appended into an existing file (no RED-only commit possible without fragmenting the test file state).

## Files Created/Modified

**Created (mcp-poc repo):**
- `widgets/daily-briefing/src/lib/fixtures-payloads.ts` (197 LOC) — `getFixturePayload(mode)` returning valid BriefingPayload for 4 cases
- `widgets/daily-briefing/src/lib/useCountUp.ts` (42 LOC) — spring-physics count-up hook with reduced-motion branch

**Modified (mcp-poc repo):**
- `widgets/daily-briefing/src/lib/fixtures.ts` — union 2→3 modes (+ 'run-rate-sparse'), guard updated, file comment updated for Phase 19 context
- `widgets/daily-briefing/src/lib/__tests__/fixtures.test.ts` (created in this plan; grew 77 LOC → 126 LOC across 3 commits) — 11 test cases total

**Created (PORTAL repo):**
- `.planning/phases/19-revenue-intelligence-widget-v2/19-02-SUMMARY.md` (this file)

**Modified (PORTAL repo):**
- `.planning/phases/19-revenue-intelligence-widget-v2/deferred-items.md` — added "From Plan 19-02" section for 2 pre-existing Phase-18 TS errors

## Exports Surface (for downstream plan import targets)

**fixtures.ts:** `FixtureMode` (type), `getFixtureMode()` (now 3-mode)

**fixtures-payloads.ts:** `getFixturePayload(mode: FixtureMode | null): BriefingPayload`

**useCountUp.ts:** `useCountUp(target: number): number`

## Downstream Dependency Notice

Plans 04/05/06 (block implementations) and plan 07 (App composer) now have all required fixture + hook infrastructure:

- **Block snapshot tests (04/05/06):** can call `getFixturePayload(null)` for healthy baseline, `getFixturePayload('basket-aov')` for aov_bands variant, `getFixturePayload('one-block-failing')` for error-branch rendering, `getFixturePayload('run-rate-sparse')` for medium-confidence branch.
- **HeuteBlock projection €:** `const projected = useCountUp(data.projected_revenue)` → feed to formatCurrency for animated render.
- **RepeatBlock rate %:** `const rate = useCountUp(data.repeat_rate_pct)` → animated percent display.
- **BasketOrAovBlock Ø Bestellwert:** `const aov = useCountUp(data.avg_order_value)` → animated currency display (aov_bands mode only per UI-SPEC).
- **Plan 07 App.tsx dev-harness bypass:** `if (window.parent === window) { setState({kind: "ok", data: getFixturePayload(getFixtureMode())}); return; }` — wires both exports into a single effect.

No blockers for downstream plans. Wave 1 gate met for plan 02.

## Decisions Made

- **@vitest-environment jsdom pragma at top of fixtures.test.ts** — chose the file-level pragma over editing vitest.config.ts environmentMatchGlobs. Advantages: zero blast radius on other tests, pragma is visible at file top (discoverable), no risk of misconfiguring existing Phase-18 contract tests which explicitly pick node env. Cost: one line of file metadata.
- **matchMedia stub shape** — Motion v12's useReducedMotion calls both `addEventListener` and `addListener` (backward-compat); stub exposes both as no-ops to match what the hook expects. Without the full shape, Motion would throw in test env.
- **Fixture spread pattern** — `{...healthy, blocks: {...healthy.blocks, run_rate: {...}}}` narrows each variant's mutation to exactly one block. Makes it mechanically obvious from the code which block each fixture mode targets and leaves the other 3 blocks guaranteed-healthy in each failing-mode variant.
- **useCountUp reduced-motion initial state** — `useState<number>(reduced ? target : 0)` ensures the first render of a reduced-motion client shows the final value immediately, not a flash of 0. The useEffect's `setDisplay(target)` is belt-and-suspenders for the async case where `useReducedMotion` reports `null` then flips to `true`.
- **Seeded numerics** — picked from Phase 16 Summerfield RESEARCH.md verbatim (day_of_week=4 peak, hour_of_day=20, ~1099 paid orders, 20.1% repeat as the anchors; fixture varies slightly: 31% repeat + 4 PP trend for a brighter default). Anchored-but-not-identical is intentional — fixtures are for visual verification, not data regression.

## Deviations from Plan

**1. [Rule 3 — Test environment] Added `@vitest-environment jsdom` pragma at top of fixtures.test.ts after RED commit**

- **Found during:** Task 1 GREEN run (tests errored with "window is not defined")
- **Issue:** vitest.config.ts has `environment: 'node'` as default, with jsdom opt-in only for `widgets/shared/hooks/**`. The fixture test file calls `window.history.replaceState(...)` for URL parser setup.
- **Fix:** Added `// @vitest-environment jsdom` pragma as the first line of fixtures.test.ts — zero-blast-radius opt-in without touching vitest.config.ts.
- **Files modified:** `widgets/daily-briefing/src/lib/__tests__/fixtures.test.ts`
- **Committed in:** `d385907` (folded into GREEN commit; the RED commit was intentionally broken for its own reason — missing fixtures-payloads module — so the env issue never surfaced there).
- **Impact:** None on plan semantics; one line added to test file metadata.

**2. [Rule 3 — Test combined into single commit] Task 2 used single `feat` commit instead of separate RED/GREEN**

- **Found during:** Task 2 planning
- **Issue:** Plan suggested the Task 2 tests be appended to the file from Task 1. With the test file already present, adding 2 more tests that fail until useCountUp.ts exists would require mid-file deletions/restorations to produce a pure RED commit.
- **Fix:** Wrote useCountUp.ts + appended tests in one commit (`feat(19-02): add useCountUp...`). The hook is 42 LOC and both tests are deterministic (reduced-motion returns target, motion-allowed returns a finite number) — TDD value is lower here than for the fixtures factory.
- **Impact:** Plan's acceptance criteria still met (all 11 tests pass; all grep-counts as specified).

**3. [Pre-existing, out-of-scope] 2 Phase-18 TS errors in widgets/shared files**

- **Found during:** Task 1 typecheck
- **Issue:** `widgets/shared/hooks/__tests__/useHostTokens.test.ts(67,28)` (TS2532) and `widgets/shared/vite.base.ts(43,9)` (TS2322) — both from Phase 18 commits, pre-existing before plan 19-02.
- **Fix:** None taken — out of scope per the scope-boundary rule.
- **Logged to:** `.planning/phases/19-revenue-intelligence-widget-v2/deferred-items.md` under "From Plan 19-02".
- **Impact:** widget source files introduced by plan 19-02 (fixtures.ts + fixtures-payloads.ts + useCountUp.ts) report zero TS errors when restricted to this plan's files.

---

**Total deviations:** 3 (1 test-env pragma fold, 1 TDD commit-structure pragmatism, 1 pre-existing out-of-scope)
**Impact on plan:** No architectural deviations. All must_haves.truths verified.

## Issues Encountered

- **Initial GREEN run failed on `window is not defined`** — root cause was default node test env. Resolved by adding `@vitest-environment jsdom` pragma to the test file. Documented as Deviation #1.
- **stderr warning from Motion on reduced-motion test** — Motion v12 logs a console warning ("You have Reduced Motion enabled on your device") when `useReducedMotion()` returns `true`. Harmless test-env artifact; tests pass.

## Threat Surface Scan

No new threat surface beyond the plan's threat register:
- **T-19-02-01** (URL parser input validation) — mitigated; narrow-union string-equality guard rejects `?mock=bogus`. Test case "returns null for unknown mock values (narrow-union rejection)" verifies.
- **T-19-02-02** (fixture payload drift from BriefingPayload type) — mitigated; fixtures-payloads.ts imports 7 types from `./types` (Block / BriefingPayload / RunRateData / HeatmapData / HeatmapBucket / RepeatData / BasketData / PaymentAttentionPayload). TS compiler fails build if fields drift. `npx tsc --noEmit -p tsconfig.widgets.json` reports zero errors on plan 19-02 files.
- **T-19-02-03** (HeatmapData DoS via large buckets array) — accepted per plan; fixture uses 28 non-zero buckets instead of full 168 cells.

No `## Threat Flags` section needed.

## Self-Check

**Files created (verified exist via Read tool during execution):**
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/fixtures-payloads.ts`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/useCountUp.ts`

**Files modified (verified via `git log` + `git show`):**
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/fixtures.ts` (modified in commit `d385907`)
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/__tests__/fixtures.test.ts` (created in `3bc2c9f`, modified in `d385907` + `33f8a14`)

**Commits exist (verified via `git log --oneline -5` in mcp-poc):**
- ✓ `3bc2c9f` test(19-02): add failing fixtures + payloads test suite (WIDG-STRUCT-04)
- ✓ `d385907` feat(19-02): extend fixtures to 3 modes + add fixture-payload factories
- ✓ `33f8a14` feat(19-02): add useCountUp spring-physics hook (D-19-03) + tests

**Verification commands rerun:**
- ✓ `npx vitest run widgets/daily-briefing/src/lib/__tests__/fixtures` → 11 passed (1 file)
- ✓ `npx vitest run widgets/daily-briefing` → 22 passed (2 files — fixtures + formatters from plan 01)
- ✓ `npx tsc --noEmit -p tsconfig.widgets.json` → plan 19-02 files report zero errors (2 pre-existing Phase-18 errors logged to deferred-items.md)

**Must-haves truths verified:**
- ✓ getFixtureMode() narrow-union parser accepts exactly 3 modes and rejects others (5 parser tests)
- ✓ getFixturePayload('basket-aov') returns basket.data.mode === 'aov_bands' (test case 2)
- ✓ getFixturePayload('one-block-failing') returns exactly 3 ok + 1 error blocks (test case 3)
- ✓ getFixturePayload('run-rate-sparse') returns run_rate.data.confidence === 'medium' AND baseline_days_used < 5 (test case 4)
- ✓ useCountUp(target) honors useReducedMotion — returns target immediately when reduced (test case 1)

**Self-Check: PASSED**

## Next Plan Readiness

Wave 1 foundation gate met for plan 02. Plan 03 (App composer) can now:
- Import `getFixtureMode` from `./lib/fixtures` and `getFixturePayload` from `./lib/fixtures-payloads`
- Wire dev-harness bypass: `if (window.parent === window) setState({kind: "ok", data: getFixturePayload(getFixtureMode())})`

Plans 04/05/06 (block implementations) can now:
- Import `getFixturePayload` for block snapshot test setup
- Import `useCountUp` from `./lib/useCountUp` for Display-role number animation in HeuteBlock / RepeatBlock / BasketOrAovBlock

No blockers for downstream plans. Plan 01 + 02 together deliver the full lib/ foundation (types, formatters, theme, skeleton, fixtures, payloads, useCountUp).

---
*Phase: 19-revenue-intelligence-widget-v2*
*Plan: 02*
*Completed: 2026-04-24*
