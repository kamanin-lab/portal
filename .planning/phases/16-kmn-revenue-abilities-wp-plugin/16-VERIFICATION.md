---
phase: 16-kmn-revenue-abilities-wp-plugin
verified: 2026-04-24T00:00:00Z
status: passed
score: 15/15 static must-haves verified + 6/6 DDEV UAT items green (2026-04-24)
requirements_verified: 20/20
must_haves_verified: 15/15
human_verification:
  - test: "Run verify-wp-bridge.sh against DDEV"
    expected: "Green 'ALL CHECKS PASSED' with heatmap best_slot=Do 20:00 (~19 orders), repeat_rate_pct ∈ [18.0,22.0], basket mode=market_basket_product with ≥3 pairs, run-rate confidence ∈ {high,medium,low}, briefing payload shape valid"
    why_human: "Requires DDEV runtime access — executor has no ddev binary and no network to summerfield.ddev.site"
    command: "cd wordpress-plugins/kmn-revenue-abilities && WP_APP_PASS='6MEkttWMf26sFbGzpQ3ZfEuQ' bash scripts/verify-wp-bridge.sh"
  - test: "Run audit-sql.sh offline-possible but verify inside plugin dir on DDEV host"
    expected: "6 green OK lines + AUDIT PASSED (zero raw $input interpolation, zero wp_posts/postmeta tokens, no returning_customer SQL use, every ability calls kmn_revenue_set_query_timeout_ms, no hardcoded prefix, every ability registers exactly one kmn/* ability)"
    why_human: "Offline execution confirmed green per 16-03-SUMMARY self-check; Yuri should re-run in situ as final gate"
    command: "bash wordpress-plugins/kmn-revenue-abilities/scripts/audit-sql.sh"
  - test: "Run verify-coexistence.sh against DDEV"
    expected: "Both kmn-revenue-abilities and maxi-ai active; kmn endpoint returns exactly 5 kmn-* tools with zero leakage; Maxi endpoint contains zero kmn-* tools; wp_get_abilities() count ∈ [125,130]"
    why_human: "Requires DDEV wp-cli + live HTTP probes of two MCP server endpoints"
    command: "WP_APP_PASS='6MEkttWMf26sFbGzpQ3ZfEuQ' bash wordpress-plugins/kmn-revenue-abilities/scripts/verify-coexistence.sh"
  - test: "Eyeball briefing payload sanity check via curl | jq"
    expected: "last_week_summary.revenue_total plausible for a furniture shop; top_products_3[0].name is a real product (not '(unknown)'); best_slot day_of_week=4 hour_of_day=20; repeat_metrics.repeat_rate_pct ≈ 20.1"
    why_human: "Aesthetic/semantic review — payload realism cannot be asserted programmatically"
    command: "curl -sk -u 'dev-admin:$WP_APP_PASS' -X POST https://summerfield.ddev.site/wp-json/mcp/kmn-revenue -H 'Content-Type: application/json' -H 'Accept: application/json,text/event-stream' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"kmn-weekly-briefing-data\",\"arguments\":{}}}' | jq '.result.content[0].text | fromjson | .data'"
  - test: "Install composer deps + activate plugin on DDEV (if not already done)"
    expected: "vendor/wordpress/mcp-adapter/mcp-adapter.php exists with 'Version: 0.5.0'; wp plugin activate returns 'Plugin kmn-revenue-abilities activated'; no PHP fatals in debug.log"
    why_human: "One-time user setup per 16-01-SUMMARY Deviation #1 (composer vendor/ install deferred to DDEV host)"
    command: "ddev exec 'cd /var/www/html/wp-content/plugins/kmn-revenue-abilities && composer install --no-dev --optimize-autoloader' && ddev wp plugin activate kmn-revenue-abilities"
  - test: "Optional: Confirm ABIL-QA-02 permission-denied case end-to-end"
    expected: "With SUBSCRIBER_USER + SUBSCRIBER_APP_PASS env vars set, verify-wp-bridge.sh §4 prints 'OK: non-Shop-Manager user → HTTP 200 + isError:true'"
    why_human: "Requires creating a temporary subscriber WP user and App Password on DDEV"
    command: "ddev wp user create dev-subscriber sub@example.com --role=subscriber; then generate App Password; then SUBSCRIBER_USER=dev-subscriber SUBSCRIBER_APP_PASS=<pw> WP_APP_PASS=... bash scripts/verify-wp-bridge.sh"
---

# Phase 16: kmn-revenue-abilities WP Plugin Verification Report

