# Phase 15: Local Dev + Synthetic Seeder — Pattern Map

**Mapped:** 2026-04-23
**Files analyzed:** 10 new files (1 WP plugin main + composer.json + bootstrap + 5 abilities + shared helpers + seed-orders.php + DDEV config)
**Analogs found:** 7 / 10 internal (plus 1 full-repo external analog: `maxi-ai/`); 3 first-time (DDEV, composer.json, wp-cli command) have no internal prior art

---

## File Classification

| New file | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `wordpress-plugins/kmn-revenue-abilities/kmn-revenue-abilities.php` | WP plugin bootstrap | event-driven (WP hooks) | `maxi-ai/maxi-ai.php` | exact (external analog, same repo) |
| `wordpress-plugins/kmn-revenue-abilities/composer.json` | dependency manifest | build-time | — (first in repo) | no analog |
| `wordpress-plugins/kmn-revenue-abilities/bootstrap/register-mcp-server.php` | plugin bootstrap | event-driven (WP hooks) | `maxi-ai/bootstrap/register-abilities-with-mcp.php` | role-match (different adapter API shape) |
| `wordpress-plugins/kmn-revenue-abilities/abilities/revenue-run-rate.php` | ability handler | request-response (MCP tool call → SQL) | `maxi-ai/abilities/woocommerce/list-orders.php`, `maxi-ai/abilities/analytics/get-analytics.php` | exact |
| `wordpress-plugins/kmn-revenue-abilities/abilities/weekly-heatmap.php` | ability handler | request-response | `maxi-ai/abilities/analytics/get-analytics.php` | exact |
| `wordpress-plugins/kmn-revenue-abilities/abilities/repeat-metrics.php` | ability handler | request-response | `maxi-ai/abilities/woocommerce/list-orders.php` | exact |
| `wordpress-plugins/kmn-revenue-abilities/abilities/market-basket.php` | ability handler | request-response | `maxi-ai/abilities/analytics/get-analytics.php` | exact |
| `wordpress-plugins/kmn-revenue-abilities/abilities/weekly-briefing-data.php` | ability handler (fan-out) | request-response | `maxi-ai/abilities/woocommerce/list-orders.php` | exact |
| `wordpress-plugins/kmn-revenue-abilities/includes/sql-helpers.php` | utility (SQL/date/offset) | transform | `maxi-ai/includes/helpers.php` | role-match |
| `wordpress-plugins/kmn-revenue-abilities/includes/cache.php` | utility (transients/TTL) | transform | — (no transient wrappers in maxi-ai) | no analog |
| `wordpress-plugins/kmn-revenue-abilities/readme.md` | docs | — | `maxi-ai/PLAYBOOK-DOC.md` (style reference) | weak |
| `scripts/seed-orders.php` | WP-CLI command | batch writes (wc_create_order loop) | — (first PHP script in scripts/) | no internal analog |
| `.ddev/config.yaml` | infra config | build-time | — (first DDEV use in repo) | no analog |

---

## Existing Patterns

### scripts/ directory — current house style

Contents (`G:/01_OPUS/Projects/PORTAL/scripts/`):

| File | Language | Purpose |
|------|----------|---------|
| `onboard-client.ts` (498 lines) | TypeScript, `npx tsx` | Client onboarding |
| `manage-users.ts` (357 lines) | TypeScript, `npx tsx` | User ops |
| `sync-staging-secrets.ts` (380 lines) | TypeScript, `npx tsx` | Secrets sync |
| `sync-staging-schema.ts` (338 lines) | TypeScript, `npx tsx` | Schema sync |
| `clickup-field-backup.ts` (169 lines) | TypeScript, `npx tsx` | ClickUp backup |
| `clickup-field-backup-db.ts` (167 lines) | TypeScript, `npx tsx` | DB backup |
| `clickup-field-restore.ts` (250 lines) | TypeScript, `npx tsx` | ClickUp restore |
| `openrouter-review.cjs` (244 lines) | Node CJS | Post-code review via OpenRouter |
| `new-client-template.json`, `new-client-template.md`, `*-production.json` | Data/templates | Config |

**House style observations** (`scripts/onboard-client.ts:1-45`, `scripts/clickup-field-backup.ts:1-15`):
- Shebang-free; invoked via `npx tsx scripts/<name>.ts`
- Top-of-file JSDoc header with Purpose + Usage examples
- German-language comments mixed with English (onboard-client is majority German)
- `.env.local` parsed manually via `readFileSync` + line split (not dotenv import) — `clickup-field-backup.ts:13-23`
- Graceful `process.exit(1)` on missing env
- Absolute paths via `resolve(process.cwd(), ...)` not `__dirname` in new code
- `.gitignore` whitelist pattern (lines 44-52): `scripts/*` is ignored, only `*.ts`, `*.cjs`, and explicit templates are tracked

