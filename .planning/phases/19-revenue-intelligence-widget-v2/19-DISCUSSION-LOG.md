# Phase 19: Revenue Intelligence Widget v2 — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-24
**Phase:** 19-revenue-intelligence-widget-v2
**Areas discussed:** Charts: SVG/CSS vs lib, Motion & polish level, Attention block placement, Heatmap period toggle scope, Confidence/edge-case display, Basket block clarity, Error/retry UX per block, Testing depth

---

## Charts: SVG/CSS vs lib

| Option | Description | Selected |
|--------|-------------|----------|
| Pure CSS grid + inline SVG (Recommended) | Heatmap = CSS grid of 168 coloured `<div>`s with data-driven Tailwind `bg-[color-mix(...)]` intensity. Bars = flex divs or inline SVG rects. ~0 KB dependency cost. Full Motion control. Matches design spec fidelity at 100%. | ✓ |
| visx primitives (@visx/heatmap) | ~30 KB gz of visx modular primitives for heatmap + bars. Buys built-in scales/tooltips but pays budget + learning curve. | |
| Mixed: CSS grid heatmap + visx bars | Heatmap as pure CSS (cheap), visx only for bars/AOV. Still pays ~25 KB for something solvable with a div width. | |

**User's choice:** Pure CSS grid + inline SVG
**Notes:** 300 KB gz budget constraint makes zero-dependency charting the safest option; Phase 18 bundle-size check validates on every build.

---

## Motion & polish level

| Option | Description | Selected |
|--------|-------------|----------|
| Moderate: staggered block entry + number formatting (Recommended) | 4 blocks fade+translateY in with 80ms stagger. Hochrechnung / Wiederkaufrate counts up from 0. No per-cell heatmap motion (Phase 18 constraint). `prefers-reduced-motion` honoured. | ✓ |
| Minimal: single container fade + Tailwind transitions | Drop Motion runtime entirely (saves ~15 KB gz). No count-ups, just fade. | |
| Lush: heatmap cell wave + bar springs + count-up + mount stagger | Highest visual wow but explicitly rejected in Phase 18 for heatmap (168 cells stutter). | |

**User's choice:** Moderate: staggered block entry + number formatting
**Notes:** Motion v12 already planned as mcp-poc dependency after Phase 18; moderate polish matches the "production-grade dashboard" quality bar without re-opening heatmap-cell animation rejected in Phase 18.

---

## Attention block placement

| Option | Description | Selected |
|--------|-------------|----------|
| Inside HeuteBlock as collapsible sub-section (Recommended) | 'Zahlungsaufmerksamkeit' heading + compact list inside HeuteBlock. Hidden when `entries.length === 0`. Keeps the 4-block rhythm clean. | ✓ |
| 5th compact block below the 4 | Full sibling block after BasketOrAovBlock. More visual weight, breaks "4-block" framing. | |
| Separate block ABOVE Heute as urgent triage | Urgent-triage feel but breaks the spec's block order (HeuteBlock → HeatmapBlock → RepeatBlock → BasketOrAovBlock). | |

**User's choice:** Inside HeuteBlock as collapsible sub-section
**Notes:** Ties "today's money" visually to "money at risk today"; WIDG-BLOCK-05 explicitly allows either placement; the "inside HeuteBlock" route preserves the 4-block dashboard framing from the ROADMAP acceptance tests.

---

## Heatmap period toggle scope

| Option | Description | Selected |
|--------|-------------|----------|
| In scope — implemented as partial re-fetch (Recommended) | `app.callTool({name:'weekly_heatmap', arguments:{weeks:N}})` on toggle click. HeatmapBlock-local loading. Sibling blocks unchanged. | ✓ |
| Defer to 19.1 — 8w fixed for now | Ship with 3 disabled toggle buttons + caption. Risk: reads as half-baked. | |
| In scope but client-side only | Server returns 12w once, widget slices. Breaks locked Phase 17 `weeks:8` server default contract. | |

**User's choice:** In scope — implemented as partial re-fetch
**Notes:** Toggle is in the spec wireframe AND is the single interaction that proves the widget is not a static screenshot. Deferring leaves 3 non-functional buttons in the most visually-prominent block.

---

## Confidence/edge-case display

