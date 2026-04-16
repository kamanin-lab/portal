<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-site-info',
        [
            'label'       => 'Get Site Info',
            'description' => 'Returns site name, URL, description, language, timezone, and WordPress version.',
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

                $data = [
                    'name'        => get_bloginfo( 'name' ),
                    'description' => get_bloginfo( 'description' ),
                    'url'         => home_url(),
                    'admin_url'   => admin_url(),
                    'language'    => get_locale(),
                    'timezone'    => wp_timezone_string(),
                    'wp_version'  => get_bloginfo( 'version' ),
                    'multisite'   => is_multisite(),
                ];

                // Maxi AI version and license tier.
                if ( class_exists( 'Maxi_AI' ) ) {
                    $data['maxi_ai_version'] = Maxi_AI::VERSION;
                }
                if ( class_exists( 'Maxi_AI_License_Manager' ) ) {
                    $status = Maxi_AI_License_Manager::get_status();
                    $data['maxi_ai_license'] = [
                        'tier'   => $status->grants_pro() ? 'pro' : 'free',
                        'status' => $status->status,
                    ];
                }

                return maxi_ai_response( true, $data );

            },

            'permission_callback' => function () {
                return current_user_can( 'read' );
            },

        ]
    );

} );
