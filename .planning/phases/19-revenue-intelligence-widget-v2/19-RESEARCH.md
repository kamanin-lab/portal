# Phase 19: Revenue Intelligence Widget v2 — Research

**Researched:** 2026-04-24
**Domain:** React 19 widget inside sandboxed iframe; @modelcontextprotocol/ext-apps AppBridge; Motion v12; Tailwind v4; 300 KB gz budget; Vitest+jsdom snapshot tests; in-place v1→v2 replacement
**Confidence:** HIGH on all platform rails (Phase 18 is shipped + verified), HIGH on upstream tool surface (Phase 17 shipped + verified on staging), HIGH on browser APIs (MDN + ctx7 verified), MEDIUM-HIGH on Motion v12 count-up pattern (verified via motion.dev docs), LOW on real-world 2s latency under Summerfield DDEV conditions (not verified in this research pass — deferred to acceptance test execution)

---

## Summary

Phase 19 is a **single-repo, single-file-replacement build** resting on fully-shipped rails. The `@modelcontextprotocol/ext-apps` SDK is the widget-side MCP App runtime, the `@mcp-ui/client` AppRenderer is the PORTAL-side host, Phase 18's `useHostTokens` + `DEFAULT_TOKEN_VALUES` + `getFixtureMode()` + per-widget Vite config are all production-verified, and Phase 17 already registers `weekly_heatmap` on the Node server and whitelists it in `mcp-proxy/index.ts`. The widget's period-toggle re-fetch is therefore a **2-line widget-side change** (`app.callServerTool({ name: 'weekly_heatmap', arguments: { weeks: N } })`) with zero portal-side code required — PORT-04's zero-diff guarantee is credible.

The remaining technical unknowns are small and resolvable inside the widget codebase: Motion v12's `useSpring`-driven `useCountUp` pattern is documented, Tailwind v4 arbitrary values **do** accept `color-mix(in_oklch,…)` (underscore-separated), `useReducedMotion()` from `motion/react` works in sandboxed iframes per MDN behavior, and the 300 KB gz budget has ~150 KB headroom after Phase 18's measured baseline (150.6 KB gz for the v1 `daily-briefing.html`). The real risks are cosmetic (stagger timing feel) and snapshot-test brittleness (Motion inline styles) — both mitigable via `useReducedMotion()` in test env and/or stripping `style` from the snapshot tree.

**Primary recommendation:** implement the 4 blocks as direct descendants of `AnimatePresence` with a parent `variants={list}` + children `variants={item}` propagation pattern using `transition: { staggerChildren: 0.08 }`; implement `useCountUp` via `useMotionValue(0)` + `useSpring(motionValue)` + `useMotionValueEvent(spring, "change", setDisplay)`; render heatmap cells with inline `style={{ background: colorForCount(n) }}` (cheaper and more readable than 168 Tailwind arbitrary-value classes); keep all interactive state (period toggle) local to `HeatmapBlock` via `useState<{weeks, data, error, loading}>`. Skip snapshot tests for Motion-animated DOM fragments — test `lib/*.ts` formatters + fixture parser + a block-render `toBeInTheDocument()` smoke test, not full JSX snapshots.

---

## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim from CONTEXT.md `<decisions>`)

- **D-19-01:** All visualisations are hand-rolled — no chart library (no `visx`, `recharts`, `victory`, `echarts`). Heatmap = 168-cell CSS grid. Payment-method + AOV bars = flex rows with `width: ${percent}%`. Every chart primitive is pure JSX + CSS. Dependency cost: 0 KB.
- **D-19-02:** 300 KB gz budget reserved for React 19 (~45 KB) + Motion v12 (~15 KB) + Tailwind v4 inlined CSS (~4 KB) + Phase-19 widget code + fixtures. Target for widget code: ≤ 80 KB gz, leaving ~150 KB headroom. Bundle size verified in CI by Phase 18's `scripts/check-widget-bundle-size.mjs`.
- **D-19-03:** Moderate Motion — (a) 4-block staggered fade+translateY entry on first `toolResult` arrival via `AnimatePresence` + `motion.div` + stagger; (b) `useSpring`-driven count-up for Hochrechnung number (HeuteBlock), Wiederkaufrate percentage (RepeatBlock), AOV number (BasketOrAovBlock) over ~600ms on first render only (not on period-toggle re-fetch); (c) heatmap container-level fade-in only, **no per-cell Motion** (168 cells would cascade-render jankily); (d) period-toggle feedback dissolves to 60% opacity with small spinner overlay, no sibling re-stagger; (e) `useReducedMotion()` from `motion/react` short-circuits both stagger and count-up to instant fades.
- **D-19-04:** Payment-attention renders INSIDE `HeuteBlock` as a collapsible sub-section below run-rate + pace + payment-method-split. Section heading `Zahlungsaufmerksamkeit`. Conditional render: `status === 'error'` → per-block error skeleton; `status === 'ok' && entries.length === 0` → section hidden entirely; `entries.length > 0` → render list. Admin deep-links use `app.openLink({url})`.
- **D-19-05:** Heatmap period toggle is IN SCOPE — implemented as a real per-block re-fetch via `app.callServerTool({ name: 'weekly_heatmap', arguments: { weeks: N } })`. On call start: HeatmapBlock-local loading (60% opacity + spinner), sibling blocks do NOT re-render. On success: heatmap re-renders with new data, `activeWeeks` updates. On failure: per-block error skeleton; toggle buttons remain clickable. State lives inside HeatmapBlock: `useState<{weeks: 4|8|12; data: HeatmapData | null; error: string | null; loading: boolean}>`.
- **D-19-06:** RunRate confidence surfaced via **inline replacement**, not a badge. `high` → bare number. `medium` → number + small grey 2-line caption `(Schätzung, geringe Datenbasis)`. `low` OR `h_now===0` OR fewer than 5 valid baseline days → projection number REPLACED by single-line message (`Noch zu früh für Hochrechnung` when `h_now===0`; `Nicht genug Daten für Hochrechnung` otherwise). `Bisher` actual-revenue-so-far always renders. Pace-vs-7-day indicator hidden entirely when baseline unusable.
- **D-19-07:** BasketOrAovBlock layout: mode header (small, always visible) + plain-language primary + technical metrics in caption. Product/category basket: line 1 `{A} + {B}`, line 2 `64% der {A}-Käufer kauften auch {B}`, line 3 grey mono `Support 8% · Konfidenz 64% · Lift 3,2×`. AOV bands: 3 horizontal bars (< 500 €, 500–1.500 €, > 1.500 €) each showing share-of-count + share-of-revenue as stacked/side-by-side mini-bars with percentage labels; below: `Ø Bestellwert {N} €` + `Median Bestellwert {N} €`. No tooltips.
- **D-19-08:** Loading + error skeletons share a single `BlockSkeleton` with prop `variant: 'loading' | 'error'`. Loading = shimmer-bg card at block's approximate height, no text. Error = solid grey card with primary text `Daten nicht verfügbar` (centered, `--color-muted`) + secondary `Bitte Seite neu laden` (small, `--color-subtle`). No retry button.
- **D-19-09:** Per-block skeleton-on-error contract: each of `payload.blocks.{run_rate, heatmap, repeat, basket}.status === 'error'` → that block's skeleton. `payload.attention.status === 'error'` → attention sub-section mini-skeleton (single line `Daten nicht verfügbar`), rest of HeuteBlock continues rendering.
- **D-19-10:** Tests: (a) formatters in `src/lib/__tests__/formatters.test.ts`; (b) fixture parser + payload shape tests in `src/lib/__tests__/fixtures.test.ts`; (c) block snapshot tests in `src/blocks/__tests__/*.test.tsx` — 4 healthy + 4 error + 2 extra basket modes = ~10 snapshots using `@testing-library/react`. NO interaction tests for period toggle (manual UAT). NO Playwright.
- **D-19-11:** v1 widget code is replaced in-place in the SAME phase (final plan after verification): `App.tsx` contents (v1 types `RevenuePayload`, `PaymentMethod`, `PaymentFailedEntry`) replaced; `styles.css` replaced with Tailwind; `main.tsx` KEPT unchanged; `widgets/revenue-today/` NOT touched; `dev-host.html` NOT touched (already supports `?mock=*`).
- **D-19-12:** `BriefingPayload` types are duplicated into `widgets/daily-briefing/src/lib/types.ts` from `mcp-poc/src/mcp-server.ts` (widget is a sandboxed build artifact; cannot import from `../../src/`). Carries `// KEEP IN SYNC WITH mcp-poc/src/mcp-server.ts BriefingPayload` header, mirroring the Phase 18 D-18-03 `widget-tokens.ts` pattern. No contract test.

### Claude's Discretion

- Exact stagger timing (80ms vs 60ms vs 100ms)
- Colour scale for heatmap (5 steps via Tailwind opacity of `--color-accent` OR `color-mix(in oklch, var(--color-accent) {N}%, transparent)` OR custom HSL interpolation)
- Exact skeleton shimmer implementation (CSS animation vs Motion tween)
- Attention-list row styling
- HeatmapBlock internal state shape (`useState<number>` vs `useReducer`)
- BlockSkeleton variant props vs two components
- Count-up duration (400ms / 600ms / 800ms)
- Per-fixture JSON shapes for `?mock=*`
- Whether `useCountUp` lives in `widgets/daily-briefing/src/lib/` or `widgets/shared/hooks/`

### Deferred Ideas (OUT OF SCOPE)

