# Local Dev Setup — Revenue Intelligence V2 (DDEV + WSL + Docker)

> Related docs: `docs/ideas/WP_BRIDGE_ARCHITECTURE.md` (plugin structure and abilities),
> `docs/ideas/REVENUE_INTELLIGENCE_V2_PLAN.md` (4 analytics blocks + implementation sequence),
> `docs/ideas/MCP_UI_RESOURCE_BUILD_PIPELINE.md` (widget build pipeline).
> Those docs define *what* to build. This doc defines *how to run it locally*.
>
> **Actual deployed stack (2026-04-23):** Apache-FPM + PHP 8.4 + MySQL 8.0, path `/home/upan/projects/sf_staging/` (WSL-native ext4 — Option B from §13 was chosen). Earlier sections of this doc originally proposed nginx + PHP 8.2 + MariaDB 10.11 inside `PORTAL/wp-local/` — those references are **superseded** by the canonical stack listed here and in §4/§6.

---

## 1. Goal

Provide a fully reproducible local environment for Revenue Intelligence V2 development on a Summerfield WordPress clone. Developer reaches a working HTTPS WordPress site at `https://summerfield.ddev.site` with WooCommerce, plugins, imported production DB, and synthetic order data in under 30 minutes.

**Non-goals:**
- Production deployment to live Summerfield or MBM (separate doc, post-launch)
- macOS or native Windows DDEV setups (WSL2-only)
- Portal frontend local dev (already covered in `CLAUDE.md`)

---

## 2. Why DDEV + WSL + Docker

