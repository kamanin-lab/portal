# Milestone v3.0: MCP Apps Platform — Requirements

**Created:** 2026-04-23
**Branch:** `staging` (then merge to `main` when ready)
**Target client for first app:** Summerfield (local DDEV only; MBM rollout = future milestone)
**Pre-code research:** `docs/ideas/` — WP_BRIDGE_ARCHITECTURE.md, REVENUE_INTELLIGENCE_V2_PLAN.md, MCP_UI_RESOURCE_BUILD_PIPELINE.md, LOCAL_DEV_SETUP.md, SEEDER_SPEC.md

---

## Platform Layer (MCPAPP-*)

Reusable infrastructure shared by all future MCP Apps in the portal.

### Build Pipeline (MCPAPP-BUILD)

- [ ] **MCPAPP-BUILD-01**: Vite single-file build configured in `mcp-poc/widgets/*/vite.config.ts` using `vite-plugin-singlefile` with `removeViteModuleLoader: true`, `assetsInlineLimit: 100_000_000`, `cssCodeSplit: false`, `inlineDynamicImports: true`
- [ ] **MCPAPP-BUILD-02**: Tailwind CSS v4 integrated via `@tailwindcss/vite` plugin; JIT purge verified at build time
- [ ] **MCPAPP-BUILD-03**: Motion (`motion/react` v12) available in widget bundles; reduced-motion detection works in sandboxed iframe via matchMedia
- [ ] **MCPAPP-BUILD-04**: React 19 + ReactDOM bundled; size budget ≤ 300 KB gzipped per widget measured via build output
- [ ] **MCPAPP-BUILD-05**: Preact/compat fallback documented and tested — if widget exceeds 300 KB, swap via Vite alias drops to ~50 KB gz
- [ ] **MCPAPP-BUILD-06**: Widget dev server (`npm run dev`) runs standalone at `http://localhost:5174/` with mock-host harness providing fake tokens and fake tool result; HMR works
- [ ] **MCPAPP-BUILD-07**: Vercel build pipeline for mcp-poc includes widget build step; single `npm run build` at repo root produces both server and all widgets

### Token Bridge (MCPAPP-TOKEN)

- [ ] **MCPAPP-TOKEN-01**: Widget posts `{ type: 'kmn/theme/request', protocolVersion: 1 }` to `window.parent` on mount
- [ ] **MCPAPP-TOKEN-02**: Portal `public/sandbox-proxy.html` relays `kmn/theme/*` messages bidirectionally without interpretation
- [ ] **MCPAPP-TOKEN-03**: Portal responds via `RevenueIntelligencePage.tsx` (or a shared hook) with `{ type: 'kmn/theme/set', protocolVersion: 1, tokens: {...} }` carrying the 12 curated tokens (bg, surface, fg, muted, subtle, accent, success, danger, warning, border, radius-md, radius-lg)
- [ ] **MCPAPP-TOKEN-04**: Widget applies tokens via `document.documentElement.style.setProperty(k, v)` for each received token
- [ ] **MCPAPP-TOKEN-05**: Widget falls back to bundled defaults if no reply within 300ms (works standalone in dev and in any future non-portal MCP host)
- [ ] **MCPAPP-TOKEN-06**: Portal's theme-relay handler (in `RevenueIntelligencePage.tsx`) persists beyond first handshake — future theme toggles (e.g. dark mode) re-emit `kmn/theme/set` which widgets re-apply
- [ ] **MCPAPP-TOKEN-07**: `src/shared/styles/widget-tokens.ts` TypeScript module mirrors 12-token subset of `tokens.css`; exports typed constant for host-side use
- [ ] **MCPAPP-TOKEN-08**: Protocol version handling: host/widget with higher protocolVersion MUST ignore and log; widget falls back to defaults

### WordPress Companion Plugin Pattern (MCPAPP-WP)

