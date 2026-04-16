<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-product',
        [
            'label'       => 'Get Product',
            'description' => 'Get a WooCommerce product with full store data: type, prices, stock, dimensions, attributes, variations, and category/tag IDs.',
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
                        'description' => 'The WooCommerce product ID.',
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

                if ( ! $product ) {
                    return maxi_ai_response( false, [], 'Product not found: ' . $product_id );
                }

                $attributes = [];

                foreach ( $product->get_attributes() as $attr ) {
                    if ( is_a( $attr, 'WC_Product_Attribute' ) ) {
                        $attr_data = [
                            'name'        => $attr->get_name(),
                            'options'     => $attr->get_options(),
                            'visible'     => $attr->get_visible(),
                            'variation'   => $attr->get_variation(),
                            'is_taxonomy' => $attr->is_taxonomy(),
                        ];

                        if ( $attr->is_taxonomy() ) {
                            $attr_data['taxonomy'] = $attr->get_taxonomy();
                            $terms = [];
                            foreach ( $attr->get_terms() as $term ) {
                                $terms[] = [
                                    'term_id' => $term->term_id,
                                    'name'    => $term->name,
                                    'slug'    => $term->slug,
                                ];
                            }
                            $attr_data['terms'] = $terms;
                        }

                        $attributes[] = $attr_data;
                    }
                }

                $data = [
                    'product_id'         => $product->get_id(),
                    'type'               => $product->get_type(),
                    'name'               => $product->get_name(),
                    'slug'               => $product->get_slug(),
                    'status'             => $product->get_status(),
                    'description'        => $product->get_description(),
                    'short_description'  => $product->get_short_description(),
                    'sku'                => $product->get_sku(),
                    'regular_price'      => $product->get_regular_price(),
                    'sale_price'         => $product->get_sale_price(),
                    'price'              => $product->get_price(),
                    'on_sale'            => $product->is_on_sale(),
                    'stock_quantity'     => $product->get_stock_quantity(),
                    'stock_status'       => $product->get_stock_status(),
                    'manage_stock'       => $product->get_manage_stock(),
                    'backorders'         => $product->get_backorders(),
                    'weight'             => $product->get_weight(),
                    'length'             => $product->get_length(),
                    'width'              => $product->get_width(),
                    'height'             => $product->get_height(),
                    'virtual'            => $product->get_virtual(),
                    'downloadable'       => $product->get_downloadable(),
                    'featured'           => $product->get_featured(),
                    'catalog_visibility' => $product->get_catalog_visibility(),
                    'tax_status'         => $product->get_tax_status(),
                    'tax_class'          => $product->get_tax_class(),
                    'attributes'         => $attributes,
                    'category_ids'       => $product->get_category_ids(),
                    'tag_ids'            => $product->get_tag_ids(),
                    'image_id'           => $product->get_image_id(),
                    'gallery_image_ids'  => $product->get_gallery_image_ids(),
                    'upsell_ids'         => $product->get_upsell_ids(),
                    'cross_sell_ids'     => $product->get_cross_sell_ids(),
                    'reviews_allowed'    => $product->get_reviews_allowed(),
                    'purchase_note'      => $product->get_purchase_note(),
                    'url'                => get_permalink( $product->get_id() ),
                ];

                if ( $product->is_type( 'variable' ) ) {
                    $data['variation_ids'] = $product->get_children();
                }

                return maxi_ai_response( true, $data );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
