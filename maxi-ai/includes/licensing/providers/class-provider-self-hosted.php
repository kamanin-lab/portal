<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Self-hosted license provider for Maxi AI.
 *
 * Connects to a WordPress site running the Maxi License Server plugin.
 * The server URL is configured via MAXI_AI_LICENSE_SERVER_URL constant
 * in wp-config.php.
 *
 * The API response format matches LemonSqueezy's structure, so the
 * parsing logic is largely shared.
 *
 * @see maxi-license-server plugin for the server-side implementation.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Provider_Self_Hosted implements Maxi_AI_License_Provider {

    /**
     * HTTP request timeout in seconds.
     */
    const TIMEOUT = 15;

    /**
     * {@inheritdoc}
     */
    public function validate( string $license_key, string $domain, string $instance_id = '' ): Maxi_AI_License_Status {

        $body = [ 'license_key' => $license_key ];

        if ( ! empty( $instance_id ) ) {
            $body['instance_id'] = $instance_id;
        }

        $response = $this->request( '/validate', $body );

        if ( is_wp_error( $response ) ) {
            return Maxi_AI_License_Status::invalid( $response->get_error_message() );
        }

        return $this->parse_response( $response, $domain );

    }

    /**
     * {@inheritdoc}
     */
    public function activate( string $license_key, string $domain ): Maxi_AI_License_Status {

        $body = [
            'license_key'   => $license_key,
            'instance_name' => $domain,
        ];

        $response = $this->request( '/activate', $body );

        if ( is_wp_error( $response ) ) {
            return Maxi_AI_License_Status::invalid( $response->get_error_message() );
        }

        return $this->parse_response( $response, $domain );

    }

    /**
     * {@inheritdoc}
     */
    public function deactivate( string $license_key, string $domain, string $instance_id ): bool {

        $body = [
            'license_key' => $license_key,
            'instance_id' => $instance_id,
        ];

        $response = $this->request( '/deactivate', $body );

        if ( is_wp_error( $response ) ) {
            return false;
        }

        return (bool) ( $response['deactivated'] ?? false );

    }

    /**
     * {@inheritdoc}
     */
    public function get_slug(): string {

        return 'self-hosted';

    }

    /**
     * {@inheritdoc}
     */
    public function get_name(): string {

        return 'Self-Hosted';

    }

    // ------------------------------------------------------------------
    // Internal helpers.
    // ------------------------------------------------------------------

    /**
     * Get the license server base URL.
     *
     * @return string
     */
    private function get_server_url(): string {

        if ( defined( 'MAXI_AI_LICENSE_SERVER_URL' ) ) {
            return rtrim( MAXI_AI_LICENSE_SERVER_URL, '/' );
        }

        return 'https://api.maxicore.ai/wp-json/maxi-license/v1';

    }

    /**
     * Send a POST request to the license server.
     *
     * @param string $endpoint API endpoint path (e.g. '/activate').
     * @param array  $body     Request body.
     * @return array|WP_Error Decoded JSON response or error.
     */
    private function request( string $endpoint, array $body ) {

        $base_url = $this->get_server_url();

        if ( empty( $base_url ) ) {
            return new WP_Error(
                'maxi_ai_license_no_server',
                'No license server URL configured. Define MAXI_AI_LICENSE_SERVER_URL in wp-config.php.'
            );
        }

        $url = $base_url . $endpoint;

        $response = wp_remote_post( $url, [
            'timeout' => self::TIMEOUT,
            'headers' => [
                'Accept'       => 'application/json',
                'Content-Type' => 'application/json',
            ],
            'body'    => wp_json_encode( $body ),
        ] );

        if ( is_wp_error( $response ) ) {
            return new WP_Error(
                'maxi_ai_license_http_error',
                sprintf( 'License server request failed: %s', $response->get_error_message() )
            );
        }

        $code = wp_remote_retrieve_response_code( $response );
        $body = wp_remote_retrieve_body( $response );
        $data = json_decode( $body, true );

        if ( ! is_array( $data ) ) {
            return new WP_Error(
                'maxi_ai_license_parse_error',
                sprintf( 'Invalid response from license server (HTTP %d).', $code )
            );
        }

        if ( $code >= 400 && ! empty( $data['error'] ) ) {
            return new WP_Error(
                'maxi_ai_license_api_error',
                (string) $data['error']
            );
        }

        return $data;

    }

    /**
     * Parse an API response into a Maxi_AI_License_Status.
     *
     * @param array  $response Decoded API response.
     * @param string $domain   The site domain.
     * @return Maxi_AI_License_Status
     */
    private function parse_response( array $response, string $domain ): Maxi_AI_License_Status {

        $valid     = (bool) ( $response['valid'] ?? false );
        $ls_status = (string) ( $response['license_key']['status'] ?? 'inactive' );
        $instance  = (string) ( $response['instance']['id'] ?? '' );

        $status_map = [
            'active'   => Maxi_AI_License_Status::STATUS_ACTIVE,
            'inactive' => Maxi_AI_License_Status::STATUS_INACTIVE,
            'expired'  => Maxi_AI_License_Status::STATUS_EXPIRED,
            'disabled' => Maxi_AI_License_Status::STATUS_DISABLED,
        ];

        $status = $status_map[ $ls_status ] ?? Maxi_AI_License_Status::STATUS_INVALID;

        $expires_at = null;

        if ( ! empty( $response['license_key']['expires_at'] ) ) {
            $expires_at = (string) $response['license_key']['expires_at'];
        }

        $key_string = (string) ( $response['license_key']['key'] ?? '' );
        $masked     = self::mask_key( $key_string );

        $plan = '';

        if ( ! empty( $response['meta']['variant_name'] ) ) {
            $plan = sanitize_key( $response['meta']['variant_name'] );
        }

        // Entitlements: prefer the server-provided array when present,
        // otherwise derive from plan via the client-side PLANS map.
        // This decouples client rollout from server rollout — the client
        // can ship with the fallback map and the license server can start
        // returning entitlements[] whenever it's ready.
        $entitlements = is_array( $response['entitlements'] ?? null )
            ? array_values( array_filter( array_map( 'strval', $response['entitlements'] ), 'strlen' ) )
            : ( class_exists( 'Maxi_AI_Entitlements' )
                ? Maxi_AI_Entitlements::resolve_entitlements_for_plan( $plan )
                : [] );

        return new Maxi_AI_License_Status( [
            'is_valid'           => $valid && $status === Maxi_AI_License_Status::STATUS_ACTIVE,
            'status'             => $status,
            'license_key_masked' => $masked,
            'expires_at'         => $expires_at,
            'grace_until'        => null,
            'licensed_domain'    => $domain,
            'instance_id'        => $instance,
            'plan'               => $plan,
            'entitlements'       => $entitlements,
            'error'              => $valid ? null : ( $response['error'] ?? 'License is not valid.' ),
            'raw'                => $response,
            'checked_at'         => gmdate( 'c' ),
        ] );

    }

    /**
     * Mask a license key for safe display.
     *
     * @param string $key Raw license key.
     * @return string Masked key.
     */
    private static function mask_key( string $key ): string {

        if ( strlen( $key ) <= 4 ) {
            return str_repeat( 'X', strlen( $key ) );
        }

        $suffix = substr( $key, -4 );

        return str_repeat( 'X', strlen( $key ) - 4 ) . $suffix;

    }

}
