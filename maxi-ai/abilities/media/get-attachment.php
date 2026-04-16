<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-attachment',
        [
            'label'       => 'Get Attachment',
            'description' => 'Retrieve details of a media attachment by ID.',
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
                $post          = get_post( $attachment_id );

                if ( ! $post || $post->post_type !== 'attachment' ) {
                    return maxi_ai_response( false, [], 'Attachment not found: ' . $attachment_id );
                }

                $metadata = wp_get_attachment_metadata( $attachment_id );
                $sizes    = [];

                if ( ! empty( $metadata['sizes'] ) ) {
                    foreach ( $metadata['sizes'] as $size_name => $size_data ) {
                        $src = wp_get_attachment_image_src( $attachment_id, $size_name );
                        if ( $src ) {
                            $sizes[ $size_name ] = [
                                'url'    => $src[0],
                                'width'  => $src[1],
                                'height' => $src[2],
                            ];
                        }
                    }
                }

                return maxi_ai_response(
                    true,
                    [
                        'attachment_id' => $attachment_id,
                        'title'         => $post->post_title,
                        'caption'       => $post->post_excerpt,
                        'description'   => $post->post_content,
                        'alt_text'      => get_post_meta( $attachment_id, '_wp_attachment_image_alt', true ),
                        'mime_type'     => $post->post_mime_type,
                        'url'           => wp_get_attachment_url( $attachment_id ),
                        'parent_id'     => (int) $post->post_parent,
                        'date'          => $post->post_date,
                        'width'         => (int) ( $metadata['width'] ?? 0 ),
                        'height'        => (int) ( $metadata['height'] ?? 0 ),
                        'file'          => $metadata['file'] ?? '',
                        'sizes'         => $sizes,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'read' );
            },

        ]
    );

} );
