#!/usr/bin/env bash
# audit-sql.sh
#
# Static SQL-safety + HPOS-correctness lint for abilities/ and includes/.
# Cheap enforcement of:
#
#   ABIL-DEF-06 — No raw $input interpolation in $wpdb-> calls
#                 (everything must go through $wpdb->prepare()).
#   ABIL-QA-04  — HPOS-safe: no joins to wp_posts or postmeta in abilities/
#                 (exception: weekly-briefing-data.php uses get_posts() for
#                  product-title lookup, which is a WP core API call — not
#                  a direct SQL join. We grep for literal table tokens.)
#   RESEARCH §C1 — No reliance on wc_order_stats.returning_customer
#                  (the email-join via wc_orders.billing_email is the source
#                  of truth; the flag is unreliable for guest checkouts).
#
# Also asserts every ability calls kmn_revenue_set_query_timeout_ms() at
# least once (ABIL-QA-03 enforcement point).
#
# Exit 0 = AUDIT PASSED, non-zero on any finding.

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

fail() { echo -e "${RED}FAIL${NC}: $*" >&2; exit 1; }
ok()   { echo -e "${GREEN}OK${NC}: $*"; }

echo "=== kmn-revenue-abilities: audit-sql.sh ==="
echo "Root: $PLUGIN_DIR"
echo

# ---------------------------------------------------------------------------
# 1. ABIL-DEF-06 — zero raw $input interpolation in $wpdb-> calls.
# ---------------------------------------------------------------------------
#
# Looks for the specific anti-pattern:
#   $wpdb->query( "... $input[...] ..." )
#   $wpdb->get_results( "... $input[...] ..." )
# These bypass prepare() and are injection surface.

if grep -rnE '\$wpdb->(query|get_results|get_var|get_col|get_row)\s*\(\s*"[^"]*\$input\[' "$PLUGIN_DIR/abilities/" 2>/dev/null; then
    fail "raw \$input[...] interpolation in SQL — must use \$wpdb->prepare()"
fi
ok "no raw \$input[] interpolation in abilities/"

# ---------------------------------------------------------------------------
# 2. ABIL-QA-04 — HPOS-safe: no wp_posts / postmeta references in abilities/.
# ---------------------------------------------------------------------------
#
# Exception: abilities/weekly-briefing-data.php uses get_posts() (a WP core
# API) to batch-lookup product titles. That is NOT a direct join to wp_posts
# — it's a sanctioned WP abstraction. We grep only for LITERAL table-name
# tokens ("wp_posts" / "postmeta") in SQL strings, which would indicate a
# hand-written JOIN. The get_posts() call does not match.

if grep -rnE 'wp_posts|postmeta' "$PLUGIN_DIR/abilities/" 2>/dev/null; then
    fail "found wp_posts or postmeta reference — abilities must read from HPOS tables only (wc_orders, wc_order_stats, wc_order_product_lookup) or go through WP core APIs like get_posts()"
fi
ok "no wp_posts / postmeta table tokens in abilities/"

# ---------------------------------------------------------------------------
# 3. RESEARCH §C1 — no use of wc_order_stats.returning_customer flag.
# ---------------------------------------------------------------------------

# Match ACTUAL SQL use of the forbidden tinyint column (singular), not
# documentation of the decision not to use it. Patterns that count:
#
#   SELECT ... returning_customer                  (bare column in SELECT)
#   WHERE  ... returning_customer                  (bare column in WHERE)
#   s.returning_customer / stats.returning_customer (table-qualified)
#   , returning_customer                           (column list)
#
# Patterns that do NOT count (docstring / comment context):
#   Leading space + star  ( *) → PHPdoc line
#   `returning_customer` inside backticks in a docstring line (still prefixed by *)
#   the plural output field 'returning_customers'
#
# We filter by requiring a SQL-keyword or table-qualifier context AND exclude
# PHPdoc/comment lines (prefixed by optional whitespace + '*' or '//').

