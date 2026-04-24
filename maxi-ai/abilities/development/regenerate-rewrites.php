<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/regenerate-rewrites',
        [
            'label'       => 'Regenerate Rewrites',
            'description' => 'Flush and regenerate WordPress rewrite rules (permalinks).',
            'category'    => 'development',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'dev_tools_basic',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [],
                'required'   => [],
            ],

            'execute_callback' => function () {

                flush_rewrite_rules();

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
