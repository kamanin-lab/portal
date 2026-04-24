---
phase: 16-kmn-revenue-abilities-wp-plugin
plan: 03
subsystem: wordpress-plugins/kmn-revenue-abilities
tags:
  - wordpress
  - abilities-api
  - mcp-adapter
  - woocommerce
  - integration-tests
  - phase-close
dependency-graph:
  requires:
    - 16-01 (plugin scaffold, shared helpers, MCP server registration)
    - 16-02 (four analytics abilities: weekly-heatmap, repeat-metrics, revenue-run-rate, market-basket)
  provides:
    - kmn/weekly-briefing-data orchestrator ability (5th and final tool — combined Monday-briefing payload)
    - scripts/verify-wp-bridge.sh — ABIL-QA-01 e2e integration test with shape + value + auth/permission assertions
    - scripts/audit-sql.sh — static HPOS + SQL-safety lint covering ABIL-DEF-06 / ABIL-QA-03 / ABIL-QA-04 / RESEARCH §C1
    - scripts/verify-coexistence.sh — ABIL-QA-05 Maxi disjointness assertion
  affects:
    - Phase 17 (mcp-poc Node consumer) — consumes hyphenated tool names, combined briefing payload drives daily_briefing UI resource
    - Phase 20 (Monday briefing email) — consumes weekly-briefing-data output shape via Edge Function
tech-stack:
  added: []
  patterns:
    - Direct sub-ability invocation via wp_get_ability($id)->get_callback('execute') + call_user_func — bypasses permission_callback re-run (RESEARCH §Q3)
    - Fail-fast orchestration (any sub-ability failure collapses to single failure envelope — Promise.allSettled handling deferred to Node layer in Phase 17)
    - Bash integration tests with ANSI-colored OK/FAIL and unwrap() helper for MCP Adapter JSON-RPC envelope
    - Static lint via narrowly-scoped grep (distinguishes SQL-context column use from docstring references and column-name plurals)
    - Environment-gated runtime tests (WP_APP_PASS required; SUBSCRIBER_* and MAXI_URL optional with documented SKIP paths)
key-files:
  created:
    - wordpress-plugins/kmn-revenue-abilities/abilities/weekly-briefing-data.php (382 lines)
    - wordpress-plugins/kmn-revenue-abilities/scripts/verify-wp-bridge.sh (219 lines)
    - wordpress-plugins/kmn-revenue-abilities/scripts/audit-sql.sh (150 lines)
    - wordpress-plugins/kmn-revenue-abilities/scripts/verify-coexistence.sh (130 lines)
  modified: []
decisions:
  - Direct get_callback('execute') + call_user_func used for sub-ability calls (NOT $ability->execute()) — intentional bypass of permission_callback + schema revalidation per RESEARCH §D5 / §Q3; caller has already gated on manage_woocommerce and sub-abilities are pure SQL reads with no privileged side effects
  - Fail-fast on sub-ability error in weekly-briefing-data — single failure envelope returned; Phase 17's Node-layer daily_briefing tool owns Promise.allSettled partial-failure UX
  - weekly-briefing-data does NOT call run-rate or market-basket — briefing email does not need intra-day projection or basket pairs (RESEARCH §D5 explicit comment)
  - ABIL-QA-02 acceptance wording corrected — HTTP 200 + CallToolResult{isError:true} for permission denial (NOT HTTP 403); reflects MCP Adapter v0.5.0 actual behavior per RESEARCH §A2 / §B7; script asserts the correct case and documents the distinction inline
  - ABIL-QA-03 (rate limit 60/min) explicitly DEFERRED to v3.1 — MCP Adapter v0.5.0 has no built-in rate limiter; includes/rate-limit.php from Plan 16-01 holds a no-op stub returning true unconditionally
  - audit-sql.sh uses narrow grep patterns to distinguish forbidden SQL column use from decisional docstring references and from legitimate plural output fields (returning_customer singular column vs returning_customers plural field)
  - get_posts() is an approved WP core abstraction; audit-sql.sh lints for literal table-name tokens in SQL strings only, which correctly permits get_posts() usage in the orchestrator
  - Scripts committed inside the plugin (wordpress-plugins/kmn-revenue-abilities/scripts/) rather than the repo-wide scripts/ directory — keeps the plugin self-contained and re-deployable to MBM/future clients
  - Coexistence test uses both MCP endpoint probes AND wp_get_abilities() count as belt-and-suspenders — catches a collision even if the Maxi endpoint route is misconfigured or unreachable (wp_get_abilities is the authoritative in-process count)
