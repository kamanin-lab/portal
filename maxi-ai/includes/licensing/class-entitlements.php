<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Entitlement resolver for Maxi AI abilities.
 *
 * Replaces the flat Maxi_AI_License_Tiers::PRO array with a data-driven
 * feature-group + plan model:
 *
 * - Each ability carries a 'feature_group' tag in its meta array.
 * - Plans (lite, pro, enterprise, ...) declare which feature groups
 *   they include.
 * - License Status carries an entitlements[] array (from the server
 *   directly, or derived from the plan as a fallback).
 * - The gate permits an ability when its feature_group is in the
 *   license's entitlements.
 *
 * Adding a new plan, extending an existing one, or defining a white-label
 * bundle is a data change in PLANS — no code change anywhere else.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Entitlements {

    /**
     * Feature groups that never require a license. These are the
     * abilities an agent needs to bootstrap a session and activate
     * a license (even from a fresh install).
     */
    const ALWAYS_FREE = [
        'session_system',
        'licensing',
    ];

    /**
     * Plan -> feature_groups map. Source of truth for fallback when
     * a license server response omits an explicit entitlements array.
     *
     * When the license server starts returning entitlements directly,
     * this map is still used:
     *   (a) as a sanity-check for unknown plans,
     *   (b) to populate the response for legacy plan strings via aliases,
     *   (c) to drive description-tagging (Pro-only groups get [PRO]).
     */
    const PLANS = [
        'lite' => [
            'content_read',
            'content_write_basic',
            'taxonomy',
            'notes',
            'media_basic',
            'meta_basic',
            'ai_settings_read',
            'dev_tools_basic',
        ],
        'pro' => [
            'content_read',
            'content_write_basic',
            'taxonomy',
            'notes',
            'media_basic',
            'meta_basic',
            'meta_bulk',
            'ai_settings_read',
            'ai_settings_write',
            'ai_generation',
            'analytics',
            'dev_tools_basic',
            'dev_tools_admin',
            'woocommerce_catalog',
            'woocommerce_orders',
            'woocommerce_coupons',
            'woocommerce_shipping_tax',
            'woocommerce_bulk',
            // 'media_ai' reserved — not currently granted to any ability.
        ],
    ];

    /**
     * Legacy plan aliases. Historical plan names map to current ones.
     *
     * 'agency' was a placeholder tier never functionally distinct from
     * 'pro' — any existing Agency-tier licenses continue to function as
     * Pro without admin intervention.
     */
    const PLAN_ALIASES = [
        'agency' => 'pro',
    ];

    /**
     * Resolve a plan string to its effective entitlements array.
     *
     * ALWAYS_FREE groups are always included. Unknown plans resolve
     * to the ALWAYS_FREE baseline (fail-closed: a broken license
     * string grants nothing beyond session bootstrap).
     *
     * @param string $plan Plan identifier (e.g. 'lite', 'pro', 'agency').
     * @return string[] Full list of entitlement group names.
     */
    public static function resolve_entitlements_for_plan( string $plan ): array {

        $original = $plan;
        $plan     = strtolower( trim( $plan ) );

        if ( isset( self::PLAN_ALIASES[ $plan ] ) ) {
            $plan = self::PLAN_ALIASES[ $plan ];
        }

        // Unknown plan → log a diagnostic and fall back to ALWAYS_FREE only.
        // Empty plan is treated as "unlicensed" (silent — expected state
        // for inactive/invalid license responses).
        if ( $plan !== '' && ! isset( self::PLANS[ $plan ] ) ) {
            error_log( sprintf(
                '[Maxi AI] Unknown license plan "%s" — falling back to ALWAYS_FREE entitlements only. Check license server response or add %s to Maxi_AI_Entitlements::PLANS.',
                $original,
                $plan
            ) );
        }

        $plan_groups = self::PLANS[ $plan ] ?? [];

        // Always-free groups are implicit — included regardless of plan.
        return array_values( array_unique( array_merge( self::ALWAYS_FREE, $plan_groups ) ) );

    }

    /**
     * Read the feature_group tag for an ability by ID.
     *
     * Looks up the registered ability via the WP Abilities API and
     * returns the value of its meta.feature_group field.
     *
     * @param string $ability_id Full ability name (e.g. 'maxi/generate-text-ai').
     * @return string|null Feature group name, or null if the ability is
     *                     unregistered or has no feature_group tag.
     */
    public static function get_feature_group( string $ability_id ): ?string {

        if ( ! function_exists( 'wp_get_ability' ) ) {
            return null;
        }

        $ability = wp_get_ability( $ability_id );

        if ( ! $ability instanceof WP_Ability ) {
            return null;
        }

        $meta = self::read_meta( $ability );

        $group = $meta['feature_group'] ?? null;

        return ( is_string( $group ) && $group !== '' ) ? $group : null;

    }

    /**
     * Whether an ability requires an entitlement check at all.
     *
     * Returns false for abilities whose feature_group is in ALWAYS_FREE
     * (session bootstrap, license activation) — these run ungated
     * regardless of license state. Returns true for every other
     * feature_group, and for abilities with no feature_group tag
     * (safer default: gate unknowns until they're classified).
     *
     * @param string $ability_id Full ability name.
     * @return bool True if the license gate should wrap this ability.
     */
    public static function requires_entitlement( string $ability_id ): bool {

        $group = self::get_feature_group( $ability_id );

        if ( $group === null ) {
            // Unknown / untagged abilities default to gated. Fail-closed.
            return true;
        }

        return ! in_array( $group, self::ALWAYS_FREE, true );

    }

    /**
     * Whether a license permits access to a given ability.
     *
     * @param string                 $ability_id Full ability name.
     * @param Maxi_AI_License_Status $license    Current license status.
     * @return bool True if the ability is ALWAYS_FREE or its
     *              feature_group is in the license's entitlements.
     */
    public static function grants_access( string $ability_id, Maxi_AI_License_Status $license ): bool {

        $group = self::get_feature_group( $ability_id );

        if ( $group === null ) {
            // Untagged abilities default to denied under a paid license
            // and granted if in ALWAYS_FREE (which a null group can't be).
            return false;
        }

        // ALWAYS_FREE groups bypass the license check entirely — no license
        // required to call session_system or licensing abilities.
        if ( in_array( $group, self::ALWAYS_FREE, true ) ) {
            return true;
        }

        // Paid groups require a valid license state AND entitlement membership.
        // Delegate to License_Status so both grants_access() and
        // grants_entitlement() share identical semantics.
        return $license->grants_entitlement( $group );

    }

    /**
     * Whether a feature group is granted only by the Pro plan (and not Lite).
     *
     * Used by the license gate to decide whether to prepend [PRO] to an
     * ability description during MCP discovery.
     *
     * @param string $group Feature group name.
     * @return bool
     */
    public static function is_pro_only_group( string $group ): bool {

        $lite_groups = self::PLANS['lite'] ?? [];
        $pro_groups  = self::PLANS['pro'] ?? [];

        if ( in_array( $group, self::ALWAYS_FREE, true ) ) {
            return false;
        }

        if ( in_array( $group, $lite_groups, true ) ) {
            return false;
        }

        return in_array( $group, $pro_groups, true );

    }

    /**
     * Categorized summary of shipped abilities by tier (for admin UI).
     *
     * Reads ability name + feature_group directly from the ability source
     * files on disk via `scan_ability_files()`. Does NOT invoke the WP
     * Abilities API. This is deliberate: calling `wp_get_abilities()` on
     * admin context triggers the one-shot `wp_abilities_api_init` hook
     * before other plugins (notably the vendored MCP adapter library)
     * have had a chance to attach their listeners, causing their
     * subsequent `wp_get_ability()` lookups to fail with
     * `_doing_it_wrong` notices. The file-scan avoids the registry entirely.
     *
     * Per-request cached via static variable.
     *
     * @return array{always_free: string[], lite: string[], pro_only: string[]}
     *   - always_free: session_system + licensing abilities (no license required)
     *   - lite:        abilities granted by Lite plan (also included in Pro)
     *   - pro_only:    abilities granted only by Pro plan (not Lite)
     */
    public static function get_summary(): array {

        static $cache = null;

        if ( $cache !== null ) {
            return $cache;
        }

        $always_free = [];
        $lite        = [];
        $pro_only    = [];

        foreach ( self::scan_ability_files() as $name => $group ) {

            if ( in_array( $group, self::ALWAYS_FREE, true ) ) {
                $always_free[] = $name;
            } elseif ( self::is_pro_only_group( $group ) ) {
                $pro_only[] = $name;
            } else {
                // In Lite (and therefore also in Pro).
                $lite[] = $name;
            }
        }

        sort( $always_free );
        sort( $lite );
        sort( $pro_only );

        return $cache = [
            'always_free' => $always_free,
            'lite'        => $lite,
            'pro_only'    => $pro_only,
        ];

    }

    /**
     * Scan the abilities/ directory and extract ability name + feature_group
     * from each file's wp_register_ability() call.
     *
     * Runs a regex over file contents — does NOT load the files into PHP or
     * invoke the WP Abilities API. Files that register categories (e.g.
     * `system/register-categories.php`) or that lack a feature_group tag are
     * silently skipped.
     *
     * @return array<string, string> Map of ability_name => feature_group.
     */
    private static function scan_ability_files(): array {

        $dir = dirname( __DIR__, 2 ) . '/abilities';

        if ( ! is_dir( $dir ) ) {
            return [];
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator( $dir, RecursiveDirectoryIterator::SKIP_DOTS )
        );

        $out = [];

        foreach ( $iterator as $file ) {

            if ( ! $file->isFile() || $file->getExtension() !== 'php' ) {
                continue;
            }

            $source = @file_get_contents( $file->getPathname() );

            if ( $source === false ) {
                continue;
            }

            // Ability name: first string argument to wp_register_ability(
            if ( ! preg_match( "/wp_register_ability\(\s*['\"]([^'\"]+)['\"]/", $source, $n ) ) {
                continue;
            }

            // Feature group: 'feature_group' => 'value'
            if ( ! preg_match( "/['\"]feature_group['\"]\s*=>\s*['\"]([^'\"]+)['\"]/", $source, $g ) ) {
                continue;
            }

            $out[ $n[1] ] = $g[1];
        }

        return $out;

    }

    /**
     * Read the meta array from a WP_Ability instance.
     *
     * WP_Ability exposes meta via a protected property with no public
     * accessor in the initial draft of the Abilities API. Use reflection
     * as a fallback. Mirrors the approach already used by
     * Maxi_AI_License_Gate for execute_callback access.
     *
     * @param WP_Ability $ability Ability instance.
     * @return array Meta array, or [] on failure.
     */
    private static function read_meta( WP_Ability $ability ): array {

        // Public getter if it exists (forward-compat).
        if ( method_exists( $ability, 'get_meta' ) ) {
            $meta = $ability->get_meta();
            return is_array( $meta ) ? $meta : [];
        }

        // Reflection fallback.
        try {
            $ref  = new ReflectionClass( $ability );

            if ( ! $ref->hasProperty( 'meta' ) ) {
                return [];
            }

            $prop = $ref->getProperty( 'meta' );
            $prop->setAccessible( true );

            $meta = $prop->getValue( $ability );

            return is_array( $meta ) ? $meta : [];

        } catch ( ReflectionException $e ) {
            return [];
        }

    }

}