- Monday briefing email Edge Function → Phase 20
- MBM production rollout → post-v3.0 milestone
- Klaviyo integration / email-send-time optimisation → v3.1+
- Per-user preferences / saved period
- Period toggle for blocks other than heatmap
- Admin opt-out for email
- Widget marketplace / cross-client reuse
- Production dark-mode skin (infra exists via `useThemePublisher`, but PORTAL has no dark-mode toggle yet)
- Chart library adoption (considered + rejected via D-19-01)
- Per-block retry button (considered + rejected via D-19-08)
- Playwright visual regression (considered + rejected via D-19-10)
- Interaction tests for period toggle (manual UAT substitutes per D-19-10)
- Full-contract test for widget ↔ server `BriefingPayload` type duplication

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WIDG-STRUCT-01 | Directory scaffold: `src/index.tsx`, `src/App.tsx`, `src/blocks/*`, `src/lib/*`, `src/styles.css`, `index.html`, `vite.config.ts`, `package.json`, `tsconfig.json` | Phase 18 already established `mcp-poc/widgets/daily-briefing/` with `index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/styles.css`, `src/lib/fixtures.ts`, `tsconfig.json`. Phase 19 extends with `src/blocks/` + `src/lib/{formatters,types,fixtures-payloads,theme,useCountUp}.ts`. Note: Requirement says `src/index.tsx` but current repo uses `src/main.tsx` — keep Phase 18's `main.tsx` (D-19-11 explicit). |
| WIDG-STRUCT-02 | `src/lib/host-bridge.ts` exports postMessage request/response helpers | Already satisfied by `widgets/shared/hooks/useHostTokens.ts` + `widgets/shared/types.ts` (Phase 18). v2 widget MAY NOT duplicate; reuse the shared hook. If the literal file path `src/lib/host-bridge.ts` is required, create a thin re-export file. |
| WIDG-STRUCT-03 | `src/lib/theme.ts` exports `applyTokens(tokens)` setting CSS vars on root | `widgets/shared/hooks/useHostTokens.ts` already performs `document.documentElement.style.setProperty(WIDGET_TOKENS[key], value)` inline (lines 58, 70). v2 `src/lib/theme.ts` is a thin consumer that imports `useHostTokens`, returns the tokens object, and optionally exposes an `applyTokens()` helper for non-React consumption. |
| WIDG-STRUCT-04 | `src/lib/mock-host.ts` with fake tokens + fake tool result + `?mock=*` variants | `widgets/daily-briefing/src/lib/fixtures.ts` (Phase 18) already parses `?mock=basket-aov` + `?mock=one-block-failing`. Phase 19 EXTENDS with `getFixturePayload(mode): BriefingPayload` that returns the corresponding mocked payload. Dev harness already supplies fake tokens via the Hell/Dunkel toggle. |
| WIDG-STRUCT-05 | `src/lib/formatters.ts` — de-DE currency, number, percentage, date | New file. v1 widget has inline `formatMoney()` / `formatHours()` / `formatTimestamp()` in `App.tsx` (lines 530-570); these migrate to `lib/formatters.ts` + expand (formatCurrency, formatPercent, formatPP, formatDate). |
| WIDG-BLOCK-01 | `HeuteBlock.tsx` — run-rate + pace + same-hour-last-week + payment-method mini-split; confidence=low → "Noch zu früh für Hochrechnung" | Consumes `BriefingPayload.blocks.run_rate.data: RunRateData` from Phase 17 `kmn-bridge-schemas.ts` — fields available: `confidence`, `projected_revenue`, `current_revenue?`, `expected_by_hour[24]`, `pace_vs_7day_avg_pct`, `payment_split[]`, `same_hour_last_week?`, `baseline_days_used?`. All D-19-06 branches are payload-driven. |
| WIDG-BLOCK-02 | `HeatmapBlock.tsx` — 7×24 grid, 5-step color scale, empty = background; best-slot + dimmest-with-orders; 4w/8w/12w toggle via `callTool` | Consumes `HeatmapData` from Phase 17: `best_slot: {day_of_week, hour_of_day, order_count, net_revenue?}`, `buckets: Slot[]`, `weeks_analyzed?`. Slot day_of_week is ISO 1=Mon..7=Sun. Toggle wiring: `app.callServerTool({name:'weekly_heatmap', arguments:{weeks:N}})` — verified tool name in mcp-server.ts:178 + whitelist in mcp-proxy/index.ts:145. |
| WIDG-BLOCK-03 | `RepeatBlock.tsx` — big repeat rate % + PP trend arrow + "Shopify B2C ~27%" benchmark + median days + order basis count | Consumes `RepeatData`: `repeat_rate_pct`, `benchmark_pct` (27.0 from schema), `total_orders`, `unique_customers`, `returning_customers`, `median_days_to_2nd: number \| null`, `trend_pp?`. |
| WIDG-BLOCK-04 | `BasketOrAovBlock.tsx` — conditional render by `mode`: product / category basket or AOV bands | Consumes `BasketData.mode: "market_basket_product" \| "market_basket_category" \| "aov_bands"`, `basket_pairs?: BasketPair[]`, `aov_bands: AovBand[3]`, `avg_order_value`, `median_order_value`, `multi_item_order_count_90d?`. Note Phase 16 seeded Summerfield has 310 multi-item → `market_basket_product` mode is the default real data; `aov_bands` is only reached via fixture. |
| WIDG-BLOCK-05 | Payment-attention sub-section ported from v1 — wp-admin deep links — placed inside HeuteBlock | Consumes `PaymentAttentionPayload`: `currency`, `total_count`, `total_value`, `categories.{payment_failed, invoice_overdue, on_hold}`, `generated_at`. v1 widget's `AttentionCard` (App.tsx:337) is the visual blueprint but compressed per D-19-04 "visually subordinate". |
| WIDG-QA-01 | All 4 blocks render under 2s from page load | End-to-end measurement: `PerformanceObserver` at `RevenueIntelligencePage` mount → widget `onSizeChanged` fire. Phase 17's Promise.allSettled on the server + 5s bridge timeout are the outer bounds. Phase 16 confirmed sub-500ms per ability on seeded DDEV data. The 2s budget is realistic for the healthy path. |
| WIDG-QA-02 | Today-vs-yesterday -85% bug NOT reproducible at any time of day | Structural: v2 eliminates the comparison entirely — v2 HeuteBlock compares `expected_by_hour[h_now]` to `actual_now`, NOT yesterday's full day. This is a spec-level fix, not a runtime check. The acceptance test is visual confirmation that the `pace_vs_7day_avg_pct` stays in a reasonable range (-N% .. +N%), never the v1's -85%. |
| WIDG-QA-03 | Per-block error handling — failed ability → skeleton — others render | Phase 17 `Promise.allSettled` returns `{status:'error', message}` per failed block; `BlockSkeleton variant='error'` consumes that. Dev harness `?mock=one-block-failing` forces this for manual UAT. |
| WIDG-QA-04 | All user-facing text in German | Decision text encoded in D-19-04, D-19-06, D-19-08 + the spec doc §3. Phase 17 `summarizeBriefing()` also uses German labels as reference. |
| WIDG-QA-05 | Single-file `dist/index.html` ≤ 300 KB gzipped | Phase 18 measured baseline: 150.6 KB gz for v1 daily-briefing.html. ~150 KB headroom for v2. `scripts/check-widget-bundle-size.mjs` enforces on every build. |
| PORT-02 | `public/sandbox-proxy.html` has `kmn/theme/*` relay block | Already landed Phase 18 (sandbox-proxy.html lines 66-78 — verified intact). Verification task: `grep 'kmn/theme/'` on sandbox-proxy.html must match. |
| PORT-03 | Theme publisher survives multiple widget mounts | Already landed Phase 18 via `useThemePublisher` hook. Verification: mount widget, navigate away, remount, verify second `kmn/theme/set` arrives at widget. |
| PORT-04 | `RevenueIntelligencePage.tsx` unchanged — zero TS diff | `git diff src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` after Phase 19 must be empty. See §PORT-04 Zero-Diff Surface audit below for the proof that no new portal branch is needed. |
| PORT-05 | `McpErrorBoundary` behaviour verified on v2 widget | `McpErrorBoundary` wraps `AppRenderer` at line 130 in `RevenueIntelligencePage.tsx`. Verification: force a throw inside the widget (e.g., by passing an intentionally-malformed fixture), observe German error with reload button. |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 4-block dashboard rendering | Widget iframe (sandboxed React 19) | — | Widget owns its DOM via srcdoc + viteSingleFile bundle |
| Tool result parsing (structuredContent → BriefingPayload) | Widget iframe | — | `app.ontoolresult` handler converts SDK's `params.structuredContent` into typed BriefingPayload |
| Period-toggle tool invocation | Widget iframe (`app.callServerTool`) | PORTAL `useMcpProxy.callTool` (onCallTool handler) | Widget initiates; AppBridge routes to PORTAL host's `onCallTool`; host proxies via `useMcpProxy` → `mcp-proxy` EF → upstream MCP server |
| Tool whitelist enforcement | PORTAL `supabase/functions/mcp-proxy/index.ts` | — | ALLOWED_TOOLS set; `weekly_heatmap` already present (line 145) |
| Theme token supply | PORTAL `useThemePublisher` | Widget `useHostTokens` | `kmn/theme/*` bidirectional postMessage via same-origin `public/sandbox-proxy.html` relay |
| Error boundary (render-time) | PORTAL `McpErrorBoundary` | Widget `BlockSkeleton variant='error'` | ErrorBoundary catches AppRenderer throws (full-page fatal); BlockSkeleton handles per-block `status:'error'` from payload (non-fatal) |
| Admin deep-link opening | Widget requests via `app.openLink({url})` | PORTAL `handleOpenLink` in `RevenueIntelligencePage.tsx` | Iframe sandbox forbids `<a target=_blank>`; AppBridge round-trip opens via `window.open()` on PORTAL origin |
| Bundle-size enforcement | `mcp-poc/scripts/check-widget-bundle-size.mjs` | CI via `npm run build` | Runs gzip on every `dist/widgets/*.html`; fails >300 KB |
| Motion animations | Widget (`motion/react`) | — | All Motion code bundled into `dist/widgets/daily-briefing.html` (inline) |
| `prefers-reduced-motion` detection | Widget `useReducedMotion()` from `motion/react` | — | Uses `window.matchMedia('(prefers-reduced-motion: reduce)')` — works inside sandboxed iframes per MDN |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react | 19.2.5 | Widget component tree | Locked by Phase 18 D-18-01; matches PORTAL React 19 |
| react-dom | 19.2.5 | Root render + createRoot | Same |
| motion | 12.38.0 | Animations (stagger, spring, useReducedMotion) | Already `dependencies` in mcp-poc; Phase 18 MCPAPP-BUILD-03 guarantees sandbox compatibility |
| @modelcontextprotocol/ext-apps | 0.2.0 | `App`, `PostMessageTransport`, `app.callServerTool`, `app.openLink`, `app.ontoolresult` | Locked — widget is an MCP App by spec (SEP-1865) |
| @modelcontextprotocol/sdk | 1.0.4 | `CallToolResult` types | Transitive via ext-apps |
| @tailwindcss/vite | 4.2.4 | JIT Tailwind v4 CSS inlined into dist | Phase 18 MCPAPP-BUILD-02 locked |
| tailwindcss | 4.2.4 | Core Tailwind | Same |
| zod | 3.23.8 | — (server-side only; widget does NOT re-validate) | Widget trusts server-shape contract; Phase 17 Zod schemas gate upstream |

### Supporting (devDependencies — vitest + test infra already set up by Phase 18)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 2.1.9 | Test runner | All block snapshot + formatter tests |
| @testing-library/react | 16.3.2 | `render()`, `renderHook()` | Block smoke tests + useCountUp hook test |
| jsdom | 25.0.1 | Browser-like env for React render tests | Auto-selected for `widgets/**/*.test.tsx` via `environmentMatchGlobs` |
| vite | 6.0.5 | Build + dev server | Used by `npm run dev:widget` (port 5174) |
| vite-plugin-singlefile | 2.3.3 | Inlines JS + CSS into one HTML file | Core to viteSingleFile strategy |

### Phase 18 Shared Assets (already shipped — v2 widget consumes)

| File | Purpose |
|------|---------|
| `widgets/shared/widget-tokens.ts` | 12-token CSS-var map + `DEFAULT_TOKEN_VALUES` |
| `widgets/shared/hooks/useHostTokens.ts` | postMessage handshake + 300ms fallback + protocolVersion guard |
| `widgets/shared/types.ts` | `kmn/theme/*` protocol types |
| `widgets/shared/vite.base.ts` | `buildWidgetConfig()` factory (react + tailwindcss + viteSingleFile + renameHtmlAsset plugins) |
| `widgets/daily-briefing/vite.config.ts` | Per-widget Vite config (2 lines, calls factory) |
| `widgets/daily-briefing/src/lib/fixtures.ts` | `getFixtureMode()` URL-param parser (narrow union) |
| `widgets/daily-briefing/dev-host.html` | Full dev harness (theme toggle + fixture dropdown + handshake log) |
| `scripts/check-widget-bundle-size.mjs` | 300 KB gz guard |
| `mcp-poc/vitest.config.ts` | vitest with `environmentMatchGlobs` (jsdom for hooks + blocks, node for pure lib tests) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled heatmap (168 `<div>`) | `visx/heatmap` | ~30 KB gz cost for replaceable rect-painting logic. Rejected in D-19-01. |
| `useCountUp` via Motion `useSpring` | `react-countup` npm package | +3 KB gz; Motion is already bundled so zero marginal cost via `useMotionValue + useSpring + useMotionValueEvent`. Stays. |
| `AnimatePresence` variant-propagation stagger | Manual `setTimeout`+initial/animate delays | Verbose; Motion v12's `stagger()` + `delayChildren` is idiomatic and 0 KB extra. |
| Tailwind arbitrary-value `color-mix(...)` class strings | Inline `style={{ background }}` with computed `color-mix(in oklch, var(--color-accent) ${N}%, transparent)` string | Both work in Tailwind v4. Inline style avoids 5 dynamic class names per cell × 168 cells = 840 utility classes. D-19 `Claude's Discretion` item — recommend inline style for heatmap cells (readability + no Tailwind JIT safelist concern). |

