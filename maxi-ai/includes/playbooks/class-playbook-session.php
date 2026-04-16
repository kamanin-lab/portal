<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Session-wide playbook acknowledgement cache.
 *
 * Tracks whether the current MCP session has acknowledged all required
 * playbooks at their current version, plus operator-note freshness.
 * Reuses Maxi_AI_Rule_Session::get_session_id() for session identification.
 *
 * When no session ID is present (direct PHP calls, WP-CLI, cron), all
 * checks return truthy — in-process callers are trusted.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Playbook_Session {

    /**
     * Default TTL for playbook acknowledgement transients (seconds).
     * 2 hours — longer than rule session TTL (30 min) because bootstrap
     * is session-wide and re-bootstrapping adds friction without security
     * benefit. Overridable via MAXI_AI_PLAYBOOK_SESSION_TTL.
     */
    private const DEFAULT_TTL = 7200; // 2 hours.

    /**
     * Transient key prefix. Keep short — WP transient keys have a length cap.
     */
    private const PREFIX = 'maxi_pb_ack_';

    /**
     * Get the configured TTL.
     */
    private static function ttl(): int {

        if ( defined( 'MAXI_AI_PLAYBOOK_SESSION_TTL' ) && is_int( MAXI_AI_PLAYBOOK_SESSION_TTL ) ) {
            return max( 60, (int) MAXI_AI_PLAYBOOK_SESSION_TTL );
        }

        return self::DEFAULT_TTL;

    }

    /**
     * Compute the transient key for (session, slug) tuple.
     */
    private static function key( string $session_id, string $slug ): string {

        $normalized = self::normalize_session_id( $session_id );

        return self::PREFIX . md5( $normalized . '|' . $slug );

    }

    /**
     * HMAC-normalize a raw MCP session ID.
     *
     * Prevents transient key prediction if a session ID is leaked via
     * logs or error messages. Binds the session to this site's salt.
     */
    private static function normalize_session_id( string $session_id ): string {

        return hash_hmac( 'sha256', $session_id, wp_salt( 'auth' ) );

    }

    /**
     * Return the playbook version this session acknowledged for a slug,
     * or null if not acknowledged.
     */
    public static function get_acknowledged_version( string $slug ): ?int {

        $sid = Maxi_AI_Rule_Session::get_session_id();

        if ( ! $sid ) {
            return null;
        }

        $data = get_transient( self::key( $sid, $slug ) );

        if ( ! is_array( $data ) || ! isset( $data['version'] ) ) {
            return null;
        }

        return (int) $data['version'];

    }

    /**
     * Get the notes hash stored at acknowledgement time, or null.
     */
    public static function get_acknowledged_notes_hash( string $slug ): ?string {

        $sid = Maxi_AI_Rule_Session::get_session_id();

        if ( ! $sid ) {
            return null;
        }

        $data = get_transient( self::key( $sid, $slug ) );

        if ( ! is_array( $data ) || ! isset( $data['notes_hash'] ) ) {
            return null;
        }

        return (string) $data['notes_hash'];

    }

    /**
     * Mark a playbook slug as acknowledged for the current session.
     *
     * Stores both the playbook version and the current operator-note
     * hash so the gate can detect note changes mid-session.
     *
     * @param string $slug       Playbook slug.
     * @param int    $version    Playbook version at acknowledgement time.
     * @param string $notes_hash Hash of active operator-note state.
     */
    public static function mark_acknowledged( string $slug, int $version, string $notes_hash ): void {

        $sid = Maxi_AI_Rule_Session::get_session_id();

        if ( ! $sid ) {
            return;
        }

        if ( $version <= 0 ) {
            return;
        }

        set_transient(
            self::key( $sid, $slug ),
            [
                'version'    => $version,
                'notes_hash' => $notes_hash,
            ],
            self::ttl()
        );

    }

    /**
     * Check whether all required playbooks have been acknowledged at
     * their current version AND operator-note state is fresh.
     *
     * @return true|array True if all acknowledged and fresh, otherwise
     *                    ['missing' => [...], 'stale' => [...]] with slugs.
     */
    public static function are_all_required_acknowledged() {

        $required = Maxi_AI_Playbook_Store::get_required_versions();

        if ( empty( $required ) ) {
            // No required playbooks registered — nothing to enforce.
            // Caller should treat this as a system error, not a pass-through.
            return [];
        }

        $current_notes_hash = self::compute_notes_hash();

        $missing = [];
        $stale   = [];

        foreach ( $required as $slug => $current_version ) {

            $acked_version = self::get_acknowledged_version( $slug );

            if ( null === $acked_version ) {
                $missing[] = $slug;
                continue;
            }

            if ( $acked_version !== $current_version ) {
                // Any mismatch is stale — including downward resets caused
                // by a row being deleted and re-seeded at version 1. A
                // one-directional (<) check would pass the new row on the
                // strength of an ack for the deleted predecessor.
                $stale[] = $slug;
                continue;
            }

            // Version matches — check notes freshness.
            $acked_hash = self::get_acknowledged_notes_hash( $slug );

            if ( $acked_hash !== $current_notes_hash ) {
                $stale[] = $slug;
            }
        }

        if ( empty( $missing ) && empty( $stale ) ) {
            return true;
        }

        return [
            'missing' => $missing,
            'stale'   => $stale,
        ];

    }

    /**
     * Compute a deterministic hash of the current active operator-note state.
     *
     * Uses md5(content) instead of updated_at to avoid false re-bootstraps
     * from non-authoritative comment activity. Only actual content changes
     * or note additions/removals trigger re-bootstrap.
     *
     * @return string md5 hash of [[id, md5(content)], ...] sorted by id ASC.
     */
    public static function compute_notes_hash(): string {

        global $wpdb;

        $notes_table = $wpdb->prefix . 'maxi_ai_notes';

        $rows = $wpdb->get_results(
            "SELECT id, content FROM {$notes_table} WHERE type = 'operator-note' AND status = 'active' ORDER BY id ASC",
            ARRAY_A
        );

        if ( ! is_array( $rows ) || empty( $rows ) ) {
            return md5( '[]' );
        }

        $entries = [];

        foreach ( $rows as $row ) {
            $entries[] = [ (int) $row['id'], md5( (string) $row['content'] ) ];
        }

        return md5( wp_json_encode( $entries ) );

    }

    /**
     * Forget a playbook acknowledgement (for tests or explicit revocation).
     */
    public static function forget( string $slug ): void {

        $sid = Maxi_AI_Rule_Session::get_session_id();

        if ( ! $sid ) {
            return;
        }

        delete_transient( self::key( $sid, $slug ) );

    }

}
