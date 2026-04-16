<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Per-MCP-session rule acknowledgement cache.
 *
 * Keyed by "<mcp-session-id>:<ability-id>", stored as a WordPress transient.
 * Session ID is read from $_SERVER['HTTP_MCP_SESSION_ID'] — the MCP adapter
 * sets this from the `Mcp-Session-Id` request header but does not propagate
 * it into execute_callback scope, so the gate reads it directly.
 *
 * When no session ID is present (direct PHP calls, WP-CLI, cron), the
 * acknowledgement check is a no-op and the caller should bypass the gate.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Rule_Session {

    /**
     * Default TTL for acknowledgement transients (seconds).
     * Overridable via MAXI_AI_RULE_SESSION_TTL.
     */
    private const DEFAULT_TTL = 1800; // 30 minutes.

    /**
     * Transient key prefix. Keep short — WP transient keys have a length cap.
     */
    private const PREFIX = 'maxi_rule_ack_';

    /**
     * Session ID captured from the current WP_REST_Request via the
     * rest_pre_dispatch filter. The MCP adapter stores the header on its
     * own request context and never populates $_SERVER, so we capture it
     * ourselves. See Maxi_AI_Bootstrap::capture_mcp_session_from_rest().
     */
    private static ?string $captured_session_id = null;

    /**
     * Capture Mcp-Session-Id from a WP_REST_Request. Called from the
     * rest_pre_dispatch filter registered in maxi-ai.php.
     *
     * WordPress normalizes header names — get_header() accepts either
     * 'Mcp-Session-Id' or 'mcp_session_id' and returns the same value.
     */
    public static function capture_from_request( WP_REST_Request $request ): void {

        $sid = $request->get_header( 'mcp_session_id' );

        if ( is_string( $sid ) && $sid !== '' ) {
            self::$captured_session_id = $sid;
        }

    }

    /**
     * Retrieve the current MCP session ID, or null if not in an MCP request.
     *
     * Prefers the value captured from WP_REST_Request (the MCP adapter's
     * actual header source); falls back to $_SERVER for non-REST edge cases.
     */
    public static function get_session_id(): ?string {

        if ( is_string( self::$captured_session_id ) && self::$captured_session_id !== '' ) {
            return self::$captured_session_id;
        }

        $sid = $_SERVER['HTTP_MCP_SESSION_ID'] ?? null;

        if ( ! is_string( $sid ) || $sid === '' ) {
            return null;
        }

        return $sid;

    }

    /**
     * Get the configured TTL.
     */
    private static function ttl(): int {

        if ( defined( 'MAXI_AI_RULE_SESSION_TTL' ) && is_int( MAXI_AI_RULE_SESSION_TTL ) ) {
            return max( 60, (int) MAXI_AI_RULE_SESSION_TTL );
        }

        return self::DEFAULT_TTL;

    }

    /**
     * Compute the transient key for (session, ability) tuple.
     */
    private static function key( string $session_id, string $ability_id ): string {

        // HMAC the session ID so transient keys cannot be predicted from
        // a leaked session UUID. md5 then keeps the key short for WP transient
        // name limits.
        $normalized = self::normalize_session_id( $session_id );

        return self::PREFIX . md5( $normalized . '|' . $ability_id );

    }

    /**
     * HMAC-normalize a raw MCP session ID.
     *
     * Even though the MCP adapter validates session UUIDs against user meta,
     * this prevents transient key prediction if a session ID is leaked via
     * logs or error messages. The HMAC binds the session to this site's salt.
     *
     * @param string $session_id Raw session UUID from the HTTP header.
     * @return string HMAC'd session identifier (hex).
     */
    private static function normalize_session_id( string $session_id ): string {

        return hash_hmac( 'sha256', $session_id, wp_salt( 'auth' ) );

    }

    /**
     * Three-state session model for rule delivery.
     *
     * - STATE_DELIVERED: rule body was sent to the agent in a prior response
     *   (via _meta._rule on a reject_first rejection). Awaiting the retry
     *   that promotes the state to acknowledged.
     * - STATE_ACKNOWLEDGED: handshake complete; subsequent calls to the same
     *   ability pass through the gate with no _rule attachment.
     */
    public const STATE_DELIVERED    = 'delivered';
    public const STATE_ACKNOWLEDGED = 'acknowledged';

    /**
     * Return the session's state for an ability as
     *   [ 'version' => int, 'state' => self::STATE_* ]
     * or null if the session has no record for this ability (equivalent to
     * "unseen" in the three-state model). Also returns null outside an MCP
     * session.
     *
     * Legacy compatibility: transient values written by the old two-state
     * code path were a bare int version and only ever meant "acknowledged".
     * A scalar payload is transparently interpreted as
     *   [ 'version' => $int, 'state' => STATE_ACKNOWLEDGED ]
     * so sessions that predate this rollout pay zero additional handshake
     * cost. The next mutation re-serializes it in the new structured form.
     */
    public static function get_state( string $ability_id ): ?array {

        $sid = self::get_session_id();

        if ( ! $sid ) {
            return null;
        }

        $value = get_transient( self::key( $sid, $ability_id ) );

        if ( false === $value || null === $value ) {
            return null;
        }

        // Legacy: bare int (or numeric string) payload ⇒ acknowledged.
        if ( is_int( $value ) || ( is_string( $value ) && ctype_digit( $value ) ) ) {
            $v = (int) $value;

            if ( $v <= 0 ) {
                return null;
            }

            return [
                'version' => $v,
                'state'   => self::STATE_ACKNOWLEDGED,
            ];
        }

        // New shape.
        if ( is_array( $value )
            && isset( $value['version'], $value['state'] )
            && (int) $value['version'] > 0
            && in_array( $value['state'], [ self::STATE_DELIVERED, self::STATE_ACKNOWLEDGED ], true )
        ) {
            return [
                'version' => (int) $value['version'],
                'state'   => (string) $value['state'],
            ];
        }

        // Unrecognized payload — treat as missing so the gate forces re-handshake.
        return null;

    }

    /**
     * Return the rule version this session acknowledged for the ability,
     * or null if the session has not reached STATE_ACKNOWLEDGED (or is
     * outside an MCP session).
     *
     * STATE_DELIVERED reports null here — the gate uses get_state() for the
     * three-way branch, while get-ability-rule and other back-compat callers
     * keep treating "not acknowledged" as equivalent to unseen.
     */
    public static function get_acknowledged_version( string $ability_id ): ?int {

        $state = self::get_state( $ability_id );

        if ( null === $state ) {
            return null;
        }

        if ( $state['state'] !== self::STATE_ACKNOWLEDGED ) {
            return null;
        }

        return (int) $state['version'];

    }

    /**
     * Back-compat boolean check. Prefer get_acknowledged_version() when the
     * caller needs to compare against the current rule version.
     */
    public static function is_acknowledged( string $ability_id ): bool {

        return null !== self::get_acknowledged_version( $ability_id );

    }

    /**
     * Mark the rule body as delivered (but not yet acknowledged) for the
     * current session. Called from the gate after attaching _meta._rule to
     * a rules_not_acknowledged rejection under the reject_first mode. The
     * agent's retry is what promotes this to STATE_ACKNOWLEDGED.
     *
     * Noop if no session ID is available.
     */
    public static function mark_delivered( string $ability_id, int $version ): void {

        $sid = self::get_session_id();

        if ( ! $sid ) {
            return;
        }

        if ( $version <= 0 ) {
            return;
        }

        set_transient(
            self::key( $sid, $ability_id ),
            [
                'version' => $version,
                'state'   => self::STATE_DELIVERED,
            ],
            self::ttl()
        );

    }

    /**
     * Mark the given rule version acknowledged for the current session.
     *
     * Noop if no session ID is available. Unconditional write: any prior
     * state (including STATE_DELIVERED at the same version or an older
     * acknowledgement) is promoted to STATE_ACKNOWLEDGED at the given
     * version. This matches the "always-ack on re-fetch" semantic of
     * maxi/get-ability-rule.
     */
    public static function mark_acknowledged( string $ability_id, int $version ): void {

        $sid = self::get_session_id();

        if ( ! $sid ) {
            return;
        }

        if ( $version <= 0 ) {
            return;
        }

        set_transient(
            self::key( $sid, $ability_id ),
            [
                'version' => $version,
                'state'   => self::STATE_ACKNOWLEDGED,
            ],
            self::ttl()
        );

    }

    // ------------------------------------------------------------------
    // Read-before-write tracking
    // ------------------------------------------------------------------

    /**
     * Transient prefix for content-read tracking.
     */
    private const CONTENT_READ_PREFIX = 'maxi_content_read_';

    /**
     * Record that a post's content was read in this MCP session.
     * Called from get-content.php after a successful fetch.
     */
    public static function mark_content_read( int $post_id ): void {

        $sid = self::get_session_id();

        if ( ! $sid || $post_id <= 0 ) {
            return;
        }

        set_transient( self::content_read_key( $sid, $post_id ), 1, self::ttl() );

    }

    /**
     * Check whether a post's content was read in this MCP session.
     * Used by the Rule Gate to enforce read-before-write on content updates.
     */
    public static function was_content_read( int $post_id ): bool {

        $sid = self::get_session_id();

        if ( ! $sid ) {
            return false;
        }

        return (bool) get_transient( self::content_read_key( $sid, $post_id ) );

    }

    /**
     * Compute the transient key for content-read tracking.
     */
    private static function content_read_key( string $sid, int $post_id ): string {

        $normalized = self::normalize_session_id( $sid );

        return self::CONTENT_READ_PREFIX . md5( $normalized . '|' . $post_id );

    }

    // ------------------------------------------------------------------
    // Read-before-status-change tracking (notes) — consume-on-use
    // ------------------------------------------------------------------

    /**
     * Transient prefix for note-read tracking.
     */
    private const NOTE_READ_PREFIX = 'maxi_note_read_';

    /**
     * Record that a note was read in this MCP session.
     * Called from get-note.php and create-note.php after a successful fetch/create.
     */
    public static function mark_note_read( int $note_id ): void {

        $sid = self::get_session_id();

        if ( ! $sid || $note_id <= 0 ) {
            return;
        }

        set_transient( self::note_read_key( $sid, $note_id ), 1, self::ttl() );

    }

    /**
     * Check whether a note was read in this MCP session.
     * Used by update-note.php to enforce read-before-status-change.
     */
    public static function was_note_read( int $note_id ): bool {

        $sid = self::get_session_id();

        if ( ! $sid ) {
            return false;
        }

        return (bool) get_transient( self::note_read_key( $sid, $note_id ) );

    }

    /**
     * Clear the note-read flag (consume-on-use).
     * Called from update-note.php after a successful status change,
     * forcing the agent to re-read before the next status change.
     */
    public static function clear_note_read( int $note_id ): void {

        $sid = self::get_session_id();

        if ( ! $sid || $note_id <= 0 ) {
            return;
        }

        delete_transient( self::note_read_key( $sid, $note_id ) );

    }

    /**
     * Compute the transient key for note-read tracking.
     */
    private static function note_read_key( string $sid, int $note_id ): string {

        $normalized = self::normalize_session_id( $sid );

        return self::NOTE_READ_PREFIX . md5( $normalized . '|' . $note_id );

    }

    // ------------------------------------------------------------------
    // Utilities
    // ------------------------------------------------------------------

    /**
     * Forget an acknowledgement (for tests or explicit revocation).
     */
    public static function forget( string $ability_id ): void {

        $sid = self::get_session_id();

        if ( ! $sid ) {
            return;
        }

        delete_transient( self::key( $sid, $ability_id ) );

    }

}