**Key consequence for Phase 15:** `.gitignore` currently excludes `scripts/*.php` because of the whitelist. Adding `seed-orders.php` requires a whitelist addition (`!scripts/*.php` or `!scripts/seed-orders.php`).

### WP plugin patterns — Maxi AI (only existing analog)

`maxi-ai/` is Michael Zadravec's plugin, vendored into PORTAL. **It is NOT PORTAL-authored code**, but it is trusted, coexists with the new plugin in production DDEV (DEV-04, ABIL-QA-05), and is the only intra-repo reference for the conventions we should mirror.

**File layout** (`G:/01_OPUS/Projects/PORTAL/maxi-ai/`):
```
maxi-ai.php                           ← main file, singleton class
uninstall.php                         ← WP_UNINSTALL_PLUGIN guard + drop tables
.htaccess                             ← blocks .md/.example/.txt from web access
abilities/<category>/<verb-noun>.php  ← 106 ability files, one per file
bootstrap/register-abilities-with-mcp.php   ← bridges Abilities API → MCP
includes/helpers.php                  ← maxi_ai_response(), maxi_ai_is_http_context()
includes/class-*.php                  ← WP-style PascalCase classes with dashed filenames
assets/                               ← static (ignored by .htaccess above)
PLAYBOOK-DOC.md, PLAYBOOK-INIT.md     ← docs (not blocked from shipping)
```

**Plugin header** (`maxi-ai/maxi-ai.php:2-10`) — classic WP block header, no composer autoload:
```php
<?php
/*
Plugin Name: Maxi AI Core
Description: ...
Version: 3.3.0
Author: Mihael Zadravec, Maxi Web Studio
Author URI: https://maxiweb.si
License: GPL-2.0+
License URI:  https://www.gnu.org/licenses/gpl-2.0.html
*/
```

**Defensive guard** repeated at the top of every PHP file (`maxi-ai.php:12-14`, `abilities/*/*.php:3-5`):
```php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
```

**Namespace/class organisation** — Maxi does NOT use PHP namespaces; it uses prefixed class names `Maxi_AI_*` (e.g. `Maxi_AI_Rule_Schema`, `Maxi_AI_Playbook_Store`). Main plugin class is `final class Maxi_AI` (`maxi-ai.php:16`). Filenames are dashed lowercase (`class-ability-schema-patch.php`, `class-audit-log.php`, `class-data-masking.php`).

**Hook registration pattern** (`maxi-ai/maxi-ai.php:77-86`):
```php
private static function load_abilities() {
    if ( defined( 'WP_CLI' ) && WP_CLI ) {
        self::require_ability_files();
        return;
    }
    add_action( 'rest_api_init', [ self::class, 'require_ability_files' ], 0 );
}
```
Abilities are lazy-loaded: eager on WP-CLI, deferred to `rest_api_init` priority 0 for REST/MCP. **This saves ~106 require_once on frontend page views** — we should mirror this pattern for our 5 abilities (smaller but same principle).

**Abilities API registration pattern** (repeated verbatim across all 106 abilities, e.g. `maxi-ai/abilities/woocommerce/list-orders.php:7-148`):
```php
add_action( 'wp_abilities_api_init', function () {
    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }
    wp_register_ability( 'maxi/list-orders', [
        'label'               => 'List Orders',
        'description'         => '...',
        'category'            => 'woocommerce',
        'meta'                => [ 'show_in_rest' => true, 'mcp' => [ 'public' => true ] ],
        'input_schema'        => [ 'type' => 'object', 'properties' => [...], 'required' => [] ],
        'execute_callback'    => function ( $input ) { ... },
        'permission_callback' => function () { return current_user_can( 'manage_woocommerce' ); },
    ] );
} );
```

**Response helper** (`maxi-ai/includes/helpers.php:44-63`):
```php
function maxi_ai_response( $success, $data = [], $error = null ) {
    if ( ! $success && $error ) {
        error_log( sprintf( '[Maxi AI] Error: %s', $error ) );
        $error = maxi_ai_sanitize_error( (string) $error );
    }
    return [
        'success' => (bool) $success,
        'data'    => is_array( $data ) ? $data : [],
        'error'   => $error ? (string) $error : null,
        '_meta'   => [ ... ],
    ];
}
```

