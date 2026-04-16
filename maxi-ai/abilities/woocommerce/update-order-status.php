<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/update-order-status',
        [
            'label'       => 'Update Order Status',
            'description' => 'Change the status of a WooCommerce order (e.g. pending to processing to completed). Optionally add a note.',
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
                    'status' => [
                        'type'        => 'string',
                        'description' => 'New order status.',
                        'enum'        => [ 'pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed' ],
                    ],
                    'note' => [
                        'type'        => 'string',
                        'description' => 'Optional note to add with the status change.',
                    ],
                ],
                'required' => [ 'order_id', 'status' ],
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

                $old_status = $order->get_status();
                $new_status = sanitize_key( $input['status'] );
                $note       = sanitize_textarea_field( $input['note'] ?? '' );

                $order->update_status( $new_status, $note );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'order_status_changed',
                    get_current_user_id(),
                    'order:' . $order->get_id(),
                    [ 'from' => $old_status, 'to' => $order->get_status() ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'order_id'   => $order->get_id(),
                        'old_status' => $old_status,
                        'new_status' => $order->get_status(),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
