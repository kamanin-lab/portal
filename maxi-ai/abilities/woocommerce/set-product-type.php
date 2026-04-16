<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/set-product-type',
        [
            'label'       => 'Set Product Type',
            'description' => 'Convert a WooCommerce product between types (simple, variable, grouped, external). Handles the type term assignment and clears all related caches so the change takes effect immediately.',
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
                    'type' => [
                        'type'        => 'string',
                        'description' => 'Target product type.',
                        'enum'        => [ 'simple', 'variable', 'grouped', 'external' ],
                    ],
                ],
                'required' => [ 'product_id', 'type' ],
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

                $new_type     = sanitize_key( $input['type'] ?? '' );
                $current_type = $product->get_type();

                if ( $current_type === $new_type ) {
                    return maxi_ai_response(
                        true,
                        [
                            'product_id' => $product_id,
                            'type'       => $new_type,
                            'changed'    => false,
                            'message'    => 'Product is already type: ' . $new_type,
                        ]
                    );
                }

                $valid_types = [ 'simple', 'variable', 'grouped', 'external' ];

                if ( ! in_array( $new_type, $valid_types, true ) ) {
                    return maxi_ai_response( false, [], 'Invalid product type: ' . $new_type );
                }

                // Set the product type term.
                $result = wp_set_object_terms( $product_id, $new_type, 'product_type' );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                // Clear WooCommerce object cache so wc_get_product() returns the new type.
                clean_post_cache( $product_id );
                wc_delete_product_transients( $product_id );

                // Verify the type change took effect.
                $updated_product = wc_get_product( $product_id );
                $verified_type   = $updated_product ? $updated_product->get_type() : 'unknown';

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'product_type_changed',
                    get_current_user_id(),
                    'product:' . $product_id,
                    [ 'type' => $verified_type ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'product_id'    => $product_id,
                        'previous_type' => $current_type,
                        'type'          => $verified_type,
                        'changed'       => true,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
