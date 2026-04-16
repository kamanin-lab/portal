<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Centralized configuration for Maxi AI.
 *
 * Wraps get_option( 'maxi_ai_settings' ) with typed getters.
 */
class Maxi_AI_Config {

    /**
     * Cached settings array.
     *
     * @var array|null
     */
    private static $settings = null;

    /**
     * Fields that contain API credentials and must be encrypted at rest.
     *
     * @var array
     */
    private const ENCRYPTED_FIELDS = [
        'openai_api_key',
        'anthropic_api_key',
        'replicate_api_key',
        'bfl_api_key',
    ];

    /**
     * Default configuration values.
     *
     * @var array
     */
    private static $defaults = [
        // Per-capability provider defaults.
        'provider_image'      => 'openai',
        'provider_edit_image' => 'openai',
        'provider_text'       => 'openai',
        'provider_vision'     => 'openai',

        // Provider fallback order per capability.
        'fallback_image'      => [ 'openai', 'bfl', 'replicate' ],
        'fallback_edit_image' => [ 'openai', 'bfl', 'replicate' ],
        'fallback_text'       => [ 'openai', 'anthropic', 'local' ],
        'fallback_vision'     => [ 'openai', 'anthropic' ],

        // Provider API keys.
        'openai_api_key'      => '',
        'openai_org_id'       => '',
        'anthropic_api_key'   => '',
        'replicate_api_key'   => '',
        'bfl_api_key'         => '',
        'local_endpoint'      => '',

        // Retry configuration.
        'retry_max_attempts'  => 3,
        'retry_base_delay'    => 5,
        'retry_max_delay'     => 300,

        // Batch / worker configuration.
        'max_items_per_run'   => 5,
        'max_jobs_per_run'    => 3,
        'max_runtime'         => 50,

        // HTTP client.
        'http_timeout'        => 60,
    ];

    /**
     * Get all settings merged with defaults.
     *
     * @return array
     */
    public static function all() {

        if ( self::$settings === null ) {
            $stored = get_option( 'maxi_ai_settings', [] );
            $stored = is_array( $stored ) ? $stored : [];

            // Migration: flux_api_key → replicate_api_key (one-time).
            if ( ! empty( $stored['flux_api_key'] ) && empty( $stored['replicate_api_key'] ) ) {
                $stored['replicate_api_key'] = $stored['flux_api_key'];
                unset( $stored['flux_api_key'] );
                update_option( 'maxi_ai_settings', $stored );
                maxi_ai_log( 'Migrated flux_api_key → replicate_api_key.', 'warning', [ 'component' => 'config' ] );
            } elseif ( isset( $stored['flux_api_key'] ) ) {
                // Clean up deprecated key if replicate key already exists.
                unset( $stored['flux_api_key'] );
                update_option( 'maxi_ai_settings', $stored );
            }

            // Decrypt API keys and auto-migrate legacy plaintext values.
            if ( class_exists( 'Maxi_AI_Key_Encryption' ) ) {
                $raw_for_save = null;

                foreach ( self::ENCRYPTED_FIELDS as $field ) {
                    if ( empty( $stored[ $field ] ) ) {
                        continue;
                    }

                    if ( Maxi_AI_Key_Encryption::is_encrypted( $stored[ $field ] ) ) {
                        // Decrypt for in-memory use; DB stays encrypted.
                        $stored[ $field ] = Maxi_AI_Key_Encryption::decrypt( $stored[ $field ] );
                    } else {
                        // Legacy plaintext — encrypt in place (one-time migration).
                        if ( null === $raw_for_save ) {
                            $raw_for_save = get_option( 'maxi_ai_settings', [] );
                            $raw_for_save = is_array( $raw_for_save ) ? $raw_for_save : [];
                        }

                        $raw_for_save[ $field ] = Maxi_AI_Key_Encryption::encrypt( $stored[ $field ] );
                        // $stored[$field] remains plaintext for this request's in-memory cache.
                    }
                }

                if ( null !== $raw_for_save ) {
                    update_option( 'maxi_ai_settings', $raw_for_save );
                    maxi_ai_log(
                        'Auto-migrated plaintext API keys to encrypted storage.',
                        'info',
                        [ 'component' => 'encryption' ]
                    );
                }
            }

            self::$settings = wp_parse_args( $stored, self::$defaults );
        }

        return self::$settings;

    }

    /**
     * Get a single setting value.
     *
     * @param string $key     Setting key.
     * @param mixed  $default Fallback if key not found.
     * @return mixed
     */
    public static function get( $key, $default = null ) {

        $settings = self::all();

        return $settings[ $key ] ?? $default ?? ( self::$defaults[ $key ] ?? null );

    }

    /**
     * Get the default provider for a capability.
     *
     * @param string $capability 'image', 'text', or 'vision'.
     * @return string Provider name.
     */
    public static function get_provider_for( $capability ) {

        return self::get( 'provider_' . $capability, 'openai' );

    }

    /**
     * Get the fallback provider list for a capability.
     *
     * @param string $capability 'image', 'text', or 'vision'.
     * @return array Provider names in fallback order.
     */
    public static function get_fallback_order( $capability ) {

        $fallback = self::get( 'fallback_' . $capability, [] );

        return is_array( $fallback ) ? $fallback : [];

    }

    /**
     * Clear cached settings (useful after option update).
     */
    public static function flush() {

        self::$settings = null;

    }

}
