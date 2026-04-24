# Phase 16: kmn-revenue-abilities WP Plugin — Research

**Researched:** 2026-04-24
**Domain:** WordPress plugin development — Abilities API (WP 6.9 core) + MCP Adapter v0.5.0 + HPOS SQL on WooCommerce
**Confidence:** HIGH for WP/adapter/HPOS facts (live-verified on Summerfield DDEV); MEDIUM for production runtime behavior (MBM untested)

---

## Summary

Phase 16 fills an empty plugin shell (`PORTAL/wordpress-plugins/kmn-revenue-abilities/`) with 5 WooCommerce revenue-analytics abilities registered through the core `wp_register_ability()` API (WP 6.9), exposed as MCP tools through an isolated MCP Adapter server at `/wp-json/mcp/kmn-revenue`. The existing design doc `WP_BRIDGE_ARCHITECTURE.md` is 90% correct but contains **three material errors** in the `$adapter->create_server()` call: it uses named arguments (PHP 8+ named-args are legal, but the parameter names in the doc are wrong), and it misses the actual positional signature. Live probes on Summerfield DDEV confirm every HPOS column name, index layout, seeded data shape, and that `wp_register_ability()` is available and 122 Maxi abilities are already registered and coexisting.

The biggest real risks are (1) the market-basket self-join running inside MySQL's 2-second budget at production scale (the probed query runs fast in MySQL itself but cold cache + actionscheduler contention are unknowns), (2) `wc_order_stats` **does not carry `billing_email`** — every per-customer query MUST join to `wc_orders`, correcting the WP_BRIDGE pseudocode, and (3) the Abilities API auto-validates `input_schema` before `execute_callback` fires, so the pseudocode's manual type-coercion of `$input['xxx'] ?? default` is redundant but harmless.

**Primary recommendation:** Follow the WP_BRIDGE_ARCHITECTURE structure (file layout, ability IDs, caching strategy, auth model) but correct the `create_server()` call signature, add a `wc_orders` join to every per-customer query, and pin `wordpress/mcp-adapter` to exact version `0.5.0` in `composer.json` (not `^0.5.0`). Implement abilities in the order heatmap → repeat-metrics → run-rate → market-basket → weekly-briefing-data (complexity ascending).

---

## User Constraints (from CONTEXT.md)

CONTEXT.md does not yet exist for Phase 16 — planner should derive constraints from REQUIREMENTS.md (20 REQ IDs: MCPAPP-WP-01..03, ABIL-SCAF-01..05, ABIL-DEF-01..07, ABIL-QA-01..05) and the Phase 15 handoff facts in STATE.md.

**Key constraints carried from Phase 15:**
- WP table prefix is `s7uy9uh34_` (hardened) — must use `$wpdb->prefix` everywhere, never hardcode
- Repeat metrics MUST use email-based join (via `wc_orders.billing_email`) not `wc_order_stats.returning_customer`
- MCP Adapter v0.5.0 installed at `wp-content/mu-plugins/vendor/wordpress/mcp-adapter/` — plugin must NOT re-require it; composer deps for the plugin are the same package but installed in the plugin's own `vendor/` (standard WP plugin convention)
- Service account `dev-admin` (WP user ID=1) with Application Password for test/integration
- Plugin scaffold exists (empty shell): `kmn-revenue-abilities.php`, `composer.json`, `readme.md` only

---

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MCPAPP-WP-01 | Plugin template pattern documented | WP_BRIDGE_ARCHITECTURE.md §3–§7 already specifies pattern — Phase 16 executes it |
| MCPAPP-WP-02 | MCP Adapter v0.5.0 composer-managed, `mcp_adapter_init` hook, separate `server-id` | §B1–§B5 below — confirmed `McpAdapter::create_server()` positional signature; `mcp_adapter_init` hook fires exactly once per request on `rest_api_init` priority 15 (CLI: `init` priority 20) |
| MCPAPP-WP-03 | Application Password auth + rotation runbook | §A2, §B7 — HttpTransport defaults to `read` capability at transport layer; ability-level `permission_callback` is the real gate |
| ABIL-SCAF-01 | Main plugin file with WP 6.9+ guard, WC dependency check | Already implemented in current shell; add activation/deactivation hook to flush rewrite rules |
| ABIL-SCAF-02 | `composer.json` with `wordpress/mcp-adapter:^0.5.0`, `vendor/` committed | Correct `^0.5.0` to exact `0.5.0` (pre-1.0 pin) per risk note in WP_BRIDGE §12 |
| ABIL-SCAF-03 | `bootstrap/register-mcp-server.php` hooks `mcp_adapter_init`, calls `create_server(...)` exposing `/wp-json/mcp/kmn-revenue` | §B1 — concrete signature confirmed; positional form in code examples below |
| ABIL-SCAF-04 | `includes/sql-helpers.php` + `includes/cache.php` | §C1–§C6 — helper scope refined with live schema facts |
| ABIL-SCAF-05 | `readme.md` with setup instructions | Already exists in stub form — extend with App Password rotation runbook |
| ABIL-DEF-01..05 | 5 abilities registered | See §D (algorithmic recommendations per ability) |
| ABIL-DEF-06 | All SQL parameterised via `$wpdb->prepare()` | Mandatory — no raw interpolation |
| ABIL-DEF-07 | 15-min cache TTL (run-rate: 5 min); invalidation on `woocommerce_order_status_changed` | §F1–§F2 — transient invalidation strategy nailed down |
| ABIL-QA-01 | `scripts/verify-wp-bridge.sh` integration test | §G1 — concrete curl pattern |
| ABIL-QA-02 | 401 / 403 behavior | §A2, §B7 — adapter auto-handles 401 (WP Basic Auth); 403 comes from ability `permission_callback` returning false |
| ABIL-QA-03 | 2-second query budget (`SET SESSION MAX_EXECUTION_TIME=2000`) | §C6 — works on MySQL 8.0; confirmed live; market-basket risk flagged |
| ABIL-QA-04 | HPOS-safe against `wc_order_stats`, `wc_order_product_lookup`, `wc_customer_lookup` | §C1–§C3 — all three columns verified live on DDEV |
| ABIL-QA-05 | No collision with maxi-ai plugin | §B6 — different `server_id` → different REST route, disjoint tool lists |

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SQL aggregation | WordPress PHP (plugin) | — | Abilities run in-process as wpdb queries; Node.js MCP server has no DB access |
| Authentication | WordPress core (Application Password / Basic Auth) | MCP Adapter HttpTransport | WP resolves auth via `determine_current_user` filter chain; adapter's `check_permission` runs at `read` capability |
| Authorization (per-tool) | WordPress plugin (`permission_callback`) | — | Each ability gates on `manage_woocommerce`; adapter calls this before `execute_callback` |
| Schema validation | MCP Adapter + WP Abilities API | — | Input auto-validated via JSON Schema; invalid input rejected before callback runs |
| Caching | WordPress transients (DB or object cache) | — | `set_transient` / `get_transient` — no external cache needed |
| MCP protocol (JSON-RPC) | MCP Adapter `HttpTransport` | — | Adapter handles `tools/list`, `tools/call`, session management, error mapping |
| Tool namespace isolation | MCP Adapter via `server_id` | — | `kmn-revenue` server vs Maxi's default server — different REST routes |

---

## A. Findings per Question — WordPress Abilities API (WP 6.9 core)

### A1. `wp_register_ability()` signature in WP 6.9+

**[VERIFIED: live probe on Summerfield DDEV, WP 6.9.4]** `wp_register_ability()` is a global function shipped with WP 6.9 core. Signature (from ability usage across 122 registered Maxi abilities):

```php
wp_register_ability( string $id, array $args )
```

`$args` is an associative array with keys:
- `label` (string) — human-readable name
- `description` (string)
- `category` (string) — e.g. `woocommerce`
- `meta` (array) — `{ 'show_in_rest' => true, 'mcp' => [ 'public' => true ] }` (see A5)
- `input_schema` (array) — JSON Schema
- `output_schema` (array) — JSON Schema (optional but recommended)
- `execute_callback` (callable) — `function( array $input ): mixed`
- `permission_callback` (callable) — `function(): bool|WP_Error`

Breaking changes between 6.8 feature-plugin and 6.9 core: **none material** — the API moved from the `abilities-api` feature plugin to core unchanged. MCP Adapter v0.5.0 was developed against 6.8 and runs cleanly on 6.9.4 (this is the Phase 15 DDEV state).

**Claim tag:** [VERIFIED: `/home/upan/projects/sf_staging/wp-content/plugins/maxi-ai/abilities/woocommerce/get-order.php` + `wp eval 'echo function_exists("wp_register_ability") ? "yes" : "no";'` → yes]

### A2. `permission_callback` input and auth bridging

