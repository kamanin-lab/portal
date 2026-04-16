<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/set-featured-image',
        [
            'label'       => 'Set Featured Image',
            'description' => 'Set or remove the featured image (thumbnail) of a post.',
            'category'    => 'media',

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
                    'attachment_id' => [
                        'type'        => 'integer',
                        'description' => 'The attachment ID to set as featured image. Use 0 to remove.',
                    ],
                ],
                'required' => [ 'post_id', 'attachment_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_id       = intval( $input['post_id'] ?? 0 );
                $attachment_id = intval( $input['attachment_id'] ?? 0 );

                if ( ! get_post( $post_id ) ) {
                    return maxi_ai_response( false, [], 'Post not found: ' . $post_id );
                }

                if ( ! current_user_can( 'edit_post', $post_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to edit this post.' );
                }

                if ( $attachment_id === 0 ) {
                    $old_thumbnail = (int) get_post_thumbnail_id( $post_id );
                    $result = delete_post_thumbnail( $post_id );

                    Maxi_AI_Audit_Log::record(
                        'media',
                        'featured_image_removed',
                        get_current_user_id(),
                        'post:' . $post_id,
                        [ 'previous_attachment_id' => $old_thumbnail ]
                    );

                    return maxi_ai_response(
                        true,
                        [
                            'post_id' => $post_id,
                            'action'  => 'removed',
                        ]
                    );
                }

                $attachment = get_post( $attachment_id );

                if ( ! $attachment || $attachment->post_type !== 'attachment' ) {
                    return maxi_ai_response( false, [], 'Attachment not found: ' . $attachment_id );
                }

                $result = set_post_thumbnail( $post_id, $attachment_id );

                if ( ! $result ) {
                    return maxi_ai_response( false, [], 'Failed to set featured image.' );
                }

                Maxi_AI_Audit_Log::record(
                    'media',
                    'featured_image_set',
                    get_current_user_id(),
                    'post:' . $post_id,
                    [ 'attachment_id' => $attachment_id ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id'       => $post_id,
                        'attachment_id' => $attachment_id,
                        'url'           => wp_get_attachment_url( $attachment_id ),
                        'action'        => 'set',
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