**MCP adapter bridge** (`maxi-ai/bootstrap/register-abilities-with-mcp.php` — 30 lines, entire file):
Maxi registers abilities globally via `mcp_adapter_init` + loops `wp_get_abilities()` + fires `mcp_register_ability_tool` per ability. **Our plan is different** (REQUIREMENTS ABIL-SCAF-03): we use `$adapter->create_server(server_id: 'kmn-revenue', rest_namespace: 'mcp', rest_route: 'kmn-revenue', ...)` to get a dedicated endpoint `/wp-json/mcp/kmn-revenue`. Maxi's bridge is a generic registration; ours is a server-creation. Both hook into `mcp_adapter_init`.

**Activation/deactivation/uninstall** (`maxi-ai/maxi-ai.php:565-568`, `maxi-ai/uninstall.php`):
```php
register_activation_hook( __FILE__, [ 'Maxi_AI', 'activate' ] );
register_deactivation_hook( __FILE__, [ 'Maxi_AI', 'deactivate' ] );
add_action( 'plugins_loaded', [ 'Maxi_AI', 'init' ] );
```
Separate `uninstall.php` guarded by `WP_UNINSTALL_PLUGIN` drops custom tables. For our plugin there are no custom tables (transients only), so `uninstall.php` may be skipped.

**.htaccess** (`maxi-ai/.htaccess`): blocks `.md`, `.example`, `.txt` from direct web access. Security-cheap, should copy.

**composer.json in Maxi AI:** NONE. Maxi AI has no composer.json, no vendor/. Our plugin DOES need composer.json (REQUIREMENTS ABIL-SCAF-02 mandates `wordpress/mcp-adapter:^0.5.0` declared + `vendor/` committed). **This is first-time composer usage in PORTAL.**

### WP-CLI command patterns in Maxi AI

**Maxi AI does NOT register any `WP_CLI::add_command`.** Verified by `grep 'WP_CLI::add_command' maxi-ai/` → zero matches. The closest thing is `maxi-ai/abilities/development/run-wp-cli.php` — an *ability* that *executes* WP-CLI commands via `WP_CLI::runcommand()`, but that is inverse of what we need (`wp kmn seed` must itself be a WP-CLI command).

**Consequence:** There is **no internal analog for WP-CLI command registration anywhere in PORTAL**. Planner must reference WP-CLI's official docs directly (`WP_CLI::add_command( 'kmn', Some_Class::class )` + methods map to sub-commands like `wp kmn seed` / `wp kmn seed reset`). No internal prior art exists — SEEDER_SPEC.md §3a is the spec to follow.

### DDEV patterns

**Zero existing DDEV usage in PORTAL.** Grep for `ddev|\.ddev` across repo returns only `.planning/` + `docs/ideas/` documents that *describe* the upcoming setup. No `.ddev/` directory, no `wp-local/`, no PHP-hosting config whatsoever.

LOCAL_DEV_SETUP.md §2-6 is the sole blueprint — planner should treat those steps as the source of truth.

### gitignore patterns — WordPress-relevant state today

`.gitignore:44-52` has the scripts whitelist block (ignores `scripts/*` except `.ts`/`.cjs`/templates). **This currently silently excludes `scripts/seed-orders.php`** — must be added to the whitelist.

There are **zero existing WP-related entries** in `.gitignore`. LOCAL_DEV_SETUP.md §5 lists what to add:
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

Plus the scripts whitelist fix for the new `seed-orders.php`.

### CLAUDE.md rules for new patterns

**CLAUDE.md is 100% TypeScript/React-centric** — no PHP style guide, no WP plugin architecture section. Only WP reference in CLAUDE.md is:
- Line 72 (TECH STACK): `supabase/functions/_shared/wp-audit.ts` — a Deno-side wrapper that calls Maxi AI Core REST API. It is the consumer, not the plugin.

