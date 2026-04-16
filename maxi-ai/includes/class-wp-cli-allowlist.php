<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * WP-CLI command allowlist for Maxi AI.
 *
 * Replaces the previous substring blacklist in `run-wp-cli` with a structured
 * prefix allowlist:
 *
 *   NEVER      - hard-banned commands. Cannot be enabled by any constant.
 *   READ_ONLY  - always allowed, no configuration needed.
 *   GROUPS     - opt-in write groups, enabled individually via wp-config.php
 *                constants (e.g. MAXI_AI_WP_CLI_ALLOW_CACHE_WRITES).
 *
 * Matching is prefix-based on the first 1–3 lowercased tokens of the command,
 * after whitespace normalization, so arguments after the prefix cannot collide
 * with an allowed prefix.
 */
class Maxi_AI_WP_CLI_Allowlist {

    /**
     * Hard-banned commands. These are rejected even with MAXI_AI_WP_CLI_UNSAFE.
     */
    const NEVER = [
        'db drop', 'db reset', 'db import',
        'site delete', 'site empty',
        'core update', 'core download', 'core install', 'core multisite-install',
        'user delete',
        'eval', 'eval-file',
        'shell',
        'config create', 'config set', 'config delete',
    ];

    /**
     * Always-allowed read-only commands.
     */
    const READ_ONLY = [
        'option get', 'option list', 'option pluck',
        'post list', 'post get', 'post meta get', 'post meta list',
        'term list', 'term get', 'term meta get', 'term meta list',
        'user list', 'user get', 'user meta get', 'user meta list',
        'plugin list', 'plugin get', 'plugin is-active', 'plugin is-installed', 'plugin path', 'plugin status',
        'theme list', 'theme get', 'theme is-active', 'theme is-installed', 'theme path', 'theme status',
        'core version', 'core check-update', 'core is-installed',
        'rewrite list',
        'cron event list', 'cron schedule list',
        'transient get',
        'cache type',
        'db size', 'db tables', 'db columns', 'db prefix',
        'cli version', 'cli info', 'cli alias list',
        'menu list', 'menu item list', 'menu location list',
        'sidebar list', 'widget list',
        'role list', 'cap list',
        'language core list', 'language plugin list', 'language theme list',
        // WooCommerce CLI (read-only diagnostics).
        'wc tool list', 'wc tool run',
        'wc log list', 'wc log read',
        // ACF CLI (read-only).
        'acf json status', 'acf json export',
    ];

    /**
     * Opt-in write groups. Each group is a constant name → list of prefixes.
     */
    const GROUPS = [
        'MAXI_AI_WP_CLI_ALLOW_CACHE_WRITES' => [
            'cache flush', 'cache delete', 'cache decr', 'cache incr',
            'transient delete', 'transient set',
            'rewrite flush',
            'cron event run', 'cron event schedule', 'cron event delete',
        ],
        'MAXI_AI_WP_CLI_ALLOW_CONTENT_WRITES' => [
            'post create', 'post update', 'post delete', 'post trash', 'post untrash',
            'post meta add', 'post meta update', 'post meta delete',
            'term create', 'term update', 'term delete',
            'term meta add', 'term meta update', 'term meta delete',
            'menu create', 'menu delete', 'menu item add-post', 'menu item add-term', 'menu item update', 'menu item delete',
            'menu location assign', 'menu location remove',
            'widget add', 'widget update', 'widget delete', 'widget move', 'widget deactivate', 'widget reset',
        ],
        'MAXI_AI_WP_CLI_ALLOW_USER_WRITES' => [
            'user create', 'user update', 'user set-role',
            'user meta add', 'user meta update', 'user meta delete',
        ],
        'MAXI_AI_WP_CLI_ALLOW_OPTION_WRITES' => [
            'option add', 'option update', 'option delete', 'option patch',
        ],
        'MAXI_AI_WP_CLI_ALLOW_DB_READS' => [
            'db query',
            'db export',
        ],
        'MAXI_AI_WP_CLI_ALLOW_PLUGIN_WRITES' => [
            'plugin activate', 'plugin deactivate', 'plugin update',
            'plugin toggle', 'plugin auto-updates',
        ],
        'MAXI_AI_WP_CLI_ALLOW_PLUGIN_INSTALL' => [
            'plugin install',
        ],
        'MAXI_AI_WP_CLI_ALLOW_PLUGIN_DELETE' => [
            'plugin delete',
        ],
        'MAXI_AI_WP_CLI_ALLOW_THEME_WRITES' => [
            'theme activate', 'theme update',
        ],
        'MAXI_AI_WP_CLI_ALLOW_THEME_INSTALL' => [
            'theme install',
        ],
        'MAXI_AI_WP_CLI_ALLOW_THEME_DELETE' => [
            'theme delete',
        ],
        'MAXI_AI_WP_CLI_ALLOW_TRANSLATION_UPDATES' => [
            'language core update', 'language core install',
            'language plugin update', 'language plugin install',
            'language theme update', 'language theme install',
        ],
        'MAXI_AI_WP_CLI_ALLOW_ACF_WRITES' => [
            'acf json import', 'acf json sync',
        ],
    ];

