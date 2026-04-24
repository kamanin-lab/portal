# Phase 19: Revenue Intelligence Widget v2 — Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the production 4-block Revenue Intelligence dashboard widget — `HeuteBlock` (run-rate projection + payment-method split + payment-attention sub-section), `HeatmapBlock` (7×24 order density with period toggle), `RepeatBlock` (repeat-purchase rate + median days to 2nd order), `BasketOrAovBlock` (3-mode cross-sell/AOV) — inside `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/` using the Phase 18 rails (per-widget Vite config, `kmn/theme/*` bridge, shared tokens, dev harness fixtures). Consumes the locked `BriefingPayload` shape from Phase 17 at the same `ui://widgets/daily-briefing.html` URI. German-only UI, single-file `dist/index.html` ≤ 300 KB gz, PORTAL `RevenueIntelligencePage.tsx` unchanged (zero TypeScript diff).

Two repos touched:
- `G:/01_OPUS/Projects/mcp-poc` — new v2 widget code in `widgets/daily-briefing/src/{blocks,lib}` (replaces v1 `App.tsx` contents; v1 file set deleted in same phase)
- `G:/01_OPUS/Projects/PORTAL` — NO code changes to portal TypeScript (PORT-04 hard assertion); only the already-wired sandbox-proxy relay (landed in Phase 18) is verified intact

**Explicitly out of scope:** Monday briefing email Edge Function (Phase 20), MBM production rollout (future milestone), Klaviyo integration (v3.1+), Summerfield-specific data tests (DDEV Summerfield clone not available yet — widget is built against Summerfield-seeded `daily_briefing` response shape only).

</domain>

<decisions>
## Implementation Decisions

### Chart rendering strategy (heatmap + bars)

- **D-19-01:** All visualisations are hand-rolled — no chart library dependency.
  - Heatmap 7×24 = CSS grid (`grid-template-columns: repeat(24, minmax(0,1fr))` + 7 rows) of 168 `<div>` cells. Per-cell colour via inline `style={{background: colorForCount(n)}}` using a 5-step intensity scale derived from the 12 theme tokens (`--color-accent` + opacity/mix). Empty cells = `--color-subtle`.
  - Payment-method split bars inside HeuteBlock = flex rows with `width: ${percent}%` + Tailwind background classes.
  - AOV-bands bars (fallback mode) = same pattern as payment-method bars.
  - Every chart primitive is pure JSX + CSS. No `visx`, `recharts`, `victory`, `echarts`. Dependency cost: 0 KB.
- **D-19-02:** The 300 KB gz budget is reserved for: React 19 (~45 KB) + Motion v12 (~15 KB) + Tailwind v4 inlined CSS (~4 KB) + Phase-19 widget code + fixtures. Target budget for widget code: ≤ 80 KB gz, leaving ~150 KB headroom. Bundle size verified in CI by Phase 18's existing `scripts/check-bundle-size.mjs`.
- **Why chosen:** The heatmap IS the visual centrepiece; controlling the render path end-to-end (no canvas, no abstraction layer) is the cheapest way to hit the 300 KB budget AND to guarantee Motion compatibility for block-level fade-in (D-19-03). `visx/heatmap` would spend ~30 KB for replaceable rect-painting logic.

### Motion budget

- **D-19-03:** Moderate Motion — staggered block entry on first `toolResult` arrival + number count-up on key metrics. No per-cell heatmap motion (reaffirms Phase 18 constraint; 168 cells would cascade-render jankily inside the sandboxed iframe).
  - **Block entry:** 4 blocks fade+translateY in with 80ms stagger via `AnimatePresence` + `motion.div` with `initial/animate/exit` — drives the "dashboard landing" feel.
  - **Number count-up:** HeuteBlock's `Hochrechnung` number, RepeatBlock's `Wiederkaufrate` percentage, and BasketOrAovBlock's AOV number count from 0 to the final value over ~600ms on first render only (not on period-toggle re-fetch). Driver: a small `useCountUp(target)` hook using `useSpring` from Motion — ~30 LOC shared helper in `src/lib/`.
  - **Heatmap reveal:** container-level fade-in only. The 168 cells appear together under a single parent opacity tween.
  - **Period-toggle feedback:** when HeatmapBlock is re-fetching after a toggle click, the heatmap block content dissolves to 60% opacity with a tiny spinner overlay; no re-stagger of sibling blocks.
  - **`prefers-reduced-motion`:** honoured via `useReducedMotion()` from `motion/react` — returns instant fade (no translate, no count-up). All Motion config is conditional on this.

### Payment-attention sub-section placement (WIDG-BLOCK-05)

