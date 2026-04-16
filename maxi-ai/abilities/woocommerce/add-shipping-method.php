<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/add-shipping-method',
        [
            'label'       => 'Add Shipping Method',
            'description' => 'Add a shipping method (flat rate, free shipping, or local pickup) to a WooCommerce shipping zone.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'zone_id' => [
                        'type'        => 'integer',
                        'description' => 'The shipping zone ID.',
                    ],
                    'method_type' => [
                        'type'        => 'string',
                        'description' => 'The shipping method type to add.',
                        'enum'        => [ 'flat_rate', 'free_shipping', 'local_pickup' ],
                    ],
                ],
                'required' => [ 'zone_id', 'method_type' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Shipping_Zone' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $zone_id = intval( $input['zone_id'] ?? 0 );
                $zone    = new WC_Shipping_Zone( $zone_id );

                if ( ! $zone->get_id() && $zone_id !== 0 ) {
                    return maxi_ai_response( false, [], 'Shipping zone not found: ' . $zone_id );
                }

                $method_type = sanitize_key( $input['method_type'] );
                $instance_id = $zone->add_shipping_method( $method_type );

                if ( ! $instance_id ) {
                    return maxi_ai_response( false, [], 'Failed to add shipping method.' );
                }

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'shipping_method_added',
                    get_current_user_id(),
                    'zone:' . $zone->get_id(),
                    [ 'method_type' => $method_type ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'zone_id'     => $zone->get_id(),
                        'instance_id' => $instance_id,
                        'method_type' => $method_type,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