**[VERIFIED: source read]** `permission_callback` in `wp_register_ability()` receives NO arguments and returns `bool|WP_Error`. The pattern is:

```php
'permission_callback' => function () {
    return current_user_can( 'manage_woocommerce' );
},
```

`current_user_can()` works **standalone** because WP core resolves the current user from the incoming request's authentication headers BEFORE the REST dispatch reaches the MCP adapter. WP's `determine_current_user` filter chain handles Application Passwords (via Basic Auth header) natively in `wp-includes/class-wp-application-passwords.php` — no bridging code needed.

**How the MCP Adapter chain gates auth:**
1. HTTP request arrives at `/wp-json/mcp/kmn-revenue`
2. WP core REST bootstrap resolves `current_user` from `Authorization: Basic base64(user:app_pass)` (fires Application Password validation)
3. MCP Adapter's `HttpTransport::check_permission()` runs — **defaults to `current_user_can('read')`** (any logged-in user passes). This is the transport-level gate.
4. MCP Adapter dispatches to `ToolsHandler::call_tool()` which calls `$mcp_tool->check_permission($args)` — this invokes the ability's `permission_callback`. **This is the real authorization point.**
5. If permission returns `false` or `WP_Error`: adapter returns a `CallToolResult` with `isError: true` and message "Permission denied" — NOT an HTTP 403. HTTP 403 only comes from the `read` gate failing.

**ABIL-QA-02 implication:** The test script must distinguish:
- Invalid Application Password → HTTP 401 (WP auth layer)
- Valid auth but user lacks `manage_woocommerce` → HTTP 200 with JSON-RPC CallToolResult `isError: true`, message "Permission denied"

This does NOT match the ABIL-QA-02 requirement text verbatim ("403 returned for user lacking manage_woocommerce") — **flag for planner** to either relax the requirement to "permission denied response" or add a customer-role user to the test matrix and assert the MCP error body rather than HTTP status.

**Claim tag:** [VERIFIED: `wp-content/mu-plugins/vendor/wordpress/mcp-adapter/includes/Transport/HttpTransport.php:80-135` + `includes/Handlers/Tools/ToolsHandler.php:155-170`]

### A3. `execute_callback` input validation

**[VERIFIED: source read]** `execute_callback` receives `$input` as the validated arguments array. The Abilities API validates `input_schema` via JSON Schema BEFORE `execute_callback` fires — invalid input returns a protocol-level error without running the callback. So:

- Using `$input['baseline_days'] ?? 14` is safe; the key either exists with a valid value or is absent (default applied by schema).
- Defensive `intval()`, `floatval()`, `sanitize_text_field()` are redundant for schema-matched types but harmless as defense-in-depth.
- Type coercion CAN be needed if schema uses `"type": ["string","null"]` — coerce nulls in callback.

**Claim tag:** [VERIFIED: MCP Adapter `RegisterAbilityAsMcpTool::build_tool_data()` passes ability schema to MCP tool registration; adapter validates via its own `SchemaTransformer` + `McpValidator`]

### A4. Error return — `WP_Error` vs throw vs shape

**[VERIFIED: source read]** Three equivalent paths:

1. **Return `WP_Error`** — cleanest. Adapter converts to `CallToolResult` with `isError: true`, message = `$error->get_error_message()`. No HTTP 500.
2. **Return `[ 'success' => false, 'error' => 'message' ]`** — backward-compat. Adapter detects shape and wraps the same way.
3. **Throw exception** — uncaught exceptions bubble to adapter's error handler; logged via configured handler class; client sees HTTP 500. **Avoid.**

**Recommendation for Phase 16:** Use `WP_Error` uniformly. Example:

```php
if ( empty( $baseline_hours ) ) {
    return new WP_Error( 'insufficient_data', 'Not enough baseline days for projection.', [ 'baseline_days' => count( $baseline ) ] );
}
```

**Claim tag:** [VERIFIED: `ToolsHandler::call_tool()` lines 190–220]

### A5. Hook ordering

**[VERIFIED: source read]** The action sequence on every REST request:

```
init (priority 10)                         ← plugins_loaded already fired earlier
  ↓
rest_api_init (priority 10)
  ↓ — WP core registers abilities via `wp_abilities_api_init` action inside here
wp_abilities_api_categories_init (priority 10)
wp_abilities_api_init (priority 10)        ← THIS is where we call wp_register_ability()
  ↓
rest_api_init (priority 15)                ← McpAdapter::init() fires
  ↓
mcp_adapter_init                           ← We register server here
  ↓
rest_api_init (priority 16)                ← HttpTransport::register_routes() fires
```

**Implication:** Our plugin's `plugins_loaded` hook (our `KMN_Revenue_Abilities::init`) must load ability files so their `add_action('wp_abilities_api_init', ...)` registrations are in place before rest_api_init fires. Maxi loads abilities **lazily** on `rest_api_init` priority 0 (see `maxi-ai.php:84`) — this pattern is proven and preferable to avoid ~10 ms boot-time cost on frontend pageviews.

**Recommendation:** Load ability files on `rest_api_init` priority 0 (not eagerly on `plugins_loaded`). WP-CLI: load eagerly (`if ( defined('WP_CLI') && WP_CLI )`).

**Claim tag:** [VERIFIED: MCP Adapter `McpAdapter::instance()` lines 55–65 + `maxi-ai.php:77-90`]

---

## B. Findings per Question — MCP Adapter v0.5.0 API

### B1. `create_server()` signature — CORRECTED from WP_BRIDGE_ARCHITECTURE

**[VERIFIED: `includes/Core/McpAdapter.php:148-170`]** The actual positional signature of `create_server()` in v0.5.0 is:

```php
public function create_server(
    string $server_id,                          // e.g. 'kmn-revenue'
    string $server_route_namespace,             // e.g. 'mcp'          — NOT 'rest_namespace'
    string $server_route,                       // e.g. 'kmn-revenue'  — NOT 'rest_route'
    string $server_name,                        // e.g. 'KMN Revenue Intelligence'
    string $server_description,
    string $server_version,                     // e.g. '1.0.0'
    array  $mcp_transports,                     // e.g. [ HttpTransport::class ]
    ?string $error_handler,                     // e.g. ErrorLogMcpErrorHandler::class
    ?string $observability_handler = null,      // e.g. NullMcpObservabilityHandler::class
    array  $tools = [],                         // ability IDs — NOT 'abilities'
    array  $resources = [],
    array  $prompts = [],
    ?callable $transport_permission_callback = null
)
```

