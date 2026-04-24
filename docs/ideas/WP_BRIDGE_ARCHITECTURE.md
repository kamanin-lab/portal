# KMN Revenue Abilities — WordPress Companion Plugin Architecture

**Status:** DRAFT
**Priority:** high
**Scope:** Plugin design only — no PHP implementation in this document
**Last updated:** 2026-04-23

---

## 1. Goal & Scope

This plugin (`kmn-revenue-abilities`) exposes four WooCommerce revenue-analytics aggregations as WordPress Abilities registered via the core `wp_register_ability()` API (WordPress 6.9+). It bridges the `kmn-mcp` MCP server to HPOS SQL on `wp_wc_order_stats`, `wp_wc_order_product_lookup`, and `wp_wc_customer_lookup` — tables that the standard WooCommerce REST API v3 cannot efficiently aggregate. The plugin registers a dedicated MCP server (`kmn-revenue`) via the `wordpress/mcp-adapter` v0.5.0 composer package, exposing its abilities at `/wp-json/mcp/kmn-revenue`. Authentication reuses the WordPress Application Password mechanism already wired in the PORTAL infra. Caching is handled via WordPress transients (15-minute TTL).

This plugin does NOT handle MCP tool orchestration, LLM prompting, widget rendering, UI output, or multi-tenant configuration. It does not modify any WooCommerce data — all callbacks are read-only SELECT queries. It does not depend on, extend, or share code with the Maxi AI Core plugin; it coexists independently. Deployment is manual rsync per WP site and is explicitly outside the Vercel/Supabase deploy pipeline.

---

## 2. Architectural Position

```
Portal (React 19)
    │
    │  HTTPS + Supabase JWT Bearer
    ▼
supabase/functions/mcp-proxy/index.ts          (Gate: JWT + org + workspace + method/tool whitelist)
    │
    │  HTTPS POST  application/json  JSON-RPC 2.0
    │  Mcp-Session-Id header forwarded
    ▼
kmn-mcp  (mcp-poc-three.vercel.app/mcp)    (MCP server, Node.js)
    │
    ├──── tools: revenue_today, payment_attention_orders    ──────────────────────────────────┐
    │     (existing tools — keep hitting WC REST API v3)                                      │
    │       │  HTTPS  Basic Auth (WOOCOMMERCE_USER / WOOCOMMERCE_APP_PASS)                    │
    │       ▼                                                                                 │
    │     /wp-json/wc/v3/*  (WooCommerce REST API)                                            │
    │                                                                                         │
    └──── tools: revenue_run_rate, weekly_heatmap,          ──────────┐                      │
          repeat_metrics, market_basket (NEW tools)                   │                      │
            │  HTTPS POST  Basic Auth                                 │                      │
            │  (WOOCOMMERCE_WP_USER / WOOCOMMERCE_WP_APP_PASS)        │                      │
            ▼                                                         │                      │
    /wp-json/mcp/kmn-revenue  (our MCP server endpoint)               │                      │
          │  HTTP transport  (wordpress/mcp-adapter v0.5.0)           │                      │
          ▼                                                           │                      │
    WordPress Core  (WP 6.9+  Abilities API)                          │                      │
          │  wp_abilities_api_init → wp_register_ability()            │                      │
          ▼                                                           │                      │
    kmn-revenue-abilities plugin                                      │                      │
          │  execute_callback                                         │                      │
          ▼                                                           │                      │
    HPOS SQL (wpdb SELECT)                                            │                      │
          ├── wp_wc_order_stats          (revenue, dates, status)     │                      │
          ├── wp_wc_order_product_lookup (product/variation joins)    │                      │
          └── wp_wc_customer_lookup      (new vs returning)           │                      │
                                                                      │                      │
    ◄─────────────────────────────────────────────────────────────────┘                      │
    WooCommerce REST response (existing flow, unchanged)                                     │
    ◄────────────────────────────────────────────────────────────────────────────────────────┘
```

Key transport facts:
- Portal → mcp-proxy: Supabase JWT Bearer, HTTPS
- mcp-proxy → kmn-mcp: JSON-RPC 2.0 over HTTPS, no auth (server is public endpoint gated by mcp-proxy upstream)
- kmn-mcp → `/wp-json/mcp/kmn-revenue`: HTTPS POST, Basic Auth (WordPress Application Password), `Content-Type: application/json`, `Accept: application/json`
- WordPress Abilities REST endpoint → plugin callbacks: same PHP process, capability-checked by `permission_callback` before `execute_callback` runs

