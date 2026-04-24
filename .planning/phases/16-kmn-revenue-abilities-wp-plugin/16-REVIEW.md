---
phase: 16
depth: standard
generated: 2026-04-24T00:00:00Z
files_reviewed: 16
files_reviewed_list:
  - wordpress-plugins/kmn-revenue-abilities/kmn-revenue-abilities.php
  - wordpress-plugins/kmn-revenue-abilities/bootstrap/register-mcp-server.php
  - wordpress-plugins/kmn-revenue-abilities/includes/sql-helpers.php
  - wordpress-plugins/kmn-revenue-abilities/includes/cache.php
  - wordpress-plugins/kmn-revenue-abilities/includes/response.php
  - wordpress-plugins/kmn-revenue-abilities/includes/rate-limit.php
  - wordpress-plugins/kmn-revenue-abilities/includes/cli-command.php
  - wordpress-plugins/kmn-revenue-abilities/abilities/weekly-heatmap.php
  - wordpress-plugins/kmn-revenue-abilities/abilities/repeat-metrics.php
  - wordpress-plugins/kmn-revenue-abilities/abilities/revenue-run-rate.php
  - wordpress-plugins/kmn-revenue-abilities/abilities/market-basket.php
  - wordpress-plugins/kmn-revenue-abilities/abilities/weekly-briefing-data.php
  - wordpress-plugins/kmn-revenue-abilities/scripts/verify-wp-bridge.sh
  - wordpress-plugins/kmn-revenue-abilities/scripts/audit-sql.sh
  - wordpress-plugins/kmn-revenue-abilities/scripts/verify-coexistence.sh
  - wordpress-plugins/kmn-revenue-abilities/readme.md
findings:
  critical: 0
  warning: 3
  info: 7
  total: 10
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-04-24
**Depth:** standard
**Files Reviewed:** 16
**Status:** issues_found

## Summary

The `kmn-revenue-abilities` plugin is in excellent shape. All 7 critical focus
areas for this phase pass: every SQL statement uses `$wpdb->prepare()` with
placeholders; HPOS tables are used exclusively (no `wp_posts`/`postmeta`
joins — product titles flow through the WP core `get_posts()` abstraction);
every ability gates on `current_user_can('manage_woocommerce')`; the MCP
server is registered in the isolated `/wp-json/mcp/kmn-revenue` namespace
with no collision with Maxi-AI; `verify-wp-bridge.sh` takes the password via
env var only; and the `audit-sql.sh` belt-and-suspenders lint runs in CI
posture to keep the guarantees enforced.

There are **no Critical findings**. Three Warnings concern caching of error
envelopes, a median-calculation inconsistency between two abilities, and a
thin guard on sub-ability orchestration in `weekly-briefing-data`. Seven
Info items cover documentation drift, lint blind spots, DST-at-reference-date
behaviour, and defensive-coding nits.

## Warnings

### WR-01: Error envelopes are cached alongside success responses

**File:** `wordpress-plugins/kmn-revenue-abilities/includes/cache.php:107`
**Issue:** `kmn_revenue_cached()` only skips caching when `is_wp_error($fresh)`
is true. Every ability returns its failure state as a **plain array** from
`kmn_revenue_response(false, ...)`, not a `WP_Error`. Consequence: any
transient backend hiccup, DB timeout, or sub-ability failure produces an
envelope with `success=false` that is then stored for the full TTL (5 min to
1 hour). Subsequent callers see the cached failure until the key expires,
making transient outages stick.
**Fix:** Inspect the envelope before writing:
```php
$should_cache = ! is_wp_error( $fresh )
    && ! ( is_array( $fresh ) && isset( $fresh['success'] ) && false === $fresh['success'] );

if ( $should_cache && ! $skip ) {
    set_transient( $key, $fresh, $ttl );
}
```

### WR-02: Median days-to-2nd-order uses upper-median instead of true median on even-count data

**File:** `wordpress-plugins/kmn-revenue-abilities/abilities/repeat-metrics.php:222`
**Issue:** `$diffs_num[ intval( count( $diffs_num ) / 2 ) ]` always picks a
single element. For even-length arrays this returns the upper of the two
middle values instead of their average. `market-basket.php:276-278`
implements the correct even/odd branching on the same shape of data, so
the two abilities report subtly different statistics for the same input.
**Fix:** Mirror the market-basket median logic:
```php
$n      = count( $diffs_num );
$median = ( 0 === $n % 2 )
    ? ( $diffs_num[ intval( $n / 2 ) - 1 ] + $diffs_num[ intval( $n / 2 ) ] ) / 2
    : (float) $diffs_num[ intval( $n / 2 ) ];
```

### WR-03: Sub-ability callbacks not verified callable before invocation

