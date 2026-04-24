---
phase: 16-kmn-revenue-abilities-wp-plugin
plan: 01
subsystem: wordpress-plugins/kmn-revenue-abilities
tags:
  - wordpress
  - mcp-adapter
  - woocommerce
  - plugin-scaffold
  - abilities-api
dependency-graph:
  requires:
    - Phase 15 (local-dev-synthetic-seeder) — DDEV + MCP Adapter v0.5.0 at mu-plugins + seeded WC data
  provides:
    - Activatable plugin owning /wp-json/mcp/kmn-revenue
    - Shared helpers (response envelope, cache, sql, rate-limit stub) for Plan 16-02 abilities
    - WP-CLI tester (wp kmn ability list|test) for 16-02 dev loop
  affects:
    - Plan 16-02 (ability implementations) — will plug into abilities/ and register via wp_register_ability()
    - Plan 16-03 (QA + integration tests)
tech-stack:
  added:
    - wordpress/mcp-adapter 0.5.0 (composer dep — install deferred to DDEV)
  patterns:
    - Procedural + final class (Maxi AI conventions, no PSR-4)
    - Lazy ability loading (rest_api_init priority 0; eager on WP_CLI)
    - Numeric UTC offset strategy (not CONVERT_TZ with named tz)
    - Bulk transient invalidation on woocommerce_order_status_changed
key-files:
  created:
    - wordpress-plugins/kmn-revenue-abilities/bootstrap/register-mcp-server.php (78 lines)
    - wordpress-plugins/kmn-revenue-abilities/includes/response.php (52 lines)
    - wordpress-plugins/kmn-revenue-abilities/includes/cache.php (144 lines)
    - wordpress-plugins/kmn-revenue-abilities/includes/sql-helpers.php (239 lines)
    - wordpress-plugins/kmn-revenue-abilities/includes/rate-limit.php (54 lines)
    - wordpress-plugins/kmn-revenue-abilities/includes/cli-command.php (148 lines)
  modified:
    - wordpress-plugins/kmn-revenue-abilities/kmn-revenue-abilities.php (70 → 178 lines)
    - wordpress-plugins/kmn-revenue-abilities/readme.md (83 → 153 lines)
decisions:
  - Positional create_server() args with inline slot comments chosen over PHP 8 named args (stable across adapter minor bumps; parameter-name churn is a real risk on pre-1.0 deps)
  - Pre-listed all 5 ability ids in $tools now so Plan 16-02 is a pure additive change (adapter logs benign warning per missing ability, server registration still succeeds, tools/list returns [])
  - Rate-limit body commented-out stub rather than absent file — activation is a one-line edit in v3.1 with no wiring cost
  - Local-install of composer vendor/ deferred to user (DDEV unavailable from executor host)
metrics:
  duration_minutes: 10
  completed_date: "2026-04-24"
  tasks_completed: 2
  files_created: 6
  files_modified: 2
  total_lines_added: 953
---

# Phase 16 Plan 01: kmn-revenue-abilities — Bootstrap + Shared Helpers + MCP Server Registration Summary

Activatable WordPress plugin owning `/wp-json/mcp/kmn-revenue` with shared helpers ready for Plan 16-02 to drop ability files into `abilities/`; `tools/list` returns `[]` pending 16-02 ability implementations.

## What Was Built

**Task 1 — scaffold bootstrap + shared helpers** (commit `8e027fb`):