- **D-19-04:** Payment-attention renders INSIDE `HeuteBlock` as a collapsible sub-section below the run-rate + pace + payment-method-split content.
  - Section heading: `Zahlungsaufmerksamkeit` (German, WIDG-QA-04).
  - Shows the list of attention orders (`order_id`, `customer_name`, `amount`, `failed_at`, `payment_method`, admin deep-link) using the same row pattern as the v1 widget's `AttentionList` component — lifted into `src/blocks/HeuteBlock.tsx` or a dedicated sub-component `src/blocks/AttentionList.tsx` imported only by HeuteBlock.
  - **Conditional render:** if `payload.attention.status === 'error'` → per-block error skeleton (D-19-09 rules); if `status === 'ok' && entries.length === 0` → section hidden entirely (no empty-state row, no "Keine auffälligen Zahlungen" caption); if `entries.length > 0` → render the list.
  - Admin deep-links (`https://{store}/wp-admin/post.php?post={id}&action=edit`) open via the sandbox-safe `app.openLink({url})` pattern already used in v1 — re-wire to the existing `RevenueIntelligencePage.tsx` `handleOpenLink` handler (no portal diff needed; the handler is already generic).
- **Why chosen:** Keeps the "4-block dashboard" rhythm clean in the wireframe sense, but ties "today's money" visually to "money at risk today". Separate-block option inflated the visual footprint; above-Heute triage option broke the spec's block order (Deliverable #1 requires literal order: HeuteBlock → HeatmapBlock → RepeatBlock → BasketOrAovBlock).

### Heatmap period toggle — IN SCOPE

- **D-19-05:** The `[4 Wochen] [8 Wochen ✓] [12 Wochen]` toggle is implemented in Phase 19 as a real per-block re-fetch.
  - Initial render uses `payload.blocks.heatmap.data` (server-side default `weeks: 8` from Phase 17 D-07).
  - Click on `4w` or `12w` fires `app.callTool({ name: 'weekly_heatmap', arguments: { weeks: N } })` via `@modelcontextprotocol/ext-apps` AppBridge — the widget is already an MCP App instance so `callTool` is available.
  - On call start: HeatmapBlock-local loading state (heatmap dims to 60% opacity + small centered spinner). Sibling blocks (Heute, Repeat, Basket) do NOT re-render.
  - On call success: heatmap block re-renders with new data; `activeWeeks` state updates; toggle button highlighted accordingly.
  - On call failure: heatmap block shows the per-block error skeleton (D-19-09); toggle buttons remain clickable so user can retry via selecting a different period.
  - State shape: `const [heatmapView, setHeatmapView] = useState<{weeks: 4|8|12; data: HeatmapData | null; error: string | null; loading: boolean}>(...)` lives inside `HeatmapBlock` itself, seeded from initial payload.
- **Why chosen:** The toggle is in the spec wireframe AND is the single interaction that proves "the widget is not a static screenshot". Deferring it would leave 3 non-functional buttons in the dashboard's most visually-prominent block — reads as half-baked. Client-side 12-week slice was rejected because it breaks Phase 17's locked `daily_briefing` payload shape (`weeks:8` is the server default).

### Confidence & edge-case display (RunRate)

- **D-19-06:** RunRate confidence is surfaced via **inline replacement**, not a badge.
  - `confidence === 'high'` → show the projected number prominently: `Hochrechnung ▶ 4.280 € bis 23:59`, no caveat text.
  - `confidence === 'medium'` (sparse days fallback: `expected_by_hour[h_now] < 5.0 €`) → show the number + a small grey 2-line caption directly beneath: `(Schätzung, geringe Datenbasis)`. The number stays primary visual weight; the caption informs without demoting.
  - `confidence === 'low'` OR `h_now === 0` OR fewer than 5 valid baseline days → the projection number is REPLACED by a single-line message: `Noch zu früh für Hochrechnung` (when `h_now === 0`) or `Nicht genug Daten für Hochrechnung` (insufficient baseline). The `Bisher` actual-revenue-so-far value still renders above — only the projection row is the one that swaps.
  - The pace-vs-7-day indicator follows the same discipline: if pace baseline is unusable (< 5 valid days at same hour), the indicator is hidden entirely rather than showing `+N/A%`.
- **Why chosen:** Users should never see a big confident-looking number next to a "low confidence" badge — the cognitive dissonance undermines trust (which is exactly the bug v2 is fixing). Replacing the number with the reason makes the limitation the primary content in the degraded case.

### Basket block presentation (mode + trio)

