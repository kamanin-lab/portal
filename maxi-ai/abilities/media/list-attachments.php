<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-attachments',
        [
            'label'       => 'List Attachments',
            'description' => 'List media attachments. Filter by mime_type, parent_id, or search text. '
                           . 'Paginate via per_page (default 20, max 100) and page. '
                           . 'Sort via orderby (date, title, ID, modified, rand) and order (ASC/DESC). '
                           . 'Note: when orderby=rand the order parameter has no effect — random ordering has no direction.',
            'category'    => 'media',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'media_basic',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'mime_type' => [
                        'type'        => 'string',
                        'description' => 'Filter by MIME type (e.g. "image", "image/jpeg", "application/pdf").',
                    ],
                    'parent_id' => [
                        'type'        => 'integer',
                        'description' => 'Filter by parent post ID. Use 0 for unattached.',
                    ],
                    'search' => [
                        'type'        => 'string',
                        'description' => 'Search by title or filename.',
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
                        'enum'        => [ 'date', 'title', 'ID', 'modified', 'rand' ],
                    ],
                    'order' => [
                        'type'        => 'string',
                        'description' => 'Sort direction: "ASC" or "DESC" (case-insensitive). Default "DESC". Ignored when orderby=rand.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                $per_page = min( intval( $input['per_page'] ?? 20 ), 100 );

                $allowed_orderby = [ 'date', 'title', 'ID', 'modified', 'rand' ];

                $args = [
                    'post_type'      => 'attachment',
                    'post_status'    => 'inherit',
                    'posts_per_page' => $per_page,
                    'paged'          => max( 1, intval( $input['page'] ?? 1 ) ),
                    'orderby'        => maxi_ai_normalize_orderby( $input['orderby'] ?? null, $allowed_orderby, 'date' ),
                    'order'          => maxi_ai_normalize_order( $input['order'] ?? null, 'DESC' ),
                ];

                if ( ! empty( $input['mime_type'] ) ) {
                    $args['post_mime_type'] = sanitize_text_field( $input['mime_type'] );
                }

                if ( isset( $input['parent_id'] ) ) {
                    $args['post_parent'] = intval( $input['parent_id'] );
                }

                if ( ! empty( $input['search'] ) ) {
                    $args['s'] = sanitize_text_field( $input['search'] );
                }

                $query = new WP_Query( $args );
                $items = [];

                foreach ( $query->posts as $post ) {
                    $items[] = [
                        'attachment_id' => $post->ID,
                        'title'         => $post->post_title,
                        'mime_type'     => $post->post_mime_type,
                        'url'           => wp_get_attachment_url( $post->ID ),
                        'parent_id'     => (int) $post->post_parent,
                        'date'          => $post->post_date,
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
