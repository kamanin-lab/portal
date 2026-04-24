<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/update-coupon',
        [
            'label'       => 'Update Coupon',
            'description' => 'Update a WooCommerce coupon — change amount, expiry, usage limits, or restrictions. Send only fields to change.',
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
                        'description' => 'The coupon ID.',
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
                        'description' => 'Expiry date (Y-m-d). Empty string to remove.',
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
                        'description' => 'Cannot be combined with other coupons.',
                    ],
                    'exclude_sale_items' => [
                        'type'        => 'boolean',
                        'description' => 'Exclude sale items.',
                    ],
                    'product_ids' => [
                        'type'        => 'array',
                        'description' => 'Product IDs the coupon applies to.',
                        'items'       => [ 'type' => 'integer' ],
                    ],
                    'excluded_product_ids' => [
                        'type'        => 'array',
                        'description' => 'Excluded product IDs.',
                        'items'       => [ 'type' => 'integer' ],
                    ],
                    'product_categories' => [
                        'type'        => 'array',
                        'description' => 'Category IDs the coupon applies to.',
                        'items'       => [ 'type' => 'integer' ],
                    ],
                    'excluded_product_categories' => [
                        'type'        => 'array',
                        'description' => 'Excluded category IDs.',
                        'items'       => [ 'type' => 'integer' ],
                    ],
                    'free_shipping' => [
                        'type'        => 'boolean',
                        'description' => 'Grant free shipping.',
                    ],
                    'email_restrictions' => [
                        'type'        => 'array',
                        'description' => 'Email addresses that can use the coupon.',
                        'items'       => [ 'type' => 'string' ],
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

                $updated = [];

                $simple_setters = [
                    'discount_type'     => 'set_discount_type',
                    'amount'            => 'set_amount',
                    'description'       => 'set_description',
                    'minimum_amount'    => 'set_minimum_amount',
                    'maximum_amount'    => 'set_maximum_amount',
                ];

                foreach ( $simple_setters as $field => $method ) {
                    if ( isset( $input[ $field ] ) ) {
                        $coupon->$method( sanitize_text_field( $input[ $field ] ) );
                        $updated[] = $field;
                    }
                }

                $int_setters = [
                    'usage_limit'          => 'set_usage_limit',
                    'usage_limit_per_user' => 'set_usage_limit_per_user',
                ];

                foreach ( $int_setters as $field => $method ) {
                    if ( isset( $input[ $field ] ) ) {
                        $coupon->$method( intval( $input[ $field ] ) );
                        $updated[] = $field;
                    }
                }

                $bool_setters = [
                    'individual_use'     => 'set_individual_use',
                    'exclude_sale_items' => 'set_exclude_sale_items',
                    'free_shipping'      => 'set_free_shipping',
                ];

                foreach ( $bool_setters as $field => $method ) {
                    if ( isset( $input[ $field ] ) ) {
                        $coupon->$method( (bool) $input[ $field ] );
                        $updated[] = $field;
                    }
                }

                if ( array_key_exists( 'expiry_date', $input ) ) {
                    $coupon->set_date_expires( $input['expiry_date'] ? sanitize_text_field( $input['expiry_date'] ) : null );
                    $updated[] = 'expiry_date';
                }

                $array_setters = [
                    'product_ids'                  => 'set_product_ids',
                    'excluded_product_ids'         => 'set_excluded_product_ids',
                    'product_categories'           => 'set_product_categories',
                    'excluded_product_categories'  => 'set_excluded_product_categories',
                ];

                foreach ( $array_setters as $field => $method ) {
                    if ( isset( $input[ $field ] ) ) {
                        $coupon->$method( array_map( 'intval', $input[ $field ] ) );
                        $updated[] = $field;
                    }
                }

                if ( isset( $input['email_restrictions'] ) ) {
                    $coupon->set_email_restrictions( array_map( 'sanitize_email', $input['email_restrictions'] ) );
                    $updated[] = 'email_restrictions';
                }

                if ( empty( $updated ) ) {
                    return maxi_ai_response( false, [], 'No fields to update.' );
                }

                $coupon->save();

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'coupon_updated',
                    get_current_user_id(),
                    'coupon:' . $coupon->get_id(),
                    []
                );

                return maxi_ai_response(
                    true,
                    [
                        'coupon_id' => $coupon->get_id(),
                        'code'      => $coupon->get_code(),
                        'updated'   => $updated,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
