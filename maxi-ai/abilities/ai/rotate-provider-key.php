<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/rotate-provider-key',
        [
            'label'       => 'Rotate Provider API Key',
            'description' => 'Rotate a provider API key (or the local endpoint URL). Validates the new credential with a live test call before overwriting the existing one — if validation fails, the old credential stays in place and a validation_failed event is written to the audit log. On success, the new credential is stored, last_rotated_at is stamped, the config cache is flushed, and a rotated event is recorded.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'provider' => [
                        'type'        => 'string',
                        'enum'        => [ 'openai', 'anthropic', 'replicate', 'bfl', 'local' ],
                        'description' => 'Provider whose credential should be rotated.',
                    ],
                    'new_key' => [
                        'type'        => 'string',
                        'description' => 'New API key. For provider "local", pass the new endpoint URL instead.',
                    ],
                ],
                'required' => [ 'provider', 'new_key' ],
            ],

            'execute_callback' => function ( $input ) {

                $provider = sanitize_key( $input['provider'] ?? '' );
                $new_key  = is_string( $input['new_key'] ?? null ) ? trim( $input['new_key'] ) : '';

                if ( $provider === '' || $new_key === '' ) {
                    return maxi_ai_response( false, [], 'Both provider and new_key are required.' );
                }

                $result = Maxi_AI_Key_Audit::rotate( $provider, $new_key, get_current_user_id() );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                return maxi_ai_response( true, $result );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
