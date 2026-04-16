<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Generic audit log service for Maxi AI.
 *
 * Append-only event log backed by the {$wpdb->prefix}maxi_ai_audit_log table.
 * Shared across features — key rotation events (category 'key'), wp-cli
 * rejection events (category 'wp_cli'), and whatever comes next.
 *
 * All writes go through record(); all reads go through query().
 */
class Maxi_AI_Audit_Log {

    /**
     * Seed value for the hash chain. The first audit log entry chains
     * from this seed. Changing it invalidates the entire chain.
     */
    private const CHAIN_SEED = 'maxi-ai-audit-chain-genesis';

    /**
     * Return the fully-qualified table name.
     *
     * @return string
     */
    public static function table() {

        global $wpdb;

        return $wpdb->prefix . 'maxi_ai_audit_log';

    }

    /**
     * Record an event.
     *
     * @param string $category One of 'key', 'wp_cli', ... Free-form but short.
     * @param string $event    Specific event name (e.g. 'rotated', 'wp_cli_rejected').
     * @param int    $actor_id WP user ID that triggered the event. 0 for system.
     * @param string $subject  Free-form identifier (masked key prefix, command, ...).
     * @param array  $context  Arbitrary context, stored as JSON.
     * @return int|false Inserted row ID, or false on failure.
     */
    public static function record( $category, $event, $actor_id = 0, $subject = '', $context = [] ) {

        global $wpdb;

        $category = substr( (string) $category, 0, 30 );
        $event    = substr( (string) $event, 0, 40 );
        $subject  = substr( (string) $subject, 0, 190 );

        $context_json = '';

        if ( ! empty( $context ) ) {
            $encoded = wp_json_encode( $context );
            if ( is_string( $encoded ) ) {
                $context_json = $encoded;
            }
        }

        $ts = current_time( 'mysql', true );

        // Compute hash chain: hash( previous_hash | current_entry_data ).
        $previous_hash = self::get_last_hash();
        $entry_hash    = self::compute_hash( $previous_hash, $ts, $category, $event, (int) $actor_id, $subject, $context_json );

        $ok = $wpdb->insert(
            self::table(),
            [
                'ts'         => $ts,
                'category'   => $category,
                'event'      => $event,
                'actor_id'   => (int) $actor_id,
                'subject'    => $subject,
                'context'    => $context_json,
                'entry_hash' => $entry_hash,
            ],
            [ '%s', '%s', '%s', '%d', '%s', '%s', '%s' ]
        );

        if ( false === $ok ) {
            maxi_ai_log(
                'Failed to insert audit log row: ' . $wpdb->last_error,
                'error',
                [ 'category' => $category, 'event' => $event ]
            );
            return false;
        }

        return (int) $wpdb->insert_id;

    }

