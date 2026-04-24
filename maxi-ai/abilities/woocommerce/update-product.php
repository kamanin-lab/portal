<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/update-product',
        [
            'label'       => 'Update Product',
            'description' => 'Update WooCommerce product data: prices, stock, SKU, dimensions, sale schedule, visibility. Send only the fields you want to change.',
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
                        'description' => 'The WooCommerce product ID.',
                    ],
                    'regular_price' => [
                        'type'        => 'string',
                        'description' => 'Regular price.',
                    ],
                    'sale_price' => [
                        'type'        => 'string',
                        'description' => 'Sale price. Set to empty string to remove sale.',
                    ],
                    'sale_date_from' => [
                        'type'        => 'string',
                        'description' => 'Sale start date (Y-m-d).',
                    ],
                    'sale_date_to' => [
                        'type'        => 'string',
                        'description' => 'Sale end date (Y-m-d).',
                    ],
                    'sku' => [
                        'type'        => 'string',
                        'description' => 'Product SKU.',
                    ],
                    'manage_stock' => [
                        'type'        => 'boolean',
                        'description' => 'Enable stock management.',
                    ],
                    'stock_quantity' => [
                        'type'        => 'integer',
                        'description' => 'Stock quantity.',
                    ],
                    'stock_status' => [
                        'type'        => 'string',
                        'description' => 'Stock status.',
                        'enum'        => [ 'instock', 'outofstock', 'onbackorder' ],
                    ],
                    'backorders' => [
                        'type'        => 'string',
                        'description' => 'Backorder setting.',
                        'enum'        => [ 'no', 'notify', 'yes' ],
                    ],
                    'weight' => [
                        'type'        => 'string',
                        'description' => 'Product weight.',
                    ],
                    'length' => [
                        'type'        => 'string',
                        'description' => 'Product length.',
                    ],
                    'width' => [
                        'type'        => 'string',
                        'description' => 'Product width.',
                    ],
                    'height' => [
                        'type'        => 'string',
                        'description' => 'Product height.',
                    ],
                    'virtual' => [
                        'type'        => 'boolean',
                        'description' => 'Whether the product is virtual.',
                    ],
                    'downloadable' => [
                        'type'        => 'boolean',
                        'description' => 'Whether the product is downloadable.',
                    ],
                    'featured' => [
                        'type'        => 'boolean',
                        'description' => 'Whether the product is featured.',
                    ],
                    'catalog_visibility' => [
                        'type'        => 'string',
                        'description' => 'Catalog visibility.',
                        'enum'        => [ 'visible', 'catalog', 'search', 'hidden' ],
                    ],
                    'tax_status' => [
                        'type'        => 'string',
                        'description' => 'Tax status.',
                        'enum'        => [ 'taxable', 'shipping', 'none' ],
                    ],
                    'tax_class' => [
                        'type'        => 'string',
                        'description' => 'Tax class. Empty string for standard.',
                    ],
                    'purchase_note' => [
                        'type'        => 'string',
                        'description' => 'Purchase note shown after purchase.',
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

                $updated = [];

                $setters = [
                    'regular_price'      => 'set_regular_price',
                    'sale_price'         => 'set_sale_price',
                    'sku'                => 'set_sku',
                    'manage_stock'       => 'set_manage_stock',
                    'stock_quantity'     => 'set_stock_quantity',
                    'stock_status'       => 'set_stock_status',
                    'backorders'         => 'set_backorders',
                    'weight'             => 'set_weight',
                    'length'             => 'set_length',
                    'width'              => 'set_width',
                    'height'             => 'set_height',
                    'virtual'            => 'set_virtual',
                    'downloadable'       => 'set_downloadable',
                    'featured'           => 'set_featured',
                    'catalog_visibility' => 'set_catalog_visibility',
                    'tax_status'         => 'set_tax_status',
                    'tax_class'          => 'set_tax_class',
                    'purchase_note'      => 'set_purchase_note',
                ];

                foreach ( $setters as $field => $method ) {
                    if ( array_key_exists( $field, $input ) ) {
                        $value = $input[ $field ];

                        // Sanitize based on type.
                        if ( is_string( $value ) ) {
                            $value = sanitize_text_field( $value );
                        } elseif ( is_int( $value ) ) {
                            $value = intval( $value );
                        }

                        $product->$method( $value );
                        $updated[] = $field;
                    }
                }

                // Handle sale dates separately.
                if ( isset( $input['sale_date_from'] ) ) {
                    $product->set_date_on_sale_from( sanitize_text_field( $input['sale_date_from'] ) );
                    $updated[] = 'sale_date_from';
                }

                if ( isset( $input['sale_date_to'] ) ) {
                    $product->set_date_on_sale_to( sanitize_text_field( $input['sale_date_to'] ) );
                    $updated[] = 'sale_date_to';
                }

                if ( empty( $updated ) ) {
                    return maxi_ai_response( false, [], 'No fields to update.' );
                }

                $product->save();

                // Clear transient caches.
                wc_delete_product_transients( $product->get_id() );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'product_updated',
                    get_current_user_id(),
                    'product:' . $product->get_id(),
                    [ 'updated_fields' => $updated ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'product_id' => $product->get_id(),
                        'updated'    => $updated,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
