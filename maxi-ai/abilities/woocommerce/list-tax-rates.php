<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-tax-rates',
        [
            'label'       => 'List Tax Rates',
            'description' => 'List WooCommerce tax rates with optional filters by country, state, or tax class.',
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
                        'description' => 'Filter by country code.',
                    ],
                    'state' => [
                        'type'        => 'string',
                        'description' => 'Filter by state code.',
                    ],
                    'tax_class' => [
                        'type'        => 'string',
                        'description' => 'Filter by tax class. Empty string for standard.',
                    ],
                    'per_page' => [
                        'type'        => 'integer',
                        'description' => 'Results per page. Default 50, max 200.',
                    ],
                    'page' => [
                        'type'        => 'integer',
                        'description' => 'Page number. Default 1.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Tax' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                global $wpdb;

                $per_page = min( intval( $input['per_page'] ?? 50 ), 200 );
                $page     = max( intval( $input['page'] ?? 1 ), 1 );
                $offset   = ( $page - 1 ) * $per_page;

                $where = [];
                $args  = [];

                if ( ! empty( $input['country'] ) ) {
                    $where[] = 'tax_rate_country = %s';
                    $args[]  = sanitize_text_field( strtoupper( $input['country'] ) );
                }

                if ( ! empty( $input['state'] ) ) {
                    $where[] = 'tax_rate_state = %s';
                    $args[]  = sanitize_text_field( $input['state'] );
                }

                if ( array_key_exists( 'tax_class', $input ) ) {
                    $where[] = 'tax_rate_class = %s';
                    $args[]  = sanitize_key( $input['tax_class'] );
                }

                $where_sql = ! empty( $where ) ? 'WHERE ' . implode( ' AND ', $where ) : '';

                // Get total count.
                $count_query = "SELECT COUNT(*) FROM {$wpdb->prefix}woocommerce_tax_rates {$where_sql}";

                if ( ! empty( $args ) ) {
                    $total = (int) $wpdb->get_var( $wpdb->prepare( $count_query, ...$args ) );
                } else {
                    $total = (int) $wpdb->get_var( $count_query );
                }

                // Get results.
                $query = "SELECT * FROM {$wpdb->prefix}woocommerce_tax_rates {$where_sql} ORDER BY tax_rate_order ASC LIMIT %d OFFSET %d";
                $args[] = $per_page;
                $args[] = $offset;

                $rates  = $wpdb->get_results( $wpdb->prepare( $query, ...$args ) );
                $items  = [];

                foreach ( $rates as $rate ) {
                    $items[] = [
                        'tax_rate_id' => (int) $rate->tax_rate_id,
                        'country'     => $rate->tax_rate_country,
                        'state'       => $rate->tax_rate_state,
                        'rate'        => $rate->tax_rate,
                        'name'        => $rate->tax_rate_name,
                        'priority'    => (int) $rate->tax_rate_priority,
                        'compound'    => (bool) $rate->tax_rate_compound,
                        'shipping'    => (bool) $rate->tax_rate_shipping,
                        'tax_class'   => $rate->tax_rate_class,
                    ];
                }

                $total_pages = (int) ceil( $total / $per_page );

                return maxi_ai_response(
                    true,
                    [
                        'items'       => $items,
                        'total'       => $total,
                        'total_pages' => $total_pages,
                        'page'        => $page,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
