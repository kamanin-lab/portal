<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * OpenAI provider for Maxi AI.
 *
 * Supports DALL-E for image generation, GPT for text, GPT Vision for image analysis.
 */
class Maxi_AI_Provider_OpenAI implements Maxi_AI_Provider {

    const API_BASE = 'https://api.openai.com/v1';

    /**
     * @inheritDoc
     */
    public function generate_image( array $params ) {

        $api_key = Maxi_AI_Config::get( 'openai_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'OpenAI API key is not configured.' );
        }

        // Transparent background requires gpt-image-1; auto-upgrade model when requested.
        $wants_transparent = ! empty( $params['background'] ) && $params['background'] === 'transparent';
        $model             = $params['model'] ?? ( $wants_transparent ? 'gpt-image-1' : 'dall-e-3' );

        $body = [
            'model'  => $model,
            'prompt' => $params['prompt'] ?? '',
            'n'      => 1,
            'size'   => $params['size'] ?? '1024x1024',
        ];

        if ( ! empty( $params['style'] ) ) {
            $body['style'] = $params['style'];
        }

        if ( ! empty( $params['quality'] ) ) {
            $body['quality'] = $params['quality'];
        }

        // Transparent / opaque background — gpt-image-1 only.
        if ( ! empty( $params['background'] ) && $model === 'gpt-image-1' ) {
            $body['background']    = $params['background'];
            // Transparency requires PNG or WebP output.
            $body['output_format'] = $params['output_format'] ?? 'png';
        }

        $response = Maxi_AI_Client::post(
            self::API_BASE . '/images/generations',
            $body,
            self::auth_headers( $api_key )
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        // gpt-image-1 always returns b64_json; dall-e-3 returns url.
        $url = $response['data'][0]['url'] ?? '';
        $b64 = $response['data'][0]['b64_json'] ?? '';

        if ( ! empty( $b64 ) ) {
            $tmp = self::write_b64_to_tempfile( $b64, $body['output_format'] ?? 'png' );
            if ( is_wp_error( $tmp ) ) {
                return $tmp;
            }
            return [
                'url'            => $tmp,
                'is_local_file'  => true,
                'revised_prompt' => $response['data'][0]['revised_prompt'] ?? '',
            ];
        }

        if ( empty( $url ) ) {
            return new WP_Error( 'no_image_url', 'OpenAI did not return an image URL or b64_json.' );
        }

        return [
            'url'            => $url,
            'revised_prompt' => $response['data'][0]['revised_prompt'] ?? '',
        ];

    }

    /**
     * @inheritDoc
     *
     * Uses POST /v1/images/edits with multipart/form-data.
     * - gpt-image-1 (default): mask is OPTIONAL. Without a mask the whole image is editable
     *   and the prompt is applied globally. Supports background=transparent for RGBA output.
     * - dall-e-2: mask is REQUIRED.
     * gpt-image-1 always returns b64_json.
     */
    public function edit_image( array $params ) {

        $api_key = Maxi_AI_Config::get( 'openai_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'OpenAI API key is not configured.' );
        }

        if ( empty( $params['image'] ) ) {
            return new WP_Error( 'missing_image', 'Source image is required.' );
        }

        $model  = $params['model'] ?? 'gpt-image-1';
        $has_mask = ! empty( $params['mask'] );

        // dall-e-2 requires a mask; gpt-image-1 does not.
        if ( $model === 'dall-e-2' && ! $has_mask ) {
            return new WP_Error( 'mask_required', 'OpenAI dall-e-2 edits require a mask. Use model "gpt-image-1" for maskless editing.' );
        }

        $image_png = self::resolve_png_bytes( $params['image'] );
        if ( is_wp_error( $image_png ) ) {
            return $image_png;
        }

        $mask_png = null;
        if ( $has_mask ) {
            $mask_png = self::resolve_png_bytes( $params['mask'] );
            if ( is_wp_error( $mask_png ) ) {
                return $mask_png;
            }
        }

        $boundary = wp_generate_uuid4();
        $size     = $params['size'] ?? '1024x1024';
        $prompt   = $params['prompt'] ?? '';

        $fields = [
            [ 'name' => 'model',  'value' => $model ],
            [ 'name' => 'prompt', 'value' => $prompt ],
            [ 'name' => 'size',   'value' => $size ],
            [ 'name' => 'n',      'value' => '1' ],
        ];

        // Transparent / opaque background — gpt-image-1 only.
        if ( ! empty( $params['background'] ) && $model === 'gpt-image-1' ) {
            $fields[] = [ 'name' => 'background', 'value' => $params['background'] ];
            $fields[] = [ 'name' => 'output_format', 'value' => $params['output_format'] ?? 'png' ];
        }

        $files = [
            [ 'name' => 'image', 'filename' => 'image.png', 'content' => $image_png, 'type' => 'image/png' ],
        ];

        if ( $mask_png !== null ) {
            $files[] = [ 'name' => 'mask', 'filename' => 'mask.png', 'content' => $mask_png, 'type' => 'image/png' ];
        }

        $body = self::build_multipart_body( $boundary, $fields, $files );

        $headers = self::auth_headers( $api_key );
        $headers['Content-Type'] = 'multipart/form-data; boundary=' . $boundary;

        $response = wp_remote_post(
            self::API_BASE . '/images/edits',
            [
                'headers' => $headers,
                'body'    => $body,
                'timeout' => 120,
            ]
        );

        if ( is_wp_error( $response ) ) {
            return $response;
        }

        $code = wp_remote_retrieve_response_code( $response );
        $raw  = wp_remote_retrieve_body( $response );
        $data = json_decode( $raw, true );

        if ( $code < 200 || $code >= 300 ) {
            $msg = $data['error']['message'] ?? ( 'OpenAI edit failed with status ' . $code );
            return new WP_Error( 'openai_edit_failed', $msg );
        }

        $b64 = $data['data'][0]['b64_json'] ?? '';
        $url = $data['data'][0]['url'] ?? '';

        if ( ! empty( $b64 ) ) {
            $ext = $params['output_format'] ?? 'png';
            $tmp = self::write_b64_to_tempfile( $b64, $ext );
            if ( is_wp_error( $tmp ) ) {
                return $tmp;
            }
            return [ 'url' => $tmp, 'is_local_file' => true ];
        }

        if ( ! empty( $url ) ) {
            return [ 'url' => $url ];
        }

        return new WP_Error( 'no_image_data', 'OpenAI did not return image data.' );

    }

    /**
     * @inheritDoc
     */
    public function generate_text( array $params ) {

        $api_key = Maxi_AI_Config::get( 'openai_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'OpenAI API key is not configured.' );
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
            'model'    => $params['model'] ?? 'gpt-4o',
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
            'content'      => $content,
            'usage'        => $response['usage'] ?? [],
            'finish_reason' => $response['choices'][0]['finish_reason'] ?? '',
        ];

    }

    /**
     * @inheritDoc
     */
    public function analyze_image( array $params ) {

        $api_key = Maxi_AI_Config::get( 'openai_api_key' );

        if ( empty( $api_key ) ) {
            return new WP_Error( 'missing_api_key', 'OpenAI API key is not configured.' );
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

        $body = [
            'model'    => $params['model'] ?? 'gpt-4o',
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
        ];

    }

    /**
     * @inheritDoc
     */
    public function supports( string $capability ): bool {

        return in_array( $capability, [ 'image', 'edit_image', 'text', 'vision' ], true );

    }

    /**
     * @inheritDoc
     */
    public function get_name(): string {

        return 'OpenAI';

    }

    /**
     * @inheritDoc
     *
     * Validates by calling GET /v1/models with the candidate key. Lightweight,
     * does not consume credits, and 200/401 reliably distinguish valid/invalid.
     */
    public function test_key( string $key ) {

        if ( $key === '' ) {
            return new WP_Error( 'missing_api_key', 'OpenAI API key is empty.' );
        }

        $response = wp_remote_get(
            self::API_BASE . '/models',
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
        $msg  = is_array( $data ) && isset( $data['error']['message'] )
            ? $data['error']['message']
            : 'OpenAI key validation failed with HTTP ' . $code;

        return new WP_Error( 'invalid_api_key', $msg, [ 'status' => $code ] );

    }

    /**
     * Build auth headers for OpenAI.
     *
     * @param string $api_key API key.
     * @return array
     */
    private static function auth_headers( $api_key ) {

        $headers = Maxi_AI_Client::bearer_auth( $api_key );

        $org_id = Maxi_AI_Config::get( 'openai_org_id' );

        if ( ! empty( $org_id ) ) {
            $headers['OpenAI-Organization'] = $org_id;
        }

        return $headers;

    }

    /**
     * Decode a base64 image payload and write it to a temp file.
     *
     * @param string $b64 Base64-encoded image data.
     * @param string $ext File extension (e.g. 'png', 'webp').
     * @return string|WP_Error Absolute temp file path on success.
     */
    private static function write_b64_to_tempfile( $b64, $ext = 'png' ) {

        $decoded = base64_decode( $b64 );
        if ( false === $decoded ) {
            return new WP_Error( 'decode_failed', 'Failed to decode OpenAI b64_json response.' );
        }

        $ext = preg_replace( '/[^a-z0-9]/i', '', $ext ) ?: 'png';
        $tmp = wp_tempnam( 'maxi-ai-' . wp_generate_uuid4() . '.' . $ext );
        if ( ! $tmp ) {
            return new WP_Error( 'tmp_failed', 'Could not create temp file for image.' );
        }

        if ( false === file_put_contents( $tmp, $decoded ) ) {
            return new WP_Error( 'write_failed', 'Could not write image to temp file.' );
        }

        return $tmp;

    }

    /**
     * Resolve an image input (URL, base64 data URI, raw base64, or local file path) to PNG bytes.
     *
     * @param string $input Image source.
     * @return string|WP_Error Raw bytes on success.
     */
    private static function resolve_png_bytes( $input ) {

        if ( ! is_string( $input ) || $input === '' ) {
            return new WP_Error( 'invalid_image', 'Image input is empty.' );
        }

        // Data URI.
        if ( strpos( $input, 'data:' ) === 0 ) {
            $comma = strpos( $input, ',' );
            if ( $comma === false ) {
                return new WP_Error( 'invalid_data_uri', 'Invalid data URI for image.' );
            }
            $decoded = base64_decode( substr( $input, $comma + 1 ) );
            if ( false === $decoded ) {
                return new WP_Error( 'decode_failed', 'Failed to decode image data URI.' );
            }
            return $decoded;
        }

        // Remote URL.
        if ( preg_match( '#^https?://#i', $input ) ) {
            $response = wp_remote_get( $input, [ 'timeout' => 60 ] );
            if ( is_wp_error( $response ) ) {
                return $response;
            }
            $code = wp_remote_retrieve_response_code( $response );
            if ( $code < 200 || $code >= 300 ) {
                return new WP_Error( 'image_fetch_failed', 'Failed to fetch image: HTTP ' . $code );
            }
            return wp_remote_retrieve_body( $response );
        }

        // Local file path (e.g. tmp file from OpenAI previous step).
        if ( file_exists( $input ) ) {
            $bytes = file_get_contents( $input );
            if ( false === $bytes ) {
                return new WP_Error( 'read_failed', 'Failed to read local image file.' );
            }
            return $bytes;
        }

        // Assume raw base64.
        $decoded = base64_decode( $input, true );
        if ( false === $decoded ) {
            return new WP_Error( 'invalid_image', 'Image input is not a URL, data URI, file path, or base64.' );
        }
        return $decoded;

    }

    /**
     * Build a multipart/form-data body.
     *
     * @param string $boundary Boundary string.
     * @param array  $fields   Array of [ name => string, value => string ].
     * @param array  $files    Array of [ name, filename, content, type ].
     * @return string Raw body.
     */
    private static function build_multipart_body( $boundary, array $fields, array $files ) {

        $body = '';
        $eol  = "\r\n";

        foreach ( $fields as $field ) {
            $body .= '--' . $boundary . $eol;
            $body .= 'Content-Disposition: form-data; name="' . $field['name'] . '"' . $eol . $eol;
            $body .= $field['value'] . $eol;
        }

        foreach ( $files as $file ) {
            $body .= '--' . $boundary . $eol;
            $body .= 'Content-Disposition: form-data; name="' . $file['name'] . '"; filename="' . $file['filename'] . '"' . $eol;
            $body .= 'Content-Type: ' . $file['type'] . $eol . $eol;
            $body .= $file['content'] . $eol;
        }

        $body .= '--' . $boundary . '--' . $eol;

        return $body;

    }

}
