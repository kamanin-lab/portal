<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/upload-attachment',
        [
            'label'       => 'Upload Attachment',
            'description' => 'Upload a file to the WordPress media library from a URL or from a base64-encoded payload. Provide either "url" or both "filename" and "content_base64".',
            'category'    => 'media',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'media_basic',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'url' => [
                        'type'        => 'string',
                        'description' => 'The URL of the file to upload. Use this OR content_base64, not both.',
                    ],
                    'filename' => [
                        'type'        => 'string',
                        'description' => 'Original filename including extension (e.g. "photo.jpg"). Required when using content_base64.',
                    ],
                    'content_base64' => [
                        'type'        => 'string',
                        'description' => 'The file contents encoded as a base64 string. Use this OR url, not both.',
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'Attachment title. Defaults to filename.',
                    ],
                    'alt_text' => [
                        'type'        => 'string',
                        'description' => 'Alt text for images.',
                    ],
                    'caption' => [
                        'type'        => 'string',
                        'description' => 'Attachment caption.',
                    ],
                    'parent_id' => [
                        'type'        => 'integer',
                        'description' => 'Parent post ID to attach to. Default 0 (unattached).',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                $url            = $input['url'] ?? '';
                $content_base64 = $input['content_base64'] ?? '';
                $filename       = $input['filename'] ?? '';

                $has_url    = ! empty( $url );
                $has_base64 = ! empty( $content_base64 );

                // Exactly one source is required.
                if ( ! $has_url && ! $has_base64 ) {
                    return maxi_ai_response( false, [], 'Provide either "url" or "content_base64" (with "filename").' );
                }

                if ( $has_url && $has_base64 ) {
                    return maxi_ai_response( false, [], 'Provide either "url" or "content_base64", not both.' );
                }

                if ( $has_base64 && empty( $filename ) ) {
                    return maxi_ai_response( false, [], 'The "filename" parameter is required when using "content_base64".' );
                }

                require_once ABSPATH . 'wp-admin/includes/file.php';
                require_once ABSPATH . 'wp-admin/includes/media.php';
                require_once ABSPATH . 'wp-admin/includes/image.php';

                // --- Build the file array for media_handle_sideload. ---

                if ( $has_url ) {

                    $url = esc_url_raw( $url );

                    if ( empty( $url ) ) {
                        return maxi_ai_response( false, [], 'Invalid URL.' );
                    }

                    $tmp = download_url( $url );

                    if ( is_wp_error( $tmp ) ) {
                        return maxi_ai_response( false, [], $tmp->get_error_message() );
                    }

                    $safe_name = sanitize_file_name( basename( wp_parse_url( $url, PHP_URL_PATH ) ) );

                    $file_array = [
                        'name'     => $safe_name,
                        'tmp_name' => $tmp,
                    ];

                } else {

                    // Base64 path.
                    $decoded = base64_decode( $content_base64, true );

                    if ( $decoded === false ) {
                        return maxi_ai_response( false, [], 'Invalid base64 data.' );
                    }

                    $safe_name = sanitize_file_name( $filename );

                    // Validate file extension against WordPress allowed types.
                    $check = wp_check_filetype( $safe_name );

                    if ( empty( $check['type'] ) ) {
                        return maxi_ai_response(
                            false,
                            [],
                            'File type not allowed. WordPress does not permit this extension.'
                        );
                    }

                    // Write decoded content to a temp file.
                    $tmp = wp_tempnam( $safe_name );

                    if ( ! $tmp ) {
                        return maxi_ai_response( false, [], 'Could not create temporary file.' );
                    }

                    // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
                    $bytes = file_put_contents( $tmp, $decoded );

                    if ( $bytes === false ) {
                        @unlink( $tmp );
                        return maxi_ai_response( false, [], 'Failed to write temporary file.' );
                    }

                    $file_array = [
                        'name'     => $safe_name,
                        'tmp_name' => $tmp,
                    ];

                }

                // --- Sideload into the media library. ---

                $parent_id     = intval( $input['parent_id'] ?? 0 );
                $attachment_id = media_handle_sideload( $file_array, $parent_id );

                if ( is_wp_error( $attachment_id ) ) {
                    @unlink( $tmp );
                    return maxi_ai_response( false, [], $attachment_id->get_error_message() );
                }

                // --- Set optional metadata. ---

                if ( ! empty( $input['title'] ) ) {
                    wp_update_post( [
                        'ID'         => $attachment_id,
                        'post_title' => sanitize_text_field( $input['title'] ),
                    ] );
                }

                if ( ! empty( $input['caption'] ) ) {
                    wp_update_post( [
                        'ID'           => $attachment_id,
                        'post_excerpt' => sanitize_text_field( $input['caption'] ),
                    ] );
                }

                if ( ! empty( $input['alt_text'] ) ) {
                    update_post_meta( $attachment_id, '_wp_attachment_image_alt', sanitize_text_field( $input['alt_text'] ) );
                }

                Maxi_AI_Audit_Log::record(
                    'media',
                    'attachment_uploaded',
                    get_current_user_id(),
                    'attachment:' . $attachment_id,
                    [
                        'mime_type' => get_post_mime_type( $attachment_id ),
                        'source'    => $has_url ? 'url' : 'base64',
                        'parent_id' => $parent_id,
                    ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'attachment_id' => $attachment_id,
                        'url'           => wp_get_attachment_url( $attachment_id ),
                        'type'          => get_post_mime_type( $attachment_id ),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'upload_files' );
            },

        ]
    );

} );
