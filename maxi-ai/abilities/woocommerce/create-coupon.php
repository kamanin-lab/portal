<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/create-coupon',
        [
            'label'       => 'Create Coupon',
            'description' => 'Create a WooCommerce coupon with discount type, amount, usage limits, product/category restrictions, and expiry date.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'code' => [
                        'type'        => 'string',
                        'description' => 'Coupon code.',
                    ],
                    'discount_type' => [
                        'type'        => 'string',
                        'description' => 'Type of discount.',
                        'enum'        => [ 'percent', 'fixed_cart', 'fixed_product' ],
                    ],
                    'amount' => [
                        'type'        => 'string',
                        'description' => 'Discount amount.',
                    ],
                    'description' => [
                        'type'        => 'string',
                        'description' => 'Coupon description.',
                    ],
                    'usage_limit' => [
                        'type'        => 'integer',
                        'description' => 'Total usage limit.',
                    ],
                    'usage_limit_per_user' => [
                        'type'        => 'integer',
                        'description' => 'Usage limit per customer.',
                    ],
                    'expiry_date' => [
                        'type'        => 'string',
                        'description' => 'Expiry date (Y-m-d).',
                    ],
                    'minimum_amount' => [
                        'type'        => 'string',
                        'description' => 'Minimum order amount.',
                    ],
                    'maximum_amount' => [
                        'type'        => 'string',
                        'description' => 'Maximum order amount.',
                    ],
                    'individual_use' => [
                        'type'        => 'boolean',
                        'description' => 'Whether coupon cannot be combined with other coupons.',
                    ],
                    'exclude_sale_items' => [
                        'type'        => 'boolean',
                        'description' => 'Whether to exclude sale items.',
                    ],
                    'product_ids' => [
                        'type'        => 'array',
                        'description' => 'Product IDs the coupon applies to.',
                        'items'       => [ 'type' => 'integer' ],
                    ],
                    'excluded_product_ids' => [
                        'type'        => 'array',
                        'description' => 'Product IDs excluded from the coupon.',
                        'items'       => [ 'type' => 'integer' ],
                    ],
                    'product_categories' => [
                        'type'        => 'array',
                        'description' => 'Category IDs the coupon applies to.',
                        'items'       => [ 'type' => 'integer' ],
                    ],
                    'excluded_product_categories' => [
                        'type'        => 'array',
                        'description' => 'Category IDs excluded from the coupon.',
                        'items'       => [ 'type' => 'integer' ],
                    ],
                    'free_shipping' => [
                        'type'        => 'boolean',
                        'description' => 'Whether the coupon grants free shipping.',
                    ],
                    'email_restrictions' => [
                        'type'        => 'array',
                        'description' => 'Email addresses that can use the coupon.',
                        'items'       => [ 'type' => 'string' ],
                    ],
                ],
                'required' => [ 'code', 'discount_type', 'amount' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Coupon' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $coupon = new WC_Coupon();
                $coupon->set_code( sanitize_text_field( $input['code'] ) );
                $coupon->set_discount_type( sanitize_key( $input['discount_type'] ) );
                $coupon->set_amount( sanitize_text_field( $input['amount'] ) );

                if ( isset( $input['description'] ) ) {
                    $coupon->set_description( sanitize_textarea_field( $input['description'] ) );
                }

                if ( isset( $input['usage_limit'] ) ) {
                    $coupon->set_usage_limit( intval( $input['usage_limit'] ) );
                }

                if ( isset( $input['usage_limit_per_user'] ) ) {
                    $coupon->set_usage_limit_per_user( intval( $input['usage_limit_per_user'] ) );
                }

                if ( isset( $input['expiry_date'] ) ) {
                    $coupon->set_date_expires( sanitize_text_field( $input['expiry_date'] ) );
                }

                if ( isset( $input['minimum_amount'] ) ) {
                    $coupon->set_minimum_amount( sanitize_text_field( $input['minimum_amount'] ) );
                }

                if ( isset( $input['maximum_amount'] ) ) {
                    $coupon->set_maximum_amount( sanitize_text_field( $input['maximum_amount'] ) );
                }

                if ( isset( $input['individual_use'] ) ) {
                    $coupon->set_individual_use( (bool) $input['individual_use'] );
                }

                if ( isset( $input['exclude_sale_items'] ) ) {
                    $coupon->set_exclude_sale_items( (bool) $input['exclude_sale_items'] );
                }

                if ( isset( $input['product_ids'] ) ) {
                    $coupon->set_product_ids( array_map( 'intval', $input['product_ids'] ) );
                }

                if ( isset( $input['excluded_product_ids'] ) ) {
                    $coupon->set_excluded_product_ids( array_map( 'intval', $input['excluded_product_ids'] ) );
                }

                if ( isset( $input['product_categories'] ) ) {
                    $coupon->set_product_categories( array_map( 'intval', $input['product_categories'] ) );
                }

                if ( isset( $input['excluded_product_categories'] ) ) {
                    $coupon->set_excluded_product_categories( array_map( 'intval', $input['excluded_product_categories'] ) );
                }

                if ( isset( $input['free_shipping'] ) ) {
                    $coupon->set_free_shipping( (bool) $input['free_shipping'] );
                }

                if ( isset( $input['email_restrictions'] ) ) {
                    $coupon->set_email_restrictions( array_map( 'sanitize_email', $input['email_restrictions'] ) );
                }

                $coupon_id = $coupon->save();

                if ( ! $coupon_id ) {
                    return maxi_ai_response( false, [], 'Failed to create coupon.' );
                }

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'coupon_created',
                    get_current_user_id(),
                    'coupon:' . $coupon_id,
                    [ 'code' => $coupon->get_code() ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'coupon_id'     => $coupon_id,
                        'code'          => $coupon->get_code(),
                        'discount_type' => $coupon->get_discount_type(),
                        'amount'        => $coupon->get_amount(),
                        'expiry_date'   => $coupon->get_date_expires() ? $coupon->get_date_expires()->date( 'Y-m-d' ) : null,
                        'usage_limit'   => $coupon->get_usage_limit(),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
