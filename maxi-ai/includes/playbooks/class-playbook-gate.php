<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Playbook gate for Maxi AI abilities.
 *
 * Hooks wp_abilities_api_init at priority 9999 (WRAPS AFTER the license
 * gate at 9998 and rule gate at 9997, so runtime execution order is:
 * playbook check → license check → rule check → original callback).
 *
 * For every public maxi/* ability EXCEPT the allow-list, the
 * execute_callback is wrapped so that:
 *
 *   1. If no MCP session ID is present (direct PHP/WP-CLI/cron), pass through.
 *   2. Self-heal: ensure playbook table and required rows exist.
 *   3. If all required playbooks are acknowledged at current version
 *      AND operator-note state is fresh → pass through.
 *   4. Otherwise refuse with `playbook_not_acknowledged`.
 *
 * Fail-closed: the only pass-through without acknowledgment is step 1
 * (no MCP session = not an agent). Every other failure path self-heals
 * then re-checks; if self-heal fails, the gate blocks.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Playbook_Gate {

    private const NAMESPACE_PREFIX = 'maxi/';

    /**
     * Ability IDs that bypass the playbook gate.
     *
     * bootstrap-session: the handshake itself.
     * get-playbook: on-demand reference (no gate needed).
     * get-ability-rule: rule handshake (needed after bootstrap).
     * rules-sync: rule installation.
     * manage-ability-rules: operator-only rule management.
     * manage-playbooks: operator-only playbook management.
     */
    private const ALLOWLIST = [
        'maxi/bootstrap-session',
        'maxi/get-playbook',
        'maxi/get-ability-rule',
        'maxi/rules-sync',
        'maxi/playbooks-sync',
        'maxi/manage-ability-rules',
        'maxi/manage-playbooks',
    ];

    public static function init(): void {

        add_action( 'wp_abilities_api_init', [ self::class, 'apply' ], 9999 );

    }

    public static function apply(): void {

        if ( ! function_exists( 'wp_get_abilities' ) ) {
            return;
        }

        foreach ( wp_get_abilities() as $ability ) {

            if ( ! $ability instanceof WP_Ability ) {
                continue;
            }

            $name = $ability->get_name();

            if ( strpos( $name, self::NAMESPACE_PREFIX ) !== 0 ) {
                continue;
            }

            if ( in_array( $name, self::ALLOWLIST, true ) ) {
                continue;
            }

            self::wrap_callback( $ability, $name );
        }

    }

    /**
     * Replace the protected execute_callback property via Reflection.
     *
     * Mirrors Maxi_AI_Rule_Gate::wrap_callback().
     */
    private static function wrap_callback( WP_Ability $ability, string $ability_id ): void {

        try {
            $ref  = new ReflectionClass( $ability );
            $prop = $ref->getProperty( 'execute_callback' );
            $prop->setAccessible( true );

            $original_callback = $prop->getValue( $ability );

            $gated_callback = function ( $input ) use ( $original_callback, $ability_id ) {
                return self::gated_execute( $original_callback, $input, $ability_id );
            };

            $prop->setValue( $ability, $gated_callback );

        } catch ( ReflectionException $e ) {
            maxi_ai_log(
                'Playbook gate Reflection failed for ' . $ability_id . ': ' . $e->getMessage(),
                'warning',
                [ 'component' => 'playbooks' ]
            );
        }

    }

    /**
     * Apply the playbook check, then delegate to the original callback.
     *
     * @param callable $original_callback The original execute_callback.
     * @param mixed    $input             The ability input.
     * @param string   $ability_id        The ability ID.
     * @return mixed
     */
    private static function gated_execute( callable $original_callback, $input, string $ability_id ) {

        $session_id = Maxi_AI_Rule_Session::get_session_id();

        if ( null === $session_id ) {

            // CLI / cron / unit tests = trust the caller.
            if ( ! maxi_ai_is_http_context() ) {
                return call_user_func( $original_callback, $input );
            }

            // HTTP request with no MCP session = fail closed. Either the
            // request legitimately lacks the header (non-MCP REST caller
            // hitting a maxi ability), or the header is routed somewhere
            // we don't read. Either way, refuse.
            static $logged = false;

            if ( ! $logged ) {
                $logged = true;

                $http_keys = array_filter(
                    array_keys( $_SERVER ),
                    static function ( $k ) {
                        return is_string( $k ) && strpos( $k, 'HTTP_' ) === 0;
                    }
                );

                maxi_ai_log(
                    'playbook gate: HTTP request without MCP session. HTTP_* keys: ' . implode( ',', $http_keys ),
                    'warning',
                    [ 'component' => 'playbooks' ]
                );
            }

            return maxi_ai_response(
                false,
                [
                    'code'       => 'mcp_session_missing',
                    'ability_id' => $ability_id,
                    'handshake'  => 'maxi/bootstrap-session',
                ],
                'No MCP session detected. Call maxi/bootstrap-session first; if the problem persists, the server may be misrouting the Mcp-Session-Id header.'
            );
        }

        // Self-heal: ensure table exists.
        if ( ! self::table_exists() ) {
            Maxi_AI_Playbook_Schema::create_or_upgrade();

            if ( ! self::table_exists() ) {
                return maxi_ai_response(
                    false,
                    [
                        'code'       => 'playbook_system_unavailable',
                        'ability_id' => $ability_id,
                    ],
                    'Playbook system unavailable — table creation failed. Contact the site administrator.'
                );
            }
        }

        // Self-heal: ensure required playbooks exist.
        $required = Maxi_AI_Playbook_Store::get_required_versions();

        if ( empty( $required ) ) {
            Maxi_AI_Playbook_Store::seed_defaults();
            $required = Maxi_AI_Playbook_Store::get_required_versions();

            if ( empty( $required ) ) {
                return maxi_ai_response(
                    false,
                    [
                        'code'       => 'playbook_system_unavailable',
                        'ability_id' => $ability_id,
                    ],
                    'Playbook system unavailable — no required playbooks found after seeding. Contact the site administrator.'
                );
            }
        }

        // Check session acknowledgment.
        $status = Maxi_AI_Playbook_Session::are_all_required_acknowledged();

        if ( true === $status ) {
            return call_user_func( $original_callback, $input );
        }

        // Build a helpful error message.
        $missing = $status['missing'] ?? [];
        $stale   = $status['stale'] ?? [];
        $slugs   = array_merge( $missing, $stale );

        return maxi_ai_response(
            false,
            [
                'code'      => 'playbook_not_acknowledged',
                'ability_id' => $ability_id,
                'missing'   => $missing,
                'stale'     => $stale,
                'handshake' => 'maxi/bootstrap-session',
            ],
            'Session playbook not acknowledged. Call maxi/bootstrap-session first, then retry. '
                . 'Unacknowledged: ' . implode( ', ', $slugs ) . '.'
        );

    }

    /**
     * Check whether the playbooks table exists in the database.
     */
    private static function table_exists(): bool {

        global $wpdb;

        $table = Maxi_AI_Playbook_Schema::table_name();

        return $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) === $table;

    }

}

Maxi_AI_Playbook_Gate::init();