---

## 3. Plugin File Structure

```
PORTAL/
└── wordpress-plugins/
    └── kmn-revenue-abilities/
        ├── kmn-revenue-abilities.php          # Main plugin file — plugin header, bootstraps all includes
        ├── composer.json                      # Declares wordpress/mcp-adapter:^0.5.0 dependency
        ├── composer.lock                      # Locked dependency tree (committed)
        ├── vendor/                            # Composer-managed; committed with plugin
        ├── bootstrap/
        │   └── register-mcp-server.php        # Hooks mcp_adapter_init → $adapter->create_server('kmn-revenue', ...)
        ├── abilities/
        │   ├── run-rate.php                   # Registers kmn/revenue-run-rate ability
        │   ├── heatmap.php                    # Registers kmn/weekly-heatmap ability
        │   ├── repeat.php                     # Registers kmn/repeat-metrics ability
        │   └── basket-or-aov.php              # Registers kmn/market-basket ability (AOV fallback when product data thin)
        ├── includes/
        │   ├── sql-helpers.php                # Shared SQL builders: date-range clauses, timezone offset, status whitelist
        │   └── cache.php                      # Transient key builder, get/set wrappers with 15min TTL, invalidation hook
        ├── scripts/
        │   └── verify-wp-bridge.sh            # Placeholder: curl smoke tests against DDEV + production endpoints
        └── readme.md                          # Setup instructions, required WP/WC versions, env vars, DDEV mount path
```

No `tests/` directory for POC — see section 10 for integration test strategy.

---

## 4. Ability Contracts

### 4a. `kmn/revenue-run-rate`

**Ability ID:** `kmn/revenue-run-rate`
**Label:** Revenue Run Rate
**Description:** Calculates projected full-day revenue from intra-day curve over a rolling window. Uses HPOS `wp_wc_order_stats`.
**Category:** `woocommerce`

**input_schema:**
```json
{
  "type": "object",
  "properties": {
    "baseline_days": {
      "type": "integer",
      "description": "Historical days for intra-day curve (default 14, min 7, max 56).",
      "minimum": 7,
      "maximum": 56,
      "default": 14
    },
    "timezone": {
      "type": "string",
      "description": "IANA timezone string for date bucketing. Defaults to WP site timezone."
    },
    "reference_date": {
      "type": "string",
      "description": "ISO 8601 date (YYYY-MM-DD) treated as 'today'. Defaults to current date.",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "status": {
      "type": "array",
      "description": "Order statuses to include. Defaults to ['wc-completed','wc-processing'].",
      "items": { "type": "string" },
      "default": ["wc-completed","wc-processing"]
    }
  },
  "required": []
}
```

**output_schema:**
```json
{
  "type": "object",
  "properties": {
    "actual_now":              { "type": "number", "description": "Today's revenue so far" },
    "current_hour":            { "type": "integer" },
    "expected_by_hour":        {
      "type": "array",
      "description": "24-element array of average cumulative revenue by hour",
      "items": { "type": "number" }
    },
    "projection":              { "type": "number", "description": "Projected full-day total" },
    "pace_vs_7day_pct":        { "type": "number", "description": "Relative to same-hour trailing-7-day avg" },
    "same_hour_last_week":     { "type": "number" },
    "payment_split": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "method": { "type": "string" },
          "total":  { "type": "number" },
          "pct":    { "type": "number" }
        }
      }
    },
    "confidence":              { "type": "string", "enum": ["high","medium","low"] },
    "currency":                { "type": "string" },
    "calculated_at":           { "type": "string" }
  },
  "required": ["actual_now","current_hour","projection","pace_vs_7day_pct","confidence","currency","calculated_at"]
}
```

**permission_callback:** `current_user_can('manage_woocommerce')` — WooCommerce-standard gate, granted to Shop Manager and Administrator roles only. Customers and subscribers cannot call.

