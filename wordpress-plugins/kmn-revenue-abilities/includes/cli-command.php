<?php
/**
 * WP-CLI integration: `wp kmn ability <subcommand>`.
 *
 * Developer feedback loop for Plan 16-02: invoke an ability's
 * execute_callback directly (no HTTP, no MCP JSON-RPC) to iterate on SQL
 * and business logic. Not loaded at all outside a WP-CLI context.
 *
 * @package KMN_Revenue_Abilities
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

// Only register the command when running under WP-CLI.
if ( ! ( defined( 'WP_CLI' ) && WP_CLI ) ) {
    return;
}

/**
 * Implements `wp kmn ability ...`.
 */
final class KMN_Revenue_CLI {

    /**
     * Dispatch subcommands: `list`, `test`.
     *
     * ## EXAMPLES
     *
     *     wp kmn ability list
     *     wp kmn ability test kmn/weekly-heatmap --input='{"weeks":8}'
     *
     * @param array $args       Positional args: [0] subcommand, [1] ability id.
     * @param array $assoc_args Flags: --input=JSON.
     * @return void
     */
    public static function ability( array $args, array $assoc_args ) {

        $subcommand = $args[0] ?? '';

        switch ( $subcommand ) {
            case 'list':
                self::cmd_list();
                break;

            case 'test':
                self::cmd_test( $args, $assoc_args );
                break;

            default:
                WP_CLI::error( 'Usage: wp kmn ability <list|test> [id] [--input=JSON]' );
        }

    }

    /**
     * List every registered `kmn/*` ability. Emits a sentinel line when
     * none are registered so the caller sees a clear "scaffolded, empty"
     * signal rather than silence.
     */
    private static function cmd_list(): void {

        if ( ! function_exists( 'wp_get_abilities' ) ) {
            WP_CLI::error( 'wp_get_abilities() not available — WP 6.9+ Abilities API required.' );
        }

        $found = 0;

        foreach ( wp_get_abilities() as $ability ) {

            // Ability objects expose get_id(); defensive fallback for
            // future API shape changes.
            $id = method_exists( $ability, 'get_id' ) ? $ability->get_id() : ( is_string( $ability ) ? $ability : '' );

            if ( is_string( $id ) && str_starts_with( $id, 'kmn/' ) ) {
                WP_CLI::log( $id );
                $found++;
            }

        }

        if ( 0 === $found ) {
            WP_CLI::log( 'no abilities registered yet' );
        }

    }

    /**
     * Invoke a single ability's execute_callback with caller-supplied
     * input. Output is dumped via print_r so developers see the full
     * shape including nested meta and any error key.
     *
     * @param array $args       Positional. [1] must be the ability id.
     * @param array $assoc_args Flags. --input accepts a JSON blob.
     */
    private static function cmd_test( array $args, array $assoc_args ): void {

        $id = $args[1] ?? '';

        if ( '' === $id ) {
            WP_CLI::error( 'Ability id required. Example: wp kmn ability test kmn/weekly-heatmap' );
        }

        // Accept both "kmn/foo" and "foo" — normalise to the prefixed form.
        if ( ! str_starts_with( $id, 'kmn/' ) ) {
            $id = 'kmn/' . ltrim( $id, '/' );
        }

        if ( ! function_exists( 'wp_get_ability' ) ) {
            WP_CLI::error( 'wp_get_ability() not available — WP 6.9+ Abilities API required.' );
        }

        $ability = wp_get_ability( $id );

        if ( ! $ability ) {
            WP_CLI::error( sprintf( 'Ability "%s" not registered.', $id ) );
        }

        $input_raw = $assoc_args['input'] ?? '{}';
        $input     = json_decode( $input_raw, true );

        if ( ! is_array( $input ) ) {
            WP_CLI::error( sprintf( '--input must be a JSON object; got: %s', $input_raw ) );
        }

        // Preferred: use the Abilities API's execute() wrapper so input
        // schema validation runs. Fall back to get_callback('execute')
        // for older shapes.
        if ( method_exists( $ability, 'execute' ) ) {
            $result = $ability->execute( $input );
        } elseif ( method_exists( $ability, 'get_callback' ) ) {
            $callback = $ability->get_callback( 'execute' );
            if ( ! is_callable( $callback ) ) {
                WP_CLI::error( 'Ability exposes no execute callback.' );
            }
            $result = call_user_func( $callback, $input );
        } else {
            WP_CLI::error( 'Ability object has no execute() or get_callback() method.' );
        }

        WP_CLI::log( print_r( $result, true ) );

    }

}

WP_CLI::add_command( 'kmn ability', [ 'KMN_Revenue_CLI', 'ability' ] );
