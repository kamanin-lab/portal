#!/usr/bin/env bash
# verify-wp-bridge.sh
#
# ABIL-QA-01 integration test. Exercises every tool on
# https://summerfield.ddev.site/wp-json/mcp/kmn-revenue via curl + jq with
# both shape and value assertions, plus the corrected ABIL-QA-02 auth /
# permission cases (401 on wrong app password; HTTP 200 + isError:true for
# authenticated user lacking manage_woocommerce — see RESEARCH §A2 / §B7).
#
# Environment:
#   WP_APP_PASS            required — Application Password for $WP_USER
#   BRIDGE_URL             optional — override MCP endpoint
#   WP_USER                optional — default dev-admin
#   SUBSCRIBER_USER        optional — username for the permission negative test
#   SUBSCRIBER_APP_PASS    optional — App Password for SUBSCRIBER_USER
#
# Exit 0 = ALL CHECKS PASSED. Exit non-zero with diagnostic on any failure.

set -euo pipefail

: "${BRIDGE_URL:=https://summerfield.ddev.site/wp-json/mcp/kmn-revenue}"
: "${WP_USER:=dev-admin}"
: "${WP_APP_PASS:?WP_APP_PASS env var required}"
: "${SUBSCRIBER_USER:=}"
: "${SUBSCRIBER_APP_PASS:=}"

AUTH="${WP_USER}:${WP_APP_PASS}"
CURL=(-sk -H 'Content-Type: application/json' -H 'Accept: application/json,text/event-stream')

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

fail() { echo -e "${RED}FAIL${NC}: $*" >&2; exit 1; }
ok()   { echo -e "${GREEN}OK${NC}: $*"; }
note() { echo -e "${YELLOW}INFO${NC}: $*"; }

command -v jq >/dev/null 2>&1 || fail "jq is required but not installed"
command -v curl >/dev/null 2>&1 || fail "curl is required but not installed"

echo "=== kmn-revenue-abilities: verify-wp-bridge.sh ==="
echo "Endpoint: $BRIDGE_URL"
echo "User:     $WP_USER"
echo

# ---------------------------------------------------------------------------
# 0. MCP Streamable HTTP handshake — initialize + capture Mcp-Session-Id
# ---------------------------------------------------------------------------

init_body='{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"verify-wp-bridge","version":"1.0"}}}'
init_headers=$(mktemp)
init_resp=$(curl "${CURL[@]}" -u "$AUTH" -X POST "$BRIDGE_URL" \
    -D "$init_headers" -d "$init_body")
SESSION_ID=$(grep -i '^Mcp-Session-Id:' "$init_headers" | awk '{print $2}' | tr -d '\r')
rm -f "$init_headers"
[[ -n "$SESSION_ID" ]] || fail "initialize did not return Mcp-Session-Id — response: $init_resp"
ok "initialize returned Mcp-Session-Id (${SESSION_ID:0:8}…)"

# Append session header to base curl opts for all subsequent calls.
CURL+=(-H "Mcp-Session-Id: $SESSION_ID")

# ---------------------------------------------------------------------------
# 1. tools/list returns exactly 5 sanitized tool names
# ---------------------------------------------------------------------------

