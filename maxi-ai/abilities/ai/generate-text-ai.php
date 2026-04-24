<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/generate-text-ai',
        [
            'label'       => 'Generate Text (AI)',
            'description' => 'Generate text using AI. Returns the generated content immediately (synchronous). Supports OpenAI (GPT), Anthropic (Claude), OpenRouter (multi-model aggregator), and local providers. Use for single prompts where you need the result right away.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'ai_generation',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'prompt' => [
                        'type'        => 'string',
                        'description' => 'The text prompt / instructions for generation.',
                    ],
                    'system' => [
                        'type'        => 'string',
                        'description' => 'System message to set context or behavior. Optional.',
                    ],
                    'provider' => [
                        'type'        => 'string',
                        'description' => 'AI provider to use (e.g. "openai", "anthropic", "openrouter", "local"). Optional — uses configured default.',
                    ],
                    'model' => [
                        'type'        => 'string',
                        'description' => 'Model override (e.g. "gpt-4o", "claude-sonnet-4-20250514", "openai/gpt-4o-mini"). For OpenRouter, use vendor-prefixed slugs like "openai/gpt-4o-mini" or "anthropic/claude-sonnet-4-20250514". Optional — uses provider default.',
                    ],
                    'max_tokens' => [
                        'type'        => 'integer',
                        'description' => 'Maximum tokens in the response. Optional.',
                    ],
                    'temperature' => [
                        'type'        => 'number',
                        'description' => 'Sampling temperature (0.0 to 2.0). Lower = more focused, higher = more creative. Optional.',
                    ],
                ],
                'required' => [ 'prompt' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'Maxi_AI_Text_Generator' ) ) {
                    return maxi_ai_response( false, [], 'Maxi AI text generation service is not loaded.' );
                }

                $prompt = sanitize_text_field( $input['prompt'] ?? '' );

                if ( empty( $prompt ) ) {
                    return maxi_ai_response( false, [], 'A prompt is required.' );
                }

                $params = [ 'prompt' => $prompt ];

                if ( ! empty( $input['system'] ) ) {
                    $params['system'] = sanitize_text_field( $input['system'] );
                }

                if ( ! empty( $input['provider'] ) ) {
                    $params['provider'] = sanitize_key( $input['provider'] );
                }

                if ( ! empty( $input['model'] ) ) {
                    $params['model'] = sanitize_text_field( $input['model'] );
                }

                if ( isset( $input['max_tokens'] ) ) {
                    $params['max_tokens'] = intval( $input['max_tokens'] );
                }

                if ( isset( $input['temperature'] ) ) {
                    $params['temperature'] = floatval( $input['temperature'] );
                }

                $result = Maxi_AI_Text_Generator::generate( $params );

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
