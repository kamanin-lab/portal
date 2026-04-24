---
phase: 19-revenue-intelligence-widget-v2
plan: 06
subsystem: widget
tags: [react, mcp-poc, daily-briefing-widget, repeat-block, basket-block, aov-bands, mode-switch, plain-language-primary, technical-trio, tdd, vitest, jsdom, german-only]

requires:
  - phase: 19-revenue-intelligence-widget-v2
    plan: 01
    provides: lib/types.ts (Block, RepeatData, BasketData, BasketPair, AovBand), blocks/BlockSkeleton.tsx
  - phase: 19-revenue-intelligence-widget-v2
    plan: 02
    provides: lib/fixtures-payloads.ts (getFixturePayload — Boxspringbett+Lattenrost pair fixture, basket-aov mode), lib/useCountUp.ts, lib/formatters.ts (formatCurrency)
  - phase: 19-revenue-intelligence-widget-v2
    plan: 03
    provides: vitest jsdom environmentMatchGlobs for widgets/daily-briefing/src/blocks/__tests__/*.tsx

provides:
  - "blocks/RepeatBlock.tsx — 5-row repeat-customer card: heading, rate row with trend arrow (4 branches: +/-/0/null), benchmark + Shopify B2C subline, median days, basis row with de-DE thousands separator. useCountUp on Wiederkaufrate Display number. BlockSkeleton variant=error approxHeight=180 on status=error."
  - "blocks/BasketOrAovBlock.tsx — 3-mode dispatch (market_basket_product / market_basket_category / aov_bands) per D-19-07. Product/category modes share BasketPairRow (plain-language gloss + technical trio with U+00D7 multiplication sign). aov_bands mode renders twin opacity bars (50% count + 100% revenue) + Ø/Median Bestellwert with useCountUp. .slice(0,3) caps pair rendering for DoS mitigation."
  - "blocks/__tests__/RepeatBlock.test.tsx — 11 vitest jsdom cases: heading, rate label, 31% value, trend arrow 4-case logic (+4 / -2 / 0 / null), benchmark + subline, median row, basis row de-DE format, error variant"
  - "blocks/__tests__/BasketOrAovBlock.test.tsx — 11 vitest jsdom cases: 5× product mode (header, names, gloss, trio, basis), 1× category mode header, 4× aov_bands mode (header, 3 band labels, Ø Bestellwert, Median Bestellwert), 1× error variant"

affects:
  - "Wave 3 plan 19-07 App.tsx composition: imports RepeatBlock and BasketOrAovBlock; both are pure read-only blocks (no app prop, no callServerTool). Both blocks pair with HeatmapBlock + HeuteBlock to close the 4-block dashboard contract."
  - "Plan 19-07 v1 cleanup: with all 4 data blocks now built, the v1 App.tsx contents (KPIRow / RevenueCard / IncompleteCard / BriefingHeader) can be deleted in-place per D-19-11."

tech-stack:
  added: []
  patterns:
    - "Mode-switch via top-level dispatch: BasketOrAovBlock returns one of three sub-component renderers based on data.mode. AovBandsView is a completely different layout (twin bars + Ø/Median rows); BasketView shares a parameterised header for product vs category modes."
    - "Plain-language primary + technical-trio caption (D-19-07): each pair renders 3 lines — Line 1 (names with accent + separator), Line 2 (plain-language gloss '64% der A-Käufer kauften auch B'), Line 3 (mono trio 'Support X% · Konfidenz Y% · Lift Z×' with U+00D7). Lift uses comma decimal separator (de-DE)."
    - "Trend arrow 4-branch logic: trend_pp > 0 → '↑ +N PP' in success color; < 0 → '↓ -N PP' in danger; === 0 OR null → hidden entirely (no '±0 PP' rendering). Encoded in `showTrend` boolean + ternary in JSX."
    - "useCountUp placed BELOW the early-return error guard: same pattern as HeatmapBlock from plan 19-05. React treats error→ok as remount; hook order is stable per branch. AovBandsView wraps useCountUp inside the sub-component so it only fires when the aov_bands branch is reached."
    - "DoS mitigation T-19-06-03: basket_pairs `.slice(0, 3)` caps rendering at 3 pairs regardless of server payload size. Prevents O(n) DOM explosion if upstream returns malformed/large payload."
    - "U+00D7 MULTIPLICATION SIGN (×) used for Lift display, NOT letter x: per UI-SPEC §Copywriting/BasketOrAovBlock pair-line-3 template. Encoded as the Unicode character literally in source. Verified by grep returning count=1 and Python encoding error confirming it's `\\xd7`."

key-files:
  created:
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/RepeatBlock.tsx (84 LOC) — repeat metric card"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/BasketOrAovBlock.tsx (170 LOC) — 3-mode basket/AOV display"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/__tests__/RepeatBlock.test.tsx (123 LOC) — 11-case vitest suite"
    - "G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/__tests__/BasketOrAovBlock.test.tsx (125 LOC) — 11-case vitest suite"
    - "G:/01_OPUS/Projects/PORTAL/.planning/phases/19-revenue-intelligence-widget-v2/19-06-SUMMARY.md (this file)"
  modified: []

key-decisions:
  - "Trend arrow encoded with template-literal switch (`trend > 0 ? '↑ +${trend} PP' : '↓ ${trend} PP'`) — leverages the fact that negative numbers stringify with their minus sign already in place (e.g. -2 → '-2'), so the down-branch concatenates `↓ ` + `-2 PP` without manual sign manipulation. Cleaner than computing an absolute value + sign separately."
  - "Inline-formatted basis string `${tmpl}Bestellungen in 90 Tagen${endTmpl}` (template literal in JSX expression) instead of plain JSX text-node concatenation: required to keep the entire string `Basis: 1.340 Bestellungen in 90 Tagen` on one logical line for both grep-acceptance and JSX whitespace-collapse correctness. Originally JSX text wrapped to two lines and grep returned 0 matches for the literal string (Rule 1 deviation — fixed in same task)."
  - "AovBandsView extracted as nested sub-component (not inlined): cleanly separates the useCountUp hook scope from the BasketView branch, avoiding the unconditional-hook-rule pitfall. BasketView itself uses no hooks beyond JSX rendering, so the dispatch pattern works without hoisting useCountUp to the parent."
  - "Slice basket_pairs to 3 even when fewer present: `(data.basket_pairs ?? []).slice(0, 3)` is idempotent when length ≤ 3 and protective when length > 3. Documented as T-19-06-03 mitigation."
  - "BasketOrAovBlock signature takes only { block: Block<BasketData> }: NO app prop, no callServerTool — pure read-only block per plan 19-05 SUMMARY downstream notice. Differs from HeatmapBlock which needs app for re-fetch."

requirements-completed: [WIDG-BLOCK-03, WIDG-BLOCK-04, WIDG-QA-03, WIDG-QA-04]

duration: ~5 min
completed: 2026-04-25
---

# Phase 19 Plan 06: RepeatBlock + BasketOrAovBlock Summary

**Built the remaining two data blocks to close the 4-block dashboard contract — RepeatBlock (WIDG-BLOCK-03, 5-row metric card with trend arrow + count-up) and BasketOrAovBlock (WIDG-BLOCK-04, 3-mode dispatch per D-19-07 plain-language-primary + technical-trio with U+00D7 multiplication sign). 4 atomic commits in mcp-poc, 22 vitest jsdom cases all green, zero PORTAL diff.**

## Performance

- **Duration:** ~5 min
- **Tasks:** 2 (TDD: 2× RED + GREEN cycles)
- **Files created (mcp-poc):** 4 (RepeatBlock.tsx, BasketOrAovBlock.tsx, RepeatBlock.test.tsx, BasketOrAovBlock.test.tsx)
- **Files modified (mcp-poc):** 0
- **Files created (PORTAL):** 1 (this summary)
- **Files modified (PORTAL):** 0 (PORT-04 zero-diff preserved)
- **Commits:** 4 atomic commits in mcp-poc main (2× test/RED + 2× feat/GREEN)
- **New external deps:** 0
- **Test cases added:** 22 (all green under jsdom)

## Accomplishments

### `blocks/RepeatBlock.tsx` (84 LOC)

Read-only metric card with the following anatomy (top → bottom):

1. **Heading** `Wiederkäufer — letzte 90 Tage` (Heading role, text-lg, semibold)
2. **Rate row**: `Wiederkaufrate` label (Body 15px) | right: Display 31 % (3xl, semibold, tabular-nums) + trend arrow Caption
3. **Benchmark row**: `Branchen-Benchmark ~27 %` (Body 15px) + subline `(Shopify B2C, 2024)` (Caption subtle)
4. **Median row** (only when `median_days_to_2nd !== null`): `Ø Tage bis 2. Kauf` label (Caption muted) | `38 Tage` value (Body)
5. **Basis row**: `Basis: 1.340 Bestellungen in 90 Tagen` (Caption subtle, de-DE thousands separator)

Top-level error guard: `block.status === "error"` → `<BlockSkeleton variant="error" approxHeight={180} />`. `useCountUp(repeat_rate_pct)` hook placed below the guard; React treats error→ok as remount, so hook order is stable per branch (same pattern as plan 19-05 HeatmapBlock).

#### Trend arrow logic (4 branches)

```ts
const trend = data.trend_pp;
const showTrend = typeof trend === "number" && trend !== 0;
// In JSX:
{showTrend && (
  <span style={{ color: trend > 0 ? "var(--color-success)" : "var(--color-danger)" }}>
    {trend > 0 ? `↑ +${trend} PP` : `↓ ${trend} PP`}
  </span>
)}
```

- `trend_pp > 0` → `↑ +N PP` in success color (e.g. `↑ +4 PP`)
- `trend_pp < 0` → `↓ -N PP` in danger color (negative number stringifies with minus already; e.g. `↓ -2 PP`)
- `trend_pp === 0` → hidden entirely
- `trend_pp === null` → hidden entirely (`typeof === "number"` excludes null)

### `blocks/BasketOrAovBlock.tsx` (170 LOC)

Top-level dispatcher that switches render based on `data.mode`. Three sub-components:

1. **`BasketView`** (used for both `market_basket_product` and `market_basket_category`):
   - Header: `Häufig zusammen gekauft` (product) or `Häufig zusammen gekauft (Kategorien)` (category) — passed as prop
   - For each pair (top 3 via `.slice(0, 3)`): render `BasketPairRow`
   - Footer: `Basis: letzte 90 Tage` (Caption subtle)

2. **`BasketPairRow`** (3-line plain-language-primary + technical-trio per D-19-07):
   - Line 1 (Body fg): `{a_name}` + accent-colored ` + ` + `{b_name}`
   - Line 2 (Body muted): `${confPct}% der ${a_name}-Käufer kauften auch ${b_name}` — plain-language gloss
   - Line 3 (Caption mono subtle): `Support ${supPct}% · Konfidenz ${confPct}% · Lift ${liftStr}×` — U+00D7 MULTIPLICATION SIGN (×), NOT letter x; lift uses comma decimal (`3.2` → `3,2`)

3. **`AovBandsView`** (used for `aov_bands` mode):
   - Header: `Bestellwert-Verteilung — letzte 90 Tage`
   - 3 `AovBandRow`s with `gap-3` between
   - Divider (1px border)
   - `Ø Bestellwert` row: Caption label + `formatCurrency(useCountUp(avg_order_value))` Display (text-2xl exception per UI-SPEC)
   - `Median Bestellwert` row (only when `median_order_value` present): Caption label + `formatCurrency(median_order_value)` Body

4. **`AovBandRow`** (twin opacity bars per UI-SPEC §Color/AOV bars):
   - Line 1: band label left + `${countPct} % · ${revPct} % Umsatz` right (Caption tabular-nums)
   - Line 2: share-of-count bar (height 6px, `width:${countPct}%`, `color-mix(in oklch, var(--color-accent) 50%, transparent)`)
   - Line 3: share-of-revenue bar (height 6px, `width:${revPct}%`, solid `var(--color-accent)`)

Top-level error guard: `block.status === "error"` → `<BlockSkeleton variant="error" approxHeight={240} />`.

### `blocks/__tests__/RepeatBlock.test.tsx` (11 cases, all green)

| # | Suite | Case | Asserts |
|---|-------|------|---------|
| 1 | healthy (WIDG-BLOCK-03) | renders heading | `Wiederkäufer — letzte 90 Tage` visible |
| 2 | healthy | renders Wiederkaufrate label | `Wiederkaufrate` visible |
| 3 | healthy | renders 31 % rate | regex `/31\s*%/` matches (count-up settled in reduced-motion mode) |
| 4 | healthy | trend_pp=4 renders `↑ +4 PP` | regex `/↑\s*\+4\s*PP/` |
| 5 | trend branches | trend_pp=-2 renders `↓ -2 PP` | regex `/↓\s*-2\s*PP/` |
| 6 | trend branches | trend_pp=0 hides PP indicator | `queryByText(/PP/)` returns null |
| 7 | trend branches | trend_pp=null hides PP indicator | `queryByText(/PP/)` returns null |
| 8 | healthy | renders benchmark + subline | `Branchen-Benchmark ~27 %` + `(Shopify B2C, 2024)` |
| 9 | healthy | renders median days row | `Ø Tage bis 2. Kauf` + `38 Tage` |
| 10 | healthy | renders basis with de-DE format | `Basis: 1.340 Bestellungen in 90 Tagen` (1340 → "1.340") |
| 11 | error (WIDG-QA-03) | block.status=error renders BlockSkeleton | `Daten nicht verfügbar` + `Bitte Seite neu laden` |

### `blocks/__tests__/BasketOrAovBlock.test.tsx` (11 cases, all green)

| # | Suite | Case | Asserts |
|---|-------|------|---------|
| 1 | product mode (WIDG-BLOCK-04) | renders header without "Kategorien" | `Häufig zusammen gekauft` visible (exact match) |
| 2 | product mode | renders Boxspringbett + Lattenrost names | `getAllByText(/Boxspringbett/).length > 0` for both names (each appears in Line 1 + Line 2 gloss) |
| 3 | product mode | renders gloss sentence | `64% der Boxspringbett-Käufer kauften auch Lattenrost` |
| 4 | product mode | renders technical trio with U+00D7 | `Support 8% · Konfidenz 64% · Lift 3,2×` (comma decimal + U+00D7) |
| 5 | product mode | renders Basis footer | `Basis: letzte 90 Tage` |
| 6 | category mode | renders Kategorien header | `Häufig zusammen gekauft (Kategorien)` (test-local Block fixture with mode=market_basket_category) |
| 7 | aov_bands mode | renders Bestellwert-Verteilung header | `Bestellwert-Verteilung — letzte 90 Tage` |
| 8 | aov_bands mode | renders 3 band labels | `< 500 €`, `500–1.500 €` (U+2013 en-dash), `> 1.500 €` |
| 9 | aov_bands mode | renders Ø Bestellwert | `Ø Bestellwert` + `847 €` |
| 10 | aov_bands mode | renders Median Bestellwert | `Median Bestellwert` + `680 €` |
| 11 | error (WIDG-QA-03) | block.status=error renders BlockSkeleton | `Daten nicht verfügbar` + `Bitte Seite neu laden` |

Test setup mirrors plan 19-05: `stubReducedMotion(true)` ensures `useCountUp` returns the target immediately so rate/avg assertions match the final value.

## Test Coverage to Requirements

| Requirement | Coverage |
|---|---|
| WIDG-BLOCK-03 (RepeatBlock) | RepeatBlock tests 1–10 (healthy + trend branches) |
| WIDG-BLOCK-04 (BasketOrAovBlock 3-mode) | BasketOrAovBlock tests 1–10 (5× product + 1× category + 4× aov_bands) |
| WIDG-QA-03 (per-block error isolation) | RepeatBlock test 11, BasketOrAovBlock test 11 |
| WIDG-QA-04 (German-only) | All 22 tests assert against German strings only; no English in component output |

## Commits

Four atomic commits on `mcp-poc` `main` branch:

1. **`6bf9a52`** — `test(19-06): add failing RepeatBlock suite` (Task 1 RED)
2. **`50cf60b`** — `feat(19-06): implement RepeatBlock (WIDG-BLOCK-03)` (Task 1 GREEN, includes Rule 1 fix for JSX whitespace-collapse on basis row)
3. **`916c8cb`** — `test(19-06): add failing BasketOrAovBlock suite — 3 modes + error` (Task 2 RED)
4. **`3d63d50`** — `feat(19-06): implement BasketOrAovBlock with 3-mode switch (WIDG-BLOCK-04, D-19-07)` (Task 2 GREEN)

Final test run: 22/22 green in 335 ms (combined). Block-file typecheck zero errors (`RepeatBlock.tsx`, `BasketOrAovBlock.tsx`); pre-existing v1 `App.tsx` JSX-namespace errors remain out of scope per plan 19-04/05 SUMMARYs (will be resolved in plan 19-07's v1 cleanup).

## Acceptance Criteria — Verified

### Task 1 (RepeatBlock)

| Check | Result |
|---|---|
| `npm run test:run -- .../RepeatBlock` exits 0 with ≥ 11 cases | ✓ 11/11 in 178 ms |
| `grep -c "export function RepeatBlock"` returns `1` | ✓ 1 |
| `grep -c "Wiederkäufer — letzte 90 Tage"` returns `1` | ✓ 1 |
| `grep -c "Wiederkaufrate"` returns `1` | ✓ 1 |
| `grep -c "Branchen-Benchmark"` returns `1` | ✓ 1 |
| `grep -c "Shopify B2C, 2024"` returns `1` | ✓ 1 |
| `grep -c "Ø Tage bis 2. Kauf"` returns `1` | ✓ 1 |
| `grep -c "Bestellungen in 90 Tagen"` returns `1` | ✓ 1 (after Rule 1 fix; see Deviations) |
| `grep -c "useCountUp"` returns ≥ 1 | ✓ 3 |
| `grep -c "BlockSkeleton"` returns ≥ 1 | ✓ 2 |
| `npx tsc --noEmit` exits 0 for RepeatBlock | ✓ zero errors in this file |

### Task 2 (BasketOrAovBlock)

| Check | Result |
|---|---|
| `npm run test:run -- .../BasketOrAovBlock` exits 0 with ≥ 11 cases | ✓ 11/11 in 187 ms |
| `grep -c "export function BasketOrAovBlock"` returns `1` | ✓ 1 |
| `grep -c "Häufig zusammen gekauft"` returns ≥ 2 | ✓ 2 (product + category headers) |
| `grep -c "Bestellwert-Verteilung — letzte 90 Tage"` returns `1` | ✓ 1 |
| `grep -c "Ø Bestellwert"` returns `1` | ✓ 1 |
| `grep -c "Median Bestellwert"` returns `1` | ✓ 1 |
| `grep -c "Basis: letzte 90 Tage"` returns `1` | ✓ 1 |
| `grep -c "Käufer kauften auch"` returns `1` | ✓ 1 (plain-language gloss template) |
| `grep -c '×'` returns ≥ 1 (U+00D7 NOT letter x) | ✓ 1 (verified via Python encoding error: `'\\xd7'`) |
| `grep -c "BlockSkeleton"` returns ≥ 1 | ✓ 2 |
| `npx tsc --noEmit` exits 0 for BasketOrAovBlock | ✓ zero errors in this file |

## must_haves Truths — Verified

- ✓ RepeatBlock renders heading + Wiederkaufrate + 31% + benchmark `~27 %` + median `38 Tage` + basis `1.340 Bestellungen in 90 Tagen` per UI-SPEC Copywriting (RepeatBlock tests 1–3, 8–10)
- ✓ RepeatBlock trend arrow: `↑ +N PP` success / `↓ -N PP` danger / hidden when null or 0 (RepeatBlock tests 4–7)
- ✓ BasketOrAovBlock market_basket_product mode renders header `Häufig zusammen gekauft` + 3 pairs with trio line containing U+00D7 × (BasketOrAovBlock tests 1, 4)
- ✓ BasketOrAovBlock market_basket_category mode renders header `Häufig zusammen gekauft (Kategorien)` + same pair shape (BasketOrAovBlock test 6)
- ✓ BasketOrAovBlock aov_bands mode renders header `Bestellwert-Verteilung — letzte 90 Tage` + 3 band rows + Ø Bestellwert + Median Bestellwert (BasketOrAovBlock tests 7–10)
- ✓ block.status='error' on either block renders BlockSkeleton variant='error' with approxHeight=180 (RepeatBlock) or 240 (BasketOrAovBlock) per D-19-09 (RepeatBlock test 11, BasketOrAovBlock test 11)
- ✓ BasketOrAovBlock pair confidence gloss `XX% der ${A}-Käufer kauften auch ${B}` renders exact D-19-07 sentence (BasketOrAovBlock test 3)

## Decisions Made

- **Trend arrow template-literal switch:** leverages the fact that JS `(-2).toString() === "-2"` already includes the minus sign, so the down-branch concatenates `↓ ` + `-2 PP` directly without `Math.abs()` + sign manipulation. Cleaner and matches UI-SPEC literal copy.
- **Inline-formatted basis string:** Originally used JSX text-node concatenation `Basis: {value} Bestellungen in 90 Tagen`. After the auto-formatter wrapped this across two lines, `grep -c "Bestellungen in 90 Tagen"` returned 0 (literal newline broke the substring). Switched to a template literal in a JSX expression `{`Basis: ${value} Bestellungen in 90 Tagen`}` which keeps the entire string on one logical line for grep AND renders identically. Documented as Rule 1 fix.
- **AovBandsView extracted as nested sub-component:** Avoids the rules-of-hooks pitfall — `useCountUp` only fires when the aov_bands branch is reached, but lives inside its own component scope where React enforces hook ordering correctly. BasketView (used for product + category) takes no hooks, so the parent's mode-dispatch pattern works without hoisting.
- **`.slice(0, 3)` is idempotent + protective:** Applied to `data.basket_pairs` regardless of length. When length ≤ 3 it's a no-op; when length > 3 it caps DOM rendering at 3 rows. Documented as T-19-06-03 mitigation in plan threat register.
- **No app prop on BasketOrAovBlock:** Both blocks are pure read-only displays. Plan 19-05 SUMMARY noted that "Plan 19-06 blocks do not require the app prop" — this signature was honoured. The 4-block composition in plan 19-07 will pass `app={appRef.current}` only to HeatmapBlock.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — JSX whitespace-collapse bug] `grep -c "Bestellungen in 90 Tagen"` returned 0 after auto-formatter wrap**

- **Found during:** Task 1 acceptance verification
- **Issue:** Initial JSX `Basis: {data.total_orders.toLocaleString("de-DE")} Bestellungen in 90 Tagen` was auto-wrapped by Prettier to break "Bestellungen in 90" and "Tagen" across two source lines. JSX whitespace-collapse made the rendered output identical (test 10 still passed via the regex `/Basis:\s*1\.340\s*Bestellungen\s*in\s*90\s*Tagen/` which uses `\s*` to absorb the newline-as-whitespace). However, the literal-string acceptance grep returned 0.
- **Fix:** Rewrote as a template literal in a JSX expression: `{`Basis: ${data.total_orders.toLocaleString("de-DE")} Bestellungen in 90 Tagen`}`. The template literal is a single token to the formatter (won't be broken across lines), and renders identically. Both test 10 + grep acceptance now pass.
- **Files modified:** `widgets/daily-briefing/src/blocks/RepeatBlock.tsx` (in-flight; folded into GREEN commit)
- **Commit:** `50cf60b`

### Out-of-scope / Pre-existing

**2. [Out-of-scope, observed] Pre-existing JSX-namespace TS errors in v1 App.tsx**

- **Found during:** Task 1 + Task 2 typecheck
- **Issue:** `npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json` reports 9 `TS2503: Cannot find namespace 'JSX'` errors — all in v1 `App.tsx` which is scheduled for in-place replacement in plan 19-07. Already documented as out-of-scope in plans 19-04/05 SUMMARYs.
- **Fix:** None — out of scope. Not introduced by this plan; no diff against `App.tsx`.
- **Logged to:** This summary only; plan 19-07 will resolve as part of v1 cleanup (D-19-11).
- **Impact:** None on plan 19-06 acceptance — both new files (`RepeatBlock.tsx`, `BasketOrAovBlock.tsx`) compile clean; pre-existing errors don't block any acceptance criteria.

---

**Total deviations:** 2 (1 auto-fixed during execution, 1 pre-existing observation)
**Impact on plan:** Zero architectural changes. All 7 must_haves.truths verifiable. All acceptance criteria met for both tasks.

## Issues Encountered

None blocking. The 1 auto-fixed deviation was caught by the acceptance-grep verification and corrected in-flight before committing GREEN.

## Threat Surface Scan

Per plan 19-06 threat register:

- **T-19-06-01 (Tampering: XSS via product name injection)** — **mitigated.** All product/category names from server (`pair.a_name`, `pair.b_name`, `band.label`) are rendered as React text children, which auto-escape. No `dangerouslySetInnerHTML` anywhere in either file (verified by absence in source). A malicious `a_name: "<script>"` would render as the literal string `"<script>"`, not executed.
- **T-19-06-02 (Information Disclosure: error message leak)** — **mitigated.** `block.status === "error"` returns hardcoded `BlockSkeleton variant="error"` which renders `Daten nicht verfügbar` + `Bitte Seite neu laden` only — the `block.message` field is never read in either component.
- **T-19-06-03 (DoS: basket_pairs.length = 1000)** — **mitigated.** `.slice(0, 3)` caps rendering at 3 pairs regardless of server payload size. Prevents O(n) DOM explosion. Verified via grep `(data.basket_pairs ?? []).slice(0, 3)` in BasketOrAovBlock.tsx.

No new threat surface beyond the register. Omitting `## Threat Flags` section (no flags found).

## Self-Check

**Files created (verified via Bash existence checks):**
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/RepeatBlock.tsx`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/BasketOrAovBlock.tsx`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/__tests__/RepeatBlock.test.tsx`
- ✓ `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/blocks/__tests__/BasketOrAovBlock.test.tsx`
- ✓ `G:/01_OPUS/Projects/PORTAL/.planning/phases/19-revenue-intelligence-widget-v2/19-06-SUMMARY.md` (this file)

**Commits exist (verified via `git log --oneline -6` in mcp-poc):**
- ✓ `6bf9a52 test(19-06): add failing RepeatBlock suite`
- ✓ `50cf60b feat(19-06): implement RepeatBlock (WIDG-BLOCK-03)`
- ✓ `916c8cb test(19-06): add failing BasketOrAovBlock suite — 3 modes + error`
- ✓ `3d63d50 feat(19-06): implement BasketOrAovBlock with 3-mode switch (WIDG-BLOCK-04, D-19-07)`

**Acceptance grep counts (re-verified):** all 22 grep checks pass (see Acceptance Criteria — Verified tables above).

**Verification commands rerun:**
- ✓ `npm run test:run -- .../RepeatBlock .../BasketOrAovBlock` → 22/22 passing in 335 ms
- ✓ `npx tsc --noEmit -p widgets/daily-briefing/tsconfig.json` → zero errors in RepeatBlock.tsx + BasketOrAovBlock.tsx (pre-existing v1 App.tsx errors logged out-of-scope)

**Self-Check: PASSED**

## Exports Surface (for downstream import targets)

- `blocks/RepeatBlock.tsx`:
  - `export function RepeatBlock({ block }: { block: Block<RepeatData> }): JSX.Element`
- `blocks/BasketOrAovBlock.tsx`:
  - `export function BasketOrAovBlock({ block }: { block: Block<BasketData> }): JSX.Element`

## Downstream Dependency Notice

**Plan 19-07 (App.tsx composition / Wave 3):**

With this plan, all 4 data blocks are now built and ready for composition:

```tsx
// In the new App.tsx (plan 19-07):
import { HeuteBlock } from "./blocks/HeuteBlock";       // plan 19-04
import { HeatmapBlock } from "./blocks/HeatmapBlock";   // plan 19-05 (needs app prop)
import { RepeatBlock } from "./blocks/RepeatBlock";     // plan 19-06 (this plan)
import { BasketOrAovBlock } from "./blocks/BasketOrAovBlock"; // plan 19-06 (this plan)

// Render:
<HeuteBlock block={payload.blocks.run_rate} attention={payload.attention} />
<HeatmapBlock block={payload.blocks.heatmap} app={appRef.current} />
<RepeatBlock block={payload.blocks.repeat} />
<BasketOrAovBlock block={payload.blocks.basket} />
```

- RepeatBlock + BasketOrAovBlock are pure read-only blocks — NO app prop, NO callServerTool, NO local state. The composition just passes the block payload slice and forgets.
- HeatmapBlock remains the only block requiring the live `App` instance (period-toggle re-fetch).
- HeuteBlock owns AttentionList internally (consumes AppContext).

**Plan 19-07 v1 cleanup (D-19-11):**

The remaining v1 surfaces in `App.tsx` (KPIRow / RevenueCard / IncompleteCard / BriefingHeader / BriefingFooter / mockData / formatMoney / formatHours / formatTimestamp) can now be deleted in-place — every block in the new 4-block composition has a complete v2 replacement file.

## Next Plan Readiness

Plan 19-06 closes Wave 2. All 4 data blocks (HeuteBlock, HeatmapBlock, RepeatBlock, BasketOrAovBlock) plus 2 utility components (BlockSkeleton, AttentionList) plus AppContext are built and tested. Ready for plan 19-07 (Wave 3 — App.tsx composition + v1 cleanup).

Zero PORTAL changes (PORT-04 zero-diff preserved verbatim).

---
*Phase: 19-revenue-intelligence-widget-v2*
*Plan: 06*
*Completed: 2026-04-25*
