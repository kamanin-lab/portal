<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Vision analysis service for Maxi AI.
 *
 * Analyzes images via a provider.
 */
class Maxi_AI_Vision_Analyzer {

    /**
     * Analyze an image.
     *
     * @param array $params {
     *     @type string $image_url  URL of the image to analyze.
     *     @type string $prompt     Analysis instructions. Optional.
     *     @type string $provider   Provider name. Optional (uses config default).
     *     @type string $model      Model override. Optional.
     *     @type int    $max_tokens Max tokens. Optional.
     * }
     * @return array|WP_Error Array with 'analysis' key on success.
     */
    public static function analyze( array $params ) {

        $explicit_provider = ! empty( $params['provider'] );
        $provider = self::resolve_provider( $params['provider'] ?? null );

        if ( is_wp_error( $provider ) ) {
            return $provider;
        }

        $result = $provider->analyze_image( $params );

        if ( is_wp_error( $result ) ) {
            // Only try fallback when no provider was explicitly requested.
            if ( ! $explicit_provider ) {
                $fallback = Maxi_AI_Provider_Factory::get_fallback( 'vision' );

                if ( ! is_wp_error( $fallback ) ) {
                    maxi_ai_log(
                        sprintf( 'Primary vision provider failed, trying fallback "%s"', $fallback->get_name() ),
                        'info',
                        [ 'provider' => $provider->get_name() ]
                    );
                    $result = $fallback->analyze_image( $params );
                }
            }

            if ( is_wp_error( $result ) ) {
                return $result;
            }
        }

        return $result;

    }

    /**
     * Resolve a provider instance for vision analysis.
     *
     * @param string|null $provider_name Provider name or null for default.
     * @return Maxi_AI_Provider|WP_Error
     */
    private static function resolve_provider( $provider_name ) {

        if ( $provider_name ) {
            return Maxi_AI_Provider_Factory::create( $provider_name );
        }

        return Maxi_AI_Provider_Factory::get_for_capability( 'vision' );

    }

}
