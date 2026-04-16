<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/create-tax-rate',
        [
            'label'       => 'Create Tax Rate',
            'description' => 'Create a WooCommerce tax rate for a specific country/state with rate percentage, name, and priority.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'country' => [
                        'type'        => 'string',
                        'description' => 'Country code (e.g. "US", "GB", "DE").',
                    ],
                    'rate' => [
                        'type'        => 'string',
                        'description' => 'Tax rate percentage (e.g. "20.0000", "7.5000").',
                    ],
                    'name' => [
                        'type'        => 'string',
                        'description' => 'Tax rate name (e.g. "VAT", "Sales Tax").',
                    ],
                    'state' => [
                        'type'        => 'string',
                        'description' => 'State code. Default "*" (all states).',
                    ],
                    'postcode' => [
                        'type'        => 'string',
                        'description' => 'Postcodes (semicolon-separated for multiple).',
                    ],
                    'city' => [
                        'type'        => 'string',
                        'description' => 'City name.',
                    ],
                    'tax_class' => [
                        'type'        => 'string',
                        'description' => 'Tax class. Empty string for standard rate.',
                    ],
                    'priority' => [
                        'type'        => 'integer',
                        'description' => 'Priority. Default 1.',
                    ],
                    'compound' => [
                        'type'        => 'boolean',
                        'description' => 'Whether this is a compound rate. Default false.',
                    ],
                    'shipping' => [
                        'type'        => 'boolean',
                        'description' => 'Whether to apply to shipping. Default true.',
                    ],
                ],
                'required' => [ 'country', 'rate', 'name' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Tax' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $tax_rate = [
                    'tax_rate_country'  => sanitize_text_field( strtoupper( $input['country'] ) ),
                    'tax_rate_state'    => sanitize_text_field( $input['state'] ?? '*' ),
                    'tax_rate'          => sanitize_text_field( $input['rate'] ),
                    'tax_rate_name'     => sanitize_text_field( $input['name'] ),
                    'tax_rate_priority' => intval( $input['priority'] ?? 1 ),
                    'tax_rate_compound' => ! empty( $input['compound'] ) ? 1 : 0,
                    'tax_rate_shipping' => isset( $input['shipping'] ) ? ( $input['shipping'] ? 1 : 0 ) : 1,
                    'tax_rate_class'    => sanitize_key( $input['tax_class'] ?? '' ),
                ];

                $tax_rate_id = WC_Tax::_insert_tax_rate( $tax_rate );

                if ( ! $tax_rate_id ) {
                    return maxi_ai_response( false, [], 'Failed to create tax rate.' );
                }

                // Handle postcodes.
                if ( ! empty( $input['postcode'] ) ) {
                    $postcodes = array_map( 'trim', explode( ';', sanitize_text_field( $input['postcode'] ) ) );
                    WC_Tax::_update_tax_rate_postcodes( $tax_rate_id, implode( ';', $postcodes ) );
                }

                // Handle cities.
                if ( ! empty( $input['city'] ) ) {
                    WC_Tax::_update_tax_rate_cities( $tax_rate_id, sanitize_text_field( $input['city'] ) );
                }

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'tax_rate_created',
                    get_current_user_id(),
                    'tax_rate:' . $tax_rate_id,
                    [ 'country' => $tax_rate['tax_rate_country'] ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'tax_rate_id' => $tax_rate_id,
                        'country'     => $tax_rate['tax_rate_country'],
                        'state'       => $tax_rate['tax_rate_state'],
                        'rate'        => $tax_rate['tax_rate'],
                        'name'        => $tax_rate['tax_rate_name'],
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