| Option | Description | Selected |
|--------|-------------|----------|
| Inline replacement (Recommended) | `h_now==0` → 'Noch zu früh für Hochrechnung'. Sparse → number + grey '(Schätzung)' caption. `<5 valid days` → 'Nicht genug Daten'. Limitation is part of primary content. | ✓ |
| Small badge next to the number | Always show projection + 'Hoch/Medium/Niedrig' badge. Risks confident-looking numbers next to a 'low' badge. | |
| Tiny footer caption per block | Number normal, 2-line grey caption at bottom of HeuteBlock. Users miss the caveat on glance. | |

**User's choice:** Inline replacement
**Notes:** Users should never see a big confident-looking number next to a 'low confidence' badge — this is exactly the cognitive dissonance the v1 −85% bug created.

---

## Basket block clarity

| Option | Description | Selected |
|--------|-------------|----------|
| Plain-language primary + metrics in caption (Recommended) | 'X + Y' title + '64% der X-Käufer kauften auch Y' subtitle + 'Support 8% · Konfidenz 64% · Lift 3,2×' small caption. Mode shown as small header. AOV uses bands layout. | ✓ |
| Full technical trio upfront | 'Support 8% · Konfidenz 64% · Lift 3,2×' as primary subtitle. Reads as 'for the analyst' not the merchant. | |
| Simplified single metric + tooltip | Only confidence + 'So oft zusammen'. Tooltips in sandboxed iframes fiddly. | |

**User's choice:** Plain-language primary + metrics in caption
**Notes:** The merchant is the reader — plain language lands the insight in <1 second; full trio stays visible in small caption for the analyst eye.

---

## Error/retry UX per block

| Option | Description | Selected |
|--------|-------------|----------|
| Literal spec: 'Daten nicht verfügbar' skeleton (Recommended) | Skeleton card + 'Daten nicht verfügbar' + 'Bitte Seite neu laden'. No retry button. First-load and error skeletons share the same component. | ✓ |
| Skeleton + per-block retry button | 'Erneut versuchen' fires `callTool({name:'daily_briefing'})` again — thrashes other blocks' state. | |
| Skeleton + 'Kontaktieren Sie KAMANIN' CTA | Most errors are transient upstream WP ability timeouts, not cases needing human contact. | |

**User's choice:** Literal spec: 'Daten nicht verfügbar' skeleton
**Notes:** Widget does not own retry semantics. WIDG-QA-03 literal wording honored. Shared skeleton component keeps code + styling minimal.

---

## Testing depth

| Option | Description | Selected |
|--------|-------------|----------|
| Formatters + fixture parser + block snapshots (Recommended) | de-DE formatter tests + fixture payload validation + ~10 block snapshots covering healthy + error + 3 basket modes. No interaction tests, no Playwright. | ✓ |
| Formatters + fixture parser only | Minimum. Skips snapshots; harder to catch mode-switching regressions. | |
| Snapshots + interaction tests (period toggle, error-block retry) | Adds RTL interaction with mocked `app.callTool`. Scope creep risk against 2-day milestone. | |
| Snapshots + Playwright visual against dev-host.html | Strongest coverage but mcp-poc has no Playwright; visual baselines fragile to Motion timing. | |

**User's choice:** Formatters + fixture parser + block snapshots
**Notes:** Snapshot tests lock in de-DE formatting + mode-switching branch coverage without the cost of full interaction test scaffolding. Period toggle verified via manual dev-harness UAT.

---

## Claude's Discretion

- Exact stagger timing (60/80/100 ms), count-up duration (400/600/800 ms)
- Heatmap 5-step colour scale implementation (Tailwind opacity stepping vs HSL interpolation; `color-mix(in oklch, ...)` recommended)
- Skeleton shimmer implementation (CSS animation vs Motion tween)
- Attention-list row styling adaptations
- HeatmapBlock internal state shape (`useState` vs `useReducer`)
- `BlockSkeleton` shape: one component with variant prop vs two components
- Per-fixture JSON shape for `?mock=*` (against the `BriefingPayload` schema)
- `useCountUp` location (local to daily-briefing vs widgets/shared)

## Deferred Ideas

- Monday briefing email Edge Function (Phase 20)
- MBM production rollout (future milestone)
- Klaviyo integration (v3.1+)
- Per-user preferences / saved period
- Period toggle for blocks other than heatmap (no server parameter)
- Chart library adoption (re-eval only if future blocks need interaction)
- Per-block retry button
- Playwright visual regression
- Interaction tests for period toggle
- Full-contract test for widget↔server `BriefingPayload` duplication
- Production dark-mode skin (portal has no dark-mode toggle yet)
