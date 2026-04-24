<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/set-product-attributes',
        [
            'label'       => 'Set Product Attributes',
            'description' => 'Set product attributes on a WooCommerce product. Automatically detects registered taxonomy attributes (e.g. pa_color) and assigns terms properly. Also supports custom/local attributes. Replaces all existing attributes.',
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
                        'description' => 'The WooCommerce product ID.',
                    ],
                    'attributes' => [
                        'type'        => 'array',
                        'description' => 'Array of attributes to set.',
                        'items'       => [
                            'type'       => 'object',
                            'properties' => [
                                'name' => [
                                    'type'        => 'string',
                                    'description' => 'Attribute name (e.g. "Color", "Size").',
                                ],
                                'options' => [
                                    'type'        => 'array',
                                    'description' => 'Attribute options. For taxonomy attributes (pa_*), accepts term IDs (integers), slugs, or names — existing terms are resolved by ID → slug → name before any new term is created, preventing duplicate "-2" slugs. For custom attributes, stored as plain strings.',
                                    'items'       => [ 'type' => [ 'string', 'integer' ] ],
                                ],
                                'visible' => [
                                    'type'        => 'boolean',
                                    'description' => 'Whether visible on the product page. Default true.',
                                ],
                                'variation' => [
                                    'type'        => 'boolean',
                                    'description' => 'Whether used for variations. Default false.',
                                ],
                            ],
                            'required' => [ 'name', 'options' ],
                        ],
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

                if ( ! $product ) {
                    return maxi_ai_response( false, [], 'Product not found: ' . $product_id );
                }

                $raw_attributes = $input['attributes'] ?? [];

                if ( empty( $raw_attributes ) || ! is_array( $raw_attributes ) ) {
                    return maxi_ai_response( false, [], 'Attributes array is required.' );
                }

                $wc_attributes = [];
                $position      = 0;

                foreach ( $raw_attributes as $raw ) {
                    $name = sanitize_text_field( $raw['name'] ?? '' );

                    // Preserve integer term IDs; sanitize string values.
                    $options = array_map( function ( $value ) {
                        if ( is_int( $value ) ) {
                            return $value;
                        }
                        if ( is_string( $value ) && ctype_digit( $value ) ) {
                            return (int) $value;
                        }
                        return sanitize_text_field( (string) $value );
                    }, (array) ( $raw['options'] ?? [] ) );

                    if ( empty( $name ) || empty( $options ) ) {
                        continue;
                    }

                    $attr = new WC_Product_Attribute();

                    // Check if this is a registered taxonomy attribute.
                    $taxonomy = strpos( $name, 'pa_' ) === 0 ? $name : 'pa_' . sanitize_title( $name );
                    $attr_id  = wc_attribute_taxonomy_id_by_name( $taxonomy );

                    if ( $attr_id ) {
                        // Taxonomy attribute — resolve to existing term IDs first to avoid
                        // creating duplicate "-2" terms when slugs are passed as strings.
                        $resolved = maxi_ai_resolve_term_ids( $options, $taxonomy, true );

                        if ( is_wp_error( $resolved ) ) {
                            return maxi_ai_response( false, [], $resolved->get_error_message() );
                        }

                        if ( empty( $resolved ) ) {
                            continue;
                        }

                        $attr->set_id( $attr_id );
                        $attr->set_name( $taxonomy );
                        $attr->set_options( $resolved );

                        wp_set_object_terms( $product_id, $resolved, $taxonomy );
                    } else {
                        // Custom/local attribute — store as plain strings.
                        $string_options = array_map( 'strval', $options );
                        $attr->set_name( $name );
                        $attr->set_options( $string_options );
                    }

                    $attr->set_visible( isset( $raw['visible'] ) ? (bool) $raw['visible'] : true );
                    $attr->set_variation( isset( $raw['variation'] ) ? (bool) $raw['variation'] : false );
                    $attr->set_position( $position );

                    $wc_attributes[] = $attr;
                    $position++;
                }

                if ( empty( $wc_attributes ) ) {
                    return maxi_ai_response( false, [], 'No valid attributes to set.' );
                }

                $product->set_attributes( $wc_attributes );
                $product->save();

                // Clear transient caches.
                wc_delete_product_transients( $product->get_id() );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'product_attributes_set',
                    get_current_user_id(),
                    'product:' . $product->get_id(),
                    [ 'attribute_count' => count( $wc_attributes ) ]
                );

                $result = [];

                foreach ( $wc_attributes as $attr ) {
                    $attr_data = [
                        'name'        => $attr->get_name(),
                        'options'     => $attr->get_options(),
                        'visible'     => $attr->get_visible(),
                        'variation'   => $attr->get_variation(),
                        'is_taxonomy' => $attr->is_taxonomy(),
                    ];

                    if ( $attr->is_taxonomy() ) {
                        $attr_data['taxonomy'] = $attr->get_taxonomy();
                    }

                    $result[] = $attr_data;
                }

                return maxi_ai_response(
                    true,
                    [
                        'product_id' => $product->get_id(),
                        'attributes' => $result,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_products' );
            },

        ]
    );

} );
