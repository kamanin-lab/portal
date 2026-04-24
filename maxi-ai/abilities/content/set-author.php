<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/set-author',
        [
            'label'       => 'Set Author',
            'description' => 'Change the author of a post, page, or custom post type entry.',
            'category'    => 'content',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'content_write_basic',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'post_id' => [
                        'type'        => 'integer',
                        'description' => 'The post ID.',
                    ],
                    'author_id' => [
                        'type'        => 'integer',
                        'description' => 'The user ID to set as author.',
                    ],
                ],
                'required' => [ 'post_id', 'author_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_id   = intval( $input['post_id'] ?? 0 );
                $author_id = intval( $input['author_id'] ?? 0 );

                $post = get_post( $post_id );

                if ( ! $post ) {
                    return maxi_ai_response( false, [], 'Post not found: ' . $post_id );
                }

                if ( ! current_user_can( 'edit_post', $post_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to edit this post.' );
                }

                if ( ! get_userdata( $author_id ) ) {
                    return maxi_ai_response( false, [], 'User not found: ' . $author_id );
                }

                $result = wp_update_post(
                    [
                        'ID'          => $post_id,
                        'post_author' => $author_id,
                    ],
                    true
                );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                $old_author = (int) $post->post_author;

                Maxi_AI_Audit_Log::record(
                    'content',
                    'author_changed',
                    get_current_user_id(),
                    'post:' . $post_id,
                    [ 'from' => $old_author, 'to' => $author_id ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id'   => $post_id,
                        'author_id' => $author_id,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_others_posts' );
            },

        ]
    );

} );
