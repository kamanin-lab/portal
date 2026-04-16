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
            'description' => 'List WooCommerce coupons with optional filters: discount type, search by code.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
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
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Coupon' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $per_page = min( intval( $input['per_page'] ?? 20 ), 100 );
                $page     = max( intval( $input['page'] ?? 1 ), 1 );

                $query_args = [
                    'post_type'      => 'shop_coupon',
                    'post_status'    => 'publish',
                    'posts_per_page' => $per_page,
                    'paged'          => $page,
                    'orderby'        => 'date',
                    'order'          => 'DESC',
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
