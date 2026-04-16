<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Ability tier classification for Maxi AI.
 *
 * Declarative map of which abilities require a Pro license.
 * Everything not listed here is considered free-tier.
 *
 * To gate a new ability behind Pro, add its ID to the PRO array.
 * To move a Pro ability to free, remove it from the array.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_License_Tiers {

    /**
     * Abilities that require an active Pro license.
     *
     * Every ability NOT in this list is available on the free tier.
     *
     * @var string[]
     */
    const PRO = [
        // AI generation.
        'maxi/generate-text-ai',
        'maxi/generate-text-ai-batch',
        'maxi/generate-image-ai',
        'maxi/generate-image-ai-batch',
        'maxi/edit-image-ai',
        'maxi/get-job-status',
        'maxi/cancel-job',

        // AI settings (write).
        'maxi/update-ai-settings',
        'maxi/rotate-provider-key',

        // WooCommerce — Products.
        'maxi/get-product',
        'maxi/list-products',
        'maxi/update-product',
        'maxi/get-product-attributes',
        'maxi/set-product-attributes',
        'maxi/set-product-type',

        // WooCommerce — Variations.
        'maxi/create-variation',
        'maxi/update-variation',
        'maxi/delete-variation',
        'maxi/list-variations',

        // WooCommerce — Orders.
        'maxi/create-order',
        'maxi/get-order',
        'maxi/list-orders',
        'maxi/update-order-status',
        'maxi/add-order-note',

        // WooCommerce — Coupons.
        'maxi/create-coupon',
        'maxi/get-coupon',
        'maxi/update-coupon',
        'maxi/delete-coupon',
        'maxi/list-coupons',

        // WooCommerce — Shipping.
        'maxi/list-shipping-zones',
        'maxi/create-shipping-zone',
        'maxi/add-shipping-method',
        'maxi/update-shipping-method',

        // WooCommerce — Tax.
        'maxi/create-tax-rate',
        'maxi/update-tax-rate',
        'maxi/list-tax-rates',
        'maxi/delete-tax-rate',

        // WooCommerce — Bulk.
        'maxi/bulk-update-prices',

        // Development power tools.
        'maxi/run-wp-cli',
        'maxi/manage-db-query-blocklist',
        'maxi/manage-mask-fields',
        'maxi/read-file',
        'maxi/list-files',
        'maxi/send-email',

        // Analytics.
        'maxi/get-analytics',
        'maxi/manage-analytics-settings',

        // Bulk meta.
        'maxi/bulk-update-meta',
    ];

    /**
     * Check whether an ability requires a Pro license.
     *
     * @param string $ability_id Ability ID (e.g. 'maxi/generate-text-ai').
     * @return bool True if the ability is Pro-only.
     */
    public static function is_pro( string $ability_id ): bool {

        $pro_list = self::get_pro_list();

        return in_array( $ability_id, $pro_list, true );

    }

    /**
     * Check whether an ability is available on the free tier.
     *
     * @param string $ability_id Ability ID.
     * @return bool
     */
    public static function is_free( string $ability_id ): bool {

        return ! self::is_pro( $ability_id );

    }

    /**
     * Get the full list of Pro ability IDs.
     *
     * Applies the maxi_ai_license_tiers_pro filter for runtime modification.
     *
     * @return string[]
     */
    public static function get_pro_list(): array {

        /**
         * Filter the list of ability IDs that require a Pro license.
         *
         * @param string[] $pro_abilities Array of ability IDs.
         */
        return (array) apply_filters( 'maxi_ai_license_tiers_pro', self::PRO );

    }

    /**
     * Get a categorized summary of all abilities and their tiers.
     *
     * Useful for the admin UI and agent introspection.
     *
     * @return array{free: string[], pro: string[]}
     */
    public static function get_summary(): array {

        if ( ! function_exists( 'wp_get_abilities' ) ) {
            return [ 'free' => [], 'pro' => self::get_pro_list() ];
        }

        $free = [];
        $pro  = [];

        foreach ( wp_get_abilities() as $ability ) {
            if ( ! $ability instanceof WP_Ability ) {
                continue;
            }

            $name = $ability->get_name();

            if ( strpos( $name, 'maxi/' ) !== 0 ) {
                continue;
            }

            if ( self::is_pro( $name ) ) {
                $pro[] = $name;
            } else {
                $free[] = $name;
            }
        }

        sort( $free );
        sort( $pro );

        return [ 'free' => $free, 'pro' => $pro ];

    }

}
