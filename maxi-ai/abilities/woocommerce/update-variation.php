<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/update-variation',
        [
            'label'       => 'Update Variation',
            'description' => 'Update an existing product variation — change its attributes, price, stock, SKU, dimensions, image, or enabled status. Send only fields to change.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'woocommerce_catalog',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'variation_id' => [
                        'type'        => 'integer',
                        'description' => 'The variation ID.',
                    ],
                    'regular_price' => [
                        'type'        => 'string',
                        'description' => 'Regular price.',
                    ],
                    'sale_price' => [
                        'type'        => 'string',
                        'description' => 'Sale price. Set to empty string to remove sale.',
                    ],
                    'sku' => [
                        'type'        => 'string',
                        'description' => 'SKU.',
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
                        'description' => 'Weight.',
                    ],
                    'length' => [
                        'type'        => 'string',
                        'description' => 'Length.',
                    ],
                    'width' => [
                        'type'        => 'string',
                        'description' => 'Width.',
                    ],
                    'height' => [
                        'type'        => 'string',
                        'description' => 'Height.',
                    ],
                    'image_id' => [
                        'type'        => 'integer',
                        'description' => 'Attachment ID for variation image.',
                    ],
                    'enabled' => [
                        'type'        => 'boolean',
                        'description' => 'Whether the variation is enabled.',
                    ],
                    'attributes' => [
                        'type'        => 'object',
                        'description' => 'Attribute key-value pairs to update (e.g. {"pa_color": "black"}). Keys are attribute slugs.',
                    ],
                ],
                'required' => [ 'variation_id' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_product' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $variation_id = intval( $input['variation_id'] ?? 0 );
                $variation    = wc_get_product( $variation_id );

                if ( ! $variation || ! $variation instanceof WC_Product_Variation ) {
                    return maxi_ai_response( false, [], 'Variation not found: ' . $variation_id );
                }

                $updated = [];

                $setters = [
                    'regular_price'  => 'set_regular_price',
                    'sale_price'     => 'set_sale_price',
                    'sku'            => 'set_sku',
                    'manage_stock'   => 'set_manage_stock',
                    'stock_quantity' => 'set_stock_quantity',
                    'stock_status'   => 'set_stock_status',
                    'backorders'     => 'set_backorders',
                    'weight'         => 'set_weight',
                    'length'         => 'set_length',
                    'width'          => 'set_width',
                    'height'         => 'set_height',
                    'image_id'       => 'set_image_id',
                ];

                foreach ( $setters as $field => $method ) {
                    if ( array_key_exists( $field, $input ) ) {
                        $value = $input[ $field ];

                        if ( is_string( $value ) ) {
                            $value = sanitize_text_field( $value );
                        } elseif ( is_int( $value ) ) {
                            $value = intval( $value );
                        }

                        $variation->$method( $value );
                        $updated[] = $field;
                    }
                }

                if ( isset( $input['enabled'] ) ) {
                    $variation->set_status( $input['enabled'] ? 'publish' : 'private' );
                    $updated[] = 'enabled';
                }

                if ( isset( $input['attributes'] ) && is_array( $input['attributes'] ) ) {
                    $current   = $variation->get_attributes();
                    $new_attrs = [];

                    foreach ( $input['attributes'] as $name => $value ) {
                        $key = sanitize_title( $name );

                        // Normalize taxonomy attribute keys to pa_ prefix.
                        $taxonomy = strpos( $key, 'pa_' ) === 0 ? $key : 'pa_' . $key;

                        if ( taxonomy_exists( $taxonomy ) ) {
                            $key   = $taxonomy;
                            $value = strtolower( sanitize_text_field( $value ) );
                        } else {
                            $value = sanitize_text_field( $value );
                        }

                        $new_attrs[ $key ] = $value;
                    }

                    $variation->set_attributes( array_merge( $current, $new_attrs ) );
                    $updated[] = 'attributes';
                }

                if ( empty( $updated ) ) {
                    return maxi_ai_response( false, [], 'No fields to update.' );
                }

                $variation->save();

                // Clear transient caches for parent product.
                wc_delete_product_transients( $variation->get_parent_id() );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'variation_updated',
                    get_current_user_id(),
                    'variation:' . $variation->get_id(),
                    [ 'product_id' => $variation->get_parent_id() ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'variation_id' => $variation->get_id(),
                        'parent_id'    => $variation->get_parent_id(),
                        'updated'      => $updated,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
