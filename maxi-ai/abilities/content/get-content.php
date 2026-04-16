<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-content',
        [
            'label'       => 'Get Content',
            'description' => 'Retrieve a single post, page, or custom post type entry by ID.',
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
                        'description' => 'The post ID.',
                    ],
                ],
                'required' => [ 'post_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_id = intval( $input['post_id'] ?? 0 );
                $post    = get_post( $post_id );

                if ( ! $post ) {
                    return maxi_ai_response( false, [], 'Post not found: ' . $post_id );
                }

                // Track that this post's content was read in the current MCP session.
                // The Rule Gate enforces read-before-write on content updates.
                Maxi_AI_Rule_Session::mark_content_read( $post->ID );

                return maxi_ai_response(
                    true,
                    [
                        'post_id'      => $post->ID,
                        'post_type'    => $post->post_type,
                        'title'        => $post->post_title,
                        'content'      => $post->post_content,
                        'excerpt'      => $post->post_excerpt,
                        'status'       => $post->post_status,
                        'slug'         => $post->post_name,
                        'author'       => (int) $post->post_author,
                        'parent'       => (int) $post->post_parent,
                        'date'         => $post->post_date,
                        'modified'     => $post->post_modified,
                        'url'          => get_permalink( $post->ID ),
                        'thumbnail_id' => (int) get_post_thumbnail_id( $post->ID ),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'read' );
            },

        ]
    );

} );