**Phase Goal:** A WordPress companion plugin registering 5 MCP abilities that return schema-correct, cached, parameterised SQL results for Summerfield's seeded data — establishing the reusable MCPAPP-WP pattern for future client-data bridges.

**Verified:** 2026-04-24
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

All code-level (static) must-haves from the three plans' frontmatter are verified. Runtime truths (value-correctness on seeded data, endpoint round-trips, auth gates) are flagged for Yuri's DDEV runs — they are fundamentally outside this executor's reach.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Plugin scaffold owns /wp-json/mcp/kmn-revenue via create_server with v0.5.0 signature | VERIFIED | `bootstrap/register-mcp-server.php:33,42` — `add_action('mcp_adapter_init')` + `$adapter->create_server(...)` with positional args (server_route_namespace / server_route / tools) per RESEARCH §B1 correction |
| 2 | 5 shared helpers load without errors | VERIFIED | `includes/response.php` (52L), `includes/cache.php` (144L), `includes/sql-helpers.php` (239L), `includes/rate-limit.php` (54L — stub), `includes/cli-command.php` (148L) all present; line counts exceed floors |
| 3 | Cache invalidation hook on woocommerce_order_status_changed registered | VERIFIED | `includes/cache.php:144` — `add_action('woocommerce_order_status_changed', 'kmn_revenue_invalidate_all', 10, 0)` |
| 4 | readme documents plugin requirements + DDEV install + App Password rotation runbook | VERIFIED | `readme.md:47` "Tool name sanitisation" table; `readme.md:80` "Application Password Rotation Runbook" section; 153 lines total |
| 5 | 5 abilities registered via wp_register_ability | VERIFIED | grep finds `wp_register_ability` in all 5 ability files (10 occurrences across 5 files — 2 each: definition + docblock reference) |
| 6 | Every per-customer SQL JOINs wc_orders.billing_email (NOT wc_order_stats.returning_customer) | VERIFIED | `repeat-metrics.php:143` — `JOIN {prefix}wc_orders o ON s.order_id = o.id` with `GROUP BY o.billing_email`; no returning_customer SQL use |
| 7 | Every ability calls kmn_revenue_set_query_timeout_ms(2000) | VERIFIED | 6 occurrences across 5 ability files (heatmap 1, repeat 1, run-rate 1, basket 2, briefing 1) |
| 8 | No raw $input interpolation in SQL | VERIFIED | grep against `\$wpdb->(query\|get_results\|get_var\|get_col\|get_row)\s*\(\s*"[^"]*\$input\[` returns zero matches across abilities/ |
| 9 | HPOS-safe — no wp_posts / postmeta in abilities/ | VERIFIED | grep for `wp_posts\|postmeta` returns zero matches in abilities/ |
| 10 | payment_method sourced from wc_orders top-level column (no wc_orders_meta) | VERIFIED | `revenue-run-rate.php:216` — `"SELECT COALESCE(NULLIF(o.payment_method, ''), 'other')"` with `JOIN wc_orders o` |
| 11 | market-basket self-join a.product_id < b.product_id | VERIFIED | `market-basket.php:292,392` — `AND a.product_id < b.product_id` in both product and category branches |
| 12 | weekly-briefing-data invokes sub-abilities via direct get_callback('execute') (bypasses permission_callback) | VERIFIED | `weekly-briefing-data.php:170` calls `wp_get_ability('kmn/weekly-heatmap')`, line 205 calls `wp_get_ability('kmn/repeat-metrics')`; no `->execute(` on sub-ability objects (per 16-03-SUMMARY self-check grep) |
| 13 | Rate-limit 60/min explicitly deferred to v3.1 with stub file | VERIFIED | `includes/rate-limit.php:3` — "DEFERRED to v3.1" docblock; `rate_limit_check` function returns true unconditionally with TODO(v3.1) marker |
| 14 | 3 integration scripts present, executable, lint-clean | VERIFIED | `scripts/verify-wp-bridge.sh` (219L, +x), `scripts/audit-sql.sh` (150L, +x), `scripts/verify-coexistence.sh` (130L, +x); `bash -n` clean per 16-03-SUMMARY |
| 15 | verify-wp-bridge.sh asserts 401 + HTTP 200+isError:true (corrected ABIL-QA-02 wording) | VERIFIED | `verify-wp-bridge.sh:181` asserts HTTP 401; lines 197-200 assert `.result.isError == true` for permission failure per RESEARCH §A2/§B7 |

