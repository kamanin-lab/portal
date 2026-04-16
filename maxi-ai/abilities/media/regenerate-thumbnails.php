<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/regenerate-thumbnails',
        [
            'label'       => 'Regenerate Thumbnails',
            'description' => 'Regenerate all image sizes for a given attachment.',
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
                        'description' => 'The attachment ID.',
                    ],
                ],
                'required' => [ 'attachment_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $attachment_id = intval( $input['attachment_id'] ?? 0 );
                $attachment    = get_post( $attachment_id );

                if ( ! $attachment || $attachment->post_type !== 'attachment' ) {
                    return maxi_ai_response( false, [], 'Attachment not found: ' . $attachment_id );
                }

                if ( ! wp_attachment_is_image( $attachment_id ) ) {
                    return maxi_ai_response( false, [], 'Attachment is not an image: ' . $attachment_id );
                }

                require_once ABSPATH . 'wp-admin/includes/image.php';

                $file     = get_attached_file( $attachment_id );
                $metadata = wp_generate_attachment_metadata( $attachment_id, $file );

                if ( is_wp_error( $metadata ) ) {
                    return maxi_ai_response( false, [], $metadata->get_error_message() );
                }

                if ( empty( $metadata ) ) {
                    return maxi_ai_response( false, [], 'Failed to generate metadata.' );
                }

                wp_update_attachment_metadata( $attachment_id, $metadata );

                $sizes = array_keys( $metadata['sizes'] ?? [] );

                Maxi_AI_Audit_Log::record(
                    'media',
                    'thumbnails_regenerated',
                    get_current_user_id(),
                    'attachment:' . $attachment_id,
                    [ 'sizes' => $sizes ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'attachment_id' => $attachment_id,
                        'sizes'         => $sizes,
                        'count'         => count( $sizes ),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'upload_files' );
            },

        ]
    );

} );
