# KMN Synthetic Order Seeder

> WP-CLI command for generating realistic Summerfield order data on DDEV.
> Spec: `docs/ideas/SEEDER_SPEC.md` — distributions, rationale, validation queries.

**DDEV-only.** Refuses to run outside `*.ddev.site`. Hard-coded environment guard
(`get_option('siteurl')` regex) is the first call in both `seed` and `reset`.

---

## Prerequisites

1. DDEV environment at `/home/upan/projects/sf_staging/` (see `docs/ideas/LOCAL_DEV_SETUP.md`).
2. Plugins active: `woocommerce`, `kmn-revenue-abilities`, `maxi-ai`.
3. HPOS enabled (`ddev wp wc hpos status --user=dev-admin` → "HPOS aktiviert?: yes").
4. Product catalog imported with realistic prices (verified: 457 published products,
   avg €1,392, range €62–€18,899 — Summerfield garden-furniture catalog).
5. `mu-plugins` loader installed — one-time setup:
   ```bash
   cat > /home/upan/projects/sf_staging/wp-content/mu-plugins/kmn-seeder-loader.php <<'PHP'
   <?php
   /**
    * Loads the KMN Synthetic Order Seeder (DDEV-only).
    */
   if ( defined( 'WP_CLI' ) && WP_CLI ) {
       $path = '/mnt/g/01_OPUS/Projects/PORTAL/scripts/seed-orders.php';
       if ( file_exists( $path ) ) {
           require_once $path;
       }
   }
   PHP
   ```

## Invocation

```bash
cd /home/upan/projects/sf_staging

# Default — ~1260 orders over 12 weeks with garden-furniture distributions
ddev wp kmn seed

# Explicit, deterministic
ddev wp kmn seed \
  --weeks=12 \
  --daily-avg=15 \
  --daily-stddev=5 \
  --repeat-rate=0.22 \
  --multi-item-rate=0.25 \
  --seed=42

# Dry run — print plan, no writes
ddev wp kmn seed --dry-run

# Idempotent reset (deletes only `_kmn_test_order=1` orders + `_kmn_test_user=1` users)
ddev wp kmn seed reset
```

## Flags

| Flag | Default | Range | Description |
|------|---------|-------|-------------|
| `--weeks` | 12 | 4-26 | History window length |
| `--daily-avg` | 15 | ≥1 | Mean orders per day |
| `--daily-stddev` | 5 | ≥0 | Gaussian-ish variance magnitude |
| `--repeat-rate` | 0.22 | 0-1 | Fraction of customers who order ≥2 times in window |
| `--multi-item-rate` | 0.25 | 0-1 | Fraction of orders with ≥2 items |
| `--seed` | (random) | any int | RNG seed — same `--seed` produces same daily count plan & customer cohort |
| `--dry-run` | off | — | Print plan, exit without writing |

## Expected Runtime

| Phase | Typical wall-clock |
|-------|--------------------|
| Plan + customer build | ~2 s |
| Order creation (1247 orders) | ~8-15 min on DDEV (~0.5 s/order via `wc_create_order`) |
| HPOS stats sync | ~10-30 s (skipped if stats already in sync) |
| **Total seed** | **~10-15 min** |
| Reset (1247 orders) | ~2-3 min |

> **Note on the 5-minute target:** The original SEED-09 budget targeted ≤5 min.
> Actual runtime on a 16 GB Windows host with DDEV (Docker Desktop, WSL2 mount)
> is 8-15 minutes due to per-order `wc_create_order()` overhead — this is a
> known WC characteristic for HPOS writes, not a bug in the seeder. Native
> Linux DDEV would be ~3× faster.

## Data Tagging

| Meta key | Where | Set by | Used by |
|----------|-------|--------|---------|
| `_kmn_test_order = 1` | `wp_wc_orders_meta` | `KMN_Seeder_Command::create_order()` | `reset` lookup via `wc_get_orders` |
| `_kmn_test_user = 1` | `wp_usermeta` | `resolve_or_create_user()` for registered cohort | `reset` lookup via `get_users` |

Reset deletes ONLY rows matching these flags — never touches imported/manual data.

## Distributions Implemented

Adapted to Summerfield's premium garden-outdoor segment (NOT bedroom).

### AOV bands (premium garden — higher than SEEDER_SPEC §2e bedroom defaults)

| Band | Order share |
|------|-------------|
| < €500 | 20% (accessories: covers, fasteners) |
| €500–1500 | 30% (single chair, cushion sets, small parasols) |
| €1500–3000 | 25% (dining sets, lounge pieces) |
| €3000–6000 | 17% (full terrace sets) |
| > €6000 | 8% (premium Ampelschirm, full lounge configs) |

Target mean AOV ≈ €2,500–3,000 · target median AOV ≈ €1,800.

### Pre-seeded basket pairs (garden domain)

For every multi-item order, a 60% chance of being a known co-purchase pair:

- Ampelschirm + Sockel (parasol + base — natural co-purchase)
- Ampelschirm + Schutzhülle (parasol + cover)
- Gartenmöbel + Kissen (furniture + cushions)
- Lounge + Kissen
- Daybed + Kissen
- Dining + Lounge (full terrace)

Pairs are matched by case-insensitive substring against published product titles.

### Hour, day-of-week, status, payment, cohort

Match SEEDER_SPEC §2b (hour curve), §2c (DOW shares), §2g (status), §2f (payment),
§2h (cohort) verbatim. Saturdays and Sundays apply a 30% morning dip (hours 7–11).

## Validation Queries

Run these after seeding to confirm distributions match SEEDER_SPEC §4 acceptance ranges.
Use the actual table prefix — Summerfield is hardened to `s7uy9uh34_` (use
`$(ddev wp db prefix)` to resolve dynamically on other instances).

