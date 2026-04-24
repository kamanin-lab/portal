# Revenue Intelligence V2 — Pre-Code Planning

> Status: Planning | Priority: High | Target: 2 days post-approval
> Sibling docs: `docs/ideas/WP_BRIDGE_ARCHITECTURE.md` (data layer),
> `docs/ideas/MCP_UI_RESOURCE_BUILD_PIPELINE.md` (widget build pipeline),
> `docs/ideas/LOCAL_DEV_SETUP.md` (DDEV + WSL setup)

---

## 1. Goal

The current Revenue Intelligence module delivers a single `daily_briefing` widget that reports today's gross revenue against yesterday's full-day total. The core UX failure: at 10:00 on a normal trading day the widget reads approximately -85% because it compares 3 hours of today against 24 hours of yesterday. This is not an edge case — it is the default view every morning. A merchant opens the portal and sees "catastrophe" when trade is actually fine. The comparison is methodologically wrong and erodes trust in the module within days of first use.

V2 replaces this with four blocks that provide genuine insight unavailable in wp-admin. The goal is not "WooCommerce statistics in a nicer frame" — it is prospective intelligence: where the day is headed right now, when customers actually buy, whether repeat behaviour is growing, and what products are bought together. None of these four questions can be answered without leaving wp-admin. V2 answers all of them in under two seconds. MBM (Matzinger Bettenmöbel) is the first client. Summerfield joins as soon as their DDEV environment is available for cloning. Data layer moves from WC REST direct to the WordPress Abilities API + MCP Adapter — see `WP_BRIDGE_ARCHITECTURE.md` for plugin architecture. Widget build uses a manual Vite pipeline — see `MCP_UI_RESOURCE_BUILD_PIPELINE.md`.

---

## 2. Scope

**IN scope:**
- Block 1: Heute mit Run-Rate Projection (fixes the today-vs-yesterday bug)
- Block 2: Heatmap 7×24 (order density by day-of-week × hour, 8-week default)
- Block 3: Repeat Metrics (repeat purchase rate + median days to 2nd order, 90-day window)
- Block 4: Market Basket or AOV Bands (probe-first decision — see §3.4)
- Monday 08:00 Europe/Berlin weekly briefing email to Nadine (MBM owner)
- MCP proxy whitelist update (`supabase/functions/mcp-proxy/index.ts` lines 141–146)
- New MCP tool registrations in upstream MCP server (`G:/01_OPUS/Projects/mcp-poc`)
- WordPress Abilities API registration for new data endpoints (detailed in `WP_BRIDGE_ARCHITECTURE.md`)

**OUT of scope (Phase 2+):**
- Klaviyo integration — placeholder `docs/ideas/klaviyo-integration.md`
- Stock velocity — MBM does not track stock levels in WooCommerce
- Cohort retention curves — requires 12+ months baseline; 90-day repeat rate is V2 ceiling
- LTV predictive models — Phase 3+
- Traffic source attribution — requires GA4 MCP integration
- Admin opt-out toggle per profile for email — only one recipient in V2
- Summerfield client onboarding — dependent on DDEV clone, separate task
- Claude Desktop / ChatGPT rendering — Phase 2+ cross-client architecture

**Timeline:** 2 focused working days post-approval. Parallelizable: widget HTML can be built against mocked ability responses while WP abilities are in development on Day 1.

---

## 3. The 4 Blocks

### 3.1 Block 1 — Heute mit Run-Rate Projection

**Purpose:** Replace the today-vs-yesterday comparison that always reads -85% at 10:00. Show where the day is heading.

**Layout wireframe:**
```
┌─────────────────────────────────────────────┐
│  Heute                              10:42   │
│                                             │
│  Bisher         1.240 €                     │
│  Hochrechnung ▶  4.280 €  bis 23:59         │
│                 Bei aktuellem Tempo         │
│                                             │
│  vs. Ø gleiche Stunde letzte 7 Tage  +18%   │
│  Gleiche Stunde letzte Woche         980 €  │
│                                             │
│  Klarna ████░░  42%   PayPal ██░░  31%      │
│  Stripe ██░░░   27%                         │
└─────────────────────────────────────────────┘
```

