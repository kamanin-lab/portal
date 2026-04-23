# KMN Revenue Abilities

WooCommerce revenue-analytics aggregations exposed via MCP (WP Abilities API + `wordpress/mcp-adapter`). Consumed by the `kamanda-mcp` server for KAMANIN Portal.

> **Phase 15 scope:** this plugin is an *activatable shell* — zero abilities registered. Abilities land in Phase 16.

## Requirements

| Component | Minimum version | Notes |
|-----------|-----------------|-------|
| WordPress | 6.9             | Abilities API matured in 6.9 |
| WooCommerce | 8.x           | HPOS tables required (`wp_wc_order_stats`, `wp_wc_order_product_lookup`) |
| PHP | 8.1                 | `wordpress/mcp-adapter` requires 8.1+ |
| MCP Adapter | 0.5.0         | Pinned exactly — pre-1.0 risk, deliberate upgrades only |

## Local development (DDEV)

This plugin lives in the PORTAL repo at `wordpress-plugins/kmn-revenue-abilities/`. It is symlinked into the DDEV Summerfield clone at `/home/upan/projects/sf_staging/wp-content/plugins/`.

### One-time setup in WSL

```bash
# Symlink plugin source into DDEV install
cd /home/upan/projects/sf_staging/wp-content/plugins
ln -sfn /mnt/g/01_OPUS/Projects/PORTAL/wordpress-plugins/kmn-revenue-abilities kmn-revenue-abilities

# Symlink Maxi AI plugin (already in PORTAL repo root)
ln -sfn /mnt/g/01_OPUS/Projects/PORTAL/maxi-ai maxi-ai

# Install MCP Adapter via composer inside DDEV (Option A — preferred)
cd /home/upan/projects/sf_staging
ddev exec mkdir -p /var/www/html/wp-content/mu-plugins
ddev composer require \
  --working-dir=/var/www/html/wp-content/mu-plugins \
  wordpress/mcp-adapter:0.5.0

# Activate both plugins
ddev wp plugin activate kmn-revenue-abilities maxi-ai

# Verify HPOS enabled
ddev wp wc hpos status
```

### Generate Application Password (for mcp-poc Basic-Auth)

```bash
ddev wp user application-password create admin "mcp-dev" --porcelain
# Record the 24-character password in Yuri's vault + mcp-poc/.env.local as WOOCOMMERCE_WP_APP_PASS
```

### Generate WooCommerce REST API keys (for legacy wc/v3 tools)

```bash
ddev wp wc api-key create admin \
  --user=admin \
  --description="mcp-dev" \
  --permissions=read \
  --porcelain
# Record ck_... and cs_... as WOOCOMMERCE_CONSUMER_KEY / WOOCOMMERCE_CONSUMER_SECRET
```

## Architecture

- **Main file:** `kmn-revenue-abilities.php` — WP plugin header, ABSPATH guard, WP version + WC dependency checks, `plugins_loaded` init hook. Mirrors `maxi-ai/maxi-ai.php` conventions verbatim (final class, static methods, no PSR-4).
- **Composer:** `composer.json` declares `wordpress/mcp-adapter: 0.5.0` (exact pin). `vendor/` is populated inside DDEV by `composer install` and is committed with the plugin per standard WP distribution practice.
- **`.htaccess`:** blocks direct web access to `.md`, `.txt`, `.example`, `.json`, `.lock`.

## References

- [docs/DECISIONS.md](../../docs/DECISIONS.md) — ADR entries for DDEV stack choice + Application Password rotation runbook
- [docs/ideas/WP_BRIDGE_ARCHITECTURE.md](../../docs/ideas/WP_BRIDGE_ARCHITECTURE.md) — ability design spec (Phase 16)
- [docs/ideas/LOCAL_DEV_SETUP.md](../../docs/ideas/LOCAL_DEV_SETUP.md) — DDEV onboarding guide

## Application Password rotation

See `docs/DECISIONS.md` under "Application Password Rotation for kmn-revenue MCP Bridge" for the step-by-step runbook. TL;DR:

1. Generate new password in WP Admin → Users → admin → Application Passwords.
2. Update `WOOCOMMERCE_WP_APP_PASS` in `mcp-poc/.env.local` + Vercel env.
3. Run verification probe (`curl -u admin:<pass> .../wp-json/wp/v2/users/me`).
4. Revoke old password.
5. Record rotation date in DECISIONS.md rotation log.
