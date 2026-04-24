<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Key audit service for Maxi AI.
 *
 * Thin wrapper over Maxi_AI_Audit_Log for provider-credential events:
 * rotation, validation failures, settings-page writes, and hot-path
 * last-used-at tracking.
 *
 * Storage layout:
 * - Key metadata (created_at, last_rotated_at) lives inside the autoloaded
 *   `maxi_ai_settings` option under the `{$provider}_api_key_meta` sub-key.
 *   We're already loading that option on every request, so piggybacking is free.
 * - Hot-path `last_used_at` / `last_error_at` writes go into a SEPARATE
 *   non-autoloaded option `maxi_ai_key_usage` so provider calls don't churn
 *   the autoloaded settings blob.
 * - Durable event history (rotated, validation_failed, updated_via_settings)
 *   goes into the `maxi_ai_audit_log` table via Maxi_AI_Audit_Log::record().
 */
class Maxi_AI_Key_Audit {

    const USAGE_OPTION   = 'maxi_ai_key_usage';
    const STALE_DAYS     = 180;

    /**
     * Providers whose credentials are tracked. Kept in sync with
     * Maxi_AI_Config defaults + factory registrations.
     */
    const PROVIDERS = [ 'openai', 'anthropic', 'openrouter', 'replicate', 'bfl', 'local' ];

    /**
     * Map provider → settings key for the credential itself.
     *
     * @return array<string,string>
     */
    public static function key_fields() {

        return [
            'openai'     => 'openai_api_key',
            'anthropic'  => 'anthropic_api_key',
            'openrouter' => 'openrouter_api_key',
            'replicate'  => 'replicate_api_key',
            'bfl'        => 'bfl_api_key',
            'local'      => 'local_endpoint',
        ];

    }

    /**
     * Mask a key for display / logging.
     *
     * @param string $key Raw key.
     * @return string
     */
    public static function mask( $key ) {

        $key = (string) $key;

        if ( $key === '' ) {
            return '';
        }

        if ( strlen( $key ) <= 12 ) {
            return str_repeat( '*', max( 0, strlen( $key ) - 2 ) ) . substr( $key, -2 );
        }

        return substr( $key, 0, 8 ) . '...' . substr( $key, -4 );

    }

    /**
     * Record a successful provider call against the usage option.
     *
     * Called from Maxi_AI_Client on every 2xx response. Must be cheap —
     * it writes to a single non-autoloaded option.
     *
     * @param string $provider Provider identifier.
     */
    public static function touch( $provider ) {

        if ( ! in_array( $provider, self::PROVIDERS, true ) ) {
            return;
        }

        $usage = self::get_usage();
        $now   = current_time( 'mysql', true );

        $usage[ $provider ]                    = $usage[ $provider ] ?? [];
        $usage[ $provider ]['last_used_at']    = $now;
        $usage[ $provider ]['last_success_at'] = $now;

        self::save_usage( $usage );

    }

    /**
     * Record a failed provider call against the usage option.
     *
     * @param string $provider Provider identifier.
     * @param string $error    Short error message.
     */
    public static function touch_error( $provider, $error = '' ) {

        if ( ! in_array( $provider, self::PROVIDERS, true ) ) {
            return;
        }

        $usage = self::get_usage();
        $now   = current_time( 'mysql', true );

        $usage[ $provider ]                  = $usage[ $provider ] ?? [];
        $usage[ $provider ]['last_used_at']  = $now;
        $usage[ $provider ]['last_error_at'] = $now;
        $usage[ $provider ]['last_error']    = substr( (string) $error, 0, 500 );

        self::save_usage( $usage );

    }