- [x] **MCPAPP-WP-01**: Plugin template pattern documented in `docs/ideas/WP_BRIDGE_ARCHITECTURE.md` (referenceable for future client-data bridges)
- [x] **MCPAPP-WP-02**: MCP Adapter v0.5.0 integration pattern: composer-managed, `mcp_adapter_init` hook, separate `server-id` per plugin (no shared namespace)
- [x] **MCPAPP-WP-03**: WordPress Application Password auth pattern with rotation runbook in `docs/DECISIONS.md`

---

## WordPress Companion Plugin: kmn-revenue-abilities (ABIL-*)

First production usage of the MCPAPP-WP pattern. Lives at `PORTAL/wordpress-plugins/kmn-revenue-abilities/`.

### Plugin Scaffold (ABIL-SCAF)

- [x] **ABIL-SCAF-01**: Plugin main file `kmn-revenue-abilities.php` with plugin header, WP 6.9+ version guard (deactivate with admin notice if lower), WC dependency check
- [x] **ABIL-SCAF-02**: `composer.json` declaring `wordpress/mcp-adapter:^0.5.0`; `vendor/` committed with plugin
- [x] **ABIL-SCAF-03**: Bootstrap file `bootstrap/register-mcp-server.php` hooks `mcp_adapter_init`, calls `$adapter->create_server(server_id: 'kmn-revenue', rest_namespace: 'mcp', rest_route: 'kmn-revenue', ...)` — exposes endpoint at `/wp-json/mcp/kmn-revenue`
- [x] **ABIL-SCAF-04**: Shared helpers: `includes/sql-helpers.php` (date-range builders, numeric UTC offset resolver), `includes/cache.php` (transient key builder, TTL wrappers, invalidation on `woocommerce_order_status_changed`)
- [x] **ABIL-SCAF-05**: `readme.md` with setup instructions (DDEV symlink, Application Password generation, required WP/WC versions)

### Abilities (ABIL-DEF)

Each ability: registered via `wp_register_ability('kmn/{name}', ...)` with `manage_woocommerce` permission_callback, input/output JSON Schema per `WP_BRIDGE_ARCHITECTURE.md` §4.

- [ ] **ABIL-DEF-01**: `kmn/revenue-run-rate` — intra-day projection from 14-day hourly cumulative curve + pace vs 7-day avg + payment-method split; edge cases handled (h=0, sparse days <5 valid, fallback to 7-day ratio when `expected_by_hour[h] < 5.0`); confidence field returns high/medium/low
- [ ] **ABIL-DEF-02**: `kmn/weekly-heatmap` — 7×24 order matrix over rolling 8 weeks (tool arg `weeks`: enum [4,8,12,26,52], default 8); buckets include `day_of_week`, `hour_of_day`, `order_count`, `net_revenue`; `best_slot` identified; uses numeric UTC offset from PHP (NOT `CONVERT_TZ` with named tz)
- [ ] **ABIL-DEF-03**: `kmn/repeat-metrics` — repeat purchase rate over trailing 90 days (grouped by `billing_email`), median days to 2nd order, trend delta vs prior 90-day window (in percentage points), benchmark_pct field = 27.0 (Shopify B2C)
- [ ] **ABIL-DEF-04**: `kmn/market-basket` — probe-determined mode: `market_basket_product` if ≥100 multi-item orders in 90d, `market_basket_category` if 30-99, `aov_bands` if <30; AOV bands always computed with custom boundaries arg (default [500, 1500]); returns mode field, basket_pairs (when applicable), aov_bands, avg/median order value
- [ ] **ABIL-DEF-05**: `kmn/weekly-briefing-data` — combined payload for Monday email: last-week revenue summary, best hour slot, repeat metrics, top 3 products by quantity; internal fan-out to other abilities + custom top-products query
- [ ] **ABIL-DEF-06**: All abilities parameterise SQL via `$wpdb->prepare()`; zero raw interpolation of user input
- [ ] **ABIL-DEF-07**: All abilities return cached responses within 15-minute TTL (revenue-run-rate: 5 min — intra-day data changes fast); cache keys documented; cache invalidated on `woocommerce_order_status_changed`