- **D-19-07:** BasketOrAovBlock uses a **plain-language primary + technical metrics in caption** layout for all 3 modes.
  - **Mode header** (small, always visible above the block content):
    - `market_basket_product` → `Häufig zusammen gekauft`
    - `market_basket_category` → `Häufig zusammen gekauft (Kategorien)`
    - `aov_bands` → `Bestellwert-Verteilung — letzte 90 Tage`
  - **Market basket modes (product + category), per pair:**
    - Line 1 (primary, large): `{A} + {B}` — both names in `--color-fg` at medium weight.
    - Line 2 (plain-language gloss): `64% der {A}-Käufer kauften auch {B}` — this is the sentence a merchant reads first.
    - Line 3 (technical caption, small grey mono): `Support 8% · Konfidenz 64% · Lift 3,2×` — kept for the analyst eye, but visually subordinate.
  - **AOV bands mode:** full wireframe layout from REVENUE_INTELLIGENCE_V2_PLAN.md §3.4 — 3 horizontal bars (< 500 €, 500–1.500 €, > 1.500 €), each showing share-of-count AND share-of-revenue as two stacked/side-by-side mini-bars with percentage labels. Below: `Ø Bestellwert 847 €` + `Median Bestellwert 680 €`.
  - No tooltip usage (sandboxed iframe hover behaviour is fiddly across browsers).
- **Why chosen:** The merchant is the reader. Plain-language ("Kunden die X kauften, kauften auch Y") lands the insight in <1 second. The full trio stays visible in small caption for Yuri/the analyst, so no information is lost — just re-prioritised.

### Error & loading UX per block (WIDG-QA-03)

- **D-19-08:** First-load skeletons and error skeletons share the same component — a single `BlockSkeleton` in `src/blocks/` with props `{variant: 'loading' | 'error'}`.
  - **Loading variant** (rendered when `toolResult === null` on first page load): shimmer-bg card at the block's approximate height, no text. Rendered inside each block wrapper so the 4-block grid layout is stable before data arrives.
  - **Error variant** (rendered when `block.status === 'error'`): solid grey card at the block's approximate height, with primary text `Daten nicht verfügbar` (centered, `--color-muted`) and secondary text `Bitte Seite neu laden` (small, `--color-subtle`).
  - **No retry button.** The widget does NOT own retry semantics — the user reloads the page (or waits for portal's existing realtime/polling, inherited via `RevenueIntelligencePage`'s `initialCallDoneRef` one-shot pattern which the user can reset by leaving and returning to the page).
  - **Error copy in German** (WIDG-QA-04): `Daten nicht verfügbar` + `Bitte Seite neu laden`.
- **D-19-09:** The per-block skeleton-on-error contract applies to 4 data blocks AND to the attention sub-section:
  - `payload.blocks.run_rate.status === 'error'` → HeuteBlock shows skeleton (attention sub-section also hidden).
  - `payload.blocks.heatmap.status === 'error'` → HeatmapBlock shows skeleton; period-toggle buttons remain visible+clickable.
  - `payload.blocks.repeat.status === 'error'` → RepeatBlock skeleton.
  - `payload.blocks.basket.status === 'error'` → BasketOrAovBlock skeleton (no mode header shown).
  - `payload.attention.status === 'error'` → attention sub-section inside HeuteBlock shows a mini-variant of the skeleton (single line: `Daten nicht verfügbar`), other parts of HeuteBlock continue rendering.

### Testing depth

- **D-19-10:** Tests extend the Phase 18 mcp-poc vitest setup. Three categories:
  - **Formatters** (new file `widgets/daily-briefing/src/lib/__tests__/formatters.test.ts`):
    - `formatCurrency(1240)` → `1.240 €` (de-DE, thousands dot, space before `€`).
    - `formatPercent(0.18)` → `+18 %` (with sign for positive, minus for negative, `%` with thin space).
    - `formatPP(4)` → `+4 PP` (percentage-point delta).
    - `formatDate(date)` → `Mo, 21.04.` style for heatmap row labels.
    - Negative, zero, and edge inputs covered.
  - **Fixture parser** (`widgets/daily-briefing/src/lib/__tests__/fixtures.test.ts`):
    - Extend the Phase 18 `getFixtureMode()` tests (already has basic coverage) with v2-specific cases: fixture payload shape validation (`basket-aov` mock returns `mode: 'aov_bands'`; `one-block-failing` mock has exactly 3 `status:'ok'` blocks + 1 `status:'error'`).
  - **Block snapshot tests** (`widgets/daily-briefing/src/blocks/__tests__/*.test.tsx`):
    - One snapshot test per block × healthy state = 4 snapshots.
    - Plus: `BasketOrAovBlock` snapshots for all 3 modes (product, category, aov_bands) = 2 more.
    - Plus: each block's error variant = 4 more.
    - Total ~10 snapshots. Uses `@testing-library/react` + `renderer.toJSON()`.
  - **NO interaction tests** for the period toggle in automated suite — verified manually against the dev harness (`?mock=*` fixtures). Rationale: toggle behaviour depends on `callTool` wiring which requires MCP App harness; covered by human UAT instead.
  - **NO Playwright visual regression** — mcp-poc has no Playwright, and visual baselines are fragile to Motion timing.