    /**
     * Query the audit log.
     *
     * @param array $filters {
     *     @type string $category Optional category filter.
     *     @type string $event    Optional event filter.
     *     @type string $since    Optional ISO datetime lower bound (UTC).
     *     @type int    $limit    Default 50, max 500.
     *     @type int    $offset   Default 0.
     * }
     * @return array {
     *     @type array[] $events Rows with decoded context.
     *     @type int     $total  Total matching rows (ignoring limit/offset).
     * }
     */
    public static function query( array $filters = [] ) {

        global $wpdb;

        $where  = [];
        $params = [];

        if ( ! empty( $filters['category'] ) ) {
            $where[]  = 'category = %s';
            $params[] = substr( (string) $filters['category'], 0, 30 );
        }

        if ( ! empty( $filters['event'] ) ) {
            $where[]  = 'event = %s';
            $params[] = substr( (string) $filters['event'], 0, 40 );
        }

        if ( ! empty( $filters['since'] ) ) {
            $ts = strtotime( (string) $filters['since'] );
            if ( $ts ) {
                $where[]  = 'ts >= %s';
                $params[] = gmdate( 'Y-m-d H:i:s', $ts );
            }
        }

        $limit  = isset( $filters['limit'] ) ? max( 1, min( 500, (int) $filters['limit'] ) ) : 50;
        $offset = isset( $filters['offset'] ) ? max( 0, (int) $filters['offset'] ) : 0;

        $table      = self::table();
        $where_sql  = $where ? ( 'WHERE ' . implode( ' AND ', $where ) ) : '';

        $count_sql = "SELECT COUNT(*) FROM {$table} {$where_sql}";
        $list_sql  = "SELECT id, ts, category, event, actor_id, subject, context
                      FROM {$table}
                      {$where_sql}
                      ORDER BY id DESC
                      LIMIT %d OFFSET %d";

        if ( $params ) {
            // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
            $total = (int) $wpdb->get_var( $wpdb->prepare( $count_sql, $params ) );
            // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
            $rows  = $wpdb->get_results( $wpdb->prepare( $list_sql, array_merge( $params, [ $limit, $offset ] ) ), ARRAY_A );
        } else {
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
            $total = (int) $wpdb->get_var( $count_sql );
            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
            $rows  = $wpdb->get_results( $wpdb->prepare( $list_sql, $limit, $offset ), ARRAY_A );
        }

        $events = [];

        foreach ( (array) $rows as $row ) {
            $ctx            = [];
            $row['context'] = (string) ( $row['context'] ?? '' );
            if ( $row['context'] !== '' ) {
                $decoded = json_decode( $row['context'], true );
                if ( is_array( $decoded ) ) {
                    $ctx = $decoded;
                }
            }
            $events[] = [
                'id'       => (int) $row['id'],
                'ts'       => $row['ts'],
                'category' => $row['category'],
                'event'    => $row['event'],
                'actor_id' => (int) $row['actor_id'],
                'subject'  => $row['subject'],
                'context'  => $ctx,
            ];
        }

        return [
            'events' => $events,
            'total'  => $total,
        ];

    }

    // ------------------------------------------------------------------
    // Hash chain methods
    // ------------------------------------------------------------------

    /**
     * Get the hash of the last audit log entry, or the chain seed if empty.
     *
     * For legacy entries (pre-hash-chaining) that have an empty entry_hash,
     * we compute what their hash WOULD have been, walking backward until we
     * find a hashed entry or the beginning of the table.
     *
     * @return string SHA-256 hex hash.
     */
    private static function get_last_hash(): string {

        global $wpdb;

        $table = self::table();

        // Try to get the last entry that already has a hash.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
        $hash = $wpdb->get_var( "SELECT entry_hash FROM {$table} WHERE entry_hash != '' ORDER BY id DESC LIMIT 1" );

        if ( $hash && $hash !== '' ) {
            return (string) $hash;
        }

        // No hashed entries exist yet. Check if there are any entries at all.
        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
        $count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );

        if ( $count === 0 ) {
            return hash( 'sha256', self::CHAIN_SEED );
        }

        // Legacy entries exist without hashes. Check if we already computed
        // the chain in a previous request (cached to avoid O(n) per insert
        // while legacy entries are being migrated).
        $cache_key    = 'maxi_ai_legacy_chain_hash';
        $cache_count  = 'maxi_ai_legacy_chain_count';
        $cached_hash  = get_transient( $cache_key );
        $cached_count = (int) get_transient( $cache_count );

        if ( $cached_hash !== false && $cached_count === $count ) {
            return (string) $cached_hash;
        }

        // Compute the chain from scratch so the first new hashed entry
        // links correctly to the legacy data.
        $previous_hash = hash( 'sha256', self::CHAIN_SEED );

        // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
        $rows = $wpdb->get_results(
            "SELECT ts, category, event, actor_id, subject, context FROM {$table} ORDER BY id ASC",
            ARRAY_A
        );

        foreach ( $rows as $row ) {
            $previous_hash = self::compute_hash(
                $previous_hash,
                $row['ts'],
                $row['category'],
                $row['event'],
                (int) $row['actor_id'],
                $row['subject'],
                (string) ( $row['context'] ?? '' )
            );
        }