### Plugin Quality Gates (ABIL-QA)

- [ ] **ABIL-QA-01**: Integration test script `scripts/verify-wp-bridge.sh` runs against DDEV, asserts `tools/list` returns 5 tools and each `tools/call` returns schema-correct response shape
- [ ] **ABIL-QA-02**: 401 returned for invalid Application Password; 403 returned for user lacking `manage_woocommerce`
- [ ] **ABIL-QA-03**: Query timeout budget: 2s per ability; `$wpdb->query("SET SESSION MAX_EXECUTION_TIME=2000")` set before heavy queries
- [ ] **ABIL-QA-04**: All 5 abilities verified HPOS-safe against `wp_wc_order_stats`, `wp_wc_order_product_lookup`, `wp_wc_customer_lookup` on DDEV
- [ ] **ABIL-QA-05**: No collision with Maxi AI plugin — `kmn-revenue-abilities` and `maxi-ai` both active on DDEV; `tools/list` on each endpoint returns only own tools

---

## MCP Server Expansion: kamanda-mcp (MCPS-*)

Repo: `G:/01_OPUS/Projects/mcp-poc` (separate from PORTAL). Node.js MCP server.

- [ ] **MCPS-01**: WP bridge client module added in `src/connectors/wp-bridge.ts` (or similar) — wraps `POST /wp-json/mcp/kmn-revenue` with Basic Auth using `WOOCOMMERCE_WP_USER` + `WOOCOMMERCE_WP_APP_PASS` env vars
- [ ] **MCPS-02**: 5 new tools registered: `revenue_run_rate`, `weekly_heatmap`, `repeat_metrics`, `market_basket_or_aov`, `weekly_briefing_data` — each calls corresponding WP ability, validates response, returns `CallToolResult`
- [ ] **MCPS-03**: `daily_briefing` tool handler refactored to `Promise.allSettled` fan-out to 4 abilities (run-rate, heatmap, repeat, basket); per-block error returns `{ status: 'error' }` without failing whole tool
- [ ] **MCPS-04**: `daily_briefing` tool response includes `_meta: { "openai/outputTemplate": "ui://widgets/daily-briefing.html" }` pointing at v2 widget HTML
- [ ] **MCPS-05**: Existing tools unchanged: `revenue_today`, `payment_attention_orders` (keep hitting WC REST API v3)
- [ ] **MCPS-06**: Deprecated tools removed or hidden: `stuck_orders` (already upstream-deprecated), `low_stock_products` (stub)
- [ ] **MCPS-07**: New env vars on mcp-poc: `WOOCOMMERCE_WP_USER`, `WOOCOMMERCE_WP_APP_PASS`, `KMN_BRIDGE_URL` — named distinctly from existing `WP_MCP_USER`/`WP_MCP_APP_PASS` used by `wp-audit.ts` (no credential coupling)

---

## Portal Integration (PORT-*)

Minimal changes to portal codebase. `RevenueIntelligencePage.tsx` explicitly targets **zero TypeScript diff** after V2 deployment.

- [ ] **PORT-01**: `supabase/functions/mcp-proxy/index.ts` ALLOWED_TOOLS (lines 141-146) updated: add `revenue_run_rate`, `weekly_heatmap`, `repeat_metrics`, `market_basket_or_aov`, `weekly_briefing_data`; remove `incomplete_orders`
- [ ] **PORT-02**: `public/sandbox-proxy.html` theme relay block added (forwards messages with `kmn/theme/*` prefix bidirectionally)
- [ ] **PORT-03**: Theme publisher in portal — listens for `kmn/theme/request` messages, responds with 12-token payload from `widget-tokens.ts`; persists across multiple widget mounts
- [ ] **PORT-04**: `RevenueIntelligencePage.tsx` unchanged (zero diff assertion) — v2 widget is drop-in replacement at same `ui://widgets/daily-briefing.html` URI
- [ ] **PORT-05**: `McpErrorBoundary` behaviour verified on v2 widget — catches AppRenderer throws, shows German error with reload button

