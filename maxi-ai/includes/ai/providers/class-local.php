<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Local / self-hosted provider for Maxi AI.
 *
 * Communicates with a local AI endpoint (e.g. Ollama, LocalAI, or custom server).
 * Supports text generation and optionally image generation and vision.
 */
class Maxi_AI_Provider_Local implements Maxi_AI_Provider {

    /**
     * @inheritDoc
     */
    public function generate_image( array $params ) {

        $endpoint = $this->get_endpoint();

        if ( is_wp_error( $endpoint ) ) {
            return $endpoint;
        }

        $body = [
            'prompt' => $params['prompt'] ?? '',
            'size'   => $params['size'] ?? '1024x1024',
            'model'  => $params['model'] ?? 'default',
        ];

        if ( isset( $params['seed'] ) && $params['seed'] !== '' ) {
            $body['seed'] = intval( $params['seed'] );
        }

        $response = Maxi_AI_Client::post(
            $endpoint . '/images/generations',
            $body
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $url = $response['data'][0]['url'] ?? ( $response['url'] ?? '' );

        if ( empty( $url ) ) {
            return new WP_Error( 'no_image_url', 'Local provider did not return an image URL.' );
        }

        return [ 'url' => $url ];

    }

    /**
     * @inheritDoc
     *
     * Pass-through to the configured local endpoint /images/edits. Expected request body:
     * { prompt, image, mask, size, seed, model }. Expected response: { data: [{ url }] } or { url }.
     */
    public function edit_image( array $params ) {

        $endpoint = $this->get_endpoint();

        if ( is_wp_error( $endpoint ) ) {
            return $endpoint;
        }

        if ( empty( $params['image'] ) ) {
            return new WP_Error( 'missing_image', 'Source image is required.' );
        }

        $body = [
            'prompt' => $params['prompt'] ?? '',
            'image'  => $params['image'],
            'size'   => $params['size'] ?? '1024x1024',
            'model'  => $params['model'] ?? 'default',
        ];

        if ( ! empty( $params['mask'] ) ) {
            $body['mask'] = $params['mask'];
        }

        if ( isset( $params['seed'] ) && $params['seed'] !== '' ) {
            $body['seed'] = intval( $params['seed'] );
        }

        $response = Maxi_AI_Client::post(
            $endpoint . '/images/edits',
            $body
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $url = $response['data'][0]['url'] ?? ( $response['url'] ?? '' );

        if ( empty( $url ) ) {
            return new WP_Error( 'no_image_url', 'Local provider did not return an image URL.' );
        }

        return [ 'url' => $url ];

    }

    /**
     * @inheritDoc
     */
    public function generate_text( array $params ) {

        $endpoint = $this->get_endpoint();

        if ( is_wp_error( $endpoint ) ) {
            return $endpoint;
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
            'model'    => $params['model'] ?? 'default',
            'messages' => $messages,
        ];

        if ( isset( $params['max_tokens'] ) ) {
            $body['max_tokens'] = intval( $params['max_tokens'] );
        }

        if ( isset( $params['temperature'] ) ) {
            $body['temperature'] = floatval( $params['temperature'] );
        }

        $response = Maxi_AI_Client::post(
            $endpoint . '/chat/completions',
            $body
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $content = $response['choices'][0]['message']['content']
            ?? ( $response['content'] ?? '' );

        return [
            'content' => $content,
            'usage'   => $response['usage'] ?? [],
        ];

    }

    /**
     * @inheritDoc
     */
    public function analyze_image( array $params ) {

        $endpoint = $this->get_endpoint();

        if ( is_wp_error( $endpoint ) ) {
            return $endpoint;
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
                            'url' => $params['image_url'] ?? '',
                        ],
                    ],
                ],
            ],
        ];

        $response = Maxi_AI_Client::post(
            $endpoint . '/chat/completions',
            [
                'model'    => $params['model'] ?? 'default',
                'messages' => $messages,
            ]
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        return [
            'analysis' => $response['choices'][0]['message']['content'] ?? '',
        ];

    }

    /**
     * @inheritDoc
     */
    public function supports( string $capability ): bool {

        // Local provider supports everything — actual support depends on the server.
        return in_array( $capability, [ 'image', 'text', 'vision' ], true );

    }

    /**
     * @inheritDoc
     */
    public function get_name(): string {

        return 'Local';

    }

    /**
     * @inheritDoc
     *
     * For the local provider the "key" is the endpoint URL. Validate by
     * GETting the root — any 2xx/3xx/4xx response proves the host is
     * reachable. Only network-level failures count as invalid.
     */
    public function test_key( string $key ) {

        if ( $key === '' ) {
            return new WP_Error( 'missing_endpoint', 'Local endpoint URL is empty.' );
        }

        if ( ! preg_match( '#^https?://#i', $key ) ) {
            return new WP_Error( 'invalid_endpoint', 'Local endpoint must be an http(s) URL.' );
        }

        $response = wp_remote_get(
            rtrim( $key, '/' ),
            [ 'timeout' => 10 ]
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        // Any HTTP response at all means the endpoint is reachable.
        return true;

    }

    /**
     * Get the configured local endpoint URL.
     *
     * @return string|WP_Error
     */
    private function get_endpoint() {

        $endpoint = Maxi_AI_Config::get( 'local_endpoint' );

        if ( empty( $endpoint ) ) {
            return new WP_Error( 'missing_endpoint', 'Local AI endpoint is not configured.' );
        }

        return rtrim( $endpoint, '/' );

    }

}
