<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * BFL (Black Forest Labs) direct API provider for Maxi AI.
 *
 * Supports image generation via the BFL direct API (api.bfl.ai).
 * Uses x-key authentication header and async polling.
 */
class Maxi_AI_Provider_BFL implements Maxi_AI_Provider {

    const API_BASE = 'https://api.bfl.ai/v1';

    /**
     * @inheritDoc
     */
    public function generate_image( array $params ) {

        $api_key = Maxi_AI_Config::get( 'bfl_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'BFL API key is not configured.' );
        }

        $model = $params['model'] ?? 'flux-2-pro-preview';

        $body = [
            'prompt' => $params['prompt'] ?? '',
        ];

        if ( ! empty( $params['size'] ) ) {
            $parts = explode( 'x', $params['size'] );
            if ( count( $parts ) === 2 ) {
                $body['width']  = intval( $parts[0] );
                $body['height'] = intval( $parts[1] );
            }
        }

        if ( ! empty( $params['num_inference_steps'] ) ) {
            $body['steps'] = intval( $params['num_inference_steps'] );
        }

        if ( isset( $params['seed'] ) && $params['seed'] !== '' ) {
            $body['seed'] = intval( $params['seed'] );
        }

        $headers = [
            'Content-Type' => 'application/json',
            'x-key'        => $api_key,
        ];

        $response = Maxi_AI_Client::post(
            self::API_BASE . '/' . $model,
            $body,
            $headers,
            120
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        // BFL returns { id, polling_url } for async processing.
        $polling_url = $response['polling_url'] ?? '';

        if ( empty( $polling_url ) ) {
            // Some endpoints may return the result directly.
            if ( ! empty( $response['result']['sample'] ) ) {
                return [ 'url' => $response['result']['sample'] ];
            }

            return new WP_Error( 'no_poll_url', 'BFL did not return a polling URL or direct result.' );
        }

        return self::poll_result( $polling_url, $api_key );

    }

    /**
     * @inheritDoc
     *
     * Uses Flux Kontext Pro for instruction-only editing (no mask) and Flux Fill Pro for mask-based inpainting.
     */
    public function edit_image( array $params ) {

        $api_key = Maxi_AI_Config::get( 'bfl_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'BFL API key is not configured.' );
        }

        if ( empty( $params['image'] ) ) {
            return new WP_Error( 'missing_image', 'Source image is required.' );
        }

        $has_mask = ! empty( $params['mask'] );

        if ( $has_mask ) {
            $model = $params['model'] ?? 'flux-pro-1.0-fill';

            $image_b64 = self::to_base64( $params['image'] );
            if ( is_wp_error( $image_b64 ) ) {
                return $image_b64;
            }

            $mask_b64 = self::to_base64( $params['mask'] );
            if ( is_wp_error( $mask_b64 ) ) {
                return $mask_b64;
            }

            $body = [
                'prompt'        => $params['prompt'] ?? '',
                'image'         => $image_b64,
                'mask'          => $mask_b64,
                'output_format' => $params['output_format'] ?? 'png',
            ];

            if ( ! empty( $params['steps'] ) ) {
                $body['steps'] = intval( $params['steps'] );
            }

            if ( ! empty( $params['guidance'] ) ) {
                $body['guidance'] = floatval( $params['guidance'] );
            }
        } else {
            $model = $params['model'] ?? 'flux-kontext-pro';

            $image_b64 = self::to_base64( $params['image'] );
            if ( is_wp_error( $image_b64 ) ) {
                return $image_b64;
            }

            $body = [
                'prompt'        => $params['prompt'] ?? '',
                'input_image'   => $image_b64,
                'output_format' => $params['output_format'] ?? 'png',
            ];

            if ( ! empty( $params['aspect_ratio'] ) ) {
                $body['aspect_ratio'] = $params['aspect_ratio'];
            }
        }

        if ( isset( $params['seed'] ) && $params['seed'] !== '' ) {
            $body['seed'] = intval( $params['seed'] );
        }

        $headers = [
            'Content-Type' => 'application/json',
            'x-key'        => $api_key,
        ];

        $response = Maxi_AI_Client::post(
            self::API_BASE . '/' . $model,
            $body,
            $headers,
            120
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $polling_url = $response['polling_url'] ?? '';

        if ( empty( $polling_url ) ) {
            if ( ! empty( $response['result']['sample'] ) ) {
                return [ 'url' => $response['result']['sample'] ];
            }
            return new WP_Error( 'no_poll_url', 'BFL did not return a polling URL or direct result.' );
        }

        return self::poll_result( $polling_url, $api_key );

    }

    /**
     * @inheritDoc
     */
    public function generate_text( array $params ) {

        return new WP_Error( 'not_supported', 'BFL provider does not support text generation.' );

    }

    /**
     * @inheritDoc
     */
    public function analyze_image( array $params ) {

        return new WP_Error( 'not_supported', 'BFL provider does not support image analysis.' );

    }

    /**
     * @inheritDoc
     */
    public function supports( string $capability ): bool {

        return in_array( $capability, [ 'image', 'edit_image' ], true );

    }

    /**
     * @inheritDoc
     */
    public function get_name(): string {

        return 'BFL';

    }

    /**
     * @inheritDoc
     *
     * BFL has no dedicated "whoami" endpoint, so we probe GET /v1/get_result
     * with a throwaway task_id. A valid key returns 404/422 (unknown task); an
     * invalid key returns 401/403. Only those auth codes count as failure.
     */
    public function test_key( string $key ) {

        if ( $key === '' ) {
            return new WP_Error( 'missing_api_key', 'BFL API key is empty.' );
        }

        $probe_id = 'maxi-ai-keycheck-' . wp_generate_uuid4();

        $response = wp_remote_get(
            self::API_BASE . '/get_result?id=' . rawurlencode( $probe_id ),
            [
                'timeout' => 20,
                'headers' => [
                    'x-key'  => $key,
                    'Accept' => 'application/json',
                ],
            ]
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code( $response );

        // 401/403 → auth failed. Anything else (200, 404, 422, ...) means the
        // key was accepted and BFL just didn't know this particular task ID.
        if ( $code === 401 || $code === 403 ) {
            $raw  = wp_remote_retrieve_body( $response );
            $data = json_decode( $raw, true );
            $msg  = is_array( $data ) && isset( $data['detail'] )
                ? ( is_array( $data['detail'] ) ? wp_json_encode( $data['detail'] ) : $data['detail'] )
                : 'BFL key validation failed with HTTP ' . $code;
            return new WP_Error( 'invalid_api_key', $msg, [ 'status' => $code ] );
        }

        return true;

    }

    /**
     * Poll BFL async result until it completes or times out.
     *
     * BFL polling responses:
     * - { status: "Pending" }       — still processing.
     * - { status: "Ready", result: { sample: "https://..." } }  — done.
     * - { status: "Error", result: { error_message: "..." } }   — failed.
     *
     * @param string $url     Polling URL.
     * @param string $api_key API key for auth headers.
     * @param int    $max_wait Max seconds to wait.
     * @return array|WP_Error
     */
    private static function poll_result( $url, $api_key, $max_wait = 120 ) {

        $start    = time();
        $interval = 2;

        $headers = [
            'x-key' => $api_key,
        ];

        while ( time() - $start < $max_wait ) {

            sleep( $interval );

            $response = Maxi_AI_Client::get(
                $url,
                $headers,
                30
            );

            if ( is_wp_error( $response ) ) {
                return $response;
            }

            $status = $response['status'] ?? '';

            if ( $status === 'Ready' ) {
                $sample_url = $response['result']['sample'] ?? '';

                if ( empty( $sample_url ) ) {
                    return new WP_Error( 'no_sample', 'BFL returned Ready status but no sample URL.' );
                }

                return [ 'url' => $sample_url ];
            }

            if ( $status === 'Error' ) {
                $error_msg = $response['result']['error_message']
                    ?? $response['error']
                    ?? 'BFL generation failed.';

                return new WP_Error( 'generation_failed', $error_msg );
            }

            // Status is "Pending" or other — keep polling.
            // Gradually increase polling interval.
            $interval = min( $interval + 1, 10 );

        }

        return new WP_Error( 'generation_timeout', 'BFL generation timed out after ' . $max_wait . 's.' );

    }

    /**
     * Convert an image input (URL, data URI, file path, or raw base64) to plain base64.
     *
     * @param string $input Image source.
     * @return string|WP_Error Base64 string (no data URI prefix).
     */
    private static function to_base64( $input ) {

        if ( ! is_string( $input ) || $input === '' ) {
            return new WP_Error( 'invalid_image', 'Image input is empty.' );
        }

        if ( strpos( $input, 'data:' ) === 0 ) {
            $comma = strpos( $input, ',' );
            if ( $comma === false ) {
                return new WP_Error( 'invalid_data_uri', 'Invalid data URI for image.' );
            }
            return substr( $input, $comma + 1 );
        }

        if ( preg_match( '#^https?://#i', $input ) ) {
            $response = wp_remote_get( $input, [ 'timeout' => 60 ] );
            if ( is_wp_error( $response ) ) {
                return $response;
            }
            $code = wp_remote_retrieve_response_code( $response );
            if ( $code < 200 || $code >= 300 ) {
                return new WP_Error( 'image_fetch_failed', 'Failed to fetch image: HTTP ' . $code );
            }
            return base64_encode( wp_remote_retrieve_body( $response ) );
        }

        if ( file_exists( $input ) ) {
            $bytes = file_get_contents( $input );
            if ( false === $bytes ) {
                return new WP_Error( 'read_failed', 'Failed to read local image file.' );
            }
            return base64_encode( $bytes );
        }

        // Assume already base64.
        if ( base64_decode( $input, true ) === false ) {
            return new WP_Error( 'invalid_image', 'Image input is not a URL, data URI, file path, or base64.' );
        }

        return $input;

    }

}
