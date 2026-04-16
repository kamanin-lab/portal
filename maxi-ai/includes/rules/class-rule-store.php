<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Thin $wpdb wrapper over wp_maxi_ai_ability_rules.
 *
 * CRUD + baseline seeder. All methods are static; there is no state other
 * than the row store. Keeps call sites simple (gate, abilities) and avoids
 * injecting a service locator.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Rule_Store {

    /**
     * Valid source values. Kept as a const so callers can reference them
     * without magic strings.
     */
    public const SOURCE_DEFAULT  = 'default';
    public const SOURCE_OPERATOR = 'operator';
    public const SOURCE_DOCU     = 'docu';

    /**
     * Valid delivery_mode values.
     *
     * - reject_first: rule body must be delivered (via _meta._rule on a
     *   rules_not_acknowledged rejection) before the ability executes. The
     *   agent's retry promotes session state to acknowledged. This is the
     *   safe default — blocking rules that shape how the agent plans a call.
     *
     * - inline_on_success: the ability executes on first call and the rule
     *   body is delivered inline (_meta._rule) alongside the successful
     *   response. Failed first calls do not deliver the rule and do not
     *   mutate session state. For descriptive rules that document what PHP
     *   guards already enforce.
     */
    public const DELIVERY_REJECT_FIRST      = 'reject_first';
    public const DELIVERY_INLINE_ON_SUCCESS = 'inline_on_success';

    /**
     * Whitelist for delivery_mode. Unknown values fall back to the safe
     * default (reject_first) everywhere this list is consulted.
     */
    public const DELIVERY_MODES = [
        self::DELIVERY_REJECT_FIRST,
        self::DELIVERY_INLINE_ON_SUCCESS,
    ];

    /**
     * Normalize a raw delivery_mode value to a whitelisted enum, defaulting
     * to reject_first for unknown or missing input. Used by upsert() and the
     * seed loader so callers never persist an invalid mode.
     */
    public static function normalize_delivery_mode( $raw ): string {

        if ( is_string( $raw ) && in_array( $raw, self::DELIVERY_MODES, true ) ) {
            return $raw;
        }

        return self::DELIVERY_REJECT_FIRST;

    }

    /**
     * Fetch a rule row by ability ID.
     *
     * @param string $ability_id Ability name e.g. "maxi/update-content".
     * @return array|null Associative row or null if not found.
     */
    public static function get( string $ability_id ): ?array {

        global $wpdb;

        $table = Maxi_AI_Rule_Schema::table_name();

        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE ability_id = %s LIMIT 1",
                $ability_id
            ),
            ARRAY_A
        );

        return $row ?: null;

    }

    /**
     * Return true if a rule exists for the ability.
     */
    public static function exists( string $ability_id ): bool {

        global $wpdb;

        $table = Maxi_AI_Rule_Schema::table_name();

        $count = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE ability_id = %s",
                $ability_id
            )
        );

        return $count > 0;

    }

    /**
     * Fetch the current version of a rule without pulling the content body.
     *
     * Returns null if the rule does not exist.
     */
    public static function get_version( string $ability_id ): ?int {

        global $wpdb;

        $table = Maxi_AI_Rule_Schema::table_name();

        $version = $wpdb->get_var(
            $wpdb->prepare(
                "SELECT version FROM {$table} WHERE ability_id = %s LIMIT 1",
                $ability_id
            )
        );

        if ( null === $version ) {
            return null;
        }

        return (int) $version;

    }

    /**
     * List all rules, optionally filtered by source.
     *
     * @param string|null $source Filter by source, or null for all.
     * @return array[] Associative rows.
     */
    public static function list_all( ?string $source = null ): array {

        global $wpdb;

        $table = Maxi_AI_Rule_Schema::table_name();

        if ( $source ) {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE source = %s ORDER BY ability_id ASC",
                    $source
                ),
                ARRAY_A
            );
        } else {
            $rows = $wpdb->get_results(
                "SELECT * FROM {$table} ORDER BY ability_id ASC",
                ARRAY_A
            );
        }

        return is_array( $rows ) ? $rows : [];

    }

    /**
     * Upsert a rule.
     *
     * If a row exists for $ability_id, update it. Otherwise insert. The
     * source column is always honored — callers explicitly set whether they
     * are writing a default, operator, or docu row.
     *
     * @param string      $ability_id    Ability name.
     * @param string      $title         Short human-readable title.
     * @param string      $content       Markdown body.
     * @param string      $source        One of SOURCE_DEFAULT|SOURCE_OPERATOR|SOURCE_DOCU.
     * @param string|null $delivery_mode Optional. One of DELIVERY_REJECT_FIRST|DELIVERY_INLINE_ON_SUCCESS.
     *                                   Defaults to reject_first (the safe default) for new rows;
     *                                   for updates, a null value preserves the existing mode.
     * @return int|false Row ID on insert/update, false on error.
     */
    public static function upsert( string $ability_id, string $title, string $content, string $source, ?string $delivery_mode = null ) {

        global $wpdb;

        $table = Maxi_AI_Rule_Schema::table_name();
        $now   = current_time( 'mysql' );

        $existing = self::get( $ability_id );

        if ( $existing ) {

            // Preserve the existing mode when caller passed null; otherwise
            // whitelist the incoming value so unknown input cannot corrupt
            // the column. Existing rows without the column set yet (pre-
            // migration sessions) fall back to the safe default.
            $mode = ( $delivery_mode === null )
                ? self::normalize_delivery_mode( $existing['delivery_mode'] ?? null )
                : self::normalize_delivery_mode( $delivery_mode );

            $updated = $wpdb->update(
                $table,
                [
                    'title'         => $title,
                    'content'       => $content,
                    'source'        => $source,
                    'version'       => (int) $existing['version'] + 1,
                    'delivery_mode' => $mode,
                    'updated_at'    => $now,
                ],
                [ 'ability_id' => $ability_id ],
                [ '%s', '%s', '%s', '%d', '%s', '%s' ],
                [ '%s' ]
            );

            return ( false === $updated ) ? false : (int) $existing['id'];

        }

        $mode = self::normalize_delivery_mode( $delivery_mode );

        $inserted = $wpdb->insert(
            $table,
            [
                'ability_id'    => $ability_id,
                'title'         => $title,
                'content'       => $content,
                'source'        => $source,
                'version'       => 1,
                'status'        => 'active',
                'delivery_mode' => $mode,
                'created_at'    => $now,
                'updated_at'    => $now,
            ],
            [ '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s' ]
        );

        return $inserted ? (int) $wpdb->insert_id : false;

    }

    /**
     * Delete a rule by ability ID.
     *
     * @return int|false Rows deleted, or false on error.
     */
    public static function delete( string $ability_id ) {

        global $wpdb;

        $table = Maxi_AI_Rule_Schema::table_name();

        return $wpdb->delete(
            $table,
            [ 'ability_id' => $ability_id ],
            [ '%s' ]
        );

    }

    /**
     * Seed baseline defaults from includes/rules/default-rules.php.
     *
     * - Always upserts `source = default` rows, regardless of existing
     *   `source = default` content (so plugin updates can refresh defaults).
     * - NEVER overwrites rows where the existing source is `operator` —
     *   operator-authored rules win forever unless explicitly deleted.
     * - `source = docu` rows are also overwritten when re-seeding defaults,
     *   since the shipped defaults represent the plugin author's baseline.
     *
     * @return int Number of rows upserted.
     */
    public static function seed_defaults(): int {

        $defaults = require __DIR__ . '/default-rules.php';

        if ( ! is_array( $defaults ) ) {
            return 0;
        }

        $count = 0;

        foreach ( $defaults as $ability_id => $rule ) {

            if ( ! is_array( $rule ) || empty( $rule['content'] ) ) {
                continue;
            }

            $existing = self::get( $ability_id );

            // Operator rules are immutable from the seeder's perspective.
            if ( $existing && $existing['source'] === self::SOURCE_OPERATOR ) {
                continue;
            }

            $title   = (string) ( $rule['title'] ?? $ability_id );
            $content = (string) $rule['content'];

            // Pass delivery_mode through when the seed entry specifies it;
            // upsert() normalizes unknown/missing values to reject_first.
            $delivery_mode = isset( $rule['delivery_mode'] ) ? (string) $rule['delivery_mode'] : null;

            $result = self::upsert( $ability_id, $title, $content, self::SOURCE_DEFAULT, $delivery_mode );

            if ( $result ) {
                $count++;
            }
        }

        return $count;

    }

}