- `kmn-revenue-abilities.php` expanded from 70-line shell to 178-line working loader. Keeps WP 6.9+ / WooCommerce guards. Adds `load_includes()`, `load_bootstrap()`, `load_abilities()` with lazy pattern (eager on WP_CLI, `rest_api_init` priority 0 otherwise — mirrors `maxi-ai/maxi-ai.php:77-86`). Added `ABILITY_NS = 'kmn/'` class constant. Bumped VERSION `0.1.0 → 0.5.0` to match milestone.
- `includes/response.php` (52 lines) — `kmn_revenue_response()` envelope forked from Maxi's helper minus operator-notes metadata; error path writes to `error_log()` before returning. Includes `version` and ISO-8601 `calculated_at` in `_meta`.
- `includes/cache.php` (144 lines) — TTL constants (`KMN_REVENUE_TTL_RUN_RATE`=5 min, `KMN_REVENUE_TTL_DEFAULT`=15 min, `KMN_REVENUE_TTL_REPEAT`/`_BASKET`=1 h, `KMN_REVENUE_TTL_BRIEFING`=5 min); `kmn_revenue_cache_key()` with recursive ksort normalisation and `kmn_` prefix (transient-key-safe at 44 char); `kmn_revenue_cached()` read-through wrapper honouring skip flag and refusing to cache `WP_Error`; `kmn_revenue_invalidate_all()` bulk-DELETEs transients plus timeout rows via `$wpdb->options` LIKE pattern. Hook registered at file load on `woocommerce_order_status_changed` priority 10.
- `includes/sql-helpers.php` (239 lines) — `kmn_revenue_get_utc_offset()` accepts null / IANA / numeric offset, resolves via `DateTimeImmutable::format('P')`, DST-aware, error-log + `+00:00` fallback on unknown IANA; `kmn_revenue_resolve_tz_offset()` wrapper reading `$input['timezone']`; `kmn_revenue_status_whitelist()` regex-validates `wc-[a-z-]+` and falls back to default when filter strips everything; `kmn_revenue_prepare_in_placeholders()` builds `%s,%s,%s` fragments; `kmn_revenue_utc_bounds_for_date()` + `..._for_window()` return `[start_utc, end_utc)` pairs suitable for `WHERE date_created >= %s AND date_created < %s`; `kmn_revenue_set_query_timeout_ms()` wraps `SET SESSION MAX_EXECUTION_TIME` for ABIL-QA-03 enforcement.
- `includes/rate-limit.php` (54 lines) — STUB only. `kmn_revenue_rate_limit_check()` returns `true` unconditionally; body commented out with clear v3.1 activation note (no middleware in adapter v0.5.0 per RESEARCH §B6; per-user transient counter sketch left inline for when call-volume justifies it).
- `includes/cli-command.php` (148 lines) — `wp kmn ability list|test`. `list` emits sentinel `no abilities registered yet` when no `kmn/*` abilities are registered (Plan 16-01 condition); `test` accepts `--input=JSON` and invokes `$ability->execute()` or `get_callback('execute')` based on adapter API shape. File returns early outside WP-CLI context so no autoload cost in HTTP path.

**Task 2 — MCP server registration + readme runbook** (commit `0f0b510`):

- `bootstrap/register-mcp-server.php` (78 lines) — `add_action('mcp_adapter_init', ...)` calling `$adapter->create_server()` with the **verified v0.5.0 positional signature** (`server_route_namespace` / `server_route` / `tools`), NOT the WP_BRIDGE_ARCHITECTURE.md names (`rest_namespace` / `rest_route` / `abilities`). Inline slot comments on every positional arg for readability. HttpTransport transport class, ErrorLogMcpErrorHandler, NullMcpObservabilityHandler wired by FQN. `$tools` pre-lists all 5 ability ids that Plan 16-02 will register (`kmn/weekly-heatmap`, `kmn/repeat-metrics`, `kmn/revenue-run-rate`, `kmn/market-basket`, `kmn/weekly-briefing-data`). Guard against missing `HttpTransport` class so partial installs log cleanly instead of fatal.
- `readme.md` (83 → 153 lines) — replaces Phase 15 stub. Adds: install steps (DDEV composer), `tools/list` curl probe, tool-name sanitisation table (slash → hyphen), WP-CLI ability tester usage, full Application Password rotation runbook (local DDEV + production with 90-day cadence + revocation flow), file layout, link-back references.

## Requirements Satisfied

| REQ-ID        | Description                                                                      | Evidence                                                               |
|---------------|----------------------------------------------------------------------------------|------------------------------------------------------------------------|
| MCPAPP-WP-01  | Plugin template pattern documented                                               | File layout + conventions encoded in main plugin file, readme, commits |
| MCPAPP-WP-02  | MCP Adapter v0.5.0 composer-managed, `mcp_adapter_init` hook, separate server_id | `bootstrap/register-mcp-server.php` lines 33 + 47–74                   |
| MCPAPP-WP-03  | Application Password auth + rotation runbook                                     | `readme.md` lines 80–115                                               |
| ABIL-SCAF-01  | Main plugin file with WP 6.9+ guard + WC dependency check                        | `kmn-revenue-abilities.php` lines 32–48                                |
| ABIL-SCAF-02  | `composer.json` with mcp-adapter:0.5.0, vendor/ committed                        | composer.json pinned 0.5.0 (vendor/ install deferred — see below)      |
| ABIL-SCAF-03  | bootstrap exposes endpoint `/wp-json/mcp/kmn-revenue`                            | `register-mcp-server.php`                                              |
| ABIL-SCAF-04  | `includes/sql-helpers.php` + `includes/cache.php`                                | Created 144 + 239 lines                                                |
| ABIL-SCAF-05  | `readme.md` with setup instructions                                              | Section "Installation (DDEV / local development)"                      |

