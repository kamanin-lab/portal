<?php
/**
 * Transient-backed caching helpers for kmn-revenue abilities.
 *
 * All transient keys use the `kmn_` prefix so bulk invalidation via
 * woocommerce_order_status_changed can DELETE them in a single query.
 *
 * Invariants:
 * - Cache keys are opaque (SHA-1 of ability id + JSON-encoded sorted input).
 * - WP_Error returned by a producer is never cached (so transient downtime
 *   does not poison the cache).
 * - Read-through: missing values are produced on demand and then written.
 *
 * @package KMN_Revenue_Abilities
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// TTL constants. Revenue run-rate is short (5 min) because intra-day
// numbers move fast; the other abilities use a 15-min default. Repeat /
// basket / briefing snapshots are stable over an hour.
if ( ! defined( 'KMN_REVENUE_TTL_RUN_RATE' ) ) {
    define( 'KMN_REVENUE_TTL_RUN_RATE', 5 * MINUTE_IN_SECONDS );
}
if ( ! defined( 'KMN_REVENUE_TTL_DEFAULT' ) ) {
    define( 'KMN_REVENUE_TTL_DEFAULT', 15 * MINUTE_IN_SECONDS );
}
if ( ! defined( 'KMN_REVENUE_TTL_REPEAT' ) ) {
    define( 'KMN_REVENUE_TTL_REPEAT', HOUR_IN_SECONDS );
}
if ( ! defined( 'KMN_REVENUE_TTL_BASKET' ) ) {
    define( 'KMN_REVENUE_TTL_BASKET', HOUR_IN_SECONDS );
}
if ( ! defined( 'KMN_REVENUE_TTL_BRIEFING' ) ) {
    define( 'KMN_REVENUE_TTL_BRIEFING', 5 * MINUTE_IN_SECONDS );
}

/**
 * Build a stable transient key from an ability id + input array.
 *
 * Normalises the input by recursively sorting array keys and JSON-encoding,
 * then hashes. Two identical semantic inputs produce identical keys
 * regardless of caller-side key order.
 *
 * The resulting key is `kmn_{sha1[0..39]}` — 44 characters total, well
 * under WP's 172-char transient-key ceiling.
 *
 * @param string $ability_id Ability slug (e.g. 'kmn/weekly-heatmap').
 * @param array  $input      Validated input args.
 * @return string Opaque transient key.
 */
function kmn_revenue_cache_key( string $ability_id, array $input ): string {

    $normalised = $input;
    kmn_revenue_ksort_recursive( $normalised );

    $hash = sha1( $ability_id . '|' . wp_json_encode( $normalised ) );

    return 'kmn_' . substr( $hash, 0, 40 );

}

/**
 * Recursively sort array keys in place for deterministic JSON encoding.
 *
 * @param array $arr Reference to array to sort.
 * @return void
 */
function kmn_revenue_ksort_recursive( array &$arr ): void {

    ksort( $arr );

    foreach ( $arr as &$value ) {
        if ( is_array( $value ) ) {
            kmn_revenue_ksort_recursive( $value );
        }
    }

}

/**
 * Read-through cache wrapper.
 *
 * Calls `$producer()` on miss; stores the result unless it is a WP_Error.
 * Bypasses the cache entirely when `$skip` is true — intended for the
 * `_skip_cache` debug hook documented in the plugin readme.
 *
 * @param string   $key      Transient key (from kmn_revenue_cache_key).
 * @param int      $ttl      Time-to-live in seconds.
 * @param callable $producer Zero-arg callback producing the cached value.
 * @param bool     $skip     When true, always call producer and do not cache.
 * @return mixed Cached or freshly produced value, or WP_Error from producer.
 */
function kmn_revenue_cached( string $key, int $ttl, callable $producer, bool $skip = false ) {

    if ( ! $skip ) {
        $cached = get_transient( $key );
        if ( $cached !== false ) {
            return $cached;
        }
    }

    $fresh = $producer();

    if ( ! is_wp_error( $fresh ) && ! $skip ) {
        set_transient( $key, $fresh, $ttl );
    }

    return $fresh;

}

/**
 * Bulk-invalidate every kmn_* transient.
 *
 * Registered on woocommerce_order_status_changed: any status transition
 * makes every revenue figure potentially stale. Rather than tracking
 * which key depends on which order, we flush the whole namespace —
 * recomputation cost per ability is well under a second.
 *
 * @return int Number of option rows deleted (transient + timeout pairs).
 */
function kmn_revenue_invalidate_all(): int {

    global $wpdb;

    // LIKE patterns escape backslash with backslash, underscore with
    // backslash. WP's esc_like covers most of it, but we hand-build to
    // be unambiguous about the prefix `_transient_kmn_`.
    $affected = (int) $wpdb->query(
        "DELETE FROM {$wpdb->options}
         WHERE option_name LIKE '\\_transient\\_kmn\\_%'
            OR option_name LIKE '\\_transient\\_timeout\\_kmn\\_%'"
    );

    return $affected;

}

// Hook once at file load — any order status change invalidates cached
// revenue figures immediately. Priority 10, zero accepted args.
add_action( 'woocommerce_order_status_changed', 'kmn_revenue_invalidate_all', 10, 0 );