**File:** `wordpress-plugins/kmn-revenue-abilities/abilities/weekly-briefing-data.php:179-186,214-221`
**Issue:** `call_user_func( $heatmap_ability->get_callback( 'execute' ), ... )`
does not guard against `get_callback()` returning `null` or a non-callable
value. If the Abilities API shape ever changes (or a partially-registered
ability returns null), PHP emits a warning and `call_user_func` returns
null — the subsequent `empty( $heatmap_resp['success'] )` check would then
fire with a misleading `'unknown'` error instead of a clear "sub-ability
not callable" diagnostic.
**Fix:**
```php
$cb = $heatmap_ability->get_callback( 'execute' );
if ( ! is_callable( $cb ) ) {
    return kmn_revenue_response( false, [], 'sub-ability kmn/weekly-heatmap has no callable execute handler' );
}
$heatmap_resp = call_user_func( $cb, [ ... ] );
```

## Info

### IN-01: Timezone offset resolved at "now", not at reference_date

**File:** `wordpress-plugins/kmn-revenue-abilities/includes/sql-helpers.php:40-65`
**Issue:** `kmn_revenue_get_utc_offset()` defaults `$at` to the current
moment. Every caller passes `$input` without overriding `$at`, so queries
against a `reference_date` inside a DST transition window get bucketed with
**today's** offset, not the offset in effect on that date. For abilities
whose reference_date crosses a DST boundary (Europe/Vienna DST transitions
happen on the last Sundays of March/October), this produces a 1-hour bucket
drift for the transition day. Documented as an accepted trade-off in the
file header, but no caller threads `$ref_date` through to the offset
resolver.
**Fix:** Optional — pass a DateTimeImmutable at `$ref_date 12:00:00` into
`kmn_revenue_resolve_tz_offset()`:
```php
$ref_at  = new DateTimeImmutable( $ref_date . ' 12:00:00', new DateTimeZone( 'UTC' ) );
$offset  = kmn_revenue_resolve_tz_offset( $input, $ref_at );
```

### IN-02: audit-sql.sh misses indirect interpolation

**File:** `wordpress-plugins/kmn-revenue-abilities/scripts/audit-sql.sh:45`
**Issue:** The `ABIL-DEF-06` lint regex
`\$wpdb->...\(\s*"[^"]*\$input\[` only catches direct `$input[...]`
interpolation inside the first quoted argument. It does not catch:
- Assigning SQL into a variable then calling `$wpdb->query($sql)`
- Interpolating `$_GET` / `$_POST` / `$_REQUEST` directly
- Concatenation (`"..." . $input['x'] . "..."`)
- Other user-sourced variables (`$req`, `$params`, etc.)

Current code has none of these patterns, but the lint gives a false sense
of coverage for future changes.
**Fix:** Add companion patterns (non-blocking):
```bash
# $_GET/$_POST/$_REQUEST directly in $wpdb-> call
grep -rnE '\$wpdb->(query|get_\w+)\([^)]*\$_(GET|POST|REQUEST)' "$PLUGIN_DIR/abilities/" && fail "..."
# Concatenation with $input in $wpdb call
grep -rnE '\$wpdb->(query|get_\w+)\([^)]*\.\s*\$input' "$PLUGIN_DIR/abilities/" && fail "..."
```

### IN-03: readme.md describes Plan 16-01 scaffold, not the shipped plugin

**File:** `wordpress-plugins/kmn-revenue-abilities/readme.md:7-10,44-46,76-78`
**Issue:** The readme repeatedly states the plugin is a scaffold:
> "Plan 16-01 status: activatable scaffold — ... `tools/list` currently
>  returns an empty array."

But all five abilities are now implemented, verify-wp-bridge.sh asserts
shape+value for each, and the coexistence script asserts exactly 5 tools.
The documentation is stale relative to the committed code.
**Fix:** Update the status block to reflect Plan 16-02/16-03 completion,
drop the "Plan 16-01 status" call-out, and update `tools/list` examples to
show the populated array.

### IN-04: Plugin header requires WordPress 6.9 but 6.9 is not yet released

**File:** `wordpress-plugins/kmn-revenue-abilities/kmn-revenue-abilities.php:10`
**Issue:** `Requires at least: 6.9` and matching `const MIN_WP = '6.9'`.
The plugin correctly refuses to load on older cores (Abilities API is a
6.9 feature), but until 6.9 ships the plugin is only installable on
nightlies/betas. This is intentional but should be called out as a
deployment caveat.
**Fix:** Add a one-line warning to `readme.md`:
> **Note:** Requires WordPress 6.9 (currently in pre-release). Deploy only
> on hosts running 6.9 trunk or later.

### IN-05: `kmn_revenue_response()` class-constant lookup depends on autoload order

**File:** `wordpress-plugins/kmn-revenue-abilities/includes/response.php:45`
**Issue:** `defined( 'KMN_Revenue_Abilities::VERSION' )` does work on class
constants (PHP 5.3+), but it returns `false` if `KMN_Revenue_Abilities` is
not yet loaded at the call site. Since `includes/response.php` is required
from `KMN_Revenue_Abilities::init()`, the class is already loaded by the
time any ability calls `kmn_revenue_response()` — so this works in practice.
However, the WP-CLI codepath requires the includes eagerly, and a future
refactor that splits out `response.php` could silently regress to the
`'0.0.0'` fallback.
**Fix:** Use a plain constant defined in the main plugin file, e.g.:
```php
define( 'KMN_REVENUE_ABILITIES_VERSION', '0.5.0' );
// ... then in response.php:
'version' => defined( 'KMN_REVENUE_ABILITIES_VERSION' ) ? KMN_REVENUE_ABILITIES_VERSION : '0.0.0',
```

