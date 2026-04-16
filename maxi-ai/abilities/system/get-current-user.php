<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-current-user',
        [
            'label'       => 'Get Current User',
            'description' => 'Returns details of the currently authenticated user.',
            'category'    => 'system',

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

                $user = wp_get_current_user();

                if ( ! $user || $user->ID === 0 ) {
                    return maxi_ai_response( false, [], 'No authenticated user.' );
                }

                return maxi_ai_response(
                    true,
                    [
                        'user_id'      => $user->ID,
                        'login'        => $user->user_login,
                        'email'        => $user->user_email,
                        'display_name' => $user->display_name,
                        'roles'        => (array) $user->roles,
                        'registered'   => $user->user_registered,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'read' );
            },

        ]
    );

} );
