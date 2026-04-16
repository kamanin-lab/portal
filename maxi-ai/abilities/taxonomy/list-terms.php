<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-terms',
        [
            'label'       => 'List Terms',
            'description' => 'List terms in a taxonomy with optional filters.',
            'category'    => 'taxonomy',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'taxonomy' => [
                        'type'        => 'string',
                        'description' => 'The taxonomy (e.g. category, post_tag, product_cat).',
                    ],
                    'hide_empty' => [
                        'type'        => 'boolean',
                        'description' => 'Hide terms with no posts. Default false.',
                    ],
                    'parent' => [
                        'type'        => 'integer',
                        'description' => 'Filter by parent term ID. Use 0 for top-level only.',
                    ],
                    'search' => [
                        'type'        => 'string',
                        'description' => 'Search terms by name.',
                    ],
                    'orderby' => [
                        'type'        => 'string',
                        'description' => 'Order by field. Default "name".',
                        'enum'        => [ 'name', 'slug', 'term_id', 'count' ],
                    ],
                    'order' => [
                        'type'        => 'string',
                        'description' => 'Sort direction. Default "ASC".',
                        'enum'        => [ 'ASC', 'DESC' ],
                    ],
                    'per_page' => [
                        'type'        => 'integer',
                        'description' => 'Number of results. Default 100, max 500.',
                    ],
                ],
                'required' => [ 'taxonomy' ],
            ],

            'execute_callback' => function ( $input ) {

                $taxonomy = sanitize_key( $input['taxonomy'] );

                if ( ! taxonomy_exists( $taxonomy ) ) {
                    return maxi_ai_response( false, [], 'Invalid taxonomy: ' . $taxonomy );
                }

                $args = [
                    'taxonomy'   => $taxonomy,
                    'hide_empty' => (bool) ( $input['hide_empty'] ?? false ),
                    'number'     => min( intval( $input['per_page'] ?? 100 ), 500 ),
                    'orderby'    => sanitize_key( $input['orderby'] ?? 'name' ),
                    'order'      => strtoupper( sanitize_key( $input['order'] ?? 'ASC' ) ),
                ];

                if ( isset( $input['parent'] ) ) {
                    $args['parent'] = intval( $input['parent'] );
                }

                if ( ! empty( $input['search'] ) ) {
                    $args['search'] = sanitize_text_field( $input['search'] );
                }

                $terms = get_terms( $args );

                if ( is_wp_error( $terms ) ) {
                    return maxi_ai_response( false, [], $terms->get_error_message() );
                }

                $items = [];

                foreach ( $terms as $term ) {
                    $items[] = [
                        'term_id'     => $term->term_id,
                        'name'        => $term->name,
                        'slug'        => $term->slug,
                        'description' => $term->description,
                        'parent'      => (int) $term->parent,
                        'count'       => (int) $term->count,
                    ];
                }

                return maxi_ai_response(
                    true,
                    [
                        'items'    => $items,
                        'taxonomy' => $taxonomy,
                        'total'    => count( $items ),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'read' );
            },

        ]
    );

} );
