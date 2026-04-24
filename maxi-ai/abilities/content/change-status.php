<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/change-status',
        [
            'label'       => 'Change Status',
            'description' => 'Change the status of a post, page, or custom post type entry (publish, draft, trash, restore, etc.).',
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
                    'status' => [
                        'type'        => 'string',
                        'description' => 'The new status.',
                        'enum'        => [ 'publish', 'draft', 'pending', 'private', 'trash' ],
                    ],
                ],
                'required' => [ 'post_id', 'status' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_id = intval( $input['post_id'] ?? 0 );
                $status  = sanitize_key( $input['status'] ?? '' );

                $allowed_statuses = [ 'publish', 'draft', 'pending', 'private', 'trash' ];
                if ( ! in_array( $status, $allowed_statuses, true ) ) {
                    return maxi_ai_response( false, [], 'Invalid status. Allowed: ' . implode( ', ', $allowed_statuses ) );
                }

                $post    = get_post( $post_id );

                if ( ! $post ) {
                    return maxi_ai_response( false, [], 'Post not found: ' . $post_id );
                }

                if ( ! current_user_can( 'edit_post', $post_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to edit this post.' );
                }

                $old_status = $post->post_status;

                $result = wp_update_post(
                    [
                        'ID'          => $post_id,
                        'post_status' => $status,
                    ],
                    true
                );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                Maxi_AI_Audit_Log::record(
                    'content',
                    'status_changed',
                    get_current_user_id(),
                    'post:' . $post_id,
                    [ 'from' => $old_status, 'to' => $status ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id'    => $post_id,
                        'old_status' => $old_status,
                        'new_status' => $status,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