## Self-Check: PASSED

Artifact presence (all paths verified on disk):

- FOUND: wordpress-plugins/kmn-revenue-abilities/kmn-revenue-abilities.php (178 lines, min_lines 80 ✓)
- FOUND: wordpress-plugins/kmn-revenue-abilities/bootstrap/register-mcp-server.php (contains `create_server` 3 occurrences)
- FOUND: wordpress-plugins/kmn-revenue-abilities/includes/sql-helpers.php
- FOUND: wordpress-plugins/kmn-revenue-abilities/includes/cache.php
- FOUND: wordpress-plugins/kmn-revenue-abilities/includes/response.php
- FOUND: wordpress-plugins/kmn-revenue-abilities/includes/rate-limit.php
- FOUND: wordpress-plugins/kmn-revenue-abilities/includes/cli-command.php
- FOUND: wordpress-plugins/kmn-revenue-abilities/readme.md

Key-link pattern probes:

- FOUND: `require_once.*includes` in main plugin file (line 59 docblock)
- FOUND: `add_action\(\s*['"]mcp_adapter_init['"]` in bootstrap file (line 33)
- FOUND: `woocommerce_order_status_changed` in includes/cache.php (line 144)

Commit presence:

- FOUND: `8e027fb` (Task 1 — scaffold bootstrap + shared helpers)
- FOUND: `0f0b510` (Task 2 — MCP server registration + readme runbook)

PHP lint (local /c/php/php -l, PHP 8.5): all 7 files return `No syntax errors detected`.

## Deviations from Plan

### Deferred Items (environment-limited)

**1. [Rule 3 - Environment gate] `vendor/` composer install deferred to DDEV host**

- **Issue:** Plan's Task 1 step 1 mandates `ddev exec 'cd .../kmn-revenue-abilities && composer install --no-dev --optimize-autoloader'` inside the Summerfield DDEV container. Executor host is Windows + Git Bash; `ddev` binary is not available on PATH (Git Bash cannot locate `ddev.exe`), and a standalone `composer` is not installed. Generating `vendor/` locally on Windows would risk platform-constraint drift (plugin requires PHP 8.1+; host PHP is 8.5; DDEV web container is 8.1/8.2 — divergent extension footprint).
- **Fix:** Did not fabricate vendor/. Left the plugin's `composer.json` pinned at `wordpress/mcp-adapter: 0.5.0`. Added the exact DDEV `composer install` command to `readme.md` installation section so the user/verifier runs it once against the DDEV environment. Plugin code uses `if ( file_exists( __DIR__ . '/vendor/autoload.php' ) ) { require_once ... }` so the absent autoload does not fatal activation — only the adapter classes become unavailable, which the bootstrap guard catches and logs.
- **Files modified:** none (explicit non-fabrication decision).
- **Commit:** n/a (no code change for this deviation).

**2. [Rule 3 - Environment gate] DDEV runtime verification deferred**

- **Issue:** Plan verification blocks rely on `ddev wp plugin activate`, `ddev wp eval`, `ddev wp kmn ability list`, and curl against `https://summerfield.ddev.site/wp-json/mcp/kmn-revenue`. None of these are reachable from the executor environment.
- **Fix:** Verified everything achievable offline — PHP syntax lint on every new file (7/7 pass), required pattern greps for the plan's `key_links` and `must_haves.artifacts` probes, and line counts meeting the `min_lines` floor. The runtime probes (plugin activation, MCP endpoint JSON-RPC round-trip, curl 401 negative test) are now part of the Plan 16-01 verifier agent's responsibility and explicitly listed below.
- **Files modified:** none.
- **Commit:** n/a.

### No other deviations

