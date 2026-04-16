<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/bulk-update-meta',
        [
            'label'       => 'Bulk Update Meta',
            'description' => 'Set multiple meta key-value pairs on a post, term, or user in one call.',
            'category'    => 'meta',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'object_type' => [
                        'type'        => 'string',
                        'description' => 'The object type.',
                        'enum'        => [ 'post', 'term', 'user' ],
                    ],
                    'object_id' => [
                        'type'        => 'integer',
                        'description' => 'The object ID.',
                    ],
                    'meta' => [
                        'type'        => 'object',
                        'description' => 'Key-value pairs to set (e.g. {"color": "red", "size": "large"}).',
                    ],
                ],
                'required' => [ 'object_type', 'object_id', 'meta' ],
            ],

            'execute_callback' => function ( $input ) {

                $object_type = sanitize_key( $input['object_type'] );
                $object_id   = intval( $input['object_id'] ?? 0 );
                $meta        = (array) ( $input['meta'] ?? [] );

                $functions = [
                    'post' => 'update_post_meta',
                    'term' => 'update_term_meta',
                    'user' => 'update_user_meta',
                ];

                if ( ! isset( $functions[ $object_type ] ) ) {
                    return maxi_ai_response( false, [], 'Invalid object type. Allowed: post, term, user.' );
                }

                // Object-level permission check.
                $auth = maxi_ai_verify_meta_access( $object_type, $object_id, 'write' );
                if ( $auth !== true ) {
                    return $auth;
                }

                if ( empty( $meta ) ) {
                    return maxi_ai_response( false, [], 'No meta key-value pairs provided.' );
                }

                $update_meta = $functions[ $object_type ];
                $updated     = [];
                $failed      = [];

                foreach ( $meta as $key => $value ) {
                    $sanitized_key = sanitize_text_field( $key );

                    if ( is_string( $value ) ) {
                        $value = sanitize_text_field( $value );
                    }

                    $result = $update_meta( $object_id, $sanitized_key, $value );

                    if ( $result === false ) {
                        $failed[] = $sanitized_key;
                    } else {
                        $updated[] = $sanitized_key;
                    }
                }

                if ( ! empty( $failed ) && empty( $updated ) ) {
                    return maxi_ai_response( false, [], 'Failed to update all meta keys: ' . implode( ', ', $failed ) );
                }

                Maxi_AI_Audit_Log::record(
                    'meta',
                    'meta_bulk_updated',
                    get_current_user_id(),
                    $object_type . ':' . $object_id,
                    [ 'updated_keys' => $updated, 'failed_keys' => $failed ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'object_type' => $object_type,
                        'object_id'   => $object_id,
                        'updated'     => $updated,
                        'failed'      => $failed,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
