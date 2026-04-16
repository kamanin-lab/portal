<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/generate-text-ai-batch',
        [
            'label'       => 'Generate Text (AI Batch)',
            'description' => 'Submit a batch text generation job. Creates a background job that generates text for multiple prompts. Returns a job ID immediately — use maxi/get-job-status to check progress.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'items' => [
                        'type'        => 'array',
                        'description' => 'Array of text generation requests.',
                        'items'       => [
                            'type'       => 'object',
                            'properties' => [
                                'prompt' => [
                                    'type'        => 'string',
                                    'description' => 'The text prompt / instructions.',
                                ],
                                'system' => [
                                    'type'        => 'string',
                                    'description' => 'System message. Optional.',
                                ],
                                'max_tokens' => [
                                    'type'        => 'integer',
                                    'description' => 'Maximum tokens. Optional.',
                                ],
                                'temperature' => [
                                    'type'        => 'number',
                                    'description' => 'Sampling temperature. Optional.',
                                ],
                            ],
                            'required' => [ 'prompt' ],
                        ],
                    ],
                    'provider' => [
                        'type'        => 'string',
                        'description' => 'AI provider (e.g. "openai", "anthropic", "local"). Optional — uses configured default.',
                    ],
                    'model' => [
                        'type'        => 'string',
                        'description' => 'Model override. Applied to all items. Optional.',
                    ],
                    'priority' => [
                        'type'        => 'integer',
                        'description' => 'Job priority: 1=urgent, 5=high, 10=normal (default), 20=low.',
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

                $sanitized_items = [];

                foreach ( $items as $item ) {
                    $prompt = sanitize_text_field( $item['prompt'] ?? '' );

                    if ( empty( $prompt ) ) {
                        continue;
                    }

                    $sanitized = [ 'prompt' => $prompt ];

                    if ( ! empty( $item['system'] ) ) {
                        $sanitized['system'] = sanitize_text_field( $item['system'] );
                    }

                    if ( isset( $item['max_tokens'] ) ) {
                        $sanitized['max_tokens'] = intval( $item['max_tokens'] );
                    }

                    if ( isset( $item['temperature'] ) ) {
                        $sanitized['temperature'] = floatval( $item['temperature'] );
                    }

                    $sanitized_items[] = $sanitized;
                }

                if ( empty( $sanitized_items ) ) {
                    return maxi_ai_response( false, [], 'No valid items with prompts found.' );
                }

                $params = [];

                if ( ! empty( $input['provider'] ) ) {
                    $params['provider'] = sanitize_key( $input['provider'] );
                }

                if ( ! empty( $input['model'] ) ) {
                    $params['model'] = sanitize_text_field( $input['model'] );
                }

                $priority = intval( $input['priority'] ?? 10 );

                $result = Maxi_AI_Job_Manager::create_job(
                    'text_generation',
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
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