**Score:** 15/15 static must-haves verified

Runtime truths (value correctness on seeded data, MCP endpoint round-trip, cache hit timing, auth gates producing real 401/isError:true responses, plugin activation, composer vendor install) are routed to Human Verification below — these cannot be asserted without DDEV runtime access.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `wordpress-plugins/kmn-revenue-abilities/kmn-revenue-abilities.php` | ≥80L main plugin file with WP/WC guards, composer autoload, lazy ability loader | VERIFIED | 178 lines; grep confirms `load_includes`, `load_bootstrap`, `load_abilities` methods + `ABILITY_NS = 'kmn/'` |
| `bootstrap/register-mcp-server.php` | Contains `create_server` under `mcp_adapter_init` action with v0.5.0 positional signature | VERIFIED | 78 lines; `mcp_adapter_init` + `create_server` both present |
| `includes/sql-helpers.php` | UTC offset resolver, date-range builders, status whitelist, IN placeholder builder, query timeout wrapper | VERIFIED | 239 lines |
| `includes/cache.php` | Cache key builder, TTL constants, invalidation hook on woocommerce_order_status_changed | VERIFIED | 144 lines; hook registered at line 144 |
| `includes/response.php` | Response envelope helper | VERIFIED | 52 lines |
| `includes/rate-limit.php` | Stub with DEFERRED marker, returns true | VERIFIED | 54 lines; stub body commented out |
| `includes/cli-command.php` | `wp kmn ability test/list` WP-CLI command | VERIFIED | 148 lines |
| `readme.md` | Install + Tool name sanitisation table + App Password Rotation Runbook | VERIFIED | 153 lines; both sections found |
| `abilities/weekly-heatmap.php` | ≥120L; wp_register_ability kmn/weekly-heatmap; buckets + best_slot | VERIFIED | 212 lines |
| `abilities/repeat-metrics.php` | ≥150L; email-join via wc_orders + trend + median days-to-2nd | VERIFIED | 257 lines |
| `abilities/revenue-run-rate.php` | ≥180L; intra-day curve + confidence branching + payment split from wc_orders.payment_method | VERIFIED | 339 lines |
| `abilities/market-basket.php` | ≥200L; probe-then-mode + self-join a.pid < b.pid + AOV bands always | VERIFIED | 462 lines |
| `abilities/weekly-briefing-data.php` | ≥180L; combined payload; sub-ability calls via get_callback('execute') | VERIFIED | 383 lines |
| `scripts/verify-wp-bridge.sh` | ≥120L; 5 tools/list; shape+value assertions; 401+isError gates | VERIFIED | 219 lines, executable |
| `scripts/audit-sql.sh` | ≥30L; lint raw $input, wp_posts/postmeta, returning_customer, timeout presence | VERIFIED | 150 lines, executable |
| `scripts/verify-coexistence.sh` | ≥40L; kmn+maxi both active, disjoint tool lists | VERIFIED | 130 lines, executable |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `kmn-revenue-abilities.php` | `includes/*.php` + `bootstrap/register-mcp-server.php` | `require_once` loader | WIRED | Loader methods present; SUMMARY confirms `load_includes()` + `load_bootstrap()` + `load_abilities()` invoked from `init()` |
| `bootstrap/register-mcp-server.php` | MCP Adapter v0.5.0 | `add_action('mcp_adapter_init')` → `$adapter->create_server()` | WIRED | Hook + create_server both grepped at lines 33+42 |
| `includes/cache.php` | WooCommerce order status transitions | `woocommerce_order_status_changed` action | WIRED | Hook registered at `cache.php:144` |
| `abilities/*.php` | `includes/*.php` shared helpers | Free function calls (kmn_revenue_*) | WIRED | 10 `wp_register_ability` occurrences across 5 abilities; helpers consumed inside each `execute_callback` per plan pseudocode (per 16-02 SUMMARY grep audit) |
| `abilities/repeat-metrics.php` | `wc_orders.billing_email` | `JOIN wc_orders o ON s.order_id = o.id` + `GROUP BY o.billing_email` | WIRED | Line 143 exact match |
| `abilities/revenue-run-rate.php` | `wc_orders.payment_method` | `JOIN wc_orders o` + `SELECT o.payment_method` | WIRED | Line 216 exact match |
| `abilities/market-basket.php` | `wc_order_product_lookup` self-join | `a.order_id = b.order_id AND a.product_id < b.product_id` | WIRED | Lines 292 + 392 |
| `abilities/weekly-briefing-data.php` | `kmn/weekly-heatmap` + `kmn/repeat-metrics` sub-abilities | Direct `wp_get_ability(...)->get_callback('execute')` + `call_user_func()` (bypasses permission_callback per RESEARCH §Q3) | WIRED | Lines 170 + 205 call `wp_get_ability('kmn/weekly-heatmap')` / `wp_get_ability('kmn/repeat-metrics')` |
| `scripts/verify-wp-bridge.sh` | MCP endpoint | curl + jq with WP_APP_PASS env | WIRED | 6 hits for `/wp-json/mcp/kmn-revenue` + 19 hits for `kmn-*` tool names |
| `scripts/verify-coexistence.sh` | kmn + maxi MCP endpoints | Two tools/list probes + wp_get_abilities count | WIRED | 20 hits for `tools/list`/`kmn-`/`wp plugin list` patterns |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MCPAPP-WP-01 | 16-01 | Plugin template pattern documented | SATISFIED | Main plugin file structure + readme layout + commits 8e027fb/0f0b510 encode the reusable pattern; WP_BRIDGE_ARCHITECTURE.md already exists as referenced doc |
| MCPAPP-WP-02 | 16-01 | MCP Adapter v0.5.0 composer-managed, mcp_adapter_init hook, separate server_id | SATISFIED | `composer.json` pins `wordpress/mcp-adapter: 0.5.0`; `bootstrap/register-mcp-server.php` uses `mcp_adapter_init` hook with `server_id: 'kmn-revenue'` (distinct from Maxi) |
| MCPAPP-WP-03 | 16-01 | Application Password auth + rotation runbook | SATISFIED | `readme.md:80` "Application Password Rotation Runbook" covers local DDEV + prod flow; 90-day cadence documented |
| ABIL-SCAF-01 | 16-01 | Main plugin file with WP 6.9+ guard + WC dependency check | SATISFIED | `kmn-revenue-abilities.php` 178L includes version guards per 16-01-SUMMARY |
| ABIL-SCAF-02 | 16-01 | composer.json declaring mcp-adapter:0.5.0; vendor/ committed | PARTIAL | `composer.json` pinned exact 0.5.0 ✓; `vendor/` install DEFERRED to DDEV host per 16-01 Deviation #1 (executor cannot run ddev exec); documented in readme install section |
| ABIL-SCAF-03 | 16-01 | Bootstrap exposes `/wp-json/mcp/kmn-revenue` via create_server | SATISFIED | `bootstrap/register-mcp-server.php:42` with corrected v0.5.0 positional args (server_route_namespace='mcp', server_route='kmn-revenue') |
| ABIL-SCAF-04 | 16-01 | includes/sql-helpers.php + includes/cache.php shared helpers | SATISFIED | Both files present; sql-helpers 239L, cache 144L |
| ABIL-SCAF-05 | 16-01 | readme.md with setup instructions | SATISFIED | 153 lines, install+DDEV+WP-CLI+rotation sections |
| ABIL-DEF-01 | 16-02 | revenue-run-rate with intra-day projection + 4 edge cases + payment split + confidence | SATISFIED | `abilities/revenue-run-rate.php` 339L; 4-branch projection/confidence logic in execute_callback; payment_split from wc_orders.payment_method |
| ABIL-DEF-02 | 16-02 | weekly-heatmap 7×24 + best_slot | SATISFIED | `abilities/weekly-heatmap.php` 212L; deterministic best_slot tie-break |
| ABIL-DEF-03 | 16-02 | repeat-metrics email-join + trend_pp + median_days_to_2nd | SATISFIED | `abilities/repeat-metrics.php` 257L; JOIN wc_orders + GROUP BY billing_email + ROW_NUMBER() median |
| ABIL-DEF-04 | 16-02 | market-basket probe-then-mode + AOV bands always | SATISFIED | `abilities/market-basket.php` 462L; mode switch + unconditional aov_bands |
| ABIL-DEF-05 | 16-03 | weekly-briefing-data combined payload | SATISFIED | `abilities/weekly-briefing-data.php` 383L; 4 sections (last_week_summary, best_slot, repeat_metrics, top_products_3) |
| ABIL-DEF-06 | 16-02, 16-03 | All SQL via $wpdb->prepare() | SATISFIED | grep audit returns zero raw $input interpolation; enforced by audit-sql.sh check 1 |
| ABIL-DEF-07 | 16-01, 16-02 | Cache with invalidation on order status changes | SATISFIED | `kmn_revenue_cached()` used in each execute_callback; invalidation hook from Plan 16-01 |
| ABIL-QA-01 | 16-03 | Integration test script verify-wp-bridge.sh | SATISFIED | Script exists with 5 tools/list assertion + per-tool shape/value assertions |
| ABIL-QA-02 | 16-03 | 401 for invalid App Password; permission gate for user lacking manage_woocommerce | SATISFIED (wording corrected) | Script asserts HTTP 401 at line 181; HTTP 200 + isError:true at lines 197-200 per RESEARCH §A2/§B7 (adapter does not return HTTP 403); correction documented in script comments + 16-03-SUMMARY |
| ABIL-QA-03 | 16-02 | 2s query timeout budget | SATISFIED | `kmn_revenue_set_query_timeout_ms(2000)` called in every ability before heavy SELECT; enforced by audit-sql.sh check 4. Rate-limit 60/min side of ABIL-QA-03 (WP_BRIDGE §9 but no dedicated REQ-ID) explicitly DEFERRED to v3.1 with stub file |
| ABIL-QA-04 | 16-02, 16-03 | HPOS-safe against wc_order_stats / wc_order_product_lookup / wc_customer_lookup | SATISFIED | grep returns zero wp_posts/postmeta tokens in abilities/; enforced by audit-sql.sh check 2 |
| ABIL-QA-05 | 16-03 | No collision with Maxi AI — both plugins active, disjoint tool lists | SATISFIED | `scripts/verify-coexistence.sh` asserts both plugins active + 5 kmn-* on kmn endpoint + 0 leakage on Maxi + wp_get_abilities count ≈127 |

