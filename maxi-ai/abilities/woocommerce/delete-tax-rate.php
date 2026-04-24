<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/delete-tax-rate',
        [
            'label'       => 'Delete Tax Rate',
            'description' => 'Delete a WooCommerce tax rate by ID.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'woocommerce_shipping_tax',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'tax_rate_id' => [
                        'type'        => 'integer',
                        'description' => 'The tax rate ID to delete.',
                    ],
                ],
                'required' => [ 'tax_rate_id' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Tax' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $tax_rate_id = intval( $input['tax_rate_id'] ?? 0 );

                if ( ! $tax_rate_id ) {
                    return maxi_ai_response( false, [], 'Invalid tax rate ID.' );
                }

                WC_Tax::_delete_tax_rate( $tax_rate_id );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'tax_rate_deleted',
                    get_current_user_id(),
                    'tax_rate:' . $tax_rate_id,
                    []
                );

                return maxi_ai_response(
                    true,
                    [
                        'tax_rate_id' => $tax_rate_id,
                        'deleted'     => true,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