**execute_callback (pseudocode):**
```
// 1. Resolve timezone via wp_timezone() or $input['timezone']
// 2. Compute window_start = reference_date - baseline_days, window_end = reference_date
// 3. For each day d in baseline window:
//      SELECT HOUR(CONVERT_TZ(date_created,'+00:00',%s)) AS h, SUM(net_total)
//      FROM {$wpdb->prefix}wc_order_stats
//      WHERE DATE(date_created) = %s AND status IN (...)
//      GROUP BY h
//    — build cumulative_revenue_at_hour[d][h]
// 4. expected_by_hour[h] = avg over valid days (skip days with < 5 EUR at hour 23)
// 5. Fetch today's actual_now = SUM(net_total) WHERE DATE(date_created)=today
// 6. current_hour = HOUR(NOW() in store tz)
// 7. projection = actual_now / expected_by_hour[current_hour] * expected_by_hour[23]
// 8. Edge cases: current_hour=0 → confidence='low' + projection=null
//                expected_by_hour[current_hour] < 5.0 → fallback to 7-day ratio, confidence='medium'
//                < 5 valid baseline days → confidence='low', projection=null
// 9. Compute pace_vs_7day_pct, same_hour_last_week separately
// 10. payment_split: GROUP BY payment_method for today
// 11. Cache + return
```

**Caching:**
- Key: `kmn_rrr_{baseline_days}_{reference_date}_{status_hash}`
- TTL: 300 seconds (5 minutes — shorter because intra-day data changes fast)
- Invalidation: `woocommerce_order_status_changed` action deletes all `kmn_rrr_*` transients

---

### 4b. `kmn/weekly-heatmap`

**Ability ID:** `kmn/weekly-heatmap`
**Label:** Weekly Order Heatmap
**Description:** Returns order count and net revenue bucketed by day-of-week and hour-of-day. Identifies peak trading windows.
**Category:** `woocommerce`

**input_schema:**
```json
{
  "type": "object",
  "properties": {
    "weeks": {
      "type": "integer",
      "description": "Number of past weeks to analyse (default 8).",
      "enum": [4, 8, 12, 26, 52],
      "default": 8
    },
    "timezone": { "type": "string" },
    "reference_date": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "status": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["wc-completed","wc-processing"]
    }
  },
  "required": []
}
```

**output_schema:**
```json
{
  "type": "object",
  "properties": {
    "window_weeks":  { "type": "integer" },
    "timezone":      { "type": "string" },
    "buckets": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "day_of_week":   { "type": "integer", "description": "0=Sunday … 6=Saturday" },
          "hour_of_day":   { "type": "integer" },
          "order_count":   { "type": "integer" },
          "net_revenue":   { "type": "number" }
        }
      }
    },
    "best_slot": {
      "type": "object",
      "properties": {
        "day_of_week": { "type": "integer" },
        "hour_of_day": { "type": "integer" },
        "order_count": { "type": "integer" }
      }
    },
    "calculated_at": { "type": "string" }
  },
  "required": ["window_weeks","timezone","buckets","calculated_at"]
}
```

**permission_callback:** `current_user_can('manage_woocommerce')`

**execute_callback (pseudocode):**
```
// 1. Resolve numeric UTC offset (e.g. '+02:00') from wp_timezone()
//    — use numeric offset, NOT named timezone, to avoid MySQL tz-table dependency
// 2. Compute window dates: window_start = reference_date - (weeks * 7 days)
// 3. Convert window dates to UTC boundaries in PHP for index-friendly WHERE clause
// 4. Aggregate query:
//      SELECT
//        (DAYOFWEEK(CONVERT_TZ(date_created,'+00:00',%s)) - 1) AS dow,
//        HOUR(CONVERT_TZ(date_created,'+00:00',%s))             AS hod,
//        COUNT(order_id)                                         AS order_count,
//        SUM(net_total)                                          AS net_revenue
//      FROM {$wpdb->prefix}wc_order_stats
//      WHERE date_created BETWEEN %s AND %s
//        AND status IN (...)
//      GROUP BY dow, hod
//      ORDER BY dow, hod
//    Note: WHERE uses UTC bounds so index on date_created is active; only output grouping uses tz conversion.
// 5. Identify best_slot = row with max order_count
// 6. Cache + return
```

**Caching:**
- Key: `kmn_hmap_{weeks}_{reference_date}_{tz_hash}_{status_hash}`
- TTL: 900 seconds (15 min — historical data, stale-OK)
- Invalidation: `woocommerce_order_status_changed` clears `kmn_hmap_*`

---