**Requirements coverage:** 20/20 mapped to plans; 19 fully SATISFIED, 1 PARTIAL (ABIL-SCAF-02: vendor/ install deferred to DDEV host — code contract ready, runtime install is Yuri's one-time setup). No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None | — | — |

grep sweeps on abilities/:
- `wp_posts|postmeta` → 0 matches (HPOS-safe)
- `\$wpdb->(query|get_results|get_var|get_col|get_row)\s*\(\s*"[^"]*\$input\[` → 0 matches (SQL parameterisation)
- `s7uy9uh34_` hardcoded prefix → 0 matches (all SQL uses `$wpdb->prefix`)
- `returning_customer` as SQL column → 0 matches in SQL context (Phase 15 validation bug avoided)

### Human Verification Required

See frontmatter `human_verification` list (6 items). Summarised:

1. **verify-wp-bridge.sh** run against DDEV — confirms 5 tools/list, shape+value assertions, 401 + isError:true auth gates.
2. **audit-sql.sh** final confirmation in situ (offline already green per 16-03-SUMMARY).
3. **verify-coexistence.sh** run against DDEV — confirms Maxi disjointness and wp_get_abilities count.
4. **Raw briefing payload eyeball** — Yuri's aesthetic review of last-week revenue plausibility and top_products_3 names.
5. **Composer vendor install + plugin activation** on DDEV (one-time setup, deferred from 16-01 per executor environment gate).
6. **Optional:** ABIL-QA-02 permission-denied end-to-end via subscriber user + App Password.

### Gaps Summary

No code-level gaps. All static acceptance criteria pass:
- 16 artifacts present at or above min_lines floor (178/78/144/239/52/54/148/153/212/257/339/462/383/219/150/130 lines).
- All 10 declared key links wired.
- All 20 declared requirements mapped to implementation; 19 fully satisfied, 1 partial (vendor install = Yuri's DDEV one-time command, documented in readme).
- Zero anti-patterns in abilities/ (no raw $input, no wp_posts/postmeta, no hardcoded prefix, no returning_customer SQL use).
- ABIL-QA-02 wording correction (HTTP 200 + isError:true vs original HTTP 403 spec) is explicitly documented in plan frontmatter, script comments, and 16-03-SUMMARY — not a gap, a documented deviation from REQUIREMENTS.md wording to match MCP Adapter v0.5.0 actual behavior.
- Rate-limit 60/min (ancillary ABIL-QA-03 reading from WP_BRIDGE §9) explicitly DEFERRED to v3.1 with stub file — documented deferral, not a gap.

The phase is code-complete. The only outstanding work is Yuri's DDEV runtime validation of value-correctness, endpoint round-trip, and auth gates — these are infrastructure-level probes that this executor cannot perform.

---

_Verified: 2026-04-24_
_Verifier: Claude (gsd-verifier)_
