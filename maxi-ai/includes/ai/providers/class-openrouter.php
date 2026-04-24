<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * OpenRouter provider for Maxi AI.
 *
 * OpenRouter (openrouter.ai) is a multi-model aggregator with an OpenAI-wire-compatible
 * API. Supports text generation and image analysis (vision) across dozens of upstream
 * models via vendor-prefixed slugs (e.g. "openai/gpt-4o-mini", "anthropic/claude-sonnet-4",
 * "google/gemini-pro-vision").
 *
 * Does NOT support image generation or editing — OpenRouter focuses on chat completions.
 */
class Maxi_AI_Provider_OpenRouter implements Maxi_AI_Provider {

    const API_BASE      = 'https://openrouter.ai/api/v1';
    const DEFAULT_MODEL = 'openai/gpt-4o-mini';

    /**
     * @inheritDoc
     */
    public function generate_image( array $params ) {

        return new WP_Error( 'not_supported', 'OpenRouter does not support image generation. Use OpenAI, Replicate, or BFL instead.' );

    }

    /**
     * @inheritDoc
     */
    public function edit_image( array $params ) {

        return new WP_Error( 'not_supported', 'OpenRouter does not support image editing. Use OpenAI, BFL, or Replicate instead.' );

    }

    /**
     * @inheritDoc
     */
    public function generate_text( array $params ) {

        $api_key = Maxi_AI_Config::get( 'openrouter_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'OpenRouter API key is not configured.' );
        }

        $messages = [];

        if ( ! empty( $params['system'] ) ) {
            $messages[] = [
                'role'    => 'system',
                'content' => $params['system'],
            ];
        }

        $messages[] = [
            'role'    => 'user',
            'content' => $params['prompt'] ?? '',
        ];

        $body = [
            'model'    => $params['model'] ?? self::DEFAULT_MODEL,
            'messages' => $messages,
        ];

        if ( isset( $params['max_tokens'] ) ) {
            $body['max_tokens'] = intval( $params['max_tokens'] );
        }

        if ( isset( $params['temperature'] ) ) {
            $body['temperature'] = floatval( $params['temperature'] );
        }

        $response = Maxi_AI_Client::post(
            self::API_BASE . '/chat/completions',
            $body,
            self::auth_headers( $api_key )
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $content = $response['choices'][0]['message']['content'] ?? '';

        return [
            'content'       => $content,
            'usage'         => $response['usage'] ?? [],
            'finish_reason' => $response['choices'][0]['finish_reason'] ?? '',
            'model'         => $response['model'] ?? '',
        ];

    }

    /**
     * @inheritDoc
     */
    public function analyze_image( array $params ) {

        $api_key = Maxi_AI_Config::get( 'openrouter_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'OpenRouter API key is not configured.' );
        }

        $image_url = $params['image_url'] ?? '';

        if ( empty( $image_url ) ) {
            return new WP_Error( 'missing_image', 'An image_url is required for analysis.' );
        }

        $messages = [
            [
                'role'    => 'user',
                'content' => [
                    [
                        'type' => 'text',
                        'text' => $params['prompt'] ?? 'Describe this image.',
                    ],
                    [
                        'type'      => 'image_url',
                        'image_url' => [
                            'url' => $image_url,
                        ],
                    ],
                ],
            ],
        ];

        $body = [
            'model'    => $params['model'] ?? self::DEFAULT_MODEL,
            'messages' => $messages,
        ];

        if ( isset( $params['max_tokens'] ) ) {
            $body['max_tokens'] = intval( $params['max_tokens'] );
        }

        $response = Maxi_AI_Client::post(
            self::API_BASE . '/chat/completions',
            $body,
            self::auth_headers( $api_key )
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        return [
            'analysis' => $response['choices'][0]['message']['content'] ?? '',
            'usage'    => $response['usage'] ?? [],
            'model'    => $response['model'] ?? '',
        ];

    }

    /**
     * @inheritDoc
     */
    public function supports( string $capability ): bool {

        return in_array( $capability, [ 'text', 'vision' ], true );

    }

    /**
     * @inheritDoc
     */
    public function get_name(): string {

        return 'OpenRouter';

    }

    /**
     * @inheritDoc
     *
     * Validates by calling GET /api/v1/models with the candidate key. The endpoint
     * is cheap, does not consume credits, and 200/401 reliably distinguish
     * valid/invalid keys.
     */
    public function test_key( string $key ) {

        if ( $key === '' ) {
            return new WP_Error( 'missing_api_key', 'OpenRouter API key is empty.' );
        }

        $response = wp_remote_get(
            self::API_BASE . '/models',
            [
                'timeout' => 20,
                'headers' => array_merge(
                    self::auth_headers( $key ),
                    [ 'Accept' => 'application/json' ]
                ),
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
        $msg  = is_array( $data ) && isset( $data['error']['message'] )
            ? $data['error']['message']
            : 'OpenRouter key validation failed with HTTP ' . $code;

        return new WP_Error( 'invalid_api_key', $msg, [ 'status' => $code ] );

    }

    /**
     * Build auth headers for OpenRouter.
     *
     * Uses standard Bearer auth plus the two attribution headers OpenRouter
     * recommends (HTTP-Referer + X-Title). Attribution is how OpenRouter
     * surfaces per-site traffic on the operator's dashboard.
     *
     * @param string $api_key API key.
     * @return array
     */
    private static function auth_headers( $api_key ) {

        $headers = Maxi_AI_Client::bearer_auth( $api_key );

        $referer = home_url();
        $title   = get_bloginfo( 'name' );

        if ( ! empty( $referer ) ) {
            $headers['HTTP-Referer'] = $referer;
        }

        if ( ! empty( $title ) ) {
            $headers['X-Title'] = $title;
        }

        return $headers;

    }

}