### IN-06: Revenue-run-rate `same_hour_last_week` reads from `$cumulative[last_week_date]` which may not exist

**File:** `wordpress-plugins/kmn-revenue-abilities/abilities/revenue-run-rate.php:304-307`
**Issue:** `$cumulative[ $last_week_date ][ $current_hour ] ?? 0.0` silently
returns 0.0 when last-week's same day was filtered out as "invalid"
(< €5 total revenue). The surfaced `same_hour_last_week: 0.0` is
indistinguishable from a genuine zero on that hour last week. Agent
consumers may draw wrong conclusions when a €0 value actually means
"missing data".
**Fix:** Consider returning `null` instead of `0.0` when the day is not
in `$valid_days`, and update the output schema to accept `number|null`:
```php
$same_hour_last_week = in_array( $last_week_date, $valid_days, true )
    ? (float) ( $cumulative[ $last_week_date ][ $current_hour ] ?? 0.0 )
    : null;
```

### IN-07: market-basket category mode always returns confidence=0.0 and lift=0.0

**File:** `wordpress-plugins/kmn-revenue-abilities/abilities/market-basket.php:427-428`
**Issue:** The category-mode branch returns `'confidence' => 0.0` and
`'lift' => 0.0` verbatim (not computed). The output schema advertises these
fields but they carry no signal in category mode — agents reading the
response can't tell "zero confidence" apart from "field not implemented in
this mode". No code change required if this is by design, but the schema or
the values should signal the limitation.
**Fix:** Either compute confidence/lift for the category mode (extra
per-term order-count aggregate, similar to product mode), or set the
fields to `null` + widen the schema to `number|null`, or document
explicitly in the `description` that these are only populated in
`market_basket_product` mode.

## Green Flags

- **SQL discipline is universal.** Every `$wpdb->prepare()` call uses
  placeholders only — no raw interpolation of caller input anywhere in
  the reviewed code. `kmn_revenue_prepare_in_placeholders()` and
  `kmn_revenue_status_whitelist()` cleanly separate caller-facing data
  from the SQL layer, and `kmn_revenue_set_query_timeout_ms()` safely
  interpolates a clamped positive int.
- **HPOS compliance is complete.** All five abilities query `wc_orders`,
  `wc_order_stats`, and `wc_order_product_lookup`. The only reach into
  core catalog tables is via the sanctioned `get_posts()` API for
  batch-loading product titles, explicitly flagged in comments and
  validated by `audit-sql.sh`.
- **Authorization is in place.** Each `wp_register_ability()` declares
  `permission_callback` returning `current_user_can('manage_woocommerce')`.
  The deliberate sub-ability bypass in `weekly-briefing-data` is called
  out in a detailed comment explaining why it is safe.
- **RESEARCH.md corrections have landed.** Commented references to the
  original flawed approaches are explicit:
  `wc_order_stats.returning_customer` is rejected in favour of email-join
  (with audit-sql.sh enforcement), `payment_method` is read as a
  top-level column, and the `create_server()` signature matches the
  v0.5.0 adapter rather than the stale WP_BRIDGE_ARCHITECTURE.md.
- **Cache key generation is deterministic.** Recursive ksort +
  `wp_json_encode` + SHA-1 produces stable keys regardless of input
  ordering, and the `kmn_` prefix enables bulk invalidation on
  `woocommerce_order_status_changed`.
- **Shell scripts are hardened.** `set -euo pipefail` everywhere;
  passwords via env var only (`WP_APP_PASS`); `command -v` checks for
  `jq`/`curl` before use. `verify-wp-bridge.sh` asserts both shape and
  value for every tool, covers the 401-on-wrong-password path, and has
  an opt-in permission-denied path with clear SKIP semantics.
- **Belt-and-suspenders lint.** `audit-sql.sh` encodes the non-negotiable
  rules (no raw interpolation, no HPOS violations, no returning_customer,
  no hardcoded prefix, exactly one `wp_register_ability` per file) and
  runs cheap grep patterns that a reviewer can trust at PR time.
- **Maxi coexistence explicitly verified.** `verify-coexistence.sh`
  checks plugin activation, endpoint isolation, cross-endpoint
  contamination, and global `wp_get_abilities()` count — catches a
  collision even if one endpoint is unreachable.
- **MCP endpoint isolation is correct.** `/wp-json/mcp/kmn-revenue` does
  not collide with Maxi-AI's route; tool names are prefixed `kmn-*` by
  sanitisation; the five tools are enumerable via `tools/list`.
- **Error handling is consistent.** Every `execute_callback` wraps its
  body in `try/catch(\Throwable $e)` and translates to
  `kmn_revenue_response(false, [], '... failed: ' . $e->getMessage())`;
  no raw throwable ever escapes to the adapter transport layer.

---

_Reviewed: 2026-04-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
