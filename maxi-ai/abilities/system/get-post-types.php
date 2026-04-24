<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-post-types',
        [
            'label'       => 'Get Post Types',
            'description' => 'List all registered post types with their labels and capabilities. '
                           . 'Defaults to public types only. Set public_only to false to include '
                           . 'non-public types (e.g. ACF-registered post types, internal types).',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'session_system',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'public_only' => [
                        'type'        => 'boolean',
                        'description' => 'Only return public post types. Default true.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                $public_only = (bool) ( $input['public_only'] ?? true );
                $args        = $public_only ? [ 'public' => true ] : [];
                $post_types  = get_post_types( $args, 'objects' );
                $items       = [];

                foreach ( $post_types as $post_type ) {
                    $items[] = [
                        'name'         => $post_type->name,
                        'label'        => $post_type->label,
                        'singular'     => $post_type->labels->singular_name,
                        'description'  => $post_type->description,
                        'public'       => (bool) $post_type->public,
                        'hierarchical' => (bool) $post_type->hierarchical,
                        'has_archive'  => (bool) $post_type->has_archive,
                        'supports'     => get_all_post_type_supports( $post_type->name ),
                        'taxonomies'   => get_object_taxonomies( $post_type->name ),
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
