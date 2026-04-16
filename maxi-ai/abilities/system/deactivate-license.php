<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/deactivate-license',
        [
            'label'       => 'Deactivate License',
            'description' => 'Deactivate the current Maxi AI Pro license on this site. Clears the stored key and reverts to the free tier.',
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

                $stored_key = Maxi_AI_License_Manager::get_stored_key();

                if ( empty( $stored_key ) ) {
                    return maxi_ai_response( false, [], 'No license is currently active.' );
                }

                $status = Maxi_AI_License_Manager::deactivate();

                return maxi_ai_response( true, [
                    'status' => $status->status,
                    'message' => 'License deactivated. Site is now on the free tier.',
                ] );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
