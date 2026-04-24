<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action(
    'wp_abilities_api_init',
    function () {

        wp_register_ability(
            'maxi/get-site-instructions',
            [
                'label'       => 'Get Site Instructions',
                'description' => 'Return the contents of CLAUDE.md from the site root (ABSPATH). Returns success:false with "CLAUDE.md not found" if the file does not exist.',
                'category'    => 'system',

                'meta' => [
                    'show_in_rest'  => true,
                    'mcp'           => [ 'public' => true ],
                    'feature_group' => 'session_system',
                ],

                'input_schema' => [
                    'type'       => 'object',
                    'properties' => [],
                    'required'   => [],
                ],

                'execute_callback' => function () {

                    $file = ABSPATH . 'CLAUDE.md';

                    if ( ! file_exists( $file ) ) {

                        return maxi_ai_response(
                            false,
                            [],
                            'CLAUDE.md not found'
                        );

                    }

                    return maxi_ai_response(
                        true,
                        [
                            'content' => file_get_contents( $file ),
                        ]
                    );

                },

                'permission_callback' => function () {
                    return current_user_can( 'read' );
                },
            ]
        );

    }
);