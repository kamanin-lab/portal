# Synthetic Order Seeder — Furniture Shop Model

> Related: `LOCAL_DEV_SETUP.md` §8, `REVENUE_INTELLIGENCE_V2_PLAN.md` §7.
> Target: `/home/upan/projects/sf_staging/` (DDEV, Apache + PHP 8.4 + MySQL 8.0)
> Data source: Summerfield product catalog (existing) + generated customers + generated orders.

**Status:** Planning | **Last updated:** 2026-04-23

---

## 1. Goal

Generate ~1260 realistic orders (15/day × 12 weeks) + associated customers on Summerfield local DDEV, using the existing product catalog, with statistical properties that make all 4 Revenue Intelligence blocks show meaningful, non-flat patterns. Orders tagged with `_kmn_test_order = 1` meta — allows clean reset without touching any other data.

**Non-goals:**
- Creating products (Summerfield catalog already sufficient)
- Creating payment records in live payment providers (orders write `_payment_method` meta only)
- Email sending for orders (use `wp option set woocommerce_email_manager_disable yes` before seeding)

---

## 2. Business Model Parameters (Furniture Shop — MBM-aligned)

These parameters are tuned to mirror MBM's observed behaviour. When we later deploy to MBM, the analytics on seeded Summerfield ≈ analytics on live MBM. Validates the plan end-to-end.

### 2a. Volume & Time Distribution

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Total orders | 1260 | 15/day × 84 days |
| Window | 12 weeks | Covers all block requirements (run-rate 14d, heatmap 8w, repeat 90d) |
| Daily avg | 15 | Matches MBM observed |
| Daily stddev | ±5 | 10-20 on typical days, 5-25 outliers |
| Weekend dip | -30% Sat/Sun mornings | Furniture weekends trade evening only |
| Holiday spikes | +40% on 2 random days | Simulates sales campaigns |

### 2b. Hour-of-Day Curve (weekday)

Furniture buying has distinct "browse-then-decide" pattern — morning discovery + evening commitment.

```
Hour:  00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23
Wght:   0  0  0  0  0  0  0  1  2  4  7  8  6  5  6  7  6  4  5  9 12  8  4  1
         ░░░░░░░░░░░░░░░░░░░░░░ ▒▒▒▒ ▓▓▓▓ ▒▒ ▒ ▒▒ ▓▓▓▓ ████ ▓▓▓▓ ▒▒ ░░
                              ^-- morning peak ^         ^--- evening peak
```

- Morning browse peak: 10-12 (probably "after coffee, before work")
- Afternoon lull: 13-17
- Evening decision peak: 19-21 (prime — when couples discuss and commit)
- Late night: 22-23 rare
- 00-07 near-zero (nocturnal browsers exist but rare for furniture)

Implementation: weighted random hour selection; weights as above.

### 2c. Day-of-Week Bias

```
Mon  ████░░░░  12%
Tue  █████░░░  14%
Wed  █████░░░  14%
Thu  ████████  20%  ← peak (furniture Thursday tradition — "neue Woche Entscheidung")
Fri  ███████░  18%
Sat  █████░░░  14%  ← afternoon only, morning dips
Sun  ███░░░░░   8%  ← weakest (no shipping dispatch, customers know)
```

### 2d. Basket Composition

Furniture bias: single-item orders dominate.

| Items in order | Share | Example |
|---------------|-------|---------|
| 1 item | 75% | "Boxspringbett Luxe" alone |
| 2 items | 18% | Bed + mattress, or mattress + lattenrost |
| 3 items | 5% | Bed + mattress + lattenrost combo |
| 4-5 items | 2% | Full bedroom set |

### 2e. AOV Distribution

Matches furniture price bands. Revenue skews heavy on 500-1500€ band.

| Order total | Share of orders | Share of revenue |
|-------------|----------------|-----------------|
| < 300 € | 22% | 7% |
| 300–800 € | 35% | 22% |
| 800–1500 € | 28% | 35% |
| 1500–3000 € | 12% | 26% |
| > 3000 € | 3% | 10% |

