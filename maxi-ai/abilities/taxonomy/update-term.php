<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/update-term',
        [
            'label'       => 'Update Term',
            'description' => 'Update an existing term. Send only the fields to change.',
            'category'    => 'taxonomy',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'taxonomy',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'term_id' => [
                        'type'        => 'integer',
                        'description' => 'The term ID.',
                    ],
                    'taxonomy' => [
                        'type'        => 'string',
                        'description' => 'The taxonomy.',
                    ],
                    'name' => [
                        'type'        => 'string',
                        'description' => 'New term name.',
                    ],
                    'slug' => [
                        'type'        => 'string',
                        'description' => 'New term slug.',
                    ],
                    'description' => [
                        'type'        => 'string',
                        'description' => 'New term description.',
                    ],
                    'parent' => [
                        'type'        => 'integer',
                        'description' => 'New parent term ID.',
                    ],
                ],
                'required' => [ 'term_id', 'taxonomy' ],
            ],

            'execute_callback' => function ( $input ) {

                $term_id  = intval( $input['term_id'] ?? 0 );
                $taxonomy = sanitize_key( $input['taxonomy'] );

                if ( ! taxonomy_exists( $taxonomy ) ) {
                    return maxi_ai_response( false, [], 'Invalid taxonomy: ' . $taxonomy );
                }

                $args = [];

                if ( isset( $input['name'] ) ) {
                    $args['name'] = sanitize_text_field( $input['name'] );
                }

                if ( isset( $input['slug'] ) ) {
                    $args['slug'] = sanitize_title( $input['slug'] );
                }

                if ( isset( $input['description'] ) ) {
                    $args['description'] = sanitize_textarea_field( $input['description'] );
                }

                if ( isset( $input['parent'] ) ) {
                    $parent_id = intval( $input['parent'] );
                    if ( $parent_id > 0 ) {
                        $parent_term = get_term( $parent_id, $taxonomy );
                        if ( ! $parent_term || is_wp_error( $parent_term ) ) {
                            return maxi_ai_response( false, [], 'Parent term not found: ' . $parent_id );
                        }
                    }
                    $args['parent'] = $parent_id;
                }

                if ( empty( $args ) ) {
                    return maxi_ai_response( false, [], 'No fields to update.' );
                }

                $result = wp_update_term( $term_id, $taxonomy, $args );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                Maxi_AI_Audit_Log::record(
                    'taxonomy',
                    'term_updated',
                    get_current_user_id(),
                    'term:' . $result['term_id'],
                    [ 'taxonomy' => $taxonomy, 'updated_fields' => array_keys( $args ) ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'term_id'  => (int) $result['term_id'],
                        'taxonomy' => $taxonomy,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_categories' );
            },

        ]
    );

} );
