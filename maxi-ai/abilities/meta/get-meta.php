<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-meta',
        [
            'label'       => 'Get Meta',
            'description' => 'Retrieve a meta value for a post, term, or user.',
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
                        'description' => 'The object ID (post ID, term ID, or user ID).',
                    ],
                    'meta_key' => [
                        'type'        => 'string',
                        'description' => 'The meta key. Omit to retrieve all meta.',
                    ],
                ],
                'required' => [ 'object_type', 'object_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $object_type = sanitize_key( $input['object_type'] );
                $object_id   = intval( $input['object_id'] ?? 0 );
                $meta_key    = isset( $input['meta_key'] ) ? sanitize_text_field( $input['meta_key'] ) : '';

                $functions = [
                    'post' => 'get_post_meta',
                    'term' => 'get_term_meta',
                    'user' => 'get_user_meta',
                ];

                if ( ! isset( $functions[ $object_type ] ) ) {
                    return maxi_ai_response( false, [], 'Invalid object type: ' . $object_type );
                }

                $get_meta = $functions[ $object_type ];

                // Object-level permission check.
                $auth = maxi_ai_verify_meta_access( $object_type, $object_id, 'read' );
                if ( $auth !== true ) {
                    return $auth;
                }

                if ( ! empty( $meta_key ) ) {
                    $value = $get_meta( $object_id, $meta_key, true );

                    return maxi_ai_response(
                        true,
                        [
                            'object_type' => $object_type,
                            'object_id'   => $object_id,
                            'meta_key'    => $meta_key,
                            'meta_value'  => $value,
                        ]
                    );
                }

                $all_meta = $get_meta( $object_id );
                $clean    = [];

                foreach ( $all_meta as $key => $values ) {
                    $clean[ $key ] = count( $values ) === 1 ? $values[0] : $values;
                }

                return maxi_ai_response(
                    true,
                    [
                        'object_type' => $object_type,
                        'object_id'   => $object_id,
                        'meta'        => $clean,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'read' );
            },

        ]
    );

} );
