<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-shipping-zones',
        [
            'label'       => 'List Shipping Zones',
            'description' => 'List all WooCommerce shipping zones with their regions and configured shipping methods.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [],
                'required'   => [],
            ],

            'execute_callback' => function () {

                if ( ! class_exists( 'WC_Shipping_Zones' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $raw_zones = WC_Shipping_Zones::get_zones();
                $zones     = [];

                // Add "Locations not covered by your other zones" (zone 0).
                $rest_of_world = new WC_Shipping_Zone( 0 );
                $row_methods   = [];

                foreach ( $rest_of_world->get_shipping_methods() as $method ) {
                    $row_methods[] = [
                        'instance_id' => $method->get_instance_id(),
                        'method_id'   => $method->id,
                        'title'       => $method->get_title(),
                        'enabled'     => $method->is_enabled(),
                        // Full per-instance settings (cost, tax_status, min_amount, requires, ...).
                        // Keys vary by method type — agents should read before updating.
                        'settings'    => $method->instance_settings ?? [],
                    ];
                }

                $zones[] = [
                    'zone_id' => 0,
                    'name'    => $rest_of_world->get_zone_name(),
                    'regions' => [],
                    'methods' => $row_methods,
                ];

                foreach ( $raw_zones as $zone_data ) {
                    $zone    = new WC_Shipping_Zone( $zone_data['id'] );
                    $methods = [];

                    foreach ( $zone->get_shipping_methods() as $method ) {
                        $methods[] = [
                            'instance_id' => $method->get_instance_id(),
                            'method_id'   => $method->id,
                            'title'       => $method->get_title(),
                            'enabled'     => $method->is_enabled(),
                            'settings'    => $method->instance_settings ?? [],
                        ];
                    }

                    $regions = [];

                    foreach ( $zone_data['zone_locations'] as $location ) {
                        $regions[] = [
                            'code' => $location->code,
                            'type' => $location->type,
                        ];
                    }

                    $zones[] = [
                        'zone_id' => $zone->get_id(),
                        'name'    => $zone->get_zone_name(),
                        'regions' => $regions,
                        'methods' => $methods,
                    ];
                }

                return maxi_ai_response(
                    true,
                    [
                        'count' => count( $zones ),
                        'zones' => $zones,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
