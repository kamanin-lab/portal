<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-products',
        [
            'label'       => 'List Products',
            'description' => 'List WooCommerce products with store-specific filters: search by name, type, stock status, price range, on-sale, featured, SKU.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'search' => [
                        'type'        => 'string',
                        'description' => 'Search products by name.',
                    ],
                    'type' => [
                        'type'        => 'string',
                        'description' => 'Product type filter.',
                        'enum'        => [ 'simple', 'variable', 'grouped', 'external' ],
                    ],
                    'status' => [
                        'type'        => 'string',
                        'description' => 'Post status. Default "publish".',
                    ],
                    'category' => [
                        'type'        => [ 'string', 'integer' ],
                        'description' => 'Product category slug or term ID.',
                    ],
                    'tag' => [
                        'type'        => [ 'string', 'integer' ],
                        'description' => 'Product tag slug or term ID.',
                    ],
                    'sku' => [
                        'type'        => 'string',
                        'description' => 'Search by SKU.',
                    ],
                    'stock_status' => [
                        'type'        => 'string',
                        'description' => 'Stock status filter.',
                        'enum'        => [ 'instock', 'outofstock', 'onbackorder' ],
                    ],
                    'min_price' => [
                        'type'        => 'number',
                        'description' => 'Minimum price filter.',
                    ],
                    'max_price' => [
                        'type'        => 'number',
                        'description' => 'Maximum price filter.',
                    ],
                    'on_sale' => [
                        'type'        => 'boolean',
                        'description' => 'Filter to products currently on sale.',
                    ],
                    'featured' => [
                        'type'        => 'boolean',
                        'description' => 'Filter to featured products.',
                    ],
                    'per_page' => [
                        'type'        => 'integer',
                        'description' => 'Results per page. Default 20, max 100.',
                    ],
                    'page' => [
                        'type'        => 'integer',
                        'description' => 'Page number. Default 1.',
                    ],
                    'orderby' => [
                        'type'        => 'string',
                        'description' => 'Order by field.',
                        'enum'        => [ 'date', 'title', 'price', 'popularity', 'rating', 'menu_order', 'id' ],
                    ],
                    'order' => [
                        'type'        => 'string',
                        'description' => 'Sort direction.',
                        'enum'        => [ 'ASC', 'DESC' ],
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_products' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $per_page = min( intval( $input['per_page'] ?? 20 ), 100 );
                $page     = max( intval( $input['page'] ?? 1 ), 1 );

                $args = [
                    'status'   => sanitize_key( $input['status'] ?? 'publish' ),
                    'limit'    => $per_page,
                    'page'     => $page,
                    'paginate' => true,
                    'orderby'  => sanitize_key( $input['orderby'] ?? 'date' ),
                    'order'    => sanitize_key( $input['order'] ?? 'DESC' ),
                ];

                if ( ! empty( $input['search'] ) ) {
                    $args['s'] = sanitize_text_field( $input['search'] );
                }

                if ( ! empty( $input['type'] ) ) {
                    $args['type'] = sanitize_key( $input['type'] );
                }

                if ( ! empty( $input['category'] ) ) {
                    $cat = sanitize_text_field( $input['category'] );
                    if ( is_numeric( $cat ) ) {
                        $term = get_term( (int) $cat, 'product_cat' );
                        $cat  = ( $term && ! is_wp_error( $term ) ) ? $term->slug : $cat;
                    }
                    $args['category'] = [ $cat ];
                }

                if ( ! empty( $input['tag'] ) ) {
                    $tag = sanitize_text_field( $input['tag'] );
                    if ( is_numeric( $tag ) ) {
                        $term = get_term( (int) $tag, 'product_tag' );
                        $tag  = ( $term && ! is_wp_error( $term ) ) ? $term->slug : $tag;
                    }
                    $args['tag'] = [ $tag ];
                }

                if ( ! empty( $input['sku'] ) ) {
                    $args['sku'] = sanitize_text_field( $input['sku'] );
                }

                if ( ! empty( $input['stock_status'] ) ) {
                    $args['stock_status'] = sanitize_key( $input['stock_status'] );
                }

                if ( ! empty( $input['featured'] ) ) {
                    $args['featured'] = true;
                }

                if ( ! empty( $input['on_sale'] ) ) {
                    $args['on_sale'] = true;
                }

                // Price range filters — injected via WooCommerce filter hook because
                // wc_get_products() resets meta_query internally. The hook fires inside
                // the data store after WC builds its own meta_query, so our clauses merge
                // safely with WC's internal ones.
                $price_filter = null;
                if ( isset( $input['min_price'] ) || isset( $input['max_price'] ) ) {
                    $min = isset( $input['min_price'] ) ? (float) $input['min_price'] : null;
                    $max = isset( $input['max_price'] ) ? (float) $input['max_price'] : null;

                    $price_filter = function ( $wp_query_args ) use ( $min, $max ) {
                        if ( $min !== null ) {
                            $wp_query_args['meta_query'][] = [
                                'key'     => '_price',
                                'value'   => $min,
                                'compare' => '>=',
                                'type'    => 'NUMERIC',
                            ];
                        }
                        if ( $max !== null ) {
                            $wp_query_args['meta_query'][] = [
                                'key'     => '_price',
                                'value'   => $max,
                                'compare' => '<=',
                                'type'    => 'NUMERIC',
                            ];
                        }
                        return $wp_query_args;
                    };

                    add_filter( 'woocommerce_product_data_store_cpt_get_products_query', $price_filter, 10, 1 );
                }

                $results = wc_get_products( $args );

                // Remove the one-shot filter immediately after use.
                if ( $price_filter ) {
                    remove_filter( 'woocommerce_product_data_store_cpt_get_products_query', $price_filter, 10 );
                }
                $items   = [];

                foreach ( $results->products as $product ) {
                    $item = [
                        'product_id'   => $product->get_id(),
                        'name'         => $product->get_name(),
                        'slug'         => $product->get_slug(),
                        'type'         => $product->get_type(),
                        'status'       => $product->get_status(),
                        'sku'          => $product->get_sku(),
                        'regular_price' => $product->get_regular_price(),
                        'sale_price'   => $product->get_sale_price(),
                        'price'        => $product->get_price(),
                        'stock_status' => $product->get_stock_status(),
                        'stock_quantity' => $product->get_stock_quantity(),
                        'on_sale'      => $product->is_on_sale(),
                        'featured'     => $product->get_featured(),
                        'category_ids' => $product->get_category_ids(),
                        'url'          => get_permalink( $product->get_id() ),
                    ];

                    $items[] = $item;
                }

                $total_pages = (int) ceil( $results->total / $per_page );

                return maxi_ai_response(
                    true,
                    [
                        'items'       => $items,
                        'total'       => (int) $results->total,
                        'total_pages' => $total_pages,
                        'page'        => $page,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
