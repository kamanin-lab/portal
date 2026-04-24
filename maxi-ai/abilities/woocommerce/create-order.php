<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/create-order',
        [
            'label'       => 'Create Order',
            'description' => 'Create a new WooCommerce order with line items, customer, billing/shipping addresses, and status.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'woocommerce_orders',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'line_items' => [
                        'type'        => 'array',
                        'description' => 'Array of line items.',
                        'items'       => [
                            'type'       => 'object',
                            'properties' => [
                                'product_id' => [
                                    'type'        => 'integer',
                                    'description' => 'Product ID.',
                                ],
                                'variation_id' => [
                                    'type'        => 'integer',
                                    'description' => 'Variation ID (if applicable).',
                                ],
                                'quantity' => [
                                    'type'        => 'integer',
                                    'description' => 'Quantity. Default 1.',
                                ],
                            ],
                            'required' => [ 'product_id' ],
                        ],
                    ],
                    'status' => [
                        'type'        => 'string',
                        'description' => 'Order status. Default "pending".',
                        'enum'        => [ 'pending', 'processing', 'on-hold', 'completed' ],
                    ],
                    'customer_id' => [
                        'type'        => 'integer',
                        'description' => 'Customer user ID. 0 for guest.',
                    ],
                    'billing' => [
                        'type'        => 'object',
                        'description' => 'Billing address fields: first_name, last_name, company, address_1, address_2, city, state, postcode, country, email, phone.',
                    ],
                    'shipping' => [
                        'type'        => 'object',
                        'description' => 'Shipping address fields: first_name, last_name, company, address_1, address_2, city, state, postcode, country.',
                    ],
                    'payment_method' => [
                        'type'        => 'string',
                        'description' => 'Payment method ID (e.g. "bacs", "cod").',
                    ],
                    'payment_method_title' => [
                        'type'        => 'string',
                        'description' => 'Payment method display name.',
                    ],
                    'note' => [
                        'type'        => 'string',
                        'description' => 'Customer-provided order note.',
                    ],
                ],
                'required' => [ 'line_items' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_create_order' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $order_args = [
                    'status'      => sanitize_key( $input['status'] ?? 'pending' ),
                    'created_via' => 'maxi-ai',
                ];

                if ( isset( $input['customer_id'] ) ) {
                    $order_args['customer_id'] = intval( $input['customer_id'] );
                }

                if ( ! empty( $input['note'] ) ) {
                    $order_args['customer_note'] = sanitize_textarea_field( $input['note'] );
                }

                try {
                    $order = wc_create_order( $order_args );
                } catch ( \Exception $e ) {
                    return maxi_ai_response( false, [], 'Failed to create order: ' . $e->getMessage() );
                }

                if ( is_wp_error( $order ) ) {
                    return maxi_ai_response( false, [], $order->get_error_message() );
                }

                // Add line items.
                $line_items = $input['line_items'] ?? [];

                foreach ( $line_items as $item ) {
                    $product_id   = intval( $item['product_id'] ?? 0 );
                    $variation_id = intval( $item['variation_id'] ?? 0 );
                    $quantity     = max( 1, intval( $item['quantity'] ?? 1 ) );

                    $product = wc_get_product( $variation_id ? $variation_id : $product_id );

                    if ( ! $product ) {
                        continue;
                    }

                    $order->add_product( $product, $quantity );
                }

                // Set billing address.
                if ( ! empty( $input['billing'] ) && is_array( $input['billing'] ) ) {
                    $billing = array_map( 'sanitize_text_field', $input['billing'] );
                    $order->set_address( $billing, 'billing' );
                }

                // Set shipping address.
                if ( ! empty( $input['shipping'] ) && is_array( $input['shipping'] ) ) {
                    $shipping = array_map( 'sanitize_text_field', $input['shipping'] );
                    $order->set_address( $shipping, 'shipping' );
                }

                // Set payment method.
                if ( ! empty( $input['payment_method'] ) ) {
                    $order->set_payment_method( sanitize_key( $input['payment_method'] ) );
                }

                if ( ! empty( $input['payment_method_title'] ) ) {
                    $order->set_payment_method_title( sanitize_text_field( $input['payment_method_title'] ) );
                }

                $order->calculate_totals();
                $order->save();

                $status = $order->get_status();

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'order_created',
                    get_current_user_id(),
                    'order:' . $order->get_id(),
                    [ 'status' => $status ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'order_id'     => $order->get_id(),
                        'order_number' => $order->get_order_number(),
                        'status'       => $order->get_status(),
                        'total'        => $order->get_total(),
                        'currency'     => $order->get_currency(),
                        'date_created' => $order->get_date_created() ? $order->get_date_created()->date( 'Y-m-d H:i:s' ) : null,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
