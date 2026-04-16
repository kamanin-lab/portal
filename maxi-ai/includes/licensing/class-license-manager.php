<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Maxi AI License Manager.
 *
 * Central orchestrator for license validation, activation, and deactivation.
 * Delegates to the configured provider and caches status in a WordPress
 * transient. All license events are recorded in the audit log.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_License_Manager {

    /**
     * Transient key for cached license status.
     */
    const TRANSIENT_KEY = 'maxi_ai_license_status';

    /**
     * Settings keys within the maxi_ai_settings option.
     */
    const SETTING_KEY          = 'license_key';
    const SETTING_PROVIDER     = 'license_provider';
    const SETTING_INSTANCE_ID  = 'license_instance_id';

    /**
     * Default cache TTL in seconds (12 hours).
     * Override via MAXI_AI_LICENSE_CHECK_INTERVAL constant.
     */
    const DEFAULT_TTL = 43200;

    /**
     * Grace period duration in days.
     */
    const GRACE_PERIOD_DAYS = 7;

    /**
     * Maximum consecutive validation failures before warning.
     */
    const MAX_FAIL_COUNT = 3;

    /**
     * Extended cache TTL when remote validation fails (24 hours).
     */
    const FAILURE_EXTEND_TTL = 86400;

    /**
     * Audit log category.
     */
    const AUDIT_CATEGORY = 'license';

    /**
     * Registered provider instances, keyed by slug.
     *
     * @var array<string, Maxi_AI_License_Provider>
     */
    private static $providers = [];

    /**
     * Cached status object for the current request.
     *
     * @var Maxi_AI_License_Status|null
     */
    private static $cached_status = null;

    /**
     * Register a license provider.
     *
     * @param string                   $slug     Provider slug.
     * @param Maxi_AI_License_Provider $provider Provider instance.
     */
    public static function register_provider( string $slug, Maxi_AI_License_Provider $provider ): void {

        self::$providers[ $slug ] = $provider;

    }

    /**
     * Get the list of registered provider slugs.
     *
     * @return string[]
     */
    public static function get_registered_providers(): array {

        return array_keys( self::$providers );

    }

    /**
     * Get the currently configured provider instance.
     *
     * @return Maxi_AI_License_Provider|null Null if no provider is configured or registered.
     */
    public static function get_provider(): ?Maxi_AI_License_Provider {

        // Allow overriding the provider via constant.
        if ( defined( 'MAXI_AI_LICENSE_PROVIDER' ) && ! empty( MAXI_AI_LICENSE_PROVIDER ) ) {
            $slug = MAXI_AI_LICENSE_PROVIDER;
        } else {
            $slug = self::get_setting( self::SETTING_PROVIDER, 'self-hosted' );
        }

        return self::$providers[ $slug ] ?? null;

    }

    /**
     * Check whether the site has an active pro license.
     *
     * This is the primary method used by the license gate.
     * Checks cache first, refreshes only when expired.
     *
     * @return bool
     */
    public static function is_pro(): bool {

        $status = self::get_status();

        return $status->grants_pro();

    }

    /**
     * Get the current license status.
     *
     * Returns cached status from the in-memory cache or transient.
     * If both are missing, returns inactive (no automatic remote call).
     *
     * @return Maxi_AI_License_Status
     */
    public static function get_status(): Maxi_AI_License_Status {

        // In-memory cache for the current request.
        if ( self::$cached_status !== null ) {
            return self::$cached_status;
        }

        // Check transient cache.
        $cached = get_transient( self::TRANSIENT_KEY );

        if ( is_array( $cached ) ) {
            self::$cached_status = Maxi_AI_License_Status::from_array( $cached );
            return self::$cached_status;
        }

        // No cache — check if we have a stored key and should re-validate.
        $key = self::get_setting( self::SETTING_KEY );

        if ( ! empty( $key ) ) {
            // We have a key but no cached status — refresh silently.
            $status = self::refresh();
            if ( $status !== null ) {
                return $status;
            }
        }

        // No key stored or refresh failed — return inactive.
        self::$cached_status = Maxi_AI_License_Status::inactive();

        return self::$cached_status;

    }

    /**
     * Activate a license key.
     *
     * Calls the provider's activate() method, stores the key and instance ID,
     * caches the result, and logs an audit event.
     *
     * @param string $license_key The license key to activate.
     * @param string $provider_slug Optional. Provider slug. Defaults to current.
     * @return Maxi_AI_License_Status
     */
    public static function activate( string $license_key, string $provider_slug = '' ): Maxi_AI_License_Status {

        $license_key = trim( $license_key );

        if ( empty( $license_key ) ) {
            return Maxi_AI_License_Status::invalid( 'License key cannot be empty.' );
        }

        // Resolve provider.
        if ( ! empty( $provider_slug ) && isset( self::$providers[ $provider_slug ] ) ) {
            $provider = self::$providers[ $provider_slug ];
        } else {
            $provider = self::get_provider();
        }

        if ( $provider === null ) {
            return Maxi_AI_License_Status::invalid( 'No license provider configured.' );
        }

        $domain = self::get_domain();
        $status = $provider->activate( $license_key, $domain );

        // Apply grace period logic.
        $status = self::apply_grace_period( $status );

        // Store key and instance ID.
        self::set_setting( self::SETTING_KEY, $license_key );
        self::set_setting( self::SETTING_PROVIDER, $provider->get_slug() );

        if ( ! empty( $status->instance_id ) ) {
            self::set_setting( self::SETTING_INSTANCE_ID, $status->instance_id );
        }

        // Cache the status.
        self::cache_status( $status );

        // Reset failure counter.
        delete_option( 'maxi_ai_license_fail_count' );

        // Audit log.
        if ( class_exists( 'Maxi_AI_Audit_Log' ) ) {
            Maxi_AI_Audit_Log::record(
                self::AUDIT_CATEGORY,
                $status->is_valid ? 'activated' : 'activation_failed',
                get_current_user_id(),
                $status->license_key_masked,
                [
                    'domain'   => $domain,
                    'status'   => $status->status,
                    'plan'     => $status->plan,
                    'provider' => $provider->get_slug(),
                    'error'    => $status->error,
                ]
            );
        }

        return $status;

    }

    /**
     * Deactivate the current license.
     *
     * Calls the provider's deactivate() method, clears stored data,
     * and logs an audit event.
     *
     * @return Maxi_AI_License_Status Always returns an inactive status.
     */
    public static function deactivate(): Maxi_AI_License_Status {

        $key         = self::get_setting( self::SETTING_KEY );
        $instance_id = self::get_setting( self::SETTING_INSTANCE_ID, '' );
        $provider    = self::get_provider();
        $domain      = self::get_domain();

        // Call provider if we have the required data.
        if ( $provider !== null && ! empty( $key ) ) {
            $result = $provider->deactivate( $key, $domain, $instance_id );

            if ( is_wp_error( $result ) ) {
                maxi_ai_log(
                    'License deactivation failed: ' . $result->get_error_message(),
                    'warning',
                    [ 'component' => 'license' ]
                );
            }
        }

        // Clear stored data regardless of provider response.
        self::set_setting( self::SETTING_KEY, '' );
        self::set_setting( self::SETTING_INSTANCE_ID, '' );
        delete_transient( self::TRANSIENT_KEY );
        delete_option( 'maxi_ai_license_fail_count' );

        // Reset in-memory cache.
        self::$cached_status = null;

        $inactive = Maxi_AI_License_Status::inactive();

        // Audit log.
        if ( class_exists( 'Maxi_AI_Audit_Log' ) ) {
            Maxi_AI_Audit_Log::record(
                self::AUDIT_CATEGORY,
                'deactivated',
                get_current_user_id(),
                '',
                [
                    'domain'   => $domain,
                    'provider' => $provider ? $provider->get_slug() : 'unknown',
                ]
            );
        }

        return $inactive;

    }

    /**
     * Force a remote re-validation of the stored license key.
     *
     * @return Maxi_AI_License_Status|null Null if no key is stored or no provider is available.
     */
    public static function refresh(): ?Maxi_AI_License_Status {

        $key         = self::get_setting( self::SETTING_KEY );
        $instance_id = self::get_setting( self::SETTING_INSTANCE_ID, '' );
        $provider    = self::get_provider();

        if ( empty( $key ) || $provider === null ) {
            return null;
        }

        $domain = self::get_domain();
        $status = $provider->validate( $key, $domain, $instance_id );

        // Apply grace period logic.
        $status = self::apply_grace_period( $status );

        // Update instance ID if the provider returned a new one.
        if ( ! empty( $status->instance_id ) ) {
            self::set_setting( self::SETTING_INSTANCE_ID, $status->instance_id );
        }

        // Handle network/API failures gracefully.
        if ( $status->status === Maxi_AI_License_Status::STATUS_INVALID && ! empty( $status->error ) ) {
            $fail_count = (int) get_option( 'maxi_ai_license_fail_count', 0 );
            $fail_count++;
            update_option( 'maxi_ai_license_fail_count', $fail_count, false );

            // If we have a previously cached good status, extend it.
            if ( $fail_count <= self::MAX_FAIL_COUNT ) {
                $previous = get_transient( self::TRANSIENT_KEY );

                if ( is_array( $previous ) && ! empty( $previous['is_valid'] ) ) {
                    // Re-cache the previous good status with extended TTL.
                    set_transient( self::TRANSIENT_KEY, $previous, self::FAILURE_EXTEND_TTL );
                    self::$cached_status = Maxi_AI_License_Status::from_array( $previous );

                    maxi_ai_log(
                        sprintf( 'License validation failed (%d/%d), extending cached status.', $fail_count, self::MAX_FAIL_COUNT ),
                        'warning',
                        [ 'component' => 'license', 'error' => $status->error ]
                    );

                    return self::$cached_status;
                }
            }
        } else {
            // Successful validation — reset fail counter.
            delete_option( 'maxi_ai_license_fail_count' );
        }

        // Cache the new status.
        self::cache_status( $status );

        return $status;

    }

    /**
     * Get the site's domain for license activation.
     *
     * @return string Domain name (e.g. 'example.com').
     */
    public static function get_domain(): string {

        $domain = wp_parse_url( home_url(), PHP_URL_HOST );

        /**
         * Filter the domain used for license activation.
         *
         * Useful for local development environments (.test, localhost)
         * that should use a production domain for licensing.
         *
         * @param string $domain Detected domain.
         */
        return (string) apply_filters( 'maxi_ai_license_domain', $domain );

    }

    /**
     * Get the cache TTL in seconds.
     *
     * @return int
     */
    public static function get_ttl(): int {

        if ( defined( 'MAXI_AI_LICENSE_CHECK_INTERVAL' ) ) {
            return max( 3600, (int) MAXI_AI_LICENSE_CHECK_INTERVAL );
        }

        return self::DEFAULT_TTL;

    }

    /**
     * Clear all cached state (useful after settings changes).
     */
    public static function flush(): void {

        self::$cached_status = null;
        delete_transient( self::TRANSIENT_KEY );

    }

    /**
     * Get the raw stored license key (if any).
     *
     * @return string Empty string if no key is stored.
     */
    public static function get_stored_key(): string {

        return (string) self::get_setting( self::SETTING_KEY, '' );

    }

    /**
     * Mask a license key for safe display.
     *
     * @param string $key Raw license key.
     * @return string Masked key (e.g. XXXXXXXXXXXXBD2D).
     */
    public static function mask_key( string $key ): string {

        if ( strlen( $key ) <= 4 ) {
            return str_repeat( 'X', strlen( $key ) );
        }

        return str_repeat( 'X', strlen( $key ) - 4 ) . substr( $key, -4 );

    }

    // ------------------------------------------------------------------
    // Internal helpers.
    // ------------------------------------------------------------------

    /**
     * Apply grace period logic to a status object.
     *
     * If the license is expired but within the grace window, the status
     * is changed to grace_period and the grace_until date is set.
     *
     * @param Maxi_AI_License_Status $status Original status.
     * @return Maxi_AI_License_Status Possibly modified status.
     */
    private static function apply_grace_period( Maxi_AI_License_Status $status ): Maxi_AI_License_Status {

        if ( $status->status !== Maxi_AI_License_Status::STATUS_EXPIRED ) {
            return $status;
        }

        if ( empty( $status->expires_at ) ) {
            return $status;
        }

        $expires_ts = strtotime( $status->expires_at );

        if ( ! $expires_ts ) {
            return $status;
        }

        $grace_until_ts = $expires_ts + ( self::GRACE_PERIOD_DAYS * DAY_IN_SECONDS );

        if ( time() < $grace_until_ts ) {
            // Still within grace period.
            $data                = $status->to_array();
            $data['status']      = Maxi_AI_License_Status::STATUS_GRACE_PERIOD;
            $data['is_valid']    = false; // Not technically valid, but grants_pro() checks status.
            $data['grace_until'] = gmdate( 'c', $grace_until_ts );

            return Maxi_AI_License_Status::from_array( $data );
        }

        return $status;

    }

    /**
     * Cache a license status in the WordPress transient.
     *
     * @param Maxi_AI_License_Status $status Status to cache.
     */
    private static function cache_status( Maxi_AI_License_Status $status ): void {

        set_transient( self::TRANSIENT_KEY, $status->to_array(), self::get_ttl() );
        self::$cached_status = $status;

    }

    /**
     * Read a license-related value from the maxi_ai_settings option.
     *
     * @param string $key     Setting key.
     * @param mixed  $default Default value.
     * @return mixed
     */
    private static function get_setting( string $key, $default = '' ) {

        $settings = get_option( 'maxi_ai_settings', [] );

        if ( ! is_array( $settings ) ) {
            return $default;
        }

        return $settings[ $key ] ?? $default;

    }

    /**
     * Write a license-related value into the maxi_ai_settings option.
     *
     * Merges with existing settings — never replaces the entire option.
     *
     * @param string $key   Setting key.
     * @param mixed  $value Setting value.
     */
    private static function set_setting( string $key, $value ): void {

        $settings = get_option( 'maxi_ai_settings', [] );

        if ( ! is_array( $settings ) ) {
            $settings = [];
        }

        $settings[ $key ] = $value;

        update_option( 'maxi_ai_settings', $settings );

        // Flush the config cache if it exists.
        if ( class_exists( 'Maxi_AI_Config' ) ) {
            Maxi_AI_Config::flush();
        }

    }

}