| Concern | Choice | Reason |
|---------|--------|--------|
| Windows WP dev | DDEV inside WSL2 | Official supported stack ([ddev.readthedocs.io](https://ddev.readthedocs.io/en/latest/users/install/ddev-installation/)), not a workaround |
| Filesystem perf | **WSL2 native FS at `/home/upan/projects/sf_staging/`** | WSL2 `ext4` near-native; `/mnt/g/` 9P bridge is 2-4× slower for PHP-heavy workloads |
| HTTPS | mkcert via DDEV | Auto-provisions trusted cert at `summerfield.ddev.site` |
| Web server | **Apache-FPM** | Matches Summerfield prod hosting |
| PHP version | **8.4** in DDEV container | Latest stable, matches prod |
| WP-CLI | Bundled in DDEV | `ddev wp` runs inside container with correct DB creds |
| Database | **MySQL 8.0** | Matches Summerfield prod; HPOS-compatible |

Docker Desktop provides container runtime; DDEV orchestrates. This is the only configuration with official Windows support + tested HTTPS on WSL2.

---

## 3. Host Prerequisites

Install in order. Each links to official docs.

- **Windows 10 Home 10.0.19045 with WSL2 enabled.**
  Windows 10 Home supports WSL2 from build 19041+. Your build (19045) qualifies.
  Enable: `wsl --install` in elevated PowerShell.
  Docs: https://learn.microsoft.com/en-us/windows/wsl/install

- **Docker Desktop for Windows with WSL2 backend.**
  Settings → General → "Use the WSL 2 based engine" checked.
  Settings → Resources → WSL Integration → enable for Ubuntu distro.
  Download: https://www.docker.com/products/docker-desktop/

- **WSL2 distro — Ubuntu 22.04 LTS recommended.**
  `wsl --install -d Ubuntu-22.04` or from Microsoft Store.
  Confirm WSL2 (not WSL1): `wsl -l -v` — VERSION column must show `2`.

- **DDEV installed INSIDE WSL — not Windows side.**
  From inside Ubuntu:
  ```bash
  curl -fsSL https://ddev.com/install.sh | bash
  ```
  Verify: `ddev version`. Minimum: 1.23.0.
  Docs: https://ddev.readthedocs.io/en/latest/users/install/ddev-installation/#wsl2-with-docker-desktop

- **mkcert CA** — DDEV auto-installs on first `ddev start`. Pre-install optional: `mkcert -install` inside WSL.
  Docs: https://github.com/FiloSottile/mkcert

- **WP-CLI** — bundled by DDEV. All commands run as `ddev wp <cmd>`. Do NOT install globally.

- **Node.js 20+ in WSL** (for mcp-poc local dev only). `nvm install 20` or distro package. Required only for mcp-poc server.

---

## 4. Repository Layout — Actual Split

Key insight: the WP install lives in **WSL-native filesystem** (`/home/upan/projects/sf_staging/`), NOT inside the PORTAL git repo. Plugin code lives in `PORTAL/wordpress-plugins/` and is symlinked into the WP install.

```
/home/upan/projects/sf_staging/               ← WSL ext4 (NOT in PORTAL repo, NOT git-tracked)
├── .ddev/                                    ← DDEV config
├── wp-config.php
├── wp-content/
│   ├── plugins/
│   │   ├── kmn-revenue-abilities/            ← symlink → /mnt/g/.../PORTAL/wordpress-plugins/kmn-revenue-abilities
│   │   ├── maxi-ai/                          ← symlink → /mnt/g/.../PORTAL/maxi-ai (or separate clone)
│   │   ├── mcp-adapter/                      ← composer-managed in mu-plugins
│   │   └── woocommerce/
│   ├── themes/summerfield/                   ← git: feature/logo-marquee-to-prod (tracked by Summerfield's own repo, not PORTAL)
│   └── uploads/                              ← NOT local (302 redirect to prod via .htaccess; only blocksy/local-google-fonts/ copied for CORS)
├── wp-includes/
└── wp-admin/

/mnt/g/01_OPUS/Projects/PORTAL/               ← PORTAL git root (tracked)
├── wordpress-plugins/                        ← TRACKED — our plugin source of truth
│   └── kmn-revenue-abilities/
│       ├── kmn-revenue-abilities.php
│       ├── bootstrap/
│       ├── abilities/
│       ├── includes/
│       ├── vendor/                           ← tracked (ships with plugin)
│       └── composer.json
├── maxi-ai/                                  ← Michael's plugin, coexistence reference
└── scripts/
    └── seed-orders.php                       ← tracked (Phase 15 deliverable)
```

**Git tracking rationale:**

| Path | In git? | Why |
|------|---------|-----|
| `PORTAL/wordpress-plugins/kmn-revenue-abilities/` | Yes | Shipped code |
| `PORTAL/wordpress-plugins/*/vendor/` | Yes | Composer deps, standard WP plugin practice |
| `/home/upan/projects/sf_staging/` | No | WSL-local only; WP install rebuildable from DB dump + symlinks |
| `.ddev/config.yaml` (inside sf_staging) | Optional — can copy to PORTAL repo for reproducibility | If copied: committed under `PORTAL/.ddev-reference/config.yaml` (not active `.ddev/`) |
| `PORTAL/scripts/seed-orders.php` | Yes | First PHP script in PORTAL — `.gitignore` whitelist must allow it |

Plugin code and seeder live in the PORTAL git repo. The WP installation is ephemeral and lives entirely in WSL home.

---

## 5. .gitignore Additions

Add to `PORTAL/.gitignore`:

```gitignore
# WordPress local dev environment (DDEV + WP install)
wp-local/
.ddev/*
!.ddev/config.yaml
!.ddev/providers/
!.ddev/providers/**

# WordPress plugin — test cache and local overrides
wordpress-plugins/*/.phpunit.result.cache
wordpress-plugins/*/composer.lock
```

**DO NOT gitignore `wordpress-plugins/` itself** — that's our tracked plugin source. **DO NOT gitignore `wordpress-plugins/*/vendor/`** — composer deps ship with the plugin.

---

## 6. Step-by-Step Setup

**Canonical stack (current):** Apache-FPM + PHP 8.4 + MySQL 8.0. WSL-native path `/home/upan/projects/sf_staging/`.

All commands run **inside WSL2**.

> **Note on state as of 2026-04-23:** Yuri has already deployed DDEV at `/home/upan/projects/sf_staging/` with production DB imported (324 MB), URL search-replace done (14 401 replacements), uploads 302-redirected to prod via `.htaccess`, and smoke test passing. Steps 1-5 below are **already done** on Yuri's machine. They remain here as the canonical recipe for any developer onboarding from scratch.

### Step 1 — Create project directory (one-time)

```bash
mkdir -p /home/upan/projects/sf_staging
cd /home/upan/projects/sf_staging
```

### Step 2 — Configure DDEV (one-time)

```bash
cd /home/upan/projects/sf_staging
ddev config \
  --project-type=wordpress \
  --project-name=summerfield \
  --docroot=. \
  --create-docroot \
  --webserver-type=apache-fpm \
  --database=mysql:8.0 \
  --php-version=8.4
```

Writes `.ddev/config.yaml`. DDEV detects config from any subdirectory of the project root.

**Why Apache + MySQL 8.0 + PHP 8.4 (not nginx + MariaDB):** matches Summerfield production hosting exactly. Eliminates "works on local, breaks on prod" class of bugs (especially `.htaccess` rewrite semantics, which differ between Apache and nginx).

### Step 3 — Start DDEV

```bash
ddev start
```

DDEV will:
- Pull Docker images (~500 MB first run)
- Run `mkcert -install` and issue cert for `summerfield.ddev.site`
- Add hostname to Windows `hosts` file (prompts for admin elevation)
- Expose `https://summerfield.ddev.site` and `http://summerfield.ddev.site`

Verify: `ddev describe`.

### Step 4 — Install WordPress 6.9+

```bash
ddev wp core download --version=6.9.1
ddev wp config create --dbname=db --dbuser=db --dbpass=db --dbhost=db
ddev wp core install \
  --url=https://summerfield.ddev.site \
  --title="Summerfield Dev" \
  --admin_user=admin \
  --admin_password=admin \
  --admin_email=dev@summerfield.local \
  --skip-email
```

Verify: `ddev wp core version` → `6.9.1`.

### Step 5 — Install WooCommerce

```bash
ddev wp plugin install woocommerce --activate
ddev wp wc --user=admin tool run install_pages
```

`install_pages` creates shop/cart/checkout/account pages. Without it WC nags on every admin page.

Verify: `ddev wp plugin list` — woocommerce = active.

### Step 6 — Install MCP Adapter

Two install paths — confirm which works for `wordpress/mcp-adapter` v0.5.0 before running:

**Option A — via Composer in mu-plugins (preferred):**
```bash
ddev exec mkdir -p /var/www/html/wp-content/mu-plugins
ddev composer require \
  --working-dir=/var/www/html/wp-content/mu-plugins \
  wordpress/mcp-adapter:^0.5
```

**Option B — via wp.org plugin directory (fallback):**
```bash
ddev wp plugin install mcp-adapter --activate
```

MCP Adapter v0.5.0 (released 2026-04-15): https://github.com/WordPress/mcp-adapter/releases

### Step 7 — Symlink plugin + Maxi

```bash
ln -s /mnt/g/01_OPUS/Projects/PORTAL/wordpress-plugins/kmn-revenue-abilities \
      /mnt/g/01_OPUS/Projects/PORTAL/wp-local/wp-content/plugins/kmn-revenue-abilities

ln -s /mnt/g/01_OPUS/Projects/PORTAL/maxi-ai \
      /mnt/g/01_OPUS/Projects/PORTAL/wp-local/wp-content/plugins/maxi-ai
```

**Assumes:** `maxi-ai/` exists at PORTAL root. Adjust path if elsewhere.

**WSL symlink requirement:** WSL mount must have `metadata` option for symlinks in `/mnt/` paths to be followed by container. See Troubleshooting §13.

### Step 8 — Activate plugins (ONLY after plugin code exists)

```bash
ddev wp plugin activate kmn-revenue-abilities
ddev wp plugin activate maxi-ai
```

**Do NOT run this step** if `kmn-revenue-abilities.php` doesn't exist yet — activating a fatally-broken plugin breaks WP install.

Verify: `ddev wp plugin list` — both active.

### Step 9 — Generate Application Passwords

```bash
ddev wp user application-password create admin "mcp-dev" --porcelain
```

Output: 24-character password in `xxxx xxxx xxxx xxxx xxxx xxxx` format. **Record immediately** — shown once. Goes into mcp-poc `.env` as `WOOCOMMERCE_WP_APP_PASS`.

WooCommerce REST keys (for WC REST endpoints used by existing tools):
```bash
ddev wp wc api-key create admin \
  --user=admin \
  --description="mcp-dev" \
  --permissions=read \
  --porcelain
```

Record `consumer_key` and `consumer_secret`.

---

## 7. Summerfield Data Import

Decision tree:
```
Summerfield DB dump available?
  YES → Option A (full clone) — preferred
  NO  → Product CSV available?
    YES → Option B (products + synthetic orders)
    NO  → Option C (generator fallback)
```

### Option A — Full DB clone (preferred)

1. On live Summerfield server:
   ```bash
   wp db export summerfield.sql --allow-root
   gzip summerfield.sql
   ```
2. Copy to Windows machine.
3. Import:
   ```bash
   ddev import-db --src=/path/to/summerfield.sql.gz
   ```
4. Search-replace URL:
   ```bash
   ddev wp search-replace "https://summerfield.at" "https://summerfield.ddev.site" --all-tables
   ```
5. Sync uploads (optional, for images):
   ```bash
   rsync -avz user@summerfield.at:/var/www/html/wp-content/uploads/ \
     /mnt/g/01_OPUS/Projects/PORTAL/wp-local/wp-content/uploads/
   ```

**Assumes:** SSH access to live Summerfield. `--all-tables` flag required for serialized WC option data.

### Option B — Products + synthetic orders

1. Export products: WC Admin → Products → Export CSV on live site.
2. Import local:
   ```bash
   ddev wp wc product import /path/to/products.csv --user=admin
   ```
3. Proceed to synthetic orders (§8).

### Option C — Fresh WC + WC Smooth Generator

```bash
ddev wp plugin install wc-smooth-generator --activate
ddev wp wc generate products 200
ddev wp wc generate customers 500
```

Docs: https://github.com/woocommerce/wc-smooth-generator

Then §8 for synthetic orders.

---

## 8. Synthetic Data Generation

Strategy described here. Actual `seed-orders.php` written as separate implementation task.

### Seed parameters

| Parameter | Target | Why |
|-----------|--------|-----|
| Weeks of history | 12 | Enough for weekly trend lines |
| Daily order avg | 15 | Matches MBM observed volume |
| Day-of-week bias | Thu/Fri stronger | Furniture buying behavior |
| Hour-of-day curve | Peaks 10-12 and 19-22 | Morning browse + evening decision |
| Repeat customer rate | ~27% | Matches Shopify B2C benchmark |
| Multi-item basket rate | ~20% | Gives market basket probe signal |

### Invocation

```bash
ddev wp kmn seed --weeks=12 --daily-avg=15 --repeat-rate=0.27 --multi-item-rate=0.20
```

Reset (wipes test orders only — flagged via `_kmn_test_order` meta):
```bash
ddev wp kmn seed reset
```

### HPOS-aware writes

Seeder writes directly to HPOS tables (`wp_wc_order_stats`, `wp_wc_order_product_lookup`, `wp_posts` HPOS sync) to avoid WC order factory overhead.

**Idempotent:** each test order gets `_kmn_test_order = 1`. Reset deletes by flag only — never touches unflagged orders.

---

## 9. HPOS Verification

Before writing any aggregation SQL, verify HPOS state:

```bash
ddev wp wc hpos status
```

Expected on WC 8.x+: HPOS enabled, legacy tables in sync or disabled.

If not enabled:
1. WP Admin → WooCommerce → Settings → Advanced → Features
2. "High-Performance order storage" → enable
3. "Compatibility mode" → Off (sync then disable legacy)
4. Run migration if prompted

**Policy:** HPOS-only. Aggregation SQL queries `wp_wc_order_stats` and `wp_wc_order_product_lookup` directly. Pre-HPOS imports require migration before block SQL development.

Verify tables exist:
```bash
ddev exec mysql db -e "SHOW TABLES LIKE 'wp_wc_order%';"
```

Expected: `wp_wc_orders`, `wp_wc_order_stats`, `wp_wc_order_product_lookup`, `wp_wc_order_addresses`, `wp_wc_order_operational_data`.

---

## 10. MCP Server → Local WP Connection

When running mcp-poc locally (`npm run dev` in mcp-poc repo), point it at DDEV site:

### mcp-poc `.env.local`

```env
WOOCOMMERCE_STORE_URL=https://summerfield.ddev.site
WOOCOMMERCE_CONSUMER_KEY=ck_xxxx                         # from step 9
WOOCOMMERCE_CONSUMER_SECRET=cs_xxxx                      # from step 9
WOOCOMMERCE_WP_USER=admin
WOOCOMMERCE_WP_APP_PASS=xxxx xxxx xxxx xxxx xxxx xxxx    # from step 9
KMN_BRIDGE_URL=https://summerfield.ddev.site/wp-json/mcp/kmn-revenue
```

### HTTPS / TLS from Node to DDEV

DDEV's mkcert cert is browser-trusted but not Node-trusted by default.

**Option 1 (recommended):**
```bash
# In WSL:
CAROOT=$(mkcert -CAROOT)
export NODE_EXTRA_CA_CERTS="$CAROOT/rootCA.pem"
# Add to .bashrc/.zshrc for persistence
```

**Option 2 (quick fallback, dev only):**
```env
NODE_TLS_REJECT_UNAUTHORIZED=0
```
**WARNING:** disables ALL TLS verification. Never in production.

### Network reachability

DDEV modifies both WSL `/etc/hosts` and Windows `hosts`. mcp-poc in WSL reaches DDEV via `.ddev.site` hostname without additional config.

---

## 11. Portal → Local MCP Server

End-to-end testing requires bridging multiple layers. Use simplest approach that covers current work:

### Recommended: decouple UI from backend during development

| Layer | Dev approach |
|-------|-------------|
| Widget UI dev | `npm run dev` in mcp-poc widget dir with mocked tool results — covers ~90% |
| MCP tool logic | mcp-poc local against DDEV WP — test via curl or direct MCP client |
| Portal integration | Portal local `npm run dev` + staging Supabase + override MCP URL |

### Connecting Portal local to local MCP

Portal `.env.local`:
```env
VITE_SUPABASE_URL=https://ahlthosftngdcryltapu.supabase.co    # staging backend
VITE_SUPABASE_ANON_KEY=<staging anon key>
```

For fully local MCP: Edge Functions run inside Supabase, not Vite. True local E2E:
```bash
supabase start          # local Supabase + EF runtime
supabase functions serve mcp-proxy --env-file .env.local
```
Override `MCP_SERVER_URL` in local EF env → `http://localhost:3000`.

**Ship-level plan:** Use `mcp-poc-three.vercel.app` as staging integration target. Local DDEV bridge connects only to local mcp-poc for WP-layer development. Portal staging stays pointed at deployed mcp-poc.

---

## 12. DDEV Cheat Sheet

```bash
# Lifecycle
ddev start                     # start all containers
ddev stop                      # stop (DB preserved)
ddev restart                   # stop + start
ddev describe                  # URLs, status, ports
ddev poweroff                  # stop ALL ddev projects

# Shell access
ddev ssh                       # bash inside web container
ddev exec <cmd>                # single command

# WordPress
ddev wp <cmd>                  # any WP-CLI command
ddev wp plugin list
ddev wp db query "SELECT ..."
ddev wp search-replace <old> <new> --all-tables

# Database
ddev import-db --src=dump.sql.gz     # import (replaces current)
ddev export-db --file=backup.sql.gz  # export
ddev snapshot create                  # faster than export
ddev snapshot restore <name>

# Composer (ALWAYS use ddev composer)
ddev composer install
ddev composer require <pkg>

# Logs
ddev logs                      # web + PHP
ddev logs -s db                # MariaDB
ddev logs -f                   # follow

# Cleanup
ddev delete --omit-snapshot    # keeps DB snapshot
```

---

## 13. Troubleshooting

### WSL filesystem performance: `/mnt/g/` slow

Accessing Windows NTFS via WSL 9P bridge is 2-4× slower than WSL-native `ext4` for PHP-heavy workloads.

**Option A (current plan — simpler):** Keep `wp-local/` at `/mnt/g/.../wp-local/`. Plugin code is small; DDEV container caches well. Expect ~2-4× slower admin loads vs option B.

**Option B (perf-correct):** Move `wp-local/` to WSL-native filesystem:
```bash
mkdir -p ~/summerfield-wp
# Re-run ddev config from ~/summerfield-wp instead
```
Keep plugin source at `/mnt/g/.../wordpress-plugins/` (git-tracked). Update symlink target paths in step 7 accordingly.

**Decision:** Start A. If `ddev start` or `composer install` > 60s, switch to B.

### DDEV Traefik port 80/443 conflicts

DDEV Traefik binds 80/443. Conflicts with IIS, Apache, etc.

Diagnose (PowerShell):
```powershell
netstat -ano | findstr ":80 "
netstat -ano | findstr ":443 "
```

Fix: stop conflicting service. IIS: `net stop w3svc` elevated. Others: `taskkill /PID <pid> /F`.

### Symlinks not followed by container

Symptom: `ddev wp plugin list` doesn't show `kmn-revenue-abilities`.

Fix: enable WSL metadata mount. Add to `/etc/wsl.conf` inside WSL:
```ini
[automount]
options = "metadata"
```

Restart WSL: `wsl --shutdown` in PowerShell, reopen Ubuntu. Verify: `ls -la /mnt/g/` shows proper permissions (not `777` everywhere).

### Composer: always `ddev composer`

Host composer uses host PHP version (may differ from container 8.2). Always prefix `ddev`:
```bash
ddev composer install
ddev composer require some/package
```

### MariaDB vs MySQL: HPOS compat

We use MariaDB 10.11. Window functions supported. If `FUNCTION not supported` on analytic queries:
```bash
ddev exec mysql db -e "SELECT VERSION();"
# Expected: 10.11.x-MariaDB
```

### TLS from mcp-poc: cert not trusted

Symptom: `UNABLE_TO_VERIFY_LEAF_SIGNATURE` in Node logs.
Fix: export mkcert CA (§10 Option 1). Verify `NODE_EXTRA_CA_CERTS` set before `npm run dev`.

### `ddev start` hangs

Usually Docker Desktop issue:
1. Docker Desktop running (system tray).
2. WSL integration enabled (Settings → Resources → WSL Integration).
3. `docker ps` in WSL works.
4. `ddev poweroff && ddev start`.

---

## 14. Resetting to Clean State

Wipes local WP, preserves plugin code in `wordpress-plugins/`:

```bash
# 1. Reset DB only (faster — keeps WP files)
ddev wp db reset --yes

# 2. Re-run install
ddev wp core install \
  --url=https://summerfield.ddev.site \
  --title="Summerfield Dev" \
  --admin_user=admin \
  --admin_password=admin \
  --admin_email=dev@summerfield.local \
  --skip-email

# 3. Re-activate plugins
ddev wp plugin activate woocommerce
ddev wp plugin activate kmn-revenue-abilities
ddev wp plugin activate maxi-ai

# 4. Re-seed
ddev wp kmn seed --weeks=12 --daily-avg=15 --repeat-rate=0.27 --multi-item-rate=0.20
```

Full nuclear reset:
```bash
ddev delete --omit-snapshot
ddev start
# Repeat steps 4-9 from §6
```

Restore snapshot instead:
```bash
ddev snapshot restore <snapshot-name>
```

---

## 15. What This Setup Does NOT Cover

- **CI pipeline for plugin** — GitHub Actions workflow is future task
- **Deployment to live Summerfield / MBM** — separate doc
- **Portal frontend local dev** — in CLAUDE.md
- **Performance profiling** — after features land; Query Monitor + DDEV profiling
- **WordPress Multisite** — plugin is single-tenant
- **macOS or native Windows DDEV** — WSL2 only

---

## 16. Open Questions / Decisions Needed

1. **Summerfield DB dump availability.** SSH access to live server? Existing DB dump? Determines Option A vs B vs C.

2. **wp-local location.** Option A (PORTAL dir, simpler) vs Option B (WSL home, faster). Decide after first `ddev start` timing.

3. **Dedicated DDEV project per site.** Current plan: `summerfield` is own project. MBM gets own project (`mbm`) when added. No shared-instance.

4. **Daily DDEV snapshots.** `ddev snapshot create` is cheap. Alias: `alias snp='ddev snapshot create dev-$(date +%Y%m%d)'`. Recommended after successful seed.

5. **MCP Adapter install method.** Composer via mu-plugins vs wp.org plugin directory. Confirm which method works for `wordpress/mcp-adapter` v0.5.0 before step 6.

---

## 17. Actual Deployed State (2026-04-23)

Summerfield DDEV environment is **already live** on Yuri's machine. Superseding details of earlier sections where they conflict:

- **Path:** `/home/upan/projects/sf_staging/` (WSL Ubuntu native ext4, Option B from §13)
- **URL:** `https://summerfield.ddev.site`
- **Stack:** Apache-FPM + PHP 8.4 + MySQL 8.0 (matches Summerfield prod exactly)
- **DB:** Full production clone imported (324 MB), URL search-replace done (14 401 replacements live→ddev)
- **Uploads:** NOT copied. `.htaccess` 302-redirects to production for images/media. Only `wp-content/uploads/blocksy/local-google-fonts/` (1 MB) copied locally for CORS (fonts served same-origin).
- **Theme:** `wp-content/themes/summerfield/` on branch `feature/logo-marquee-to-prod` (Summerfield's own repo, not PORTAL)
- **Smoke-test passing:** homepage renders identical to prod (logo, menu, hero, products, footer — 0 console errors).

**What Phase 15 needs to add on top of this state:**
- `kmn-revenue-abilities` plugin symlinked + activated
- `maxi-ai` plugin symlinked + activated
- MCP Adapter installed (composer or wp.org)
- WooCommerce REST API keys generated
- WordPress Application Password generated for MCP user
- Synthetic order seeder run to populate 1260 orders (existing DB has only a few test orders; Summerfield business is not live e-commerce)

**Scope clarification for seeder:** Summerfield live shop has ~no real order history. All revenue-analytics data will come from the seeder. Reset (`wp kmn seed reset`) is safe because there are no production-like orders to preserve.

---

*Last updated: 2026-04-23 — Canonical stack updated to match actual deployment (Apache-FPM + PHP 8.4 + MySQL 8.0 at `/home/upan/projects/sf_staging/`). Earlier nginx/MariaDB/PHP 8.2 references in §6 Step 2 are superseded.*
