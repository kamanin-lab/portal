<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-variations',
        [
            'label'       => 'List Variations',
            'description' => 'List all variations of a variable product with their attributes, prices, stock, and SKUs.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'product_id' => [
                        'type'        => 'integer',
                        'description' => 'The parent variable product ID.',
                    ],
                    'per_page' => [
                        'type'        => 'integer',
                        'description' => 'Optional. Number of variations per page. Omit to return all variations. Max 100.',
                    ],
                    'page' => [
                        'type'        => 'integer',
                        'description' => 'Optional. Page number (1-based). Only used when per_page is set.',
                    ],
                ],
                'required' => [ 'product_id' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_product' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $product_id = intval( $input['product_id'] ?? 0 );
                $product    = wc_get_product( $product_id );

                if ( ! $product || ! $product->is_type( 'variable' ) ) {
                    return maxi_ai_response( false, [], 'Product is not a variable product: ' . $product_id );
                }

                $children = $product->get_children();
                $total    = count( $children );

                // Optional pagination — omit per_page to get all variations.
                $paginate = isset( $input['per_page'] );
                if ( $paginate ) {
                    $per_page = min( max( intval( $input['per_page'] ), 1 ), 100 );
                    $page     = max( intval( $input['page'] ?? 1 ), 1 );
                    $children = array_slice( $children, ( $page - 1 ) * $per_page, $per_page );
                }

                $variations = [];

                foreach ( $children as $child_id ) {
                    $variation = wc_get_product( $child_id );

                    if ( ! $variation || ! $variation instanceof WC_Product_Variation ) {
                        continue;
                    }

                    $variations[] = [
                        'variation_id'   => $variation->get_id(),
                        'attributes'     => $variation->get_attributes(),
                        'regular_price'  => $variation->get_regular_price(),
                        'sale_price'     => $variation->get_sale_price(),
                        'price'          => $variation->get_price(),
                        'sku'            => $variation->get_sku(),
                        'stock_status'   => $variation->get_stock_status(),
                        'stock_quantity' => $variation->get_stock_quantity(),
                        'manage_stock'   => $variation->get_manage_stock(),
                        'backorders'     => $variation->get_backorders(),
                        'image_id'       => $variation->get_image_id(),
                        'enabled'        => $variation->get_status() === 'publish',
                    ];
                }

                $response_data = [
                    'product_id' => $product_id,
                    'count'      => count( $variations ),
                    'total'      => $total,
                    'variations' => $variations,
                ];

                if ( $paginate ) {
                    $response_data['page']        = $page;
                    $response_data['per_page']    = $per_page;
                    $response_data['total_pages'] = (int) ceil( $total / $per_page );
                }

                return maxi_ai_response( true, $response_data );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