    /**
     * Group prerequisites. If a group constant has an entry here, its
     * prerequisite constant must also be defined and truthy for the group
     * to take effect. Prevents enabling PLUGIN_INSTALL without PLUGIN_WRITES.
     */
    const PREREQUISITES = [
        'MAXI_AI_WP_CLI_ALLOW_PLUGIN_INSTALL' => 'MAXI_AI_WP_CLI_ALLOW_PLUGIN_WRITES',
        'MAXI_AI_WP_CLI_ALLOW_PLUGIN_DELETE'  => 'MAXI_AI_WP_CLI_ALLOW_PLUGIN_WRITES',
        'MAXI_AI_WP_CLI_ALLOW_THEME_INSTALL'  => 'MAXI_AI_WP_CLI_ALLOW_THEME_WRITES',
        'MAXI_AI_WP_CLI_ALLOW_THEME_DELETE'   => 'MAXI_AI_WP_CLI_ALLOW_THEME_WRITES',
    ];

    /**
     * Emergency-override constant. Bypasses READ_ONLY + GROUPS checks, but
     * NEVER bypasses the NEVER list.
     */
    const UNSAFE_CONSTANT = 'MAXI_AI_WP_CLI_UNSAFE';

    /**
     * Normalize a command string into the form used for matching.
     *
     * Lowercases the first 3 tokens (command + subcommand + sub-subcommand),
     * collapses whitespace, leaves later argument values alone.
     *
     * @param string $command Raw command.
     * @return string Normalized command ready for prefix matching.
     */
    public static function normalize( $command ) {

        $command = trim( (string) $command );
        // Strip leading "wp " if the caller included it.
        if ( stripos( $command, 'wp ' ) === 0 ) {
            $command = substr( $command, 3 );
        }
        $command = preg_replace( '/\s+/', ' ', $command );

        if ( $command === '' ) {
            return '';
        }

        // Lowercase only the first 3 tokens; preserve argument casing.
        $tokens = explode( ' ', $command );
        for ( $i = 0; $i < min( 3, count( $tokens ) ); $i++ ) {
            $tokens[ $i ] = strtolower( $tokens[ $i ] );
        }

        return implode( ' ', $tokens );

    }

    /**
     * Check whether a (normalized) command starts with one of the given prefixes.
     * Match must end at a space or end-of-string so "post listmalicious" does
     * NOT match "post list".
     *
     * @param string   $command  Normalized command.
     * @param string[] $prefixes Allowed prefixes.
     * @return string|null Matched prefix, or null.
     */
    private static function first_matching_prefix( $command, array $prefixes ) {

        foreach ( $prefixes as $prefix ) {
            if ( $command === $prefix ) {
                return $prefix;
            }
            if ( strpos( $command, $prefix . ' ' ) === 0 ) {
                return $prefix;
            }
        }

        return null;

    }

    /**
     * Decide whether a command is allowed.
     *
     * @param string $command Raw command.
     * @return array {
     *     @type bool        $allowed    Whether the command may run.
     *     @type string      $reason     One of: hard_banned, unsafe_override, read_only,
     *                                   <group constant name>, not_allowed, empty_command.
     *     @type string|null $matched    The matched prefix, if any.
     *     @type string      $normalized The normalized form that was matched against.
     * }
     */
    public static function is_allowed( $command ) {

        $normalized = self::normalize( $command );

        if ( $normalized === '' ) {
            return [
                'allowed'    => false,
                'reason'     => 'empty_command',
                'matched'    => null,
                'normalized' => '',
            ];
        }

        // 1. NEVER list — hard ban, no override possible.
        $banned = self::first_matching_prefix( $normalized, self::NEVER );
        if ( $banned !== null ) {
            return [
                'allowed'    => false,
                'reason'     => 'hard_banned',
                'matched'    => $banned,
                'normalized' => $normalized,
            ];
        }

        // 2. Emergency override.
        if ( defined( self::UNSAFE_CONSTANT ) && constant( self::UNSAFE_CONSTANT ) ) {
            return [
                'allowed'    => true,
                'reason'     => 'unsafe_override',
                'matched'    => null,
                'normalized' => $normalized,
            ];
        }

        // 3. Read-only — always allowed.
        $read_match = self::first_matching_prefix( $normalized, self::READ_ONLY );
        if ( $read_match !== null ) {
            return [
                'allowed'    => true,
                'reason'     => 'read_only',
                'matched'    => $read_match,
                'normalized' => $normalized,
            ];
        }

        // 4. Opt-in write groups.
        foreach ( self::GROUPS as $constant => $prefixes ) {
            if ( ! defined( $constant ) || ! constant( $constant ) ) {
                continue;
            }

            // Skip if prerequisite constant is not met.
            if ( isset( self::PREREQUISITES[ $constant ] ) ) {
                $prereq = self::PREREQUISITES[ $constant ];
                if ( ! defined( $prereq ) || ! constant( $prereq ) ) {
                    continue;
                }
            }
            $group_match = self::first_matching_prefix( $normalized, $prefixes );
            if ( $group_match !== null ) {
                return [
                    'allowed'    => true,
                    'reason'     => $constant,
                    'matched'    => $group_match,
                    'normalized' => $normalized,
                ];
            }
        }

        // 5. Not matched by anything.
        return [
            'allowed'    => false,
            'reason'     => 'not_allowed',
            'matched'    => null,
            'normalized' => $normalized,
        ];

    }

    /**
     * Return the constant name that would enable a given command, if any.
     * Used to hint operators in the rejection response.
     *
     * @param string $normalized Normalized command.
     * @return string|null Constant name, or null if no group would enable it.
     */
    public static function suggest_enabling_constant( $normalized ) {

        foreach ( self::GROUPS as $constant => $prefixes ) {
            if ( self::first_matching_prefix( $normalized, $prefixes ) !== null ) {
                if ( isset( self::PREREQUISITES[ $constant ] ) ) {
                    return self::PREREQUISITES[ $constant ] . ' + ' . $constant;
                }
                return $constant;
            }
        }

        return null;

    }

}
