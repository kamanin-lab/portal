<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-taxonomies',
        [
            'label'       => 'Get Taxonomies',
            'description' => 'List all registered taxonomies with their labels and associated post types.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'public_only' => [
                        'type'        => 'boolean',
                        'description' => 'Only return public taxonomies. Default true.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                $public_only = (bool) ( $input['public_only'] ?? true );
                $args        = $public_only ? [ 'public' => true ] : [];
                $taxonomies  = get_taxonomies( $args, 'objects' );

                // WooCommerce registers pa_* attribute taxonomies as non-public.
                // Always include them — they're essential for product management.
                if ( $public_only ) {
                    $all = get_taxonomies( [], 'objects' );
                    foreach ( $all as $tax ) {
                        if ( strpos( $tax->name, 'pa_' ) === 0 && ! isset( $taxonomies[ $tax->name ] ) ) {
                            $taxonomies[ $tax->name ] = $tax;
                        }
                    }
                }

                $items = [];

                foreach ( $taxonomies as $taxonomy ) {
                    $items[] = [
                        'name'         => $taxonomy->name,
                        'label'        => $taxonomy->label,
                        'singular'     => $taxonomy->labels->singular_name,
                        'public'       => (bool) $taxonomy->public,
                        'hierarchical' => (bool) $taxonomy->hierarchical,
                        'post_types'   => (array) $taxonomy->object_type,
                    ];
                }

                return maxi_ai_response(
                    true,
                    [
                        'items' => $items,
                        'total' => count( $items ),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'read' );
            },

        ]
    );

} );