---

## Revenue Intelligence Widget v2 (WIDG-*)

Built per `MCP_UI_RESOURCE_BUILD_PIPELINE.md`. Located at `mcp-poc/widgets/revenue-intelligence/`.

### Structure (WIDG-STRUCT)

- [ ] **WIDG-STRUCT-01**: Directory scaffold: `src/index.tsx`, `src/App.tsx`, `src/blocks/*`, `src/lib/*`, `src/styles.css`, `index.html`, `vite.config.ts`, `package.json`, `tsconfig.json`
- [ ] **WIDG-STRUCT-02**: `src/lib/host-bridge.ts` exports postMessage request/response helpers and protocol types
- [ ] **WIDG-STRUCT-03**: `src/lib/theme.ts` exports `applyTokens(tokens)` which iterates and sets CSS vars on document root
- [ ] **WIDG-STRUCT-04**: `src/lib/mock-host.ts` provides fake tokens + fake tool result for standalone dev; supports URL query variants (`?mock=run-rate-sparse`, `?mock=basket-aov`, `?mock=error-block-2`)
- [ ] **WIDG-STRUCT-05**: `src/lib/formatters.ts` — de-DE locale formatters for currency, number, percentage, date

### Blocks (WIDG-BLOCK)

- [ ] **WIDG-BLOCK-01**: `HeuteBlock.tsx` — renders run-rate projection (primary), pace vs 7-day avg (coloured indicator), same-hour-last-week (tertiary), payment method mini-split bars; handles confidence=low case with "Noch zu früh für Hochrechnung" / "Nicht genug Daten" message
- [ ] **WIDG-BLOCK-02**: `HeatmapBlock.tsx` — 7×24 grid rendered as coloured cells (5-step colour scale, empty = background); best-slot callout + dimmest-with-orders note; period toggle buttons for 4w/8w/12w (triggers `callTool` via AppBridge); Motion fade-in on container, NOT per-cell (168 cells would stutter)
- [ ] **WIDG-BLOCK-03**: `RepeatBlock.tsx` — big repeat rate % + PP trend arrow, benchmark line "Shopify B2C ~27%", median days to 2nd order, order basis count
- [ ] **WIDG-BLOCK-04**: `BasketOrAovBlock.tsx` — conditional render by `mode` field: product-level basket (support/confidence/lift), category-level basket, or AOV bands (share-of-count + share-of-revenue)
- [ ] **WIDG-BLOCK-05**: Payment-attention orders sub-section ported from v1 (wp-admin deep links) — placed inside HeuteBlock or as separate compact block

### Widget Quality (WIDG-QA)

- [ ] **WIDG-QA-01**: Dashboard renders all 4 blocks under 2s from page load (measured from `daily_briefing` tool call start to widget `onSizeChanged` firing)
- [ ] **WIDG-QA-02**: Today-vs-yesterday -85% bug NOT reproducible at any time of day — dashboard loaded at 09:00, 11:00, 14:00, 17:00 never shows universally negative pace
- [ ] **WIDG-QA-03**: Per-block error handling: if one ability fails in `Promise.allSettled`, that block shows skeleton placeholder "Daten nicht verfügbar", other 3 render normally
- [ ] **WIDG-QA-04**: All user-facing text in German
- [ ] **WIDG-QA-05**: Size budget: single-file `dist/index.html` ≤ 300 KB gzipped, verified via build artifact inspection

---

## Monday Briefing Email (EMAIL-*)

New Edge Function in PORTAL. Scheduled via Supabase pg_cron.