metrics:
  duration_minutes: 6
  completed_date: "2026-04-24"
  tasks_completed: 2
  files_created: 4
  files_modified: 0
  total_lines_added: 881
---

# Phase 16 Plan 03: Briefing Orchestrator + Integration Tests + Phase 16 Close — Summary

The fifth and final ability (`kmn/weekly-briefing-data`) orchestrates the existing 4 abilities into a single Monday-briefing payload via in-process direct-callback invocation, and three bash integration scripts close out Phase 16's QA requirements: end-to-end MCP bridge verification, static HPOS/SQL-safety lint, and coexistence assertion against Maxi AI.

## What Was Built

**Task 1 — `kmn/weekly-briefing-data` orchestrator ability** (commit `7f5c9cc` + fix `04fb110`):

- `abilities/weekly-briefing-data.php` (382 lines, min_lines 180 ✓) — registers the fifth ability `kmn/weekly-briefing-data`. Four-section combined payload:
  1. `last_week_summary` — `week_start`, `week_end`, `revenue_total`, `order_count`, `aov`, `vs_prior_week_pct` computed in PHP from two `$wpdb->prepare()` aggregates against `wc_order_stats` (current Mon..Sun week preceding `reference_date` + the 7-day prior window for trend).
  2. `best_slot` — copied from an in-process call to `kmn/weekly-heatmap` with `weeks=8`.
  3. `repeat_metrics` — copied from an in-process call to `kmn/repeat-metrics` with `days=90`, projected to the 5-field briefing shape (`repeat_rate_pct`, `total_orders`, `unique_customers`, `returning_customers`, `median_days_to_2nd`).
  4. `top_products_3` — bespoke `wc_order_product_lookup` JOIN `wc_order_stats` aggregate with `GROUP BY product_id ORDER BY qty_sold DESC LIMIT 3`, then one batched `get_posts(post__in=pids)` to resolve product names without N+1 title lookups.
- Sub-ability invocation uses `wp_get_ability('kmn/weekly-heatmap')->get_callback('execute')` + `call_user_func()` — deliberately bypasses `execute()` wrapper to skip re-running `permission_callback` and re-validating the input schema. Caller has already passed `manage_woocommerce`; sub-abilities are pure SQL reads (RESEARCH §Q3).
- Fail-fast: any sub-ability returning `success=false` collapses to a single failure envelope with diagnostic — the Phase 17 Node-layer `daily_briefing` tool owns the `Promise.allSettled` partial-failure UX.
- Cache TTL `KMN_REVENUE_TTL_BRIEFING` (5 min); sub-abilities retain their own longer TTLs (15 min heatmap, 1 h repeat) so the orchestrator pays at most one cold-miss per dependency on first call of the day.
- Comment-fix commit `04fb110` [Rule 1 auto-fix] rephrased a docstring that literally contained `"wp_posts"` so `audit-sql.sh`'s HPOS lint (strict table-name token match) no longer trips on the decisional comment. Same pattern as Plan 16-02 Deviation 2.

**Task 2 — Three integration bash scripts** (commit `2130a38`):