- Mean AOV: ~950 €
- Median AOV: ~680 €

Computation: select product(s) from catalog at random weighted by price band to hit target distribution.

### 2f. Payment Methods

| Method | Share |
|--------|-------|
| Klarna (financing) | 40% |
| PayPal | 30% |
| Stripe / credit card | 23% |
| Bank transfer (bacs) | 7% |

Maps to `_payment_method` and `_payment_method_title` meta.

### 2g. Order Status Distribution

| Status | Share |
|--------|-------|
| `wc-completed` | 72% |
| `wc-processing` | 15% |
| `wc-on-hold` | 5% |
| `wc-pending` | 3% |
| `wc-failed` | 3% |
| `wc-cancelled` | 2% |

Analytics blocks filter to `wc-completed` + `wc-processing` — giving us ~87% × 1260 = ~1096 "paid" orders, matching MBM's ~1100-1300 in 90 days.

### 2h. Customer Cohort Dynamics

**Target repeat rate in 90 days:** 22% (furniture benchmark — lower than Shopify B2C 27%).

| Customer behaviour | Share of unique customers | Orders |
|-------------------|--------------------------|--------|
| One-time buyers | 78% | 1 each |
| Return 2x in 90d | 18% | 2 each — median gap 55 days |
| Return 3x in 90d | 3% | 3 each |
| Return 4+ in 90d | 1% | 4-5 each (furniture "VIP", e.g. hotel/pensjon owners) |

Total unique customers: ~900-950 for 1260 orders. Plausible for MBM scale.

**Median days to 2nd order:** 55 days (furniture — room to "settle in" and realize accessory need).

### 2i. Market Basket Probe Target

Multi-item orders (from 2e): 18% + 5% + 2% = **25% of 1260 = ~315 multi-item orders.**

- Triggers `market_basket_product` mode (threshold ≥100)
- Enough to compute top-5 pairs with confidence
- Some specific combos pre-seeded to ensure visible lift:
  - "Boxspringbett" often → "Lattenrost" (bed base → slat)
  - "Matratze" often → "Matratzenschoner" (mattress → protector)
  - "Schlafsofa" often → "Kissenset" (sofa bed → pillow set)

---

## 3. Technical Implementation

### 3a. Delivery — WP-CLI command

Script lives at `PORTAL/scripts/seed-orders.php`. Registers WP-CLI command `wp kmn seed`:

```bash
# Basic invocation — uses defaults above
ddev wp kmn seed

# Explicit params
ddev wp kmn seed \
  --weeks=12 \
  --daily-avg=15 \
  --daily-stddev=5 \
  --repeat-rate=0.22 \
  --multi-item-rate=0.25 \
  --seed=42

# Reset (deletes only orders with _kmn_test_order=1 meta)
ddev wp kmn seed reset

# Dry-run — prints planned distributions without writing
ddev wp kmn seed --dry-run
```

`--seed=42` makes runs deterministic for regression tests.

### 3b. HPOS-Aware Writes

MySQL 8.0 + WC 8.x+ with HPOS enabled. Seeder writes through WC APIs, NOT direct SQL, to ensure all HPOS tables get populated consistently:

```
// pseudocode
$order = wc_create_order([
  'customer_id' => $customer_id,
  'status' => $status,
  'created_via' => 'kmn_seed',
]);
foreach ($items as $item) {
  $order->add_product(wc_get_product($product_id), $qty);
}
$order->set_payment_method($method);
$order->set_date_created($synthetic_datetime);   // KEY: backdated to hit historical distribution
$order->calculate_totals();
$order->save();

// Mark as seeded for cleanup
update_post_meta($order->get_id(), '_kmn_test_order', 1);
// HPOS-equivalent:
$order->update_meta_data('_kmn_test_order', 1);
$order->save();
```