if grep -rnE '(SELECT\s.*\breturning_customer\b|\b(s|stats|o|orders)\.returning_customer\b|,\s*returning_customer\b|\bWHERE\b.*\breturning_customer\b)' "$PLUGIN_DIR/abilities/" 2>/dev/null \
    | grep -vE '^\s*\*|^\s*//|returning_customers\b'; then
    fail "wc_order_stats.returning_customer used — unreliable per RESEARCH §C1 (5.8% vs 20.1% on seeded data due to guest-checkout customer_id churn). Join wc_orders and GROUP BY billing_email instead."
fi
ok "no wc_order_stats.returning_customer use in SQL (docstring references are allowed)"

# ---------------------------------------------------------------------------
# 4. ABIL-QA-03 — every ability calls kmn_revenue_set_query_timeout_ms().
# ---------------------------------------------------------------------------

missing_timeout=""
for f in "$PLUGIN_DIR"/abilities/*.php; do
    [[ -e "$f" ]] || continue
    if ! grep -q 'kmn_revenue_set_query_timeout_ms' "$f"; then
        missing_timeout+=" $(basename "$f")"
    fi
done
if [[ -n "$missing_timeout" ]]; then
    fail "the following abilities do not call kmn_revenue_set_query_timeout_ms():${missing_timeout}"
fi
ok "every ability sets MAX_EXECUTION_TIME via kmn_revenue_set_query_timeout_ms()"

# ---------------------------------------------------------------------------
# 5. No hardcoded table prefix — must use $wpdb->prefix dynamically.
# ---------------------------------------------------------------------------
#
# Summerfield uses s7uy9uh34_ (hardened prefix) in Phase 15; MBM uses wp_.
# Any literal 's7uy9uh34_' or 'wp_wc_order_stats' style string in SQL text
# would break cross-site.

if grep -rnE 's7uy9uh34_' "$PLUGIN_DIR/abilities/" "$PLUGIN_DIR/includes/" 2>/dev/null; then
    fail "hardcoded Summerfield table prefix s7uy9uh34_ found — use \$wpdb->prefix"
fi

if grep -rnE '"[^"]*\bwp_(wc_order_stats|wc_order_product_lookup|wc_orders|posts|postmeta)\b' "$PLUGIN_DIR/abilities/" 2>/dev/null; then
    fail "hardcoded wp_ prefix on WooCommerce/core table — use \$wpdb->prefix"
fi
ok "no hardcoded table prefix (\$wpdb->prefix used consistently)"

# ---------------------------------------------------------------------------
# 6. Every ability uses wp_register_ability( 'kmn/...' ) exactly once.
# ---------------------------------------------------------------------------

# Count is done in two passes because ability files may have the opening
# quote on the next line (wp_register_ability(\n    'kmn/foo',). A simple
# per-line grep for wp_register_ability( + a separate check for an adjacent
# 'kmn/' quoted string within the next 3 lines catches both formats.

for f in "$PLUGIN_DIR"/abilities/*.php; do
    [[ -e "$f" ]] || continue
    # Count wp_register_ability( openings. Exclude the function_exists guard line.
    open_count=$(grep -cE 'wp_register_ability\s*\(' "$f" | head -1)
    # function_exists guard appears as wp_register_ability in a strict-compare
    # without the opening paren — so the above regex already excludes it.
    if [[ "$open_count" != "1" ]]; then
        fail "$(basename "$f") has $open_count wp_register_ability( opening(s) (expected 1)"
    fi
    # Also confirm the kmn/ namespace is used (guard against any future drift).
    if ! grep -qE "'kmn/[a-z0-9-]+'" "$f"; then
        fail "$(basename "$f") wp_register_ability opening present but no 'kmn/...' id found within the file"
    fi
done
ok "each ability file registers exactly one kmn/* ability"

echo
echo -e "${GREEN}AUDIT PASSED${NC}"