```bash
PFX=$(ddev wp db prefix | tr -d '\n')

# §4a — Total paid orders (target 1050-1150)
ddev wp db query "SELECT COUNT(*) FROM ${PFX}wc_order_stats WHERE status IN ('wc-completed','wc-processing');"

# §4b — Day-of-week distribution (target Thursday highest, Sunday lowest)
ddev wp db query "SELECT DAYNAME(date_created) AS dow, COUNT(*) AS orders FROM ${PFX}wc_order_stats WHERE status IN ('wc-completed','wc-processing') GROUP BY dow ORDER BY orders DESC;"

# §4c — Multi-item orders (target 200-350)
ddev wp db query "SELECT COUNT(*) FROM ${PFX}wc_order_stats s WHERE s.date_created >= NOW() - INTERVAL 90 DAY AND s.status IN ('wc-completed','wc-processing') AND (SELECT COUNT(*) FROM ${PFX}wc_order_product_lookup p WHERE p.order_id = s.order_id) > 1;"

# §4d — Repeat rate via email (target 19-25%)
# Note: WC `returning_customer` flag underreports for guest orders since each
# guest checkout creates a fresh customer_id. Email-based join is authoritative.
ddev wp db query "SELECT COUNT(*) AS unique_customers, SUM(CASE WHEN c >= 2 THEN 1 ELSE 0 END) AS returning, ROUND(SUM(CASE WHEN c >= 2 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) AS repeat_rate_pct FROM (SELECT cl.email, COUNT(*) AS c FROM ${PFX}wc_order_stats s JOIN ${PFX}wc_customer_lookup cl ON cl.customer_id=s.customer_id WHERE s.date_created >= NOW() - INTERVAL 90 DAY AND s.status IN ('wc-completed','wc-processing') GROUP BY cl.email) t;"

# §4e — Hour peak (target top-3 includes ≥2 of {10,11,19,20,21})
ddev wp db query "SELECT HOUR(date_created) AS h, COUNT(*) FROM ${PFX}wc_order_stats WHERE status IN ('wc-completed','wc-processing') GROUP BY h ORDER BY 2 DESC LIMIT 5;"
```

## Reset Semantics

Reset is **idempotent** and surgical:

1. Looks up all orders with `_kmn_test_order = 1` meta via `wc_get_orders()` (HPOS-safe).
2. Force-deletes each one via `$order->delete( true )` (bypass trash, strips
   `wp_wc_orders`, `wp_wc_orders_meta`, `wp_wc_order_addresses`,
   `wp_wc_order_operational_data`, `wp_wc_order_product_lookup`).
3. Looks up users with `_kmn_test_user = 1` meta and deletes via `wp_delete_user()`.
4. Cleans up orphaned `wp_wc_customer_lookup` rows for `*@kmn-test.local` emails.
5. Triggers `OrdersScheduler::queue_batches()` to refresh `wp_wc_order_stats`.

Re-running reset is safe — second invocation simply finds 0 matching rows
and returns "Reset complete: 0 orders + 0 users deleted."

## Troubleshooting

**"Refusing to run: siteurl is …"** — the environment guard triggered.
Confirm `ddev wp eval 'echo get_option("siteurl");'` returns a `*.ddev.site` URL.
On Summerfield, `WP_SITEURL` is hardcoded in `wp-config-ddev.php` so this should
always pass on DDEV.

**"Product catalog too small (N products)"** — import Summerfield products before
seeding (see LOCAL_DEV_SETUP.md). Current catalog: 457 published products
with `_price` set (CAST > 0).

**Stats table out of sync** — if validation query 4a returns fewer orders than
`SELECT COUNT(*) FROM wp_wc_orders;`, drain the WC Analytics queue manually:
```bash
ddev wp eval 'Automattic\WooCommerce\Internal\Admin\Schedulers\OrdersScheduler::queue_batches(1, PHP_INT_MAX, 1000);'
ddev wp action-scheduler run --batch-size=500 --batches=10
```

**Action scheduler queue exploding** — the seeder enqueues WC stats batches
post-seed. If you see `pending` count >5000 in `s7uy9uh34_actionscheduler_actions`,
it's safe to truncate: `DELETE FROM s7uy9uh34_actionscheduler_actions WHERE status='pending';`

**Seed runtime far above 15 min** — disable WP cron entirely during the seed:
```bash
ddev wp config set DISABLE_WP_CRON true --raw
ddev wp kmn seed --seed=42
ddev wp config delete DISABLE_WP_CRON
```

**Multi-item count too low** — increase `--multi-item-rate` (try 0.30). The
basket pair resolution requires product titles containing substrings like
"Ampelschirm", "Sockel", "Kissen". If the catalog drifts, update
`KMN_Seeder_Command::BASKET_PAIRS`.

**Repeat rate way below target** — the planner is capacity-aware and will not
silently drop repeat orders, but if `--weeks` is too small (e.g. <4) there
isn't enough day-spread for the 55-day median gap. Use `--weeks=12` or higher.

## Scope

In scope:
- Order generation with statistical properties matching SEEDER_SPEC §2 + Summerfield AOV adaptation
- Customer pool with 22% repeat cohort (median 55-day gap to 2nd order)
- Pre-seeded garden basket pairs for market-basket signal
- Idempotent reset via meta flag

Out of scope:
- Product creation (catalog is pre-existing)
- Inventory/stock tracking
- Payment provider integration (orders store `_payment_method` meta only)
- Email delivery (disabled during seed via `woocommerce_email_new_order_enabled = no`)
- Production use (DDEV-only guard is intentional and hard)

---

*See `docs/ideas/SEEDER_SPEC.md` for the full distribution model and rationale.*