- `scripts/verify-wp-bridge.sh` (219 lines, min_lines 120 ✓) — ABIL-QA-01 green path:
  - `tools/list` returns exactly 5 sanitized names: `kmn-market-basket`, `kmn-repeat-metrics`, `kmn-revenue-run-rate`, `kmn-weekly-briefing-data`, `kmn-weekly-heatmap`.
  - Per-tool shape + value assertions from seeded-data facts in RESEARCH §seeded_data_facts:
    - `kmn-weekly-heatmap`: `best_slot.day_of_week=4`, `hour_of_day=20`, `order_count ∈ [17,21]`; `buckets.length ≥ 30`.
    - `kmn-repeat-metrics`: `repeat_rate_pct ∈ [18.0, 22.0]`; `benchmark_pct == 27.0`.
    - `kmn-revenue-run-rate`: `confidence ∈ {high, medium, low}`; `expected_by_hour.length == 24`; `payment_split` is array.
    - `kmn-market-basket`: `mode == "market_basket_product"`; `basket_pairs.length ≥ 3`; `aov_bands.length == 3`.
    - `kmn-weekly-briefing-data`: all 4 sub-sections present, `top_products_3.length == 3` with `{product_id, name, qty_sold}` keys, `calculated_at` ISO string.
  - ABIL-QA-02 auth negative: wrong Application Password → HTTP 401 (permission_callback gate not bypassed).
  - ABIL-QA-02 permission negative (corrected wording): authenticated user lacking `manage_woocommerce` → HTTP 200 + `result.isError: true` per RESEARCH §A2 / §B7. Opt-in via `SUBSCRIBER_USER` + `SUBSCRIBER_APP_PASS` env vars; documented SKIP path with instructions if not provided.
  - Cache-hit timing logged informationally (first/warm millisecond deltas).

- `scripts/audit-sql.sh` (150 lines, min_lines 30 ✓) — static SQL-safety + HPOS lint:
  - **ABIL-DEF-06** — rejects `$wpdb->(query|get_results|get_var|get_col|get_row)(` followed by a string containing `$input[` (must go through `$wpdb->prepare()`).
  - **ABIL-QA-04** — rejects literal `wp_posts` / `postmeta` table tokens in `abilities/`. `get_posts()` (WP core API) is approved and not matched.
  - **RESEARCH §C1** — rejects actual SQL use of `wc_order_stats.returning_customer` (SELECT/WHERE/table-qualified); permits docstring references and the plural output field `returning_customers`.
  - **ABIL-QA-03** — every ability file must call `kmn_revenue_set_query_timeout_ms()` at least once.
  - Hardcoded-prefix check — rejects literal `s7uy9uh34_` and `wp_wc_*` table tokens anywhere in plugin code.
  - Registration count — every `abilities/*.php` has exactly one `wp_register_ability(` opening; handles both single-line and multi-line forms.
  - Offline run against the 5 committed ability files: **6/6 green checks, exit 0, AUDIT PASSED.**

- `scripts/verify-coexistence.sh` (130 lines, min_lines 40 ✓) — ABIL-QA-05:
  - Both `kmn-revenue-abilities` and `maxi-ai` active via `wp plugin list --status=active --format=csv`.
  - Kmn endpoint returns exactly 5 `kmn-*` tools with zero non-`kmn-*` leakage.
  - Maxi endpoint (default `/wp-json/mcp/maxi-ai`, overridable via `MAXI_URL`) contains zero `kmn-*` tools. Skipped with documented opt-in if the guessed route isn't reachable.
  - `wp_get_abilities()` count falls in `[125, 130]` (122 Maxi + 5 kmn ±3 test variance) — belt-and-suspenders for cases where the Maxi endpoint probe skips.
  - `$DDEV` env var controls wp-cli prefix (default `ddev`, override with empty string for host wp-cli or any other container-exec wrapper).

All three scripts: `chmod +x`, `bash -n` lint clean, ANSI-colored OK/FAIL output.

## Verification Matrix (static / offline)