**Installation:** NO new dependencies. All of the above are already in `mcp-poc/package.json`. Phase 19 adds ZERO packages.

**Version verification:**
```bash
cd G:/01_OPUS/Projects/mcp-poc
npm view motion version        # expected 12.x — actual installed 12.38.0
npm view react version         # expected 19.x — actual installed 19.2.5
npm view @tailwindcss/vite version  # expected 4.x — actual installed 4.2.4
```

[VERIFIED: mcp-poc/package.json] — all versions shipped + tested in Phase 18.

---

## Architecture Patterns

### System Architecture Diagram (data flow for Phase 19 widget)

```
          PORTAL origin (staging.portal.kamanin.at)
          ┌─────────────────────────────────────────┐
          │                                         │
 initial  │  RevenueIntelligencePage.tsx            │
 mount ──►│  ├─ useEffect (initialCallDoneRef)      │
          │  │   └─► useMcpProxy.callTool           │
          │  │         └─► supabase.functions       │
          │  │              .invoke('mcp-proxy')    │
          │  │                                      │
          │  ├─ useThemePublisher (reads 12 tokens) │
          │  │                                      │
          │  └─ <McpErrorBoundary>                  │
          │     └─ <AppRenderer                     │
          │          toolResult=toolResult          │
          │          onCallTool=handleCallTool      │
          │          onOpenLink=handleOpenLink      │
          │          sandbox={url: /sandbox-proxy.  │
          │                    html}  />            │
          └──────────┬──────────────────────────────┘
                     │ loads
                     ▼
          ┌─────────────────────────────────────────┐
          │  /sandbox-proxy.html (same-origin)      │
          │  • creates inner iframe with srcdoc     │
          │  • relays AppBridge + kmn/theme/*       │
          │    messages bidirectionally             │
          └──────────┬──────────────────────────────┘
                     │ srcdoc=HTML of
                     ▼ dist/widgets/daily-briefing.html
          ┌─────────────────────────────────────────┐
          │  Widget iframe (sandbox=allow-scripts)  │
          │  origin = 'null'                        │
          │                                         │
          │  main.tsx                               │
          │  └─► <App />                            │
          │      ├─ useHostTokens()  ← kmn/theme/*  │
          │      ├─ useApp() from ext-apps/react    │
          │      │   └─ app.ontoolresult = ...      │
          │      ├─ useReducedMotion()              │
          │      │                                  │
          │      └─ <AnimatePresence>               │
          │         ├─ <HeuteBlock>                 │
          │         │   ├─ run-rate projection      │
          │         │   ├─ pace vs 7-day            │
          │         │   ├─ payment-method bars      │
          │         │   └─ <AttentionSubSection>    │
          │         │       └─ app.openLink(adminUrl) │
          │         ├─ <HeatmapBlock>               │
          │         │   ├─ 7×24 CSS grid (168 cells)│
          │         │   ├─ best-slot callout        │
          │         │   └─ [4w][8w][12w] buttons    │
          │         │       └─ app.callServerTool   │
          │         │           ({name:'weekly_heatmap',│
          │         │            arguments:{weeks:N}})│
          │         ├─ <RepeatBlock>                │
          │         │   └─ useCountUp (repeat %)    │
          │         └─ <BasketOrAovBlock>           │
          │             └─ switch(mode):            │
          │                 product/category/aov    │
          └─────────────────────────────────────────┘
                     │ callServerTool returns up through
                     │ AppBridge → onCallTool in host
                     ▼
          ┌─────────────────────────────────────────┐
          │  Back to PORTAL: handleCallTool         │
          │  → useMcpProxy.callTool                 │
          │  → mcp-proxy EF                         │
          │    ├─ ALLOWED_TOOLS check (includes     │
          │    │   'weekly_heatmap')                │
          │    └─ proxy JSON-RPC to upstream        │
          └──────────┬──────────────────────────────┘
                     ▼
          ┌─────────────────────────────────────────┐
          │  mcp-poc-three.vercel.app (Vercel)      │
          │  • server.registerTool('weekly_heatmap', │
          │    async (args) => buildWeeklyHeatmap(   │
          │      createKmnBridgeClient(),            │
          │      {weeks: args.weeks}))               │
          │  • client.heatmap({weeks}) →             │
          │    POST /wp-json/mcp/kmn-revenue         │
          │    tools/call {name:'kmn-weekly-heatmap', │
          │                arguments:{weeks}}        │
          └─────────────────────────────────────────┘
                     ▼ (Basic Auth + HTTP POST)
          ┌─────────────────────────────────────────┐
          │  Summerfield DDEV                       │
          │  WP 6.9 + WC + kmn-revenue-abilities    │
          │  kmn/weekly-heatmap ability             │
          │  → 7×24 HeatmapData                     │
          └─────────────────────────────────────────┘
```

### Recommended Project Structure (mcp-poc widgets/daily-briefing/)

```
widgets/daily-briefing/
├── index.html              # Phase 18 — NOT changed
├── vite.config.ts          # Phase 18 — NOT changed
├── tsconfig.json           # Phase 18 — NOT changed
├── dev-host.html           # Phase 18 — NOT changed (already drives ?mock=*)
└── src/
    ├── main.tsx            # Phase 18 — unchanged (D-19-11: only App import target changes)
    ├── App.tsx             # REPLACED IN-PLACE: composes the 4 blocks + attention
    ├── styles.css          # REPLACED: Tailwind v4 utilities + minimal custom (or removed entirely)
    ├── blocks/
    │   ├── HeuteBlock.tsx
    │   ├── HeatmapBlock.tsx
    │   ├── RepeatBlock.tsx
    │   ├── BasketOrAovBlock.tsx
    │   ├── AttentionList.tsx     # imported only by HeuteBlock
    │   ├── BlockSkeleton.tsx
    │   └── __tests__/
    │       ├── HeuteBlock.test.tsx
    │       ├── HeatmapBlock.test.tsx
    │       ├── RepeatBlock.test.tsx
    │       └── BasketOrAovBlock.test.tsx
    └── lib/
        ├── fixtures.ts              # Phase 18 — EXTENDED with getFixturePayload(mode)
        ├── fixtures-payloads.ts     # NEW — 3 BriefingPayload objects for ?mock=*
        ├── formatters.ts            # NEW — formatCurrency, formatPercent, formatPP, formatDate
        ├── types.ts                 # NEW — BriefingPayload twin (// KEEP IN SYNC)
        ├── theme.ts                 # NEW — wraps useHostTokens, exposes applyTokens helper
        ├── useCountUp.ts            # NEW — useMotionValue + useSpring hook (≈30 LOC)
        └── __tests__/
            ├── formatters.test.ts
            └── fixtures.test.ts
```

### Pattern 1: MCP App lifecycle in the widget (replaces v1 inline pattern)

**What:** Widget creates an `App` instance, connects via `PostMessageTransport`, and registers handlers. The initial `daily_briefing` tool result arrives via `app.ontoolresult`. The period toggle fires `app.callServerTool` and awaits the result.

**When to use:** Top-level `App.tsx` mount. Same lifecycle in v1 — only the consumers downstream (blocks) change.

**Example (adapted from v1 `App.tsx` lines 115-184):**

```tsx
// Source: v1 widgets/daily-briefing/src/App.tsx lines 115-184 (verified); adapted for v2 block composition
import { useEffect, useRef, useState } from "react"
import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { useHostTokens } from "../shared/hooks/useHostTokens"
import { getFixtureMode } from "./lib/fixtures"
import { getFixturePayload } from "./lib/fixtures-payloads"
import type { BriefingPayload } from "./lib/types"

type State =
  | { kind: "loading" }
  | { kind: "ok"; data: BriefingPayload }
  | { kind: "error"; message: string }

export function DailyBriefingApp() {
  useHostTokens()  // kmn/theme/* handshake — sets CSS vars on documentElement
  const [state, setState] = useState<State>({ kind: "loading" })
  const appRef = useRef<InstanceType<typeof App> | null>(null)

  useEffect(() => {
    // Dev-harness mode: if opened standalone (no parent frame), use fixture payload
    if (window.parent === window) {
      const mode = getFixtureMode()
      setState({ kind: "ok", data: getFixturePayload(mode) })
      return
    }

    const app = new App(
      { name: "DailyBriefing", version: "2.0.0" },
      {},
      { autoResize: false },
    )
    appRef.current = app

    app.ontoolresult = (params) => {
      const structured = params.structuredContent as unknown
      if (isBriefingPayload(structured)) {
        setState({ kind: "ok", data: structured })
      } else {
        setState({ kind: "error", message: "invalid payload" })
      }
    }

    void app
      .connect(new PostMessageTransport(window.parent))
      .then(() => {
        // manual size notify once connected (autoResize:false — we control height only)
        notifySize(app)
      })
      .catch((err) => console.error("App.connect failed:", err))
  }, [])

  // ... render state …
}
```

### Pattern 2: Period-toggle re-fetch via `app.callServerTool`

**What:** Widget calls the MCP server's `weekly_heatmap` tool with new `{weeks: N}` argument. The SDK resolves a promise with the `CallToolResult`. Widget updates local state.

**When to use:** HeatmapBlock only. Other blocks are fixed-window per Phase 19 deferred list.

**Example:**

```tsx
// Source: @modelcontextprotocol/ext-apps/dist/src/app.d.ts line 559 (verified signature); v1 App.tsx:186-206 demonstrates usage pattern for daily_briefing — adapted here for weekly_heatmap
import { useContext, useState } from "react"
import type { App } from "@modelcontextprotocol/ext-apps"
import type { HeatmapData } from "./lib/types"

type HeatmapViewState = {
  weeks: 4 | 8 | 12
  data: HeatmapData | null
  error: string | null
  loading: boolean
}

export function HeatmapBlock({
  initialData,
  app,
}: {
  initialData: HeatmapData
  app: InstanceType<typeof App> | null
}) {
  const [view, setView] = useState<HeatmapViewState>({
    weeks: 8,
    data: initialData,
    error: null,
    loading: false,
  })

  const onPeriodChange = async (weeks: 4 | 8 | 12) => {
    if (!app || view.weeks === weeks || view.loading) return
    setView((v) => ({ ...v, weeks, loading: true, error: null }))
    try {
      const result = await app.callServerTool({
        name: "weekly_heatmap",
        arguments: { weeks },
      })
      if (result.isError) {
        setView((v) => ({ ...v, loading: false, error: "tool returned error" }))
        return
      }
      const data = result.structuredContent as HeatmapData
      setView((v) => ({ ...v, data, loading: false }))
    } catch (err) {
      setView((v) => ({
        ...v,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      }))
    }
  }

  if (view.error) return <BlockSkeleton variant="error" />
  if (!view.data) return <BlockSkeleton variant="loading" />

  return (
    <section>
      <HeatmapGrid data={view.data} dim={view.loading} />
      <PeriodToggle active={view.weeks} onChange={onPeriodChange} disabled={view.loading} />
    </section>
  )
}
```

