---
phase: 15-local-dev-synthetic-seeder
plan: 01
subsystem: wordpress-bridge
tags: [ddev, wordpress, woocommerce, mcp, php, scaffold]
requires:
  - DEV-01 (DDEV environment — pre-existing, Yuri deployed)
provides:
  - DEV-02 (MCP Adapter hook reachable — pending Yuri's `composer require`)
  - DEV-03 (kmn-revenue-abilities plugin scaffold — committed; symlink pending Yuri)
  - DEV-04 (maxi-ai symlink — pending Yuri)
  - DEV-05 (Application Password — runbook documented; issuance pending Yuri)
  - DEV-06 (WC REST API keys — runbook documented; issuance pending Yuri)
  - DEV-07 (HPOS enabled — verification command documented; check pending Yuri)
  - DEV-08 (Node→DDEV TLS via NODE_EXTRA_CA_CERTS — runbook documented; setup pending Yuri)
  - DEV-09 (.gitignore whitelist fix — DONE)
  - DEV-10 (Decisions recorded — DONE, ADR-035 + ADR-036)
affects:
  - Plan 15-02 (seeder) — unblocked on PORTAL side; still requires Yuri's DDEV to execute
tech-stack:
  added:
    - WordPress plugin scaffold convention (mirrors maxi-ai style: final class, no PSR-4)
    - `wordpress-plugins/` as tracked directory
    - Composer as a dependency manager for WP plugin vendor deps
key-files:
  created:
    - wordpress-plugins/kmn-revenue-abilities/kmn-revenue-abilities.php
    - wordpress-plugins/kmn-revenue-abilities/composer.json
    - wordpress-plugins/kmn-revenue-abilities/.htaccess
    - wordpress-plugins/kmn-revenue-abilities/readme.md
  modified:
    - .gitignore
    - docs/DECISIONS.md
    - docs/CHANGELOG.md
decisions:
  - ADR-035 (DDEV on WSL-native FS, Apache-FPM + PHP 8.4 + MySQL 8.0 matching prod)
  - ADR-036 (Application Password rotation runbook, credential decoupling from wp-audit.ts)
metrics:
  duration_seconds: 237
  duration_human: "~4 minutes (PORTAL-side automation only; Yuri's WSL setup separate)"
  completed: 2026-04-23
---

# Phase 15 Plan 1: DDEV plumbing + plugin scaffold — Summary

Empty-shell WordPress plugin scaffold committed to PORTAL, `.gitignore` fixed for PHP tracking, DDEV stack decisions recorded as ADRs. The WSL-side setup (composer install, symlinks, plugin activation, credential issuance) requires Yuri's hands and is handed off via the checklist below.

## One-liner

First PHP in PORTAL: activatable empty `kmn-revenue-abilities` plugin shell with WP 6.9 + WooCommerce guards, composer pinning `wordpress/mcp-adapter:0.5.0`, `.gitignore` whitelist fixed, ADR-035/036 recording DDEV stack + App Password rotation runbook.

## Completed (automation side)

### Files

| File | Lines | Change |
|------|-------|--------|
| `.gitignore` | +13 | Added `!scripts/*.php`, `!scripts/seed-orders.md`, WP plugin section, `.ddev/*` block |
| `wordpress-plugins/kmn-revenue-abilities/kmn-revenue-abilities.php` | 70 new | Plugin main — `final class KMN_Revenue_Abilities`, WP 6.9 guard, WC dependency guard, ABSPATH guard, composer autoload hook, no-op activation/deactivation |
| `wordpress-plugins/kmn-revenue-abilities/composer.json` | 16 new | `wordpress/mcp-adapter: 0.5.0` (exact pin) |
| `wordpress-plugins/kmn-revenue-abilities/.htaccess` | 5 new | Blocks `.md`/`.example`/`.txt`/`.json`/`.lock` |
| `wordpress-plugins/kmn-revenue-abilities/readme.md` | 82 new | Developer onboarding: DDEV symlink, App Password + WC REST key commands |
| `docs/DECISIONS.md` | +71 | ADR-035 (DDEV stack) + ADR-036 (App Password rotation runbook) |
| `docs/CHANGELOG.md` | +35 (this plan's portion) | Phase 15 Plan 1 entry with user_setup checklist reference |

### Git commits

| Hash | Subject |
|------|---------|
| `0e5459e` | chore(15-01): fix .gitignore whitelist for WP plugin scaffold |
| `956458d` | feat(15-01): add kmn-revenue-abilities plugin scaffold (empty shell) |
| `3f229df` | docs(15-01): ADR-035 DDEV stack + ADR-036 App Password rotation runbook |

All on branch `staging`. No merges to `main`.

### Verification results

1. **`git check-ignore scripts/seed-orders.php`** → exit 1 (file trackable). PASS.
2. **Plugin files exist** → 4 files created at `wordpress-plugins/kmn-revenue-abilities/`. PASS.
3. **`composer.json` has `"wordpress/mcp-adapter": "0.5.0"`** → grep confirms exact string. PASS.
4. **`php -l kmn-revenue-abilities.php`** → "No syntax errors detected". PASS.

Additional checks:
- `git check-ignore wordpress-plugins/kmn-revenue-abilities/composer.lock` → exit 0 (correctly ignored). PASS.
- `git check-ignore scripts/seed-orders.md` → exit 1 (trackable). PASS.

## Deviations from Plan

**None.** Plan executed exactly as written on the automation side. No bugs found, no missing critical functionality, no blocking issues, no architectural decisions needed. Tasks 3, 4, 5 (composer install, symlinks, credential issuance) are `user_setup` — they were never in the automation scope; they are handed off to Yuri below.

## USER SETUP — Yuri's checklist

Run these in a WSL terminal. Expected outputs included so you can confirm "success" at each step. All work happens in `/home/upan/projects/sf_staging/`.

```bash
# ─────────────────────────────────────────────────────────────────────
# 1. Install MCP Adapter v0.5.0 via composer (Option A — preferred)
# ─────────────────────────────────────────────────────────────────────
cd /home/upan/projects/sf_staging
ddev exec mkdir -p /var/www/html/wp-content/mu-plugins
ddev composer require \
  --working-dir=/var/www/html/wp-content/mu-plugins \
  wordpress/mcp-adapter:0.5.0
# Expected: "Installation complete" and composer.json updated.
# If FAILS with "Could not find package": try Option B:
#   ddev wp plugin install mcp-adapter --activate

# If Option A installed but adapter doesn't auto-load, add loader:
ddev exec bash -c 'cat > /var/www/html/wp-content/mu-plugins/load-mcp-adapter.php <<PHP
<?php
if ( file_exists( __DIR__ . "/vendor/autoload.php" ) ) {
    require_once __DIR__ . "/vendor/autoload.php";
}
PHP'

# Verify adapter is reachable:
ddev wp eval 'var_dump( class_exists("WordPress\\\\Mcp\\\\Core\\\\Server\\\\McpServerBuilder") || class_exists("WP_MCP_Adapter") || defined("MCP_ADAPTER_VERSION") );'
# Expected: bool(true)

# ─────────────────────────────────────────────────────────────────────
# 2. Symlink kmn-revenue-abilities plugin from PORTAL repo
# ─────────────────────────────────────────────────────────────────────
cd /home/upan/projects/sf_staging/wp-content/plugins
ln -sfn /mnt/g/01_OPUS/Projects/PORTAL/wordpress-plugins/kmn-revenue-abilities kmn-revenue-abilities
ls -la kmn-revenue-abilities
# Expected: lrwxrwxrwx ... kmn-revenue-abilities -> /mnt/g/01_OPUS/Projects/PORTAL/wordpress-plugins/kmn-revenue-abilities

# ─────────────────────────────────────────────────────────────────────
# 3. Symlink Maxi AI plugin from PORTAL repo root
# ─────────────────────────────────────────────────────────────────────
ln -sfn /mnt/g/01_OPUS/Projects/PORTAL/maxi-ai maxi-ai
ls -la maxi-ai
# Expected: lrwxrwxrwx ... maxi-ai -> /mnt/g/01_OPUS/Projects/PORTAL/maxi-ai

# ─────────────────────────────────────────────────────────────────────
# 4. Activate both plugins
# ─────────────────────────────────────────────────────────────────────
cd /home/upan/projects/sf_staging
ddev wp plugin activate kmn-revenue-abilities maxi-ai
ddev wp plugin list --status=active --format=csv | grep -E '^(kmn-revenue-abilities|maxi-ai),'
# Expected: two lines
#   kmn-revenue-abilities,active,none,0.1.0,auto
#   maxi-ai,active,none,3.3.0,auto

# Sanity — no fatals:
ddev logs -s web --tail 100 | grep -iE 'fatal|parse error' && echo "ERRORS — investigate" || echo "clean"
# Expected: "clean"

# ─────────────────────────────────────────────────────────────────────
# 5. Generate Application Password for admin — RECORD THIS, shown ONCE
# ─────────────────────────────────────────────────────────────────────
ddev wp user application-password create admin "mcp-dev" --porcelain
# Expected output: a 24-character password like "xxxx xxxx xxxx xxxx xxxx xxxx"
# ⚠️ COPY IMMEDIATELY — WordPress does not show it again.
# → Paste into mcp-poc/.env.local as WOOCOMMERCE_WP_APP_PASS=...
# → Also record in password vault under "kmn-analytics-bot @ summerfield.ddev.site"

# ─────────────────────────────────────────────────────────────────────
# 6. Generate WooCommerce REST API keys — RECORD ck_... AND cs_...
# ─────────────────────────────────────────────────────────────────────
ddev wp wc api-key create admin \
  --user=admin \
  --description="mcp-dev" \
  --permissions=read \
  --porcelain
# Expected output: two strings
#   consumer_key:    ck_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
#   consumer_secret: cs_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# → Paste into mcp-poc/.env.local as:
#   WOOCOMMERCE_CONSUMER_KEY=ck_...
#   WOOCOMMERCE_CONSUMER_SECRET=cs_...
#   WOOCOMMERCE_STORE_URL=https://summerfield.ddev.site

# ─────────────────────────────────────────────────────────────────────
# 7. Verify HPOS is enabled
# ─────────────────────────────────────────────────────────────────────
ddev wp wc hpos status
# Expected: "HPOS Enabled: yes" (or similar green indicator)

ddev exec mysql -u db -pdb db -e "SHOW TABLES LIKE 'wp_wc_order%';"
# Expected: rows for
#   wp_wc_orders
#   wp_wc_order_stats
#   wp_wc_order_product_lookup
#   wp_wc_order_addresses
#   wp_wc_order_operational_data

# If HPOS is NOT enabled:
#   WP Admin → WooCommerce → Settings → Advanced → Features → High-Performance order storage → enable
#   Compatibility mode → Off; run migration if prompted.

# ─────────────────────────────────────────────────────────────────────
# 8. Set up NODE_EXTRA_CA_CERTS for mcp-poc (persist in shell rc)
# ─────────────────────────────────────────────────────────────────────
echo 'export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"' >> ~/.bashrc
source ~/.bashrc

# Verify Node trusts DDEV cert:
node --input-type=module -e "
const res = await fetch('https://summerfield.ddev.site/wp-json/');
console.log('status:', res.status);
const body = await res.json();
console.log('namespaces:', body.namespaces.slice(0, 3));
"
# Expected:
#   status: 200
#   namespaces: [ 'oembed/1.0', 'wp/v2', 'wp-site-health/v1' ] (or similar)
# If UNABLE_TO_VERIFY_LEAF_SIGNATURE: the export didn't stick — re-source .bashrc.

# Authenticated probe with new app password (sanity-check credential):
curl -sk -u "admin:<PASTE APP PASSWORD WITH SPACES>" \
  https://summerfield.ddev.site/wp-json/wp/v2/users/me \
  | head -c 300
# Expected: JSON starting with {"id":1,"name":"admin",..."roles":["administrator"]
# If 401: password was truncated or missing spaces — regenerate.

# ─────────────────────────────────────────────────────────────────────
# 9. Final verification — plugin active without fatal
# ─────────────────────────────────────────────────────────────────────
ddev wp plugin list | grep kmn-revenue-abilities
# Expected: kmn-revenue-abilities | active | none | 0.1.0
```

## Done gate — must_haves.truths

Per plan frontmatter `must_haves.truths`, one line per truth:

| Truth | Status |
|-------|--------|
| DDEV environment at `/home/upan/projects/sf_staging/` is reachable on `https://summerfield.ddev.site` with mkcert TLS trusted | **PENDING-USER** (DEV-01 done pre-plan; mkcert trust requires user step 8) |
| Both `kmn-revenue-abilities` and `maxi-ai` appear in `ddev wp plugin list --status=active` | **PENDING-USER** (user steps 2, 3, 4) |
| MCP Adapter v0.5.0 is installed such that `mcp_adapter_init` hook will fire when abilities are added in Phase 16 | **PENDING-USER** (user step 1) |
| HPOS is enabled — `wp_wc_order_stats` and `wp_wc_order_product_lookup` tables exist | **PENDING-USER** (user step 7; was documented as already enabled in prep, confirm) |
| A fresh Application Password is issued for admin user with description `mcp-dev` and recorded out-of-band | **PENDING-USER** (user step 5) |
| WooCommerce REST consumer key/secret are generated for admin with read permission | **PENDING-USER** (user step 6) |
| `.gitignore` no longer silently excludes `scripts/seed-orders.php` nor `wordpress-plugins/kmn-revenue-abilities/**` | **PASS** (commit `0e5459e`; verified by `git check-ignore`) |
| mcp-poc process can connect to `https://summerfield.ddev.site` with `NODE_EXTRA_CA_CERTS` pointing at mkcert root CA | **PENDING-USER** (user step 8) |
| `docs/DECISIONS.md` records: WSL-native path choice, Apache+PHP 8.4+MySQL 8.0 stack, uploads-redirect via `.htaccess`, Application Password rotation runbook | **PASS** (commit `3f229df`, ADR-035 + ADR-036) |

**Summary:** 2 PASS (PORTAL side) · 7 PENDING-USER (Yuri's WSL side) · 0 FAIL.

## Open risks for Plan 2

- **MCP Adapter package availability:** If `composer require wordpress/mcp-adapter:0.5.0` returns 404, fall back to `ddev wp plugin install mcp-adapter --activate` (Option B). Package may not be publicly registered on Packagist yet.
- **Adapter auto-load:** If `class_exists` probe returns false after Option A install, the mu-plugins loader (step 1 fallback snippet in checklist) is required. Phase 16 plan should re-verify this before expecting `mcp_adapter_init` to fire.
- **HPOS state unknown at this moment:** Plan assumed HPOS is already on (pre-plan DEV-01 deployment). If Yuri confirms it's off in step 7, Plan 15-02 seeder will fail writing orders — block seeder until HPOS enabled.
- **Symlink resolution on WSL:** Requires `/etc/wsl.conf` to have `[automount]\nenabled=true\noptions="metadata,..."`. If symlinks to `/mnt/g/` don't activate, symptom is the plugin appearing greyed out in `wp plugin list`. Remedy: re-check wsl.conf, restart WSL.
- **Credential name collision:** `WOOCOMMERCE_WP_USER` / `WOOCOMMERCE_WP_APP_PASS` are distinct from existing `WP_MCP_USER` / `WP_MCP_APP_PASS` (wp-audit.ts). If Yuri pastes into the wrong variable, the wp-audit.ts calls will break. ADR-036 documents this.

## ADR numbers used

- ADR-035 — Local WordPress Dev via DDEV on WSL-Native FS
- ADR-036 — WordPress Application Password Rotation for kmn-revenue MCP Bridge

Next unused ADR number for Phase 16: **ADR-037**.

## Next step

**Yuri:** run the USER SETUP commands above (9 steps) in your WSL terminal at `/home/upan/projects/sf_staging/`. When all 9 steps pass their "Expected" outputs, signal completion ("approved" or paste the final `ddev wp plugin list` output) to unblock Plan 15-02 (synthetic seeder).

## Self-Check: PASSED

- Files created: `wordpress-plugins/kmn-revenue-abilities/{kmn-revenue-abilities.php, composer.json, .htaccess, readme.md}` — all 4 FOUND.
- Commits: `0e5459e`, `956458d`, `3f229df` — all 3 FOUND in `git log`.
- `.gitignore` entries verified via `git check-ignore`.
- ADR-035 + ADR-036 verified via `grep` in DECISIONS.md.
- CHANGELOG entry verified via `grep` in CHANGELOG.md.