- **Why chosen:** Snapshot tests on blocks lock in the de-DE formatting + mode-switching branch coverage (the most regression-prone surface area) without the cost of full interaction test scaffolding. Toggle behaviour is a Phase-19 acceptance demonstration that the human verifies in the dev harness + portal smoke test.

### v1 widget cleanup scope

- **D-19-11:** Delete the v1 widget code in the SAME phase, in the FINAL plan (after v2 passes verification).
  - Files to delete: `widgets/daily-briefing/src/App.tsx` (v1 contents) — REPLACED by new v2 `App.tsx` that composes the 4 blocks + attention, so this is an in-place replacement not a file delete.
  - v1 widget-specific types (in current `App.tsx` lines 26-50: `RevenuePayload`, `PaymentMethod`, `PaymentFailedEntry`) — replaced by types derived from the Phase 17 `BriefingPayload` (imported from a new `widgets/daily-briefing/src/lib/types.ts` which mirrors `mcp-poc/src/mcp-server.ts` `BriefingPayload`). Old v1 types removed.
  - v1 `styles.css` — replaced with v2 Tailwind v4 + minimal custom CSS (or fully replaced by Tailwind utility classes if no custom CSS is needed).
  - v1 `main.tsx` — kept (mount logic unchanged: `createRoot(document.getElementById('root')!).render(<App />)`). Only the `App` import target changes.
  - `widgets/revenue-today/` — NOT touched. It's a separate widget serving the `revenue_today` MCP tool and remains useful for debugging.
  - `widgets/daily-briefing/dev-host.html` — NOT touched. Phase 18 dev harness stays; the `?mock=basket-aov` and `?mock=one-block-failing` URL params now actually drive the v2 blocks.
- **Why chosen:** The v1 file is consumed by the same build pipeline that produces `ui://widgets/daily-briefing.html`. Running a v2 that renders an unrelated `App.tsx` elsewhere would require a directory rename or fork — cost without benefit. In-place replacement = cleanest diff for reviewer.

### Shared `BriefingPayload` types