    /**
     * Rotate a provider credential.
     *
     * Steps:
     * 1. Validate the new credential with a live test_key() call.
     * 2. On success: write the new key into maxi_ai_settings, stamp
     *    last_rotated_at in the meta sub-key, flush config cache, log
     *    a 'rotated' audit event.
     * 3. On failure: leave the old key in place, log a 'validation_failed'
     *    audit event, return the WP_Error.
     *
     * @param string $provider Provider identifier.
     * @param string $new_key  New credential value.
     * @param int    $actor_id WP user ID performing the rotation.
     * @return array|WP_Error { provider, old_prefix, new_prefix, rotated_at }.
     */
    public static function rotate( $provider, $new_key, $actor_id = 0 ) {

        $provider = sanitize_key( $provider );

        if ( ! in_array( $provider, self::PROVIDERS, true ) ) {
            return new WP_Error( 'unknown_provider', 'Unknown provider: ' . $provider );
        }

        $new_key = is_string( $new_key ) ? trim( $new_key ) : '';

        if ( $new_key === '' ) {
            return new WP_Error( 'missing_key', 'New key is required.' );
        }

        $instance = Maxi_AI_Provider_Factory::create( $provider );

        if ( is_wp_error( $instance ) ) {
            return $instance;
        }

        // 1. Validate against provider.
        $validation = $instance->test_key( $new_key );

        if ( is_wp_error( $validation ) ) {

            Maxi_AI_Audit_Log::record(
                'key',
                'validation_failed',
                (int) $actor_id,
                self::mask( $new_key ),
                [
                    'provider' => $provider,
                    'error'    => $validation->get_error_message(),
                ]
            );

            return $validation;
        }

        // 2. Load current settings and swap the key.
        $settings = get_option( 'maxi_ai_settings', [] );
        $settings = is_array( $settings ) ? $settings : [];

        $fields    = self::key_fields();
        $field     = $fields[ $provider ];
        $old_value = isset( $settings[ $field ] ) ? (string) $settings[ $field ] : '';
        $old_mask  = self::mask( $old_value );

        // Encrypt the new key before persisting to the database.
        if ( class_exists( 'Maxi_AI_Key_Encryption' ) ) {
            $settings[ $field ] = Maxi_AI_Key_Encryption::encrypt( $new_key );
        } else {
            $settings[ $field ] = $new_key;
        }

        $meta_field = $field . '_meta';
        $meta       = isset( $settings[ $meta_field ] ) && is_array( $settings[ $meta_field ] )
            ? $settings[ $meta_field ]
            : [];

        $now = current_time( 'mysql', true );

        if ( empty( $meta['created_at'] ) ) {
            $meta['created_at'] = $now;
        }

        $meta['last_rotated_at']   = $now;
        $settings[ $meta_field ]   = $meta;

        update_option( 'maxi_ai_settings', $settings );
        Maxi_AI_Config::flush();

        // 3. Audit log.
        Maxi_AI_Audit_Log::record(
            'key',
            'rotated',
            (int) $actor_id,
            self::mask( $new_key ),
            [
                'provider'   => $provider,
                'old_prefix' => $old_mask,
                'new_prefix' => self::mask( $new_key ),
            ]
        );

        return [
            'provider'   => $provider,
            'old_prefix' => $old_mask,
            'new_prefix' => self::mask( $new_key ),
            'rotated_at' => $now,
        ];

    }

    /**
     * Record a settings-page write of a credential. Called from
     * `update-ai-settings` ability when any *_api_key / local_endpoint is
     * updated via that legacy path (no live validation, just bookkeeping).
     *
     * @param string $provider Provider identifier.
     * @param string $new_key  New credential value (post-sanitization).
     * @param int    $actor_id WP user ID.
     */
    public static function record_settings_update( $provider, $new_key, $actor_id = 0 ) {

        if ( ! in_array( $provider, self::PROVIDERS, true ) ) {
            return;
        }

        // Stamp last_rotated_at in meta.
        $settings = get_option( 'maxi_ai_settings', [] );
        $settings = is_array( $settings ) ? $settings : [];

        $fields     = self::key_fields();
        $field      = $fields[ $provider ];
        $meta_field = $field . '_meta';
        $meta       = isset( $settings[ $meta_field ] ) && is_array( $settings[ $meta_field ] )
            ? $settings[ $meta_field ]
            : [];

        $now = current_time( 'mysql', true );

        if ( empty( $meta['created_at'] ) ) {
            $meta['created_at'] = $now;
        }

        $meta['last_rotated_at'] = $now;
        $settings[ $meta_field ] = $meta;

        update_option( 'maxi_ai_settings', $settings );

        Maxi_AI_Audit_Log::record(
            'key',
            'updated_via_settings',
            (int) $actor_id,
            self::mask( $new_key ),
            [ 'provider' => $provider ]
        );

    }

