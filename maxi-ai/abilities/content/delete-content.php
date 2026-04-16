<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/delete-content',
        [
            'label'       => 'Delete Content',
            'description' => 'Permanently delete a post, page, or custom post type entry.',
            'category'    => 'content',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'post_id' => [
                        'type'        => 'integer',
                        'description' => 'The post ID to delete.',
                    ],
                    'force' => [
                        'type'        => 'boolean',
                        'description' => 'Skip trash and delete permanently. Default false.',
                    ],
                ],
                'required' => [ 'post_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_id = intval( $input['post_id'] ?? 0 );
                $force   = (bool) ( $input['force'] ?? false );
                $post    = get_post( $post_id );

                if ( ! $post ) {
                    return maxi_ai_response( false, [], 'Post not found: ' . $post_id );
                }

                if ( ! current_user_can( 'delete_post', $post_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to delete this post.' );
                }

                $result = wp_delete_post( $post_id, $force );

                if ( ! $result ) {
                    return maxi_ai_response( false, [], 'Failed to delete post: ' . $post_id );
                }

                Maxi_AI_Audit_Log::record(
                    'content',
                    'content_deleted',
                    get_current_user_id(),
                    'post:' . $post_id,
                    [ 'force' => $force ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id' => $post_id,
                        'action'  => $force ? 'deleted' : 'trashed',
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'delete_posts' );
            },

        ]
    );

} );
