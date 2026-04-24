<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Thin $wpdb wrapper over wp_maxi_ai_playbooks.
 *
 * CRUD + baseline seeder. All methods are static; there is no state other
 * than the row store. Mirrors the pattern from Maxi_AI_Rule_Store.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Playbook_Store {

    /**
     * Valid source values.
     */
    public const SOURCE_DEFAULT  = 'default';
    public const SOURCE_OPERATOR = 'operator';
    public const SOURCE_DOCU     = 'docu';

    /**
     * Compute a content hash for drift detection.
     *
     * The "v1" prefix versions the hash schema. When new fields are added
     * to the hash inputs, bump to "v2" to force a clean reseed.
     *
     * @param string $title    Playbook title.
     * @param string $content  Full content body.
     * @param bool   $required Whether the playbook is required.
     * @return string 64-char hex SHA-256 hash.
     */
    public static function compute_hash( string $title, string $content, bool $required ): string {

        return hash( 'sha256', "v1\0" . $title . "\0" . $content . "\0" . ( $required ? '1' : '0' ) );

    }

    /**
     * Fetch a playbook row by slug.
     *
     * @param string $slug Playbook slug e.g. "operational".
     * @return array|null Associative row or null if not found.
     */
    public static function get( string $slug ): ?array {

        global $wpdb;

        $table = Maxi_AI_Playbook_Schema::table_name();

        $row = $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM {$table} WHERE slug = %s LIMIT 1",
                $slug
            ),
            ARRAY_A
        );

        return $row ?: null;

    }

    /**
     * Check whether a playbook with the given slug exists.
     */
    public static function exists( string $slug ): bool {

        global $wpdb;

        $table = Maxi_AI_Playbook_Schema::table_name();

        $count = (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$table} WHERE slug = %s",
                $slug
            )
        );

        return $count > 0;

    }

    /**
     * Fetch the current version of a playbook without pulling the content body.
     *
     * Returns null if the playbook does not exist.
     */
    public static function get_version( string $slug ): ?int {

        global $wpdb;

        $table = Maxi_AI_Playbook_Schema::table_name();

        $version = $wpdb->get_var(
            $wpdb->prepare(
                "SELECT version FROM {$table} WHERE slug = %s LIMIT 1",
                $slug
            )
        );

        if ( null === $version ) {
            return null;
        }

        return (int) $version;

    }

    /**
     * Return [slug => version] for all required, active playbooks.
     *
     * Used by the session class to check whether all required playbooks
     * have been acknowledged at the current version.
     *
     * @return array<string, int>
     */
    public static function get_required_versions(): array {

        global $wpdb;

        $table = Maxi_AI_Playbook_Schema::table_name();

        $rows = $wpdb->get_results(
            "SELECT slug, version FROM {$table} WHERE required = 1 AND status = 'active' ORDER BY slug ASC",
            ARRAY_A
        );

        if ( ! is_array( $rows ) ) {
            return [];
        }

        $map = [];

        foreach ( $rows as $row ) {
            $map[ $row['slug'] ] = (int) $row['version'];
        }

        return $map;

    }

    /**
     * Return all playbook rows, optionally filtered by source.
     *
     * @param string|null $source Optional source filter (default, operator, docu).
     * @return array List of associative row arrays.
     */
    public static function list_all( ?string $source = null ): array {

        global $wpdb;

        $table = Maxi_AI_Playbook_Schema::table_name();

        if ( $source ) {
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT * FROM {$table} WHERE source = %s ORDER BY slug ASC",
                    $source
                ),
                ARRAY_A
            );
        } else {
            $rows = $wpdb->get_results(
                "SELECT * FROM {$table} ORDER BY slug ASC",
                ARRAY_A
            );
        }

        return is_array( $rows ) ? $rows : [];

    }

    /**
     * Delete a playbook row by slug.
     *
     * @param string $slug Playbook slug.
     * @return int|false Number of rows deleted, or false on error.
     */
    public static function delete( string $slug ) {

        global $wpdb;

        $table = Maxi_AI_Playbook_Schema::table_name();

        return $wpdb->delete(
            $table,
            [ 'slug' => $slug ],
            [ '%s' ]
        );

    }

    /**
     * Upsert a playbook.
     *
     * If a row exists for $slug, update it (version auto-increments).
     * Otherwise insert. The source column is always honored.
     *
     * @param string $slug     Playbook slug.
     * @param string $title    Short human-readable title.
     * @param string $content  Full content (markdown).
     * @param string $source   One of SOURCE_DEFAULT|SOURCE_OPERATOR|SOURCE_DOCU.
     * @param bool   $required Whether the playbook gate should enforce reading.
     * @return int|false Row ID on insert/update, false on error.
     */
    public static function upsert( string $slug, string $title, string $content, string $source, bool $required ) {

        global $wpdb;

        $table = Maxi_AI_Playbook_Schema::table_name();
        $now   = current_time( 'mysql' );

        $existing     = self::get( $slug );
        $content_hash = self::compute_hash( $title, $content, $required );

        if ( $existing ) {

            // Content-equality short-circuit: skip the write if nothing changed.
            // Prevents version-bump churn and unnecessary session re-acknowledgment.
            if ( $existing['content_hash'] === $content_hash && $existing['source'] === $source ) {
                return (int) $existing['id'];
            }

            $updated = $wpdb->update(
                $table,
                [
                    'title'        => $title,
                    'content'      => $content,
                    'content_hash' => $content_hash,
                    'source'       => $source,
                    'required'     => $required ? 1 : 0,
                    'version'      => (int) $existing['version'] + 1,
                    'updated_at'   => $now,
                ],
                [ 'slug' => $slug ],
                [ '%s', '%s', '%s', '%s', '%d', '%d', '%s' ],
                [ '%s' ]
            );

            return ( false === $updated ) ? false : (int) $existing['id'];

        }

        $inserted = $wpdb->insert(
            $table,
            [
                'slug'         => $slug,
                'title'        => $title,
                'content'      => $content,
                'content_hash' => $content_hash,
                'source'       => $source,
                'required'     => $required ? 1 : 0,
                'version'      => 1,
                'status'       => 'active',
                'created_at'   => $now,
                'updated_at'   => $now,
            ],
            [ '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s', '%s' ]
        );

        return $inserted ? (int) $wpdb->insert_id : false;

    }

    /**
     * Seed baseline defaults from includes/playbooks/default-playbooks.php.
     *
     * - Always upserts `source = default` rows, so plugin updates refresh content.
     * - NEVER overwrites rows where the existing source is `operator`.
     *
     * @return int Number of rows upserted.
     */
    public static function seed_defaults(): int {

        $defaults = require __DIR__ . '/default-playbooks.php';

        if ( ! is_array( $defaults ) ) {
            return 0;
        }

        $count = 0;

        foreach ( $defaults as $slug => $playbook ) {

            if ( ! is_array( $playbook ) || empty( $playbook['content'] ) ) {
                continue;
            }

            $existing = self::get( $slug );

            // Operator playbooks are immutable from the seeder's perspective.
            if ( $existing && $existing['source'] === self::SOURCE_OPERATOR ) {
                continue;
            }

            $title    = (string) ( $playbook['title'] ?? $slug );
            $content  = (string) $playbook['content'];
            $required = (bool) ( $playbook['required'] ?? false );

            $result = self::upsert( $slug, $title, $content, self::SOURCE_DEFAULT, $required );

            if ( $result ) {
                $count++;
            }
        }

        return $count;

    }

    /**
     * Compute a hash-of-hashes fingerprint over all shipped defaults.
     *
     * Used by the auto-reseed path in Maxi_AI::maybe_refresh_seeds() to
     * detect content drift without touching the database. Memoized per
     * request via static variable.
     *
     * @return string 64-char hex SHA-256 fingerprint, or '' on error.
     */
    public static function fingerprint_shipped_defaults(): string {

        static $cache = null;

        if ( $cache !== null ) {
            return $cache;
        }

        $defaults = require __DIR__ . '/default-playbooks.php';

        if ( ! is_array( $defaults ) ) {
            return $cache = '';
        }

        $parts = [];

        foreach ( $defaults as $slug => $p ) {

            if ( ! is_array( $p ) || empty( $p['content'] ) ) {
                continue;
            }

            $parts[] = $slug . ':' . self::compute_hash(
                (string) ( $p['title'] ?? $slug ),
                (string) $p['content'],
                (bool) ( $p['required'] ?? false )
            );
        }

        sort( $parts );

        return $cache = hash( 'sha256', implode( "\n", $parts ) );

    }

    /**
     * Verify that all default-source rows match the shipped content hashes.
     *
     * Called after seed_defaults() to guard against partial failures. If
     * any row's stored hash doesn't match the expected hash, returns false
     * so the fingerprint option stays stale and the next request retries.
     *
     * @return bool True if all default rows are consistent with shipped content.
     */
    public static function verify_seed_hashes(): bool {

        global $wpdb;

        $table    = Maxi_AI_Playbook_Schema::table_name();
        $defaults = require __DIR__ . '/default-playbooks.php';

        if ( ! is_array( $defaults ) ) {
            do_action( 'maxi_ai_audit', 'seed_verification_failed', [
                'reason' => 'default-playbooks.php did not return an array',
            ] );
            return false;
        }

        $rows = $wpdb->get_results(
            "SELECT slug, content_hash FROM {$table} WHERE source = 'default'",
            ARRAY_A
        );

        $stored = [];

        foreach ( $rows as $r ) {
            $stored[ $r['slug'] ] = $r['content_hash'];
        }

        foreach ( $defaults as $slug => $p ) {

            if ( ! is_array( $p ) || empty( $p['content'] ) ) {
                continue;
            }

            $expected = self::compute_hash(
                (string) ( $p['title'] ?? $slug ),
                (string) $p['content'],
                (bool) ( $p['required'] ?? false )
            );

            // If an operator row shadows this slug, skip — seed_defaults() skips those too.
            if ( ! isset( $stored[ $slug ] ) ) {
                continue;
            }

            if ( $stored[ $slug ] !== $expected ) {
                return false;
            }
        }

        return true;

    }

}