    /**
     * Get per-provider status for the list-provider-keys ability.
     *
     * @return array<int,array>
     */
    public static function get_status() {

        $settings = Maxi_AI_Config::all();
        $usage    = self::get_usage();
        $fields   = self::key_fields();
        $now      = time();

        $out = [];

        foreach ( self::PROVIDERS as $provider ) {

            $field = $fields[ $provider ];
            $value = isset( $settings[ $field ] ) ? (string) $settings[ $field ] : '';

            $meta = isset( $settings[ $field . '_meta' ] ) && is_array( $settings[ $field . '_meta' ] )
                ? $settings[ $field . '_meta' ]
                : [];

            $age_days = null;
            $stale    = false;

            if ( ! empty( $meta['last_rotated_at'] ) ) {
                $ts = strtotime( $meta['last_rotated_at'] );
                if ( $ts ) {
                    $age_days = (int) floor( ( $now - $ts ) / DAY_IN_SECONDS );
                    $stale    = $age_days > self::STALE_DAYS;
                }
            }

            $provider_usage = $usage[ $provider ] ?? [];

            $out[] = [
                'provider'        => $provider,
                'is_set'          => $value !== '',
                'key_prefix'      => self::mask( $value ),
                'created_at'      => $meta['created_at'] ?? null,
                'last_rotated_at' => $meta['last_rotated_at'] ?? null,
                'age_days'        => $age_days,
                'stale'           => $stale,
                'last_used_at'    => $provider_usage['last_used_at'] ?? null,
                'last_success_at' => $provider_usage['last_success_at'] ?? null,
                'last_error_at'   => $provider_usage['last_error_at'] ?? null,
                'last_error'      => $provider_usage['last_error'] ?? null,
            ];
        }

        return $out;

    }

    /**
     * Detect which provider (if any) owns a given outbound URL. Used by the
     * HTTP client to auto-touch last_used_at without threading a provider
     * argument through every call site.
     *
     * @param string $url Outbound URL.
     * @return string|null Provider identifier, or null if unknown.
     */
    public static function detect_provider_from_url( $url ) {

        if ( ! is_string( $url ) || $url === '' ) {
            return null;
        }

        $host = wp_parse_url( $url, PHP_URL_HOST );
        if ( ! $host ) {
            return null;
        }

        $host = strtolower( $host );

        if ( strpos( $host, 'api.openai.com' ) !== false ) {
            return 'openai';
        }
        if ( strpos( $host, 'api.anthropic.com' ) !== false ) {
            return 'anthropic';
        }
        if ( strpos( $host, 'openrouter.ai' ) !== false ) {
            return 'openrouter';
        }
        if ( strpos( $host, 'api.replicate.com' ) !== false ) {
            return 'replicate';
        }
        if ( strpos( $host, 'api.bfl.ai' ) !== false || strpos( $host, 'api.us1.bfl.ai' ) !== false ) {
            return 'bfl';
        }

        // Local endpoint match against the configured URL host.
        $local = (string) Maxi_AI_Config::get( 'local_endpoint', '' );
        if ( $local !== '' ) {
            $local_host = wp_parse_url( $local, PHP_URL_HOST );
            if ( $local_host && strcasecmp( $local_host, $host ) === 0 ) {
                return 'local';
            }
        }

        return null;

    }

    /**
     * Load the non-autoloaded usage option.
     *
     * @return array
     */
    private static function get_usage() {

        $usage = get_option( self::USAGE_OPTION, [] );

        return is_array( $usage ) ? $usage : [];

    }

    /**
     * Persist the usage option. Created with autoload=false on first write.
     *
     * @param array $usage Usage data.
     */
    private static function save_usage( $usage ) {

        // update_option will create the option if missing; pass false for autoload.
        update_option( self::USAGE_OPTION, $usage, false );

    }

}
