<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/set-terms',
        [
            'label'       => 'Set Terms',
            'description' => 'Replace all terms on a post for a given taxonomy. Removes existing terms first.',
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
                        'description' => 'Term IDs (integers) or slugs (strings) to set. Pass empty array to clear all terms.',
                        'items'       => [
                            'oneOf' => [
                                [ 'type' => 'integer' ],
                                [ 'type' => 'string' ],
                            ],
                        ],
                    ],
                ],
                'required' => [ 'post_id', 'taxonomy', 'terms' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_id  = intval( $input['post_id'] ?? 0 );
                $taxonomy = sanitize_key( $input['taxonomy'] );
                $terms    = array_map( 'sanitize_text_field', (array) ( $input['terms'] ?? [] ) );

                if ( ! get_post( $post_id ) ) {
                    return maxi_ai_response( false, [], 'Post not found: ' . $post_id );
                }

                if ( ! current_user_can( 'edit_post', $post_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to edit this post.' );
                }

                if ( ! taxonomy_exists( $taxonomy ) ) {
                    return maxi_ai_response( false, [], 'Invalid taxonomy: ' . $taxonomy );
                }

                // Convert numeric strings to integers for term IDs.
                $terms = array_map( function ( $term ) {
                    return is_numeric( $term ) ? intval( $term ) : $term;
                }, $terms );

                // false = replace (not append).
                $result = wp_set_object_terms( $post_id, $terms, $taxonomy, false );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                Maxi_AI_Audit_Log::record(
                    'taxonomy',
                    'terms_set',
                    get_current_user_id(),
                    'post:' . $post_id,
                    [ 'taxonomy' => $taxonomy, 'term_ids' => array_map( 'intval', $result ) ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id'  => $post_id,
                        'taxonomy' => $taxonomy,
                        'term_ids' => array_map( 'intval', $result ),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' ) || current_user_can( 'edit_products' );
            },

        ]
    );

} );
