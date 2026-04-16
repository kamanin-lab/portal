<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Provider registry and factory for Maxi AI.
 *
 * Manages provider registration, instantiation, and fallback resolution.
 */
class Maxi_AI_Provider_Factory {

    /**
     * Registered provider classes keyed by name.
     *
     * @var array<string, string>
     */
    private static $providers = [];

    /**
     * Cached provider instances.
     *
     * @var array<string, Maxi_AI_Provider>
     */
    private static $instances = [];

    /**
     * Register a provider class.
     *
     * @param string $name  Provider identifier (e.g. 'openai', 'replicate', 'bfl', 'local').
     * @param string $class Fully qualified class name implementing Maxi_AI_Provider.
     */
    public static function register( $name, $class ) {

        self::$providers[ sanitize_key( $name ) ] = $class;

    }

    /**
     * Create or retrieve a provider instance.
     *
     * @param string $name Provider identifier.
     * @return Maxi_AI_Provider|WP_Error
     */
    public static function create( $name ) {

        $name = sanitize_key( $name );

        if ( isset( self::$instances[ $name ] ) ) {
            return self::$instances[ $name ];
        }

        if ( ! isset( self::$providers[ $name ] ) ) {
            return new WP_Error( 'unknown_provider', 'Unknown AI provider: ' . $name );
        }

        $class = self::$providers[ $name ];

        if ( ! class_exists( $class ) ) {
            return new WP_Error( 'provider_class_missing', 'Provider class not found: ' . $class );
        }

        $instance = new $class();

        if ( ! ( $instance instanceof Maxi_AI_Provider ) ) {
            return new WP_Error( 'invalid_provider', $class . ' does not implement Maxi_AI_Provider.' );
        }

        self::$instances[ $name ] = $instance;

        return $instance;

    }

    /**
     * Get the default provider for a capability, with fallback.
     *
     * Tries the configured default provider first. If it doesn't support the capability
     * or fails to instantiate, walks the fallback list.
     *
     * @param string $capability 'image', 'text', or 'vision'.
     * @return Maxi_AI_Provider|WP_Error
     */
    public static function get_for_capability( $capability ) {

        $default = Maxi_AI_Config::get_provider_for( $capability );
        $provider = self::create( $default );

        if ( ! is_wp_error( $provider ) && $provider->supports( $capability ) ) {
            return $provider;
        }

        return self::get_fallback( $capability );

    }

    /**
     * Get the next available fallback provider for a capability.
     *
     * @param string $capability 'image', 'text', or 'vision'.
     * @return Maxi_AI_Provider|WP_Error
     */
    public static function get_fallback( $capability ) {

        $fallback_order = Maxi_AI_Config::get_fallback_order( $capability );
        $default        = Maxi_AI_Config::get_provider_for( $capability );

        foreach ( $fallback_order as $name ) {

            // Skip the default — already tried.
            if ( $name === $default ) {
                continue;
            }

            $provider = self::create( $name );

            if ( ! is_wp_error( $provider ) && $provider->supports( $capability ) ) {
                maxi_ai_log(
                    sprintf( 'Using fallback provider "%s" for capability "%s"', $name, $capability ),
                    'info',
                    [ 'capability' => $capability ]
                );
                return $provider;
            }

        }

        return new WP_Error(
            'no_provider',
            sprintf( 'No provider available for capability: %s', $capability )
        );

    }

    /**
     * Get all registered provider names.
     *
     * @return array
     */
    public static function get_available() {

        return array_keys( self::$providers );

    }

    /**
     * Clear cached instances (useful for testing).
     */
    public static function flush() {

        self::$instances = [];

    }

}
