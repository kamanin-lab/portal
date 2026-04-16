<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-provider-keys',
        [
            'label'       => 'List Provider Credentials',
            'description' => 'List all AI provider credentials with masked key prefixes, rotation timestamps, age in days, last-used timestamps, and a stale flag (keys older than 180 days). Never returns raw keys.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [],
            ],

            'execute_callback' => function () {

                return maxi_ai_response( true, [
                    'providers' => Maxi_AI_Key_Audit::get_status(),
                ] );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
