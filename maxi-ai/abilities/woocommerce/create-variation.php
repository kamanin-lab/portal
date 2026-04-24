<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/create-variation',
        [
            'label'       => 'Create Variation',
            'description' => 'Create a product variation on a variable product. Set the attribute combination, price, stock, SKU, and image for this specific variant.',
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
                        'description' => 'Parent variable product ID.',
                    ],
                    'attributes' => [
                        'type'        => 'object',
                        'description' => 'Attribute combination as key-value pairs (e.g. {"Color": "Red", "Size": "Large"}).',
                    ],
                    'regular_price' => [
                        'type'        => 'string',
                        'description' => 'Regular price for this variation.',
                    ],
                    'sale_price' => [
                        'type'        => 'string',
                        'description' => 'Sale price for this variation.',
                    ],
                    'sku' => [
                        'type'        => 'string',
                        'description' => 'SKU for this variation.',
                    ],
                    'manage_stock' => [
                        'type'        => 'boolean',
                        'description' => 'Enable stock management for this variation.',
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
                        'description' => 'Whether the variation is enabled. Default true.',
                    ],
                ],
                'required' => [ 'product_id', 'attributes' ],
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

                $raw_attributes = $input['attributes'] ?? [];

                if ( empty( $raw_attributes ) || ! is_array( $raw_attributes ) ) {
                    return maxi_ai_response( false, [], 'Attributes object is required.' );
                }

                // Sanitize attribute values and normalize keys for WC storage.
                $variation_attributes = [];

                foreach ( $raw_attributes as $name => $value ) {
                    $key = sanitize_title( $name );

                    // Normalize taxonomy attribute keys to pa_ prefix.
                    $taxonomy = strpos( $key, 'pa_' ) === 0 ? $key : 'pa_' . $key;

                    if ( taxonomy_exists( $taxonomy ) ) {
                        $key   = $taxonomy;
                        $value = strtolower( sanitize_text_field( $value ) );
                    } else {
                        $value = sanitize_text_field( $value );
                    }

                    $variation_attributes[ $key ] = $value;
                }

                $variation = new WC_Product_Variation();
                $variation->set_parent_id( $product_id );
                $variation->set_attributes( $variation_attributes );
                $variation->set_status( 'publish' );

                // Set optional fields.
                if ( isset( $input['regular_price'] ) ) {
                    $variation->set_regular_price( sanitize_text_field( $input['regular_price'] ) );
                }

                if ( isset( $input['sale_price'] ) ) {
                    $variation->set_sale_price( sanitize_text_field( $input['sale_price'] ) );
                }

                if ( isset( $input['sku'] ) ) {
                    $variation->set_sku( sanitize_text_field( $input['sku'] ) );
                }

                if ( isset( $input['manage_stock'] ) ) {
                    $variation->set_manage_stock( (bool) $input['manage_stock'] );
                }

                if ( isset( $input['stock_quantity'] ) ) {
                    $variation->set_stock_quantity( intval( $input['stock_quantity'] ) );
                }

                if ( isset( $input['stock_status'] ) ) {
                    $variation->set_stock_status( sanitize_key( $input['stock_status'] ) );
                }

                if ( isset( $input['backorders'] ) ) {
                    $variation->set_backorders( sanitize_key( $input['backorders'] ) );
                }

                if ( isset( $input['weight'] ) ) {
                    $variation->set_weight( sanitize_text_field( $input['weight'] ) );
                }

                if ( isset( $input['length'] ) ) {
                    $variation->set_length( sanitize_text_field( $input['length'] ) );
                }

                if ( isset( $input['width'] ) ) {
                    $variation->set_width( sanitize_text_field( $input['width'] ) );
                }

                if ( isset( $input['height'] ) ) {
                    $variation->set_height( sanitize_text_field( $input['height'] ) );
                }

                if ( isset( $input['image_id'] ) ) {
                    $variation->set_image_id( intval( $input['image_id'] ) );
                }

                if ( isset( $input['enabled'] ) && ! $input['enabled'] ) {
                    $variation->set_status( 'private' );
                }

                $variation_id = $variation->save();

                if ( ! $variation_id ) {
                    return maxi_ai_response( false, [], 'Failed to create variation.' );
                }

                // Clear transient caches for parent product.
                wc_delete_product_transients( $product_id );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'variation_created',
                    get_current_user_id(),
                    'variation:' . $variation_id,
                    [ 'product_id' => $product_id ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'variation_id'  => $variation_id,
                        'product_id'    => $product_id,
                        'attributes'    => $variation_attributes,
                        'regular_price' => $variation->get_regular_price(),
                        'sku'           => $variation->get_sku(),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
