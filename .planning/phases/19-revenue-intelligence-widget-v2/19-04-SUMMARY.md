---
phase: 19-revenue-intelligence-widget-v2
plan: 04
subsystem: widget
tags: [react, motion, tailwind-v4, mcp-poc, daily-briefing-widget, heute-block, attention-list, sandbox-iframe, tdd, vitest, jsdom, german-only]

requires:
  - phase: 19-revenue-intelligence-widget-v2
    plan: 01
    provides: lib/types.ts (Block, RunRateData, PaymentAttentionPayload), lib/formatters.ts (formatCurrency, formatPercent), blocks/BlockSkeleton.tsx
  - phase: 19-revenue-intelligence-widget-v2
    plan: 02
    provides: lib/useCountUp.ts (motion-driven count-up), lib/fixtures-payloads.ts (getFixturePayload)
  - phase: 19-revenue-intelligence-widget-v2
    plan: 03
    provides: vitest jsdom environmentMatchGlobs for widgets/daily-briefing/src/blocks/__tests__/*.tsx

provides:
  - "blocks/AppContext.tsx — exported AppContext<McpApp | null> for AttentionList consumer + Wave 3 App.tsx provider"
  - "blocks/AttentionList.tsx — payment-attention sub-section with sandbox-safe AdminLink (Pattern S3) + chip variants + mini-error variant"
  - "blocks/HeuteBlock.tsx — 8-row run-rate block: Bisher, Hochrechnung (confidence-branched), pace, same-hour-last-week, payment-method bars, attention sub-section"
  - "blocks/__tests__/HeuteBlock.test.tsx — 9 vitest jsdom cases: high/medium/low confidence, sparse baseline, error skeleton, payment-method labels, attention 3-state lifecycle"

affects:
  - "Wave 3 plan 19-07 App.tsx composition: imports HeuteBlock, AppContext, AttentionList; provides AppContext.Provider value={appRef.current}"
  - "Plans 19-05 (HeatmapBlock) and 19-06 (RepeatBlock + BasketOrAovBlock) follow the same vitest jsdom + render() + getFixturePayload pattern this plan established"

tech-stack:
  added: []
  patterns:
    - "Sandbox-safe deep-link: useContext(AppContext) → app.openLink({url}) round-trip, fallback browser-anchor when standalone (no app)"
    - "Confidence branching at component-level (not badge): low/baseline<5 REPLACES number with German fallback; medium adds warning-color caption below number"
    - "Payment-method bars: opacity-tier on a single accent color (100%/60%/30% by revenue rank) instead of brand-specific colors"
    - "Hidden-when-empty + suppressed-divider: <hr> + <AttentionList> wrapped together; both omit when attention.status==='ok' && categories.flat().length===0"
    - "Test determinism via vi.useFakeTimers + setSystemTime: pins h_now to 10:42 so confidence-branch fallback copy is reproducible across CI"
    - "AppContext extracted to its own module to break the import cycle (App.tsx → HeuteBlock → AttentionList → AppContext is acyclic; AttentionList → App.tsx would have cycled)"

key-files:
  created:
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/AppContext.tsx (9 LOC) — context module"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/AttentionList.tsx (195 LOC) — attention sub-section"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/HeuteBlock.tsx (230 LOC) — headline run-rate block"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/__tests__/HeuteBlock.test.tsx (175 LOC) — 9-case vitest suite"
    - "G:/01_OPUS/Projects/PORTAL/.planning/phases/19-revenue-intelligence-widget-v2/19-04-SUMMARY.md (this file)"
  modified: []

key-decisions:
  - "Hooks-rule fix: useCountUp called unconditionally inside ProjectionRow before the early-return branches. Original plan sketch had useCountUp after the early-return guard which would violate React's rules-of-hooks."
  - "Test-time fixed: vi.useFakeTimers + setSystemTime(2026-04-24T10:42 +02) pins wall clock to a non-midnight hour so the 'Nicht genug Daten' (baseline-insufficient) vs 'Noch zu früh' (h_now=0) branch is deterministic. Without this fix the test failed at midnight local time because h_now=0 → 'Noch zu früh' was rendered instead. Documented as Rule 1 deviation."
  - "AttentionList is its own module (not nested inside HeuteBlock) so the testing surface is composable: future plans can mount AttentionList directly with a fake AppContext.Provider for hover/keyboard tests without rendering the full HeuteBlock chrome."
  - "Pace row uses raw color CSS-var via inline style (not Tailwind utility) because data-driven success/danger color picking is cleaner inline than via conditional className strings."
  - "Payment-method bar opacity tier max=100%/60%/30% (not 100/66/33 or other splits): UI-SPEC Color §payment-method-bars locks these specific values — verified preserved."

requirements-completed: [WIDG-BLOCK-01, WIDG-BLOCK-05, WIDG-QA-03, WIDG-QA-04]

duration: ~10 min
completed: 2026-04-25
---

# Phase 19 Plan 04: HeuteBlock + AttentionList + AppContext Summary

**Built the v2 headline run-rate block with confidence branching (D-19-06), payment-method opacity bars, and a nested payment-attention sub-section using the sandbox-safe deep-link pattern (Pattern S3) — 4 atomic commits in mcp-poc, 9-case vitest suite green under jsdom, zero PORTAL diff.**

## Performance

- **Duration:** ~10 min
- **Tasks:** 3 (AppContext extract, AttentionList port, HeuteBlock TDD)
- **Files created (mcp-poc):** 4 (AppContext.tsx, AttentionList.tsx, HeuteBlock.tsx, HeuteBlock.test.tsx)
- **Files modified (mcp-poc):** 0
- **Files created (PORTAL):** 1 (this summary)
- **Files modified (PORTAL):** 0 (PORT-04 zero-diff preserved)
- **Commits:** 4 atomic commits in mcp-poc main
- **New external deps:** 0
- **Test cases added:** 9 (all green under jsdom)

## Accomplishments

### `blocks/AppContext.tsx` (Task 1)

9-line context module wrapping `createContext<InstanceType<typeof McpApp> | null>(null)`. Lifted from v1 `App.tsx` lines 10-12 verbatim and given its own file so:

1. AttentionList can `useContext(AppContext)` without importing from App.tsx (which will import HeuteBlock which imports AttentionList — that cycle would otherwise fail).
2. Wave 3 plan 07's App.tsx will provide `<AppContext.Provider value={appRef.current}>` around the 4-block tree.

TypeScript compiles clean. Acceptance grep counts all return 1.

### `blocks/AttentionList.tsx` (Task 2)

195-line module providing 3 named symbols:

- `AdminLink` (private) — sandbox-safe anchor that calls `app.openLink({url: href})` via AppContext when running inside the iframe; falls back to browser default-open when `app === null` (standalone dev harness). Implements Pattern S3.
- `Chip` (private) — 11px pill with semantic-color tinted background (`color-mix(in oklch, ${color} 12%, transparent)`); 3 variants: danger / warning / muted.
- `AttentionList` (exported) — main component with 3 branches:
  1. `attention.status === 'error'` → mini variant: single `Daten nicht verfügbar` line (D-19-09).
  2. `attention.status === 'ok'` AND total entries === 0 → returns `null` (D-19-04 hidden when empty).
  3. `attention.status === 'ok'` AND entries > 0 → renders heading `Zahlungsaufmerksamkeit` + chip row + flat ul of rows.

Row construction normalizes the 3 categories (`payment_failed`, `invoice_overdue`, `on_hold`) into a unified `Row` type with `{key, label, name, meta, amount, admin_url}`. German labels per UI-SPEC Copywriting Contract:

- payment_failed → `Zahlung fehlgeschlagen` + `${method} · ${dd.MM. HH:mm}`
- invoice_overdue → `Rechnung überfällig · ${days_overdue} Tage` + `#${order_id}`
- on_hold → `Manuelle Prüfung` + `#${order_id}`

Right column shows `formatCurrency(amount, currency)` + `Öffnen →` AdminLink.

Acceptance grep counts: all required strings present, zero `target="_blank"` (sandbox-safe).

### `blocks/HeuteBlock.tsx` (Task 3 GREEN)

230-line headline block with 8-row visual hierarchy:

1. Header: `Heute` heading (text-lg semibold) + clock timestamp on the right (`HH:mm` de-DE)
2. `Bisher` row: caption label + Body value (`formatCurrency(current_revenue ?? 0)`)
3. `<ProjectionRow>` — confidence-branched:
   - `low` OR `baseline_days_used < 5` → renders single muted line:
     - `hourNow === 0` → `Noch zu früh für Hochrechnung`
     - else → `Nicht genug Daten für Hochrechnung`
   - `medium` → renders count-up number + `Bei aktuellem Tempo` caption + `(Schätzung, geringe Datenbasis)` warning-color caption
   - `high` → renders count-up number + `Bei aktuellem Tempo` caption (no warning)
4. Pace row (`vs. Ø gleiche Stunde letzte 7 Tage` + signed percent in success/danger color) — **hidden** when `baseline_days_used < 5`
5. Same-hour-last-week reference row — only rendered when `data.same_hour_last_week !== undefined`
6. Payment-method bars — sorted by revenue desc, opacity tier 100%/60%/30%, full track + filled segment + percent-of-total
7. Divider (`<hr>`) — **suppressed** when attention.status==='ok' && all categories empty (D-19-04)
8. `<AttentionList>` — same suppression as divider

Top-level guard: `block.status === 'error'` → `<BlockSkeleton variant='error' approxHeight={220} />` (D-19-08).

The `useCountUp` hook is called unconditionally inside ProjectionRow before the early-return guard to comply with React's rules-of-hooks; its result is consumed only in the high/medium branch.

### `blocks/__tests__/HeuteBlock.test.tsx` (Task 3 RED + GREEN)

9 vitest jsdom cases:

| # | Suite | Case |
|---|-------|------|
| 1 | healthy confidence=high (WIDG-BLOCK-01) | renders Hochrechnung label + 4.280 € + +18 % pace + Bei aktuellem Tempo |
| 2 | confidence branches (D-19-06) | confidence=medium shows (Schätzung, geringe Datenbasis) caption |
| 3 | confidence branches (D-19-06) | confidence=low replaces number with Nicht genug Daten für Hochrechnung |
| 4 | confidence branches (D-19-06) | baseline_days_used<5 hides pace indicator |
| 5 | error handling (WIDG-QA-03, D-19-09) | block.status=error renders BlockSkeleton with Daten nicht verfügbar + Bitte Seite neu laden |
| 6 | payment-method bars (UI-SPEC) | renders Klarna, PayPal, Stripe labels |
| 7 | attention sub-section (D-19-04) | renders Zahlungsaufmerksamkeit heading when entries present |
| 8 | attention sub-section (D-19-04) | does NOT render heading when all categories empty |
| 9 | attention sub-section (D-19-04) | attention.status=error renders mini-variant; HeuteBlock content still present |

Test setup uses `stubReducedMotion(true)` (matchMedia stub) so `useReducedMotion()` returns `true` and the count-up hook short-circuits to the target value immediately, making textual assertions deterministic. `vi.useFakeTimers + setSystemTime("2026-04-24T10:42:00+02:00")` pins `new Date().getHours()` to 10 so the confidence=low / baseline<5 branch deterministically picks `Nicht genug Daten` (not the h_now=0 alternative).

Test #2 was rebuilt: the `run-rate-sparse` fixture (which the plan suggested) sets `confidence='medium'` AND `baseline_days_used=3`. The latter triggers the low-fallback branch first, so the test couldn't observe the medium caption that way. Built an explicit medium-block with `baseline_days_used=14` to assert the caption surface — this matches D-19-06 semantics more precisely (medium branch only fires when baseline IS sufficient).

## Test Coverage to Requirements

| Requirement | Coverage |
|---|---|
| WIDG-BLOCK-01 (HeuteBlock run-rate + pace) | Tests 1, 4 |
| WIDG-BLOCK-05 (attention sub-section nested) | Tests 7, 8, 9 |
| WIDG-QA-03 (per-block error isolation) | Test 5 |
| WIDG-QA-04 (German-only) | All 9 tests assert against German strings only; no English in component output |

## Commits

Four atomic commits on `mcp-poc` `main` branch:

1. **`6a93445`** — `feat(19-04): extract AppContext to blocks/AppContext.tsx` (Task 1)
2. **`064885c`** — `feat(19-04): add AttentionList with AdminLink + mini-error variant (D-19-04, D-19-09)` (Task 2)
3. **`6de95fe`** — `test(19-04): add failing HeuteBlock suite — confidence + attention + errors` (Task 3 RED)
4. **`8abb96c`** — `feat(19-04): implement HeuteBlock with confidence branches + payment bars (WIDG-BLOCK-01, WIDG-BLOCK-05)` (Task 3 GREEN)

Final test run: 9/9 green; `npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json` reports zero errors in any of the 4 new files (pre-existing v1 App.tsx JSX-namespace errors are out of scope; will be resolved in plan 19-07's v1 cleanup).

## Exports Surface (for downstream import targets)

- `blocks/AppContext.tsx`:
  - `export const AppContext: React.Context<InstanceType<typeof McpApp> | null>`
- `blocks/AttentionList.tsx`:
  - `export function AttentionList({ attention }: { attention: Block<PaymentAttentionPayload> }): JSX.Element | null`
- `blocks/HeuteBlock.tsx`:
  - `export function HeuteBlock({ block, attention }: { block: Block<RunRateData>; attention: Block<PaymentAttentionPayload> }): JSX.Element`

## Downstream Dependency Notice

**Plan 19-07 (App.tsx composition / Wave 3):**
- Import `AppContext` from `./blocks/AppContext` (NOT from `./App` — the former v1 location).
- Wrap the 4-block tree in `<AppContext.Provider value={appRef.current}>`.
- Pass `block={payload.blocks.run_rate}` and `attention={payload.attention}` to `<HeuteBlock>`.
- AttentionList does NOT need to be imported by App.tsx; HeuteBlock owns the import.
- The current v1 `App.tsx` declares its own internal `AppContext` (line 10) — when v1 is replaced in plan 07, that internal const must be removed; downstream imports use the new module.

**Plans 19-05 / 19-06 (other blocks):**
- Use the same vitest jsdom + render() pattern. The matchMedia stub helper from this test file can be lifted to `widgets/daily-briefing/src/lib/__tests__/test-utils.ts` if any other block needs reduced-motion guarantees (none anticipated; only HeuteBlock and RepeatBlock use useCountUp).

## Decisions Made

- **Hooks-rule reorder:** Plan 19-04 sketch placed `useCountUp(data.projected_revenue)` after the early-return guard inside ProjectionRow. That violates React's rules-of-hooks — moved the call to the top of the function so it runs unconditionally; the result is consumed only in the high/medium branches. Side effect: count-up animation runs even in the low branch (off-screen / unused), which is a sub-nanosecond cost.
- **Explicit medium-block in test #2:** The `run-rate-sparse` fixture combines `confidence='medium'` with `baseline_days_used=3`. The low-fallback (baseline<5) branch fires first, so the medium caption never renders in that fixture. Built an explicit medium-block with healthy baseline to test the caption surface in isolation. This sharpens coverage to D-19-06 semantics: the medium caption only fires when baseline is sufficient AND confidence is explicitly medium.
- **Fake timer time pin:** Selected `2026-04-24T10:42:00+02:00` matching the fixture `calculated_at`. This makes h_now=10 (clearly non-zero) so the low branch picks `Nicht genug Daten`. Selected the offset to match Europe/Berlin DST.
- **Pace color via inline style:** Could have used `className={pace>=0 ? "text-success" : "text-danger"}` but Tailwind v4 + portal-token classes mix awkwardly; inline style with the CSS variable is one fewer indirection.
- **Divider+AttentionList wrapped together:** Spec wants the divider gone when AttentionList is hidden. Two options: (a) move the divider inside AttentionList and conditionally render; (b) compute visibility once outside and wrap both in a fragment. Picked (b) — keeps the divider concern in HeuteBlock (where the layout lives) instead of leaking into AttentionList.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] React rules-of-hooks violation in ProjectionRow**

- **Found during:** Task 3 GREEN
- **Issue:** Plan sketch placed `const projected = useCountUp(data.projected_revenue)` after the early-return guard for the low/baseline<5 branch. Calling a hook conditionally violates React's rules-of-hooks; React would error or render incorrectly when the same component instance switches branches across renders.
- **Fix:** Moved `useCountUp` call to the top of ProjectionRow so it executes on every render regardless of branch. The result is only consumed in the high/medium branches; the low branch ignores it.
- **Files modified:** `widgets/daily-briefing/src/blocks/HeuteBlock.tsx`
- **Commit:** `8abb96c`

**2. [Rule 1 — Test bug] Confidence-low test failed at midnight local time**

- **Found during:** First GREEN run (8/9 passing)
- **Issue:** The test for `confidence='low'` asserted that `Nicht genug Daten für Hochrechnung` rendered. But the implementation correctly distinguishes `h_now === 0 → "Noch zu früh"` from `h_now > 0 → "Nicht genug Daten"`. At 00:16 local time (when the test ran the first time) `h_now = 0` so the wrong copy rendered.
- **Fix:** Added `vi.useFakeTimers()` + `vi.setSystemTime(new Date("2026-04-24T10:42:00+02:00"))` in `beforeEach` and `vi.useRealTimers()` in `afterEach`. The wall clock now reads 10:42 deterministically across CI/timezones.
- **Files modified:** `widgets/daily-briefing/src/blocks/__tests__/HeuteBlock.test.tsx`
- **Commit:** `8abb96c` (folded into the GREEN commit since the test was added in the prior RED commit and would have caused CI flakes there too)

**3. [Rule 1 — Test data alignment] run-rate-sparse fixture conflated medium + sparse-baseline**

- **Found during:** Task 3 RED → GREEN transition
- **Issue:** The plan suggested using `getFixturePayload("run-rate-sparse")` for the medium-caption test. That fixture sets `confidence='medium'` AND `baseline_days_used=3`. The component correctly evaluates baseline<5 first → low-fallback branch fires → the medium caption never renders.
- **Fix:** Built an explicit medium-confidence block with healthy `baseline_days_used=14` inline in the test. The fixture is still useful for dev-harness exercises but not for this specific assertion.
- **Files modified:** `widgets/daily-briefing/src/blocks/__tests__/HeuteBlock.test.tsx`
- **Commit:** `6de95fe` (RED commit — test was authored correctly the first time after this realization)

### Out-of-scope / Pre-existing

**4. [Out-of-scope, observed] Pre-existing JSX-namespace TS errors in v1 App.tsx**

- **Found during:** Task 1 typecheck
- **Issue:** `npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json` reports 9 `TS2503: Cannot find namespace 'JSX'` errors — all in v1 `App.tsx` which is scheduled for in-place replacement in plan 19-07.
- **Fix:** None — out of scope per plan 19-04. Not introduced by this plan; no diff against `App.tsx`.
- **Logged to:** This summary only; plan 19-07 will resolve as part of v1 cleanup (D-19-11).
- **Impact:** None on plan 19-04 acceptance — all 4 new files compile clean; pre-existing errors don't block any acceptance criteria.

---

**Total deviations:** 4 (3 auto-fixed during execution, 1 pre-existing observation)
**Impact on plan:** Zero architectural changes. All 8 must_haves.truths verifiable. All acceptance criteria met.

## Issues Encountered

None blocking. The 3 auto-fixed deviations above were caught by tests/typecheck and corrected in-flight.

## Threat Surface Scan

Per plan 19-04 threat register:

- **T-19-04-01 (Information Disclosure: server error leak via block render)** — **mitigated.** `block.status==='error'` triggers `<BlockSkeleton variant='error' approxHeight={220} />` with hardcoded `Daten nicht verfügbar` + `Bitte Seite neu laden`; `error.message` is never rendered. Verified by Test #5: only the 2 hardcoded strings appear in the error-state DOM, not `'x'` (the test's intentionally non-German error message).
- **T-19-04-02 (Tampering / XSS via customer_name or admin_url):** **mitigated.** All untrusted strings flow through React's text-child auto-escape (`{r.name}`, `{r.label}`, `{r.meta}` are never `dangerouslySetInnerHTML`). `admin_url` is passed only to the `href` attribute and to `app.openLink({url})`. No `target="_blank"` (verified by grep returning 0).
- **T-19-04-03 (Spoofing: AdminLink rendered outside provider):** **accepted.** Fallback branch (`if (!app) return; ...let browser open`) keeps dev-harness functional; in production the portal always provides AppContext. Test #1-9 all wrap renders in `<AppContext.Provider value={null}>` to exercise the fallback path; tests pass without any deep-link-related side effects.
- **T-19-04-04 (DoS: payment_split.length=1000):** **accepted.** Server payload size guarded upstream (Phase 17 Zod validation); widget-side sort + map is O(n log n) bounded by server.

No new threat surface beyond the register. Omitting `## Threat Flags` section (no flags found).

## Self-Check

**Files created (verified via Bash existence checks):**
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/AppContext.tsx`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/AttentionList.tsx`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/HeuteBlock.tsx`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/__tests__/HeuteBlock.test.tsx`
- ✓ `G:/01_OPUS/Projects/PORTAL/.planning/phases/19-revenue-intelligence-widget-v2/19-04-SUMMARY.md` (this file)

**Commits exist (verified via `git log --oneline -5` in mcp-poc):**
- ✓ `6a93445 feat(19-04): extract AppContext to blocks/AppContext.tsx`
- ✓ `064885c feat(19-04): add AttentionList with AdminLink + mini-error variant (D-19-04, D-19-09)`
- ✓ `6de95fe test(19-04): add failing HeuteBlock suite — confidence + attention + errors`
- ✓ `8abb96c feat(19-04): implement HeuteBlock with confidence branches + payment bars (WIDG-BLOCK-01, WIDG-BLOCK-05)`

**Acceptance grep counts (re-verified):**
- ✓ AppContext.tsx: `export const AppContext`=1, `createContext`=1, `@modelcontextprotocol/ext-apps`=1
- ✓ AttentionList.tsx: `export function AttentionList`=1, `Zahlungsaufmerksamkeit`=1, `Öffnen →`=1, `app.openLink`=1, `Daten nicht verfügbar`=1, `total === 0`=1, `target="_blank"`=0
- ✓ HeuteBlock.tsx: `export function HeuteBlock`=1, `Hochrechnung`=4, `Bei aktuellem Tempo`=1, `Noch zu früh für Hochrechnung`=1, `Nicht genug Daten für Hochrechnung`=1, `Schätzung, geringe Datenbasis`=1, `Bisher`=2, `vs. Ø gleiche Stunde letzte 7 Tage`=1, `Gleiche Stunde letzte Woche`=1, `useCountUp`=3, `BlockSkeleton`=2, `<AttentionList`=1

**Verification commands rerun:**
- ✓ `npm run test:run -- widgets/daily-briefing/src/blocks/__tests__/HeuteBlock` → 9/9 passing in 290 ms
- ✓ `npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json` → zero errors in any of the 4 new files (pre-existing v1 App.tsx errors logged out-of-scope)

**Must-haves truths verified:**
- ✓ HeuteBlock renders Bisher + Hochrechnung + pace + same-hour-last-week + payment-method bars in that order per UI-SPEC
- ✓ confidence='low' or h_now===0 or baseline_days_used<5 REPLACES projection number per D-19-06 (Test #3, #4)
- ✓ confidence='medium' shows projection + (Schätzung, geringe Datenbasis) caption in warning color per D-19-06 (Test #2)
- ✓ pace indicator hidden when baseline_days_used<5 per D-19-06 (Test #4)
- ✓ block.status==='error' renders BlockSkeleton variant='error' with approxHeight=220 per D-19-08 + D-19-09 (Test #5)
- ✓ AttentionList renders inside HeuteBlock after a divider; hidden entirely when status==='ok' && all categories empty per D-19-04 (Test #7, #8)
- ✓ AttentionList admin deep-links open via app.openLink({url}) not raw anchor per Pattern S3 (verified by grep target="_blank"=0 + AdminLink onClick implementation)
- ✓ AttentionList attention.status==='error' shows single-line 'Daten nicht verfügbar' mini-variant per D-19-09 (Test #9)

**Self-Check: PASSED**

## Next Plan Readiness

Plan 19-04 closes Wave 2 plan 04. Ready for plan 19-05 (HeatmapBlock) on the same Wave 2 baseline. Plan 19-07 (App.tsx composition) can now import the 3 exported symbols (AppContext, AttentionList, HeuteBlock) without any further preparation in plan 19-04 scope.

Zero PORTAL changes (PORT-04 zero-diff preserved verbatim).

---
*Phase: 19-revenue-intelligence-widget-v2*
*Plan: 04*
*Completed: 2026-04-25*