**KPI hierarchy:**
- Primary: projected full-day revenue ("Hochrechnung: 4.280 € bis 23:59")
- Secondary: pace vs trailing-7-day average at same hour (+18% or -5%), coloured indicator
- Tertiary: same hour last week as plain reference (small text)
- Payment-method mini-split: Klarna / PayPal / Stripe — reused from existing payload

**Run-rate algorithm — precise specification:**

1. Fetch all paid orders from `wp_wc_order_stats` for the last 14 calendar days (statuses `wc-completed`, `wc-processing`)
2. For each historical day `d`, compute `cumulative_revenue_at_hour[d][h]` = sum of order totals where `HOUR(date_created) <= h` in store timezone
3. For each hour `h`, compute `expected_by_hour[h]` = average of `cumulative_revenue_at_hour[d][h]` across valid days in window
4. `actual_now` = today's paid revenue so far
5. `h_now` = current hour in store timezone
6. `projection = actual_now / expected_by_hour[h_now] * expected_by_hour[23]`
7. `pace_vs_7day = actual_now / avg_same_hour_last_7_days - 1`

**Edge cases:**
- `h_now == 0`: skip projection; display "Noch zu früh für Hochrechnung"
- `expected_by_hour[h_now] < 5.0 €`: fall back to 7-day ratio instead of 14-day curve; add "(Schätzung)" label; confidence = medium
- Days with zero revenue in baseline: exclude from average; if < 5 valid baseline days remain, disable projection entirely; confidence = low
- Weekend vs weekday bias: 14-day mixed window acceptable for V2; optionally segment in V3
- MBM volume estimate: ~12–18 paid orders/day → 14 days yields ~170–250 data points, adequate for stable hourly averages after 9:00 peak hours

**WooCommerce native gap:** Overview report shows today's total only, no intra-day curve, no projection capability.

**Wow-factor:** Prospective not retrospective. Comparison window always identical (same elapsed hours today vs same elapsed hours historically), so indicator is meaningful at any time of day.

---

### 3.2 Block 2 — Heatmap 7×24

**Purpose:** Show when customers actually buy, in a format that directly drives paid Ad scheduling and email send-time decisions.

**Layout wireframe:**
```
┌─────────────────────────────────────────────────────────────────────┐
│  Bestellmuster — letzte 8 Wochen                                    │
│  Für bezahlte Ads und E-Mail-Versand                                │
│                                                                     │
│     0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23
│  Mo ·  ·  ·  ·  ·  ·  ·  ░  ░  ▒  ▒  ▒  ▓  ▒  ▒  ▒  ░  ░  ▒  ▒  ▒  ▓  ░  ·
│  Di ·  ·  ·  ·  ·  ·  ·  ·  ░  ░  ▒  ▒  ▒  ▒  ▒  ▒  ░  ░  ▒  ▒  ▓  ▒  ·  ·
│  Mi ·  ·  ·  ·  ·  ·  ·  ░  ░  ▒  ▒  ▒  ▒  ▒  ▓  ▒  ░  ░  ▒  ▒  ▒  ░  ·  ·
│  Do ·  ·  ·  ·  ·  ·  ·  ░  ░  ▒  ▒  ▒  ▒  ▒  ▒  ▒  ░  ░  ▒  ▒  ██ ▓  ░  ·
│  Fr ·  ·  ·  ·  ·  ·  ·  ·  ░  ░  ▒  ▒  ▒  ▒  ▒  ▒  ░  ░  ▓  ▒  ▒  ▒  ·  ·
│  Sa ·  ·  ·  ·  ·  ·  ·  ·  ·  ░  ░  ░  ▒  ▒  ▒  ▒  ▒  ▒  ▒  ▓  ▒  ░  ·  ·
│  So ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ░  ░  ▒  ▒  ▒  ▒  ▒  ▓  ▒  ▒  ░  ·  ·  ·
│                                                                     │
│  ██ Ihr bester Slot: Do 20:00 (Ø 3,2 Bestellungen)                  │
│  Ruhigster Slot mit Bestellungen: So 10:00                          │
│                                                                     │
│  [4 Wochen]  [8 Wochen ✓]  [12 Wochen]                              │
└─────────────────────────────────────────────────────────────────────┘
```

**Data source:** `wp_wc_order_stats` (HPOS), `GROUP BY DAYOFWEEK(date_created), HOUR(date_created)` in store timezone. Count paid orders only (statuses `wc-completed`, `wc-processing`). Store timezone from `wp_options`.

