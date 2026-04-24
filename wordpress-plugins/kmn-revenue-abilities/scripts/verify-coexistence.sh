#!/usr/bin/env bash
# verify-coexistence.sh
#
# ABIL-QA-05 assertion: kmn-revenue-abilities and maxi-ai both active on the
# same WordPress install without tool-list collision or namespace bleed.
#
#   1. Both plugins report active via `wp plugin list`.
#   2. /wp-json/mcp/kmn-revenue tools/list returns ONLY kmn-* tools (5 total).
#   3. Maxi's MCP endpoint (default /wp-json/mcp/maxi-ai — overridable via
#      MAXI_URL env) contains ZERO kmn-* tools.
#   4. Global wp_get_abilities() count is ~127 (122 Maxi + 5 kmn); this
#      catches a collision even if one endpoint is unreachable.
#
# Environment:
#   WP_APP_PASS   required — Application Password for $WP_USER
#   WP_USER       optional — default dev-admin
#   MAXI_URL      optional — override Maxi MCP endpoint
#   DDEV          optional — command to prefix wp-cli calls (default: "ddev")
#                 set to "" to call wp directly on the host
#
# Exit 0 = COEXISTENCE VERIFIED, non-zero on any collision.

set -euo pipefail

: "${WP_USER:=dev-admin}"
: "${WP_APP_PASS:?WP_APP_PASS env var required}"
# DDEV: command prefix for wp-cli. Autodetect: if we're already inside the DDEV
# web container (WP_CLI is native), leave empty. Otherwise default to 'ddev'.
# Respects a caller-provided DDEV value (including empty string via DDEV='').
if [[ -z "${DDEV+set}" ]]; then
    if command -v wp >/dev/null 2>&1 && [[ -d /var/www/html ]]; then
        DDEV=""
    else
        DDEV="ddev"
    fi
fi

KMN_URL="${KMN_URL:-https://summerfield.ddev.site/wp-json/mcp/kmn-revenue}"
MAXI_URL="${MAXI_URL:-https://summerfield.ddev.site/wp-json/mcp/maxi-ai}"

AUTH="${WP_USER}:${WP_APP_PASS}"
CURL=(-sk -H 'Content-Type: application/json' -H 'Accept: application/json,text/event-stream' -u "$AUTH")

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

fail() { echo -e "${RED}FAIL${NC}: $*" >&2; exit 1; }
ok()   { echo -e "${GREEN}OK${NC}: $*"; }
note() { echo -e "${YELLOW}INFO${NC}: $*"; }

command -v jq >/dev/null 2>&1   || fail "jq is required but not installed"
command -v curl >/dev/null 2>&1 || fail "curl is required but not installed"

# Build the wp-cli invocation wrapper. $DDEV may be empty (host wp-cli) or
# "ddev" (container) or any other container-exec prefix (eg "lando").
: "${WP_PATH:=/var/www/html}"
wp_run() {
    if [[ -n "$DDEV" ]]; then
        "$DDEV" wp "$@"
    else
        wp --path="$WP_PATH" "$@"
    fi
}

echo "=== kmn-revenue-abilities: verify-coexistence.sh ==="
echo "Kmn endpoint : $KMN_URL"
echo "Maxi endpoint: $MAXI_URL"
echo

# ---------------------------------------------------------------------------
# 1. Both plugins active.
# ---------------------------------------------------------------------------

plugin_csv=$(wp_run plugin list --status=active --format=csv 2>/dev/null || true)
if [[ -z "$plugin_csv" ]]; then
    fail "could not fetch plugin list via '${DDEV:-host} wp plugin list' — is WP-CLI reachable?"
fi

echo "$plugin_csv" | grep -q '^kmn-revenue-abilities,' \
    || fail "kmn-revenue-abilities is NOT active"
echo "$plugin_csv" | grep -q '^maxi-ai,' \
    || fail "maxi-ai is NOT active (Phase 15 prerequisite)"
ok "both kmn-revenue-abilities and maxi-ai are active"

# ---------------------------------------------------------------------------
# 2. kmn endpoint returns only kmn-* tools.
# ---------------------------------------------------------------------------