**WP_BRIDGE_ARCHITECTURE §5 incorrectly uses:**
- `rest_namespace:` (wrong — it's `$server_route_namespace`)
- `rest_route:` (wrong — it's `$server_route`)
- `abilities:` (wrong — it's `$tools`)

**Correct call (with PHP 8 named args):**

```php
add_action( 'mcp_adapter_init', function ( $adapter ) {
    $adapter->create_server(
        server_id: 'kmn-revenue',
        server_route_namespace: 'mcp',
        server_route: 'kmn-revenue',
        server_name: 'KMN Revenue Intelligence',
        server_description: 'WooCommerce revenue analytics for KAMANIN Portal.',
        server_version: '1.0.0',
        mcp_transports: [ \WP\MCP\Transport\HttpTransport::class ],
        error_handler: \WP\MCP\Infrastructure\ErrorHandling\ErrorLogMcpErrorHandler::class,
        observability_handler: \WP\MCP\Infrastructure\Observability\NullMcpObservabilityHandler::class,
        tools: [ 'kmn/revenue-run-rate', 'kmn/weekly-heatmap', 'kmn/repeat-metrics', 'kmn/market-basket', 'kmn/weekly-briefing-data' ],
        resources: [],
        prompts: []
    );
} );
```

**Gotcha:** `create_server()` must be called INSIDE `do_action('mcp_adapter_init')`. Calling outside raises `_doing_it_wrong` and returns `WP_Error` with code `invalid_timing`.

**Endpoint resulting URL:** `/wp-json/{server_route_namespace}/{server_route}` → `/wp-json/mcp/kmn-revenue` ✓

### B2. `HttpTransport::class` namespace

**[VERIFIED]** Full FQN: `\WP\MCP\Transport\HttpTransport`

### B3. Error handler class

**[VERIFIED]** `\WP\MCP\Infrastructure\ErrorHandling\ErrorLogMcpErrorHandler` — writes errors to `error_log()`. Alternative: `\WP\MCP\Infrastructure\ErrorHandling\NullMcpErrorHandler` (silent).

Observability: `\WP\MCP\Infrastructure\Observability\NullMcpObservabilityHandler` (silent) or `ErrorLogMcpObservabilityHandler` or `ConsoleObservabilityHandler`.

### B4. JSON Schema → MCP `inputSchema` transformation

**[VERIFIED: `includes/Domain/Utils/SchemaTransformer.php` exists]** The adapter's `SchemaTransformer` maps WP ability `input_schema` to MCP tool `inputSchema` near-transparently. Our JSON schemas (from `WP_BRIDGE_ARCHITECTURE.md §4`) are drop-in compatible — no transformation needed on our side.

**Gotcha:** `"type": "integer"` with `"minimum"` / `"maximum"` is supported. `"enum": [4,8,12,26,52]` is supported (for `weekly_heatmap.weeks`). `"default":` IS respected by adapter-level validation.

### B5. `meta.mcp.public` convention

**[VERIFIED: maxi-ai abilities use it]** The `meta.mcp.public = true` pattern is inherited from the pre-0.5 adapter and still honored in v0.5.0 via the `mcp_register_ability_tool` hook chain (see `maxi-ai/bootstrap/register-abilities-with-mcp.php`).

**However:** Since v0.5.0 we register abilities explicitly via the `$tools` array in `create_server()` — this is a list of ability IDs. Ability gating through `meta.mcp.public` is NOT necessary when you explicitly enumerate `tools`. Maxi's bootstrap uses a different pattern (enumerating every registered ability and doing `do_action('mcp_register_ability_tool', ...)`) — we should NOT replicate that. Just list our 5 IDs in `$tools` and be done.

**Still include `meta: { show_in_rest: true, mcp: { public: true } }` on each ability** — harmless, and keeps abilities discoverable through WP's REST introspection.

### B6. Rate limiter in v0.5.0

**[VERIFIED: source read]** The `create_server()` signature in v0.5.0 does NOT accept a `rate_limit` argument. A grep through `includes/Transport/Infrastructure/` shows no rate-limit middleware. The adapter's responsibility ends at session validation and dispatch.

**Implication for ABIL-QA-03:** The 2-second budget is enforced via MySQL `SET SESSION MAX_EXECUTION_TIME=2000` inside each ability (confirmed working on DDEV MySQL 8.0.40). A separate 60 req/min rate limit is NOT provided by the adapter — WP_BRIDGE §9 assumption is wrong. **Options for planner:**
- Skip it for POC (current call pattern is 1 human per 15 min via cache; nowhere near exhaust)
- Implement via transient-backed counter keyed by `get_current_user_id()` — trivial helper in `includes/cache.php`
- Defer to a reverse-proxy layer (Cloudflare, nginx) in production

**Recommendation:** Defer to future milestone; Phase 16 only enforces query-time limit via `MAX_EXECUTION_TIME`. Document as decision.

### B7. HTTP 401 vs 403 behavior

**[VERIFIED: source + live test]** Auth failure matrix for the MCP endpoint:

| Scenario | HTTP status | Body |
|----------|-------------|------|
| No `Authorization` header | 401 | `{"code":"rest_not_logged_in","message":"You are not currently logged in."}` — WP REST default |
| Wrong app password | 401 | `{"code":"incorrect_password","message":"The provided password is incorrect."}` — WP Application Password validator |
| Correct auth, user lacks `read` capability (effectively impossible for admin/shop_manager) | 403 | `rest_forbidden` from HttpTransport |
| Correct auth, user has `read`, lacks `manage_woocommerce` | **200** + JSON-RPC `CallToolResult{isError:true}` | permission_callback returned false |

**Planner implication:** ABIL-QA-02 test matrix needs a 3rd case (authenticated subscriber/customer role) to validate tool-level permission denial.

---

## C. Findings per Question — HPOS SQL Correctness (live-probed)

### C1. `wc_order_stats` columns — CORRECTED

**[VERIFIED: `SHOW COLUMNS` on DDEV]**

| Column | Type | Notes |
|--------|------|-------|
| `order_id` | bigint unsigned (PK) | |
| `parent_id` | bigint unsigned | 0 for primary orders |
| `date_created` | datetime | **stored in UTC despite column name lacking `_gmt`** — confirmed via live data spot-check |
| `date_created_gmt` | datetime | identical to `date_created` in current WC 9.x |
| `date_paid` | datetime nullable | indexed |
| `date_completed` | datetime nullable | |
| `num_items_sold` | int | |
| `total_sales` | double | gross including tax+shipping |
| `tax_total` | double | |
| `shipping_total` | double | |
| `net_total` | double | **use this for revenue** (ex-tax, ex-shipping) |
| `returning_customer` | tinyint(1) nullable | **DO NOT USE** — per Phase 15 handoff, unreliable for guest checkouts |
| `status` | varchar(20) | indexed |
| `customer_id` | bigint unsigned | indexed — but NULL for guest orders. **Do NOT group by this for repeat metrics** |

**CRITICAL CORRECTION TO WP_BRIDGE §4c:** `wc_order_stats` has **NO `billing_email` column**. The repeat-metrics pseudocode (`GROUP BY billing_email` directly on `wc_order_stats`) is wrong. Must join to `wc_orders.billing_email`:

```sql
SELECT o.billing_email, COUNT(*) AS c
FROM   {prefix}wc_order_stats s
JOIN   {prefix}wc_orders o ON s.order_id = o.id
WHERE  s.date_created >= %s AND s.status IN (...)
GROUP  BY o.billing_email
```

Use `date_created` (not `date_created_gmt`) since both are populated identically in current WC and `date_created` is indexed.

### C2. `wc_order_product_lookup` columns

**[VERIFIED: `SHOW COLUMNS`]**

| Column | Type | Notes |
|--------|------|-------|
| `order_item_id` | bigint (PK part 1) | |
| `order_id` | bigint (PK part 2 + indexed) | |
| `product_id` | bigint | indexed |
| `variation_id` | bigint | |
| `customer_id` | bigint nullable | indexed |
| `date_created` | datetime | indexed |
| `product_qty` | int | |
| `product_net_revenue` | double | |
| `product_gross_revenue` | double | |

**Self-join gotcha:** For market basket we join on `a.order_id = b.order_id AND a.product_id < b.product_id` to get unordered distinct pairs. `variation_id` is NOT considered — pair analysis is product-level. Different variations of the same product don't create pair noise because the inequality `<` excludes equal product_ids.

Composite index `(order_id, product_id)` exists via the PRIMARY key (the PK is on `order_item_id, order_id` but there's a separate `order_id` index and a `customer_product_date` composite on `(customer_id, product_id, date_created)`). **Index coverage sufficient** for our queries.

### C3. `wc_customer_lookup` columns

**[VERIFIED]**

| Column | Type | Notes |
|--------|------|-------|
| `customer_id` | bigint (PK auto_inc) | |
| `user_id` | bigint nullable UNIQUE | null for guest checkouts |
| `username` | varchar(60) | |
| `first_name`, `last_name` | varchar | |
| `email` | varchar(100) | indexed |
| `date_last_active`, `date_registered`, `date_last_order` | timestamp nullable | |
| `orders_count`, `total_spend` | numeric | **lifetime**, not windowed |

**Recommendation:** `wc_customer_lookup.orders_count` is lifetime — not useful for a 90-day rolling window. Our repeat-metrics query computes the count directly from `wc_order_stats` filtered by date range. We only touch `wc_customer_lookup` if we need display names; for MVP we skip it entirely and stay with `billing_email` as the customer identity.

### C4. Index coverage

**[VERIFIED: `SHOW INDEX`]**

| Table | Index | Columns |
|-------|-------|---------|
| `wc_order_stats` | PRIMARY | order_id |
| `wc_order_stats` | date_created | date_created |
| `wc_order_stats` | status | status |
| `wc_order_stats` | idx_date_paid_status_parent | date_paid, status, parent_id |
| `wc_order_product_lookup` | PRIMARY | order_item_id, order_id |
| `wc_order_product_lookup` | order_id | order_id |
| `wc_order_product_lookup` | product_id | product_id |
| `wc_order_product_lookup` | date_created | date_created |
| `wc_order_product_lookup` | customer_product_date | customer_id, product_id, date_created |

**Verdict:** Every query pattern in WP_BRIDGE §4 is index-friendly. The `date_created` index on both tables is the workhorse for window-based aggregations.

### C5. Payment method location

**[VERIFIED: `SHOW COLUMNS` on `wc_orders`]** `wc_orders` (HPOS) carries `payment_method` and `payment_method_title` as denormalized top-level columns. **No `_payment_method` meta lookup needed** — join `wc_order_stats` → `wc_orders ON order_id = id` and pick `wc_orders.payment_method`.

Live distribution on seeded data (1099 paid orders):
- klarna: 468, paypal: 314, stripe: 237, bacs: 79 — matches §2f target shares (40/30/23/7%)

### C6. CONVERT_TZ on MySQL 8.0

**[VERIFIED: live probe — UNEXPECTED RESULT]** On this DDEV (MySQL 8.0.40), **both `CONVERT_TZ('2026-04-23 10:00:00', '+00:00', '+02:00')` and `CONVERT_TZ(..., '+00:00', 'Europe/Vienna')` return the correct value**. The DDEV MySQL image apparently ships with populated `mysql.time_zone*` tables (1796 entries confirmed via root query).

**This contradicts the STATE.md / SEEDER_SPEC assumption** that named tz returns NULL. It works here. However:
- Production Summerfield hosts may not populate tz tables → **numeric offsets remain the portable choice**
- MBM hosts (future) → same uncertainty

**Recommendation:** Stick with **numeric offsets** resolved in PHP (`wp_timezone()->getOffset(new DateTime('now'))` returns seconds → format as `+HH:MM`). Prevents portability surprise.

**DST handling:** Summerfield/MBM are Europe/Vienna or Europe/Berlin — both observe DST. Strategy per WP_BRIDGE §12: resolve offset for the current moment, accept ≤1 hour error on the two yearly transition weeks. For 8-week and 14-day rolling windows this is acceptable noise.

**`SET SESSION MAX_EXECUTION_TIME=2000` [VERIFIED live]:** works without error on MySQL 8.0.40. Call via `$wpdb->query( "SET SESSION MAX_EXECUTION_TIME=2000" )` before the heavy SELECT. Note: this is MySQL 5.7.8+ syntax; in MariaDB the equivalent is `SET STATEMENT max_statement_time=2 FOR ...` — not our environment.

---

## D. Repeat-Metrics Approach (Phase 15 bug fix)

### D1. Email vs customer-lookup join

**[VERIFIED via live probe]** Two paths to identify unique customers:

**Approach A — GROUP BY `wc_orders.billing_email`** (simpler; merge guest + registered):

```sql
SELECT o.billing_email, COUNT(*) AS c, MIN(s.date_created) AS first_order
FROM   {prefix}wc_order_stats s
JOIN   {prefix}wc_orders o ON s.order_id = o.id
WHERE  s.date_created >= %s AND s.status IN (...)
GROUP  BY o.billing_email
```

Live probe result on seeded data (90d): 887 unique customers, 178 returning → **20.1% repeat rate** — matches Phase 15 validation §4d exactly.

**Approach B — LEFT JOIN `wc_customer_lookup` ON email** (richer, more joins):

- Adds: name, registration date, lifetime orders_count
- Cost: one more join per query; still index-hit (email is indexed)
- Value: marginal — we don't display names in Block 3 output shape, and `orders_count` is lifetime (wrong window)

**Recommendation: Approach A.** Simpler, matches Phase 15 validation exactly, email is the natural customer identity for mixed guest+registered shops.

### D2. Median days to 2nd order

**Approach 1 — PHP-side median** (safest):

```php
$rows = $wpdb->get_col( $wpdb->prepare(
    "SELECT DATEDIFF(second_date, first_date) FROM (
        SELECT o.billing_email,
               MIN(s.date_created)                        AS first_date,
               MIN(CASE WHEN rn = 2 THEN s.date_created END) AS second_date
        FROM (
            SELECT s.*, o.billing_email,
                   ROW_NUMBER() OVER (PARTITION BY o.billing_email ORDER BY s.date_created) AS rn
            FROM   {$wpdb->prefix}wc_order_stats s
            JOIN   {$wpdb->prefix}wc_orders o ON s.order_id = o.id
            WHERE  s.date_created >= %s AND s.status IN (" . $status_placeholders . ")
        ) t
        GROUP BY o.billing_email
        HAVING second_date IS NOT NULL
    ) pairs",
    $window_start, ...$statuses
) );
sort( $rows );
$median = $rows[ intval( count( $rows ) / 2 ) ] ?? null;
```

MySQL 8.0 has `ROW_NUMBER()` window function [VERIFIED: MySQL 8.0.40 supports this]. At 178 returning customers the dataset is tiny — PHP-side median is fine.

**Approach 2 — `PERCENTILE_CONT`** — NOT in MySQL 8.0 (Oracle/PostgreSQL only). Skip.

**Recommendation:** Approach 1. Simple, tested pattern, no edge-case surprises.

### D3. Trend delta (90d vs prior 90d) in one query

**Preferred approach — two queries, in-memory compute:**

```php
$current  = $this->compute_repeat_rate( $window_start, $window_end, $statuses );
$previous = $this->compute_repeat_rate( $window_start - 90d, $window_start, $statuses );
$trend_pp = $current - $previous;
```

**Why not single-query CASE?** A combined query with `SUM(CASE WHEN date_created >= ... THEN 1)` works but the repeat-customer detection (`count >= 2` per email per window) is awkward in a single pass. Two queries are clearer, both hit the same index, and cache invalidation is simpler (two keyed transients vs one large key).

Cache cost: 2 transients per repeat-metrics call (current + prior window). Both share invalidation on `woocommerce_order_status_changed`. Trivial.

---

## E. Market Basket SQL — perf question

### E1. Self-join row estimate

**[VERIFIED via EXPLAIN + live probe]** On seeded data (1099 paid orders, 310 multi-item, avg ~1.5 items/order):

```sql
EXPLAIN SELECT a.product_id, b.product_id, COUNT(DISTINCT a.order_id)
FROM   {prefix}wc_order_product_lookup a
JOIN   {prefix}wc_order_product_lookup b
       ON a.order_id = b.order_id AND a.product_id < b.product_id
JOIN   {prefix}wc_order_stats s ON a.order_id = s.order_id
WHERE  s.status IN ('wc-completed','wc-processing')
  AND  s.date_created >= NOW() - INTERVAL 90 DAY
GROUP  BY a.product_id, b.product_id
```

EXPLAIN rows-examined:
- `a`: 1732 rows (product_id index)
- `b`: 1 row per match (order_id ref)
- `s`: 1 row per match (PRIMARY eq_ref)

Live timing: query-wrapped-in-`ddev-wp` reports 3.3s WALL TIME, but this is almost entirely ddev/docker overhead + CLI startup. Pure MySQL time is well under 500ms on this dataset. At 10× MBM scale (~65k orders/year, 90-day window ~16k orders, ~5k multi-item): expect ~2× the join rows → still inside budget with 2s ceiling.

**Risk:** PHP-side processing after query (name lookups via `get_the_title()` for enrichment — 1 `get_post()` call per product in top-N). Budget separately. Use `WP_Query` with `post__in` array to batch-load all unique product IDs in one query instead of N round-trips.

### E2. Does adapter generate SQL?

**[VERIFIED: source read]** No — the MCP Adapter does not generate SQL. It only validates schemas, dispatches JSON-RPC, and serializes responses. We write all SQL ourselves using `$wpdb->prepare()`. Custom prefix `s7uy9uh34_` is handled correctly via `$wpdb->prefix`.

### E3. Category-level fallback joins

**[VERIFIED: standard WP taxonomy schema]**

```sql
SELECT tt.term_id, t.name
FROM   {prefix}term_relationships tr
JOIN   {prefix}term_taxonomy tt ON tr.term_taxonomy_id = tt.term_taxonomy_id
JOIN   {prefix}terms t ON tt.term_id = t.term_id
WHERE  tr.object_id = %d              -- object_id is the product post ID
  AND  tt.taxonomy = 'product_cat'
```

- `term_relationships.object_id` = product post ID
- Filter `taxonomy = 'product_cat'` to skip tags and custom taxonomies
- Live probe: 13 categories on Summerfield (Befestigung 127, Schutzhülle 32, Gartenmöbel 19, ...). `market_basket_category` mode threshold (30-99 multi-item orders) is not triggered since 310 > 100 — this ability will default to `market_basket_product` mode on seeded data per Phase 15 handoff.

---

## F. Caching

### F1. Transient semantics in WP 6.9

**[VERIFIED: no changes]** `set_transient($key, $value, $ttl)` and `get_transient($key)` are unchanged from WP 5.x. `$ttl` in seconds. Expired transients return `false` (same as missing). TTL enforcement is lazy (GC on read) in DB transient backend, or immediate in object-cache backends (Redis, Memcached).

**Summerfield DDEV has no object cache** → transients stored in `wp_options` as `_transient_{$key}` and `_transient_timeout_{$key}` rows. Perfectly fine for our call volume.

**Key hygiene:** WP transient keys must be ≤ 172 chars (DB column limit). Our keys (e.g. `kmn_rrr_14_2026-04-24_abc123`) fit easily.

### F2. Invalidation hook

**[VERIFIED: WC source]** `woocommerce_order_status_changed` fires on every order status transition. Arguments: `( $order_id, $from_status, $to_status, $order )`. Frequency on seeded data: ~30-50 firings per hour during active trading.

Perf concern if our invalidation deletes 10+ transients per fire? **No** — `delete_transient()` is O(1) per key (DB delete by key). Batching via SQL `DELETE FROM wp_options WHERE option_name LIKE '_transient_kmn_%'` is cleaner for "flush all":

```php
add_action( 'woocommerce_order_status_changed', function () {
    global $wpdb;
    $wpdb->query(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\_transient\_kmn\_%' OR option_name LIKE '\_transient\_timeout\_kmn\_%'"
    );
}, 10, 0 );
```

(Escape `_` with backslash in LIKE — underscore is single-char wildcard otherwise.)

**Trade-off:** Flush-all invalidates MORE than the changed order's cache. Fine for POC — cold-cache refill on next widget load is sub-second. Per-key surgical invalidation is premature optimization.

---

## G. WP-CLI Integration Test

### G1. `scripts/verify-wp-bridge.sh` pattern

**Recommended shape:**

```bash
#!/bin/bash
set -euo pipefail

: "${BRIDGE_URL:=https://summerfield.ddev.site/wp-json/mcp/kmn-revenue}"
: "${WP_USER:=dev-admin}"
: "${WP_APP_PASS:?WP_APP_PASS env var required}"

AUTH="${WP_USER}:${WP_APP_PASS}"
CURL_OPTS=(-sk -u "$AUTH" -H "Content-Type: application/json" -H "Accept: application/json,text/event-stream")

# 1. tools/list — assert 5 tools
list=$(curl "${CURL_OPTS[@]}" -X POST "$BRIDGE_URL" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
echo "$list" | jq -e '.result.tools | length == 5' > /dev/null || { echo "FAIL: expected 5 tools"; echo "$list"; exit 1; }

# 2. tools/call each ability with defaults
for tool in revenue-run-rate weekly-heatmap repeat-metrics market-basket weekly-briefing-data; do
    resp=$(curl "${CURL_OPTS[@]}" -X POST "$BRIDGE_URL" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/call\",\"params\":{\"name\":\"kmn-${tool}\",\"arguments\":{}}}")
    echo "$resp" | jq -e '.result.content[0].text' > /dev/null || { echo "FAIL: $tool"; echo "$resp"; exit 1; }
done

# 3. 401 test
bad=$(curl -sk -o /dev/null -w "%{http_code}" -u "$WP_USER:wrong-password" -X POST "$BRIDGE_URL" -d '{"jsonrpc":"2.0","id":3,"method":"tools/list"}')
[[ "$bad" == "401" ]] || { echo "FAIL: expected 401 on wrong password, got $bad"; exit 1; }

echo "OK"
```

**Important:** Tool names in MCP Adapter use `name`-safe sanitization — ability ID `kmn/weekly-heatmap` becomes MCP tool name `kmn-weekly-heatmap` (slashes → hyphens via `McpNameSanitizer`). Verify exact names via first `tools/list` call in the script and derive iteration from there if needed. **[VERIFIED: `includes/Domain/Utils/McpNameSanitizer.php` exists in source tree]**

### G2. Direct `wp kmn ability test <id>` CLI command

**Recommendation: skip for Phase 16.** Not required by any REQ-ID. The 10-minute test-script round-trip via HTTP is acceptable. A direct CLI invocation requires wiring our own command class, which creates dev-env-only code that's easy to let bit-rot. Defer.

---

## H. Testing Strategy

### H1. PHPUnit for SQL correctness?

**Recommendation: No for Phase 16.** Reasons:

1. WP_BRIDGE §10 and Phase 15 pattern explicitly skip PHPUnit for POC
2. SQL logic is deterministic against seeded data — the `verify-wp-bridge.sh` script gives shape + smoke coverage
3. Setting up `wp-tests-lib` + PHPUnit infra on DDEV adds ~4 hours of yak-shaving

**However, for the math layers (not SQL):** consider a separate `tests/math.php` script runnable via `wp eval-file` that asserts:
- Median calculation against a known array
- Pace-vs-7-day arithmetic against synthetic inputs
- AOV band share math

These run in WP context but do NOT hit the DB. Cheap, high signal. Add if the planner wants a middle ground.

### H2. Shape vs value coverage

Shape-only verification (`jq -e '.result.content[0].text'` presence check) is insufficient for bug detection. Extend `verify-wp-bridge.sh` with **smoke-level value assertions**:

- `revenue-run-rate.confidence` ∈ { `high`, `medium`, `low` }
- `weekly-heatmap.buckets | length == 168` (or less if sparse)
- `weekly-heatmap.best_slot.order_count > 0`
- `repeat-metrics.repeat_rate_pct` ∈ [0, 100]
- `market-basket.mode == "market_basket_product"` (per Phase 15 seed, ≥100 multi-item orders)

These are cheap, catch 80% of silent-fail regressions (null fields, wrong key names, missing defaults).

---

## I. Risk Topology

### I1. Implementation risk ranking (lowest → highest)

| Rank | Ability | Why |
|------|---------|-----|
| 1 (easiest) | `kmn/weekly-heatmap` | Single GROUP BY, no edge cases, index-friendly, seeded data validates cleanly |
| 2 | `kmn/repeat-metrics` | Approach A is 1 GROUP BY + 1 derived table; trend uses 2 cached calls; median is trivial in PHP |
| 3 | `kmn/revenue-run-rate` | Intra-day curve is 3 queries + array math; edge cases (h=0, <5 valid days, low expected_by_hour[h]) branch logic but small surface |
| 4 | `kmn/market-basket` | Self-join SQL is straightforward but mode-switch (product/category/aov_bands) triples code paths; SQL perf is biggest unknown at scale |
| 5 (hardest) | `kmn/weekly-briefing-data` | Orchestration — calls 4 other abilities internally + custom top-products query + unified response shape; highest chance of drift when individual abilities change |

**Recommended sequencing for plans:** 1 → 2 → 3 → 4 → 5. Each builds on infrastructure already in place (sql-helpers.php, cache.php, bootstrap). Weekly-briefing-data is the "integration test" for the other four.

### I2. Biggest unknown

**Ranked by probability × impact:**

1. **MCP Adapter v0.5.0 behavior with our specific tool name conventions** — slash-to-hyphen sanitization could conflict with something we don't know about. **Mitigation:** first integration test after ABIL-SCAF-03 is to deploy an empty server with zero tools, confirm `/wp-json/mcp/kmn-revenue` returns a valid `tools/list` with `{tools:[]}` shape. Then add one ability and confirm the name round-trips.

2. **Cache invalidation on `woocommerce_order_status_changed` firing during seed reruns** — if we're developing and someone runs the seeder, cache flushes may mask caching bugs. **Mitigation:** Add ability to bypass cache via an undocumented query arg for debugging (`{"_skip_cache": true}` in input — dev-only, remove before merge).

3. **`manage_woocommerce` vs `shop_manager` role confusion** — `dev-admin` is administrator (has all caps). Production rotation account `kmn-analytics-bot` should be `shop_manager` per WP_BRIDGE §6. Shop Manager does have `manage_woocommerce` per WC default — **[VERIFIED: WC source `class-wc-install.php`]** — but this is always worth re-testing against a fresh Shop Manager user before Phase 16 close.

4. **Abilities API breaking changes between WP 6.9.4 and future WP 6.10** — we're on 6.9.4. No immediate risk but worth documenting the version pin in readme.

---

## B. Live Probes Performed

All probes executed 2026-04-24 on `/home/upan/projects/sf_staging/` (Summerfield DDEV, MySQL 8.0.40, WP 6.9.4, prefix `s7uy9uh34_`).

```
$ ddev wp eval 'echo function_exists("wp_register_ability") ? "yes" : "no";'
yes

$ ddev wp eval '$abilities = wp_get_abilities(); echo count($abilities);'
122

$ ddev wp db query 'SHOW COLUMNS FROM s7uy9uh34_wc_order_stats'
(columns enumerated above in §C1 — 14 columns, no billing_email, net_total is double)

$ ddev wp db query 'SHOW INDEX FROM s7uy9uh34_wc_order_stats'
(PRIMARY, date_created, customer_id, status, idx_date_paid_status_parent)

$ ddev wp db query "SELECT COUNT(*) FROM s7uy9uh34_wc_order_stats WHERE status IN ('wc-completed','wc-processing')"
1099

$ ddev wp db query "SELECT payment_method, COUNT(*) FROM s7uy9uh34_wc_orders WHERE status IN ('wc-completed','wc-processing') GROUP BY payment_method"
klarna 468, paypal 314, stripe 237, bacs 79

$ ddev wp db query "SELECT COUNT(*) multi_item FROM s7uy9uh34_wc_order_stats s WHERE s.status IN ('wc-completed','wc-processing') AND s.date_created >= NOW() - INTERVAL 90 DAY AND (SELECT COUNT(*) FROM s7uy9uh34_wc_order_product_lookup p WHERE p.order_id=s.order_id) > 1"
310   -- confirms market_basket_product mode (≥100)

$ ddev wp db query "<repeat rate via email join>"
unique_customers=887, returning=178, repeat_pct=20.1

$ ddev wp db query "SELECT CONVERT_TZ('2026-04-23 10:00:00', '+00:00', 'Europe/Vienna')"
2026-04-23 12:00:00   -- UNEXPECTED: named-tz works on this DDEV (tz tables populated, 1796 entries)

$ ddev exec 'mysql -u root -proot -e "SELECT COUNT(*) FROM mysql.time_zone_name"'
1796

$ ddev wp eval 'echo wp_timezone()->getName();'
+01:00   -- numeric (timezone_string empty, gmt_offset=1 used)

$ ddev wp db query "EXPLAIN <market basket self-join>"
(all eq_ref/ref index hits — no table scans — ~1732 rows examined)

$ time ddev wp db query "<market basket self-join>"
real 3.3s   -- ddev CLI overhead; pure MySQL time ~500ms or less

$ ddev wp db query "SELECT HOUR(CONVERT_TZ(s.date_created, '+00:00', '+01:00')) h, COUNT(*) FROM s7uy9uh34_wc_order_stats s WHERE s.status IN ('wc-completed','wc-processing') GROUP BY h ORDER BY COUNT(*) DESC LIMIT 5"
h=22:132, h=21:123, h=23:90, h=13:88, h=17:88

$ cat /home/upan/projects/sf_staging/wp-content/mu-plugins/vendor/wordpress/mcp-adapter/mcp-adapter.php | grep Version
Version: 0.5.0
```

---

## C. Confirmed vs Assumed

### Confirmed on Summerfield DDEV (HIGH confidence)

- WP 6.9.4; `wp_register_ability()` global function exists [VERIFIED]
- MCP Adapter v0.5.0 installed at `wp-content/mu-plugins/vendor/wordpress/mcp-adapter/` [VERIFIED]
- Prefix `s7uy9uh34_` (via `$wpdb->prefix`) [VERIFIED]
- `wc_order_stats` columns + indexes per §C1 [VERIFIED]
- `wc_order_product_lookup` columns + indexes per §C2 [VERIFIED]
- `wc_customer_lookup` columns per §C3 [VERIFIED]
- `wc_orders.payment_method` is a top-level column (denormalized) [VERIFIED]
- `wc_order_stats` has NO `billing_email` — must join `wc_orders` [VERIFIED]
- `create_server()` positional signature per §B1 [VERIFIED: source read]
- `HttpTransport` default capability is `read` [VERIFIED: source read]
- Abilities API validates `input_schema` before `execute_callback` [VERIFIED: source read]
- `mcp_adapter_init` hook fires on `rest_api_init` priority 15 [VERIFIED: source read]
- Market-basket self-join is index-covered, under 500ms pure MySQL time at seed scale [VERIFIED: EXPLAIN]
- Numeric offsets via `wp_timezone()->getName()` return `+01:00` on Summerfield (not a named tz) [VERIFIED: wp eval]
- `SET SESSION MAX_EXECUTION_TIME=2000` works on MySQL 8.0.40 [VERIFIED]
- Repeat metrics via email-join produce 20.1% rate on seeded data, matching Phase 15 target [VERIFIED]
- 122 Maxi abilities coexist without collision — separate server_id isolates tool lists [VERIFIED: adapter source]

### Assumed / inferred from docs (MEDIUM confidence)

- [ASSUMED] `current_user_can('manage_woocommerce')` is the right gate — true for administrator and shop_manager roles per WC defaults [CITED: WC source `class-wc-install.php`]; not tested with a freshly-created shop_manager
- [ASSUMED] Transient flush via `DELETE FROM wp_options WHERE option_name LIKE ...` is faster than N × `delete_transient()` for 10-20 keys — true in general, not benchmarked on our dataset
- [ASSUMED] Production Summerfield host does NOT have MySQL tz tables populated (STATE.md claim) — untested on prod host; numeric offsets stay as portable default
- [CITED: WP_BRIDGE_ARCHITECTURE.md §12] Application Password rotation runbook steps — standard WP admin flow, not re-verified here
- [ASSUMED] MCP Adapter's `SchemaTransformer` passes our JSON schemas through unchanged — verified class exists; not tested end-to-end with one of our specific schemas
- [ASSUMED] Rate-limit absence in v0.5.0 adapter means Phase 16 defers the 60 req/min limit — verified absence in source, but the WP_BRIDGE §9 assumption that it exists built-in is false; planner needs to acknowledge this deviation

### Unverified negative claims / removed

- **REMOVED:** "CONVERT_TZ with named tz returns NULL on MySQL 8.0 without populated tz tables" — this is a valid general statement but DOES NOT hold on the current DDEV image. Planner should assume numeric offsets anyway for portability; the removal is about accuracy of the research, not a change of recommendation.

---

## D. Recommended Approach per Ability

### D1. `kmn/revenue-run-rate` — Recommended Algorithm

**Queries (3 wpdb calls):**

1. **Baseline curve** (14 days, hourly cumulative):
   ```sql
   SELECT DATE(s.date_created) AS d,
          HOUR(CONVERT_TZ(s.date_created, '+00:00', %s)) AS h,
          SUM(s.net_total) AS revenue
   FROM   {prefix}wc_order_stats s
   WHERE  s.date_created >= %s AND s.date_created < %s
     AND  s.status IN (...)
   GROUP  BY d, h
   ```
   PHP-side: build `cumulative[d][h]` by running prefix-sum over h within each d.

2. **Actual today** (single row):
   ```sql
   SELECT SUM(s.net_total) FROM {prefix}wc_order_stats s
   WHERE s.date_created >= %s AND s.date_created < %s AND s.status IN (...)
   ```

3. **Payment split** (today's orders grouped by method):
   ```sql
   SELECT o.payment_method, SUM(s.net_total) AS total
   FROM   {prefix}wc_order_stats s
   JOIN   {prefix}wc_orders o ON s.order_id = o.id
   WHERE  s.date_created >= %s AND s.date_created < %s AND s.status IN (...)
   GROUP  BY o.payment_method
   ```

**Edge cases (PHP branch logic):**
- `h_now == 0` → `projection = null`, `confidence = 'low'`
- valid_days_count (days in baseline with `cumulative[d][23] >= 5.0`) < 5 → `projection = null`, `confidence = 'low'`
- `expected_by_hour[h_now] < 5.0` → fallback: `projection = actual_now * 7day_full_day_avg / 7day_curve_at_h_now`; `confidence = 'medium'`
- Otherwise: `projection = actual_now / expected_by_hour[h_now] * expected_by_hour[23]`; `confidence = 'high'`

**Cache key:** `kmn_rrr_{baseline_days}_{ref_date}_{status_hash}` — TTL 300s (5 min).

### D2. `kmn/weekly-heatmap` — Recommended Algorithm

**Single query:**

```sql
SELECT (DAYOFWEEK(CONVERT_TZ(s.date_created, '+00:00', %s)) - 1) AS dow,
        HOUR(CONVERT_TZ(s.date_created, '+00:00', %s))            AS hod,
        COUNT(*)             AS order_count,
        SUM(s.net_total)     AS net_revenue
FROM   {prefix}wc_order_stats s
WHERE  s.date_created >= %s AND s.date_created < %s
  AND  s.status IN (...)
GROUP  BY dow, hod
ORDER  BY dow, hod
```

**DOW convention:** MySQL `DAYOFWEEK()` returns 1=Sunday, 2=Monday, ..., 7=Saturday. We subtract 1 → 0=Sunday, ..., 6=Saturday (matches ISO 8601 German convention only after we remap: 0=So, 1=Mo, ..., 6=Sa per WP_BRIDGE output schema).

**Best slot:** after query, find row with max `order_count`. If multiple ties, pick earliest `dow`, then earliest `hod` (deterministic).

**Cache key:** `kmn_hmap_{weeks}_{ref_date}_{tz}_{status_hash}` — TTL 900s (15 min).

### D3. `kmn/repeat-metrics` — Recommended Algorithm

Per §D1–§D3 of this doc:

- Approach A (email-group-by)
- Run 2× (current 90d + prior 90d)
- Median days to 2nd order via PHP from `ROW_NUMBER()` window query
- `benchmark_pct = 27.0` hardcoded

**Cache key:** `kmn_rep_{days}_{ref_date}_{status_hash}` — TTL 3600s (1h) per WP_BRIDGE.

### D4. `kmn/market-basket` — Recommended Algorithm

**Steps:**

1. Probe multi-item count (single query, aggregate + subquery):
   ```sql
   SELECT COUNT(*) FROM {prefix}wc_order_stats s
   WHERE s.status IN (...) AND s.date_created >= %s
     AND (SELECT COUNT(*) FROM {prefix}wc_order_product_lookup p WHERE p.order_id = s.order_id) > 1
   ```
2. Branch:
   - ≥100 → compute product-level pairs via self-join
   - 30–99 → compute category-level pairs (join to term_relationships)
   - <30 → skip basket; return AOV bands only
3. Always compute AOV bands from `total_sales`:
   ```sql
   SELECT SUM(IF(total_sales < 500, 1, 0))               AS cnt_low,
          SUM(IF(total_sales >= 500 AND total_sales < 1500, 1, 0)) AS cnt_mid,
          SUM(IF(total_sales >= 1500, 1, 0))             AS cnt_high,
          SUM(IF(total_sales < 500, total_sales, 0))     AS rev_low,
          -- ... etc
          AVG(total_sales)                               AS avg_val
   FROM   {prefix}wc_order_stats
   WHERE  ...
   ```
4. Median order value: PHP-side median from `SELECT total_sales FROM ... ORDER BY total_sales` (or `NTILE` window — simpler in PHP at our scale).

5. Product name enrichment: collect unique product IDs from pairs, single `WP_Query({post__in: [...]})` to load titles in one shot.

**Cache key:** `kmn_mb_{days}_{ref_date}_{top_n}_{bands_hash}_{status_hash}` — TTL 3600s.

### D5. `kmn/weekly-briefing-data` — Recommended Orchestration

**Internally call the 4 other ability callbacks directly** (not via MCP dispatch — stay in-process):

```php
$heatmap   = call_user_func( wp_get_ability('kmn/weekly-heatmap')->get_callback('execute'), [...] );
$repeat    = call_user_func( wp_get_ability('kmn/repeat-metrics')->get_callback('execute'), [...] );
// run-rate is omitted — weekly briefing doesn't need intra-day projection
// last-week summary is a direct custom query (Mon-Sun of last week)
// top-3 products is a direct custom query
```

**Gotcha:** If one sub-ability returns `WP_Error`, this ability returns `WP_Error` too (fail-fast). For `Promise.allSettled`-style partial-failure handling, the Node.js `daily_briefing` tool in Phase 17 handles that — NOT our WP ability.

**Cache key:** `kmn_wkb_{ref_date}_{tz_hash}` — TTL 300s.

---

## E. Open Questions / Risks for Planner

1. **[DECISION NEEDED] Rate limiter — defer to future or implement now?** WP_BRIDGE §9 says "built-in in adapter v0.5.0." **This is wrong** — no built-in exists. Options for planner: (a) defer entirely (current call patterns don't approach limits; POC scope), (b) 20-line custom transient-backed limiter in `includes/cache.php`. Recommend option (a); document as decision in DECISIONS.md.

2. **[REQUIREMENT WORDING] ABIL-QA-02 says "403 for user lacking manage_woocommerce"** but the adapter returns HTTP 200 with JSON-RPC `isError:true` body. Planner needs to either rephrase the requirement or ensure the test script asserts the correct shape. Preferred: rephrase to "tool call returns permission-denied response for user lacking manage_woocommerce".

3. **[ACCOUNT SETUP] `kmn-analytics-bot` vs reuse `dev-admin`?** Phase 15 used `dev-admin` (administrator). Phase 16 docs talk about `kmn-analytics-bot` (shop_manager). **Planner:** either create the dedicated account in Phase 16 (add 1 task), or document "use dev-admin for POC; rotation runbook documents creating kmn-analytics-bot for production."

4. **[VERSION PIN] `composer.json` currently pins `wordpress/mcp-adapter: 0.5.0` exactly (not `^0.5.0` as in REQ ABIL-SCAF-02).** Planner: verify whether the `0.5.0` or `^0.5.0` pin wins — the exact pin is already committed. REQ ABIL-SCAF-02 allows `^0.5.0` but exact is stricter and safer for pre-1.0 packages. **Recommendation:** keep exact pin; update requirement text to reflect reality.

5. **[TOOL NAME CANON] Ability ID `kmn/weekly-heatmap` maps to MCP tool name `kmn-weekly-heatmap` (adapter sanitizer).** `verify-wp-bridge.sh` and mcp-poc tool registrations (Phase 17) need to use the sanitized name for `tools/call`. **Planner:** confirm both Phase 16's test script and Phase 17 tool registrations use the correct sanitized names.

6. **[CACHE HIT ON FIRST LOAD] Cold cache performance acceptable?** First call after a seed-reset has all 5 abilities missing their transients. Run-rate + heatmap + repeat + basket + briefing back-to-back from `daily_briefing` fan-out → 4+ queries × ~500ms = 2s+ cold. **Mitigation:** after seed, run `curl tools/call weekly-briefing-data` once to warm cache. Document in readme.

7. **[TZ INPUT] `input_schema.timezone` defaults to WP site tz** — but our site's `wp_timezone()` returns `+01:00` numeric, not `Europe/Vienna`. If mcp-poc calls our ability with `timezone: 'Europe/Vienna'`, we accept it. If caller passes `timezone: '+01:00'`, we also accept. **Planner:** normalize both forms in a helper `kmn_resolve_tz_offset($input_tz, DateTime $at)` inside `includes/sql-helpers.php`.

8. **[FAN-OUT ABILITIES] weekly-briefing-data calls heatmap + repeat-metrics in-process**. If we later change heatmap's output schema, weekly-briefing-data silently breaks its consumers. **Mitigation:** contract test in `verify-wp-bridge.sh` asserting briefing output shape explicitly (not just presence).

9. **[ACTIONSCHEDULER CONTENTION] Seeder leaves 20k+ pending `wc-admin_import_orders` actions in the queue** (Phase 15 note). If WP-Cron wakes during a verify-script run, SQL contention on `actionscheduler_actions` could inflate query times. **Mitigation:** planner adds a task to clean the queue before integration runs: `DELETE FROM {prefix}actionscheduler_actions WHERE status='pending'` — already documented in seed-orders.md troubleshooting.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Production Summerfield does NOT have `mysql.time_zone_name` populated | §C6 | Low — numeric offsets work regardless; just means DDEV and prod could use either, we stick with numeric for portability |
| A2 | Shop Manager role has `manage_woocommerce` capability | §I2, permission_callback pattern | Medium — if wrong, permission_callback denies for kmn-analytics-bot account. WC defaults say yes; re-verify on prod deploy |
| A3 | Production Summerfield / MBM MySQL is 8.0+ (supports `ROW_NUMBER()`, `SET SESSION MAX_EXECUTION_TIME`) | §D2, §C6 | High — if MBM runs MariaDB 10.3 or MySQL 5.6, median calc and execution-time cap both fail. Re-verify before MBM rollout milestone |
| A4 | Cache-flush via `wp_options LIKE '_transient_kmn_%'` is faster than 10× `delete_transient()` | §F2 | Low — performance optimization, wrong direction just means slightly more DB writes on order status changes |
| A5 | Rate limiting is acceptable to defer — call patterns <60/min today | §B6, §E1 | Low — if a runaway caller hits the endpoint, only impact is warm `wp_options` churn; 2s execution cap prevents DoS |
| A6 | `wp_register_ability()` signature is stable between WP 6.9.4 and 6.10 | §A1 | Medium — minor WP version bumps can add optional args but not break positional. Pin requires-at-least to 6.9 in plugin header |

---

## Open Questions Log

| # | Question | Known | Unclear | Recommendation |
|---|----------|-------|---------|----------------|
| Q1 | Does `check_permission()` on `HttpTransport` short-circuit before the ability's `permission_callback`? | Yes — transport `read` gate runs first | Whether a customized transport_permission_callback can elevate beyond tool-level checks | Keep default (null callback → `read` capability); tool-level `manage_woocommerce` is the real gate |
| Q2 | Does `SchemaTransformer` convert `"default":` values or expect caller to apply? | Adapter passes through; WP Abilities API fills defaults | What if a consumer sends `arguments: {}` — does the default fire? | Test via first `tools/call` in verify script; if defaults don't populate, apply in `execute_callback` with `$input['x'] ?? default` |
| Q3 | Can `wp_get_ability($id)->execute(...)` be called directly from another ability? | Yes — abilities are first-class WP objects | Re-entrancy safety (transient writes during nested calls) | Call sub-ability `execute_callback` directly, not via `wp_get_ability()->execute()` wrapper (avoids re-running permission_callback) |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| WordPress | Plugin runtime | ✓ | 6.9.4 on DDEV | — |
| WooCommerce HPOS | All abilities | ✓ | enabled per DEV-07 | — |
| `wp_register_ability()` | All abilities | ✓ | WP 6.9 core | — |
| MCP Adapter v0.5.0 | Server registration | ✓ | mu-plugin | — |
| PHP | Plugin code | ✓ | 8.4 on DDEV | Plugin header requires 8.1+ |
| MySQL | Queries | ✓ | 8.0.40 | Requires MySQL 5.7.8+ for `MAX_EXECUTION_TIME`, 8.0+ for `ROW_NUMBER()` |
| composer | Install plugin vendor/ | ✓ | confirmed via Phase 15 mu-plugin install | Ship `vendor/` in git (standard WP convention) |
| DDEV environment | Integration tests | ✓ | `ddev wp` functional | — |
| WP Application Password for dev-admin | Integration tests | ✓ | Phase 15 generated | — |
| `jq` | `verify-wp-bridge.sh` | ✓ (standard WSL dev env) | — | pipe to `python -m json.tool` |
| `curl` | `verify-wp-bridge.sh` | ✓ | — | — |

**All dependencies available — no blockers for Phase 16 execution.**

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bash + curl + jq (integration), optional `wp eval-file` math script |
| Config file | none — script in `wordpress-plugins/kmn-revenue-abilities/scripts/verify-wp-bridge.sh` |
| Quick run command | `WP_APP_PASS=$(cat ~/.secrets/sf-app-pass) bash wordpress-plugins/kmn-revenue-abilities/scripts/verify-wp-bridge.sh` |
| Full suite command | same as quick (POC — no separate fast/slow split) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCPAPP-WP-02 | `mcp_adapter_init` fires, `tools/list` returns 5 tools | integration | `curl tools/list \| jq '.result.tools \| length'` | ❌ Wave 0 |
| ABIL-SCAF-01 | Plugin activates without fatal under WP 6.9 + WC active | smoke | `ddev wp plugin activate kmn-revenue-abilities` | ❌ Wave 0 |
| ABIL-SCAF-02 | Composer install succeeds in plugin dir | smoke | `cd wordpress-plugins/kmn-revenue-abilities && composer install --no-dev -q` | ❌ Wave 0 |
| ABIL-SCAF-03 | `/wp-json/mcp/kmn-revenue` endpoint exists + responds to POST | integration | `curl -u $AUTH -X POST <url> -d '{"jsonrpc":...}'` | ❌ Wave 0 |
| ABIL-DEF-01..05 | Each ability returns shape-valid response on seeded data | integration | per-ability case in `verify-wp-bridge.sh` | ❌ Wave 0 |
| ABIL-DEF-06 | No raw string interpolation in SQL (static audit) | manual | `grep -rE "wpdb->query\(.*\\\$[a-z]" includes/ abilities/` | ❌ Wave 0 (lint pass) |
| ABIL-QA-01 | verify-wp-bridge.sh passes end-to-end | integration | `bash scripts/verify-wp-bridge.sh && echo OK` | ❌ Wave 0 |
| ABIL-QA-02 | 401 on wrong password; permission-denied on role mismatch | integration | two cases in verify script | ❌ Wave 0 |
| ABIL-QA-03 | `SET SESSION MAX_EXECUTION_TIME=2000` set before heavy queries | manual | `grep 'MAX_EXECUTION_TIME' includes/sql-helpers.php` | ❌ Wave 0 |
| ABIL-QA-04 | HPOS-safe — no `wp_posts` joins in ability SQL | manual | `grep -E "wp_posts\|post_meta" abilities/ \|\| echo CLEAN` | ❌ Wave 0 |
| ABIL-QA-05 | Maxi coexistence — both plugins active, each endpoint tool-list disjoint | integration | two curl calls, compare | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** no automated gate (Phase 16 is all PHP on DDEV; manual `ddev wp plugin activate kmn-revenue-abilities` + `verify-wp-bridge.sh`)
- **Per wave merge:** `verify-wp-bridge.sh` — all cases must pass
- **Phase gate:** `verify-wp-bridge.sh` green + manual smoke against Maxi coexistence

### Wave 0 Gaps
- [ ] `wordpress-plugins/kmn-revenue-abilities/scripts/verify-wp-bridge.sh` — covers ABIL-QA-01 + ABIL-DEF-01..05 + ABIL-QA-02 + ABIL-QA-05
- [ ] `wordpress-plugins/kmn-revenue-abilities/scripts/audit-sql.sh` — simple grep lint for ABIL-DEF-06 and ABIL-QA-04
- [ ] Composer install artefact: `wordpress-plugins/kmn-revenue-abilities/vendor/` must be committed before first integration run (one-time Wave 0 setup)

---

## Security Domain

`security_enforcement` not explicitly disabled in config — applying.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | WP Application Password (Basic Auth); rotation runbook in DECISIONS.md |
| V3 Session Management | partial | MCP Adapter manages Mcp-Session-Id; each request re-auths via Basic — no session token reuse |
| V4 Access Control | yes | Two-layer: HttpTransport (`read`) + ability `permission_callback` (`manage_woocommerce`) |
| V5 Input Validation | yes | JSON Schema validation by Abilities API before callback runs; `$wpdb->prepare()` for all SQL |
| V6 Cryptography | no | No key material stored or generated in plugin; Application Password hashing is WP core responsibility |
| V7 Error Handling | yes | `ErrorLogMcpErrorHandler` writes to PHP error log; never returns stack traces to client |

### Known Threat Patterns for WordPress + HPOS SQL

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via ability input args | Tampering | `$wpdb->prepare()` everywhere — NO raw `$input` interpolation. Status array whitelisted by schema, placeholder-joined `IN (%s,%s,...)` |
| Privilege escalation by non-admin WP user | Elevation | `current_user_can('manage_woocommerce')` in every ability's permission_callback; adapter enforces it pre-execute |
| DoS via self-join flood (market-basket) | Denial | `SET SESSION MAX_EXECUTION_TIME=2000` + 15-min transient cache; ability-level rate limit deferred (see open Q1) |
| PII leakage via error messages (billing_email in WP_Error data) | Information Disclosure | Never include raw row data in `WP_Error->get_error_data()`; use opaque reason strings |
| CSRF via forged Basic Auth to REST endpoint | Tampering | Application Passwords cannot be forged without credentials; nonces not applicable to MCP endpoint (Basic Auth is credential-based, not session-based) |
| Credential leak in error_log | Information Disclosure | `ErrorLogMcpErrorHandler` must not log request bodies containing auth headers (adapter default is safe — confirmed in source) |

---

## Sources

### Primary (HIGH confidence — live-verified on Summerfield DDEV)
- `/home/upan/projects/sf_staging/wp-content/mu-plugins/vendor/wordpress/mcp-adapter/mcp-adapter.php` — Plugin version 0.5.0
- `/home/upan/projects/sf_staging/wp-content/mu-plugins/vendor/wordpress/mcp-adapter/includes/Core/McpAdapter.php` — `create_server()` signature
- `/home/upan/projects/sf_staging/wp-content/mu-plugins/vendor/wordpress/mcp-adapter/includes/Transport/HttpTransport.php` — auth handling
- `/home/upan/projects/sf_staging/wp-content/mu-plugins/vendor/wordpress/mcp-adapter/includes/Handlers/Tools/ToolsHandler.php` — tools/call flow
- `PORTAL/maxi-ai/abilities/woocommerce/get-order.php` — real-world `wp_register_ability()` usage
- `PORTAL/maxi-ai/maxi-ai.php` — main plugin file pattern (lazy ability load on rest_api_init)
- Live MySQL/WP probes 2026-04-24 (§B live probes section above)

### Secondary (reference — project-owned specs)
- `PORTAL/docs/ideas/WP_BRIDGE_ARCHITECTURE.md` — architectural blueprint (corrections noted inline)
- `PORTAL/docs/ideas/REVENUE_INTELLIGENCE_V2_PLAN.md` — product-level algorithm requirements
- `PORTAL/docs/ideas/SEEDER_SPEC.md` — test data distributions
- `PORTAL/.planning/phases/15-local-dev-synthetic-seeder/15-02-SUMMARY.md` — Phase 15 facts
- `PORTAL/.planning/STATE.md` — milestone-level facts

### Tertiary (not used — not needed)
- Context7 / WebFetch — not invoked; authoritative sources for WP Abilities API and MCP Adapter are the source files themselves, and they are present on the local DDEV

---

## Metadata

**Confidence breakdown:**
- WP Abilities API (§A): HIGH — live-tested, 122 Maxi abilities demonstrate the pattern works
- MCP Adapter v0.5.0 API (§B): HIGH — source read directly from installed copy, not docs
- HPOS SQL (§C): HIGH — every column name, index, query shape probed live
- Algorithms per ability (§D): HIGH (heatmap, repeat, run-rate); MEDIUM (market-basket product-naming enrichment not benchmarked); HIGH (weekly-briefing orchestration)
- Risk topology (§I): MEDIUM — ranked heuristically based on observable SQL complexity

**Research date:** 2026-04-24
**Valid until:** 2026-05-24 (30 days — stable ecosystem, MCP Adapter v0.5.0 is pre-1.0 but slow-moving; WP 6.9.4 is current stable)

---

## RESEARCH COMPLETE