### 4c. `kmn/repeat-metrics`

**Ability ID:** `kmn/repeat-metrics`
**Label:** Repeat Purchase Metrics
**Description:** Returns repeat purchase rate, median days to 2nd order, and new/returning split over trailing window.
**Category:** `woocommerce`

**input_schema:**
```json
{
  "type": "object",
  "properties": {
    "days": {
      "type": "integer",
      "description": "Rolling window in days (default 90).",
      "minimum": 30,
      "maximum": 730,
      "default": 90
    },
    "reference_date": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "status": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["wc-completed","wc-processing"]
    }
  },
  "required": []
}
```

**output_schema:**
```json
{
  "type": "object",
  "properties": {
    "window_days":             { "type": "integer" },
    "window_start":            { "type": "string" },
    "window_end":              { "type": "string" },
    "total_orders":            { "type": "integer" },
    "unique_customers":        { "type": "integer" },
    "new_customers":           { "type": "integer" },
    "returning_customers":     { "type": "integer" },
    "repeat_rate_pct":         { "type": "number", "description": "returning_customers / unique_customers * 100" },
    "median_days_to_2nd":      { "type": "number", "nullable": true },
    "trend_pp":                { "type": "number", "description": "Delta in PP vs prior 90-day window" },
    "benchmark_pct":           { "type": "number", "description": "Shopify B2C average for comparison" },
    "calculated_at":           { "type": "string" }
  },
  "required": ["window_days","total_orders","unique_customers","repeat_rate_pct","calculated_at"]
}
```

**permission_callback:** `current_user_can('manage_woocommerce')`

**execute_callback (pseudocode):**
```
// 1. Compute window dates and prior window dates
// 2. Unique customers + their order counts in window:
//      SELECT billing_email, COUNT(*) AS cnt, MIN(date_created) AS first_order
//      FROM {$wpdb->prefix}wc_order_stats
//      WHERE date_created BETWEEN %s AND %s AND status IN (...)
//      GROUP BY billing_email
// 3. new_customers = count where cnt = 1
//    returning_customers = count where cnt >= 2
//    unique_customers = count(*)
//    repeat_rate_pct = returning / unique * 100
// 4. Median days to 2nd order:
//    For each customer with 2+ orders in window, get (2nd_order_date - 1st_order_date)
//    SELECT customer_id, MIN(date_created) AS d1, ... (window functions in MariaDB 10.11+)
//    Compute median in PHP (small dataset — <2000 customers)
// 5. Run identical query for prior 90-day window → compute trend_pp
// 6. benchmark_pct = 27.0 (hardcoded Shopify B2C average)
// 7. Cache + return
```

**Caching:**
- Key: `kmn_rep_{days}_{reference_date}_{status_hash}`
- TTL: 3600 seconds (1 hour — 90d metrics are stable across small time windows)
- Invalidation: `woocommerce_order_status_changed` clears `kmn_rep_*`

---

### 4d. `kmn/market-basket`

**Ability ID:** `kmn/market-basket`
**Label:** Market Basket or AOV Analysis (probe-first)
**Description:** Returns top product co-purchase pairs OR AOV bands fallback, based on multi-item order count.
**Category:** `woocommerce`

**input_schema:**
```json
{
  "type": "object",
  "properties": {
    "days": {
      "type": "integer",
      "description": "Rolling window in days (default 90).",
      "default": 90,
      "minimum": 30,
      "maximum": 365
    },
    "reference_date": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "top_n": {
      "type": "integer",
      "description": "Return top N pairs by score (default 5, max 10).",
      "default": 5,
      "maximum": 10
    },
    "aov_bands": {
      "type": "array",
      "description": "Custom band boundaries in currency units. Default: [500, 1500].",
      "items": { "type": "number" },
      "default": [500, 1500]
    },
    "status": {
      "type": "array",
      "items": { "type": "string" },
      "default": ["wc-completed"]
    }
  },
  "required": []
}
```

