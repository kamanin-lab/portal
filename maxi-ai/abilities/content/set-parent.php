<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/set-parent',
        [
            'label'       => 'Set Parent',
            'description' => 'Set or remove the parent of a hierarchical post (page, etc.).',
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
                    'parent_id' => [
                        'type'        => 'integer',
                        'description' => 'The parent post ID. Use 0 to remove parent.',
                    ],
                ],
                'required' => [ 'post_id', 'parent_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_id   = intval( $input['post_id'] ?? 0 );
                $parent_id = intval( $input['parent_id'] ?? 0 );
                $post      = get_post( $post_id );

                if ( ! $post ) {
                    return maxi_ai_response( false, [], 'Post not found: ' . $post_id );
                }

                if ( ! current_user_can( 'edit_post', $post_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to edit this post.' );
                }

                if ( ! is_post_type_hierarchical( $post->post_type ) ) {
                    return maxi_ai_response( false, [], 'Post type "' . $post->post_type . '" is not hierarchical.' );
                }

                if ( $parent_id > 0 && ! get_post( $parent_id ) ) {
                    return maxi_ai_response( false, [], 'Parent post not found: ' . $parent_id );
                }

                $result = wp_update_post(
                    [
                        'ID'          => $post_id,
                        'post_parent' => $parent_id,
                    ],
                    true
                );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                $old_parent = (int) $post->post_parent;

                Maxi_AI_Audit_Log::record(
                    'content',
                    'parent_changed',
                    get_current_user_id(),
                    'post:' . $post_id,
                    [ 'from' => $old_parent, 'to' => $parent_id ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id'   => $post_id,
                        'parent_id' => $parent_id,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_pages' );
            },

        ]
    );

} );
