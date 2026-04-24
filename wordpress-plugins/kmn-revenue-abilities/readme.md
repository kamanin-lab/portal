# kmn-revenue-abilities

KAMANIN WordPress companion plugin exposing WooCommerce revenue-analytics
abilities over the MCP Adapter at `/wp-json/mcp/kmn-revenue`. Consumed by
the `kamanda-mcp` server for the KAMANIN Portal.

> **Plan 16-01 status:** activatable scaffold — bootstrap + shared helpers
> land first. The five abilities (`weekly-heatmap`, `repeat-metrics`,
> `revenue-run-rate`, `market-basket`, `weekly-briefing-data`) arrive in
> Plan 16-02. `tools/list` currently returns an empty array.

## Requirements

| Component    | Minimum version | Notes                                                                   |
|--------------|-----------------|-------------------------------------------------------------------------|
| WordPress    | 6.9             | Abilities API merged into core in 6.9                                   |
| PHP          | 8.1             | `wordpress/mcp-adapter` requires 8.1+                                   |
| WooCommerce  | 8.x             | HPOS required (`wc_order_stats`, `wc_order_product_lookup`)             |
| MySQL        | 8.0             | `ROW_NUMBER()` and `SET SESSION MAX_EXECUTION_TIME` used by abilities   |
| Composer     | 2.x             | Installs `wordpress/mcp-adapter: 0.5.0` into the plugin's own `vendor/` |

## Installation (DDEV / local development)

```bash
# Install plugin composer dependencies inside the web container so the
# platform PHP version matches the runtime.
ddev exec 'cd /var/www/html/wp-content/plugins/kmn-revenue-abilities && composer install --no-dev --optimize-autoloader'

# Activate.
ddev wp plugin activate kmn-revenue-abilities
```

Verify the MCP endpoint responds:

```bash
curl -sk -u dev-admin:"$WP_APP_PASS" -X POST \
  https://summerfield.ddev.site/wp-json/mcp/kmn-revenue \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json,text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | jq '.result.tools'
```

For Plan 16-01 the `tools` array is `[]` — no abilities registered yet. In
Plan 16-02 all five abilities appear.

## Tool name sanitisation

The MCP Adapter sanitises ability ids for MCP tool names by replacing
slashes with hyphens. Abilities are registered under these ids and exposed
as these MCP tool names:

| Ability id                 | MCP tool name                |
|----------------------------|------------------------------|
| `kmn/weekly-heatmap`       | `kmn-weekly-heatmap`         |
| `kmn/repeat-metrics`       | `kmn-repeat-metrics`         |
| `kmn/revenue-run-rate`     | `kmn-revenue-run-rate`       |
| `kmn/market-basket`        | `kmn-market-basket`          |
| `kmn/weekly-briefing-data` | `kmn-weekly-briefing-data`   |

Callers (MCP clients, `kamanda-mcp`) use the hyphenated form in
`tools/call` `name` fields.

## WP-CLI ability tester

Direct, no-HTTP execution of an ability for development:

```bash
# List all kmn/* abilities registered on the site.
ddev wp kmn ability list

# Invoke one directly (after Plan 16-02 lands).
ddev wp kmn ability test kmn/weekly-heatmap --input='{"weeks":8}'
```

During Plan 16-01 `list` prints the sentinel line
`no abilities registered yet` and `test` refuses with
`Ability "…" not registered.` Both exit with status 0 / 1 respectively.

## Application Password Rotation Runbook

The MCP server authenticates via WordPress Application Passwords. Every
client site uses a dedicated service account. Rotation is manual.

### Local DDEV (Summerfield clone)

1. WP Admin → Users → `dev-admin` → scroll to **Application Passwords**.
2. Revoke the existing entry named `mcp-dev` (if present).
3. Enter `mcp-dev` → **Add New Application Password** → copy the
   24-character password (spaces are purely cosmetic, strip them before
   storing).
4. Update `mcp-poc/.env.local`:
   - `WOOCOMMERCE_WP_USER=dev-admin`
   - `WOOCOMMERCE_WP_APP_PASS=<new password>`
5. Restart the mcp-poc dev process so the new password is picked up.

### Production (Summerfield live, MBM, future clients)

1. Create a dedicated `kmn-analytics-bot` user with **Shop Manager** role.
   Shop Manager has `manage_woocommerce` but not `manage_options` —
   least-privilege for read-only analytics.
2. Generate an Application Password via WP Admin (steps 2–3 above).
3. Store the password in the client's secrets vault.
4. Rotation cadence: every **90 days**, or immediately on any suspected
   compromise.
5. After rotation update the mcp-poc Vercel env vars
   (`WOOCOMMERCE_WP_USER`, `WOOCOMMERCE_WP_APP_PASS`, `KMN_BRIDGE_URL`)
   and redeploy.

### Revoking a compromised password

WP Admin → Users → `{account}` → Application Passwords → **Revoke**. Takes
effect immediately; all mcp-poc calls using the revoked password start
returning HTTP 401 on the next request.

## Architecture

- **Main file:** `kmn-revenue-abilities.php` — WP plugin header, ABSPATH
  guard, WP 6.9+ + WooCommerce guards, `plugins_loaded` init. Mirrors
  `maxi-ai/maxi-ai.php` conventions verbatim (final class, static methods,
  procedural helpers, no PSR-4 namespaces).
- **Composer:** `composer.json` pins `wordpress/mcp-adapter: 0.5.0`
  (exact — pre-1.0 risk, deliberate upgrades only). `vendor/` is committed
  with the plugin per standard WP distribution practice.
- **`.htaccess`:** blocks direct web access to `.md`, `.txt`, `.example`,
  `.json`, `.lock`.

## File layout

```
kmn-revenue-abilities.php              # plugin header + loader
composer.json                          # wordpress/mcp-adapter: 0.5.0 exact
vendor/                                # committed composer tree (generated on DDEV)
bootstrap/register-mcp-server.php      # $adapter->create_server() wiring
abilities/                             # (Plan 16-02) one file per ability
includes/
  ├── response.php                     # kmn_revenue_response() envelope
  ├── cache.php                        # cache_key() + transient hooks
  ├── sql-helpers.php                  # date / timezone / status helpers
  ├── rate-limit.php                   # STUB — deferred to v3.1
  └── cli-command.php                  # wp kmn ability list|test
scripts/
  └── verify-wp-bridge.sh              # (Plan 16-03) integration test
.htaccess                              # blocks direct access to .md/.json/.txt/.example/.lock
readme.md                              # this file
```

## References

- [docs/ideas/WP_BRIDGE_ARCHITECTURE.md](../../docs/ideas/WP_BRIDGE_ARCHITECTURE.md) — original ability design spec
- [.planning/phases/16-kmn-revenue-abilities-wp-plugin/16-RESEARCH.md](../../.planning/phases/16-kmn-revenue-abilities-wp-plugin/16-RESEARCH.md) — verified signatures + SQL schema facts
- [docs/ideas/LOCAL_DEV_SETUP.md](../../docs/ideas/LOCAL_DEV_SETUP.md) — DDEV onboarding guide
- [docs/DECISIONS.md](../../docs/DECISIONS.md) — ADR log (Application Password rotation entry added in Phase 16 wrap-up)
