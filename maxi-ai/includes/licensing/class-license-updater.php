<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Plugin update checker for Maxi AI.
 *
 * Hooks into WordPress's plugin update transient to check for new versions
 * from a custom update server. Licensed sites get updates from the custom
 * server; unlicensed sites can optionally receive updates from wordpress.org
 * (if listed there).
 *
 * The update server endpoint is expected to return a JSON response:
 *
 *   {
 *     "version":       "3.4.0",
 *     "download_url":  "https://...",
 *     "slug":          "maxi-ai",
 *     "requires":      "6.0",
 *     "tested":        "6.7",
 *     "requires_php":  "7.4",
 *     "changelog":     "<h4>3.4.0</h4><ul><li>...</li></ul>"
 *   }
 *
 * @package Maxi_AI
 */
final class Maxi_AI_License_Updater {

    /**
     * Plugin basename (e.g. 'maxi-ai/maxi-ai.php').
     */
    const PLUGIN_BASENAME = 'maxi-ai/maxi-ai.php';

    /**
     * Plugin slug.
     */
    const PLUGIN_SLUG = 'maxi-ai';

    /**
     * Default update server URL.
     * Override with MAXI_AI_UPDATE_URL constant.
     */
    const DEFAULT_UPDATE_URL = 'https://api.maxiweb.si/v1/updates/check';

    /**
     * Cache transient key.
     */
    const CACHE_KEY = 'maxi_ai_update_check';

    /**
     * Cache TTL in seconds (6 hours).
     */
    const CACHE_TTL = 21600;

    /**
     * Register hooks.
     */
    public static function init(): void {

        add_filter( 'pre_set_site_transient_update_plugins', [ self::class, 'check_for_update' ] );
        add_filter( 'plugins_api', [ self::class, 'plugin_info' ], 20, 3 );
        add_action( 'upgrader_process_complete', [ self::class, 'clear_cache' ], 10, 0 );

    }

    /**
     * Check the custom update server for a new version.
     *
     * @param object $transient The update_plugins transient.
     * @return object Modified transient.
     */
    public static function check_for_update( $transient ) {

        if ( empty( $transient->checked ) ) {
            return $transient;
        }

        $current_version = $transient->checked[ self::PLUGIN_BASENAME ] ?? Maxi_AI::VERSION;

        $remote = self::get_remote_info();

        if ( $remote === null ) {
            return $transient;
        }

        $remote_version = $remote['version'] ?? '';

        if ( empty( $remote_version ) || version_compare( $current_version, $remote_version, '>=' ) ) {
            // No update available, but register as "no_update" so WP knows we checked.
            if ( ! isset( $transient->no_update[ self::PLUGIN_BASENAME ] ) ) {
                $transient->no_update[ self::PLUGIN_BASENAME ] = (object) [
                    'id'            => self::PLUGIN_BASENAME,
                    'slug'          => self::PLUGIN_SLUG,
                    'plugin'        => self::PLUGIN_BASENAME,
                    'new_version'   => $current_version,
                    'url'           => '',
                    'package'       => '',
                ];
            }

            return $transient;
        }

        // Update available.
        $transient->response[ self::PLUGIN_BASENAME ] = (object) [
            'id'            => self::PLUGIN_BASENAME,
            'slug'          => self::PLUGIN_SLUG,
            'plugin'        => self::PLUGIN_BASENAME,
            'new_version'   => $remote_version,
            'url'           => $remote['homepage'] ?? '',
            'package'       => $remote['download_url'] ?? '',
            'requires'      => $remote['requires'] ?? '6.0',
            'tested'        => $remote['tested'] ?? '',
            'requires_php'  => $remote['requires_php'] ?? '7.4',
        ];

        return $transient;

    }

    /**
     * Provide plugin info for the "View Details" modal.
     *
     * @param false|object|array $result The result object or array.
     * @param string             $action The API action being performed.
     * @param object             $args   Plugin API arguments.
     * @return false|object
     */
    public static function plugin_info( $result, $action, $args ) {

        if ( $action !== 'plugin_information' ) {
            return $result;
        }

        if ( ! isset( $args->slug ) || $args->slug !== self::PLUGIN_SLUG ) {
            return $result;
        }

        $remote = self::get_remote_info();

        if ( $remote === null ) {
            return $result;
        }

        return (object) [
            'name'          => 'Maxi AI Core',
            'slug'          => self::PLUGIN_SLUG,
            'version'       => $remote['version'] ?? '',
            'author'        => '<a href="https://maxiweb.si">Maxi Web</a>',
            'homepage'      => $remote['homepage'] ?? 'https://maxiweb.si',
            'requires'      => $remote['requires'] ?? '6.0',
            'tested'        => $remote['tested'] ?? '',
            'requires_php'  => $remote['requires_php'] ?? '7.4',
            'downloaded'    => 0,
            'last_updated'  => $remote['last_updated'] ?? '',
            'sections'      => [
                'description' => $remote['description'] ?? 'AI agent infrastructure for WordPress.',
                'changelog'   => $remote['changelog'] ?? '',
            ],
            'download_link' => $remote['download_url'] ?? '',
            'banners'       => [],
        ];

    }

    /**
     * Clear the update cache after an upgrade.
     */
    public static function clear_cache(): void {

        delete_transient( self::CACHE_KEY );

    }

    // ------------------------------------------------------------------
    // Internal helpers.
    // ------------------------------------------------------------------

    /**
     * Get the remote update info (cached).
     *
     * @return array|null Update info or null on failure.
     */
    private static function get_remote_info(): ?array {

        $cached = get_transient( self::CACHE_KEY );

        if ( is_array( $cached ) ) {
            return $cached;
        }

        $url = defined( 'MAXI_AI_UPDATE_URL' )
            ? MAXI_AI_UPDATE_URL
            : self::DEFAULT_UPDATE_URL;

        $settings    = get_option( 'maxi_ai_settings', [] );
        $license_key = $settings[ Maxi_AI_License_Manager::SETTING_KEY ] ?? '';

        $response = wp_remote_get( add_query_arg( [
            'slug'        => self::PLUGIN_SLUG,
            'version'     => Maxi_AI::VERSION,
            'license_key' => $license_key,
            'domain'      => Maxi_AI_License_Manager::get_domain(),
            'php'         => phpversion(),
            'wp'          => get_bloginfo( 'version' ),
        ], $url ), [
            'timeout' => 10,
            'headers' => [ 'Accept' => 'application/json' ],
        ] );

        if ( is_wp_error( $response ) ) {
            return null;
        }

        $code = wp_remote_retrieve_response_code( $response );

        if ( $code !== 200 ) {
            return null;
        }

        $body = json_decode( wp_remote_retrieve_body( $response ), true );

        if ( ! is_array( $body ) || empty( $body['version'] ) ) {
            return null;
        }

        set_transient( self::CACHE_KEY, $body, self::CACHE_TTL );

        return $body;

    }

    /**
     * Get the update server URL.
     *
     * @return string
     */
    public static function get_update_url(): string {

        return defined( 'MAXI_AI_UPDATE_URL' )
            ? MAXI_AI_UPDATE_URL
            : self::DEFAULT_UPDATE_URL;

    }

}

Maxi_AI_License_Updater::init();
