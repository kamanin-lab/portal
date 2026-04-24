<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/attach-media',
        [
            'label'       => 'Attach Media',
            'description' => 'Attach an existing media item to a post.',
            'category'    => 'media',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'media_basic',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'attachment_id' => [
                        'type'        => 'integer',
                        'description' => 'The attachment ID.',
                    ],
                    'parent_id' => [
                        'type'        => 'integer',
                        'description' => 'The post ID to attach to.',
                    ],
                ],
                'required' => [ 'attachment_id', 'parent_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $attachment_id = intval( $input['attachment_id'] ?? 0 );
                $parent_id     = intval( $input['parent_id'] ?? 0 );

                $attachment = get_post( $attachment_id );

                if ( ! $attachment || $attachment->post_type !== 'attachment' ) {
                    return maxi_ai_response( false, [], 'Attachment not found: ' . $attachment_id );
                }

                if ( ! get_post( $parent_id ) ) {
                    return maxi_ai_response( false, [], 'Parent post not found: ' . $parent_id );
                }

                if ( ! current_user_can( 'edit_post', $parent_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to edit this post.' );
                }

                $result = wp_update_post(
                    [
                        'ID'          => $attachment_id,
                        'post_parent' => $parent_id,
                    ],
                    true
                );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                Maxi_AI_Audit_Log::record(
                    'media',
                    'media_attached',
                    get_current_user_id(),
                    'attachment:' . $attachment_id,
                    [ 'parent_id' => $parent_id ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'attachment_id' => $attachment_id,
                        'parent_id'     => $parent_id,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