**CLAUDE.md rules that DO apply to Phase 15:**
1. **Rule 6** — "All UI text in German — zero English in user-facing strings." Ambiguous for a seeder: WP-CLI output is developer-facing, not user-facing. Decision: plan default English for WP-CLI log/progress lines (developer tool), but any text that could leak to customer-facing surfaces (email subjects, order notes visible in admin) must be German. Seeder writes no customer-facing strings — all test data uses `billing_email` at `@kmn-test.local`.
2. **Docs Update Protocol** — after Phase 15 lands, `docs/CHANGELOG.md` + `docs/DECISIONS.md` must be updated (App Password rotation runbook is in REQUIREMENTS MCPAPP-WP-03).
3. **Docs-memory-agent mandatory** after acceptance (per Supervisor responsibilities).
4. **`tasks/dashboard.md` + `tasks/dashboard.json`** must update at every phase transition.
5. **Supervisor approval gate** before implementation — plan goes through reviewer-architect → approval → implementation-agent → openrouter-review → qa-agent.

---

## Pattern Assignments

### `wordpress-plugins/kmn-revenue-abilities/kmn-revenue-abilities.php`

**Analog:** `maxi-ai/maxi-ai.php` (exact)

**What to copy:**

Plugin header block (`maxi-ai/maxi-ai.php:2-10`), ABSPATH guard (`:12-14`), final class pattern (`:16`), VERSION constant (`:18`), `plugins_loaded` init hook (`:568`), activation/deactivation hooks (`:565-566`), `load_includes` + `load_bootstrap` loaders via glob (`:31-61`), and **the ability-file lazy loader** (`:77-126`) — especially the CLI eager / REST deferred fork. Keep `final class` to prevent subclassing.