**output_schema:**
```json
{
  "type": "object",
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["market_basket_product","market_basket_category","aov_bands"],
      "description": "Probe-determined: product mode if ≥100 multi-item orders, category if 30-99, aov_bands if <30."
    },
    "multi_item_orders": { "type": "integer" },
    "total_orders":      { "type": "integer" },
    "basket_pairs": {
      "type": "array",
      "description": "Populated for market_basket_* modes",
      "items": {
        "type": "object",
        "properties": {
          "id_a":        { "type": "integer" },
          "name_a":      { "type": "string" },
          "id_b":        { "type": "integer" },
          "name_b":      { "type": "string" },
          "support_pct": { "type": "number" },
          "confidence":  { "type": "number" },
          "lift":        { "type": "number" }
        }
      }
    },
    "aov_bands": {
      "type": "array",
      "description": "Always populated",
      "items": {
        "type": "object",
        "properties": {
          "label":          { "type": "string" },
          "min":            { "type": "number" },
          "max":            { "type": "number", "nullable": true },
          "order_count":    { "type": "integer" },
          "order_pct":      { "type": "number" },
          "revenue_share":  { "type": "number" }
        }
      }
    },
    "avg_order_value":    { "type": "number" },
    "median_order_value": { "type": "number" },
    "calculated_at":      { "type": "string" }
  },
  "required": ["mode","multi_item_orders","total_orders","aov_bands","calculated_at"]
}
```

**permission_callback:** `current_user_can('manage_woocommerce')`

**execute_callback (pseudocode):**
```
// 1. Compute window dates
// 2. Count multi-item orders:
//      SELECT COUNT(*) FROM {$wpdb->prefix}wc_order_stats s
//      WHERE s.date_created BETWEEN %s AND %s AND s.status IN (...)
//        AND (SELECT COUNT(*) FROM {$wpdb->prefix}wc_order_product_lookup p
//             WHERE p.order_id = s.order_id) > 1
// 3. Decide mode:
//      ≥100 → market_basket_product
//      30-99 → market_basket_category
//      <30 → aov_bands only
// 4. AOV bands (always compute):
//      bands = [{label:'<500 €', min:0, max:500}, {label:'500-1500 €', min:500, max:1500}, {label:'>1500 €', min:1500, max:null}]
//      For each band: SELECT COUNT(*), SUM(net_total) WHERE total_sales between min and max
//      Compute order_pct and revenue_share
//      Compute AVG(net_total) and median
// 5. Market basket (only if mode != aov_bands):
//      Self-join wp_wc_order_product_lookup:
//        SELECT a.product_id AS pid_a, b.product_id AS pid_b,
//               COUNT(DISTINCT a.order_id) AS co_occ
//        FROM {$wpdb->prefix}wc_order_product_lookup a
//        JOIN {$wpdb->prefix}wc_order_product_lookup b
//          ON a.order_id = b.order_id AND a.product_id < b.product_id
//        JOIN {$wpdb->prefix}wc_order_stats s ON a.order_id = s.order_id
//        WHERE s.date_created BETWEEN %s AND %s AND s.status IN (...)
//        GROUP BY pid_a, pid_b
//        HAVING co_occ >= 2
//        ORDER BY co_occ DESC
//        LIMIT %d
//      For category mode: JOIN to wp_term_relationships and group by category pairs.
//      Compute support = co_occ / multi_item_orders, confidence = co_occ / orders_with_a, lift = confidence / support_of_b.
//      Score = support * confidence * lift. Resort by score if different from co_occ ordering.
// 6. Enrich with product/category names via get_the_title() or wpdb
// 7. Cache + return
```

**Performance note:** Self-join is O(items_per_order² × order_count). At MBM scale (~15 orders/day, avg 2 items): trivial. At 50× scale with avg 5 items/order: flag query and consider pre-aggregation cron. Out of scope for POC.

**Caching:**
- Key: `kmn_mb_{days}_{reference_date}_{top_n}_{bands_hash}_{status_hash}`
- TTL: 3600 seconds (1 hour)
- Invalidation: `woocommerce_order_status_changed`

---

### 4e. `kmn/weekly-briefing-data` (meta-tool for Monday email)

**Ability ID:** `kmn/weekly-briefing-data`
**Label:** Weekly Briefing Aggregate
**Description:** Combined payload for Nadine's Monday email — last week revenue summary + best slot + repeat rate + top products.
**Category:** `woocommerce`

**input_schema:**
```json
{
  "type": "object",
  "properties": {
    "reference_date": {
      "type": "string",
      "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
    },
    "timezone": { "type": "string" }
  }
}
```

