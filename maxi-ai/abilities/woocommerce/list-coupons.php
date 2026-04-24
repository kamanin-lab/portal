<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-coupons',
        [
            'label'       => 'List Coupons',
            'description' => 'List WooCommerce coupons. Filter by discount_type or search (coupon code). '
                           . 'Paginate via per_page (default 20, max 100) and page. '
                           . 'Sort via orderby (date, title, id, menu_order, rand) and order (ASC/DESC). Default "date DESC". '
                           . 'Note: when orderby=rand the order parameter has no effect — random ordering has no direction.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'woocommerce_coupons',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'discount_type' => [
                        'type'        => 'string',
                        'description' => 'Filter by discount type.',
                        'enum'        => [ 'percent', 'fixed_cart', 'fixed_product' ],
                    ],
                    'search' => [
                        'type'        => 'string',
                        'description' => 'Search by coupon code.',
                    ],
                    'per_page' => [
                        'type'        => 'integer',
                        'description' => 'Results per page. Default 20, max 100.',
                    ],
                    'page' => [
                        'type'        => 'integer',
                        'description' => 'Page number. Default 1.',
                    ],
                    'orderby' => [
                        'type'        => 'string',
                        'description' => 'Order by field. Default "date". Use "rand" for random order — order direction is ignored when rand is used.',
                        'enum'        => [ 'date', 'title', 'id', 'menu_order', 'rand' ],
                    ],
                    'order' => [
                        'type'        => 'string',
                        'description' => 'Sort direction: "ASC" or "DESC" (case-insensitive). Default "DESC". Ignored when orderby=rand.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Coupon' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $per_page = min( intval( $input['per_page'] ?? 20 ), 100 );
                $page     = max( intval( $input['page'] ?? 1 ), 1 );

                $allowed_orderby = [ 'date', 'title', 'id', 'menu_order', 'rand' ];

                $query_args = [
                    'post_type'      => 'shop_coupon',
                    'post_status'    => 'publish',
                    'posts_per_page' => $per_page,
                    'paged'          => $page,
                    'orderby'        => maxi_ai_normalize_orderby( $input['orderby'] ?? null, $allowed_orderby, 'date' ),
                    'order'          => maxi_ai_normalize_order( $input['order'] ?? null, 'DESC' ),
                ];

                if ( ! empty( $input['search'] ) ) {
                    $query_args['s'] = sanitize_text_field( $input['search'] );
                }

                if ( ! empty( $input['discount_type'] ) ) {
                    $query_args['meta_query'] = [
                        [
                            'key'   => 'discount_type',
                            'value' => sanitize_key( $input['discount_type'] ),
                        ],
                    ];
                }

                $query = new WP_Query( $query_args );
                $items = [];

                foreach ( $query->posts as $post ) {
                    $coupon  = new WC_Coupon( $post->ID );
                    $items[] = [
                        'coupon_id'     => $coupon->get_id(),
                        'code'          => $coupon->get_code(),
                        'discount_type' => $coupon->get_discount_type(),
                        'amount'        => $coupon->get_amount(),
                        'usage_count'   => $coupon->get_usage_count(),
                        'usage_limit'   => $coupon->get_usage_limit(),
                        'expiry_date'   => $coupon->get_date_expires() ? $coupon->get_date_expires()->date( 'Y-m-d' ) : null,
                    ];
                }

                $total_pages = (int) $query->max_num_pages;

                return maxi_ai_response(
                    true,
                    [
                        'items'       => $items,
                        'total'       => (int) $query->found_posts,
                        'total_pages' => $total_pages,
                        'page'        => $page,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
