<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/generate-image-ai-batch',
        [
            'label'       => 'Generate Images (AI Batch)',
            'description' => 'Submit a batch image generation job. Creates a background job that generates images from text prompts using the configured AI provider (OpenAI, Replicate, BFL, or local). Returns a job ID immediately — use maxi/get-job-status to check progress. Images are sideloaded into the WordPress media library.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'ai_generation',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'items' => [
                        'type'        => 'array',
                        'description' => 'Array of image generation requests.',
                        'items'       => [
                            'type'       => 'object',
                            'properties' => [
                                'prompt' => [
                                    'type'        => 'string',
                                    'description' => 'The text prompt for image generation.',
                                ],
                                'size' => [
                                    'type'        => 'string',
                                    'description' => 'Image size (e.g. "1024x1024", "1792x1024"). Optional.',
                                ],
                                'style' => [
                                    'type'        => 'string',
                                    'description' => 'Image style (e.g. "natural", "vivid"). Optional.',
                                ],
                                'title' => [
                                    'type'        => 'string',
                                    'description' => 'Title for the WordPress attachment. Optional.',
                                ],
                                'alt_text' => [
                                    'type'        => 'string',
                                    'description' => 'Alt text for the WordPress attachment. Optional.',
                                ],
                            ],
                            'required' => [ 'prompt' ],
                        ],
                    ],
                    'provider' => [
                        'type'        => 'string',
                        'description' => 'AI provider to use (e.g. "openai", "replicate", "bfl", "local"). Optional — uses configured default.',
                    ],
                    'priority' => [
                        'type'        => 'integer',
                        'description' => 'Job priority: 1=urgent, 5=high, 10=normal (default), 20=low.',
                    ],
                    'parent_id' => [
                        'type'        => 'integer',
                        'description' => 'Parent post ID to attach generated images to. Optional.',
                    ],
                ],
                'required' => [ 'items' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'Maxi_AI_Job_Manager' ) ) {
                    return maxi_ai_response( false, [], 'Maxi AI batch system is not loaded.' );
                }

                $items = $input['items'] ?? [];

                if ( empty( $items ) || ! is_array( $items ) ) {
                    return maxi_ai_response( false, [], 'At least one item with a prompt is required.' );
                }

                // Sanitize items.
                $sanitized_items = [];

                foreach ( $items as $item ) {
                    $prompt = sanitize_text_field( $item['prompt'] ?? '' );

                    if ( empty( $prompt ) ) {
                        continue;
                    }

                    $sanitized = [ 'prompt' => $prompt ];

                    if ( ! empty( $item['size'] ) ) {
                        $sanitized['size'] = sanitize_text_field( $item['size'] );
                    }

                    if ( ! empty( $item['style'] ) ) {
                        $sanitized['style'] = sanitize_text_field( $item['style'] );
                    }

                    if ( ! empty( $item['title'] ) ) {
                        $sanitized['title'] = sanitize_text_field( $item['title'] );
                    }

                    if ( ! empty( $item['alt_text'] ) ) {
                        $sanitized['alt_text'] = sanitize_text_field( $item['alt_text'] );
                    }

                    if ( ! empty( $input['parent_id'] ) ) {
                        $sanitized['parent_id'] = intval( $input['parent_id'] );
                    }

                    $sanitized_items[] = $sanitized;
                }

                if ( empty( $sanitized_items ) ) {
                    return maxi_ai_response( false, [], 'No valid items with prompts found.' );
                }

                // Job-level params.
                $params = [];

                if ( ! empty( $input['provider'] ) ) {
                    $params['provider'] = sanitize_key( $input['provider'] );
                }

                $priority = intval( $input['priority'] ?? 10 );

                $result = Maxi_AI_Job_Manager::create_job(
                    'image_generation',
                    $sanitized_items,
                    $params,
                    $priority
                );

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
