<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/verify-audit-chain',
        [
            'label'       => 'Verify Audit Chain',
            'description' => 'Verify the integrity of the audit log hash chain. Returns whether the chain is intact and, if broken, the ID of the first tampered entry.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'batch_size' => [
                        'type'        => 'integer',
                        'description' => 'Number of rows to process per batch. Default 500.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                $batch_size = isset( $input['batch_size'] ) ? max( 1, min( 5000, intval( $input['batch_size'] ) ) ) : 500;

                $result = Maxi_AI_Audit_Log::verify_chain( $batch_size );

                return maxi_ai_response( true, $result );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
