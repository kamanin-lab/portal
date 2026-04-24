<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/manage-mask-fields',
        [
            'label'       => 'Manage Data Mask Fields',
            'description' => 'Add, remove, or list field names in the GDPR data masking list. '
                           . 'Any ability response containing a key matching a masked field will have '
                           . 'its value partially redacted (e.g. "John" → "J***") before reaching the agent. '
                           . 'Seeded with common PII fields by default (first_name, email, phone, etc.).',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'dev_tools_admin',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'action' => [
                        'type'        => 'string',
                        'enum'        => [ 'add', 'remove', 'list' ],
                        'description' => 'The operation: "add" fields to the mask list, "remove" fields from it, or "list" the current masked fields.',
                    ],
                    'fields' => [
                        'type'        => 'array',
                        'items'       => [ 'type' => 'string' ],
                        'description' => 'Field names to add or remove. Required for "add" and "remove" actions, ignored for "list".',
                    ],
                ],
                'required' => [ 'action' ],
            ],

            'execute_callback' => function ( $input ) {

                $action     = sanitize_key( $input['action'] ?? '' );
                $option_key = Maxi_AI_Data_Masking::OPTION_KEY;

                if ( ! in_array( $action, [ 'add', 'remove', 'list' ], true ) ) {
                    return maxi_ai_response( false, [], 'Invalid action. Use "add", "remove", or "list".' );
                }

                $mask_fields = get_option( $option_key, [] );

                if ( ! is_array( $mask_fields ) ) {
                    $mask_fields = [];
                }

                // List — return the current state.
                if ( $action === 'list' ) {
                    return maxi_ai_response(
                        true,
                        [
                            'mask_fields' => $mask_fields,
                            'count'       => count( $mask_fields ),
                        ]
                    );
                }

                // Add / Remove — require fields.
                $fields = $input['fields'] ?? [];

                if ( ! is_array( $fields ) || empty( $fields ) ) {
                    return maxi_ai_response( false, [], 'Missing "fields" array for action "' . $action . '".' );
                }

                $sanitized = array_filter(
                    array_map( 'sanitize_text_field', $fields ),
                    function ( $f ) {
                        return $f !== '';
                    }
                );

                if ( empty( $sanitized ) ) {
                    return maxi_ai_response( false, [], 'All provided fields were empty after sanitization.' );
                }

                if ( $action === 'add' ) {

                    $mask_fields = array_values( array_unique( array_merge( $mask_fields, $sanitized ) ) );
                    update_option( $option_key, $mask_fields );

                    Maxi_AI_Audit_Log::record(
                        'data_masking',
                        'mask_fields_updated',
                        get_current_user_id(),
                        'add',
                        [
                            'added_fields' => array_values( $sanitized ),
                            'mask_fields'  => $mask_fields,
                        ]
                    );

                    return maxi_ai_response(
                        true,
                        [
                            'added'       => array_values( $sanitized ),
                            'mask_fields' => $mask_fields,
                            'count'       => count( $mask_fields ),
                        ]
                    );

                }

                if ( $action === 'remove' ) {

                    $removed     = array_values( array_intersect( $mask_fields, $sanitized ) );
                    $mask_fields = array_values( array_diff( $mask_fields, $sanitized ) );
                    update_option( $option_key, $mask_fields );

                    Maxi_AI_Audit_Log::record(
                        'data_masking',
                        'mask_fields_updated',
                        get_current_user_id(),
                        'remove',
                        [
                            'removed_fields' => $removed,
                            'mask_fields'    => $mask_fields,
                        ]
                    );

                    return maxi_ai_response(
                        true,
                        [
                            'removed'     => $removed,
                            'mask_fields' => $mask_fields,
                            'count'       => count( $mask_fields ),
                        ]
                    );

                }

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
