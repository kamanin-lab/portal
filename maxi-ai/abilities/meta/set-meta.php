<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/set-meta',
        [
            'label'       => 'Set Meta',
            'description' => 'Set (add or update) a meta value for a post, term, or user.',
            'category'    => 'meta',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'meta_basic',
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
                    'meta_key' => [
                        'type'        => 'string',
                        'description' => 'The meta key.',
                    ],
                    'meta_value' => [
                        'description' => 'The meta value (string, number, boolean, array, or object).',
                    ],
                ],
                'required' => [ 'object_type', 'object_id', 'meta_key', 'meta_value' ],
            ],

            'execute_callback' => function ( $input ) {

                $object_type = sanitize_key( $input['object_type'] );
                $object_id   = intval( $input['object_id'] ?? 0 );
                $meta_key    = sanitize_text_field( $input['meta_key'] ?? '' );
                $meta_value  = $input['meta_value'] ?? '';

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

                if ( is_string( $meta_value ) ) {
                    $meta_value = sanitize_text_field( $meta_value );
                }

                $update_meta = $functions[ $object_type ];
                $result      = $update_meta( $object_id, $meta_key, $meta_value );

                if ( $result === false ) {
                    return maxi_ai_response( false, [], 'Failed to set meta.' );
                }

                Maxi_AI_Audit_Log::record(
                    'meta',
                    'meta_set',
                    get_current_user_id(),
                    $object_type . ':' . $object_id,
                    [ 'meta_key' => $meta_key ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'object_type' => $object_type,
                        'object_id'   => $object_id,
                        'meta_key'    => $meta_key,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
