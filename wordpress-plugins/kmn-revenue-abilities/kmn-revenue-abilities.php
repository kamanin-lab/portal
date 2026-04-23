<?php
/*
Plugin Name: KMN Revenue Abilities
Description: WooCommerce revenue-analytics aggregations exposed via MCP (WP Abilities API + wordpress/mcp-adapter). Consumed by the kamanda-mcp server for KAMANIN Portal. No abilities registered in this version — see Phase 16.
Version: 0.1.0
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

// Composer autoload for wordpress/mcp-adapter (populated by `composer install` inside DDEV).
if ( file_exists( __DIR__ . '/vendor/autoload.php' ) ) {
    require_once __DIR__ . '/vendor/autoload.php';
}

final class KMN_Revenue_Abilities {

    const VERSION = '0.1.0';
    const MIN_WP  = '6.9';

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

        // Phase 16 will require ability files from abilities/ and the MCP server
        // bootstrap from bootstrap/register-mcp-server.php here.
        // For Phase 15 this plugin is intentionally a no-op shell.

    }

    public static function notice_wp_too_old() {
        echo '<div class="notice notice-error"><p>KMN Revenue Abilities requires WordPress ' . esc_html( self::MIN_WP ) . ' or newer.</p></div>';
    }

    public static function notice_wc_missing() {
        echo '<div class="notice notice-error"><p>KMN Revenue Abilities requires WooCommerce to be installed and active.</p></div>';
    }

    public static function activate() {
        // No-op in Phase 15. Phase 16 may flush rewrite rules after registering the MCP server.
    }

    public static function deactivate() {
        // No-op.
    }

}

register_activation_hook( __FILE__, [ 'KMN_Revenue_Abilities', 'activate' ] );
register_deactivation_hook( __FILE__, [ 'KMN_Revenue_Abilities', 'deactivate' ] );
add_action( 'plugins_loaded', [ 'KMN_Revenue_Abilities', 'init' ] );