`wc_create_order()` populates:
- `wp_posts` / `wp_wc_orders` (HPOS)
- `wp_wc_order_stats` (via WC cron or immediate sync)
- `wp_wc_order_product_lookup`
- `wp_wc_customer_lookup`

**Post-seed step:** run `wp wc tool run regenerate_order_stats` or equivalent to force-populate `wp_wc_order_stats` if async cron didn't fire. Otherwise heatmap queries return empty.

### 3c. Customer Generation

Generate ~900 unique customer emails. Approach:

- 80% guest checkout (no WP user — `billing_email` only, no `customer_id`)
- 20% registered customers (`wp_users` row + `wp_wc_customer_lookup`)

Guest emails: `seed-guest-{n}@kmn-test.local` format. Registered: `seed-user-{n}@kmn-test.local`.

For repeat cohort: pick 22% of customer pool, assign them 2-5 orders each across the 90-day window, gap-distributed around median 55 days.

### 3d. Date Backdating

WooCommerce `set_date_created()` accepts `DateTime`. Generate dates:

1. For each day `d` in 84-day window: target order count = `poisson(daily_avg)` (mean 15, natural variance).
2. For each order: pick hour via weighted random from §2b curve, pick minute via uniform.
3. Apply day-of-week bias from §2c (reject + resample if weight too low).

### 3e. Expected Runtime

- ~1260 orders × ~200ms per `wc_create_order` in DDEV = ~4 minutes
- Disable sending emails: `ddev wp option update woocommerce_email_new_order_enabled no` before seeding
- Disable WooCommerce webhook triggers: add `define('WP_IMPORTING', true)` at script start
- Reduce cron load: seeder runs with `wp --skip-plugins` where possible (but WC itself must be active)

### 3f. Reset Strategy

```
ddev wp kmn seed reset
```

Implementation:
```
$orders = wc_get_orders([
  'meta_key' => '_kmn_test_order',
  'meta_value' => 1,
  'limit' => -1,
  'return' => 'ids',
]);
foreach ($orders as $order_id) {
  wp_delete_post($order_id, true);   // force delete, skip trash
}
// Clean up seeded customers
$users = get_users([
  'meta_key' => '_kmn_test_user',
  'meta_value' => 1,
]);
foreach ($users as $user) {
  wp_delete_user($user->ID);
}
```

Takes ~30 seconds. Safe to re-run seeder after.

---

## 4. Validation Queries

After seeder completes, run these to verify distributions match targets. Checkpoints for self-testing.

### 4a. Total volume

```sql
SELECT COUNT(*) FROM wp_wc_order_stats
WHERE status IN ('wc-completed','wc-processing');
-- Expected: ~1100 ±50
```

### 4b. Day-of-week distribution

```sql
SELECT DAYNAME(date_created) AS dow, COUNT(*) AS orders
FROM wp_wc_order_stats
WHERE status IN ('wc-completed','wc-processing')
GROUP BY dow
ORDER BY FIELD(dow, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday');
-- Expected: Thu highest, Sun lowest, matching §2c
```

### 4c. Multi-item orders

```sql
SELECT COUNT(*) AS multi_item_orders
FROM wp_wc_order_stats s
WHERE s.date_created >= NOW() - INTERVAL 90 DAY
  AND s.status IN ('wc-completed','wc-processing')
  AND (SELECT COUNT(*) FROM wp_wc_order_product_lookup p WHERE p.order_id = s.order_id) > 1;
-- Expected: 200-350 (triggers market_basket_product mode)
```

### 4d. Repeat rate

```sql
SELECT
  COUNT(DISTINCT billing_email) AS unique_customers,
  SUM(CASE WHEN c >= 2 THEN 1 ELSE 0 END) AS returning,
  ROUND(SUM(CASE WHEN c >= 2 THEN 1 ELSE 0 END) * 100.0 / COUNT(DISTINCT billing_email), 1) AS repeat_rate_pct
FROM (
  SELECT billing_email, COUNT(*) AS c
  FROM wp_wc_order_stats
  WHERE date_created >= NOW() - INTERVAL 90 DAY
    AND status IN ('wc-completed','wc-processing')
  GROUP BY billing_email
) t;
-- Expected: repeat_rate_pct ≈ 22
```

