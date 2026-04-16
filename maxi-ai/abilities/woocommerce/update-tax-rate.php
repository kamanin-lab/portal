<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/update-tax-rate',
        [
            'label'       => 'Update Tax Rate',
            'description' => 'Update an existing WooCommerce tax rate. Send only the fields to change. Booleans like compound and shipping can be set to false explicitly.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'tax_rate_id' => [
                        'type'        => 'integer',
                        'description' => 'The tax rate ID to update.',
                    ],
                    'country' => [
                        'type'        => 'string',
                        'description' => 'Country code (e.g. "US", "GB", "DE").',
                    ],
                    'state' => [
                        'type'        => 'string',
                        'description' => 'State code. Use "*" for all states.',
                    ],
                    'rate' => [
                        'type'        => 'string',
                        'description' => 'Tax rate percentage (e.g. "20.0000", "7.5000").',
                    ],
                    'name' => [
                        'type'        => 'string',
                        'description' => 'Tax rate name (e.g. "VAT", "Sales Tax").',
                    ],
                    'priority' => [
                        'type'        => 'integer',
                        'description' => 'Priority.',
                    ],
                    'compound' => [
                        'type'        => 'boolean',
                        'description' => 'Whether this is a compound rate. Can be set to false.',
                    ],
                    'shipping' => [
                        'type'        => 'boolean',
                        'description' => 'Whether to apply to shipping. Can be set to false.',
                    ],
                    'tax_class' => [
                        'type'        => 'string',
                        'description' => 'Tax class. Empty string for standard rate.',
                    ],
                    'postcode' => [
                        'type'        => 'string',
                        'description' => 'Postcodes (semicolon-separated for multiple). When sent, replaces all postcodes on this rate.',
                    ],
                    'city' => [
                        'type'        => 'string',
                        'description' => 'City name. When sent, replaces all cities on this rate.',
                    ],
                ],
                'required' => [ 'tax_rate_id' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Tax' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                global $wpdb;

                $tax_rate_id = intval( $input['tax_rate_id'] ?? 0 );

                if ( ! $tax_rate_id ) {
                    return maxi_ai_response( false, [], 'Invalid tax rate ID.' );
                }

                $existing = $wpdb->get_row( $wpdb->prepare(
                    "SELECT * FROM {$wpdb->prefix}woocommerce_tax_rates WHERE tax_rate_id = %d",
                    $tax_rate_id
                ) );

                if ( ! $existing ) {
                    return maxi_ai_response( false, [], 'Tax rate not found.' );
                }

                // Build partial update array — only keys the caller actually sent.
                // CRITICAL: use array_key_exists, not isset/!empty, so that
                // `compound: false` and `shipping: false` flow through correctly
                // and `tax_class: ""` (back to standard) is respected.
                $updates = [];

                if ( array_key_exists( 'country', $input ) ) {
                    $updates['tax_rate_country'] = sanitize_text_field( strtoupper( $input['country'] ) );
                }
                if ( array_key_exists( 'state', $input ) ) {
                    $updates['tax_rate_state'] = sanitize_text_field( $input['state'] );
                }
                if ( array_key_exists( 'rate', $input ) ) {
                    $updates['tax_rate'] = sanitize_text_field( $input['rate'] );
                }
                if ( array_key_exists( 'name', $input ) ) {
                    $updates['tax_rate_name'] = sanitize_text_field( $input['name'] );
                }
                if ( array_key_exists( 'priority', $input ) ) {
                    $updates['tax_rate_priority'] = intval( $input['priority'] );
                }
                if ( array_key_exists( 'compound', $input ) ) {
                    $updates['tax_rate_compound'] = $input['compound'] ? 1 : 0;
                }
                if ( array_key_exists( 'shipping', $input ) ) {
                    $updates['tax_rate_shipping'] = $input['shipping'] ? 1 : 0;
                }
                if ( array_key_exists( 'tax_class', $input ) ) {
                    $updates['tax_rate_class'] = sanitize_key( $input['tax_class'] );
                }

                if ( ! empty( $updates ) ) {
                    WC_Tax::_update_tax_rate( $tax_rate_id, $updates );
                }

                if ( array_key_exists( 'postcode', $input ) ) {
                    $postcodes = array_map( 'trim', explode( ';', sanitize_text_field( (string) $input['postcode'] ) ) );
                    WC_Tax::_update_tax_rate_postcodes( $tax_rate_id, implode( ';', $postcodes ) );
                }

                if ( array_key_exists( 'city', $input ) ) {
                    WC_Tax::_update_tax_rate_cities( $tax_rate_id, sanitize_text_field( (string) $input['city'] ) );
                }

                // Re-read for authoritative return.
                $row = $wpdb->get_row( $wpdb->prepare(
                    "SELECT * FROM {$wpdb->prefix}woocommerce_tax_rates WHERE tax_rate_id = %d",
                    $tax_rate_id
                ) );

                $updated_fields = array_keys( $updates );
                if ( array_key_exists( 'postcode', $input ) ) {
                    $updated_fields[] = 'postcode';
                }
                if ( array_key_exists( 'city', $input ) ) {
                    $updated_fields[] = 'city';
                }

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'tax_rate_updated',
                    get_current_user_id(),
                    'tax_rate:' . $tax_rate_id,
                    []
                );

                return maxi_ai_response(
                    true,
                    [
                        'tax_rate_id'    => (int) $row->tax_rate_id,
                        'country'        => $row->tax_rate_country,
                        'state'          => $row->tax_rate_state,
                        'rate'           => $row->tax_rate,
                        'name'           => $row->tax_rate_name,
                        'priority'       => (int) $row->tax_rate_priority,
                        'compound'       => (bool) $row->tax_rate_compound,
                        'shipping'       => (bool) $row->tax_rate_shipping,
                        'tax_class'      => $row->tax_rate_class,
                        'updated_fields' => $updated_fields,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
