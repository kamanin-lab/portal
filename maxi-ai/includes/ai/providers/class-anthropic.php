<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Anthropic (Claude) provider for Maxi AI.
 *
 * Supports text generation and image analysis (vision) via the Anthropic Messages API.
 * Does not support image generation — Claude is a language model, not an image generator.
 */
class Maxi_AI_Provider_Anthropic implements Maxi_AI_Provider {

    const API_BASE = 'https://api.anthropic.com/v1';

    /**
     * @inheritDoc
     */
    public function generate_image( array $params ) {

        return new WP_Error( 'not_supported', 'Claude does not support image generation. Use OpenAI, Replicate, or BFL instead.' );

    }

    /**
     * @inheritDoc
     */
    public function edit_image( array $params ) {

        return new WP_Error( 'not_supported', 'Claude does not support image editing. Use OpenAI, BFL, or Replicate instead.' );

    }

    /**
     * @inheritDoc
     */
    public function generate_text( array $params ) {

        $api_key = Maxi_AI_Config::get( 'anthropic_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'Anthropic API key is not configured.' );
        }

        $messages = [
            [
                'role'    => 'user',
                'content' => $params['prompt'] ?? '',
            ],
        ];

        $body = [
            'model'      => $params['model'] ?? 'claude-sonnet-4-20250514',
            'max_tokens' => intval( $params['max_tokens'] ?? 4096 ),
            'messages'   => $messages,
        ];

        if ( ! empty( $params['system'] ) ) {
            $body['system'] = $params['system'];
        }

        if ( isset( $params['temperature'] ) ) {
            $body['temperature'] = floatval( $params['temperature'] );
        }

        $response = Maxi_AI_Client::post(
            self::API_BASE . '/messages',
            $body,
            self::auth_headers( $api_key )
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        // Extract text from content blocks.
        $content = self::extract_text( $response['content'] ?? [] );

        return [
            'content'       => $content,
            'usage'         => $response['usage'] ?? [],
            'stop_reason'   => $response['stop_reason'] ?? '',
            'model'         => $response['model'] ?? '',
        ];

    }

    /**
     * @inheritDoc
     */
    public function analyze_image( array $params ) {

        $api_key = Maxi_AI_Config::get( 'anthropic_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'Anthropic API key is not configured.' );
        }

        $image_url = $params['image_url'] ?? '';

        if ( empty( $image_url ) ) {
            return new WP_Error( 'missing_image', 'An image_url is required for analysis.' );
        }

        // Claude vision uses base64 or URL source.
        $image_content = [
            'type'   => 'image',
            'source' => [
                'type' => 'url',
                'url'  => $image_url,
            ],
        ];

        $messages = [
            [
                'role'    => 'user',
                'content' => [
                    $image_content,
                    [
                        'type' => 'text',
                        'text' => $params['prompt'] ?? 'Describe this image in detail.',
                    ],
                ],
            ],
        ];

        $body = [
            'model'      => $params['model'] ?? 'claude-sonnet-4-20250514',
            'max_tokens' => intval( $params['max_tokens'] ?? 4096 ),
            'messages'   => $messages,
        ];

        $response = Maxi_AI_Client::post(
            self::API_BASE . '/messages',
            $body,
            self::auth_headers( $api_key )
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        return [
            'analysis' => self::extract_text( $response['content'] ?? [] ),
            'usage'    => $response['usage'] ?? [],
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

        return 'Claude';

    }

    /**
     * @inheritDoc
     *
     * Validates by calling GET /v1/models with the candidate key. Returns 200
     * for a valid key and 401 for an invalid one.
     */
    public function test_key( string $key ) {

        if ( $key === '' ) {
            return new WP_Error( 'missing_api_key', 'Anthropic API key is empty.' );
        }

        $response = wp_remote_get(
            self::API_BASE . '/models',
            [
                'timeout' => 20,
                'headers' => [
                    'x-api-key'         => $key,
                    'anthropic-version' => '2023-06-01',
                    'Accept'            => 'application/json',
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
        $msg  = is_array( $data ) && isset( $data['error']['message'] )
            ? $data['error']['message']
            : 'Anthropic key validation failed with HTTP ' . $code;

        return new WP_Error( 'invalid_api_key', $msg, [ 'status' => $code ] );

    }

    /**
     * Build auth headers for the Anthropic API.
     *
     * @param string $api_key API key.
     * @return array
     */
    private static function auth_headers( $api_key ) {

        return [
            'x-api-key'         => $api_key,
            'anthropic-version' => '2023-06-01',
        ];

    }

    /**
     * Extract text content from Claude's content blocks.
     *
     * @param array $content_blocks Array of content blocks.
     * @return string Concatenated text.
     */
    private static function extract_text( $content_blocks ) {

        if ( ! is_array( $content_blocks ) ) {
            return '';
        }

        $text = '';

        foreach ( $content_blocks as $block ) {
            if ( isset( $block['type'] ) && $block['type'] === 'text' ) {
                $text .= $block['text'] ?? '';
            }
        }

        return $text;

    }

}
