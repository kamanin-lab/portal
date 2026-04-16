<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * License provider contract for Maxi AI.
 *
 * All license backends (LemonSqueezy, Freemius, EDD, custom API, etc.)
 * must implement this interface. The core license manager delegates to
 * the active provider without knowing anything about the vendor's API.
 *
 * @package Maxi_AI
 */
interface Maxi_AI_License_Provider {

    /**
     * Validate a license key for the given domain.
     *
     * Called periodically by the license manager to refresh cached status.
     * Implementations must not alter the activation state — this is read-only.
     *
     * @param string $license_key  The license key to validate.
     * @param string $domain       The site domain (e.g. 'example.com').
     * @param string $instance_id  The activation instance ID, if previously stored.
     * @return Maxi_AI_License_Status
     */
    public function validate( string $license_key, string $domain, string $instance_id = '' ): Maxi_AI_License_Status;

    /**
     * Activate a license key for the given domain.
     *
     * Creates an activation slot on the remote backend. The returned status
     * object should contain the instance_id for subsequent validate/deactivate calls.
     *
     * @param string $license_key The license key to activate.
     * @param string $domain      The site domain.
     * @return Maxi_AI_License_Status
     */
    public function activate( string $license_key, string $domain ): Maxi_AI_License_Status;

    /**
     * Deactivate a license key for the given domain.
     *
     * Releases the activation slot on the remote backend.
     *
     * @param string $license_key The license key to deactivate.
     * @param string $domain      The site domain.
     * @param string $instance_id The activation instance ID.
     * @return bool|WP_Error True on success, WP_Error on failure.
     */
    public function deactivate( string $license_key, string $domain, string $instance_id ): bool;

    /**
     * Get the provider's unique slug.
     *
     * Used to identify which provider class to instantiate when loading
     * from stored settings.
     *
     * @return string Provider slug (e.g. 'lemonsqueezy', 'freemius', 'custom').
     */
    public function get_slug(): string;

    /**
     * Get the provider's display name.
     *
     * @return string Human-readable name (e.g. 'Lemon Squeezy').
     */
    public function get_name(): string;

}
