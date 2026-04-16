<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-content-by-slug',
        [
            'label'       => 'Get Content by Slug',
            'description' => 'Retrieve a post, page, or custom post type entry by its URL slug.',
            'category'    => 'content',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'slug' => [
                        'type'        => 'string',
                        'description' => 'The URL slug.',
                    ],
                    'post_type' => [
                        'type'        => 'string',
                        'description' => 'The post type. Default "page".',
                    ],
                ],
                'required' => [ 'slug' ],
            ],

            'execute_callback' => function ( $input ) {

                $slug      = sanitize_title( $input['slug'] );
                $post_type = sanitize_key( $input['post_type'] ?? 'page' );

                if ( ! post_type_exists( $post_type ) ) {
                    return maxi_ai_response( false, [], 'Invalid post type: ' . $post_type );
                }

                $posts = get_posts( [
                    'name'        => $slug,
                    'post_type'   => $post_type,
                    'post_status' => [ 'publish', 'draft', 'pending', 'private', 'future' ],
                    'numberposts' => 1,
                ] );

                if ( empty( $posts ) ) {
                    return maxi_ai_response( false, [], 'No content found with slug "' . $slug . '" in post type "' . $post_type . '".' );
                }

                $post = $posts[0];

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