**Parameters:** Tool arg `{ weeks?: 4 | 8 | 12 }`. Default `weeks=8`. Portal page sends no explicit arg — server-side default applied.

**Highlights surfaced in widget:**
- Brightest cell: "Ihr bester Slot: [Wochentag] [HH]:00 (Ø X,X Bestellungen)"
- Dimmest cell with any orders: shown as secondary note
- Colour scale: 5 steps — no orders = background, 1 = lightest fill, top decile = darkest. HTML rendered as coloured `<td>` or SVG rect, not canvas.

**Period toggle:** User switches 4w / 8w / 12w inside widget. Each switch fires `callTool({ name: 'weekly_heatmap', arguments: { weeks: N } })` via AppBridge.

**Interpretation hint:** "Nutzen Sie diese Daten für Ihre bezahlten Werbeanzeigen und E-Mail-Versand-Zeiten."

**WooCommerce native gap:** No native wp-admin report crosses day-of-week × hour. Daily and hourly breakdowns exist independently but never as a matrix.

**Wow-factor:** A furniture store discovering Thursday 20:00 is their best slot can immediately adjust Meta Ads scheduling and Klaviyo campaign send times. Decision-quality insight, not reporting metric.

---

### 3.3 Block 3 — Repeat Metrics

**Purpose:** The single most important cohort health signal for any e-commerce store. Not computable in wp-admin as an aggregate.

**Layout wireframe:**
```
┌─────────────────────────────────────────────┐
│  Wiederkäufer — letzte 90 Tage              │
│                                             │
│  Wiederkaufrate        31%       ↑ +4 PP    │
│                                             │
│  Branchen-Benchmark    ~27%                 │
│  (Shopify B2C, 2024)                        │
│                                             │
│  Ø Tage bis 2. Kauf    38 Tage              │
│                                             │
│  Basis: 1.340 Bestellungen in 90 Tagen      │
└─────────────────────────────────────────────┘
```

**Definitions:**
- Repeat purchase rate: `COUNT(customers_with_2plus_orders) / COUNT(all_customers)` in trailing 90 days. Customer identity = `billing_email`.
- Median days to 2nd order: median of `(date_2nd_order - date_1st_order)` in integer days.
- Trend: vs prior 90-day window (days 91–180 ago). Delta in percentage points.
- Window: rolling 90 days.

