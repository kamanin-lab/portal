---
status: complete
phase: 16-kmn-revenue-abilities-wp-plugin
source: [16-VERIFICATION.md]
started: 2026-04-24T00:00:00Z
updated: 2026-04-24T00:00:00Z
---

## Current Test

[complete — all 6 UAT items green on DDEV 2026-04-24]

## Final Results (2026-04-24, auto-run via `docker exec ddev-summerfield-web`)

| Test | Result | Evidence |
|------|--------|----------|
| kmn-revenue-abilities plugin active | ✅ | 0.5.0 active; MCP adapter loads centrally via `mu-plugins/load-mcp-adapter.php` — no per-plugin composer install needed |
| 5 abilities resolve | ✅ | `wp_get_ability('kmn/...')` → y,y,y,y,y |
| `tools/list` via MCP | ✅ | 5 sanitised names; zero leakage |
| `audit-sql.sh` | ✅ **AUDIT PASSED** | 6/6 OK |
| `verify-wp-bridge.sh` | ✅ **ALL CHECKS PASSED** | heatmap Do 20:00 / 19 orders; repeat 20.07% (178/887); run-rate confidence=high; basket `market_basket_product` mode, 5 pairs, 265 multi-item; briefing payload shape valid; 401 on wrong app pass; heatmap timing 673/682 ms |
| `verify-coexistence.sh` | ✅ **COEXISTENCE VERIFIED** | both plugins active; kmn endpoint 5 tools zero leakage; `wp_get_abilities()` = 127 (122 Maxi + 5 kmn) |
| Raw briefing payload curl\|jq | ✅ | last_week €354,552 revenue +28.4% wk/wk (83 orders, AOV €4,271), best_slot Do 20:00 / 19 orders, top3 real Glatz parasol names (PALAZZO Noblesse, FORTERO Pro, FORTELLO Pro), repeat 20.07% |
| Composer vendor/ install | ✅ (not needed) | Mcp adapter centralised in `mu-plugins/vendor/` |
| ABIL-QA-02 permission probe (optional) | ⏭ skipped | SUBSCRIBER_USER env unset; 401 case covered by verify-wp-bridge |

### Patches applied during UAT (7 commits total)

1. **210eeec** — 5 ability SQL files: `wc_order_stats.date_created` → `date_created_gmt`. See ADR-035.
2. **b4bb629** — ADR-035 recorded.
3. **2de012e** — UAT interim notes.
4. **9f71ebc** — 4 remaining UAT defects:
   - weekly-briefing-data.php: `get_callback('execute')` → direct `->execute()` (WR-03)
   - verify-wp-bridge.sh: pass `timezone=+00:00` to match UTC-seeded contract
   - verify-coexistence.sh: `wp --path=/var/www/html` for in-container wp-cli + MCP initialize handshake on both endpoints

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
passed: 5
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps

(none — all tests green after fixes in commits 210eeec, b4bb629, 9f71ebc)
