<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/duplicate-content',
        [
            'label'       => 'Duplicate Content',
            'description' => 'Duplicate an existing post, page, or custom post type entry as a draft.',
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
                        'description' => 'The post ID to duplicate.',
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'Title for the duplicate. Defaults to original title with " (Copy)" suffix.',
                    ],
                    'status' => [
                        'type'        => 'string',
                        'description' => 'Status for the duplicate. Default "draft".',
                        'enum'        => [ 'draft', 'publish', 'pending', 'private' ],
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

                if ( ! current_user_can( 'edit_post', $post_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to edit this post.' );
                }

                $title  = isset( $input['title'] )
                    ? sanitize_text_field( $input['title'] )
                    : $post->post_title . ' (Copy)';
                $status = sanitize_key( $input['status'] ?? 'draft' );

                $allowed_statuses = [ 'draft', 'publish', 'pending', 'private' ];
                if ( ! in_array( $status, $allowed_statuses, true ) ) {
                    return maxi_ai_response( false, [], 'Invalid status. Allowed: ' . implode( ', ', $allowed_statuses ) );
                }

                $new_post_id = wp_insert_post(
                    [
                        'post_type'    => $post->post_type,
                        'post_title'   => $title,
                        'post_content' => $post->post_content,
                        'post_excerpt' => $post->post_excerpt,
                        'post_status'  => $status,
                        'post_parent'  => $post->post_parent,
                        'post_author'  => get_current_user_id(),
                    ],
                    true
                );

                if ( is_wp_error( $new_post_id ) ) {
                    return maxi_ai_response( false, [], $new_post_id->get_error_message() );
                }

                // Duplicate post meta.
                $meta = get_post_meta( $post_id );

                foreach ( $meta as $key => $values ) {
                    if ( strpos( $key, '_edit_' ) === 0 ) {
                        continue;
                    }
                    foreach ( $values as $value ) {
                        add_post_meta( $new_post_id, $key, maybe_unserialize( $value ) );
                    }
                }

                // Duplicate taxonomy terms.
                $taxonomies = get_object_taxonomies( $post->post_type );

                foreach ( $taxonomies as $taxonomy ) {
                    $terms = wp_get_object_terms( $post_id, $taxonomy, [ 'fields' => 'ids' ] );
                    if ( ! is_wp_error( $terms ) && ! empty( $terms ) ) {
                        wp_set_object_terms( $new_post_id, $terms, $taxonomy );
                    }
                }

                Maxi_AI_Audit_Log::record(
                    'content',
                    'content_duplicated',
                    get_current_user_id(),
                    'post:' . $new_post_id,
                    [ 'source_id' => $post_id ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id'        => (int) $new_post_id,
                        'source_post_id' => $post_id,
                        'url'            => get_permalink( $new_post_id ),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