**output_schema:** Combined object with keys `last_week_summary`, `best_slot`, `repeat_metrics`, `top_products_3`. Details match respective individual ability outputs, plus:
```json
"last_week_summary": {
  "week_start": "...",
  "week_end": "...",
  "revenue_total": 12480.00,
  "order_count": 87,
  "aov": 143.45,
  "vs_prior_week_pct": 12.0
},
"top_products_3": [
  { "product_id": 123, "name": "...", "qty_sold": 18 }
]
```

**permission_callback:** `current_user_can('manage_woocommerce')`

**execute_callback (pseudocode):**
```
// 1. Fan out internally: call heatmap ability logic for 1w, repeat ability for 90d, plus custom last-week summary + top-3 products query
// 2. Assemble unified payload
// 3. Cache (shorter TTL: 300s — email runs once/week, cache only handles repeat calls during testing)
```

---

## 5. MCP Adapter Server Registration

**File:** `bootstrap/register-mcp-server.php`

Pseudocode for server registration:

```php
// Hook: mcp_adapter_init receives $adapter instance (wordpress/mcp-adapter v0.5.0)
// This fires AFTER wp_abilities_api_init, so all kmn/* abilities are already registered.

add_action('mcp_adapter_init', function ($adapter) {

    // Guard: ensure our abilities are registered before bridging
    if (!function_exists('wp_get_abilities')) { return; }

    $adapter->create_server(
        server_id:          'kmn-revenue',
        rest_namespace:     'mcp',
        rest_route:         'kmn-revenue',
        // → exposes endpoint at /wp-json/mcp/kmn-revenue
        name:               'KMN Revenue Intelligence',
        description:        'Aggregated WooCommerce revenue analytics for KAMANIN Portal.',
        version:            '1.0.0',
        transports:         [ HttpTransport::class ],
        error_handler:      ErrorLogMcpErrorHandler::class,
        observability:      NullMcpObservabilityHandler::class,
        abilities:          [
                                'kmn/revenue-run-rate',
                                'kmn/weekly-heatmap',
                                'kmn/repeat-metrics',
                                'kmn/market-basket',
                                'kmn/weekly-briefing-data',
                            ],
        resources:          [],
        prompts:            [],
    );
});
```

**Why a separate server-id from Maxi:**
Maxi AI Core registers its server on a different server-id (see `maxi-ai/bootstrap/register-abilities-with-mcp.php:12`). Our server-id `kmn-revenue` gives us:
1. Scoped endpoint — kmn-mcp hits `/wp-json/mcp/kmn-revenue` directly.
2. Separate tool list — `tools/list` on our endpoint returns only our 5 abilities. Maxi's 108 tools don't pollute LLM context.
3. Independent authentication surface — Maxi misconfiguration doesn't affect us.
4. Cleaner `mcp-proxy` whitelist — we add `kmn-*` tools without touching Maxi's registrations.

The `mcp_adapter_init` hook is shared across plugins — both register independently.

---

## 6. Auth Model

### Trust Boundary 1: kmn-mcp MCP Server → WordPress

Transport: HTTPS POST to `/wp-json/mcp/kmn-revenue`
Auth: WordPress Application Password, sent as `Authorization: Basic base64(user:app_password)`

Environment variables on the kmn-mcp MCP server (Node.js, Vercel):
- `WOOCOMMERCE_WP_USER` — WordPress username of the dedicated service account
- `WOOCOMMERCE_WP_APP_PASS` — Application Password generated for that account
- `KMN_BRIDGE_URL` — full URL `https://{site}/wp-json/mcp/kmn-revenue`

