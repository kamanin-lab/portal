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
            'description' => 'List variations of one or more variable products with their attributes, prices, stock, and SKUs. '
                           . 'Call with product_id (integer) for a single product, OR product_ids (array, max 20) for a batch across multiple products. '
                           . 'Every variation item carries a product_id field identifying its parent, in both modes. '
                           . 'In batch mode, pagination (per_page / page) applies across the combined flat variation list, and the response includes a per_product_counts object with per-parent totals plus an error tag for any IDs that were not variable products.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'woocommerce_catalog',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'product_id' => [
                        'type'        => 'integer',
                        'description' => 'Single-product mode: the parent variable product ID. Mutually exclusive with product_ids.',
                    ],
                    'product_ids' => [
                        'type'        => 'array',
                        'items'       => [ 'type' => 'integer' ],
                        'description' => 'Batch mode: array of parent variable product IDs (max 20). Returns variations from all specified products in one call, each tagged with its parent. Mutually exclusive with product_id.',
                    ],
                    'per_page' => [
                        'type'        => 'integer',
                        'description' => 'Optional. Number of variations per page. Omit to return all variations. Max 100. In batch mode, pagination applies across the combined flat list.',
                    ],
                    'page' => [
                        'type'        => 'integer',
                        'description' => 'Optional. Page number (1-based). Only used when per_page is set.',
                    ],
                ],
                // product_id / product_ids mutual-exclusion is validated in the
                // callback — the schema can't express "at least one of".
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_product' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                // Resolve input into a validated list of parent product IDs
                // and remember whether this was a batch call.
                $batch_mode   = ! empty( $input['product_ids'] ) && is_array( $input['product_ids'] );
                $single_given = isset( $input['product_id'] ) && $input['product_id'] !== null && $input['product_id'] !== '';

                if ( $batch_mode && $single_given ) {
                    return maxi_ai_response( false, [], 'Pass either product_id or product_ids, not both.' );
                }

                if ( $batch_mode ) {
                    $product_ids = array_values( array_unique( array_map( 'intval', $input['product_ids'] ) ) );
                    $product_ids = array_values( array_filter( $product_ids, static function ( $id ) {
                        return $id > 0;
                    } ) );

                    if ( empty( $product_ids ) ) {
                        return maxi_ai_response( false, [], 'product_ids contained no valid positive integers.' );
                    }

                    if ( count( $product_ids ) > 20 ) {
                        return maxi_ai_response( false, [], 'product_ids accepts at most 20 IDs per call. Got ' . count( $product_ids ) . '.' );
                    }
                } elseif ( $single_given ) {
                    $product_ids = [ (int) $input['product_id'] ];
                } else {
                    return maxi_ai_response( false, [], 'Must provide either product_id or product_ids.' );
                }

                // Gather variations per parent. In batch mode, a bad parent
                // is recorded in per_product_counts and skipped; in single
                // mode, a bad parent is a hard error (preserves prior shape).
                $all_variations     = [];
                $per_product_counts = [];

                foreach ( $product_ids as $parent_id ) {
                    $parent = wc_get_product( $parent_id );

                    if ( ! $parent || ! $parent->is_type( 'variable' ) ) {
                        if ( $batch_mode ) {
                            $per_product_counts[ $parent_id ] = [
                                'count' => 0,
                                'error' => $parent ? 'not_variable' : 'not_found',
                            ];
                            continue;
                        }
                        return maxi_ai_response(
                            false,
                            [],
                            $parent
                                ? 'Product is not a variable product: ' . $parent_id
                                : 'Product not found: ' . $parent_id
                        );
                    }

                    $children = $parent->get_children();
                    $count    = 0;

                    foreach ( $children as $child_id ) {
                        $variation = wc_get_product( $child_id );

                        if ( ! $variation || ! $variation instanceof WC_Product_Variation ) {
                            continue;
                        }

                        $all_variations[] = [
                            'variation_id'   => $variation->get_id(),
                            'product_id'     => $parent_id,
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

                        $count++;
                    }

                    $per_product_counts[ $parent_id ] = [ 'count' => $count ];
                }

                // Pagination: applies across the combined flat variation list.
                // In single-product mode this matches the prior behavior
                // exactly because the list only contains one parent's variations.
                $total          = count( $all_variations );
                $paginate       = isset( $input['per_page'] );
                $variations_out = $all_variations;
                $page_data      = [];

                if ( $paginate ) {
                    $per_page       = min( max( intval( $input['per_page'] ), 1 ), 100 );
                    $page           = max( intval( $input['page'] ?? 1 ), 1 );
                    $offset         = ( $page - 1 ) * $per_page;
                    $variations_out = array_slice( $all_variations, $offset, $per_page );
                    $page_data      = [
                        'page'        => $page,
                        'per_page'    => $per_page,
                        'total_pages' => $total > 0 ? (int) ceil( $total / $per_page ) : 0,
                    ];
                }

                // Build response. Single-product mode preserves the prior
                // shape (product_id at root). Batch mode surfaces
                // product_ids + per_product_counts instead.
                $response_data = [
                    'count'      => count( $variations_out ),
                    'total'      => $total,
                    'variations' => $variations_out,
                ];

                if ( $batch_mode ) {
                    $response_data['product_ids']        = $product_ids;
                    $response_data['per_product_counts'] = $per_product_counts;
                } else {
                    $response_data['product_id'] = $product_ids[0];
                }

                if ( $paginate ) {
                    $response_data = array_merge( $response_data, $page_data );
                }

                return maxi_ai_response( true, $response_data );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
