---
status: partial
phase: 16-kmn-revenue-abilities-wp-plugin
source: [16-VERIFICATION.md]
started: 2026-04-24T00:00:00Z
updated: 2026-04-24T00:00:00Z
---

## Current Test

[awaiting human testing on DDEV host]

## Tests

### 1. verify-wp-bridge.sh — full integration probe
expected: Green "ALL CHECKS PASSED" with heatmap best_slot=Do 20:00 (~19 orders), repeat_rate_pct ∈ [18.0, 22.0], basket mode=market_basket_product with ≥3 pairs, run-rate confidence ∈ {high, medium, low}, briefing payload shape valid
command: `cd wordpress-plugins/kmn-revenue-abilities && WP_APP_PASS='6MEkttWMf26sFbGzpQ3ZfEuQ' bash scripts/verify-wp-bridge.sh`
result: [pending]

### 2. audit-sql.sh — in-situ SQL lint
expected: 6 green OK lines + "AUDIT PASSED" (zero raw $input interpolation, zero wp_posts/postmeta tokens, no returning_customer in SQL, every ability calls kmn_revenue_set_query_timeout_ms, no hardcoded prefix, every ability registers exactly one kmn/* ability)
command: `cd wordpress-plugins/kmn-revenue-abilities && bash scripts/audit-sql.sh`
result: [pending]

### 3. verify-coexistence.sh — Maxi-AI compatibility
expected: "COEXISTENCE VERIFIED" — both plugins active, disjoint MCP tool lists, `wp_get_abilities()` total ≈ 125–130
command: `cd wordpress-plugins/kmn-revenue-abilities && WP_APP_PASS='6MEkttWMf26sFbGzpQ3ZfEuQ' bash scripts/verify-coexistence.sh`
result: [pending]

### 4. Raw briefing payload sanity check
expected: last_week_summary.revenue_total plausible for furniture shop; top_products_3[0].name is a real garden product (not "(unknown)"); best_slot.day_of_week==4, hour_of_day==20; repeat_metrics.repeat_rate_pct ≈ 20.1
command: |
  curl -sk -u "dev-admin:6MEkttWMf26sFbGzpQ3ZfEuQ" \
    -X POST https://summerfield.ddev.site/wp-json/mcp/kmn-revenue \
    -H 'Content-Type: application/json' -H 'Accept: application/json,text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"kmn-weekly-briefing-data","arguments":{}}}' \
    | jq '.result.content[0].text | fromjson | .data'
result: [pending]

### 5. Composer vendor/ install + plugin activation on DDEV
expected: `ddev wp plugin activate kmn-revenue-abilities` succeeds; all 5 abilities resolve via `wp_get_ability('kmn/...')`
command: |
  ddev exec 'cd /var/www/html/wp-content/plugins/kmn-revenue-abilities && composer install --no-dev --optimize-autoloader'
  ddev wp plugin activate kmn-revenue-abilities
  for id in kmn/weekly-heatmap kmn/repeat-metrics kmn/revenue-run-rate kmn/market-basket kmn/weekly-briefing-data; do
    ddev wp eval "echo wp_get_ability('$id') ? 'y' : 'n';"
  done
result: [pending]

### 6. (Optional) Subscriber user ABIL-QA-02 permission probe
expected: 401 on wrong app-password, 200 + isError:true with `code: rest_forbidden` on authenticated user lacking manage_woocommerce
why: RESEARCH §A2/§B7 clarified HTTP 403 in REQUIREMENTS.md is actually HTTP 200 + MCP isError:true envelope at the JSON-RPC layer
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