| Check                                                                 | Expected | Observed                                              | Status  |
|-----------------------------------------------------------------------|----------|-------------------------------------------------------|---------|
| PHP syntax: weekly-briefing-data.php                                  | clean    | `No syntax errors detected` (PHP 8.5)                 | PASS    |
| min_lines weekly-briefing-data (180)                                  | ≥180     | 382                                                   | PASS    |
| min_lines verify-wp-bridge.sh (120)                                   | ≥120     | 219                                                   | PASS    |
| min_lines audit-sql.sh (30)                                           | ≥30      | 150                                                   | PASS    |
| min_lines verify-coexistence.sh (40)                                  | ≥40      | 130                                                   | PASS    |
| `bash -n` lint all 3 scripts                                          | clean    | ALL 3 SCRIPTS LINT CLEAN                              | PASS    |
| scripts executable                                                    | +x bit   | -rwxr-xr-x on all 3                                   | PASS    |
| briefing uses `wp_get_ability('kmn/weekly-heatmap')`                  | present  | line 170                                              | PASS    |
| briefing uses `wp_get_ability('kmn/repeat-metrics')`                  | present  | line 205                                              | PASS    |
| briefing uses `call_user_func($ability->get_callback('execute'), …)`  | present  | lines 176–183 and 211–218                             | PASS    |
| briefing does NOT call `->execute(` on sub-ability                    | no match | zero occurrences (grep `->execute\(` in file)         | PASS    |
| audit-sql.sh runtime against 5 abilities                              | exit 0   | 6/6 green OK lines + `AUDIT PASSED`                   | PASS    |
| verify-wp-bridge.sh references `/wp-json/mcp/kmn-revenue`             | present  | BRIDGE_URL default + comment                          | PASS    |
| verify-coexistence.sh uses `tools/list`                               | present  | lines 82 + 101                                        | PASS    |

## Runtime Verification (deferred to DDEV — Human Verification Required)

The following probes cannot be run from this Windows + Git Bash executor host (no `ddev` on PATH, no network to the DDEV VM). Yuri performs them on the Summerfield DDEV host:

```bash
# 1. Install composer deps inside DDEV (one-time; if not already done in 16-01)
ddev exec 'cd /var/www/html/wp-content/plugins/kmn-revenue-abilities && composer install --no-dev --optimize-autoloader'

# 2. Activate
ddev wp plugin activate kmn-revenue-abilities

# 3. All 5 abilities reachable via wp-cli
for id in kmn/weekly-heatmap kmn/repeat-metrics kmn/revenue-run-rate kmn/market-basket kmn/weekly-briefing-data; do
  ddev wp eval "echo wp_get_ability('$id') ? 'y' : 'n';"
done
# → yyyyy

# 4. Full verify-wp-bridge.sh run
cd /mnt/g/01_OPUS/Projects/PORTAL/wordpress-plugins/kmn-revenue-abilities
WP_APP_PASS="6MEkttWMf26sFbGzpQ3ZfEuQ" bash scripts/verify-wp-bridge.sh
# Expected: green OK per tool, ALL CHECKS PASSED

# 5. audit-sql runs inside the plugin dir
bash scripts/audit-sql.sh
# Expected: 6 green OK lines, AUDIT PASSED

# 6. Coexistence
WP_APP_PASS="6MEkttWMf26sFbGzpQ3ZfEuQ" bash scripts/verify-coexistence.sh
# Expected: COEXISTENCE VERIFIED, wp_get_abilities() ≈ 127

# 7. Raw briefing payload sanity check (for Yuri's aesthetic review)
curl -sk -u "dev-admin:6MEkttWMf26sFbGzpQ3ZfEuQ" \
  -X POST https://summerfield.ddev.site/wp-json/mcp/kmn-revenue \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json,text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kmn-weekly-briefing-data","arguments":{}}}' \
  | jq '.result.content[0].text | fromjson | .data'
# Yuri should see:
#   last_week_summary.revenue_total plausible for a furniture shop
#   top_products_3[0].name is a real garden product (not "(unknown)")
#   best_slot.day_of_week == 4, hour_of_day == 20
#   repeat_metrics.repeat_rate_pct ≈ 20.1
```

## Human Verification Required (summary for Yuri)

Per the plan's `autonomous: false` flag, these four items need Yuri's live check against DDEV before Phase 16 closes:

1. **Run `verify-wp-bridge.sh`** — confirm `ALL CHECKS PASSED` at the end and that printed tool values match the RESEARCH seeded_data_facts (heatmap Do 20:00 ~19 orders; repeat ~20%; basket mode market_basket_product ≥3 pairs; run-rate confidence high/medium).
2. **Inspect the raw briefing payload** via the direct `curl | jq` one-liner above — confirm last-week revenue_total looks plausible, `top_products_3` names are real garden products (not `(unknown)`), and the 4 sub-sections look consistent.
3. **Run `audit-sql.sh`** — expect 6 green OK lines + `AUDIT PASSED` (offline run already confirmed green).
4. **Run `verify-coexistence.sh`** — expect `COEXISTENCE VERIFIED` and `wp_get_abilities()` in the 125..130 band.