**What to change:**
- Class name: `Maxi_AI` → `KMN_Revenue_Abilities` (Maxi's underscore-separated PascalCase style).
- Plugin header Author: Yuri Kamanin / KAMANIN IT Solutions.
- `register_activation_hook` target: activation does NOT need to create DB tables (we have no custom tables — only WP transients). Keep activation hook slot but make it a no-op or a WP-version/WC-dependency guard (REQUIREMENTS ABIL-SCAF-01).
- **Add WP 6.9+ guard** (ABIL-SCAF-01) — deactivate self with admin notice if `version_compare( $GLOBALS['wp_version'], '6.9', '<' )`. No analog in Maxi.
- **Add WC dependency check** — deactivate with admin notice if WooCommerce inactive.
- **Add composer autoload** at top of main file (below ABSPATH guard): `require_once __DIR__ . '/vendor/autoload.php';`. Maxi has no autoload.

### `wordpress-plugins/kmn-revenue-abilities/composer.json`

**Analog:** — (no internal analog; first-time composer.json in PORTAL)

**What to do:**
- Declare `wordpress/mcp-adapter: ^0.5.0` per ABIL-SCAF-02.
- Classic `type: wordpress-plugin`, MIT or GPL-2.0+ license to match Maxi.
- `"autoload": { "psr-4": { "KMN\\RevenueAbilities\\": "src/" } }` or skip PSR-4 entirely (Maxi has no namespaces — simpler to mirror). **Recommend: no PSR-4**, keep everything procedural like Maxi.
- `vendor/` committed to repo per LOCAL_DEV_SETUP.md §4 and REQUIREMENTS ABIL-SCAF-02.
- No `composer.lock` — .gitignore excludes it per LOCAL_DEV_SETUP.md §5 (matches WP plugin practice).

### `wordpress-plugins/kmn-revenue-abilities/bootstrap/register-mcp-server.php`

**Analog:** `maxi-ai/bootstrap/register-abilities-with-mcp.php` (role-match — both hook `mcp_adapter_init`, but adapter API differs)

**What to copy:** ABSPATH guard, closure wrapping via `add_action('mcp_adapter_init', function () { ... })`, early-return if adapter function missing.

**What to change:** Instead of Maxi's generic `wp_get_abilities()` loop, call MCP Adapter v0.5.0's `$adapter->create_server()` with:
```php
$adapter->create_server(
    server_id:      'kmn-revenue',
    rest_namespace: 'mcp',
    rest_route:     'kmn-revenue',
    // abilities and additional config per MCP Adapter 0.5.0 API
);
```
Result endpoint: `/wp-json/mcp/kmn-revenue` (REQUIREMENTS ABIL-SCAF-03). Confirm exact signature against MCP Adapter 0.5.0 upstream docs before coding (LOCAL_DEV_SETUP.md §6 open question).

### `wordpress-plugins/kmn-revenue-abilities/abilities/*.php` (5 files)

**Analog:** `maxi-ai/abilities/woocommerce/list-orders.php` (148 lines, exact pattern match) and `maxi-ai/abilities/analytics/get-analytics.php` (analytics SQL pattern)

**What to copy — full 148-line template** from `list-orders.php`:

```php
<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {
    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }
    wp_register_ability(
        'kmn/revenue-run-rate',              // ← NOTE namespace: kmn/, not maxi/
        [
            'label'       => 'Revenue Run Rate',
            'description' => '...',
            'category'    => 'woocommerce',   // or 'analytics' per ability
            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],
            'input_schema' => [
                'type'       => 'object',
                'properties' => [ /* per WP_BRIDGE_ARCHITECTURE.md §4 */ ],
                'required'   => [],
            ],
            'execute_callback' => function ( $input ) {
                if ( ! function_exists( 'wc_get_orders' ) ) {
                    return kmn_revenue_response( false, [], 'WooCommerce is not active.' );
                }
                try {
                    // ... SQL via $wpdb->prepare() — NEVER raw concat ...
                    return kmn_revenue_response( true, [ /* data */ ] );
                } catch ( \Throwable $e ) {
                    return kmn_revenue_response( false, [], 'revenue-run-rate failed: ' . $e->getMessage() );
                }
            },
            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },
        ]
    );
} );
```

**What to change per ability:**
- Namespace all IDs with `kmn/` prefix (not `maxi/`) — ABIL-QA-05 asserts no namespace collision with Maxi.
- Replace `maxi_ai_response()` with our own `kmn_revenue_response()` (defined in `includes/cache.php` or new `includes/response.php`) — fork needed because we don't want the `_meta.operator_notes_revision` field Maxi returns, and we want cache-TTL metadata.
- Add `$wpdb->query( "SET SESSION MAX_EXECUTION_TIME=2000" );` before heavy queries (ABIL-QA-03).
- All SQL parameterised via `$wpdb->prepare()` (ABIL-DEF-06) — `maxi-ai/abilities/analytics/get-analytics.php:99+` demonstrates the pattern for aggregation queries.
- All responses wrapped with transient cache per ability's TTL (ABIL-DEF-07) — 15 min for heatmap/repeat/basket, **5 min for revenue-run-rate**.
- Use numeric UTC offsets (`+02:00`/`+01:00` resolved via PHP `DateTimeZone::getOffset()`), NOT `CONVERT_TZ(x, '+00:00', 'Europe/Vienna')` — SEEDER_SPEC §5 + ABIL-DEF-02.

### `wordpress-plugins/kmn-revenue-abilities/includes/sql-helpers.php`

**Analog:** `maxi-ai/includes/helpers.php` (role-match — helpers for ability handlers)

**What to copy:** ABSPATH guard, single-responsibility free functions with `kmn_revenue_*` prefix (mirroring Maxi's `maxi_ai_*`), `/**` docblocks on every function.

**What to add (no Maxi analog):**
- Date-range builders (per ABIL-SCAF-04) returning `[$start_utc, $end_utc]` for common windows (today, last N days, last N weeks, YYYY-WW boundaries).
- Numeric UTC offset resolver: `kmn_revenue_get_utc_offset(string $tz_name): string` → e.g. `"+02:00"` for Europe/Vienna in summer. Uses `(new DateTime('now', new DateTimeZone($tz)))->format('P')`.
- SQL `IN()` placeholder builder if used: `kmn_revenue_prepare_in(array $values): string` returning `'%s,%s,%s'` placeholder fragment.

### `wordpress-plugins/kmn-revenue-abilities/includes/cache.php`

**Analog:** — (no internal analog; Maxi AI has no transient wrappers)

**What to do:**
- Transient key builder: `kmn_revenue_cache_key(string $ability, array $input): string` → e.g. `sha1( $ability . '|' . wp_json_encode( $input ) )` truncated to 45 chars (WP transient key limit is 172 but short is cheap).
- TTL constants per ability: `KMN_REVENUE_TTL_RUN_RATE = 5 * MINUTE_IN_SECONDS;` (revenue-run-rate uses 5 min per ABIL-DEF-07; others 15 min).
- Wrapper helper: `kmn_revenue_cached(string $key, int $ttl, callable $producer)` — read-through cache returning cached value or computing + storing.
- Cache invalidation on `woocommerce_order_status_changed` (ABIL-SCAF-04) — register an action that deletes all transients with the `kmn_revenue_` prefix, or flushes a namespaced transient group.

### `scripts/seed-orders.php`

**Analog:** — (first PHP script in `scripts/`; first WP-CLI command in PORTAL)

**External guidance:** SEEDER_SPEC.md §3 — full implementation strategy; LOCAL_DEV_SETUP.md §8.

**What to do (composite from Maxi AI style + SEEDER_SPEC + WP-CLI docs):**
- Top-of-file docblock header listing Usage / Flags / Examples — mirrors scripts/*.ts convention.
- ABSPATH guard at top like every other PHP file.
- **Guard registration behind `WP_CLI` constant**:
  ```php
  if ( ! ( defined( 'WP_CLI' ) && WP_CLI ) ) {
      return;
  }
  ```
- Register via `WP_CLI::add_command( 'kmn', KMN_Seeder_Command::class );` where the class has `seed($args, $assoc_args)` and `reset($args, $assoc_args)` methods (standard WP-CLI class-method → sub-command pattern — `wp kmn seed` / `wp kmn seed reset`).
- Class name: `KMN_Seeder_Command` (matching Maxi's `Maxi_AI_*` convention).
- Environment guard (SEED-07): hard-fail before any write if `get_option('siteurl')` does not end in `.ddev.site`.
- Flag parsing: `$assoc_args['weeks'] ?? 12`, etc. with integer casts and bounds checks.
- `--seed=N` → seed `mt_srand((int) $assoc_args['seed'])` for reproducibility.
- `--dry-run` → print planned counts, exit before writes.
- Disable order emails: `update_option('woocommerce_email_new_order_enabled', 'no');` before seeding, restore on completion (or leave disabled for local).
- Tag every order: `$order->update_meta_data('_kmn_test_order', 1); $order->save();` (SEED-05).
- `reset`: `wc_get_orders([ 'meta_key' => '_kmn_test_order', 'meta_value' => 1, 'limit' => -1, 'return' => 'ids' ])` → `wp_delete_post($id, true)` (SEED-06, SEEDER_SPEC §3f). Also delete users tagged `_kmn_test_user` via `get_users()` + `wp_delete_user()`.
- Progress output via `WP_CLI::log()`, errors via `WP_CLI::error()`, success via `WP_CLI::success()`.
- Sibling file `scripts/seed-orders.md` (SEEDER_SPEC §8) — human docs. Add to .gitignore whitelist if `seed-orders.md` isn't caught by existing `*.md` rule (currently only `README.md` + `new-client-template.md` are whitelisted).

### `.ddev/config.yaml`

**Analog:** — (first DDEV project in PORTAL)

**What to do:** Follow LOCAL_DEV_SETUP.md §6 Step 2 verbatim:
```yaml
project-type: wordpress
project-name: summerfield
docroot: .
webserver-type: nginx-fpm
database: { type: mariadb, version: '10.11' }
php-version: '8.2'
```
(REQUIREMENTS/ROADMAP spec says Apache + PHP 8.4 + MySQL 8.0 at `/home/upan/projects/sf_staging/`; LOCAL_DEV_SETUP.md §3 says nginx-fpm + PHP 8.2 + MariaDB 10.11 inside PORTAL repo. **This is a live conflict** — planner must reconcile in PLAN.md, not silently pick one. Recommendation: follow LOCAL_DEV_SETUP.md §6 since it's the more recent and reasoned source, and flag the discrepancy to Yuri.)

---

## Shared Patterns

### ABSPATH guard (applies to EVERY new PHP file)

**Source:** `maxi-ai/abilities/woocommerce/list-orders.php:3-5` (identical in all ~106 Maxi ability files)

```php
<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
```

Every `.php` file under `wordpress-plugins/kmn-revenue-abilities/` must begin with this guard after `<?php`. Only exception: `scripts/seed-orders.php` may replace with the `defined('WP_CLI')` guard since it only loads in CLI context.

### Response envelope

**Source:** `maxi-ai/includes/helpers.php:44-63`

Every ability must return a structured envelope via a prefixed helper function. Define `kmn_revenue_response($success, $data = [], $error = null)` in `includes/cache.php` (or new `includes/response.php`). Fork of Maxi's helper minus the `_meta.operator_notes_revision` extensions.

### Capability check (applies to all 5 abilities)

**Source:** `maxi-ai/abilities/woocommerce/list-orders.php:141-143`

```php
'permission_callback' => function () {
    return current_user_can( 'manage_woocommerce' );
},
```

REQUIREMENTS mandates `manage_woocommerce` per ABIL-DEF (spec intro line). Never use `__return_true`.

### Input sanitisation

**Source:** `maxi-ai/abilities/woocommerce/list-orders.php:83-89` and `maxi-ai/abilities/analytics/get-analytics.php:82-88`

Every `$input[...]` access must pass through a sanitiser. Patterns seen:
- `sanitize_key()` for enum-like values (status, orderby)
- `sanitize_text_field()` for free-form dates/strings
- `intval()` / `(int)` for integers with `min()`/`max()` bounds
- `in_array($v, [allowed], true)` for strict enum validation

### Error handling

**Source:** `maxi-ai/abilities/woocommerce/list-orders.php:68-70, 135-137`

```php
if ( ! function_exists( 'wc_get_orders' ) ) {
    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
}
try {
    // ...
} catch ( \Throwable $e ) {
    return maxi_ai_response( false, [], 'list-orders failed: ' . $e->getMessage() );
}
```

Every `execute_callback` wraps core work in `try { } catch ( \Throwable $e )` and returns failure envelope. No uncaught exceptions.

### SQL via `$wpdb->prepare()` (ABIL-DEF-06 — zero tolerance)

**Source:** `maxi-ai/maxi-ai.php:436` (example of prepared `SHOW TABLES LIKE %s` guard)

All SQL in new abilities must use `$wpdb->prepare()` with `%s` / `%d` / `%f` placeholders. Zero raw string interpolation of `$input[...]` into SQL. Numeric UTC offsets (e.g. `'+02:00'`) are still passed as placeholders.

---

## Conventions to Follow

(bullet list — "do it this way because Maxi AI does it this way")

- **Procedural + static-class, no PSR-4 namespaces** — Maxi uses `class Maxi_AI` (static singleton) + free functions in `includes/helpers.php`. PORTAL's new plugin does the same: `class KMN_Revenue_Abilities` + free `kmn_revenue_*` functions.
- **Prefixed class names** (`Maxi_AI_*` → `KMN_Revenue_*`), **dashed filenames** (`class-ability-schema-patch.php` style).
- **ABSPATH guard** at top of every PHP file inside the plugin (not optional).
- **Ability registration inside closure** wrapped in `add_action('wp_abilities_api_init', function () { ... })` — verbatim from Maxi.
- **MCP adapter hook** in `bootstrap/register-mcp-server.php` wrapped in `add_action('mcp_adapter_init', function () { ... })` — same style as `maxi-ai/bootstrap/register-abilities-with-mcp.php`.
- **One ability = one file**, named `<verb-noun>.php`, placed under `abilities/<category>/` (optional subdir) or flat `abilities/` (our plan has 5 — flat is fine).
- **Response envelope** returned from every `execute_callback`, never raw arrays.
- **Capability check** in `permission_callback` — `current_user_can('manage_woocommerce')`.
- **try/catch \Throwable** around all heavy work in `execute_callback`.
- **`if ( ! function_exists( ... ) ) { return; }`** guard at closure start to protect against load-order issues.
- **Lazy ability loading** — eager under WP-CLI, deferred via `rest_api_init` priority 0 otherwise (`maxi-ai/maxi-ai.php:77-86`).
- **`.htaccess` in plugin root** blocking `.md`/`.example`/`.txt` from web access.
- **WP-CLI commands as static classes** (standard WP-CLI convention; no internal analog, external standard).
- **`$wpdb->prepare()` for all SQL with user input** — zero exceptions, ABIL-DEF-06 is a hard gate.

---

## First-Time Conventions (No Internal Prior Art)

These are **first time in PORTAL** — planner should NOT search for internal precedent, and may only reference Maxi AI style (external analog in same repo) or external/official docs:

1. **First PORTAL-authored PHP code.** `maxi-ai/` is Michael's vendored plugin, not ours. Mirror Maxi style for consistency but treat it as external reference, not internal style guide.
2. **First `composer.json` in PORTAL.** No `composer.*` file exists anywhere in the repo. No root-level PHP dependency management precedent. Planner must design `composer.json` from scratch per REQUIREMENTS ABIL-SCAF-02 + LOCAL_DEV_SETUP.md §4.
3. **First WP plugin authored by KAMANIN in PORTAL.** No existing `wordpress-plugins/` directory. No internal "house style" for KAMANIN-authored WP code. Mirror Maxi conventions as described above.
4. **First WP-CLI command in PORTAL.** Maxi does NOT register any `WP_CLI::add_command`. Planner follows WP-CLI's public contract directly. No internal analog to copy from — this is a greenfield file.
5. **First DDEV config in PORTAL.** No `.ddev/` exists; no script references DDEV. LOCAL_DEV_SETUP.md is the only reference — planner executes §6 Step 2 verbatim.
6. **First PHP script in `scripts/`.** `scripts/` is currently 7× TypeScript + 1× Node CJS + templates. `seed-orders.php` is the first PHP. Requires `.gitignore` whitelist update (currently `scripts/*` is ignored except `.ts`/`.cjs`). Recommend adding: `!scripts/seed-orders.php` and `!scripts/seed-orders.md`.
7. **First `wordpress-plugins/` directory.** No prior `wordpress-plugins/` tree. Planner creates from scratch per LOCAL_DEV_SETUP.md §4 layout diagram.

**Concrete risk:** because there is no internal precedent, the implementation agent may drift from Maxi's style (e.g. introduce PSR-4 namespaces, use modern PHP 8.4 features Maxi doesn't use). Planner must explicitly call out in each PLAN.md action: "Mirror `maxi-ai/abilities/woocommerce/list-orders.php` verbatim except for ability ID and SQL body."

---

## Constraints from CLAUDE.md That Apply to Phase 15

1. **German UI rule (CLAUDE.md Architecture Rule 6):** "All UI text in German — zero English in user-facing strings." Interpretation for Phase 15:
   - **Seeder WP-CLI output → English is OK** (it's developer-facing, not user-facing; matches existing TS scripts that also print English).
   - **Ability response `error` strings → English is OK** (they bubble up to mcp-poc Node and then to widget; the widget shows a generic German "Daten nicht verfügbar" per WIDG-QA-03 and never surfaces raw ability errors to the customer).
   - **Order note / order meta text if visible in WP admin → German** (WP admin is German-localised for Summerfield). Seeder writes `created_via => 'kmn_seed'` which is a slug, so this is fine.
2. **Components < 150 lines (Architecture Rule 7):** TypeScript-only rule. Does NOT apply to PHP files. Ability files at 148 lines (Maxi list-orders) are the target complexity.
3. **Docs Update Protocol:** After Phase 15, update `docs/CHANGELOG.md` + add ADR to `docs/DECISIONS.md` for: DDEV adoption, composer-in-plugin pattern, WP-CLI command registration choice, seeder reset policy.
4. **Skill system:** `.claude/skills/clickup-api/` exists but **no WordPress skill yet.** If this work recurs (Phase 16 adds 5 more abilities, Phase 20 MBM rollout duplicates the plugin), planner should consider proposing a `.claude/skills/wp-plugin-conventions/SKILL.md` to capture the mirror-Maxi-AI rules — but that is out of Phase 15 scope unless user asks.
5. **Supervisor flow** applies: reviewer-architect pre-review → Yuri approval → implementation-agent → openrouter-review → qa-agent → docs-memory-agent. Phase 15 is a big phase (19 requirements across 2 sub-deliverables) — planner should split into at least 2 sub-plans (e.g. 15-01 DDEV + plugin scaffold, 15-02 seeder).

---

## No Analog Found

| File | Role | Why no analog |
|------|------|---------------|
| `composer.json` | dep manifest | First in repo — no existing composer.json anywhere |
| `includes/cache.php` | transient/TTL utility | Maxi has no transient wrappers (uses DB options instead) |
| `scripts/seed-orders.php` | WP-CLI command | First PHP script in `scripts/`; first WP-CLI command in PORTAL |
| `.ddev/config.yaml` | DDEV config | First DDEV project in PORTAL |

Planner should reference **external** sources for these four:
- composer.json → REQUIREMENTS ABIL-SCAF-02 + Packagist `wordpress/mcp-adapter` v0.5.0
- cache.php → WP Transients API docs + SEED-07 invalidation hook (`woocommerce_order_status_changed`)
- seed-orders.php → SEEDER_SPEC.md (full spec) + WP-CLI official `add_command` docs
- `.ddev/config.yaml` → LOCAL_DEV_SETUP.md §6 Step 2 (verbatim)

---

## Metadata

**Analog search scope:** `G:/01_OPUS/Projects/PORTAL/{maxi-ai/, scripts/, .gitignore, CLAUDE.md}`; grep for `WP_CLI::add_command`, `ddev|DDEV`, `composer`, `.php` files across repo
**Files scanned:** 10 Maxi-AI PHP files (main + bootstrap + 2 sample abilities + helpers + uninstall + .htaccess + 2 docs), 8 scripts/*.ts|cjs, .gitignore, CLAUDE.md, REQUIREMENTS.md, ROADMAP.md, LOCAL_DEV_SETUP.md, SEEDER_SPEC.md
**Pattern extraction date:** 2026-04-23
