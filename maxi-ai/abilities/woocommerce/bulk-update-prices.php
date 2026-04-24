<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/bulk-update-prices',
        [
            'label'       => 'Bulk Update Prices',
            'description' => 'Update prices for multiple products or variations in one call. Supports setting exact prices or applying percentage/fixed adjustments (e.g. "+10%", "-5.00").',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'woocommerce_bulk',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'updates' => [
                        'type'        => 'array',
                        'description' => 'Array of price updates.',
                        'items'       => [
                            'type'       => 'object',
                            'properties' => [
                                'product_id' => [
                                    'type'        => 'integer',
                                    'description' => 'Product or variation ID.',
                                ],
                                'regular_price' => [
                                    'type'        => 'string',
                                    'description' => 'New regular price (exact value).',
                                ],
                                'sale_price' => [
                                    'type'        => 'string',
                                    'description' => 'New sale price (exact value). Empty string to remove.',
                                ],
                                'adjustment' => [
                                    'type'        => 'string',
                                    'description' => 'Price adjustment instead of exact value (e.g. "+10%", "-5.00", "+2.50").',
                                ],
                                'adjustment_target' => [
                                    'type'        => 'string',
                                    'description' => 'Which price to adjust. Default "regular_price".',
                                    'enum'        => [ 'regular_price', 'sale_price' ],
                                ],
                            ],
                            'required' => [ 'product_id' ],
                        ],
                    ],
                ],
                'required' => [ 'updates' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_product' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $updates = $input['updates'] ?? [];

                if ( empty( $updates ) || ! is_array( $updates ) ) {
                    return maxi_ai_response( false, [], 'Updates array is required.' );
                }

                $results = [];

                foreach ( $updates as $update ) {
                    $product_id = intval( $update['product_id'] ?? 0 );
                    $product    = wc_get_product( $product_id );

                    if ( ! $product ) {
                        $results[] = [
                            'product_id' => $product_id,
                            'success'    => false,
                            'error'      => 'Product not found.',
                        ];
                        continue;
                    }

                    // Handle adjustment.
                    if ( ! empty( $update['adjustment'] ) ) {
                        $adjustment = sanitize_text_field( $update['adjustment'] );
                        $target     = sanitize_key( $update['adjustment_target'] ?? 'regular_price' );
                        $getter     = $target === 'sale_price' ? 'get_sale_price' : 'get_regular_price';
                        $setter     = $target === 'sale_price' ? 'set_sale_price' : 'set_regular_price';

                        $current = (float) $product->$getter();

                        if ( strpos( $adjustment, '%' ) !== false ) {
                            $percent  = (float) str_replace( '%', '', $adjustment );
                            $new_price = $current + ( $current * $percent / 100 );
                        } else {
                            $new_price = $current + (float) $adjustment;
                        }

                        $new_price = max( 0, round( $new_price, 2 ) );
                        $product->$setter( (string) $new_price );
                    }

                    // Handle exact prices.
                    if ( isset( $update['regular_price'] ) && empty( $update['adjustment'] ) ) {
                        $product->set_regular_price( sanitize_text_field( $update['regular_price'] ) );
                    }

                    if ( array_key_exists( 'sale_price', $update ) && empty( $update['adjustment'] ) ) {
                        $product->set_sale_price( sanitize_text_field( $update['sale_price'] ) );
                    }

                    $product->save();
                    wc_delete_product_transients( $product_id );

                    $results[] = [
                        'product_id'    => $product_id,
                        'success'       => true,
                        'regular_price' => $product->get_regular_price(),
                        'sale_price'    => $product->get_sale_price(),
                        'price'         => $product->get_price(),
                    ];
                }

                $success_count = count( array_filter( $results, function ( $r ) {
                    return $r['success'];
                } ) );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'prices_bulk_updated',
                    get_current_user_id(),
                    'products',
                    [ 'count' => $success_count ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'total'     => count( $results ),
                        'succeeded' => $success_count,
                        'failed'    => count( $results ) - $success_count,
                        'results'   => $results,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
