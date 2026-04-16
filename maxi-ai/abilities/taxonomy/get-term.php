<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-term',
        [
            'label'       => 'Get Term',
            'description' => 'Retrieve a single term by ID.',
            'category'    => 'taxonomy',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
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
                        'description' => 'The taxonomy the term belongs to.',
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

                $term = get_term( $term_id, $taxonomy );

                if ( is_wp_error( $term ) ) {
                    return maxi_ai_response( false, [], $term->get_error_message() );
                }

                if ( ! $term ) {
                    return maxi_ai_response( false, [], 'Term not found: ' . $term_id );
                }

                return maxi_ai_response(
                    true,
                    [
                        'term_id'     => $term->term_id,
                        'name'        => $term->name,
                        'slug'        => $term->slug,
                        'taxonomy'    => $term->taxonomy,
                        'description' => $term->description,
                        'parent'      => (int) $term->parent,
                        'count'       => (int) $term->count,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'read' );
            },

        ]
    );

} );
