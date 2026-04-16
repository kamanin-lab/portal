<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Image editing service for Maxi AI.
 *
 * Edits images via a provider (instruction-based or mask-based inpainting),
 * then optionally sideloads the result into the WordPress media library.
 */
class Maxi_AI_Image_Editor {

    /**
     * Edit an image and optionally sideload the result into the media library.
     *
     * @param array $params {
     *     @type string $prompt     Edit instructions. Required.
     *     @type string $image      Source image URL or data URI or file path. Required.
     *     @type string $mask       Base64 PNG mask. Optional (required for OpenAI / Replicate flux-fill).
     *     @type string $provider   Provider name. Optional.
     *     @type string $size       Output size. Optional.
     *     @type int    $seed       Seed for reproducibility. Optional.
     *     @type bool   $sideload   Whether to sideload into media library. Default true.
     *     @type string $title      Attachment title. Optional.
     *     @type string $alt_text   Alt text. Optional.
     *     @type int    $parent_id  Parent post ID. Optional.
     * }
     * @return array|WP_Error Array with 'url' (and 'attachment_id' if sideloaded).
     */
    public static function edit( array $params ) {

        $provider = self::resolve_provider( $params['provider'] ?? null );

        if ( is_wp_error( $provider ) ) {
            return $provider;
        }

        $result = $provider->edit_image( $params );

        if ( is_wp_error( $result ) ) {
            return $result;
        }

        $url = $result['url'] ?? '';

        if ( empty( $url ) ) {
            return new WP_Error( 'no_image_url', 'Provider did not return an image URL.' );
        }

        $data = [ 'url' => $url ];

        $sideload = $params['sideload'] ?? true;

        if ( $sideload ) {
            $title = $params['title'] ?? 'AI Edited Image';
            $attachment_id = Maxi_AI_Image_Generator::sideload_image(
                $url,
                array_merge( $params, [ 'title' => $title ] )
            );

            if ( is_wp_error( $attachment_id ) ) {
                $data['sideload_error'] = $attachment_id->get_error_message();
            } else {
                $data['attachment_id']  = $attachment_id;
                $data['attachment_url'] = wp_get_attachment_url( $attachment_id );
            }
        }

        // Clean up local temp file if the provider returned one (e.g. OpenAI b64_json).
        if ( ! empty( $result['is_local_file'] ) && file_exists( $url ) ) {
            @unlink( $url );
            // Replace url in response with attachment URL if we have one.
            if ( ! empty( $data['attachment_url'] ) ) {
                $data['url'] = $data['attachment_url'];
            }
        }

        return $data;

    }

    /**
     * Resolve a provider instance for image editing.
     *
     * @param string|null $provider_name Provider name or null for default.
     * @return Maxi_AI_Provider|WP_Error
     */
    private static function resolve_provider( $provider_name ) {

        if ( $provider_name ) {
            return Maxi_AI_Provider_Factory::create( $provider_name );
        }

        return Maxi_AI_Provider_Factory::get_for_capability( 'edit_image' );

    }

}
