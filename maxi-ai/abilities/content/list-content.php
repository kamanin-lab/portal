<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-content',
        [
            'label'       => 'List Content',
            'description' => 'List posts, pages, or custom post type entries. Filter by post_type, status, author, parent. '
                           . 'Paginate via per_page (default 20, max 100) and page. '
                           . 'Sort via orderby (date, title, modified, ID, menu_order, name, author, rand) and order (ASC/DESC). '
                           . 'Note: when orderby=rand the order parameter has no effect — random ordering has no direction.',
            'category'    => 'content',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'content_read',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'post_type' => [
                        'type'        => 'string',
                        'description' => 'Post type to list. Default "post".',
                    ],
                    'status' => [
                        'type'        => 'string',
                        'description' => 'Filter by status. Default "publish".',
                    ],
                    'per_page' => [
                        'type'        => 'integer',
                        'description' => 'Number of results. Default 20, max 100.',
                    ],
                    'page' => [
                        'type'        => 'integer',
                        'description' => 'Page number. Default 1.',
                    ],
                    'orderby' => [
                        'type'        => 'string',
                        'description' => 'Order by field. Default "date". Use "rand" for random order — order direction is ignored when rand is used.',
                        'enum'        => [ 'date', 'title', 'modified', 'ID', 'menu_order', 'name', 'author', 'rand' ],
                    ],
                    'order' => [
                        'type'        => 'string',
                        'description' => 'Sort direction: "ASC" or "DESC" (case-insensitive). Default "DESC". Ignored when orderby=rand.',
                    ],
                    'author' => [
                        'type'        => 'integer',
                        'description' => 'Filter by author user ID.',
                    ],
                    'parent' => [
                        'type'        => 'integer',
                        'description' => 'Filter by parent post ID.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                $post_type = sanitize_key( $input['post_type'] ?? 'post' );

                if ( ! post_type_exists( $post_type ) ) {
                    return maxi_ai_response( false, [], 'Invalid post type: ' . $post_type );
                }

                $per_page = min( intval( $input['per_page'] ?? 20 ), 100 );

                $allowed_orderby = [ 'date', 'title', 'modified', 'ID', 'menu_order', 'name', 'author', 'rand' ];

                $args = [
                    'post_type'      => $post_type,
                    'post_status'    => sanitize_key( $input['status'] ?? 'publish' ),
                    'posts_per_page' => $per_page,
                    'paged'          => max( 1, intval( $input['page'] ?? 1 ) ),
                    'orderby'        => maxi_ai_normalize_orderby( $input['orderby'] ?? null, $allowed_orderby, 'date' ),
                    'order'          => maxi_ai_normalize_order( $input['order'] ?? null, 'DESC' ),
                ];

                if ( isset( $input['author'] ) ) {
                    $args['author'] = intval( $input['author'] );
                }

                if ( isset( $input['parent'] ) ) {
                    $args['post_parent'] = intval( $input['parent'] );
                }

                $query = new WP_Query( $args );
                $items = [];

                foreach ( $query->posts as $post ) {
                    $items[] = [
                        'post_id'   => $post->ID,
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
