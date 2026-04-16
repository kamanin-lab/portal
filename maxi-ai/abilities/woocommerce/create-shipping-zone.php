<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/create-shipping-zone',
        [
            'label'       => 'Create Shipping Zone',
            'description' => 'Create a new WooCommerce shipping zone with region restrictions.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'name' => [
                        'type'        => 'string',
                        'description' => 'Zone name (e.g. "Europe", "United States").',
                    ],
                    'regions' => [
                        'type'        => 'array',
                        'description' => 'Array of region restrictions.',
                        'items'       => [
                            'type'       => 'object',
                            'properties' => [
                                'code' => [
                                    'type'        => 'string',
                                    'description' => 'Region code (e.g. "US", "US:CA", "90210").',
                                ],
                                'type' => [
                                    'type'        => 'string',
                                    'description' => 'Region type.',
                                    'enum'        => [ 'country', 'state', 'postcode', 'continent' ],
                                ],
                            ],
                            'required' => [ 'code', 'type' ],
                        ],
                    ],
                ],
                'required' => [ 'name' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Shipping_Zone' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $zone = new WC_Shipping_Zone();
                $zone->set_zone_name( sanitize_text_field( $input['name'] ) );
                $zone->save();

                // Add regions.
                $regions = $input['regions'] ?? [];

                if ( ! empty( $regions ) && is_array( $regions ) ) {
                    foreach ( $regions as $region ) {
                        $code = sanitize_text_field( $region['code'] ?? '' );
                        $type = sanitize_key( $region['type'] ?? 'country' );

                        if ( ! empty( $code ) ) {
                            $zone->add_location( $code, $type );
                        }
                    }

                    $zone->save();
                }

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'shipping_zone_created',
                    get_current_user_id(),
                    'zone:' . $zone->get_id(),
                    []
                );

                return maxi_ai_response(
                    true,
                    [
                        'zone_id' => $zone->get_id(),
                        'name'    => $zone->get_zone_name(),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