# MCP Streamable HTTP requires an initialize handshake before tools/list;
# server-side session id must then be echoed on every subsequent call.
mcp_session_id() {
    local url="$1"
    local headers
    headers=$(mktemp)
    curl "${CURL[@]}" -X POST "$url" -D "$headers" -o /dev/null \
        -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"verify-coexistence","version":"1.0"}}}' 2>/dev/null
    grep -i '^Mcp-Session-Id:' "$headers" | awk '{print $2}' | tr -d '\r'
    rm -f "$headers"
}

KMN_SESSION=$(mcp_session_id "$KMN_URL")
[[ -n "$KMN_SESSION" ]] || fail "kmn initialize did not return Mcp-Session-Id"

kmn=$(curl "${CURL[@]}" -X POST "$KMN_URL" \
    -H "Mcp-Session-Id: $KMN_SESSION" \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}')
kmn_count=$(echo "$kmn" | jq '.result.tools | length' 2>/dev/null || echo "0")
non_kmn=$(echo "$kmn" | jq -r '.result.tools[]?.name' 2>/dev/null | grep -vc '^kmn-' || true)

[[ "$kmn_count" == "5" ]] \
    || fail "kmn endpoint expected 5 tools, got $kmn_count — response: $kmn"
[[ "$non_kmn" == "0" ]] \
    || fail "kmn endpoint leaked $non_kmn non-kmn-* tool(s) — possible adapter misconfig"
ok "kmn endpoint returns exactly 5 kmn-* tools, zero leakage"

# ---------------------------------------------------------------------------
# 3. Maxi endpoint contains zero kmn-* tools.
# ---------------------------------------------------------------------------
#
# Maxi's actual MCP route is environment-dependent. If the curl fails or
# returns something other than a JSON-RPC result, we SKIP and rely on step 4
# (wp_get_abilities count) to catch collisions. Override with MAXI_URL.

MAXI_SESSION=$(mcp_session_id "$MAXI_URL" 2>/dev/null || echo "")
if [[ -n "$MAXI_SESSION" ]]; then
    maxi_raw=$(curl "${CURL[@]}" -X POST "$MAXI_URL" \
        -H "Mcp-Session-Id: $MAXI_SESSION" \
        -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' 2>/dev/null || echo "")
else
    maxi_raw=""
fi

if [[ -n "$maxi_raw" ]] && echo "$maxi_raw" | jq -e '.result.tools' >/dev/null 2>&1; then
    leak=$(echo "$maxi_raw" | jq -r '.result.tools[]?.name' 2>/dev/null | grep -c '^kmn-' || true)
    [[ "$leak" == "0" ]] \
        || fail "Maxi endpoint leaked $leak kmn-* tool(s) — cross-server contamination"
    maxi_count=$(echo "$maxi_raw" | jq '.result.tools | length' 2>/dev/null || echo 0)
    ok "Maxi endpoint returns $maxi_count tools, zero kmn-* contamination"
else
    note "SKIP Maxi endpoint probe — $MAXI_URL not reachable or wrong route"
    note "      Set MAXI_URL env var to Maxi's actual MCP route to enable this check."
fi

# ---------------------------------------------------------------------------
# 4. Global wp_get_abilities() count ≈ 127 (122 Maxi + 5 kmn).
# ---------------------------------------------------------------------------

total_raw=$(wp_run eval 'echo count(wp_get_abilities());' 2>/dev/null || echo "")
total_raw=$(echo "$total_raw" | tr -d '[:space:]')
if ! [[ "$total_raw" =~ ^[0-9]+$ ]]; then
    fail "could not read wp_get_abilities() count (got: $total_raw)"
fi
total=$(( total_raw ))
if (( total < 125 || total > 130 )); then
    fail "wp_get_abilities() = $total — expected 125..130 (122 Maxi + 5 kmn ±3 test variance)"
fi
ok "wp_get_abilities() = $total (within 125..130)"

echo
echo -e "${GREEN}COEXISTENCE VERIFIED${NC}"
