<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/create-term',
        [
            'label'       => 'Create Term',
            'description' => 'Create a new term in any taxonomy (category, tag, custom).',
            'category'    => 'taxonomy',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'taxonomy',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'taxonomy' => [
                        'type'        => 'string',
                        'description' => 'The taxonomy (e.g. category, post_tag, product_cat).',
                    ],
                    'name' => [
                        'type'        => 'string',
                        'description' => 'The term name.',
                    ],
                    'slug' => [
                        'type'        => 'string',
                        'description' => 'The term slug.',
                    ],
                    'description' => [
                        'type'        => 'string',
                        'description' => 'The term description.',
                    ],
                    'parent' => [
                        'type'        => 'integer',
                        'description' => 'Parent term ID (for hierarchical taxonomies).',
                    ],
                ],
                'required' => [ 'taxonomy', 'name' ],
            ],

            'execute_callback' => function ( $input ) {

                $taxonomy = sanitize_key( $input['taxonomy'] );

                if ( ! taxonomy_exists( $taxonomy ) ) {
                    return maxi_ai_response( false, [], 'Invalid taxonomy: ' . $taxonomy );
                }

                $args = [];

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

                $result = wp_insert_term(
                    sanitize_text_field( $input['name'] ),
                    $taxonomy,
                    $args
                );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                Maxi_AI_Audit_Log::record(
                    'taxonomy',
                    'term_created',
                    get_current_user_id(),
                    'term:' . $result['term_id'],
                    [ 'taxonomy' => $taxonomy, 'name' => sanitize_text_field( $input['name'] ) ]
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
