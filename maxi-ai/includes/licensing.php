<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Maxi AI — Licensing entry point.
 *
 * Loads all licensing sub-files in dependency order and registers
 * the default provider. Auto-loaded by Maxi_AI::load_includes()
 * via glob('includes/*.php').
 *
 * @see includes/ai.php for the same loading pattern.
 */

$licensing_dir = __DIR__ . '/licensing';

// 1. Value objects and interfaces (no dependencies).
require_once $licensing_dir . '/interface-license-provider.php';
require_once $licensing_dir . '/class-license-status.php';

// 2. Tier classification (no dependencies).
require_once $licensing_dir . '/class-license-tiers.php';

// 3. License manager (depends on status, tiers, provider interface).
require_once $licensing_dir . '/class-license-manager.php';

// 4. Provider implementations (depend on interface + status).
foreach ( glob( $licensing_dir . '/providers/class-*.php' ) as $provider_file ) {
    require_once $provider_file;
}

// 5. License gate (depends on manager + tiers). Hooks into wp_abilities_api_init.
require_once $licensing_dir . '/class-license-gate.php';

// 6. Plugin update checker (depends on manager).
require_once $licensing_dir . '/class-license-updater.php';

// 7. Admin UI (depends on manager + tiers). Only in admin context.
if ( is_admin() ) {
    require_once $licensing_dir . '/class-license-admin.php';
}

/**
 * Register built-in license providers.
 */
add_action( 'init', function () {

    // Guard against deploy race conditions: files may be mid-write when
    // OPcache serves a stale (empty) version during plugin updates.
    if ( class_exists( 'Maxi_AI_Provider_Self_Hosted' ) ) {
        Maxi_AI_License_Manager::register_provider(
            'self-hosted',
            new Maxi_AI_Provider_Self_Hosted()
        );
    }

    /**
     * Action to register additional license providers.
     *
     * Third-party plugins can hook here to register their own provider:
     *
     *   add_action( 'maxi_ai_register_license_providers', function () {
     *       Maxi_AI_License_Manager::register_provider( 'custom', new My_Custom_Provider() );
     *   } );
     */
    do_action( 'maxi_ai_register_license_providers' );

}, 4 ); // Priority 4: before AI providers at 5.
