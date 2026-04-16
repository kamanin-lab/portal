<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * HTTP client for Maxi AI provider communication.
 *
 * Wraps wp_remote_post / wp_remote_get with auth, timeout, rate-limit handling.
 */
class Maxi_AI_Client {

    /**
     * Send a POST request.
     *
     * @param string $url     The endpoint URL.
     * @param array  $body    Request body (will be JSON-encoded).
     * @param array  $headers Additional headers.
     * @param int    $timeout Request timeout in seconds.
     * @return array|WP_Error Parsed response body on success, WP_Error on failure.
     */
    public static function post( $url, $body = [], $headers = [], $timeout = null ) {

        return self::request( 'POST', $url, $body, $headers, $timeout );

    }

    /**
     * Send a GET request.
     *
     * @param string $url     The endpoint URL.
     * @param array  $headers Additional headers.
     * @param int    $timeout Request timeout in seconds.
     * @return array|WP_Error Parsed response body on success, WP_Error on failure.
     */
    public static function get( $url, $headers = [], $timeout = null ) {

        return self::request( 'GET', $url, [], $headers, $timeout );

    }

    /**
     * Execute an HTTP request.
     *
     * @param string $method  HTTP method.
     * @param string $url     The endpoint URL.
     * @param array  $body    Request body.
     * @param array  $headers Additional headers.
     * @param int    $timeout Request timeout in seconds.
     * @return array|WP_Error Parsed response body or WP_Error.
     */
    private static function request( $method, $url, $body = [], $headers = [], $timeout = null ) {

        if ( $timeout === null ) {
            $timeout = Maxi_AI_Config::get( 'http_timeout', 60 );
        }

        $args = [
            'method'  => $method,
            'timeout' => intval( $timeout ),
            'headers' => array_merge(
                [
                    'Content-Type' => 'application/json',
                    'Accept'       => 'application/json',
                ],
                $headers
            ),
        ];

        if ( $method === 'POST' && ! empty( $body ) ) {
            $args['body'] = wp_json_encode( $body );
        }

        $response = wp_remote_request( $url, $args );

        if ( is_wp_error( $response ) ) {
            maxi_ai_log(
                'HTTP request failed: ' . $response->get_error_message(),
                'error',
                [ 'url' => $url, 'method' => $method ]
            );
            return $response;
        }

        $code = wp_remote_retrieve_response_code( $response );
        $raw  = wp_remote_retrieve_body( $response );
        $data = json_decode( $raw, true );

        // Rate limit handling.
        if ( $code === 429 ) {
            $retry_after = intval( wp_remote_retrieve_header( $response, 'retry-after' ) );

            if ( $retry_after <= 0 ) {
                $retry_after = 30; // Default 30s if no header.
            }

            maxi_ai_log(
                sprintf( 'Rate limited (429). Retry-After: %ds', $retry_after ),
                'error',
                [ 'url' => $url ]
            );

            return new WP_Error(
                'rate_limited',
                'Rate limited by provider.',
                [ 'retry_after' => $retry_after ]
            );
        }

        // Other HTTP errors.
        if ( $code < 200 || $code >= 300 ) {
            $message = is_array( $data ) && isset( $data['error'] )
                ? ( is_array( $data['error'] ) ? ( $data['error']['message'] ?? wp_json_encode( $data['error'] ) ) : $data['error'] )
                : "HTTP {$code}";

            maxi_ai_log(
                sprintf( 'HTTP %d: %s', $code, $message ),
                'error',
                [ 'url' => $url ]
            );

            return new WP_Error( 'http_error', $message, [ 'status' => $code ] );
        }

        // Credential usage tracking — auto-detect provider from outbound URL.
        if ( class_exists( 'Maxi_AI_Key_Audit' ) ) {
            $provider = Maxi_AI_Key_Audit::detect_provider_from_url( $url );
            if ( $provider ) {
                Maxi_AI_Key_Audit::touch( $provider );
            }
        }

        return is_array( $data ) ? $data : [ 'raw' => $raw ];

    }

    /**
     * Build an Authorization: Bearer header array.
     *
     * @param string $api_key The API key.
     * @return array Headers array with Authorization.
     */
    public static function bearer_auth( $api_key ) {

        return [ 'Authorization' => 'Bearer ' . $api_key ];

    }

}
