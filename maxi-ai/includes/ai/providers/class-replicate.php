<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Replicate provider for Maxi AI.
 *
 * Supports image generation via the Replicate API (api.replicate.com).
 * Runs Flux and other models hosted on Replicate.
 */
class Maxi_AI_Provider_Replicate implements Maxi_AI_Provider {

    const API_BASE = 'https://api.replicate.com/v1';

    /**
     * @inheritDoc
     */
    public function generate_image( array $params ) {

        $api_key = Maxi_AI_Config::get( 'replicate_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'Replicate API key is not configured.' );
        }

        $model = $params['model'] ?? 'black-forest-labs/flux-schnell';

        $input = [
            'prompt' => $params['prompt'] ?? '',
        ];

        if ( ! empty( $params['size'] ) ) {
            $parts = explode( 'x', $params['size'] );
            if ( count( $parts ) === 2 ) {
                $input['width']  = intval( $parts[0] );
                $input['height'] = intval( $parts[1] );
            }
        }

        if ( ! empty( $params['num_inference_steps'] ) ) {
            $input['num_inference_steps'] = intval( $params['num_inference_steps'] );
        }

        if ( isset( $params['seed'] ) && $params['seed'] !== '' ) {
            $input['seed'] = intval( $params['seed'] );
        }

        $response = Maxi_AI_Client::post(
            self::API_BASE . '/models/' . $model . '/predictions',
            [ 'input' => $input ],
            Maxi_AI_Client::bearer_auth( $api_key ),
            120
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        // Replicate returns a prediction object — may need polling.
        $status = $response['status'] ?? '';

        if ( $status === 'succeeded' ) {
            $output = $response['output'] ?? [];
            $url    = is_array( $output ) ? ( $output[0] ?? '' ) : $output;

            return [ 'url' => $url ];
        }

        if ( $status === 'processing' || $status === 'starting' ) {
            // Poll for completion.
            $poll_url = $response['urls']['get'] ?? '';

            if ( empty( $poll_url ) ) {
                return new WP_Error( 'no_poll_url', 'Replicate did not return a polling URL.' );
            }

            return self::poll_prediction( $poll_url, $api_key );
        }

        $error_msg = $response['error'] ?? 'Prediction failed with status: ' . $status;

        return new WP_Error( 'prediction_failed', $error_msg );

    }

    /**
     * @inheritDoc
     *
     * Uses black-forest-labs/flux-fill-pro (mask-based inpainting) by default.
     * A mask is required — use the BFL provider for instruction-only (Kontext) editing.
     */
    public function edit_image( array $params ) {

        $api_key = Maxi_AI_Config::get( 'replicate_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'Replicate API key is not configured.' );
        }

        if ( empty( $params['image'] ) ) {
            return new WP_Error( 'missing_image', 'Source image is required.' );
        }

        if ( empty( $params['mask'] ) ) {
            return new WP_Error( 'mask_required', 'Replicate flux-fill requires a mask. Use provider "bfl" for instruction-only editing.' );
        }

        $model = $params['model'] ?? 'black-forest-labs/flux-fill-pro';

        $image_uri = self::to_data_uri( $params['image'] );
        if ( is_wp_error( $image_uri ) ) {
            return $image_uri;
        }

        $mask_uri = self::to_data_uri( $params['mask'] );
        if ( is_wp_error( $mask_uri ) ) {
            return $mask_uri;
        }

        $input = [
            'prompt' => $params['prompt'] ?? '',
            'image'  => $image_uri,
            'mask'   => $mask_uri,
        ];

        if ( ! empty( $params['steps'] ) ) {
            $input['steps'] = intval( $params['steps'] );
        }

        if ( ! empty( $params['guidance'] ) ) {
            $input['guidance'] = floatval( $params['guidance'] );
        }

        if ( ! empty( $params['output_format'] ) ) {
            $input['output_format'] = $params['output_format'];
        }

        if ( isset( $params['seed'] ) && $params['seed'] !== '' ) {
            $input['seed'] = intval( $params['seed'] );
        }

        $response = Maxi_AI_Client::post(
            self::API_BASE . '/models/' . $model . '/predictions',
            [ 'input' => $input ],
            Maxi_AI_Client::bearer_auth( $api_key ),
            120
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $status = $response['status'] ?? '';

        if ( $status === 'succeeded' ) {
            $output = $response['output'] ?? [];
            $url    = is_array( $output ) ? ( $output[0] ?? '' ) : $output;
            return [ 'url' => $url ];
        }

        if ( $status === 'processing' || $status === 'starting' ) {
            $poll_url = $response['urls']['get'] ?? '';

            if ( empty( $poll_url ) ) {
                return new WP_Error( 'no_poll_url', 'Replicate did not return a polling URL.' );
            }

            return self::poll_prediction( $poll_url, $api_key );
        }

        $error_msg = $response['error'] ?? 'Prediction failed with status: ' . $status;
        return new WP_Error( 'prediction_failed', $error_msg );

    }

    /**
     * @inheritDoc
     */
    public function generate_text( array $params ) {

        return new WP_Error( 'not_supported', 'Replicate provider does not support text generation.' );

    }

    /**
     * @inheritDoc
     */
    public function analyze_image( array $params ) {

        return new WP_Error( 'not_supported', 'Replicate provider does not support image analysis.' );

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

        return 'Replicate';

    }

    /**
     * @inheritDoc
     *
     * Validates by calling GET /v1/account. Returns 200 for a valid key and
     * 401 for an invalid one — does not create any predictions.
     */
    public function test_key( string $key ) {

        if ( $key === '' ) {
            return new WP_Error( 'missing_api_key', 'Replicate API key is empty.' );
        }

        $response = wp_remote_get(
            self::API_BASE . '/account',
            [
                'timeout' => 20,
                'headers' => [
                    'Authorization' => 'Bearer ' . $key,
                    'Accept'        => 'application/json',
                ],
            ]
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code( $response );

        if ( $code >= 200 && $code < 300 ) {
            return true;
        }

        $raw  = wp_remote_retrieve_body( $response );
        $data = json_decode( $raw, true );
        $msg  = is_array( $data ) && isset( $data['detail'] )
            ? $data['detail']
            : 'Replicate key validation failed with HTTP ' . $code;

        return new WP_Error( 'invalid_api_key', $msg, [ 'status' => $code ] );

    }

    /**
     * Poll a Replicate prediction until it completes or times out.
     *
     * @param string $url     Prediction URL.
     * @param string $api_key API key.
     * @param int    $max_wait Max seconds to wait.
     * @return array|WP_Error
     */
    private static function poll_prediction( $url, $api_key, $max_wait = 120 ) {

        $start    = time();
        $interval = 2;

        while ( time() - $start < $max_wait ) {

            sleep( $interval );

            $response = Maxi_AI_Client::get(
                $url,
                Maxi_AI_Client::bearer_auth( $api_key ),
                30
            );

            if ( is_wp_error( $response ) ) {
                return $response;
            }

            $status = $response['status'] ?? '';

            if ( $status === 'succeeded' ) {
                $output = $response['output'] ?? [];
                $url_result = is_array( $output ) ? ( $output[0] ?? '' ) : $output;

                return [ 'url' => $url_result ];
            }

            if ( $status === 'failed' || $status === 'canceled' ) {
                return new WP_Error( 'prediction_failed', $response['error'] ?? 'Prediction failed.' );
            }

            // Gradually increase polling interval.
            $interval = min( $interval + 1, 10 );

        }

        return new WP_Error( 'prediction_timeout', 'Prediction timed out after ' . $max_wait . 's.' );

    }

    /**
     * Convert an image input to a data URI (Replicate accepts URLs or data URIs).
     *
     * @param string $input URL, data URI, file path, or raw base64.
     * @return string|WP_Error Data URI on success.
     */
    private static function to_data_uri( $input ) {

        if ( ! is_string( $input ) || $input === '' ) {
            return new WP_Error( 'invalid_image', 'Image input is empty.' );
        }

        if ( strpos( $input, 'data:' ) === 0 ) {
            return $input;
        }

        if ( preg_match( '#^https?://#i', $input ) ) {
            // Replicate accepts URLs directly.
            return $input;
        }

        if ( file_exists( $input ) ) {
            $bytes = file_get_contents( $input );
            if ( false === $bytes ) {
                return new WP_Error( 'read_failed', 'Failed to read local image file.' );
            }
            return 'data:image/png;base64,' . base64_encode( $bytes );
        }

        // Assume raw base64.
        if ( base64_decode( $input, true ) === false ) {
            return new WP_Error( 'invalid_image', 'Image input is not a URL, data URI, file path, or base64.' );
        }

        return 'data:image/png;base64,' . $input;

    }

}