        // Cache for 1 hour. The cache is invalidated naturally: once a
        // hashed entry is written, get_last_hash() finds it via the
        // indexed query and never reaches this legacy path again.
        set_transient( $cache_key, $previous_hash, HOUR_IN_SECONDS );
        set_transient( $cache_count, $count, HOUR_IN_SECONDS );

        return $previous_hash;

    }

    /**
     * Compute the hash for an audit log entry.
     *
     * Hash = SHA-256( previous_hash | ts | category | event | actor_id | subject | context )
     *
     * @param string $previous_hash The hash of the previous entry.
     * @param string $ts            Timestamp (UTC).
     * @param string $category      Event category.
     * @param string $event         Event name.
     * @param int    $actor_id      Actor user ID.
     * @param string $subject       Event subject.
     * @param string $context_json  JSON-encoded context.
     * @return string SHA-256 hex hash.
     */
    private static function compute_hash( string $previous_hash, string $ts, string $category, string $event, int $actor_id, string $subject, string $context_json ): string {

        $data = $previous_hash . '|' . $ts . '|' . $category . '|' . $event . '|' . $actor_id . '|' . $subject . '|' . $context_json;

        return hash( 'sha256', $data );

    }

    /**
     * Verify the integrity of the audit log hash chain.
     *
     * Walks the chain from the first entry to the last, recomputing each
     * hash and comparing it to the stored value. Returns the first broken
     * link, or null if the chain is intact.
     *
     * @param int $batch_size Number of rows to process per query. Default 500.
     * @return array {
     *     @type bool   $valid           True if the entire chain is intact.
     *     @type int    $entries_checked  Total entries verified.
     *     @type int|null $broken_at_id   ID of the first entry with a mismatched hash, or null.
     *     @type string|null $expected    Expected hash at the broken entry.
     *     @type string|null $actual      Actual (stored) hash at the broken entry.
     * }
     */
    public static function verify_chain( int $batch_size = 500 ): array {

        global $wpdb;

        $table          = self::table();
        $previous_hash  = hash( 'sha256', self::CHAIN_SEED );
        $checked        = 0;
        $last_id        = 0;

        while ( true ) {

            // phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
            $rows = $wpdb->get_results(
                $wpdb->prepare(
                    "SELECT id, ts, category, event, actor_id, subject, context, entry_hash
                     FROM {$table}
                     WHERE id > %d
                     ORDER BY id ASC
                     LIMIT %d",
                    $last_id,
                    $batch_size
                ),
                ARRAY_A
            );

            if ( empty( $rows ) ) {
                break;
            }

            foreach ( $rows as $row ) {

                $checked++;
                $last_id = (int) $row['id'];

                // Skip legacy entries that predate hash chaining (empty hash).
                if ( empty( $row['entry_hash'] ) ) {
                    // For legacy entries, compute what the hash WOULD be and
                    // use it as the previous_hash for the next entry.
                    $previous_hash = self::compute_hash(
                        $previous_hash,
                        $row['ts'],
                        $row['category'],
                        $row['event'],
                        (int) $row['actor_id'],
                        $row['subject'],
                        (string) ( $row['context'] ?? '' )
                    );
                    continue;
                }

                $expected = self::compute_hash(
                    $previous_hash,
                    $row['ts'],
                    $row['category'],
                    $row['event'],
                    (int) $row['actor_id'],
                    $row['subject'],
                    (string) ( $row['context'] ?? '' )
                );

                if ( $expected !== $row['entry_hash'] ) {
                    return [
                        'valid'           => false,
                        'entries_checked' => $checked,
                        'broken_at_id'    => (int) $row['id'],
                        'expected'        => $expected,
                        'actual'          => $row['entry_hash'],
                    ];
                }

                $previous_hash = $row['entry_hash'];
            }
        }

        return [
            'valid'           => true,
            'entries_checked' => $checked,
            'broken_at_id'    => null,
            'expected'        => null,
            'actual'          => null,
        ];

    }

}