- **D-19-12:** Type definitions are duplicated from `mcp-poc/src/mcp-server.ts` into `widgets/daily-briefing/src/lib/types.ts` — NOT imported across the widget/server boundary (widget is a sandboxed build artifact; cannot import from `../../src/`).
  - The widget's `types.ts` file carries a `// KEEP IN SYNC WITH mcp-poc/src/mcp-server.ts BriefingPayload` header comment, mirroring the Phase 18 D-18-03 pattern for `widget-tokens.ts`.
  - No contract test for this duplication in Phase 19 — the runtime signal (widget can't render the payload) is sufficient. If drift risk grows, add a twin-contract test in a follow-up.

### Claude's Discretion

- **Exact stagger timing** (80ms vs 60ms vs 100ms) — planner picks based on visual feel in dev harness.
- **Colour scale for heatmap** (5 steps: which Tailwind opacities of `--color-accent`, or custom HSL interpolation) — planner picks; accent-based with 5 intensity steps from the spec (`· ░ ▒ ▓ █`) is the spec baseline.
- **Exact skeleton shimmer implementation** (CSS animation vs Motion tween) — planner picks; CSS is cheaper.
- **Attention-list row styling** — planner reuses or adapts the v1 row layout; final column order and link text is an implementation detail.
- **HeatmapBlock internal state shape** — whether `activeWeeks` is a `useState<number>` or `useReducer`; planner decides.
- **BlockSkeleton variant props vs two components** — planner picks based on what reads cleaner.
- **Count-up duration** (400ms / 600ms / 800ms) — planner picks; 600ms is a suggestion, not a lock.
- **Per-fixture JSON shapes for `?mock=*`** — fixture payload content is tuned to exercise all 3 basket modes + an error path; planner authors the exact fixture JSON against the `BriefingPayload` schema. Phase 18's `getFixtureMode()` parser is the entry point.
- **Whether `useCountUp` lives in `widgets/daily-briefing/src/lib/` or `widgets/shared/hooks/`** — planner picks; if only this widget uses it, local is fine; if Phase 20 / future widgets might reuse, move to shared.

### Folded Todos

None — no pending todos matched Phase 19 scope at discuss time (confirmed via `gsd-tools todo match-phase 19`).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents (researcher, planner, executor) MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/REQUIREMENTS.md` §WIDG-STRUCT-01..05 — directory scaffold, bridge lib, theme lib, mock-host, formatters module
- `.planning/REQUIREMENTS.md` §WIDG-BLOCK-01..05 — per-block spec (HeuteBlock, HeatmapBlock, RepeatBlock, BasketOrAovBlock, attention sub-section)
- `.planning/REQUIREMENTS.md` §WIDG-QA-01..05 — 2s latency, −85% bug gone, per-block error isolation, German, 300 KB gz
- `.planning/REQUIREMENTS.md` §PORT-02..05 — sandbox-proxy relay already landed Phase 18 (verify intact), theme publisher survives multiple mounts, ZERO TS diff on `RevenueIntelligencePage.tsx`, `McpErrorBoundary` catches + renders German error with reload button
- `.planning/ROADMAP.md` Phase 19 section — 9 concrete acceptance tests (including the −85% bug verification protocol at 09:00/11:00/14:00/17:00)
- `.planning/PROJECT.md` — Milestone v3.0 goals; `Ihre Rückmeldung` German-only constraint

### THE Primary Design Doc
- `docs/ideas/REVENUE_INTELLIGENCE_V2_PLAN.md` — 492 lines, sections 1-11. §3 has all 4 block wireframes (ASCII layouts + algorithm specs + edge cases). §6 explains the widget strategy (single widget, drop-in URI, `_meta.ui.resourceUri`). §10 success criteria including the −85% non-reproducibility test. Treat this as spec — this CONTEXT layers decisions ON TOP of it.

### Upstream Phase Artifacts (locked contracts we consume)
- `.planning/phases/17-kamanda-mcp-server-expansion/17-CONTEXT.md` §D-07..D-09 — `BriefingPayload` shape (blocks.{run_rate, heatmap, repeat, basket} + attention), widget URI `ui://widgets/daily-briefing.html`, `_meta.ui.resourceUri` identity
- `.planning/phases/17-kamanda-mcp-server-expansion/17-03-SUMMARY.md` — concrete Zod-validated data shapes for each block's `data` payload (RunRateData, HeatmapData, RepeatData, BasketData)
- `.planning/phases/18-mcp-ui-resource-build-pipeline/18-CONTEXT.md` §D-18-01..D-18-05 — per-widget dir shape, vite.config.ts factory, 12 tokens, useHostTokens/useThemePublisher contracts
- `.planning/phases/18-mcp-ui-resource-build-pipeline/18-05-SUMMARY.md` — dev harness + fixture parser (`getFixtureMode()`) that Phase 19 consumes for the 3 test fixtures
- `.planning/phases/16-kmn-revenue-abilities-wp-plugin/16-RESEARCH.md` §seeded_data_facts — numeric baselines (1099 paid orders, 20.1% repeat, day=4 hour=20 peak) used to build fixture payloads for block snapshots

### Architecture & Design Docs
- `docs/ideas/MCP_UI_RESOURCE_BUILD_PIPELINE.md` — Phase 18 design doc; §3 block contract, §6 portal-side changes (already landed), §8 motion constraints (`prefers-reduced-motion` + no per-cell animation for 168 cells)
- `docs/ideas/WP_BRIDGE_ARCHITECTURE.md` — ability response shapes (consumed indirectly via Phase 17 types)

### Existing Code to Pattern-Match

**mcp-poc (where v2 widget lives):**
- `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/App.tsx` — v1 widget code; replaced in-place by v2 (D-19-11)
- `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/main.tsx` — mount point; unchanged
- `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/fixtures.ts` — Phase 18 `getFixtureMode()` parser; extended with fixture-payload loaders in Phase 19
- `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/dev-host.html` — Phase 18 dev harness; NOT touched in Phase 19 (already supports `?mock=*` reloads)
- `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/vite.config.ts` — per-widget Vite config from Phase 18; unchanged unless Preact fallback triggers (MCPAPP-BUILD-05)
- `G:/01_OPUS/Projects/mcp-poc/widgets/shared/widget-tokens.ts` — 12 tokens (v2 widget consumes these via `applyTokens()` in `src/lib/theme.ts`)
- `G:/01_OPUS/Projects/mcp-poc/widgets/shared/hooks/useHostTokens.ts` — Phase 18 hook; v2 `App.tsx` calls this at mount
- `G:/01_OPUS/Projects/mcp-poc/widgets/shared/types.ts` — `kmn/theme/*` protocol types
- `G:/01_OPUS/Projects/mcp-poc/src/mcp-server.ts` lines 31-44 — `BriefingPayload` type declaration (the source of truth for D-19-12 duplication)
- `G:/01_OPUS/Projects/mcp-poc/scripts/check-bundle-size.mjs` — Phase 18's bundle-size verifier; CI-fails if `dist/index.html` > 300 KB gz
- `G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/lib/__tests__/` — Phase 18 vitest setup; extended with Phase 19 tests

**PORTAL (verified intact; zero new code):**
- `src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` — UNCHANGED (PORT-04 assertion target)
- `src/modules/revenue-intelligence/components/McpErrorBoundary.tsx` — UNCHANGED, behaviour verified (PORT-05)
- `src/modules/revenue-intelligence/components/DashboardLoading.tsx` — UNCHANGED, used during first-mount before widget is ready
- `src/modules/revenue-intelligence/hooks/useThemePublisher.ts` — Phase 18 hook; verified surviving v2 mount/unmount/remount (PORT-03)
- `src/modules/revenue-intelligence/hooks/useMcpProxy.ts` — `useMemo`-stabilized pattern (PORTAL memory `feedback_react_hook_identity_churn`)
- `public/sandbox-proxy.html` — Phase 18 `kmn/theme/*` relay; verified intact (PORT-02)
- `src/shared/styles/widget-tokens.ts` — PORTAL twin of the 12-token module

### Memory References (project decisions that shape this phase)
- `project_revenue_intelligence_module` — staging-only rollout, MBM + Yuri's org, upstream = `mcp-poc-three.vercel.app`
- `project_v1_widget_cleanup` — v1 widget DELETION is IN SCOPE for Phase 19 (in-place replace per D-19-11)
- `feedback_react_hook_identity_churn` — any new hook exported by Phase 19 (`useCountUp`, HeatmapBlock internal state) must follow `useMemo`-stabilized pattern
- `feedback_upstream_api_probe` — before writing widget code that reads `BriefingPayload`, verify by calling `daily_briefing` against Summerfield DDEV and inspecting the actual JSON; do not code to the spec alone
- `feedback_automated_e2e_tests` — human UAT via portal staging + dev harness substitutes for Playwright (D-19-10 trade-off)
- `feedback_branching_workflow` — push changes directly to `staging` (v3.0 milestone branch policy per `project_org_milestone_merge_policy`)

### Deployment Refs
- `G:/01_OPUS/Projects/mcp-poc/vercel.json` — Vercel config; auto-deploys on push (mcp-poc `main` branch)
- `reference_coolify_ef_deploy` (memory) — NOT relevant to Phase 19 (widget deploys via Vercel, not Edge Functions)
- `project_edge_functions_deploy` (memory) — NOT relevant (mcp-proxy whitelist change already landed Phase 17 via staging CI)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Phase 18 `useHostTokens()` hook** (`mcp-poc/widgets/shared/hooks/useHostTokens.ts`) — returns `{ tokens, applied, reason }` on the widget side of the `kmn/theme/*` handshake. v2 `App.tsx` calls this once at mount; the returned `tokens` object drives `applyTokens(tokens)` on `document.documentElement`. Already tested in Phase 18.
- **Phase 18 `DEFAULT_TOKEN_VALUES`** (`mcp-poc/widgets/shared/widget-tokens.ts`) — the 12-token fallback used when no `kmn/theme/set` arrives in 300ms. v2 blocks must only reference these 12 token names via CSS vars; introducing a 13th would re-open Phase 18 scope.
- **Phase 18 `getFixtureMode()`** (`mcp-poc/widgets/daily-briefing/src/lib/fixtures.ts`) — narrow-union-typed URL param parser. Extended in Phase 19 with fixture-payload loaders: `getFixturePayload(mode)` returning a `BriefingPayload` for the dev harness + block snapshot tests.
- **Phase 18 dev harness** (`mcp-poc/widgets/daily-briefing/dev-host.html`) — full theme toggle + fixture dropdown + handshake log. Phase 19's period-toggle behaviour is verified manually here against `?mock=*` reloads.
- **v1 widget `AppContext` + `AdminLink` pattern** — opens admin deep-links via `app.openLink({url})` respecting sandbox constraints. Re-implemented for the attention sub-section inside HeuteBlock; existing code is the blueprint.
- **Motion v12 runtime** — already a `dependencies` entry in mcp-poc after Phase 18. `AnimatePresence`, `motion.div`, `useSpring`, `useReducedMotion` are all available.
- **Tailwind v4 via `@tailwindcss/vite`** — per-widget Vite plugin already wired Phase 18. All styles in v2 blocks authored as Tailwind utility classes.

### Established Patterns

- **Per-widget `vite.config.ts` + viteSingleFile + inlineDynamicImports** — Phase 18 locked. v2 Phase 19 does NOT touch `vite.config.ts` unless the 300 KB budget busts (escape hatch: Preact fallback per MCPAPP-BUILD-05).
- **`widgets/shared/` = cross-widget code** — hooks, tokens, protocol types. v2-specific code lives in `widgets/daily-briefing/src/` — do NOT promote v2 block code to `widgets/shared/` (block components are widget-local by contract).
- **`// KEEP IN SYNC WITH …` header comments on duplicated files** — Phase 18 D-18-03 pattern. D-19-12 applies this to the `BriefingPayload` type duplication.
- **vitest co-located under `__tests__/`** — Phase 18 established `widgets/daily-briefing/src/lib/__tests__/fixtures.test.ts` pattern. Phase 19 extends with `formatters.test.ts` (lib) + per-block snapshot tests in `widgets/daily-briefing/src/blocks/__tests__/`.
- **PORTAL `useMcpProxy` + `useThemePublisher` are `useMemo`-stabilized** — mandatory pattern. v2 widget's internal hooks (`useCountUp`, HeatmapBlock state) must not violate this.

### Integration Points

- **Widget ↔ host boundary**: widget renders inside a sandboxed iframe served from `ui://widgets/daily-briefing.html`; the AppBridge `PostMessageTransport` + `App` instance give the widget access to `app.callTool(...)` and `app.openLink(...)`. Phase 19 uses BOTH — `callTool` for period toggle, `openLink` for attention-list deep-links.
- **Theme propagation path**: PORTAL `useThemePublisher` → `window.parent.postMessage` → `public/sandbox-proxy.html` relay (Phase 18 block) → widget iframe → `useHostTokens()` → `applyTokens()` → `document.documentElement.style.setProperty('--color-xxx', v)`. Unchanged in Phase 19 — Phase 19 just CONSUMES the 12 tokens via CSS vars.
- **Tool result propagation**: PORTAL `RevenueIntelligencePage.tsx:49-66` calls `daily_briefing` once on mount → receives `CallToolResult` → passes to `<AppRenderer toolResult={result}>` → `@mcp-ui/client` sends `ui/notifications/tool-result` to widget iframe → v2 `App.tsx` receives via `useEffect` + MCP App SDK → parses `result.structuredContent` as `BriefingPayload` → renders 4 blocks.
- **Period-toggle call path**: widget `HeatmapBlock` → `app.callTool({name:'weekly_heatmap', arguments:{weeks:N}})` → AppBridge → `@mcp-ui/client` `onCallTool` → PORTAL `useMcpProxy.callTool` → `supabase/functions/mcp-proxy/index.ts` → upstream MCP server → WP bridge → response propagates back. End-to-end latency in v3.0 staging is acceptable since seeded Summerfield data + single ability call.
- **Bundle-size check**: `scripts/check-bundle-size.mjs` runs at end of `npm run build:widgets`. Phase 19 must keep `dist/widgets/daily-briefing.html` (or equivalent per Phase 18 dir shape) ≤ 300 KB gz. If the budget busts, Preact fallback per MCPAPP-BUILD-05 is the escape (not in Phase 19 plans unless triggered).

### Non-Obvious Constraints

- **Iframe sandbox blocks `<a target="_blank">`** — attention-list deep-links MUST use `app.openLink({url})` pattern, not raw anchor tags. v1 widget already handles this; v2 must preserve.
- **`toolResult` arrives asynchronously AFTER mount** — v2 `App.tsx` must render the 4-block skeleton grid (`BlockSkeleton variant='loading'`) until the SDK's `onToolResult` fires. First-paint without data is the default state, not an error.
- **`prefers-reduced-motion` inside sandboxed iframe**: `matchMedia('(prefers-reduced-motion: reduce)')` works in sandboxed iframes per MDN + Phase 18 verification. Motion's `useReducedMotion()` wraps this.
- **300ms theme fallback** (Phase 18 MCPAPP-TOKEN-05) — if no `kmn/theme/set` arrives in 300ms, widget renders with `DEFAULT_TOKEN_VALUES`. v2 blocks must look acceptable with the bundled defaults (single user-visible quality bar — the dev harness `dev-host.html?` without parent is the standing test).
- **`_meta.ui.resourceUri` identity** (Phase 17 D-09) — the widget URI stays `ui://widgets/daily-briefing.html`. Phase 19 does NOT add new widget URIs.
- **PORT-04 zero TS diff is a hard constraint**: `git diff src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` after Phase 19 ends must be empty. If a v2 need surfaces that requires a portal code change, STOP and re-scope — it implies a Phase 18 rails gap that should route back to Phase 18 (or a Phase 19.1 escape hatch).
- **`RevenueIntelligencePage`'s `initialCallDoneRef` guard** (line 48-66) — the portal fires `daily_briefing` exactly once per mount via a ref flag. Period-toggle re-fetches from inside the widget use `app.callTool` via the MCP App SDK, which DOES NOT reset the ref — so period-toggle works without re-triggering `daily_briefing`.

</code_context>

<specifics>
## Specific Ideas

- **The spec wireframes in `docs/ideas/REVENUE_INTELLIGENCE_V2_PLAN.md` §3 are literal targets.** ASCII layouts encode KPI hierarchy (primary=projected revenue, secondary=pace indicator, tertiary=same-hour-last-week). Implementation should preserve that visual priority — primary value in largest type, secondary indicator in coloured accent, tertiary reference in small grey.
- **"Hochrechnung" language** is the merchant-readable term for "projection". Do NOT invent synonyms (no "Prognose", no "Schätzung" except as the confidence=medium caption). Same discipline for other KPI labels — these were pre-validated with Yuri as merchant-clear German.
- **Heatmap best-slot callout must say `Ihr bester Slot: Do 20:00 (Ø 3,2 Bestellungen)`** — possessive "Ihr" is intentional (addresses the merchant directly). Phase 17 seeded data will produce roughly that shape for Summerfield (day=4 peak = Donnerstag, hour=20 = 20:00).
- **`color-mix(in oklch, var(--color-accent) {N}%, transparent)` for heatmap cells** is the idiomatic Tailwind v4 intensity pattern. Spec's ASCII `· ░ ▒ ▓ █` maps to 5 intensity steps: 0%/25%/50%/75%/100% of accent.
- **The attention sub-section inside HeuteBlock should be visually subordinate** — smaller heading, single column of compact rows. Do NOT reuse the full v1 card-row styling; compress to fit the "inside Heute" context.
- **AOV bands "17% der Bestellungen = 30% des Umsatzes" insight** is the whole point of that mode — the fact that high-value customers concentrate disproportionate revenue share. The 2-value-per-band display (share of count + share of revenue) must make this gap readable at a glance.
- **On portal staging** (the verification environment), Summerfield DDEV data is seeded with ~1099 paid orders, 20.1% repeat rate, day=4 hour=20 peak; test against those numeric ranges. MBM production rollout uses real MBM data and is a future milestone.

</specifics>

<deferred>
## Deferred Ideas

### Out of scope for Phase 19 (confirmed)
- **Monday briefing email Edge Function** — Phase 20.
- **MBM production rollout** — post-v3.0 milestone; Phase 19 ships staging-only.
- **Klaviyo integration / email-send-time optimisation** — v3.1+ per `docs/ideas/REVENUE_INTELLIGENCE_V2_PLAN.md` §11.
- **Per-user preferences / saved period** — toggle state is session-local, resets on remount.
- **Period toggle for blocks other than heatmap** — only heatmap has the `{weeks: 4|8|12}` parameter in the MCP server tool shape (Phase 17). Other blocks are fixed-window.
- **Admin opt-out for email** — no email in Phase 19.
- **Widget marketplace / cross-client reuse** — platform is ready (Phase 18) but single-widget-per-client is the v3.0 assumption.
- **Production dark-mode skin** — infrastructure lives in PORTAL `useThemePublisher` (Phase 18 D-18-05) but portal has no dark-mode toggle yet; widget is tested against "hell" tokens only, "dunkel (Platzhalter)" in dev harness is approximation.
- **Chart library adoption** — considered and rejected (D-19-01); revisit only if a future block needs interaction beyond what CSS/SVG supports (e.g. zoomable heatmap, scatter plot).
- **Per-block retry button** — considered and rejected (D-19-08); user reloads page if error persists.
- **Playwright visual regression** — considered and rejected (D-19-10); mcp-poc has no Playwright, snapshots + dev-harness cover the ground.
- **Interaction tests for period toggle** — manual UAT via dev harness substitutes (D-19-10).
- **Full-contract test for widget ↔ server `BriefingPayload` type duplication** — deferred (D-19-12); runtime failure is the signal until drift shows up in practice.

### Reviewed Todos (not folded)

None — no pending todos at discuss time (`gsd-tools todo match-phase 19` returned 0 matches).

</deferred>

---

*Phase: 19-revenue-intelligence-widget-v2*
*Context gathered: 2026-04-24*