**Benchmark:** Shopify B2C stores average ~27% repeat purchase rate within 90 days (Shopify Commerce Trends 2024: https://www.shopify.com/research/future-of-commerce; Peel Insights: https://www.peelinsights.com/ecommerce-analytics-explained/repeat-orders-rate-per-cohort). Furniture typically skews lower (~18–22%). MBM outperforming this benchmark would be a genuine signal.

**Data source:** HPOS tables grouped by `billing_email`, filtered to paid statuses, trailing 90 days. All computation in `kmn/repeat-metrics` ability.

**Data sufficiency:** ~1300–1600 orders in 90 days at MBM volume. Sufficient for stable aggregate rate. Individual customer cohort curves would require 12+ months (out of scope).

**WooCommerce native gap:** Customers report shows per-customer order count in a table but no aggregate repeat rate is ever computed or surfaced.

**Wow-factor:** MBM may discover that 31% of customers return within 90 days for accessories, replacement items, or second bedrooms — a signal that post-purchase email campaigns would have measurable ROI. wp-admin cannot tell them this number exists.

---

### 3.4 Block 4 — Market Basket or AOV Bands (probe-first)

**Purpose:** Cross-sell intelligence (if basket data supports it) or revenue distribution insight (AOV bands fallback).

#### Probe-first protocol

Before any implementation work on Block 4, run this one-off SQL against MBM's live WooCommerce database:

```sql
SELECT COUNT(*) AS multi_item_orders
FROM   wp_wc_order_stats s
WHERE  s.date_created >= NOW() - INTERVAL 90 DAY
  AND  s.status IN ('wc-completed', 'wc-processing')
  AND (
    SELECT COUNT(*)
    FROM   wp_wc_order_product_lookup p
    WHERE  p.order_id = s.order_id
  ) > 1;
```

**Decision thresholds:**

| Result | Mode selected | Rationale |
|--------|--------------|-----------|
| ≥ 100 multi-item orders | Market Basket — product level | Enough support for product-pair statistics |
| 30–99 multi-item orders | Market Basket — category level | Product-level too sparse; category pairs have acceptable support |
| < 30 multi-item orders | AOV Bands fallback | Basket analysis meaningless at this volume |

Given MBM's furniture profile (single-item basket bias), the 30–99 or < 30 outcome is likely. Plan AOV Bands as default implementation; treat Market Basket as upside.

#### Market Basket mode — product level

```
┌─────────────────────────────────────────────┐
│  Häufig zusammen gekauft                    │
│                                             │
│  Boxspringbett Luxe + Lattenrost Premium    │
│  Support: 8%  Konfidenz: 64%  Lift: 3,2×    │
│                                             │
│  Schlafsofa Comfort + Kissen Set Beige      │
│  Support: 5%  Konfidenz: 51%  Lift: 2,7×    │
│                                             │
│  Bettgestell Nordic + Matratze Comfort      │
│  Support: 4%  Konfidenz: 48%  Lift: 2,4×    │
│                                             │
│  Basis: letzte 90 Tage                      │
└─────────────────────────────────────────────┘
```

**Algorithm:** Pairwise co-occurrence from `wp_wc_order_product_lookup` joined on `order_id`. For each pair (A, B):
- Support = `orders_containing_both / total_paid_orders`
- Confidence = `orders_containing_both / orders_containing_A`
- Lift = `confidence / frequency_of_B`

Score by `support × confidence × lift`. Return top 3–5 pairs by score descending.

#### Market Basket mode — category level

Same algorithm applied after mapping each product to its primary WooCommerce category via `wp_term_relationships` → `wp_term_taxonomy` → `wp_terms`. Pair categories instead of products. Reduces sparsity significantly.

#### AOV Bands fallback

```
┌─────────────────────────────────────────────┐
│  Bestellwert-Verteilung — letzte 90 Tage    │
│                                             │
│  < 500 €     ████░░░░░  22%  (14% Umsatz)   │
│  500–1.500 € ████████░  61%  (56% Umsatz)   │
│  > 1.500 €   ████░░░░░  17%  (30% Umsatz)   │
│                                             │
│  Ø Bestellwert        847 €                 │
│  Median Bestellwert   680 €                 │
└─────────────────────────────────────────────┘
```

Furniture-appropriate buckets: < 500 €, 500–1.500 €, > 1.500 €. Show share of order count AND share of revenue per band separately. The gap (17% of orders = 30% of revenue in top band) is itself decision-quality insight.

Ability name is `kmn/market-basket` regardless of active mode. Mode embedded in response: `{ mode: "market_basket_product" | "market_basket_category" | "aov_bands", ...data }`. Widget renders conditionally.

**WooCommerce native gap:** No co-purchase analysis in any native wp-admin report. AOV is a single number in Overview — no distribution, no band breakdown.

**Wow-factor:** Market basket reveals cross-sell opportunities impossible in wp-admin. AOV bands show where high-value customers concentrate — pricing strategy input unavailable natively.

---

## 4. Monday Weekly Briefing Email (Nadine)

**Recipient:** Nadine (MBM owner). Single recipient for V2. No per-profile admin toggle.

**Schedule:** Every Monday 08:00 Europe/Berlin. Edge Function cron via Supabase pg_cron — schedule at 06:00 UTC (safe before 08:00 Berlin in both summer/winter), guard Berlin tz check inside function.

**Implementation:** New Edge Function `send-weekly-revenue-briefing` (separate from `send-reminders` — isolates regression risk). Calls `kmn/weekly-briefing-data` ability (single combined call), composes HTML, sends via Mailjet using existing `send-mailjet-email` infrastructure.

**Email wireframe:**
```
┌────────────────────────────────────────────────────────┐
│  [KAMANIN Logo]                                        │
│                                                        │
│  Guten Morgen, Nadine —                                │
│  Ihr Wochenbericht: [Montag, 28. April 2026]           │
│                                                        │
│  ────────────────────────────────────────────          │
│  LETZTE WOCHE (21.–27. April)                          │
│                                                        │
│  Umsatz gesamt     12.480 €   ↑ +12% vs. Vorwoche      │
│  Bestellungen      87         ↑ +7 vs. Vorwoche        │
│  Ø Bestellwert     143 €                               │
│                                                        │
│  ────────────────────────────────────────────          │
│  BESTER ZEITSLOT LETZTE WOCHE                          │
│                                                        │
│  Donnerstag 20:00 — 6 Bestellungen                     │
│                                                        │
│  ────────────────────────────────────────────          │
│  WIEDERKÄUFER (letzte 90 Tage)                         │
│                                                        │
│  31% Ihrer Kunden kauften ein zweites Mal              │
│  Trend: ↑ +4 PP gegenüber Vorquartal                   │
│                                                        │
│  ────────────────────────────────────────────          │
│  TOP 3 PRODUKTE LETZTE WOCHE                           │
│                                                        │
│  1. Boxspringbett Luxe King    18 verkauft             │
│  2. Matratze Comfort 160×200   14 verkauft             │
│  3. Lattenrost Premium         11 verkauft             │
│                                                        │
│  [Zum Dashboard →]  (link → staging.portal.kamanin.at) │
│                                                        │
│  ────────────────────────────────────────────          │
│  KAMANIN IT Solutions · Salzburg                       │
└────────────────────────────────────────────────────────┘
```

**Content from `kmn/weekly-briefing-data` single call:**
- Last week revenue, order count, AOV vs prior week (Mon–Sun)
- Best performing hour slot from last week's heatmap data
- Repeat rate + trend (same 90-day rolling as Block 3)
- Top 3 products by quantity sold last week
- Portal link to Umsatz-Intelligenz page

Ability fans out to individual sub-queries internally. Edge Function makes exactly one HTTP request to WP bridge, receives unified payload, formats HTML, sends.

---

## 5. MCP Tool Inventory After V2

| Tool | Action | Notes |
|------|--------|-------|
| `daily_briefing` | Keep — refactor internally | Widget upgraded to 4-block layout; tool signature unchanged (`{}` args); data fetched from WP bridge via `Promise.allSettled` fan-out |
| `revenue_today` | Keep unchanged | Raw today total endpoint |
| `payment_attention_orders` | Keep unchanged | Orders needing payment attention |
| `revenue_run_rate` | Add new | Intra-day projection + pace vs 7-day avg; internal call from daily_briefing |
| `weekly_heatmap` | Add new | 7×24 matrix; arg `{ weeks?: 4 \| 8 \| 12 }` |
| `repeat_metrics` | Add new | Repeat rate, median days, trend |
| `market_basket_or_aov` | Add new | Probe-determined mode |
| `weekly_briefing_data` | Add new | Monday email payload |
| `incomplete_orders` | Remove from whitelist | Low signal; overlaps with `payment_attention_orders` |
| `stuck_orders` | Do not add | Never in whitelist — keep out |
| `low_stock_products` | Do not add | MBM doesn't track stock |

**PORTAL whitelist change** — `supabase/functions/mcp-proxy/index.ts` lines 141–146:

Replace with:
```typescript
const ALLOWED_TOOLS = new Set([
  "daily_briefing",
  "revenue_today",
  "payment_attention_orders",
  "revenue_run_rate",
  "weekly_heatmap",
  "repeat_metrics",
  "market_basket_or_aov",
  "weekly_briefing_data",
]);
```

---

## 6. Dashboard Composition

**Widget strategy: single widget, single tool call.**

`daily_briefing` tool upgraded to return all 4 blocks' data in one call. Widget HTML Resource (`ui://widgets/daily-briefing.html`) rebuilt to render all 4 blocks.

Alternatives rejected:
- One widget per block (4 AppRenderer instances): 4× mcp-proxy round-trips, 4× JWT auth gates, complex layout coordination.
- Separate route per block: violates PORTAL architecture rule 10 (Task detail is a Sheet, no separate routes).

**`RevenueIntelligencePage.tsx` requires zero code changes.** `TOOL_NAME = 'daily_briefing'` and `TOOL_RESOURCE_URI` stay identical. V2 widget is drop-in replacement.

**Loading strategy inside MCP server `daily_briefing` handler:**
```
const [runRate, heatmap, repeat, basket] = await Promise.allSettled([
  fetchRunRate(wpBridgeClient, { timezone }),
  fetchHeatmap(wpBridgeClient, { weeks: 8 }),
  fetchRepeatMetrics(wpBridgeClient),
  fetchMarketBasketOrAov(wpBridgeClient),
])
```
Target total latency: < 2s. Each ability < 500ms at MBM volume. If one `Promise.allSettled` rejects, include `{ status: "error" }` for that block — widget renders per-block skeleton rather than failing whole widget.

**Error handling chain:**
1. Per-ability: `Promise.allSettled` — partial failure renders block skeleton
2. Full tool failure: MCP server returns `isError: true`
3. Widget-level: `McpErrorBoundary` catches AppRenderer throws
4. Page-level: toast via existing `handleError` in `RevenueIntelligencePage.tsx:86`

---

## 7. Data Sufficiency Verdict

| Block | Required data | Available at MBM | Verdict | Mitigation |
|-------|--------------|-----------------|---------|------------|
| Run-Rate Projection | 14-day hourly curve (~170–250 orders) | ~180–250 paid orders / 14d | Sufficient | Fallback to 28-day curve if <5 valid days; suppress in first hour |
| Heatmap 7×24 at 4w | ~0.3 orders/cell avg | Many empty cells | Marginal | 8w default; 4w labelled "weniger zuverlässig" |
| Heatmap 7×24 at 8w | ~0.6 orders/cell avg | Pattern visible with minor gaps | Sufficient | Empty cells render as grey |
| Repeat Metrics (90d) | ≥500 orders in 90d | ~1300–1600 orders | Sufficient | None |
| Market Basket (product) | ≥100 multi-item orders in 90d | Unknown — probe required | Unknown | Probe is Day 1 step; AOV fallback ready |
| Market Basket (category) | ≥30 multi-item orders in 90d | Likely achievable | Marginal | Category pairs 10–20× less sparse than products |
| AOV Bands | Any paid orders | ~1300–1600 | Sufficient | Always available |

---

## 8. Implementation Sequence (2 Days)

### Day 1

- [ ] **Morning (~3h) — WP bridge bootstrap + `revenue_run_rate` ability**
  - Install abilities + MCP Adapter on DDEV; verify `composer.json` version pinned (ref `WP_BRIDGE_ARCHITECTURE.md`)
  - Verify HPOS table names on DDEV: `wp_wc_order_stats`, `wp_wc_order_product_lookup` — check column names match schema
  - Register `kmn/revenue-run-rate`: queries `wp_wc_order_stats`, computes 14-day hourly cumulative curve
  - Implement and test edge cases: h=0, sparse days, fallback to 7-day ratio
  - Run probe SQL for Block 4 (5 minutes): record result, make mode decision

- [ ] **Afternoon (~4h) — `weekly_heatmap` + `repeat_metrics` abilities**
  - Register `kmn/weekly-heatmap`: `GROUP BY DAYOFWEEK, HOUR` in store tz, `weeks` param
  - Register `kmn/repeat-metrics`: group by `billing_email`, compute rate + median days
  - Test both against MBM DDEV data; confirm 8-week heatmap has visible pattern density
  - Start widget HTML skeleton in parallel (can run against mocked JSON from now)

- [ ] **Evening (~2h) — Block 4 ability + `weekly_briefing_data`**
  - Based on morning probe: implement `kmn/market-basket` (product/category/aov_bands mode)
  - Register `kmn/weekly-briefing-data`: internal fan-out + last-week summary + top-3 products

### Day 2

- [ ] **Morning (~3h) — MCP server new tools (G:/01_OPUS/Projects/mcp-poc)**
  - Add tools: `revenue_run_rate`, `weekly_heatmap`, `repeat_metrics`, `market_basket_or_aov`, `weekly_briefing_data`
  - Each tool calls corresponding WP bridge ability, validates response, returns `CallToolResult`
  - Upgrade `daily_briefing` handler: `Promise.allSettled` fan-out; assemble `{ blocks: { run_rate, heatmap, repeat, basket } }`
  - Update `PORTAL/supabase/functions/mcp-proxy/index.ts` ALLOWED_TOOLS per §5
  - Deploy updated MCP server to Vercel staging

- [ ] **Afternoon (~4h) — Widget Vite build + 4-block dashboard HTML**
  - Follow `MCP_UI_RESOURCE_BUILD_PIPELINE.md` for Vite setup
  - Build `daily-briefing.html`: 4 blocks from unified response; per-block skeleton for errors; Block 4 mode switch
  - Test locally against mocked `daily_briefing` response
  - Test against live MCP server on Vercel staging
  - Deploy widget as MCP UI Resource

- [ ] **Evening (~2h) — Monday email Edge Function + Mailjet + test**
  - Create `supabase/functions/send-weekly-revenue-briefing/index.ts`
  - Cron: 06:00 UTC Monday, Berlin tz guard inside function
  - Call `kmn/weekly-briefing-data`, compose HTML (§4 wireframe), send via Mailjet
  - Manual invocation test on staging; verify Mailjet delivery

**Parallelizable from Day 1 afternoon:** Widget HTML built/styled against mocked ability JSON while WP abilities in development. Rendering logic needs only response schema, not live data.

---

## 9. Risks

- **Market basket <30 multi-item orders.** Mitigated by probe-first protocol (5-min SQL on Day 1 morning before Block 4 implementation). AOV Bands fully specified; implementable without rework.

- **DDEV Summerfield clone delays.** Implement and validate entirely against MBM DDEV. Summerfield onboarding adds ~1 day after DDEV ready. Doesn't block V2 delivery for MBM.

- **HPOS column names differ from docs.** Standard WC 7.1+ names. Older HPOS migrations may alias. Day 1 morning verification step. If differ: 1h PHP alias fix.

- **MCP Adapter 0.x breaking changes.** Pre-1.0; patch releases have broken interfaces. Pin exact version in `composer.json`. Record pinned version in `WP_BRIDGE_ARCHITECTURE.md`.

- **Intra-day curve noisy at low hourly volumes.** Off-peak hours (01:00–08:00) may show 0–1 orders. Mitigated by (a) 5 valid-day minimum, (b) fallback to 7-day ratio when `expected_by_hour[h] < 5.0`, (c) "Schätzung" label. Residual: very early morning may show noisy projection — acceptable, dashboard not monitored at 03:00.

- **Cron timezone drift (Monday email).** Europe/Berlin switches UTC offset seasonally. Do not hardcode offset. Schedule 06:00 UTC (safe), Berlin tz guard inside function. Use `AT TIME ZONE 'Europe/Berlin'` in pg_cron.

- **Regression to `send-reminders` if email merged there.** Implement as separate Edge Function `send-weekly-revenue-briefing` to eliminate risk.

---

## 10. Success Criteria

- **Bug fix verified:** Load dashboard at 09:00, 11:00, 14:00, 17:00. Block 1 pace indicator never universally negative mid-morning. -85% case not reproducible at any time of day.
- **Performance:** All 4 blocks render under 2s from page load — measured from `daily_briefing` tool call to `onSizeChanged` firing in `RevenueIntelligencePage.tsx:115-117`.
- **Monday email reliability:** 4 consecutive weekly emails arrive at 08:00 ±5 min Berlin, zero duplicates, starting from launch week.
- **Qualitative review:** Yuri reviews Block 2 (heatmap) on live MBM data within 1 week of launch. Binary "wow/not wow". If "not wow" — document specific failure mode as P1 for V2.1.
- **No regression:** `RevenueIntelligencePage.tsx` has zero TypeScript diff after V2 deployment. Existing widget loads without errors during transition window.

---

## 11. What We Are NOT Building

Explicit and final for V2. Proposals to add these during implementation should be declined — open `docs/ideas/` file instead.

- **Klaviyo integration.** Phase 2. Requires per-client OAuth setup. Placeholder: `docs/ideas/klaviyo-integration.md`.
- **Stock velocity.** MBM doesn't track stock. Building analysis for untracked stock produces noise.
- **Cohort retention curves.** Require 12+ months. 90-day repeat rate is V2 ceiling.
- **LTV predictive models.** Need Klaviyo + attribution + 18+ months. Phase 3+.
- **Traffic source attribution.** Requires GA4 MCP integration. Separate future module.
- **Admin opt-out toggle for email.** One recipient in V2. Build UI when multiple subscribers exist.
- **Summerfield client onboarding.** Dependent on DDEV clone. MBM only in V2.
- **Claude Desktop / ChatGPT rendering.** Widget targets portal.kamanin.at embedding. Cross-client = Phase 2+.

---

*Last updated: 2026-04-23*
