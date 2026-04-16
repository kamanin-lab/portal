<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/edit-image-ai',
        [
            'label'       => 'Edit Image (AI)',
            'description' => 'Edit an existing image using AI. Mask is OPTIONAL for OpenAI (gpt-image-1) and BFL Kontext — just describe the change in the prompt. Mask is REQUIRED for BFL Flux Fill and Replicate flux-fill-pro (precise inpainting). For background removal, use provider "openai" with background="transparent" — produces a real RGBA PNG, no mask needed. The result is sideloaded into the media library as a new attachment.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'prompt' => [
                        'type'        => 'string',
                        'description' => 'Edit instructions (e.g. "remove the logo in the bottom-right", "change the background to a sunset beach").',
                    ],
                    'attachment_id' => [
                        'type'        => 'integer',
                        'description' => 'WordPress attachment ID of the source image. Either attachment_id or image_url is required.',
                    ],
                    'image_url' => [
                        'type'        => 'string',
                        'description' => 'Absolute URL of the source image. Either attachment_id or image_url is required.',
                    ],
                    'mask_attachment_id' => [
                        'type'        => 'integer',
                        'description' => 'Optional. Attachment ID of a PNG mask — transparent areas will be inpainted. Only needed when you want to restrict the edit to a specific region. Omit for whole-image edits (OpenAI gpt-image-1, BFL Kontext). Required only for Replicate flux-fill and BFL Flux Fill.',
                    ],
                    'mask_base64' => [
                        'type'        => 'string',
                        'description' => 'Optional. Base64-encoded PNG mask as alternative to mask_attachment_id.',
                    ],
                    'provider' => [
                        'type'        => 'string',
                        'description' => 'AI provider: "bfl" (default, supports both modes), "openai" (mask required), "replicate" (mask required), "local". Optional.',
                    ],
                    'size' => [
                        'type'        => 'string',
                        'description' => 'Output size (e.g. "1024x1024"). Optional.',
                    ],
                    'seed' => [
                        'type'        => 'integer',
                        'description' => 'Seed for reproducibility. Silently ignored by providers that don\'t support it. Optional.',
                    ],
                    'background' => [
                        'type'        => 'string',
                        'description' => 'Background handling. "transparent" produces a PNG with a real alpha channel — use this for background removal. Only gpt-image-1 (OpenAI provider) supports true transparency; BFL/Replicate will ignore this flag. Values: "transparent", "opaque", "auto". Optional.',
                        'enum'        => [ 'transparent', 'opaque', 'auto' ],
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'Title for the new attachment. Optional.',
                    ],
                    'alt_text' => [
                        'type'        => 'string',
                        'description' => 'Alt text for the new attachment. Optional.',
                    ],
                    'parent_id' => [
                        'type'        => 'integer',
                        'description' => 'Parent post ID to attach the new image to. Optional.',
                    ],
                    'sideload' => [
                        'type'        => 'boolean',
                        'description' => 'Whether to sideload the result into the media library. Default true.',
                    ],
                ],
                'required' => [ 'prompt' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'Maxi_AI_Image_Editor' ) ) {
                    return maxi_ai_response( false, [], 'Maxi AI image editing service is not loaded.' );
                }

                $prompt = sanitize_text_field( $input['prompt'] ?? '' );

                if ( empty( $prompt ) ) {
                    return maxi_ai_response( false, [], 'A prompt is required.' );
                }

                // Resolve source image.
                $attachment_id = isset( $input['attachment_id'] ) ? intval( $input['attachment_id'] ) : 0;
                $image_url     = ! empty( $input['image_url'] ) ? esc_url_raw( $input['image_url'] ) : '';

                if ( ! $attachment_id && empty( $image_url ) ) {
                    return maxi_ai_response( false, [], 'Either attachment_id or image_url is required.' );
                }

                if ( $attachment_id ) {
                    $resolved_url = wp_get_attachment_url( $attachment_id );
                    if ( ! $resolved_url ) {
                        return maxi_ai_response( false, [], 'Attachment not found: ' . $attachment_id );
                    }
                    $image_url = $resolved_url;
                }

                $params = [
                    'prompt' => $prompt,
                    'image'  => $image_url,
                ];

                // Resolve mask.
                $mask_attachment_id = isset( $input['mask_attachment_id'] ) ? intval( $input['mask_attachment_id'] ) : 0;

                if ( $mask_attachment_id ) {
                    $mask_path = get_attached_file( $mask_attachment_id );
                    if ( ! $mask_path || ! file_exists( $mask_path ) ) {
                        return maxi_ai_response( false, [], 'Mask attachment file not found: ' . $mask_attachment_id );
                    }
                    $params['mask'] = $mask_path;
                } elseif ( ! empty( $input['mask_base64'] ) ) {
                    $params['mask'] = (string) $input['mask_base64'];
                }

                if ( ! empty( $input['provider'] ) ) {
                    $params['provider'] = sanitize_key( $input['provider'] );
                }

                if ( ! empty( $input['size'] ) ) {
                    $params['size'] = sanitize_text_field( $input['size'] );
                }

                if ( isset( $input['seed'] ) && $input['seed'] !== '' ) {
                    $params['seed'] = intval( $input['seed'] );
                }

                if ( ! empty( $input['background'] ) ) {
                    $params['background'] = sanitize_key( $input['background'] );
                }

                if ( ! empty( $input['title'] ) ) {
                    $params['title'] = sanitize_text_field( $input['title'] );
                }

                if ( ! empty( $input['alt_text'] ) ) {
                    $params['alt_text'] = sanitize_text_field( $input['alt_text'] );
                }

                if ( isset( $input['parent_id'] ) ) {
                    $params['parent_id'] = intval( $input['parent_id'] );
                }

                if ( isset( $input['sideload'] ) ) {
                    $params['sideload'] = (bool) $input['sideload'];
                }

                $result = Maxi_AI_Image_Editor::edit( $params );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                return maxi_ai_response( true, $result );

            },

            'permission_callback' => function () {
                return current_user_can( 'upload_files' );
            },

        ]
    );

} );
