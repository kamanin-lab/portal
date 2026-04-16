<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/delete-variation',
        [
            'label'       => 'Delete Variation',
            'description' => 'Delete a product variation permanently by ID.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'variation_id' => [
                        'type'        => 'integer',
                        'description' => 'The variation ID to delete.',
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

                $parent_id = $variation->get_parent_id();
                $variation->delete( true );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'variation_deleted',
                    get_current_user_id(),
                    'variation:' . $variation_id,
                    [ 'product_id' => $parent_id ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'variation_id' => $variation_id,
                        'parent_id'    => $parent_id,
                        'deleted'      => true,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