list=$(curl "${CURL[@]}" -u "$AUTH" -X POST "$BRIDGE_URL" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
count=$(echo "$list" | jq '.result.tools | length')
[[ "$count" == "5" ]] || fail "expected 5 tools, got $count — response: $list"

names=$(echo "$list" | jq -r '.result.tools[].name' | sort | tr '\n' ',')
expected="kmn-market-basket,kmn-repeat-metrics,kmn-revenue-run-rate,kmn-weekly-briefing-data,kmn-weekly-heatmap,"
[[ "$names" == "$expected" ]] || fail "tool name mismatch:
  got:      $names
  expected: $expected"
ok "tools/list returns 5 sanitized names (slash→hyphen via McpNameSanitizer)"

# ---------------------------------------------------------------------------
# 2. Per-tool shape + value assertions
# ---------------------------------------------------------------------------

call() {
    local tool="$1" args="$2"
    curl "${CURL[@]}" -u "$AUTH" -X POST "$BRIDGE_URL" \
        -d "{\"jsonrpc\":\"2.0\",\"id\":42,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool\",\"arguments\":$args}}"
}

# Adapter wraps the ability response envelope as a JSON-stringified blob in
# .result.content[0].text; unwrap it into a plain JSON object.
unwrap() {
    echo "$1" | jq -r '.result.content[0].text'
}

# 2a. weekly-heatmap: best_slot Do 20:00 (dow=4, hod=20); order_count ∈ [17,21]
# The Phase 15 seeder stores timestamps as UTC with peak at hour 20 UTC. To
# match that contract, pass timezone=+00:00 — the site's resolved wp_timezone
# (Europe/Vienna, +02:00 under DST) would otherwise shift the peak to local 22.
resp=$(call kmn-weekly-heatmap '{"weeks":8,"timezone":"+00:00"}')
payload=$(unwrap "$resp")
echo "$payload" | jq -e '.success == true' > /dev/null \
    || fail "kmn-weekly-heatmap returned success=false — $payload"
data=$(echo "$payload" | jq '.data')
dow=$(echo "$data" | jq -r '.best_slot.day_of_week')
hod=$(echo "$data" | jq -r '.best_slot.hour_of_day')
oc=$(echo "$data" | jq -r '.best_slot.order_count')
buckets_len=$(echo "$data" | jq '.buckets | length')
[[ "$dow" == "4" ]] \
    || fail "heatmap best_slot.day_of_week expected 4, got $dow"
[[ "$hod" == "20" ]] \
    || fail "heatmap best_slot.hour_of_day expected 20, got $hod"
(( oc >= 17 && oc <= 21 )) \
    || fail "heatmap best_slot.order_count expected ∈ [17,21], got $oc"
(( buckets_len >= 30 )) \
    || fail "heatmap buckets unexpectedly sparse: $buckets_len (expected >=30)"
ok "kmn-weekly-heatmap: best_slot=Do 20:00 ($oc orders), $buckets_len buckets"

# 2b. repeat-metrics: repeat_rate_pct ∈ [18.0, 22.0]; benchmark_pct == 27.0
resp=$(call kmn-repeat-metrics '{}')
payload=$(unwrap "$resp")
echo "$payload" | jq -e '.success == true' > /dev/null \
    || fail "kmn-repeat-metrics returned success=false — $payload"
data=$(echo "$payload" | jq '.data')
rate=$(echo "$data" | jq -r '.repeat_rate_pct')
unique=$(echo "$data" | jq -r '.unique_customers')
returning=$(echo "$data" | jq -r '.returning_customers')
awk -v r="$rate" 'BEGIN { exit !(r >= 18.0 && r <= 22.0) }' \
    || fail "repeat_rate_pct expected ∈ [18.0,22.0], got $rate"
echo "$data" | jq -e '.benchmark_pct == 27.0' > /dev/null \
    || fail "benchmark_pct expected 27.0"
ok "kmn-repeat-metrics: repeat_rate_pct=$rate ($returning/$unique returning/unique)"

# 2c. revenue-run-rate: confidence enum + expected_by_hour length 24 + payment_split
# timezone=+00:00 to match seeded-data UTC contract (see 2a note).
resp=$(call kmn-revenue-run-rate '{"timezone":"+00:00"}')
payload=$(unwrap "$resp")
echo "$payload" | jq -e '.success == true' > /dev/null \
    || fail "kmn-revenue-run-rate returned success=false — $payload"
data=$(echo "$payload" | jq '.data')
conf=$(echo "$data" | jq -r '.confidence')
[[ "$conf" =~ ^(high|medium|low)$ ]] \
    || fail "confidence expected enum high|medium|low, got $conf"
echo "$data" | jq -e '.expected_by_hour | length == 24' > /dev/null \
    || fail "expected_by_hour expected length 24"
echo "$data" | jq -e '.payment_split | type == "array"' > /dev/null \
    || fail "payment_split expected array"
ok "kmn-revenue-run-rate: confidence=$conf, payment_split present"

# 2d. market-basket: probe-then-mode + AOV bands always
resp=$(call kmn-market-basket '{}')
payload=$(unwrap "$resp")
echo "$payload" | jq -e '.success == true' > /dev/null \
    || fail "kmn-market-basket returned success=false — $payload"
data=$(echo "$payload" | jq '.data')
mode=$(echo "$data" | jq -r '.mode')
pairs=$(echo "$data" | jq '.basket_pairs | length')
multi=$(echo "$data" | jq -r '.multi_item_orders')
[[ "$mode" == "market_basket_product" ]] \
    || fail "expected mode=market_basket_product, got $mode (multi_item_orders=$multi)"
(( pairs >= 3 )) \
    || fail "basket_pairs expected length ≥ 3, got $pairs"
echo "$data" | jq -e '.aov_bands | length == 3' > /dev/null \
    || fail "aov_bands expected length 3"
ok "kmn-market-basket: mode=$mode, basket_pairs=$pairs, multi_item_orders=$multi"

# 2e. weekly-briefing-data: combined payload shape
# timezone=+00:00 to match seeded-data UTC contract (see 2a note).
resp=$(call kmn-weekly-briefing-data '{"timezone":"+00:00"}')
payload=$(unwrap "$resp")
echo "$payload" | jq -e '.success == true' > /dev/null \
    || fail "kmn-weekly-briefing-data returned success=false — $payload"
data=$(echo "$payload" | jq '.data')
echo "$data" | jq -e '.best_slot.day_of_week | type == "number"' > /dev/null \
    || fail "briefing best_slot missing or wrong type"
echo "$data" | jq -e '.repeat_metrics.repeat_rate_pct | type == "number"' > /dev/null \
    || fail "briefing repeat_metrics.repeat_rate_pct missing"
echo "$data" | jq -e '.last_week_summary.revenue_total | type == "number"' > /dev/null \
    || fail "briefing last_week_summary.revenue_total missing"
echo "$data" | jq -e '.last_week_summary.order_count | type == "number"' > /dev/null \
    || fail "briefing last_week_summary.order_count missing"
echo "$data" | jq -e '.last_week_summary.aov | type == "number"' > /dev/null \
    || fail "briefing last_week_summary.aov missing"
echo "$data" | jq -e '.last_week_summary.vs_prior_week_pct | type == "number"' > /dev/null \
    || fail "briefing last_week_summary.vs_prior_week_pct missing"
top_len=$(echo "$data" | jq '.top_products_3 | length')
[[ "$top_len" == "3" ]] \
    || fail "top_products_3 expected length 3, got $top_len"
echo "$data" | jq -e '.top_products_3[0] | has("product_id") and has("name") and has("qty_sold")' > /dev/null \
    || fail "top_products_3 items missing required keys (product_id, name, qty_sold)"
echo "$data" | jq -e '.calculated_at | type == "string"' > /dev/null \
    || fail "briefing calculated_at missing"
ok "kmn-weekly-briefing-data: combined payload shape valid (top_products_3 length=$top_len)"

# ---------------------------------------------------------------------------
# 3. Auth — wrong app password → HTTP 401
# ---------------------------------------------------------------------------

http=$(curl -sk -o /dev/null -w '%{http_code}' -u "$WP_USER:wrong-password" \
    -H 'Content-Type: application/json' -H 'Accept: application/json,text/event-stream' \
    -X POST "$BRIDGE_URL" -d '{"jsonrpc":"2.0","id":99,"method":"tools/list"}')
[[ "$http" == "401" ]] \
    || fail "expected HTTP 401 on wrong app pass, got $http (permission_callback gate may be bypassed)"
ok "wrong app password → HTTP 401"

# ---------------------------------------------------------------------------
# 4. Permission — user lacking manage_woocommerce → HTTP 200 + isError:true
# ---------------------------------------------------------------------------
#
# Corrected ABIL-QA-02 acceptance per RESEARCH §A2 / §B7:
# the MCP Adapter v0.5.0 returns HTTP 200 with a CallToolResult where
# `.result.isError == true` for permission failures — NOT HTTP 403.
# The adapter's permission gate is ability-level; see plugin readme for the
# full rotation runbook.

if [[ -n "$SUBSCRIBER_USER" && -n "$SUBSCRIBER_APP_PASS" ]]; then
    perm_resp=$(curl "${CURL[@]}" -u "$SUBSCRIBER_USER:$SUBSCRIBER_APP_PASS" -X POST "$BRIDGE_URL" \
        -d '{"jsonrpc":"2.0","id":100,"method":"tools/call","params":{"name":"kmn-weekly-heatmap","arguments":{}}}')
    is_error=$(echo "$perm_resp" | jq -r '.result.isError // false')
    [[ "$is_error" == "true" ]] \
        || fail "expected isError:true for non-Shop-Manager user, got: $perm_resp"
    ok "non-Shop-Manager user → HTTP 200 + isError:true (per RESEARCH §B7)"
else
    note "SKIP permission negative case — SUBSCRIBER_USER + SUBSCRIBER_APP_PASS not set"
    note "      Opt-in: create a subscriber-role WP user, generate an app password,"
    note "      and export SUBSCRIBER_USER / SUBSCRIBER_APP_PASS to cover ABIL-QA-02 fully."
fi

# ---------------------------------------------------------------------------
# 5. Cache-hit timing (informational — not a hard gate)
# ---------------------------------------------------------------------------

t_a=$(date +%s%3N)
call kmn-weekly-heatmap '{"weeks":8}' > /dev/null
t_b=$(date +%s%3N)
call kmn-weekly-heatmap '{"weeks":8}' > /dev/null
t_c=$(date +%s%3N)
note "heatmap timing: first=$((t_b - t_a))ms, warm=$((t_c - t_b))ms"

echo
echo -e "${GREEN}ALL CHECKS PASSED${NC}"