The rest of the plan was executed exactly as written: both tasks, all enumerated files, every helper function signature, the corrected v0.5.0 `create_server()` parameter names per RESEARCH §B1, and all AVOID directives honoured (no PSR-4 namespaces, no copy of Maxi's `register-abilities-with-mcp.php` pattern, no `.md` files outside `readme.md`, no active rate-limiter body).

## MCP Endpoint Verification (for verifier — pending DDEV run)

Deferred runtime commands that the verifier (or the user) needs to execute on the DDEV host, with expected outcomes:

```bash
# 1. Install composer deps inside DDEV
ddev exec 'cd /var/www/html/wp-content/plugins/kmn-revenue-abilities && composer install --no-dev --optimize-autoloader'
# Expected: vendor/wordpress/mcp-adapter/mcp-adapter.php present with Version: 0.5.0

# 2. Activate
ddev wp plugin activate kmn-revenue-abilities
# Expected: "Plugin 'kmn-revenue-abilities' activated." with no PHP fatals in debug.log

# 3. Helpers reachable
ddev wp eval 'echo function_exists("kmn_revenue_response") ? "y" : "n";'          # → y
ddev wp eval 'echo function_exists("kmn_revenue_cache_key") ? "y" : "n";'         # → y
ddev wp eval 'echo function_exists("kmn_revenue_cached") ? "y" : "n";'            # → y
ddev wp eval 'echo function_exists("kmn_revenue_get_utc_offset") ? "y" : "n";'    # → y
ddev wp eval 'var_export(has_action("woocommerce_order_status_changed","kmn_revenue_invalidate_all"));'
# → int(10)

# 4. WP-CLI sentinel (no abilities yet)
ddev wp kmn ability list
# → "no abilities registered yet"

# 5. MCP endpoint tools/list returns 0 tools (empty array expected — Plan 16-02 populates)
curl -sk -u "dev-admin:6MEkttWMf26sFbGzpQ3ZfEuQ" \
  -X POST https://summerfield.ddev.site/wp-json/mcp/kmn-revenue \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json,text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
# → 0

# 6. Wrong password → HTTP 401
curl -sk -o /dev/null -w '%{http_code}' -u "dev-admin:wrong" \
  -X POST https://summerfield.ddev.site/wp-json/mcp/kmn-revenue \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# → 401

# 7. Timezone helper sanity probe
ddev wp eval '$off = kmn_revenue_get_utc_offset("Europe/Vienna"); echo $off;'
# → +01:00 or +02:00 (DST-dependent)
```

## SET SESSION MAX_EXECUTION_TIME Pattern Established

Plan 16-02 ability bodies should call `kmn_revenue_set_query_timeout_ms( 2000 )` before any aggregation query that touches `wc_order_stats` / `wc_order_product_lookup`. The helper wraps the MySQL 8.0+ syntax and is the ABIL-QA-03 compliance point — a single call site to audit, not a pattern scattered across five files.

## Handoff to Plan 16-02

Plan 16-02 is a pure additive change:

- Drop ability files into `wordpress-plugins/kmn-revenue-abilities/abilities/*.php`.
- Each file: `add_action( 'wp_abilities_api_init', function () { wp_register_ability( 'kmn/<slug>', [ ... ] ); } );`
- Ability ids `kmn/weekly-heatmap` / `kmn/repeat-metrics` / `kmn/revenue-run-rate` / `kmn/market-basket` / `kmn/weekly-briefing-data` are already enumerated in the MCP server's `$tools` list, so no bootstrap edit is needed — the abilities just start appearing in `tools/list` with hyphenated names (`kmn-weekly-heatmap` etc.) as soon as the files exist on disk.
- Shared helpers already available: `kmn_revenue_response()`, `kmn_revenue_cache_key()`, `kmn_revenue_cached()`, `kmn_revenue_set_query_timeout_ms()`, `kmn_revenue_get_utc_offset()` / `resolve_tz_offset()`, `kmn_revenue_status_whitelist()`, `kmn_revenue_prepare_in_placeholders()`, `kmn_revenue_utc_bounds_for_date()` / `kmn_revenue_utc_bounds_for_window()`.
- Each ability body: enforce timeout → build cache key → call `kmn_revenue_cached()` with producer that runs the aggregation SQL → return `kmn_revenue_response( true, $data, null, [...meta...] )`.
- Feedback loop during dev: `ddev wp kmn ability test kmn/<slug> --input='{...}'`.
