<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/activate-license',
        [
            'label'       => 'Activate License',
            'description' => 'Activate a Maxi AI Pro license key on this site. Returns the license status after activation.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'license_key' => [
                        'type'        => 'string',
                        'description' => 'The license key to activate (e.g. MAXI-XXXX-XXXX-XXXX-XXXX).',
                    ],
                ],
                'required' => [ 'license_key' ],
            ],

            'execute_callback' => function ( $input ) {

                $key = is_string( $input['license_key'] ?? null ) ? trim( $input['license_key'] ) : '';

                if ( $key === '' ) {
                    return maxi_ai_response( false, [], 'License key is required.' );
                }

                $status = Maxi_AI_License_Manager::activate( $key );

                return maxi_ai_response(
                    $status->is_valid,
                    [
                        'status'  => $status->status,
                        'plan'    => $status->plan,
                        'domain'  => $status->licensed_domain,
                        'key'     => $status->license_key_masked,
                    ],
                    $status->is_valid ? null : ( $status->error ?: 'Activation failed.' )
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