Optionally (to fully cover ABIL-QA-02 permission case), Yuri can:
- Create a temporary subscriber-role WP user (e.g. `dev-subscriber`) via `ddev wp user create dev-subscriber sub@example.com --role=subscriber`.
- Generate an App Password for it.
- Export `SUBSCRIBER_USER=dev-subscriber SUBSCRIBER_APP_PASS=<pw>` before running verify-wp-bridge.sh.
- Expected: `OK: non-Shop-Manager user → HTTP 200 + isError:true`.

## Requirements Satisfied

| REQ-ID      | Description                                                                    | Evidence                                                                                                      |
|-------------|--------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------|
| ABIL-DEF-05 | weekly-briefing-data combined payload (last_week_summary + best_slot + repeat_metrics + top_products_3) | `abilities/weekly-briefing-data.php`                                                                          |
| ABIL-QA-01  | `verify-wp-bridge.sh` integration test                                         | `scripts/verify-wp-bridge.sh` (219 lines), shape + value + auth + permission assertions                       |
| ABIL-QA-02  | 401 / permission negative cases (corrected wording)                            | `verify-wp-bridge.sh` §3 (401) + §4 (HTTP 200 + isError:true per RESEARCH §A2 / §B7); wording note in script + this summary |
| ABIL-QA-04  | HPOS-safe static lint                                                          | `scripts/audit-sql.sh` checks 2, 5 (no wp_posts/postmeta, no hardcoded prefix)                                |
| ABIL-QA-05  | kmn + maxi coexistence                                                         | `scripts/verify-coexistence.sh` — both plugins active, 5 kmn + 0 leakage, Maxi endpoint clean, wp_get_abilities ≈127 |

## ABIL-QA-02 Wording Correction (recorded)

The original REQUIREMENTS.md wording stated: *"401 returned for invalid Application Password; 403 returned for user lacking manage_woocommerce"*.

The corrected acceptance, matching MCP Adapter v0.5.0 actual behavior (RESEARCH §A2 / §B7), is:

- **401** for invalid Application Password — unchanged, WP Basic Auth gate rejects at HTTP layer.
- **HTTP 200 + `CallToolResult{isError: true}`** for authenticated user lacking `manage_woocommerce` — adapter convention; the permission gate returns a structured error envelope inside a successful JSON-RPC response, not an HTTP 403.

`verify-wp-bridge.sh` asserts the corrected behavior (§4 of the script). The distinction is documented inline in the script comment and in the Application Password rotation runbook (`readme.md` lines 80–115) so future operators understand why a permission denial appears as HTTP 200.

## ABIL-QA-03 Deferral (recorded)

ABIL-QA-03 in its 2-second-query-timeout reading was fully delivered in Plan 16-02 (every ability calls `kmn_revenue_set_query_timeout_ms(2000)` — verified by `audit-sql.sh` check 4).

The adjacent **rate limit 60/min** requirement from WP_BRIDGE_ARCHITECTURE.md §9 is explicitly **DEFERRED to v3.1**:

- MCP Adapter v0.5.0 has no built-in rate limiter (RESEARCH §B6 / §E1).
- `includes/rate-limit.php` (created in Plan 16-01) holds a stub function `kmn_revenue_rate_limit_check()` that returns `true` unconditionally; the body is commented out with a TODO for v3.1 activation.
- No runtime enforcement is added in Plan 16-03. The stub file sits in place ready for a one-line edit when call volume justifies it.

To be added to `docs/DECISIONS.md` by the docs-memory-agent at phase close.

## Phase 16 Close Summary (20 REQ-IDs)