These are named differently from the existing `WP_MCP_USER` / `WP_MCP_APP_PASS` used by `supabase/functions/_shared/wp-audit.ts:42-43` (which call Maxi AI's endpoint). Keeping them separate avoids credential coupling — if we rotate the analytics credential, the site-audit credential is unaffected.

The WordPress user must have `manage_woocommerce` capability. Recommended: dedicated `kmn-analytics-bot` user (Shop Manager role). Never reuse `wp-audit.ts` account.

### Trust Boundary 2: WordPress Plugin → Database

The `execute_callback` runs as the authenticated WP user in the same PHP process. No separate DB credential — inherits `$wpdb` from wp-config. The `permission_callback` (`manage_woocommerce`) fires before `execute_callback` — this is the security gate. All SQL parameterised via `$wpdb->prepare()`. No raw user-input interpolation.

This is equivalent to SECURITY DEFINER semantics: plugin author defines safe SQL, caller's role is verified before execution, DB credentials never exposed.

### Application Password Rotation

1. WP Admin → Users → `kmn-analytics-bot` → Application Passwords.
2. Generate new app password; copy immediately (shown once).
3. Update `WOOCOMMERCE_WP_APP_PASS` in kmn-mcp Vercel env vars.
4. Redeploy kmn-mcp (env change triggers auto-redeploy).
5. Revoke old app password in WP Admin.
6. Run `scripts/verify-wp-bridge.sh` against production to confirm.
7. Record rotation in `docs/DECISIONS.md`.

---

## 7. Coexistence with Maxi AI Plugin

Structural guarantees — hold regardless of future evolution:

**Namespace isolation.** `kmn/*` vs `maxi/*`. Abilities API (WP 6.9+) treats as distinct. No collision possible.

**Separate `mcp_adapter_init` registrations.** Maxi at `maxi-ai/bootstrap/register-abilities-with-mcp.php:12`. Ours at `bootstrap/register-mcp-server.php`. Both hook same action, different closures, different `create_server()` calls.

**No shared PHP classes/functions.** We do not `require`, `use`, or call Maxi code. We define our own response helper. Maxi can be deactivated without causing a fatal in our plugin.

**Abilities API dependency only on WP core.** Dependencies: WordPress 6.9+, WooCommerce 7.1+ (HPOS), `wordpress/mcp-adapter` ^0.5.0. Maxi is a coexistence note in `readme.md`, not a dependency.

**Blast radius isolation.** Maxi endpoint compromise → our endpoint unaffected (different app password, different account, different code path).

---

## 8. Deprecation Plan for Old MCP Tools

Current `ALLOWED_TOOLS` in `PORTAL/supabase/functions/mcp-proxy/index.ts:141-146`:

| Tool | Current Use | Decision |
|------|------------|---------|
| `daily_briefing` | Core widget — invoked on mount | **Keep.** Tool orchestrates other tools; continues to use WC REST internally. Not replaced by bridge. |
| `revenue_today` | Used by `daily_briefing` | **Keep.** Single-day snapshot; WC REST is appropriate transport. |
| `payment_attention_orders` | Used by `daily_briefing` detail section | **Keep.** Returns individual orders, not aggregations. WC REST correct. |
| `incomplete_orders` | In whitelist, not used by any UI widget | **Remove from whitelist.** Shrinks attack surface. Flag upstream for eventual removal. |

New tools added after V2:
```typescript
"revenue_run_rate",
"weekly_heatmap",
"repeat_metrics",
"market_basket_or_aov",
"weekly_briefing_data",
```

**Routing rule:** Per-tool in kmn-mcp. No global switch. Each new tool's implementation calls the WP bridge. `revenue_today` stays on WC REST. This is tool-implementation concern, not proxy concern.

`stuck_orders` and `low_stock_products`: never in whitelist — no action needed.

---

## 9. Rate Limiting & Performance

**Per-ability rate limit:** 60 req/min per authenticated WP user. At current call patterns (1 human, widget-triggered), never approached. `wordpress/mcp-adapter` v0.5.0 has built-in limiter — prefer that over custom (see §12 open question).

**Query timeout budget:** 2s per ability. Enforce via `$wpdb->query("SET SESSION MAX_EXECUTION_TIME=2000")` or PHP `set_time_limit()`. kmn-mcp side enforces 2s per WP call; mcp-proxy wraps whole request in 10s.

**Index coverage:**

| Table | Indexed columns | Risk |
|-------|----------------|------|
| `wp_wc_order_stats` | `date_created`, `status`, `customer_id` | None — WC core indexes |
| `wp_wc_order_product_lookup` | `order_id`, `product_id` | Self-join efficient |
| `wp_wc_customer_lookup` | `customer_id` (PK) | None |

**Full-table-scan risks:** `CONVERT_TZ` on `date_created` in WHERE clause can kill index use on some MySQL. Mitigation: convert input dates to UTC in PHP, compare against stored `date_created` (UTC) directly. Only SELECT columns use `CONVERT_TZ` for output formatting.

**Scale wall:**
- MBM current: ~126 orders/week, ~6.5k/year. All queries < 100ms.
- 10× scale: ~65k orders/year. Heatmap fine (index hit). Market basket self-join at 10× with 3 items avg: ~195k join rows in 52-week window — marginal, may hit 1-2s. Add composite index `(order_id, product_id)` if needed.
- 50× scale: pre-aggregate into summary table via WC cron. Not current concern.

**Caching impact:** 15-min transients mean heavy SQL runs ≤ 4×/hour regardless of widget invocations. Effectively zero DB load from portal.

---

## 10. Testing Strategy

**PHPUnit/Pest: not for POC.** Complexity doesn't justify setup.

**Integration test:** `scripts/verify-wp-bridge.sh` bash script (placeholder — written when plugin installed on DDEV):

1. `POST /wp-json/mcp/kmn-revenue` with `tools/list` → assert 5 tools returned.
2. `tools/call` for each ability with default args → assert response shape (key names, types).
3. Invalid credentials → assert HTTP 401.
4. WP user without `manage_woocommerce` → assert HTTP 403.

Script uses `curl --user $WOOCOMMERCE_WP_USER:$WOOCOMMERCE_WP_APP_PASS` + `jq` assertions. Run against:
- Local: `https://summerfield.ddev.site`
- Production: live Summerfield URL (post-deploy)

Shape-only assertions until seeded data strategy deterministic (see `LOCAL_DEV_SETUP.md`).

---

## 11. Deployment

**Local (DDEV):**

Option A — symlink (preferred during dev):
```bash
ln -s /mnt/g/01_OPUS/Projects/PORTAL/wordpress-plugins/kmn-revenue-abilities \
      /mnt/g/01_OPUS/Projects/PORTAL/wp-local/wp-content/plugins/kmn-revenue-abilities
ddev wp plugin activate kmn-revenue-abilities
```

Option B — volume mount in `.ddev/docker-compose.override.yml` (fallback if symlinks misbehave).

**Production (Summerfield → later MBM):**

```bash
# From PORTAL working dir
rsync -avz --delete \
  wordpress-plugins/kmn-revenue-abilities/ \
  deploy-user@summerfield-server:/var/www/html/wp-content/plugins/kmn-revenue-abilities/

ssh deploy-user@summerfield-server \
  "cd /var/www/html && wp plugin activate kmn-revenue-abilities"
```

This deploy is SEPARATE from Vercel (frontend) and GitHub CI (Edge Functions). Needs own runbook in `docs/DECISIONS.md` on first prod deploy.

**Composer deps:** `composer install --no-dev --optimize-autoloader` locally before rsync. `vendor/` is committed with plugin (standard WP practice — servers have no composer).

---

## 12. Open Questions / Decisions Needed

- **`wordpress/mcp-adapter` version pin:** `^0.5.0` or exact `0.5.0`? Pre-1.0 — minor versions may break. **Recommend:** exact `0.5.0`, deliberate upgrades.

- **Adapter built-in rate limiter vs custom:** Confirm by reading adapter source before implementing our own.

- **MySQL timezone tables:** `CONVERT_TZ` with named tz requires populated tables. DDEV MySQL doesn't populate by default. **Decision:** always use numeric offsets from PHP — avoids DDEV dependency and index issues.

- **Seed data fixture:** Where does canonical seed fixture live? `wordpress-plugins/kmn-revenue-abilities/fixtures/` or separate `scripts/dev-fixtures/`? TBD.

- **WP 6.9 minimum on client sites:** Summerfield and MBM must be WP 6.9+. Add version check in main plugin file that deactivates with admin notice on older versions.

- **User account name:** `kmn-analytics-bot` — confirm with Yuri before creating.

- **When does kmn-mcp route to bridge vs WC REST:** Per-tool decision in MCP server implementation. NOT proxy concern. Confirm with mcp-poc owner before implementing tool stubs.

---

## 13. Out of Scope for This Plugin

- UI widgets/rendering (portal's responsibility)
- MCP tool orchestration/prompting (mcp-poc's responsibility)
- Klaviyo/external integrations
- Frontend theming, shortcodes, Gutenberg blocks
- Multi-tenant config (one install per WP site)
- WooCommerce data mutation (all abilities read-only)
- Email sending (Supabase Edge Functions + Mailjet handle this)
- Ability rule gates, masking, audit logs (Maxi's features)

---

*Last updated: 2026-04-23*