### 4e. Hour peak

```sql
SELECT HOUR(date_created) AS h, COUNT(*) AS c
FROM wp_wc_order_stats
WHERE status IN ('wc-completed','wc-processing')
GROUP BY h
ORDER BY c DESC
LIMIT 3;
-- Expected: top 3 hours should be in {20, 10, 19, 11, 21}
```

---

## 5. Integration With MySQL 8.0 / CONVERT_TZ Gotcha

MySQL 8.0 ships with empty timezone tables by default. `CONVERT_TZ('2026-04-23 10:00:00', '+00:00', 'Europe/Vienna')` returns NULL.

**Two solutions:**

**A. Populate MySQL timezone tables in DDEV** (one-time):
```bash
ddev exec bash -c "mysql_tzinfo_to_sql /usr/share/zoneinfo | mysql -u db -pdb mysql"
ddev restart
```

**B. Use numeric UTC offsets only** (preferred — portable):
- In PHP, resolve `Europe/Vienna` to `+02:00` or `+01:00` via `DateTimeZone::getOffset()`
- Pass numeric offset to SQL: `CONVERT_TZ(date_created, '+00:00', '+02:00')`
- Seeder generates `date_created` in UTC (store tz respected by WC at display time)

**Decision:** Option B — ability pseudocode in `WP_BRIDGE_ARCHITECTURE.md` already uses numeric offsets. Seeder stores UTC timestamps. DDEV MySQL needs no special config.

---

## 6. Summerfield-Specific Adjustments

Summerfield is a MBM-proxy for local dev — furniture shop, German-language, Europe/Vienna timezone (confirm in WP admin). If any differs:

- **Timezone** — Summerfield `wp_options.timezone_string` should match `Europe/Vienna`. If differs (Europe/Berlin or other), adjust seeder UTC→local conversion.
- **Currency** — `woocommerce_currency` option. If not EUR, AOV bands in §2e need recalibration.
- **Language** — `siteurl` language affects product title locale. Seeder references products by WC ID not name, so safe.

Check before first run:
```bash
ddev wp option get timezone_string
ddev wp option get woocommerce_currency
ddev wp option get WPLANG    # or site_language
```

---

## 7. Open Questions

1. **Existing Summerfield products** — do they have realistic furniture prices? If catalog is test/placeholder with €10 items, AOV targets from §2e won't hit without overriding prices. **Action before seeding:** run `SELECT AVG(meta_value) FROM wp_postmeta WHERE meta_key='_price' AND meta_value REGEXP '^[0-9]+\\.?[0-9]*$';` and compare to expected 300-3000 range.

2. **Product categories** — market basket at category level needs 3-8 categories with clear semantic distinction ("Betten", "Matratzen", "Zubehör"). Check:
   ```bash
   ddev wp term list product_cat --format=count
   ```

3. **Seeder environment guard** — should `wp kmn seed` refuse to run if `WP_ENV !== 'local'` or `siteurl` not `*.ddev.site`? Recommend: yes, refuse with clear error. Prevents accidental prod run.

4. **Cleanup coverage** — what happens to `wp_wc_customer_lookup` entries for seeded guest checkouts? Guest entries keyed by email — reset must delete those too, else repeat-rate metrics on subsequent re-seeds will accumulate ghost customers.

---

## 8. Deliverables

One PHP file: `PORTAL/scripts/seed-orders.php`. Self-contained WP-CLI command. No composer deps beyond WC itself. ~500 LOC estimated.

Sibling file: `PORTAL/scripts/seed-orders.md` — human-readable docs for the command (flags, examples, troubleshooting).

---

*Last updated: 2026-04-23*