| REQ-ID        | Plan(s)             | Status      | Notes                                                                      |
|---------------|---------------------|-------------|----------------------------------------------------------------------------|
| MCPAPP-WP-01  | 16-01               | ✓ SATISFIED | Plugin template pattern encoded in main plugin file, readme, commits      |
| MCPAPP-WP-02  | 16-01               | ✓ SATISFIED | MCP Adapter v0.5.0 via composer; `mcp_adapter_init` hook; isolated server |
| MCPAPP-WP-03  | 16-01               | ✓ SATISFIED | App Password rotation runbook in readme.md                                 |
| ABIL-SCAF-01  | 16-01               | ✓ SATISFIED | WP 6.9+ + WC guards in `kmn-revenue-abilities.php`                         |
| ABIL-SCAF-02  | 16-01               | ✓ SATISFIED | composer.json pins `wordpress/mcp-adapter: 0.5.0` exact                    |
| ABIL-SCAF-03  | 16-01               | ✓ SATISFIED | `/wp-json/mcp/kmn-revenue` route via `bootstrap/register-mcp-server.php`   |
| ABIL-SCAF-04  | 16-01               | ✓ SATISFIED | `includes/sql-helpers.php` + `includes/cache.php` present + tested        |
| ABIL-SCAF-05  | 16-01               | ✓ SATISFIED | readme.md with install + runbook                                           |
| ABIL-DEF-01   | 16-02               | ✓ SATISFIED | `abilities/revenue-run-rate.php` — intra-day curve + 4 edge cases          |
| ABIL-DEF-02   | 16-02               | ✓ SATISFIED | `abilities/weekly-heatmap.php` — 7×24 + best_slot                          |
| ABIL-DEF-03   | 16-02               | ✓ SATISFIED | `abilities/repeat-metrics.php` — email-join, trend_pp, median              |
| ABIL-DEF-04   | 16-02               | ✓ SATISFIED | `abilities/market-basket.php` — probe-then-mode + AOV bands                |
| ABIL-DEF-05   | **16-03**           | ✓ SATISFIED | `abilities/weekly-briefing-data.php` — combined payload                    |
| ABIL-DEF-06   | 16-02, 16-03 audit  | ✓ SATISFIED | All SQL via `$wpdb->prepare()`; enforced by `audit-sql.sh` check 1         |
| ABIL-DEF-07   | 16-01               | ✓ SATISFIED | Cache with `woocommerce_order_status_changed` invalidation hook            |
| ABIL-QA-01    | **16-03**           | ✓ SATISFIED | `scripts/verify-wp-bridge.sh`                                              |
| ABIL-QA-02    | **16-03**           | ✓ SATISFIED | 401 + HTTP 200/isError:true (wording corrected); script asserts both cases |
| ABIL-QA-03    | 16-02 (timeout)     | ◐ PARTIAL   | 2s query budget delivered; **rate-limit 60/min deferred to v3.1** (stub)   |
| ABIL-QA-04    | 16-02, **16-03** audit | ✓ SATISFIED | HPOS-safe; enforced by `audit-sql.sh` check 2                           |
| ABIL-QA-05    | **16-03**           | ✓ SATISFIED | `scripts/verify-coexistence.sh` — disjoint tool lists, wp_get_abilities ≈127 |

**Net result:** 19 of 20 REQ-IDs fully satisfied; 1 explicitly deferred with a documented stub path.

## Handoff to Phase 17 (mcp-poc Node consumer)

- **Tool names in `tools/call`** MUST use the sanitized **hyphenated** form, not the slashed ability IDs:
  - ✓ `kmn-weekly-heatmap`, `kmn-repeat-metrics`, `kmn-revenue-run-rate`, `kmn-market-basket`, `kmn-weekly-briefing-data`
  - ✗ `kmn/weekly-heatmap`, `kmn/repeat-metrics`, etc. (these are WP-internal ability IDs)
- **mcp-proxy `ALLOWED_TOOLS` whitelist** in the Edge Function must use the hyphenated form for all 5 tools plus whatever existing revenue-intelligence v1 `daily_briefing` tool is already in place.
- **Unwrapping the response envelope**: MCP Adapter wraps the `kmn_revenue_response()` array as a JSON-stringified blob at `.result.content[0].text`. Consumers `JSON.parse(.result.content[0].text)` to get `{ success, data, error, _meta }`.
- **Combined briefing payload shape** (contract for Phase 20 Monday email):
  ```json
  {
    "success": true,
    "data": {
      "last_week_summary": { "week_start": "YYYY-MM-DD", "week_end": "YYYY-MM-DD", "revenue_total": 0.0, "order_count": 0, "aov": 0.0, "vs_prior_week_pct": 0.0 },
      "best_slot":         { "day_of_week": 4, "hour_of_day": 20, "order_count": 19 },
      "repeat_metrics":    { "repeat_rate_pct": 20.1, "total_orders": 1099, "unique_customers": 887, "returning_customers": 178, "median_days_to_2nd": null },
      "top_products_3":    [ { "product_id": 123, "name": "...", "qty_sold": 18 }, ... 3 items ],
      "calculated_at":     "2026-04-24T..."
    },
    "error": null,
    "_meta": { "plugin": "kmn-revenue-abilities", "version": "0.5.0", "calculated_at": "..." }
  }
  ```
