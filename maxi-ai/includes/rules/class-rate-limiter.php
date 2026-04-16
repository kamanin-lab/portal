<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Per-session rate limiter for MCP ability calls.
 *
 * Uses a fixed-window counter stored in WordPress transients, keyed by
 * MCP session ID + ability category. Three tiers: read (120/min),
 * write (30/min), ai (10/min). All defaults configurable via constants.
 *
 * Only applies to MCP transport — direct PHP, WP-CLI, and cron calls
 * are not rate-limited (the Rule Gate bypasses for non-MCP contexts).
 *
 * Constants:
 *   MAXI_AI_RATE_LIMIT_READ     — max read calls per window (default 120)
 *   MAXI_AI_RATE_LIMIT_WRITE    — max write calls per window (default 30)
 *   MAXI_AI_RATE_LIMIT_AI       — max AI generation calls per window (default 10)
 *   MAXI_AI_RATE_LIMIT_WINDOW   — window size in seconds (default 60)
 *   MAXI_AI_RATE_LIMIT_DISABLED — set to true to disable rate limiting
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Rate_Limiter {

    /**
     * AI generation abilities — most expensive, tightest limit.
     */
    private const AI_ABILITIES = [
        'maxi/generate-text-ai',
        'maxi/generate-text-ai-batch',
        'maxi/generate-image-ai',
        'maxi/generate-image-ai-batch',
        'maxi/edit-image-ai',
    ];

    /**
     * Read-only abilities — cheapest, loosest limit.
     * Everything not in AI or READ is treated as "write".
     */
    private const READ_ABILITIES = [
        // Content reads.
        'maxi/get-content',
        'maxi/get-content-by-slug',
        'maxi/list-content',
        'maxi/search-content',

        // Taxonomy reads.
        'maxi/get-term',
        'maxi/list-terms',

        // Meta reads.
        'maxi/get-meta',
        'maxi/list-meta',

        // Media reads.
        'maxi/get-attachment',
        'maxi/list-attachments',

        // Notes reads.
        'maxi/get-note',
        'maxi/list-notes',
        'maxi/list-note-comments',

        // WooCommerce reads.
        'maxi/get-product',
        'maxi/list-products',
        'maxi/get-order',
        'maxi/list-orders',
        'maxi/get-coupon',
        'maxi/list-coupons',
        'maxi/list-shipping-zones',
        'maxi/list-tax-rates',
        'maxi/list-variations',
        'maxi/get-product-attributes',

        // System reads.
        'maxi/get-site-info',
        'maxi/get-current-user',
        'maxi/get-post-types',
        'maxi/get-taxonomies',
        'maxi/get-site-instructions',

        // AI config reads (not generation).
        'maxi/get-ai-settings',
        'maxi/list-provider-keys',
        'maxi/get-audit-events',
        'maxi/get-job-status',

        // Analytics reads.
        'maxi/get-analytics',
    ];

    /**
     * Default limits per category (calls per window).
     */
    private const DEFAULTS = [
        'read'  => 120,
        'write' => 30,
        'ai'    => 10,
    ];

    /**
     * Map category → wp-config.php constant name.
     */
    private const CONST_MAP = [
        'read'  => 'MAXI_AI_RATE_LIMIT_READ',
        'write' => 'MAXI_AI_RATE_LIMIT_WRITE',
        'ai'    => 'MAXI_AI_RATE_LIMIT_AI',
    ];

    /**
     * Check whether the current request exceeds the rate limit.
     *
     * @param string $session_id MCP session ID.
     * @param string $ability_id The ability being called.
     * @return array|null Null if within limit. Array with rate limit details if exceeded.
     */
    public static function check( string $session_id, string $ability_id ): ?array {

        if ( self::is_disabled() ) {
            return null;
        }

        $category = self::get_category( $ability_id );
        $limit    = self::get_limit( $category );
        $window   = self::get_window();
        $bucket   = (int) floor( time() / $window );
        $key      = 'maxi_rl_' . md5( $session_id . '|' . $category . '|' . $bucket );

        $count = (int) get_transient( $key );

        if ( $count >= $limit ) {
            return [
                'category'    => $category,
                'limit'       => $limit,
                'window'      => $window,
                'retry_after' => $window - ( time() % $window ),
            ];
        }

        // Increment the counter. TTL is 2x window to ensure the transient
        // outlives the current window (prevents race on bucket boundary).
        set_transient( $key, $count + 1, $window * 2 );

        return null;

    }

    /**
     * Classify an ability into a rate limit category.
     *
     * @param string $ability_id The ability ID.
     * @return string 'ai', 'read', or 'write'.
     */
    private static function get_category( string $ability_id ): string {

        if ( in_array( $ability_id, self::AI_ABILITIES, true ) ) {
            return 'ai';
        }

        if ( in_array( $ability_id, self::READ_ABILITIES, true ) ) {
            return 'read';
        }

        return 'write';

    }

    /**
     * Get the configured limit for a category.
     *
     * @param string $category 'read', 'write', or 'ai'.
     * @return int
     */
    private static function get_limit( string $category ): int {

        $const = self::CONST_MAP[ $category ] ?? null;

        if ( $const && defined( $const ) ) {
            return max( 1, (int) constant( $const ) );
        }

        return self::DEFAULTS[ $category ] ?? 30;

    }

    /**
     * Get the configured window size in seconds.
     *
     * @return int
     */
    private static function get_window(): int {

        if ( defined( 'MAXI_AI_RATE_LIMIT_WINDOW' ) ) {
            return max( 10, (int) MAXI_AI_RATE_LIMIT_WINDOW );
        }

        return 60;

    }

    /**
     * Check if rate limiting is globally disabled.
     *
     * @return bool
     */
    private static function is_disabled(): bool {

        return defined( 'MAXI_AI_RATE_LIMIT_DISABLED' ) && MAXI_AI_RATE_LIMIT_DISABLED;

    }

}
