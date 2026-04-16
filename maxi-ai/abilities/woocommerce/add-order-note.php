<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/add-order-note',
        [
            'label'       => 'Add Order Note',
            'description' => 'Add a note to a WooCommerce order. Can be a private note (admin only) or a customer-visible note that triggers an email.',
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
                    'note' => [
                        'type'        => 'string',
                        'description' => 'The note text.',
                    ],
                    'customer_note' => [
                        'type'        => 'boolean',
                        'description' => 'If true, the note is visible to the customer and triggers an email. Default false.',
                    ],
                ],
                'required' => [ 'order_id', 'note' ],
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

                $note          = sanitize_textarea_field( $input['note'] );
                $customer_note = (bool) ( $input['customer_note'] ?? false );

                $note_id = $order->add_order_note( $note, $customer_note ? 1 : 0 );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'order_note_added',
                    get_current_user_id(),
                    'order:' . $order->get_id(),
                    [ 'customer_note' => $customer_note ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'order_id'      => $order->get_id(),
                        'note_id'       => $note_id,
                        'note'          => $note,
                        'customer_note' => $customer_note,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
