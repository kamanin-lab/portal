<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Image generation service for Maxi AI.
 *
 * Generates images via a provider, then optionally sideloads into the WordPress media library.
 */
class Maxi_AI_Image_Generator {

    /**
     * Generate an image and optionally sideload it into the media library.
     *
     * @param array $params {
     *     @type string $prompt     The image prompt.
     *     @type string $provider   Provider name. Optional (uses config default).
     *     @type string $size       Image size. Optional.
     *     @type string $style      Image style. Optional.
     *     @type bool   $sideload   Whether to sideload into media library. Default true.
     *     @type string $title      Attachment title. Optional.
     *     @type string $alt_text   Alt text. Optional.
     *     @type int    $parent_id  Parent post ID. Optional.
     * }
     * @return array|WP_Error Array with 'url' (and 'attachment_id' if sideloaded).
     */
    public static function generate( array $params ) {

        $explicit_provider = ! empty( $params['provider'] );
        $provider = self::resolve_provider( $params['provider'] ?? null );

        if ( is_wp_error( $provider ) ) {
            return $provider;
        }

        $result = $provider->generate_image( $params );

        if ( is_wp_error( $result ) ) {
            // Only try fallback when no provider was explicitly requested.
            if ( ! $explicit_provider ) {
                $fallback = Maxi_AI_Provider_Factory::get_fallback( 'image' );

                if ( ! is_wp_error( $fallback ) ) {
                    maxi_ai_log(
                        sprintf( 'Primary provider failed, trying fallback "%s"', $fallback->get_name() ),
                        'info',
                        [ 'provider' => $provider->get_name() ]
                    );
                    $result = $fallback->generate_image( $params );
                }
            }

            if ( is_wp_error( $result ) ) {
                return $result;
            }
        }

        $url = $result['url'] ?? '';

        if ( empty( $url ) ) {
            return new WP_Error( 'no_image_url', 'Provider did not return an image URL.' );
        }

        $data = [ 'url' => $url ];

        if ( ! empty( $result['revised_prompt'] ) ) {
            $data['revised_prompt'] = $result['revised_prompt'];
        }

        // Sideload into media library.
        $sideload = $params['sideload'] ?? true;

        if ( $sideload ) {
            $attachment_id = self::sideload_image( $url, $params );

            if ( is_wp_error( $attachment_id ) ) {
                $data['sideload_error'] = $attachment_id->get_error_message();
            } else {
                $data['attachment_id']  = $attachment_id;
                $data['attachment_url'] = wp_get_attachment_url( $attachment_id );
            }
        }

        // Clean up local temp file if the provider returned one (e.g. gpt-image-1 b64_json).
        if ( ! empty( $result['is_local_file'] ) && file_exists( $url ) ) {
            @unlink( $url );
            if ( ! empty( $data['attachment_url'] ) ) {
                $data['url'] = $data['attachment_url'];
            }
        }

        return $data;

    }

    /**
     * Sideload an image from a URL (or a local temp file) into the WordPress media library.
     *
     * @param string $url    Image URL or absolute local file path.
     * @param array  $params Additional params (title, alt_text, parent_id).
     * @return int|WP_Error Attachment ID on success.
     */
    public static function sideload_image( $url, $params = [] ) {

        require_once ABSPATH . 'wp-admin/includes/media.php';
        require_once ABSPATH . 'wp-admin/includes/file.php';
        require_once ABSPATH . 'wp-admin/includes/image.php';

        // If $url is a local file path (e.g. temp file from OpenAI b64_json), use it directly.
        if ( ! preg_match( '#^https?://#i', $url ) && file_exists( $url ) ) {
            $tmp = $url;
        } else {
            $tmp = download_url( $url, 120 );
        }

        if ( is_wp_error( $tmp ) ) {
            return $tmp;
        }

        $title    = $params['title'] ?? 'AI Generated Image';
        $filename = sanitize_file_name( sanitize_title( $title ) . '.png' );

        $file_array = [
            'name'     => $filename,
            'tmp_name' => $tmp,
        ];

        $parent_id = intval( $params['parent_id'] ?? 0 );

        $attachment_id = media_handle_sideload( $file_array, $parent_id, $title );

        if ( is_wp_error( $attachment_id ) ) {
            @unlink( $tmp );
            return $attachment_id;
        }

        // Set alt text if provided.
        if ( ! empty( $params['alt_text'] ) ) {
            update_post_meta( $attachment_id, '_wp_attachment_image_alt', sanitize_text_field( $params['alt_text'] ) );
        }

        return $attachment_id;

    }

    /**
     * Resolve a provider instance for image generation.
     *
     * @param string|null $provider_name Provider name or null for default.
     * @return Maxi_AI_Provider|WP_Error
     */
    private static function resolve_provider( $provider_name ) {

        if ( $provider_name ) {
            return Maxi_AI_Provider_Factory::create( $provider_name );
        }

        return Maxi_AI_Provider_Factory::get_for_capability( 'image' );

    }

}
