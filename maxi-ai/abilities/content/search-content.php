<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/search-content',
        [
            'label'       => 'Search Content',
            'description' => 'Search posts, pages, or custom post type entries by keyword, taxonomy, meta, author, or date. Searches all post types by default, including non-public ones.',
            'category'    => 'content',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'content_read',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'search' => [
                        'type'        => 'string',
                        'description' => 'Search keyword.',
                    ],
                    'post_type' => [
                        'type'        => 'string',
                        'description' => 'Post type to search. Default "any" (all types).',
                    ],
                    'status' => [
                        'type'        => 'string',
                        'description' => 'Filter by status. Default "publish".',
                    ],
                    'taxonomy' => [
                        'type'        => 'string',
                        'description' => 'Taxonomy to filter by (requires "terms" parameter).',
                    ],
                    'terms' => [
                        'type'        => 'array',
                        'description' => 'Term slugs or IDs to filter by (requires "taxonomy").',
                        'items'       => [ 'type' => 'string' ],
                    ],
                    'meta_key' => [
                        'type'        => 'string',
                        'description' => 'Meta key to filter by.',
                    ],
                    'meta_value' => [
                        'type'        => 'string',
                        'description' => 'Meta value to filter by.',
                    ],
                    'author' => [
                        'type'        => 'integer',
                        'description' => 'Filter by author user ID.',
                    ],
                    'date_after' => [
                        'type'        => 'string',
                        'description' => 'Posts published after this date (Y-m-d).',
                    ],
                    'date_before' => [
                        'type'        => 'string',
                        'description' => 'Posts published before this date (Y-m-d).',
                    ],
                    'per_page' => [
                        'type'        => 'integer',
                        'description' => 'Number of results. Default 20, max 100.',
                    ],
                    'page' => [
                        'type'        => 'integer',
                        'description' => 'Page number. Default 1.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                $post_type = sanitize_key( $input['post_type'] ?? 'any' );

                if ( $post_type === 'any' ) {
                    $all_types = get_post_types( [], 'names' );
                    $excluded  = [ 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset', 'oembed_cache', 'wp_block', 'wp_template', 'wp_template_part', 'wp_global_styles', 'wp_navigation', 'wp_font_family', 'wp_font_face', 'user_request' ];
                    $post_type = array_values( array_diff( $all_types, $excluded ) );
                } elseif ( ! post_type_exists( $post_type ) ) {
                    return maxi_ai_response( false, [], 'Invalid post type: ' . $post_type );
                }

                $per_page = min( intval( $input['per_page'] ?? 20 ), 100 );

                $args = [
                    'post_type'      => $post_type,
                    'post_status'    => sanitize_key( $input['status'] ?? 'publish' ),
                    'posts_per_page' => $per_page,
                    'paged'          => max( 1, intval( $input['page'] ?? 1 ) ),
                ];

                if ( ! empty( $input['search'] ) ) {
                    $args['s'] = sanitize_text_field( $input['search'] );
                }

                if ( ! empty( $input['taxonomy'] ) && ! empty( $input['terms'] ) ) {
                    $taxonomy = sanitize_key( $input['taxonomy'] );
                    $terms    = array_map( 'sanitize_text_field', (array) $input['terms'] );

                    $args['tax_query'] = [
                        [
                            'taxonomy' => $taxonomy,
                            'field'    => is_numeric( $terms[0] ) ? 'term_id' : 'slug',
                            'terms'    => $terms,
                        ],
                    ];
                }

                if ( ! empty( $input['meta_key'] ) ) {
                    $args['meta_key']   = sanitize_key( $input['meta_key'] );
                    $args['meta_value'] = sanitize_text_field( $input['meta_value'] ?? '' );
                }

                if ( isset( $input['author'] ) ) {
                    $args['author'] = intval( $input['author'] );
                }

                if ( ! empty( $input['date_after'] ) || ! empty( $input['date_before'] ) ) {
                    $date_query = [];

                    if ( ! empty( $input['date_after'] ) ) {
                        $date_query['after'] = sanitize_text_field( $input['date_after'] );
                    }

                    if ( ! empty( $input['date_before'] ) ) {
                        $date_query['before'] = sanitize_text_field( $input['date_before'] );
                    }

                    $args['date_query'] = [ $date_query ];
                }

                $query = new WP_Query( $args );
                $items = [];

                foreach ( $query->posts as $post ) {
                    $items[] = [
                        'post_id'   => $post->ID,
                        'post_type' => $post->post_type,
                        'title'     => $post->post_title,
                        'slug'      => $post->post_name,
                        'status'    => $post->post_status,
                        'date'      => $post->post_date,
                        'author'    => (int) $post->post_author,
                        'url'       => get_permalink( $post->ID ),
                    ];
                }

                return maxi_ai_response(
                    true,
                    [
                        'items'       => $items,
                        'total'       => (int) $query->found_posts,
                        'total_pages' => (int) $query->max_num_pages,
                        'page'        => max( 1, intval( $input['page'] ?? 1 ) ),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'read' );
            },

        ]
    );

} );
