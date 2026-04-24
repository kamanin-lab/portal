<?php
/*
Plugin Name: KMN Revenue Abilities
Description: WooCommerce revenue-analytics aggregations exposed via MCP (WP Abilities API + wordpress/mcp-adapter). Consumed by the kamanda-mcp server for KAMANIN Portal.
Version: 0.5.0
Author: KAMANIN IT Solutions
Author URI: https://kamanin.at
License: GPL-2.0+
License URI: https://www.gnu.org/licenses/gpl-2.0.html
Requires at least: 6.9
Requires PHP: 8.1
*/

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Composer autoload for wordpress/mcp-adapter (populated by `composer install`
// inside DDEV). Standard WP plugin convention: vendor/ is committed with the
// plugin so activation doesn't require composer on the target host.
if ( file_exists( __DIR__ . '/vendor/autoload.php' ) ) {
    require_once __DIR__ . '/vendor/autoload.php';
}

final class KMN_Revenue_Abilities {

    const VERSION     = '0.5.0';
    const MIN_WP      = '6.9';
    const ABILITY_NS  = 'kmn/';

    public static function init() {

        // WordPress version guard — refuse to load on older cores.
        if ( version_compare( $GLOBALS['wp_version'], self::MIN_WP, '<' ) ) {
            add_action( 'admin_notices', [ __CLASS__, 'notice_wp_too_old' ] );
            deactivate_plugins( plugin_basename( __FILE__ ) );
            return;
        }

        // WooCommerce dependency guard — plugin is useless without WC.
        if ( ! class_exists( 'WooCommerce' ) ) {
            add_action( 'admin_notices', [ __CLASS__, 'notice_wc_missing' ] );
            deactivate_plugins( plugin_basename( __FILE__ ) );
            return;
        }

        self::load_includes();
        self::load_bootstrap();
        self::load_abilities();

    }

    /**
     * Load every helper file under includes/ exactly once.
     *
     * Mirrors maxi-ai/maxi-ai.php:35-49. Files are sorted so any
     * order-sensitive defines (e.g. TTL constants before cached()) resolve
     * deterministically. Net effect equivalent to explicit
     * `require_once __DIR__ . '/includes/<name>.php'` lines.
     */
    private static function load_includes(): void {

        $files = glob( __DIR__ . '/includes/*.php' );

        if ( empty( $files ) ) {
            return;
        }

        sort( $files );

        foreach ( $files as $file ) {
            require_once $file;
        }

    }

    /**
     * Load bootstrap/*.php files — these hook into third-party actions
     * like mcp_adapter_init and must be present before rest_api_init
     * priority 15 fires.
     */
    private static function load_bootstrap(): void {

        $files = glob( __DIR__ . '/bootstrap/*.php' );

        if ( empty( $files ) ) {
            return;
        }

        sort( $files );

        foreach ( $files as $file ) {
            require_once $file;
        }

    }

    /**
     * Defer ability file loading to contexts that actually need them.
     *
     * Ability files register hooks on `wp_abilities_api_init`, which only
     * fires for REST / MCP / WP-CLI requests. Loading them eagerly on
     * every admin pageview wastes require_once calls and memory.
     *
     * - REST / MCP: load on `rest_api_init` priority 0 — well before the
     *   MCP adapter triggers wp_abilities_api_init at priority 15.
     * - WP-CLI:     load eagerly so `wp kmn ability list` sees them.
     * - Admin / frontend / cron: never loaded.
     */
    private static function load_abilities(): void {

        if ( defined( 'WP_CLI' ) && WP_CLI ) {
            self::require_ability_files();
            return;
        }

        add_action( 'rest_api_init', [ self::class, 'require_ability_files' ], 0 );

    }

    /**
     * require_once every abilities/*.php file. Guarded against double
     * loading so multiple entry points can't produce duplicate
     * registrations.
     *
     * In Plan 16-01 the abilities/ directory does not yet exist — the
     * glob returns an empty array, no files are required, and downstream
     * callers (create_server()'s $tools list) receive the adapter's
     * standard "missing ability" warning for each unregistered id.
     *
     * @internal
     */
    public static function require_ability_files(): void {

        static $loaded = false;

        if ( $loaded ) {
            return;
        }

        $loaded = true;

        $dir = __DIR__ . '/abilities';

        if ( ! is_dir( $dir ) ) {
            return;
        }

        foreach ( glob( $dir . '/*.php' ) as $file ) {
            require_once $file;
        }

    }

    public static function notice_wp_too_old() {
        echo '<div class="notice notice-error"><p>KMN Revenue Abilities requires WordPress ' . esc_html( self::MIN_WP ) . ' or newer.</p></div>';
    }

    public static function notice_wc_missing() {
        echo '<div class="notice notice-error"><p>KMN Revenue Abilities requires WooCommerce to be installed and active.</p></div>';
    }

    public static function activate() {
        // Future: flush rewrite rules after registering MCP server routes.
        // Safe to remain a no-op for now — MCP Adapter registers its own
        // REST routes on rest_api_init which is covered by the normal
        // post-activation page load.
    }

    public static function deactivate() {
        // No-op.
    }

}

register_activation_hook( __FILE__, [ 'KMN_Revenue_Abilities', 'activate' ] );
register_deactivation_hook( __FILE__, [ 'KMN_Revenue_Abilities', 'deactivate' ] );
add_action( 'plugins_loaded', [ 'KMN_Revenue_Abilities', 'init' ] );
