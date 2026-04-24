<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/remove-terms',
        [
            'label'       => 'Remove Terms',
            'description' => 'Remove specific terms from a post without affecting other terms.',
            'category'    => 'taxonomy',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'taxonomy',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'post_id' => [
                        'type'        => 'integer',
                        'description' => 'The post ID.',
                    ],
                    'taxonomy' => [
                        'type'        => 'string',
                        'description' => 'The taxonomy.',
                    ],
                    'terms' => [
                        'type'        => 'array',
                        'description' => 'Term IDs to remove.',
                        'items'       => [ 'type' => 'integer' ],
                    ],
                ],
                'required' => [ 'post_id', 'taxonomy', 'terms' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_id  = intval( $input['post_id'] ?? 0 );
                $taxonomy = sanitize_key( $input['taxonomy'] );
                $terms    = array_map( 'intval', (array) ( $input['terms'] ?? [] ) );

                if ( ! get_post( $post_id ) ) {
                    return maxi_ai_response( false, [], 'Post not found: ' . $post_id );
                }

                if ( ! current_user_can( 'edit_post', $post_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to edit this post.' );
                }

                if ( ! taxonomy_exists( $taxonomy ) ) {
                    return maxi_ai_response( false, [], 'Invalid taxonomy: ' . $taxonomy );
                }

                $result = wp_remove_object_terms( $post_id, $terms, $taxonomy );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                Maxi_AI_Audit_Log::record(
                    'taxonomy',
                    'terms_removed',
                    get_current_user_id(),
                    'post:' . $post_id,
                    [ 'taxonomy' => $taxonomy, 'removed' => $terms ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id'      => $post_id,
                        'taxonomy'     => $taxonomy,
                        'removed'      => $terms,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' ) || current_user_can( 'edit_products' );
            },

        ]
    );

} );