- [ ] **EMAIL-01**: New Edge Function `supabase/functions/send-weekly-revenue-briefing/index.ts` — separate from `send-reminders` (eliminates regression risk)
- [ ] **EMAIL-02**: pg_cron schedule: Mondays 06:00 UTC (safe before 08:00 Europe/Berlin in both summer/winter offsets); Berlin timezone guard inside function prevents send outside target window
- [ ] **EMAIL-03**: Function calls `kmn/weekly-briefing-data` ability via MCP server (single HTTP round-trip, unified payload)
- [ ] **EMAIL-04**: HTML email composed from template matching `REVENUE_INTELLIGENCE_V2_PLAN.md` §4 wireframe: revenue summary, best slot, repeat rate, top 3 products, portal link
- [ ] **EMAIL-05**: Sent via existing `send-mailjet-email` infrastructure to Nadine (MBM owner) for initial test — this milestone sends only test emails to Yuri; MBM production delivery deferred until MBM rollout milestone
- [ ] **EMAIL-06**: All email copy in German

---

## Local Dev Environment (DEV-*)

Summerfield DDEV clone at `/home/upan/projects/sf_staging/`. Apache-FPM + PHP 8.4 + MySQL 8.0 + WP 6.9+ + WC 8.x+.

**State as of 2026-04-23:** DDEV environment is already deployed by Yuri with production DB imported (324 MB, 14 401 URL replacements), uploads 302-redirected to prod via `.htaccess`, and smoke test passing. DEV-01 is therefore already satisfied. DEV-02 through DEV-09 are the Phase 15 deltas to bring this deployed environment to plan-ready state.

- [x] **DEV-01**: DDEV project running at `https://summerfield.ddev.site`; Apache-FPM + PHP 8.4 + MySQL 8.0; mkcert cert trusted; production DB imported and URL-replaced; homepage smoke-test passing. ✓ DONE 2026-04-23.
- [x] **DEV-02**: MCP Adapter v0.5.0 installed (composer in mu-plugins OR wp.org plugin — whichever works); verify `mcp_adapter_init` hook fires
- [x] **DEV-03**: `kmn-revenue-abilities` plugin symlinked from `/mnt/g/01_OPUS/Projects/PORTAL/wordpress-plugins/kmn-revenue-abilities/` into `/home/upan/projects/sf_staging/wp-content/plugins/`; activated successfully (plugin must exist before this requirement can be satisfied — depends on Phase 16 ABIL-SCAF-01)
- [x] **DEV-04**: Maxi AI plugin symlinked (from `/mnt/g/01_OPUS/Projects/PORTAL/maxi-ai/` or separate clone) and activated; coexists with kmn plugin without collision
- [x] **DEV-05**: WordPress Application Password generated for `admin` user (description: "mcp-dev"); recorded in mcp-poc `.env.local` as `WOOCOMMERCE_WP_APP_PASS`
- [x] **DEV-06**: WooCommerce REST API keys generated for admin; `WOOCOMMERCE_CONSUMER_KEY` / `WOOCOMMERCE_CONSUMER_SECRET` in mcp-poc `.env.local` for legacy tools
- [x] **DEV-07**: HPOS enabled on DDEV; `wp_wc_order_stats` and `wp_wc_order_product_lookup` tables exist; verified via `ddev wp wc hpos status`
- [x] **DEV-08**: mcp-poc connects to DDEV via `NODE_EXTRA_CA_CERTS` pointing to mkcert CA root
- [x] **DEV-09**: `PORTAL/.gitignore` updated: add `wordpress-plugins/*/.phpunit.result.cache` and `wordpress-plugins/*/composer.lock`. CRITICAL: extend `scripts/` whitelist to allow `*.php` files (current whitelist silently excludes them — `seed-orders.php` would be ignored by default)
- [x] **DEV-10**: Document actual deployment decisions in `docs/DECISIONS.md` — WSL-native path `/home/upan/projects/sf_staging/`, uploads-redirect via `.htaccess`, Apache-FPM stack choice matching prod

---

## Synthetic Seeder (SEED-*)