### Pattern 3: Motion v12 stagger via `AnimatePresence` + variant propagation

**What:** Parent `motion.div` owns the `variants={list}` with `transition: { staggerChildren: 0.08 }`; children `motion.div` declare `variants={item}`. Motion's default variant propagation handles the timing automatically.

**When to use:** Top-level 4-block entry animation on first `toolResult` arrival. Do NOT use this for period-toggle re-fetch (sibling blocks must NOT re-stagger per D-19-03).

**Example:**

```tsx
// Source: motion.dev/docs/react-animation (verified via ctx7) — "Variant propagation through component tree" + "Orchestrate child animations with when and delayChildren"
import { motion, AnimatePresence, useReducedMotion, stagger } from "motion/react"

const list = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      when: "beforeChildren",
      delayChildren: stagger(0.08),  // 80ms cascade; D-19 discretion
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
}

function BlocksGrid({ data }: { data: BriefingPayload }) {
  const reduced = useReducedMotion()
  const listVariants = reduced ? { hidden: { opacity: 0 }, visible: { opacity: 1 } } : list
  const itemVariants = reduced ? { hidden: { opacity: 0 }, visible: { opacity: 1 } } : item

  return (
    <motion.div variants={listVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants}>
        <HeuteBlock run={data.blocks.run_rate} attention={data.attention} />
      </motion.div>
      <motion.div variants={itemVariants}>
        <HeatmapBlock block={data.blocks.heatmap} />
      </motion.div>
      <motion.div variants={itemVariants}>
        <RepeatBlock block={data.blocks.repeat} />
      </motion.div>
      <motion.div variants={itemVariants}>
        <BasketOrAovBlock block={data.blocks.basket} />
      </motion.div>
    </motion.div>
  )
}
```

### Pattern 4: `useCountUp(target)` via `useSpring` + `useMotionValue` + `useMotionValueEvent`

**What:** A motion value tracks 0 → `target`; a spring motion value smoothly animates between updates; a `useMotionValueEvent("change")` listener syncs the numeric state into React for rendering. React re-renders at ~60fps with the current animated value; Motion handles physics + interpolation.

