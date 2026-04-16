<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/delete-attachment',
        [
            'label'       => 'Delete Attachment',
            'description' => 'Permanently delete a media attachment and its files.',
            'category'    => 'media',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'attachment_id' => [
                        'type'        => 'integer',
                        'description' => 'The attachment ID to delete.',
                    ],
                ],
                'required' => [ 'attachment_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $attachment_id = intval( $input['attachment_id'] ?? 0 );
                $post          = get_post( $attachment_id );

                if ( ! $post || $post->post_type !== 'attachment' ) {
                    return maxi_ai_response( false, [], 'Attachment not found: ' . $attachment_id );
                }

                if ( ! current_user_can( 'delete_post', $attachment_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to delete this attachment.' );
                }

                $result = wp_delete_attachment( $attachment_id, true );

                if ( ! $result ) {
                    return maxi_ai_response( false, [], 'Failed to delete attachment: ' . $attachment_id );
                }

                Maxi_AI_Audit_Log::record(
                    'media',
                    'attachment_deleted',
                    get_current_user_id(),
                    'attachment:' . $attachment_id,
                    [ 'mime_type' => $post->post_mime_type ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'attachment_id' => $attachment_id,
                        'deleted'       => true,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'delete_posts' );
            },

        ]
    );

} );
