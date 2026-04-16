<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Text generation service for Maxi AI.
 *
 * Generates text content via a provider.
 */
class Maxi_AI_Text_Generator {

    /**
     * Generate text from a prompt.
     *
     * @param array $params {
     *     @type string $prompt      The text prompt.
     *     @type string $system      System message. Optional.
     *     @type string $provider    Provider name. Optional (uses config default).
     *     @type int    $max_tokens  Max tokens. Optional.
     *     @type float  $temperature Temperature. Optional.
     *     @type string $model       Model override. Optional.
     * }
     * @return array|WP_Error Array with 'content' key on success.
     */
    public static function generate( array $params ) {

        $explicit_provider = ! empty( $params['provider'] );
        $provider = self::resolve_provider( $params['provider'] ?? null );

        if ( is_wp_error( $provider ) ) {
            return $provider;
        }

        $result = $provider->generate_text( $params );

        if ( is_wp_error( $result ) ) {
            // Only try fallback when no provider was explicitly requested.
            if ( ! $explicit_provider ) {
                $fallback = Maxi_AI_Provider_Factory::get_fallback( 'text' );

                if ( ! is_wp_error( $fallback ) ) {
                    maxi_ai_log(
                        sprintf( 'Primary text provider failed, trying fallback "%s"', $fallback->get_name() ),
                        'info',
                        [ 'provider' => $provider->get_name() ]
                    );
                    $result = $fallback->generate_text( $params );
                }
            }

            if ( is_wp_error( $result ) ) {
                return $result;
            }
        }

        return $result;

    }

    /**
     * Resolve a provider instance for text generation.
     *
     * @param string|null $provider_name Provider name or null for default.
     * @return Maxi_AI_Provider|WP_Error
     */
    private static function resolve_provider( $provider_name ) {

        if ( $provider_name ) {
            return Maxi_AI_Provider_Factory::create( $provider_name );
        }

        return Maxi_AI_Provider_Factory::get_for_capability( 'text' );

    }

}