**When to use:** HeuteBlock (Hochrechnung € value), RepeatBlock (Wiederkaufrate %), BasketOrAovBlock (AOV € in aov_bands mode). Only on first render per value — if `target` changes across renders (period-toggle doesn't apply here; numbers are stable per block), Motion naturally animates from the last value.

**Example:**

```tsx
// Source: motion.dev/docs/react-motion-value (verified via ctx7) — useMotionValue, useSpring, useMotionValueEvent patterns
// Design-level D-19-03 spec: ~600ms count-up on first render; useReducedMotion short-circuits to instant value
import { useEffect, useState } from "react"
import { useMotionValue, useSpring, useMotionValueEvent, useReducedMotion } from "motion/react"

export function useCountUp(target: number, durationMs = 600): number {
  const reduced = useReducedMotion()
  const motionValue = useMotionValue(0)
  const spring = useSpring(motionValue, {
    stiffness: 120,
    damping: 20,
    mass: 0.8,
  })
  const [display, setDisplay] = useState(reduced ? target : 0)

  useEffect(() => {
    if (reduced) {
      setDisplay(target)
      return
    }
    motionValue.set(target)
  }, [target, reduced, motionValue])

  useMotionValueEvent(spring, "change", (v) => {
    setDisplay(v)
  })

  return display
}
```

Then in a block:

```tsx
function HochrechnungValue({ projected }: { projected: number }) {
  const display = useCountUp(projected, 600)
  return <span className="text-3xl font-semibold">{formatCurrency(display)}</span>
}
```

### Pattern 5: Heatmap 5-step intensity via inline `color-mix`

**What:** Compute a per-cell intensity (0–4) from `order_count` via quintile or percentile of `buckets[].order_count`. Render via inline style using `color-mix(in oklch, var(--color-accent) ${N}%, transparent)`.

**When to use:** 168 cells of HeatmapBlock.

**Example:**

```tsx
// Source: CSS color-mix() function — verified Chromium 111+ support (sandbox-proxy widget runs in parent Chromium, so inheritance is fine)
// Tailwind v4 arbitrary values accept color-mix() per tailwindlabs discussions; inline style is cheaper for 168 cells
const OPACITY_STEPS = [0, 25, 50, 75, 100]  // 5-step intensity scale per spec §3.2

function heatmapCellBg(intensity: 0 | 1 | 2 | 3 | 4): string {
  if (intensity === 0) return "var(--color-subtle)"  // empty cell = subtle grey
  const pct = OPACITY_STEPS[intensity]
  return `color-mix(in oklch, var(--color-accent) ${pct}%, transparent)`
}

function HeatmapGrid({ data }: { data: HeatmapData }) {
  // Build a 7×24 dense matrix from sparse buckets
  const grid: Array<Array<{ count: number; intensity: 0 | 1 | 2 | 3 | 4 }>> =
    computeGridWithIntensity(data.buckets)

  return (
    <div
      className="grid"
      style={{
        gridTemplateColumns: "repeat(24, minmax(0, 1fr))",
        gridTemplateRows: "repeat(7, minmax(0, 1fr))",
        gap: "2px",
      }}
    >
      {grid.flatMap((row, dow) =>
        row.map((cell, hour) => (
          <div
            key={`${dow}-${hour}`}
            className="aspect-square rounded-sm"
            style={{ background: heatmapCellBg(cell.intensity) }}
            aria-label={`${dow}:${hour}, ${cell.count} orders`}
          />
        )),
      )}
    </div>
  )
}
```

**Fallback strategy (if `color-mix` unsupported):** rendered via Tailwind opacity classes — `bg-[color:var(--color-accent)]` with `opacity-25|50|75|100`. The sandbox inherits parent browser Chromium (≥111 since we serve via Vercel to modern browsers), so `color-mix` is safe. Baseline status: `color-mix()` is Chromium 111+ (Mar 2023), Firefox 113+ (May 2023), Safari 16.2+ (Dec 2022) — all current supported browsers.

### Anti-Patterns to Avoid

- **Per-cell Motion on the heatmap.** 168 `motion.div` cells re-mounting + cascade-rendering inside a sandboxed iframe stutters visibly. Phase 18 MCP_UI_RESOURCE_BUILD_PIPELINE §8 explicitly forbids this. Use container-level fade-in only (one `motion.div` wrapping the entire grid).
- **Calling `app.callServerTool` from sibling blocks.** Only HeatmapBlock owns the period-toggle call surface. Other blocks are fixed-window per Phase 19 deferred list. If a block needs fresh data, it waits for the next page mount.
- **Hoisting `activeWeeks` to `App.tsx`.** Keeps all 4 blocks coupled to heatmap state, causing sibling re-renders on every toggle. Keep state local to HeatmapBlock.
- **Mutating `document.documentElement` CSS vars outside `useHostTokens`.** Phase 18's `useHostTokens` owns the 12 tokens + 300ms fallback + protocolVersion guard. v2 widget must never bypass it.
- **Introducing a 13th token.** D-18-03 locked the 12-token list + contract test. Add a new token = re-open Phase 18 scope.
- **Importing from `../../src/` into the widget.** Widget is a sandboxed viteSingleFile artifact — Node-side imports won't resolve at build time and will fail CI. Use D-19-12's manual duplication with `// KEEP IN SYNC` header.
- **Using `<a target="_blank">` for admin deep-links.** Sandboxed iframe blocks this; must use `app.openLink({url})` which routes to PORTAL `handleOpenLink`.
- **Snapshotting Motion-animated DOM.** Motion injects inline `style={{transform,opacity,...}}` that flickers across runs. Either mock Motion in tests, or use `useReducedMotion` at test level, or test behavior with `getByText` not `toMatchSnapshot`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Animations + stagger | Custom `setTimeout` orchestrator | `motion.div` + variants + `stagger()` from `motion/react` | Motion handles `prefers-reduced-motion`, RAF batching, cleanup on unmount |
| Count-up animation | Custom `requestAnimationFrame` loop | `useSpring(useMotionValue(target))` + `useMotionValueEvent("change")` | Physics-correct easing, auto-terminates at rest, interrupt-safe |
| `prefers-reduced-motion` detection | Raw `window.matchMedia` | `useReducedMotion()` from `motion/react` | React-subscribed; returns stable `boolean \| null`; matches Motion's own animation opt-outs |
| Tool invocation from widget | Raw `window.parent.postMessage` + JSON-RPC framing | `app.callServerTool({name, arguments})` | MCP Apps protocol owns the envelope + promise resolution + cancellation |
| Admin link opening | `<a target="_blank">` | `app.openLink({url})` | Sandbox forbids external navigation; MCP Apps protocol lifts the constraint |
| Theme token handshake | Custom postMessage protocol | `useHostTokens()` from `widgets/shared/hooks/` | Phase 18 already handles 300ms fallback, protocol-version mismatch, CSS var injection |
| URL param parsing for `?mock=*` | Raw `URLSearchParams` loose check | `getFixtureMode()` from `widgets/daily-briefing/src/lib/fixtures.ts` | Narrow union return type defends against arbitrary string injection (T-18-05-01) |
| de-DE currency formatting | Manual string templating | `Intl.NumberFormat("de-DE", {style: "currency", currency: "EUR"})` | Browser-native; handles decimal/thousand separators, currency symbol placement |
| Type duplication checker widget↔server | Network sync script | `// KEEP IN SYNC WITH ...` header comment + vitest contract test | D-18-03 pattern (already used for `widget-tokens.ts` in both repos — byte-identical below header). For `BriefingPayload`, D-19-12 explicitly defers the contract test (runtime failure is the signal). |

**Key insight:** every "hand-roll" avoided here saves KB + review cycles. The Phase 18 rails + Motion v12 primitives + `Intl.NumberFormat` cover 100% of Phase 19's needs. A ~80 KB gz v2 code budget is realistic because the hard parts are already libraries.

---

## Common Pitfalls

### Pitfall 1: AppRenderer `toolResult` prop re-send loop

**What goes wrong:** PORTAL `RevenueIntelligencePage.tsx` passes `toolResult={toolResult}` to `AppRenderer`. If any callback identity (`onCallTool`, `onOpenLink`, etc.) changes between renders, AppRenderer's internal `useEffect([...deps])` re-fires and re-sends `toolResult` to the iframe, which re-renders the entire widget, which re-dispatches `onSizeChanged`, which can loop under certain conditions.

**Why it happens:** `useMcpProxy` returns `{callTool, readResource, ...}` — if the object is new on every render, downstream `useCallback` wrappers with those in their deps also become new, and AppRenderer treats them as "new handlers" and re-runs setup.

**How to avoid:** `useMcpProxy` is already `useMemo`-stabilized (PORTAL memory `feedback_react_hook_identity_churn`). In Phase 19 widget code, the same discipline applies — **any hook returning an object must wrap it in `useMemo`**. `useHostTokens` already does this (line 82). `useCountUp` returns a `number` (primitive — no identity concern). HeatmapBlock's state is `useState` (React handles identity).

**Warning signs:** console spam of `"sendToolResult"` log lines, Network tab showing repeated `daily_briefing` or `weekly_heatmap` POSTs, browser CPU pinning at 100%. Verification: add a `console.count("toolResult useEffect")` in dev harness to confirm the count is 1 per mount.

### Pitfall 2: `app.ontoolresult` fires BEFORE React state is set up

**What goes wrong:** `App.connect()` performs the initialize handshake and can deliver a queued tool-result notification before `React.useState` setter has a chance to mount the handler.

**Why it happens:** `useEffect` cleanup + React StrictMode double-mount + MCP App's queued notifications.

**How to avoid:** Register `app.ontoolresult = handleResult` BEFORE calling `app.connect(...)` (v1 widget does this at App.tsx:165, correctly). Do NOT put the assignment inside an async `.then()`. D-19 MUST keep this order.

**Warning signs:** first paint shows `{kind: 'loading'}` forever in dev harness connected to live MCP server.

### Pitfall 3: Size-change ping-pong from animated content

**What goes wrong:** Motion animations change `height` via `translateY`/`opacity` transforms, but some animations (e.g. accordion expand) change real layout height. Each layout change fires `ResizeObserver`, which fires `sendSizeChanged`, which makes the host iframe jump around, which may re-trigger `onSizeChanged` callback on the host.

**Why it happens:** v1 widget uses `autoResize: false` + manual `ResizeObserver` callback (App.tsx:130-138, 180-183). The manual observer covers both `documentElement` and `body`. During block entry stagger, heights change rapidly.

**How to avoid:** Keep `autoResize: false` per v1. Debounce `notifySize` with `requestAnimationFrame`. Only report height (NOT width — v1 comment explains why). Skip size reports for height changes < ~4px. Motion translateY does NOT trigger layout change (it uses GPU transform), so stagger entry should NOT fire the observer at all — but it does change `body` layout on first paint.

**Warning signs:** widget iframe "jitters" during first paint in portal (observable via DevTools → iframe element → height attribute flickering).

### Pitfall 4: German formatting — `Intl.NumberFormat` with thousands + decimal

**What goes wrong:** de-DE conventions use `.` for thousands (1.240) and `,` for decimals (4,28). American output uses `,` for thousands and `.` for decimals. Using the wrong format on a revenue dashboard looks broken.

**Why it happens:** Default `Intl.NumberFormat()` respects browser locale, which may be English in dev. Always pass `"de-DE"` explicitly.

**How to avoid:** Centralize in `lib/formatters.ts`. Use `Intl.NumberFormat("de-DE", {style: "currency", currency: "EUR", maximumFractionDigits: 0})` for currency. `Intl.NumberFormat("de-DE", {style: "percent", signDisplay: "exceptZero", maximumFractionDigits: 0})` for percent. Unit tests in `lib/__tests__/formatters.test.ts` assert exact output strings.

**Warning signs:** review test output — `1240 €` or `1,240 €` instead of expected `1.240 €` indicates locale mismatch.

### Pitfall 5: `useReducedMotion()` does not work when iframe has no `allow-same-origin`

**What goes wrong:** Some sandboxed iframes without `allow-same-origin` have restrictions on `window.matchMedia`. However, `prefers-reduced-motion` media queries DO fire correctly — the restriction applies to things like `document.cookie`, `localStorage`, etc. Motion's `useReducedMotion()` works via `matchMedia` which is unaffected.

**Why it happens:** Confusion between "sandbox with `allow-same-origin`" (grants parent-origin rights) and pure `allow-scripts` (scripts work, but no cross-document access). `matchMedia` is per-frame state, not cross-document.

**How to avoid:** Confirm sandbox attribute in `public/sandbox-proxy.html` line 50: `allow-scripts allow-forms` is the current default for inner iframe. `matchMedia` works here. Phase 18 assumed yes; MDN documentation and the fact that CSS media queries evaluate in the iframe's own context confirm it. No action needed beyond continuing to trust Phase 18's assumption.

**Warning signs:** `useReducedMotion()` returns `null` (before matchMedia resolves) or always returns `false` — test in dev harness by toggling OS-level "Reduce Motion" setting and reloading.

### Pitfall 6: `color-mix(...)` CSS not supported in older Safari

**What goes wrong:** Safari added `color-mix()` in 16.2 (Dec 2022). Users on iOS 15 or macOS 12-Monterey without Safari 16.2 would see a broken heatmap (all cells render as invalid `var(--color-subtle)` fallback or nothing).

**Why it happens:** PORTAL supports modern browsers per stack docs; staging.portal.kamanin.at is used by KAMANIN team + first client (MBM), both on modern Chromium. But edge case exists.

**How to avoid:** Two options — (a) accept modern-browser-only (staging scope is internal + MBM; Chromium is fine), (b) add a fallback via `@supports not (color: color-mix(in srgb, red, blue))` to use Tailwind opacity variants as a fallback layer. Recommend (a) for v3.0 staging; revisit for MBM production rollout.

**Warning signs:** QA on Safari 15 shows heatmap as solid blocks or nothing. Not in Phase 19 acceptance test matrix (desktop Chromium only per portal conventions), so low priority.

### Pitfall 7: Snapshot test brittleness with Motion inline styles

**What goes wrong:** `motion.div` injects `style={{opacity: 0.9999, transform: "translateY(0px)"}}` at mid-animation frames. Snapshot tests capturing these render fluctuating strings, causing false CI failures.

**Why it happens:** Motion renders actual intermediate values during transitions.

**How to avoid:** Three options: (a) Mock `motion` in tests — `vi.mock('motion/react', () => ({motion: {div: 'div', ...}, AnimatePresence: ({children}) => children}))`. (b) Set `useReducedMotion()` to `true` in test env by overriding `window.matchMedia` — Motion then skips animations. (c) Use non-snapshot assertions (`getByText`, `toHaveTextContent`) which are behavior-focused, not DOM-structure-focused. PORTAL precedent: `filterMotionProps` helper in Phase 04-00 (see STATE.md: "filterMotionProps helper strips motion-specific props in test mocks"). Recommend option (c) for simplicity — assert that the German strings + numeric values appear, not that the exact JSX tree matches.

**Warning signs:** snapshot diffs show only `style={}` differences; CI fails intermittently.

---

## Code Examples

Verified patterns consumed below are all from sources already in the repo (Phase 17/18 code + spec docs) or from ctx7-verified Motion v12 + MDN docs.

### Example 1: `app.callServerTool` for period-toggle (D-19-05 critical path)

```tsx
// Source: @modelcontextprotocol/ext-apps dist/src/app.d.ts:519-559 — callServerTool(params, options?): Promise<CallToolResult>
// Confirmed working in v1 at G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/src/App.tsx:191 for 'daily_briefing'
const result = await app.callServerTool({
  name: "weekly_heatmap",
  arguments: { weeks: 4 },
})
// result is a CallToolResult: {content: [{type:'text',text}], structuredContent: HeatmapData, isError?: boolean}
if (result.isError) { /* error */ }
const data = result.structuredContent as HeatmapData
```

### Example 2: Host-side `onCallTool` (already in RevenueIntelligencePage.tsx — NO CHANGE)

```tsx
// Source: PORTAL/src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx:38-44 (verified intact)
const handleCallTool = useCallback(
  async (params: { name: string; arguments?: Record<string, unknown> }) => {
    const result = await callToolRef.current(params)
    return result as CallToolResult
  },
  [],
)

// params.name can be ANY whitelisted tool. The handler doesn't branch on name —
// it's a pure pass-through. So period-toggle's weekly_heatmap flows through unchanged.
```

### Example 3: de-DE formatters (migrate from v1 inline to `lib/formatters.ts`)

```typescript
// Source: PORTAL SPEC.md currency conventions + v1 App.tsx:530-544
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatPercent(pct: number): string {
  // pct is 0..1 or can be ±N decimal (convention from Phase 17 kmn-bridge: pct is already in percent units, not ratio; verify per schema)
  // Tests: formatPercent(0.18) → "+18 %"; formatPercent(-0.042) → "-4 %"
  return new Intl.NumberFormat("de-DE", {
    style: "percent",
    signDisplay: "exceptZero",
    maximumFractionDigits: 0,
  }).format(pct)
}

export function formatPP(pp: number): string {
  // Percentage-point delta — not a percent. Used by RepeatBlock trend.
  // Tests: formatPP(4) → "+4 PP"; formatPP(-1) → "-1 PP"
  const sign = pp > 0 ? "+" : pp < 0 ? "-" : ""
  return `${sign}${Math.abs(pp)} PP`
}

export function formatDate(iso: string): string {
  // Used for heatmap row labels — "Mo, 21.04."
  const date = new Date(iso)
  const wd = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "Europe/Berlin" }).format(date)
  const dm = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }).format(date)
  return `${wd}, ${dm}`
}
```

### Example 4: Fixture payload file (Phase 19 extension of Phase 18 `fixtures.ts`)

```typescript
// Source: widgets/daily-briefing/src/lib/fixtures.ts (Phase 18 — `getFixtureMode()` exists)
// Phase 19 adds: getFixturePayload(mode) returning a fully-typed BriefingPayload

import type { FixtureMode } from "./fixtures"
import type { BriefingPayload } from "./types"

// Numeric constants derived from Phase 16 seeded-data facts:
// - 1099 paid orders, 310 multi-item, 20.1% repeat, day=4 peak, hour=20 peak
const BASE_PAYLOAD: BriefingPayload = {
  blocks: {
    run_rate: {
      status: "ok",
      data: {
        confidence: "high",
        projected_revenue: 4280,
        current_revenue: 1240,
        expected_by_hour: [/* 24 numbers */],
        pace_vs_7day_avg_pct: 0.18,
        payment_split: [
          { method: "klarna", order_count: 6, revenue: 520 },
          { method: "paypal", order_count: 4, revenue: 380 },
          { method: "stripe", order_count: 3, revenue: 340 },
        ],
        same_hour_last_week: 980,
        baseline_days_used: 14,
      },
    },
    heatmap: {
      status: "ok",
      data: {
        best_slot: { day_of_week: 4, hour_of_day: 20, order_count: 3, net_revenue: 8700 },
        buckets: [/* 168 Slot entries */],
        weeks_analyzed: 8,
      },
    },
    repeat: {
      status: "ok",
      data: {
        repeat_rate_pct: 20.1,
        benchmark_pct: 27.0,
        total_orders: 1099,
        unique_customers: 887,
        returning_customers: 178,
        median_days_to_2nd: 38,
        trend_pp: 4,
      },
    },
    basket: {
      status: "ok",
      data: {
        mode: "market_basket_product",
        basket_pairs: [
          { a_name: "Boxspringbett Luxe", b_name: "Lattenrost Premium", support: 0.08, confidence: 0.64, lift: 3.2 },
          /* ... */
        ],
        aov_bands: [/* 3 bands */],
        avg_order_value: 2973,
        median_order_value: 1800,
        multi_item_order_count_90d: 310,
      },
    },
  },
  attention: {
    status: "ok",
    data: { /* PaymentAttentionPayload */ },
  },
}

export function getFixturePayload(mode: FixtureMode | null): BriefingPayload {
  if (mode === "basket-aov") {
    return {
      ...BASE_PAYLOAD,
      blocks: {
        ...BASE_PAYLOAD.blocks,
        basket: {
          status: "ok",
          data: {
            mode: "aov_bands",
            aov_bands: [
              { label: "< 500 €", lower: 0, upper: 500, share_of_count: 0.22, share_of_revenue: 0.14 },
              { label: "500–1.500 €", lower: 500, upper: 1500, share_of_count: 0.61, share_of_revenue: 0.56 },
              { label: "> 1.500 €", lower: 1500, upper: null, share_of_count: 0.17, share_of_revenue: 0.30 },
            ],
            avg_order_value: 847,
            median_order_value: 680,
          },
        },
      },
    }
  }
  if (mode === "one-block-failing") {
    return {
      ...BASE_PAYLOAD,
      blocks: {
        ...BASE_PAYLOAD.blocks,
        heatmap: { status: "error", message: "simulated heatmap failure" },  // 3 ok + 1 error
      },
    }
  }
  return BASE_PAYLOAD
}
```

### Example 5: useCountUp hook

See Pattern 4 above.

---

## Runtime State Inventory (in-place v1→v2 replacement scope)

Phase 19 involves **in-place file replacement** for 3 widget files. The broader system has zero runtime state changes. This inventory confirms nothing else needs migrating.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | **None** — widgets are stateless. No ChromaDB collections, no Mem0 user_ids, no SQLite, no Redis keys reference the v1 widget. Verified by Grep across `supabase/migrations/` — no `daily_briefing` or `daily-briefing` DB references. | None — verified by absence |
| Live service config | **Upstream MCP server on Vercel (mcp-poc-three.vercel.app)** already serves the v2 `daily_briefing` tool (Phase 17 shipped). The widget URI `ui://widgets/daily-briefing.html` resolves server-side via `widgets.dailyBriefing()` reading `dist/widgets/daily-briefing.html`. On next Vercel deploy of mcp-poc (after Phase 19 push), the new HTML replaces the old. | None — auto-updates on Vercel push |
| OS-registered state | **None** — no Windows Task Scheduler, no pm2, no launchd, no cron tasks reference the v1 widget. The only scheduler adjacent is pg_cron (deferred to Phase 20's Monday email, which doesn't use the widget). | None |
| Secrets / env vars | Widget does NOT read env vars at runtime (it's a static bundle). Phase 17's `WOOCOMMERCE_WP_USER` / `WOOCOMMERCE_WP_APP_PASS` / `KMN_BRIDGE_URL` serve the server-side tool; unchanged. PORTAL's `MCP_SERVER_URL` EF env var is unchanged. | None |
| Build artifacts | **`mcp-poc/dist/widgets/daily-briefing.html`** — current baseline 153,307 bytes (150.6 KB gz). This is the built v1 artifact. Phase 19's `npm run build:widgets` overwrites it with the v2 build (verified via the `emptyOutDir` rollup plugin — though actually Phase 18 `emptyOutDir: false` + `build-widgets.mjs` empties once at start, so v1 is cleaned before v2 builds). | Rebuild via `npm run build:widgets` — handled automatically by Vercel deploy hook |

**Nothing-migration summary:** Phase 19 is a code-only change in the widget repo. No DB migration, no env var rotation, no re-registration of OS tasks, no data-migration script. The runtime system has only the compiled HTML artifact as state, and the build pipeline overwrites it every deploy.

---

## Environment Availability

Phase 19 depends on the following tools + services. All are either verified shipped (Phase 15/16/17/18) or accessed via existing infrastructure.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js (mcp-poc build + tests) | `npm run build:widgets`, `npm run test:run` | ✓ | ≥20 (package.json engines) | — |
| vitest | Block + formatter + fixture tests | ✓ | 2.1.9 | — |
| jsdom | Block render tests | ✓ | 25.0.1 | — |
| @testing-library/react | Block render tests | ✓ | 16.3.2 | — |
| Motion v12 | Stagger + count-up + useReducedMotion | ✓ | 12.38.0 | — |
| Tailwind v4 + `@tailwindcss/vite` | Utility classes | ✓ | 4.2.4 | — |
| Vite | Dev server + build | ✓ | 6.0.5 | — |
| vite-plugin-singlefile | Inline dist HTML | ✓ | 2.3.3 | — |
| @modelcontextprotocol/ext-apps | `App`, `PostMessageTransport`, `callServerTool` | ✓ | 0.2.0 | — |
| Summerfield DDEV | `daily_briefing` tool returns seeded payload (UAT only) | ✓ (Phase 15) | WP 6.9.4 + WC 8.x | Dev harness + fixture payloads for offline widget dev |
| Vercel | mcp-poc-three.vercel.app hosting upstream MCP | ✓ (production deployed) | — | — |
| Cloud Supabase staging | `mcp-proxy` EF (ALLOWED_TOOLS incl. `weekly_heatmap`) | ✓ (Phase 17 PORT-01 deployed via CI) | — | — |
| staging.portal.kamanin.at | End-to-end UAT surface | ✓ (Phase 11-18 deployed) | — | — |

**Missing dependencies:** None. All required dependencies are shipped and verified.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 2.1.9 (mcp-poc repo — separate from PORTAL vitest) |
| Config file | `G:/01_OPUS/Projects/mcp-poc/vitest.config.ts` (Phase 18) |
| Quick run command | `cd G:/01_OPUS/Projects/mcp-poc && npm run test:run -- widgets/daily-briefing` (scopes to this phase's tests) |
| Full suite command | `cd G:/01_OPUS/Projects/mcp-poc && npm run test:run` (all widgets + existing shared hook tests) |
| Environment matchGlobs | `node` for pure lib tests; `jsdom` for `widgets/shared/hooks/**` (Phase 18) + extend to `widgets/daily-briefing/src/blocks/**` (Phase 19) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WIDG-STRUCT-05 | `formatCurrency(1240)` → `"1.240 €"` | unit | `npm run test:run -- widgets/daily-briefing/src/lib/__tests__/formatters` | ❌ Wave 0 |
| WIDG-STRUCT-05 | `formatPercent(0.18)` → `"+18 %"` | unit | same | ❌ Wave 0 |
| WIDG-STRUCT-05 | `formatPP(4)` → `"+4 PP"` | unit | same | ❌ Wave 0 |
| WIDG-STRUCT-05 | `formatDate("2026-04-21T00:00:00Z")` → `"Mo, 21.04."` | unit | same | ❌ Wave 0 |
| WIDG-STRUCT-04 | `getFixtureMode()` returns `'basket-aov'` for `?mock=basket-aov` | unit | `npm run test:run -- widgets/daily-briefing/src/lib/__tests__/fixtures` | ❌ Wave 0 |
| WIDG-STRUCT-04 | `getFixturePayload('basket-aov').blocks.basket.data.mode === 'aov_bands'` | unit | same | ❌ Wave 0 |
| WIDG-STRUCT-04 | `getFixturePayload('one-block-failing').blocks` has 3 `status:'ok'` + 1 `status:'error'` | unit | same | ❌ Wave 0 |
| WIDG-BLOCK-01 | HeuteBlock renders Hochrechnung value + pace indicator + payment bars | render/smoke | `npm run test:run -- widgets/daily-briefing/src/blocks/__tests__/HeuteBlock` | ❌ Wave 0 |
| WIDG-BLOCK-01 | HeuteBlock `confidence==='low'` renders `"Noch zu früh"` or `"Nicht genug Daten"` | render/smoke | same | ❌ Wave 0 |
| WIDG-BLOCK-02 | HeatmapBlock renders 168 cells with best-slot callout | render/smoke | `npm run test:run -- widgets/daily-briefing/src/blocks/__tests__/HeatmapBlock` | ❌ Wave 0 |
| WIDG-BLOCK-03 | RepeatBlock renders rate + benchmark + median days | render/smoke | `npm run test:run -- widgets/daily-briefing/src/blocks/__tests__/RepeatBlock` | ❌ Wave 0 |
| WIDG-BLOCK-04 | BasketOrAovBlock renders correct mode for each `basket.data.mode` | render/smoke | `npm run test:run -- widgets/daily-briefing/src/blocks/__tests__/BasketOrAovBlock` | ❌ Wave 0 |
| WIDG-BLOCK-05 | Attention sub-section renders inside HeuteBlock with admin links | render/smoke | same file as HeuteBlock | ❌ Wave 0 |
| WIDG-QA-01 | 4 blocks render < 2s | manual UAT | open staging.portal.kamanin.at/umsatz-intelligenz, measure via DevTools Performance | — (manual only) |
| WIDG-QA-02 | -85% bug not reproducible at 09:00/11:00/14:00/17:00 | manual UAT | 4 clock-time reloads on staging, visual inspection of pace indicator | — (manual only) |
| WIDG-QA-03 | Error block shows skeleton — dev harness fixture | manual UAT + render test | `npm run dev:widget` + select `?mock=one-block-failing` + inspect; OR render test mocking `BriefingPayload.blocks.heatmap.status === 'error'` | ❌ Wave 0 |
| WIDG-QA-04 | All user-facing text in German | static grep + render tests | `grep -r 'Details\|Loading\|Error' widgets/daily-briefing/src/` (should match zero English) | partial (manual) |
| WIDG-QA-05 | Dist ≤ 300 KB gz | automated | `npm run build:widgets && npm run check:bundle-size` | ✓ (Phase 18 script ships, already green for v1) |
| PORT-02 | `kmn/theme/*` relay in sandbox-proxy.html | automated grep | `grep 'kmn/theme/' G:/01_OPUS/Projects/PORTAL/public/sandbox-proxy.html` expects match | ✓ (Phase 18 landed) |
| PORT-03 | Theme publisher survives multi-mount | manual UAT | navigate to `/umsatz-intelligenz`, then to another page, back — verify `kmn/theme/set` fires twice | — (manual only) |
| PORT-04 | `RevenueIntelligencePage.tsx` zero TS diff | automated | `git diff --stat src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` returns empty | — (git-level, runs after phase complete) |
| PORT-05 | McpErrorBoundary renders German error + reload button | manual UAT + component test | render test of `<McpErrorBoundary>` with thrown child; OR force fixture payload that throws, visual inspect | partial (component test exists for PORTAL but not for widget) |

### Sampling Rate

- **Per task commit (mcp-poc repo, branch `main`):** `npm run test:run -- widgets/daily-briefing` (subset) + `npm run typecheck` (tsc + widgets tsc) — runs under 30s
- **Per wave merge:** `npm run test:run` (full suite) + `npm run build:widgets && npm run check:bundle-size`
- **Phase gate (final plan before `/gsd-verify-work`):** full suite green + `git diff` zero on `RevenueIntelligencePage.tsx` (PORT-04) + `grep` checks on sandbox-proxy.html (PORT-02) + manual UAT checklist (WIDG-QA-01 / WIDG-QA-02 / PORT-03 / PORT-05)

### Wave 0 Gaps

- [ ] `widgets/daily-briefing/src/lib/__tests__/formatters.test.ts` — covers WIDG-STRUCT-05
- [ ] `widgets/daily-briefing/src/lib/__tests__/fixtures.test.ts` — covers WIDG-STRUCT-04
- [ ] `widgets/daily-briefing/src/blocks/__tests__/HeuteBlock.test.tsx` — covers WIDG-BLOCK-01 + WIDG-BLOCK-05
- [ ] `widgets/daily-briefing/src/blocks/__tests__/HeatmapBlock.test.tsx` — covers WIDG-BLOCK-02
- [ ] `widgets/daily-briefing/src/blocks/__tests__/RepeatBlock.test.tsx` — covers WIDG-BLOCK-03
- [ ] `widgets/daily-briefing/src/blocks/__tests__/BasketOrAovBlock.test.tsx` — covers WIDG-BLOCK-04 (3 mode variants)
- [ ] `vitest.config.ts` extension — add `widgets/daily-briefing/src/blocks/**/*.{test,spec}.{ts,tsx}` to `environmentMatchGlobs` jsdom array (blocks render to DOM)
- [ ] Test helpers: `vi.mock('motion/react', ...)` or `Object.defineProperty(window, 'matchMedia', ...)` stub for `useReducedMotion()` → true, to bypass Motion timing brittleness (Pitfall 7)

**No framework install needed** — vitest + @testing-library/react + jsdom are already shipped in devDependencies.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Widget has no login surface — parent PORTAL's Supabase auth gates access to `mcp-proxy` EF which gates access to the widget |
| V3 Session Management | no | No cookies/session in widget; sandboxed iframe has no access to PORTAL session |
| V4 Access Control | yes | `mcp-proxy` EF enforces `ALLOWED_TOOLS`, `ALLOWED_METHODS`, and `resources/read` URI whitelist. Widget cannot escape this gate. |
| V5 Input Validation | yes | `getFixtureMode()` narrow union + `BriefingPayload` runtime typecheck (`isBriefingPayload`). Also: `useHostTokens` `SAFE_VALUE` regex on CSS values (already Phase 18) |
| V6 Cryptography | no | No crypto in widget. Theme tokens + tool payloads are non-sensitive numeric + string data |
| V7 Error Handling | yes | Per-block `status:'error'` shows generic "Daten nicht verfügbar" — no stack traces leaked to user. `McpErrorBoundary` catches widget throws + shows generic German error |
| V8 Data Protection | partial | `PaymentAttentionPayload` contains `customer_name` (GDPR: already minimal per v1 server-side — `"Anna M."` not full name) — widget just renders. Ensure Phase 17's `payment-attention.ts` name-minimization is intact (verified: `customer_name` field already minimized per v1 comment "GDPR-minimal from server") |
| V14 Configuration | yes | Iframe `sandbox="allow-scripts allow-forms"` (no `allow-same-origin`) — locks down XSS surface. `public/sandbox-proxy.html` TODO comment notes intent to move to separate origin before multi-client rollout (deferred) |

### Known Threat Patterns for the widget stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Arbitrary tool invocation via `app.callServerTool` | Elevation of Privilege (widget calls tools it shouldn't) | `mcp-proxy` EF `ALLOWED_TOOLS` whitelist (Phase 17 — already includes `weekly_heatmap`; excludes everything else); if widget tries to call `create-clickup-task` etc., proxy returns `BAD_REQUEST` |
| Malicious theme token injection | Tampering (CSS injection) | `useHostTokens` `SAFE_VALUE = /^[\d#.a-z%, ()/-]+$/i` regex (Phase 18) rejects `expression(alert(1))`-style payloads |
| XSS via admin deep-link URL | Tampering | `handleOpenLink` in `RevenueIntelligencePage.tsx` parses URL and rejects non-http(s) protocols (already existing code, lines 99-112) |
| Origin spoofing via postMessage | Spoofing | `sandbox-proxy.html` gates inbound messages by `e.source === inner.contentWindow` (srcdoc origin is 'null', can't gate by origin) + `e.source === window.parent && e.origin === selfOrigin` (verified intact) |
| Sensitive data in console logs | Information Disclosure | Widget logs are dev-facing only; Phase 17 `[kmn-bridge]` server log format is `[status] [ability] [elapsed]ms` — no customer data. Widget console.error in v1 uses structured error objects, no PII |
| DoS via oversized heatmap buckets | Denial of Service | `HeatmapSchema` validates `buckets: z.array(Slot).min(1)` — no upper bound, but WP ability caps at 168 buckets physically. 168 × 20 bytes = ~3 KB, non-issue |
| Period-toggle spamming | DoS | Widget disables toggle buttons during `loading:true` state (D-19-05) — user can't double-invoke |

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1 daily_briefing widget: single card showing today vs yesterday with -85% false alarms | v2 4-block dashboard: run-rate projection, heatmap, repeat metrics, basket/AOV — today-vs-yesterday comparison eliminated structurally | This phase (Phase 19) | Fixes the core trust bug |
| v1 widget imports Motion? **No** — v1 has NO animations (verified: `widgets/daily-briefing/src/App.tsx` has zero `motion` imports) | v2 uses Motion v12 for stagger + count-up + reduced-motion | This phase | Adds ~15 KB gz; visual polish |
| v1 widget uses custom CSS (`styles.css`) with `.briefing`, `.card`, etc. class names | v2 uses Tailwind v4 utilities primarily | This phase | Phase 18's Tailwind integration already in place; bundle size likely decreases (custom CSS shift to JIT-purged utilities) |
| v1 `useState<State>` for loading/ok/error at App level | v2 uses per-block `BriefingPayload.blocks.{name}.status` — App-level state only for full load state | This phase | Enables partial-success rendering (WIDG-QA-03) |
| Pre-Phase-17 `daily_briefing` returned flat `{revenue, attention, incomplete}` shape | Post-Phase-17 returns `{blocks: {run_rate, heatmap, repeat, basket}, attention}` | Phase 17 (shipped 2026-04-24) | Widget contract now drives v2 block composition |
| Pre-Phase-18 widget had no dev harness, no shared token module, flat `widgets/*` layout | Phase 18 established per-widget dirs + `widgets/shared/` + dev-host.html + vitest | Phase 18 (shipped 2026-04-24) | Phase 19 builds entirely on this scaffolding |

**Deprecated / outdated:**
- v1 widget's `AppContext` + `AdminLink` pattern — partially replaced: AdminLink pattern stays (same `app.openLink` semantics) but will live inside `AttentionList.tsx` instead of top-level context wrapper
- v1 widget's `isBriefingPayload` / `isErrorPayload` guards — replaced by `BriefingPayload`-shaped guard (same pattern, new shape)
- v1 `mockData()` inline in App.tsx — replaced by `getFixturePayload()` from `lib/fixtures-payloads.ts`

---

## PORT-04 Zero-Diff Surface Audit

**Question:** Can every AppBridge interaction the v2 widget could trigger be handled by the current `RevenueIntelligencePage.tsx` without any code change?

**Surface analysis** (verified by reading all 150 lines of `RevenueIntelligencePage.tsx`):

| Widget-side action | PORTAL host handler | Already generic enough? |
|--------------------|---------------------|-------------------------|
| `app.callServerTool({name: 'daily_briefing', arguments: {}})` | `handleCallTool` → `callTool({name, arguments})` → `mcp-proxy` EF | ✓ already works — v1 uses this at App.tsx:191 |
| `app.callServerTool({name: 'weekly_heatmap', arguments: {weeks: 4}})` | same handler — no branch on name, pass-through to `useMcpProxy.callTool` | ✓ already works — `ALLOWED_TOOLS` already includes `weekly_heatmap` (verified mcp-proxy/index.ts:145) |
| `app.openLink({url: 'https://.../wp-admin/post.php?post=123&action=edit'})` | `handleOpenLink` at line 99-112 — URL parsed, non-http(s) rejected, `window.open(url, '_blank', 'noopener,noreferrer')` | ✓ already works — v1 uses this for admin deep-links |
| `app.sendSizeChanged({height})` | `handleSizeChanged` at line 117-119 — sets `isReady=true`, no other effect | ✓ already works |
| `app.connect(transport)` initialize handshake | `AppRenderer` handles this internally via its own `AppBridge` setup | ✓ already works |
| Receiving `toolResult` via `ui/notifications/tool-result` | `AppRenderer` forwards the `toolResult` prop to the widget (wiring at line 134); widget's `app.ontoolresult` consumes | ✓ already works — works for v1 |
| `kmn/theme/request` + `kmn/theme/set` | `useThemePublisher` at line 22 + `public/sandbox-proxy.html` relay | ✓ already works (Phase 18) |
| `app.sendMessage(...)` | Not used by v2 widget (no chat-thread interaction) | N/A |
| `app.sendLog(...)` | Would route to `LoggingMessageNotification` → handled by `onLoggingMessage` prop | N/A (not wired, but widget doesn't use) |
| `ui/open-link` alternate message variant | Explicit `handleOpenLink` wired at line 140 | ✓ |

**Conclusion:** PORT-04 zero-diff guarantee is structurally correct. The 4-block v2 widget adds exactly one new call-surface use-case (`weekly_heatmap` tool name in `callTool`), which `handleCallTool` passes through to `useMcpProxy.callTool` without branching, and `mcp-proxy` already whitelists the tool. No code changes required on the PORTAL side.

**Verification checklist for the final plan:**
- [ ] `git diff src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` empty after all Phase 19 work
- [ ] `grep 'weekly_heatmap' supabase/functions/mcp-proxy/index.ts` matches line 145
- [ ] `grep 'kmn/theme/' public/sandbox-proxy.html` matches lines 66-78
- [ ] `useThemePublisher` unchanged — `grep useThemePublisher src/modules/revenue-intelligence/`
- [ ] `useMcpProxy` unchanged — `grep useMcpProxy src/modules/revenue-intelligence/`
- [ ] PORTAL `test:run` passes (sanity check — should be unchanged)

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | React 19 concurrent features don't break the Motion stagger + useCountUp patterns | Pattern 3 + Pattern 4 | Low — Motion v12 explicitly supports React 19; both PORTAL (R19) and mcp-poc (R19) share. Mitigation: dev harness test covers concurrent render |
| A2 | Tailwind v4 `color-mix(in oklch, ...)` in arbitrary values produces valid CSS at JIT build | Pattern 5 | Low — Tailwind docs + GitHub discussion #14827 confirm support. Fallback: use inline style (current recommendation) |
| A3 | Sandbox iframe `allow-scripts allow-forms` (no `allow-same-origin`) still allows `window.matchMedia('(prefers-reduced-motion: reduce)')` to work | Pitfall 5 | Low — MDN docs confirm `matchMedia` is per-frame, not cross-document. Verified intent of Phase 18 MCPAPP-BUILD-03 |
| A4 | Motion v12 bundle size stays ~15 KB gz when only using `motion`, `AnimatePresence`, `useSpring`, `useMotionValue`, `useMotionValueEvent`, `useReducedMotion`, `stagger` | Standard Stack | Low — these are the core primitives; tree-shaking should eliminate unused surface. Could be higher if the single-file bundler doesn't tree-shake. Measurable risk — check `check-widget-bundle-size.mjs` after first v2 build |
| A5 | `app.callServerTool` promise resolves with `CallToolResult` containing `structuredContent: HeatmapData` on server success, and `isError: true` + `content: [{type:'text', text}]` on server error | Example 1 + Pattern 2 | Low — `@modelcontextprotocol/ext-apps` type signature in `app.d.ts:559` guarantees this shape; v1 widget already relies on the same shape for `daily_briefing` refresh |
| A6 | Summerfield DDEV is available during Phase 19 UAT (or mcp-poc-three.vercel.app proxies to it correctly over the network) | WIDG-QA-02 UAT | Medium — Summerfield DDEV runs on Yuri's WSL. If DDEV is down, UAT against live Summerfield data fails. Fallback: dev harness + fixture payloads cover all 3 basket modes + error path. WIDG-QA-02 (-85% bug non-reproducibility) requires Summerfield DDEV — no fallback |
| A7 | The 2s latency budget (WIDG-QA-01) holds end-to-end under staging conditions | WIDG-QA-01 | Medium — Phase 16 measured <500ms per ability on DDEV + Phase 17 Promise.allSettled parallelism; staging round-trip via Vercel edge adds ~100-200ms. Realistic total ~1s–1.5s. If Vercel cold-start hits, could exceed 2s on first call. Not in Phase 19 scope to optimize — flag for verification phase |
| A8 | Snapshot tests for blocks with Motion will pass consistently once `useReducedMotion` mock is in place | Pitfall 7 + Wave 0 Gaps | Low — documented mitigation via `vi.mock` or `matchMedia` stub. If snapshots still flake, fall back to behavior assertions (getByText) per Pitfall 7 recommendation |
| A9 | `heatmap.buckets` array from Phase 17 server always has exactly 168 entries (7 × 24) | HeatmapBlock rendering logic | Low — Phase 16 WP ability returns dense 168-cell grid; Phase 17 Zod `.min(1)` is permissive but real data always is 168. Widget should NOT assume 168 — compute grid from `buckets` via `day_of_week × hour_of_day` keys and fill missing with zeros defensively |
| A10 | The v1 `App.tsx` has NO Motion imports (verified: zero `motion` references in file) | State of the Art table + v1 cleanup scope | Verified via Read tool — low risk |
| A11 | `main.tsx` stays unchanged per D-19-11 (confirmed: only imports `DailyBriefingApp` from `./App`) | Project structure | Verified — low risk |

**If the user needs to confirm any of the above:** A6 (DDEV availability) is the one most worth double-checking before the planner starts. All others are low-risk platform assumptions grounded in verified code.

---

## Open Questions

1. **Should `useCountUp` live in `widgets/shared/hooks/` or `widgets/daily-briefing/src/lib/`?**
   - What we know: D-19 Claude's Discretion — planner's call. Phase 20's Monday email Edge Function is text-based (no Motion), so reuse is unlikely. Future widgets are hypothetical.
   - What's unclear: whether Phase 20 or later phases will need count-up.
   - Recommendation: **keep local in `widgets/daily-briefing/src/lib/useCountUp.ts`**. Promote to `shared/hooks/` if a second widget needs it (YAGNI).

2. **Exact stagger timing: 60ms, 80ms, or 100ms?**
   - What we know: D-19 Claude's Discretion — planner picks based on visual feel. Spec doc doesn't prescribe. 80ms was a suggestion in CONTEXT.md.
   - What's unclear: which feels right for a 4-block vertical stack on the portal's narrow container (`max-w-4xl`).
   - Recommendation: start with **80ms stagger (0.08 in Motion)**, test in dev harness, adjust per Yuri's "wow" verdict.

3. **Count-up duration: 400ms, 600ms, or 800ms?**
   - Same as above — D-19 discretion. 600ms is the suggestion.
   - Recommendation: **600ms**, tuned for money-value legibility. Test in dev harness.

4. **Should formatters.ts handle negative-zero edge (`-0.00 %`)?**
   - What we know: `Intl.NumberFormat` with `signDisplay: "exceptZero"` handles most cases. `-0` edge is browser-dependent.
   - Recommendation: add a `Object.is(pct, -0) ? 0 : pct` normalisation step to avoid `-0 %` in output. Unit test covers `formatPercent(0)` → `"0 %"` (no sign).

5. **Dev harness fixture for `?mock=one-block-failing`: which block should fail?**
   - What we know: D-19 spec says "1 error block". CONTEXT.md §D-19-10 doesn't specify which. Phase 18 §D-18-04 mentions it generically.
   - Recommendation: **heatmap fails** (most visually distinct — the largest block, its skeleton is most obvious; also validates period-toggle-buttons-remain-clickable per D-19-05). Alternative: rotate via `?mock=error-block-1/2/3/4` — but that's scope creep.

6. **Tailwind configuration: any theme extensions for the heatmap color scale?**
   - What we know: Phase 18 Tailwind v4 is configured; the 12 tokens are CSS vars consumed directly (`bg-[var(--color-accent)]`).
   - Recommendation: **no theme extensions**. Use inline styles for 168 heatmap cells (cheaper than defining 5 Tailwind arbitrary-value classes). Document the `color-mix(in oklch, ...)` pattern in a block comment.

7. **WIDG-QA-04 German-text validation: automated or manual?**
   - What we know: No test framework prescribed. Simple approach = grep for common English words (`Loading`, `Error`, `Details`) and fail CI if any match.
   - Recommendation: add a **Wave 2 grep guard** `scripts/check-german-only.mjs` that greps widget dist for a small English-word blacklist. Run in CI. Low effort, high signal.

---

## Sources

### Primary (HIGH confidence)

- **Phase 17 `mcp-server.ts`** (`G:/01_OPUS/Projects/mcp-poc/src/mcp-server.ts`) — `BriefingPayload` + `daily_briefing` `Promise.allSettled` + `weekly_heatmap` registration at line 178 [VERIFIED: direct read]
- **Phase 17 `kmn-bridge-schemas.ts`** (`G:/01_OPUS/Projects/mcp-poc/src/connectors/kmn-bridge-schemas.ts`) — Zod schemas for RunRateData, HeatmapData, RepeatData, BasketData, WeeklyBriefingData with `.passthrough()` + type inference [VERIFIED]
- **Phase 18 `widgets/shared/hooks/useHostTokens.ts`** (`G:/01_OPUS/Projects/mcp-poc/widgets/shared/hooks/useHostTokens.ts`) — handshake hook, SAFE_VALUE regex, 300ms fallback, useMemo stabilization [VERIFIED]
- **Phase 18 `widgets/shared/widget-tokens.ts`** (`G:/01_OPUS/Projects/mcp-poc/widgets/shared/widget-tokens.ts`) — 12 tokens + DEFAULT_TOKEN_VALUES [VERIFIED]
- **Phase 18 `dev-host.html`** (`G:/01_OPUS/Projects/mcp-poc/widgets/daily-briefing/dev-host.html`) — dev harness, fixture dropdown, handshake log (evidence: 18-05-SUMMARY.md)
- **Phase 18 `vite.base.ts`** (`G:/01_OPUS/Projects/mcp-poc/widgets/shared/vite.base.ts`) — buildWidgetConfig factory + Preact fallback docs [VERIFIED]
- **Phase 18 `check-widget-bundle-size.mjs`** — 300 KB gz enforcement [VERIFIED + tested live: `daily-briefing.html: 150.6 KB gz, revenue-today.html: 147.2 KB gz`]
- **v1 `DailyBriefingApp` in `App.tsx`** — documents `app.callServerTool` usage pattern, postMessage transport setup, `ontoolresult` handler, autoResize:false pattern [VERIFIED: read lines 1-670]
- **PORTAL `RevenueIntelligencePage.tsx`** — host wiring, `useMcpProxy`, `useThemePublisher`, `handleOpenLink`, `handleCallTool` — all confirmed generic enough for v2 [VERIFIED: full file read]
- **PORTAL `mcp-proxy/index.ts`** — `ALLOWED_TOOLS` set at lines 141-150 confirms `weekly_heatmap` whitelisted [VERIFIED]
- **PORTAL `public/sandbox-proxy.html`** — `kmn/theme/*` relay block at lines 66-78 [VERIFIED]
- **`@modelcontextprotocol/ext-apps` type definitions** (`node_modules/@modelcontextprotocol/ext-apps/dist/src/app.d.ts`) — `callServerTool` signature line 559, `openLink` line 636, `ontoolresult` line 343 [VERIFIED]
- **`@mcp-ui/client` AppRenderer types** (`node_modules/@mcp-ui/client/dist/src/components/AppRenderer.d.ts`) — `onCallTool` prop line 62, `onOpenLink` prop line 49 [VERIFIED]

### Secondary (MEDIUM-HIGH confidence via ctx7)

- **Motion v12 docs via context7** (`/websites/motion_dev`, benchmark 80.48, 1486 snippets):
  - `useMotionValue` — motion.dev/docs/react-motion-value
  - `useSpring` — motion.dev/docs/react-use-spring + motion.dev/docs/react-motion-value
  - `useMotionValueEvent` — motion.dev/docs/react-motion-value
  - Variant propagation + staggerChildren + stagger() function — motion.dev/docs/react-animation, motion.dev/docs/vue-transitions
  - `useReducedMotion` — motion.dev/docs/react-accessibility
  - `AnimatePresence` — motion.dev/docs/react-animate-presence
- **Tailwind v4 `color-mix` arbitrary values**:
  - [Tailwind Colors Core Concepts](https://tailwindcss.com/docs/colors)
  - [Tailwind CSS v4.0 release notes](https://tailwindcss.com/blog/tailwindcss-v4)
  - [v4 color-mix utilities discussion #14827](https://github.com/tailwindlabs/tailwindcss/discussions/14827)
- **`prefers-reduced-motion` in iframes**:
  - [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)
  - [MDN iframe sandbox](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)

### Tertiary (LOW — flagged for validation)

- **Motion v12 bundle size estimate (~15 KB gz)** — commonly cited number in motion.dev marketing; exact tree-shaken size depends on which hooks are used. Validate via `check-widget-bundle-size.mjs` after first v2 build.
- **End-to-end 2s latency for WIDG-QA-01** — theoretical based on Phase 16 DDEV measurements + Phase 17 parallelism. Actual staging latency not measured. Validate during UAT.

---

## Metadata

**Confidence breakdown:**
- Upstream tool contract (`daily_briefing`, `weekly_heatmap` payload shape, allowed-tools whitelist): **HIGH** — Phase 17 shipped + verified; Zod schemas in code; staging CI deployed
- Phase 18 rails (per-widget Vite, `useHostTokens`, `getFixtureMode`, dev harness, shared tokens, bundle-size script): **HIGH** — Phase 18 shipped + measured (150.6 KB gz baseline)
- Widget-side MCP App SDK (`@modelcontextprotocol/ext-apps` `App.callServerTool`, `openLink`, `ontoolresult`): **HIGH** — type defs verified; v1 widget uses the same API for `daily_briefing`
- Motion v12 patterns (useSpring count-up, variant stagger, useReducedMotion): **HIGH** — ctx7 Motion docs verified; pattern is idiomatic
- Tailwind v4 `color-mix(in oklch, ...)` in arbitrary values: **HIGH** — v4 release notes + Tailwind GitHub discussion confirm; fallback available via inline style
- `prefers-reduced-motion` in sandboxed iframe: **MEDIUM-HIGH** — MDN implies it works; Motion assumes it works; no explicit test in this research pass. Could run a quick dev-harness check.
- 300 KB gz budget headroom for v2: **HIGH** — Phase 18 baseline measured (150.6 KB); v1 v2 code delta likely ~20-50 KB
- 2s end-to-end latency (WIDG-QA-01): **MEDIUM** — theoretical based on component sums; not measured on staging
- Snapshot test brittleness with Motion: **MEDIUM** — known problem with mitigation patterns; requires validation during Wave 0 execution
- `BriefingPayload` type duplication drift risk: **LOW** — D-19-12 accepts drift risk; fallback is runtime render failure (visible)
- v1 cleanup scope correctness: **HIGH** — read v1 App.tsx line-by-line; confirmed `main.tsx` has no v1-specific logic (only imports `DailyBriefingApp`); confirmed `revenue-today` dir is independent

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (30 days for stable platform rails; shorter if mcp-poc or PORTAL main branch ships structural refactors)

*Phase: 19-revenue-intelligence-widget-v2*
*Research complete: 2026-04-24*
