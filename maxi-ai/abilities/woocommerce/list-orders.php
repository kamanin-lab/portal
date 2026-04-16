<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-orders',
        [
            'label'       => 'List Orders',
            'description' => 'List WooCommerce orders with filters: status, customer, date range. Returns order summaries with totals.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'status' => [
                        'type'        => 'string',
                        'description' => 'Order status filter (e.g. "processing", "completed"). Default "any".',
                    ],
                    'customer_id' => [
                        'type'        => 'integer',
                        'description' => 'Filter by customer user ID.',
                    ],
                    'date_after' => [
                        'type'        => 'string',
                        'description' => 'Orders created after this date (Y-m-d).',
                    ],
                    'date_before' => [
                        'type'        => 'string',
                        'description' => 'Orders created before this date (Y-m-d).',
                    ],
                    'per_page' => [
                        'type'        => 'integer',
                        'description' => 'Results per page. Default 20, max 50.',
                    ],
                    'page' => [
                        'type'        => 'integer',
                        'description' => 'Page number. Default 1.',
                    ],
                    'orderby' => [
                        'type'        => 'string',
                        'description' => 'Order by field.',
                        'enum'        => [ 'date', 'id', 'total' ],
                    ],
                    'order' => [
                        'type'        => 'string',
                        'description' => 'Sort direction.',
                        'enum'        => [ 'ASC', 'DESC' ],
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_orders' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                try {
                    $per_page = min( intval( $input['per_page'] ?? 20 ), 50 );
                    $page     = max( intval( $input['page'] ?? 1 ), 1 );

                    $order_input = strtoupper( (string) ( $input['order'] ?? 'DESC' ) );
                    $order_dir   = in_array( $order_input, [ 'ASC', 'DESC' ], true ) ? $order_input : 'DESC';

                    $args = [
                        'limit'    => $per_page,
                        'page'     => $page,
                        'paginate' => true,
                        'orderby'  => sanitize_key( $input['orderby'] ?? 'date' ),
                        'order'    => $order_dir,
                    ];

                    // Status: only pass if set and not 'any'. Omitting returns all statuses.
                    if ( ! empty( $input['status'] ) && $input['status'] !== 'any' ) {
                        $args['status'] = sanitize_key( $input['status'] );
                    }

                    if ( isset( $input['customer_id'] ) ) {
                        $args['customer_id'] = intval( $input['customer_id'] );
                    }

                    // Date range: use "date1...date2" for ranges (no prefix). Single-sided uses > or <.
                    $date_after  = ! empty( $input['date_after'] ) ? sanitize_text_field( $input['date_after'] ) : null;
                    $date_before = ! empty( $input['date_before'] ) ? sanitize_text_field( $input['date_before'] ) : null;

                    if ( $date_after && $date_before ) {
                        $args['date_created'] = $date_after . '...' . $date_before;
                    } elseif ( $date_after ) {
                        $args['date_created'] = '>' . $date_after;
                    } elseif ( $date_before ) {
                        $args['date_created'] = '<' . $date_before;
                    }

                    $results = wc_get_orders( $args );
                    $items   = [];

                    foreach ( $results->orders as $order ) {
                        $items[] = [
                            'order_id'     => $order->get_id(),
                            'order_number' => $order->get_order_number(),
                            'status'       => $order->get_status(),
                            'total'        => $order->get_total(),
                            'currency'     => $order->get_currency(),
                            'customer_id'  => $order->get_customer_id(),
                            'date_created' => $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d H:i:s' ) : null,
                        ];
                    }

                    $total_pages = $per_page > 0 ? (int) ceil( $results->total / $per_page ) : 0;

                    return maxi_ai_response(
                        true,
                        [
                            'items'       => $items,
                            'total'       => (int) $results->total,
                            'total_pages' => $total_pages,
                            'page'        => $page,
                        ]
                    );

                } catch ( \Throwable $e ) {
                    return maxi_ai_response( false, [], 'list-orders failed: ' . $e->getMessage() );
                }

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
