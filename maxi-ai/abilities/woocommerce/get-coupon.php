<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-coupon',
        [
            'label'       => 'Get Coupon',
            'description' => 'Get full details of a WooCommerce coupon by ID or code, including usage stats and restrictions.',
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
                        'description' => 'Coupon ID.',
                    ],
                    'code' => [
                        'type'        => 'string',
                        'description' => 'Coupon code. Use this or coupon_id.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Coupon' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $identifier = null;

                if ( ! empty( $input['coupon_id'] ) ) {
                    $identifier = intval( $input['coupon_id'] );
                } elseif ( ! empty( $input['code'] ) ) {
                    $identifier = sanitize_text_field( $input['code'] );
                }

                if ( ! $identifier ) {
                    return maxi_ai_response( false, [], 'Provide either coupon_id or code.' );
                }

                $coupon = new WC_Coupon( $identifier );

                if ( ! $coupon->get_id() ) {
                    return maxi_ai_response( false, [], 'Coupon not found.' );
                }

                return maxi_ai_response(
                    true,
                    [
                        'coupon_id'                    => $coupon->get_id(),
                        'code'                         => $coupon->get_code(),
                        'description'                  => $coupon->get_description(),
                        'discount_type'                => $coupon->get_discount_type(),
                        'amount'                       => $coupon->get_amount(),
                        'usage_count'                  => $coupon->get_usage_count(),
                        'usage_limit'                  => $coupon->get_usage_limit(),
                        'usage_limit_per_user'         => $coupon->get_usage_limit_per_user(),
                        'expiry_date'                  => $coupon->get_date_expires() ? $coupon->get_date_expires()->date( 'Y-m-d' ) : null,
                        'minimum_amount'               => $coupon->get_minimum_amount(),
                        'maximum_amount'               => $coupon->get_maximum_amount(),
                        'individual_use'               => $coupon->get_individual_use(),
                        'exclude_sale_items'           => $coupon->get_exclude_sale_items(),
                        'product_ids'                  => $coupon->get_product_ids(),
                        'excluded_product_ids'         => $coupon->get_excluded_product_ids(),
                        'product_categories'           => $coupon->get_product_categories(),
                        'excluded_product_categories'  => $coupon->get_excluded_product_categories(),
                        'free_shipping'                => $coupon->get_free_shipping(),
                        'email_restrictions'           => $coupon->get_email_restrictions(),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
