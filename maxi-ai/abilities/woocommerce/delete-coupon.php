<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/delete-coupon',
        [
            'label'       => 'Delete Coupon',
            'description' => 'Delete a WooCommerce coupon permanently by ID.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'woocommerce_coupons',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'coupon_id' => [
                        'type'        => 'integer',
                        'description' => 'The coupon ID to delete.',
                    ],
                ],
                'required' => [ 'coupon_id' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Coupon' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $coupon_id = intval( $input['coupon_id'] ?? 0 );
                $coupon    = new WC_Coupon( $coupon_id );

                if ( ! $coupon->get_id() ) {
                    return maxi_ai_response( false, [], 'Coupon not found: ' . $coupon_id );
                }

                $code = $coupon->get_code();
                $coupon->delete( true );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'coupon_deleted',
                    get_current_user_id(),
                    'coupon:' . $coupon_id,
                    [ 'code' => $code ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'coupon_id' => $coupon_id,
                        'code'      => $code,
                        'deleted'   => true,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