WP-CLI command for generating realistic Summerfield data per `SEEDER_SPEC.md`. Lives at `PORTAL/scripts/seed-orders.php`.

- [x] **SEED-01**: WP-CLI command `wp kmn seed` registered; accepts flags `--weeks`, `--daily-avg`, `--daily-stddev`, `--repeat-rate`, `--multi-item-rate`, `--seed`, `--dry-run`
- [x] **SEED-02**: Generates ~1260 orders across 12 weeks with furniture-shop distribution per SEEDER_SPEC §2 (volume, hour curve, day bias, basket composition, AOV bands, payment methods, status mix)
- [x] **SEED-03**: Generates ~900 synthetic customers; 22% configured as repeaters (2-5 orders each with median 55-day gap); orders linked to customers via `billing_email`
- [x] **SEED-04**: Pre-seeded product combinations force market basket signal: Boxspringbett→Lattenrost, Matratze→Matratzenschoner, Schlafsofa→Kissenset
- [x] **SEED-05**: Orders use `wc_create_order()` (HPOS-safe, auto-populates all lookup tables); `set_date_created()` backdates to synthetic datetime; `_kmn_test_order = 1` meta set on every order
- [x] **SEED-06**: `wp kmn seed reset` command deletes only orders + users flagged `_kmn_test_order` / `_kmn_test_user`; idempotent
- [x] **SEED-07**: Environment guard: seeder refuses to run if `siteurl` does not match `*.ddev.site` pattern; hard error on misuse
- [x] **SEED-08**: Validation queries from SEEDER_SPEC §4 pass after seed: ~1100 paid orders, Thu highest DOW, ~315 multi-item orders, ~22% repeat rate, hour peak in {20, 10, 19, 11, 21}
- [x] **SEED-09**: Runtime ≤ 5 minutes for full seed on DDEV; emails disabled during run via `woocommerce_email_new_order_enabled=no`

---

## Success Criteria for Milestone v3.0

1. **Bug fix verified:** Dashboard at 09:00, 11:00, 14:00, 17:00 never shows universally negative pace. -85% case not reproducible.
2. **All 4 blocks render under 2s** — measured end-to-end on Summerfield DDEV.
3. **Monday email delivery** — 4 consecutive test emails arrive at 08:00 ±5 min Europe/Berlin, zero duplicates.
4. **Platform reusability:** Second hypothetical MCP App can be built using the same pipeline + token bridge + companion plugin pattern without re-designing infrastructure (paper-review test).
5. **Qualitative "wow":** Yuri reviews Block 2 (heatmap) on seeded Summerfield data within 1 week of widget completion. Binary wow / not-wow verdict. Failures tracked as P1 for v3.1.
6. **Zero regression:** `RevenueIntelligencePage.tsx` shows zero TypeScript diff; existing `daily_briefing` v1 path continues to work during transition window.
7. **Code quality gates:** All SQL parameterised; composer deps pinned; WP 6.9+ guard active; Application Password rotation runbook in docs/DECISIONS.md.
8. **Ready for MBM rollout:** Seeded Summerfield analytics mathematically comparable to MBM's known data shape — when MBM milestone starts, it's "point plugin at live MBM" not "redesign".

---

## Out of Scope for v3.0

- Klaviyo integration (Phase 2)
- Stock velocity / inventory analytics (MBM doesn't track stock)
- Cohort retention curves, LTV predictive models (insufficient data)
- Traffic source attribution (requires GA4 MCP integration)
- Admin opt-out toggle for Monday email (single recipient)
- MBM production rollout of Revenue Intelligence v2 (future milestone)
- Claude Desktop / ChatGPT rendering (future cross-client architecture)
- Sandbox subdomain migration (`sandbox.kamanda-mcp-poc.vercel.app` — TODO noted, Phase 2 rollout blocker)
- Multi-widget orchestration on one page (one tool = one widget for v3.0)
- i18n framework (German hardcoded for v3.0)

---

*Last updated: 2026-04-23*
