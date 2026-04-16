<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/flush-cache',
        [
            'label'       => 'Flush Cache',
            'description' => 'Flush the WordPress object cache.',
            'category'    => 'development',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [],
                'required'   => [],
            ],

            'execute_callback' => function () {

                wp_cache_flush();

                return maxi_ai_response(
                    true,
                    [
                        'flushed' => true,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
