<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-product-attributes',
        [
            'label'       => 'Get Product Attributes',
            'description' => 'Get the attribute configuration for a WooCommerce product. Returns taxonomy vs custom distinction, term details, variation flags, and positions.',
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

                $attributes = [];

                foreach ( $product->get_attributes() as $attr ) {
                    if ( ! is_a( $attr, 'WC_Product_Attribute' ) ) {
                        continue;
                    }

                    $attr_data = [
                        'name'        => $attr->get_name(),
                        'id'          => $attr->get_id(),
                        'options'     => $attr->get_options(),
                        'visible'     => $attr->get_visible(),
                        'variation'   => $attr->get_variation(),
                        'position'    => $attr->get_position(),
                        'is_taxonomy' => $attr->is_taxonomy(),
                    ];

                    if ( $attr->is_taxonomy() ) {
                        $attr_data['taxonomy'] = $attr->get_taxonomy();
                        $terms = [];
                        foreach ( $attr->get_terms() as $term ) {
                            $terms[] = [
                                'term_id' => $term->term_id,
                                'name'    => $term->name,
                                'slug'    => $term->slug,
                            ];
                        }
                        $attr_data['terms'] = $terms;
                    }

                    $attributes[] = $attr_data;
                }

                return maxi_ai_response(
                    true,
                    [
                        'product_id'   => $product->get_id(),
                        'product_type' => $product->get_type(),
                        'attributes'   => $attributes,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