- **Fail-fast contract**: on any sub-ability failure the top-level `success === false` and `error` carries a diagnostic. Phase 17's `daily_briefing` Node tool should wrap the call in `Promise.allSettled` with its own 3 siblings and present partial data gracefully; the WP-side orchestrator deliberately does NOT do that (single responsibility, testable in isolation).

## Deviations from Plan

### Auto-fixed during execution (Rule 1 — Bug)

**1. [Rule 1] Briefing comment contained literal `"wp_posts"` string tripping audit-sql HPOS lint.**
- **Found during:** first run of `audit-sql.sh` against the just-committed `abilities/weekly-briefing-data.php`.
- **Issue:** A docstring explaining why `get_posts()` is safe contained the tokens `wp_posts` (twice). The strict HPOS lint matched them as forbidden core-catalog-table usage.
- **Fix:** Rephrased the comment to say "core catalog tables" / "sanctioned WP abstraction" instead of naming the table. Same pattern as Plan 16-02 Deviation 2 (market-basket.php comment fix).
- **Files modified:** `wordpress-plugins/kmn-revenue-abilities/abilities/weekly-briefing-data.php` (4 insertions, 3 deletions).
- **Commit:** `04fb110`.

**2. [Rule 1] audit-sql.sh `returning_customer` check was over-broad.**
- **Found during:** second run of `audit-sql.sh` — after fix #1 landed.
- **Issue:** The original pattern `grep -rnE 'returning_customer'` matched (a) the legitimate output field `returning_customers` (plural — part of the repeat-metrics output schema and the briefing's derived field), and (b) docstring/comment references in `repeat-metrics.php` that explicitly explain "we don't use `wc_order_stats.returning_customer`". The lint intent is to catch real SQL column reads, not documentation of the decision.
- **Fix:** Tightened the regex to match only SQL-context usage (`SELECT ... returning_customer`, `WHERE ... returning_customer`, table-qualified `s.returning_customer` / `o.returning_customer`, or comma-separated column-list form) AND exclude PHPdoc/comment lines (`^\s*\*`, `^\s*//`) AND exclude the plural form. Applied in-place to `scripts/audit-sql.sh` before the scripts commit.
- **Files modified:** `scripts/audit-sql.sh` (final committed form already includes the fix).
- **Commit:** `2130a38` (the initial commit of the scripts contains the corrected regex; no separate revert commit needed — fix was applied before stage).

**3. [Rule 1] audit-sql.sh `wp_register_ability(` count regex didn't match multi-line form.**
- **Found during:** third run of `audit-sql.sh` against the 5 ability files.
- **Issue:** Regex `wp_register_ability\(\s*'kmn/` required the opening quote on the same line. `abilities/market-basket.php` formats the call as `wp_register_ability(\n    'kmn/market-basket',\n` (opening paren on one line, ability id on next). Regex reported 0 matches and failed the check.
- **Fix:** Split the check into two passes — count `wp_register_ability\s*\(` opening occurrences, then confirm at least one `'kmn/[a-z0-9-]+'` quoted id appears anywhere in the file. Handles both single-line and multi-line registration forms. Applied in-place before commit.
- **Commit:** `2130a38` (same as above — fix pre-stage).

**None of these were architectural — all three are static-analysis pattern narrowing to avoid false positives. All fixes applied in-place before the scripts commit, so the final repository state shows a single clean commit for the scripts plus one small commit for the briefing comment rephrase.**

### No other deviations

All three tasks (Task 1 ability, Task 2 scripts, Task 3 checkpoint) executed exactly as written:

- ability id `kmn/weekly-briefing-data` registered via `wp_abilities_api_init`.
- sub-ability invocation uses `get_callback('execute')` + `call_user_func()` (NOT `->execute()`).
- no call to run-rate or market-basket from the orchestrator (briefing email doesn't need them).
- all 5 value-correctness assertions live in `verify-wp-bridge.sh`; ANSI colors preserved; `SUBSCRIBER_*` env vars documented as opt-in.
- `audit-sql.sh` covers all 4 required checks (plus 2 bonus: hardcoded prefix, registration count).
- `verify-coexistence.sh` uses both endpoint probes and `wp_get_abilities()` count; Maxi route configurable via `MAXI_URL`.
- `ABIL-QA-02` wording correction documented in script comments AND this summary AND the readme's runbook section from 16-01.
- `ABIL-QA-03` rate-limit deferral documented with stub-file reference.
- Handoff to Phase 17 uses hyphenated tool names explicitly.
- Task 3 checkpoint — per sequential-execution orchestrator guidance, we do NOT halt for a human checkpoint before implementation is done; we complete all code, write SUMMARY, and flag live-DDEV items for Yuri's verification.

## Authentication Gates During Execution

None. All deviations were static-lint false-positives against just-committed files; no auth errors encountered (the executor host cannot run DDEV runtime probes, but this is an environment limitation flagged in the deferred items and Human Verification Required section, not an auth gate).

## Self-Check: PASSED

Artifact presence (all paths verified on disk):

- FOUND: wordpress-plugins/kmn-revenue-abilities/abilities/weekly-briefing-data.php (382 lines, min 180 ✓)
- FOUND: wordpress-plugins/kmn-revenue-abilities/scripts/verify-wp-bridge.sh (219 lines, min 120 ✓, +x)
- FOUND: wordpress-plugins/kmn-revenue-abilities/scripts/audit-sql.sh (150 lines, min 30 ✓, +x)
- FOUND: wordpress-plugins/kmn-revenue-abilities/scripts/verify-coexistence.sh (130 lines, min 40 ✓, +x)

Key-link pattern probes (per plan `must_haves.key_links`):

- FOUND: `wp_get_ability\(\s*['"]kmn/(weekly-heatmap|repeat-metrics)` in briefing (lines 170 + 205)
- FOUND: `/wp-json/mcp/kmn-revenue` in verify-wp-bridge.sh (BRIDGE_URL default)
- FOUND: `grep -rE` / `grep -rnE` in audit-sql.sh (lines 45, 60, 85, more)
- FOUND: `tools/list` in verify-coexistence.sh (lines 82, 101)

must_haves.truths (code-verifiable subset):

- FOUND: briefing composes last_week_summary + best_slot + repeat_metrics + top_products_3 (briefing line 337–344)
- FOUND: briefing calls sub-abilities via direct `get_callback('execute')` (lines 176–183 + 211–218); zero `->execute(` invocations on sub-ability objects
- FOUND: verify-wp-bridge.sh asserts exactly 5 sanitized tool names (line 37 expected string)
- FOUND: verify-wp-bridge.sh asserts 401 on wrong app pass (line 170)
- FOUND: verify-wp-bridge.sh asserts HTTP 200 + isError:true on permission denial (line 187, corrected ABIL-QA-02 wording)
- FOUND: verify-coexistence.sh asserts 5 kmn-* tools on kmn endpoint + 0 on Maxi (lines 87–91)
- FOUND: rate-limit.php stub is no-op returning true (created in 16-01, unchanged in 16-03)

Commit presence:

- FOUND: `7f5c9cc` (Task 1 — briefing orchestrator ability)
- FOUND: `04fb110` (Rule 1 fix — briefing comment rephrase so audit passes)
- FOUND: `2130a38` (Task 2 — three integration scripts with corrected regexes)

Offline runs:

- `php -l` on weekly-briefing-data.php → `No syntax errors detected`
- `bash -n` on all 3 scripts → ALL 3 SCRIPTS LINT CLEAN
- `bash scripts/audit-sql.sh` → 6/6 green OK, `AUDIT PASSED`, exit 0
