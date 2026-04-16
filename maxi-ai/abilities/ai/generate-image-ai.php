<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/generate-image-ai',
        [
            'label'       => 'Generate Image (AI)',
            'description' => 'Generate a single image using AI and sideload it into the WordPress media library. Returns the result immediately (synchronous). Supports OpenAI (DALL-E), Replicate, BFL, and local providers. Use generate-image-ai-batch for multiple images in the background.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'prompt' => [
                        'type'        => 'string',
                        'description' => 'The text prompt for image generation.',
                    ],
                    'provider' => [
                        'type'        => 'string',
                        'description' => 'AI provider (e.g. "openai", "replicate", "bfl", "local"). Optional — uses configured default.',
                    ],
                    'size' => [
                        'type'        => 'string',
                        'description' => 'Image size (e.g. "1024x1024", "1792x1024"). Optional.',
                    ],
                    'style' => [
                        'type'        => 'string',
                        'description' => 'Image style (e.g. "natural", "vivid"). Optional.',
                    ],
                    'seed' => [
                        'type'        => 'integer',
                        'description' => 'Seed for reproducibility. Silently ignored by OpenAI (not supported). Optional.',
                    ],
                    'background' => [
                        'type'        => 'string',
                        'description' => 'Background handling. "transparent" produces a PNG with a real alpha channel (gpt-image-1 only — OpenAI provider; will auto-upgrade the model). Other providers (BFL/Replicate/Flux) cannot produce true transparency and will ignore this. Values: "transparent", "opaque", "auto". Optional.',
                        'enum'        => [ 'transparent', 'opaque', 'auto' ],
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'Title for the WordPress attachment. Optional.',
                    ],
                    'alt_text' => [
                        'type'        => 'string',
                        'description' => 'Alt text for the WordPress attachment. Optional.',
                    ],
                    'parent_id' => [
                        'type'        => 'integer',
                        'description' => 'Parent post ID to attach the image to. Optional.',
                    ],
                    'sideload' => [
                        'type'        => 'boolean',
                        'description' => 'Whether to sideload into the media library. Default true.',
                    ],
                ],
                'required' => [ 'prompt' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'Maxi_AI_Image_Generator' ) ) {
                    return maxi_ai_response( false, [], 'Maxi AI image generation service is not loaded.' );
                }

                $prompt = sanitize_text_field( $input['prompt'] ?? '' );

                if ( empty( $prompt ) ) {
                    return maxi_ai_response( false, [], 'A prompt is required.' );
                }

                $params = [ 'prompt' => $prompt ];

                if ( ! empty( $input['provider'] ) ) {
                    $params['provider'] = sanitize_key( $input['provider'] );
                }

                if ( ! empty( $input['size'] ) ) {
                    $params['size'] = sanitize_text_field( $input['size'] );
                }

                if ( ! empty( $input['style'] ) ) {
                    $params['style'] = sanitize_text_field( $input['style'] );
                }

                if ( isset( $input['seed'] ) && $input['seed'] !== '' ) {
                    $params['seed'] = intval( $input['seed'] );
                }

                if ( ! empty( $input['background'] ) ) {
                    $params['background'] = sanitize_key( $input['background'] );
                }

                if ( ! empty( $input['title'] ) ) {
                    $params['title'] = sanitize_text_field( $input['title'] );
                }

                if ( ! empty( $input['alt_text'] ) ) {
                    $params['alt_text'] = sanitize_text_field( $input['alt_text'] );
                }

                if ( isset( $input['parent_id'] ) ) {
                    $params['parent_id'] = intval( $input['parent_id'] );
                }

                if ( isset( $input['sideload'] ) ) {
                    $params['sideload'] = (bool) $input['sideload'];
                }

                $result = Maxi_AI_Image_Generator::generate( $params );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                return maxi_ai_response( true, $result );

            },

            'permission_callback' => function () {
                return current_user_can( 'upload_files' );
            },

        ]
    );

} );
