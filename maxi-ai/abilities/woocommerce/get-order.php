<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-order',
        [
            'label'       => 'Get Order',
            'description' => 'Get full WooCommerce order details including line items, totals, addresses, status, payment, and customer info.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'order_id' => [
                        'type'        => 'integer',
                        'description' => 'The WooCommerce order ID.',
                    ],
                ],
                'required' => [ 'order_id' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_order' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $order_id = intval( $input['order_id'] ?? 0 );
                $order    = wc_get_order( $order_id );

                if ( ! $order ) {
                    return maxi_ai_response( false, [], 'Order not found: ' . $order_id );
                }

                // Build line items.
                $line_items = [];

                foreach ( $order->get_items() as $item ) {
                    $line_items[] = [
                        'product_id'   => $item->get_product_id(),
                        'variation_id' => $item->get_variation_id(),
                        'name'         => $item->get_name(),
                        'quantity'     => $item->get_quantity(),
                        'subtotal'     => $item->get_subtotal(),
                        'total'        => $item->get_total(),
                    ];
                }

                return maxi_ai_response(
                    true,
                    [
                        'order_id'             => $order->get_id(),
                        'order_number'         => $order->get_order_number(),
                        'status'               => $order->get_status(),
                        'currency'             => $order->get_currency(),
                        'total'                => $order->get_total(),
                        'subtotal'             => $order->get_subtotal(),
                        'discount_total'       => $order->get_discount_total(),
                        'shipping_total'       => $order->get_shipping_total(),
                        'total_tax'            => $order->get_total_tax(),
                        'customer_id'          => $order->get_customer_id(),
                        'billing'              => $order->get_address( 'billing' ),
                        'shipping'             => $order->get_address( 'shipping' ),
                        'payment_method'       => $order->get_payment_method(),
                        'payment_method_title' => $order->get_payment_method_title(),
                        'line_items'           => $line_items,
                        'customer_note'        => $order->get_customer_note(),
                        'date_created'         => $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d H:i:s' ) : null,
                        'date_modified'        => $order->get_date_modified() ? $order->get_date_modified()->date( 'Y-m-d H:i:s' ) : null,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
