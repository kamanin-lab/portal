<?php
/**
 * SQL / timezone / date-window helpers shared across revenue abilities.
 *
 * Centralises the mechanics of turning caller input (timezone, status list,
 * date range) into safe $wpdb->prepare() arguments. Every helper is
 * side-effect-free except kmn_revenue_set_query_timeout_ms() which mutates
 * the current DB session.
 *
 * Timezone strategy: always resolve to a NUMERIC offset (e.g. +02:00) in
 * PHP. Do not rely on MySQL's CONVERT_TZ('...', '+00:00', 'Europe/Vienna')
 * — production hosts may ship empty mysql.time_zone tables and the named
 * form returns NULL there. Numeric offsets are portable and DST-aware as
 * long as we resolve them "at the moment we are asking about", accepting
 * the <1h error on the two yearly transition weeks.
 *
 * @package KMN_Revenue_Abilities
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Resolve a timezone spec to a numeric offset string (+HH:MM / -HH:MM).
 *
 * Accepts:
 *   - null → WordPress site timezone (wp_timezone()).
 *   - IANA name "Europe/Vienna" → current offset at $at.
 *   - Pre-formatted numeric offset "+02:00" / "-05:30" → returned as-is.
 *
 * On unknown IANA name the helper logs a warning and falls back to +00:00
 * rather than throwing — abilities degrade to UTC rather than failing.
 *
 * @param string|null            $timezone IANA name, numeric offset, or null.
 * @param DateTimeImmutable|null $at       Moment to resolve offset for
 *                                         (DST-aware). Defaults to now.
 * @return string Formatted offset `+HH:MM` or `-HH:MM`.
 */
function kmn_revenue_get_utc_offset( ?string $timezone = null, ?DateTimeImmutable $at = null ): string {

    if ( null === $at ) {
        $at = new DateTimeImmutable( 'now' );
    }

    // Default to site timezone.
    if ( null === $timezone || '' === $timezone ) {
        $tz_obj = function_exists( 'wp_timezone' ) ? wp_timezone() : new DateTimeZone( 'UTC' );
        return $at->setTimezone( $tz_obj )->format( 'P' );
    }

    // Already a numeric offset — pass through (with light normalisation).
    if ( preg_match( '/^[+-]\d{2}:\d{2}$/', $timezone ) ) {
        return $timezone;
    }

    try {
        $tz_obj = new DateTimeZone( $timezone );
        return $at->setTimezone( $tz_obj )->format( 'P' );
    } catch ( Exception $e ) {
        error_log( sprintf( '[kmn-revenue-abilities] Unknown timezone "%s"; falling back to +00:00', $timezone ) );
        return '+00:00';
    }

}

/**
 * Convenience wrapper: read the `timezone` key from an input array.
 *
 * @param array                  $input Validated ability input.
 * @param DateTimeImmutable|null $at    Optional resolution moment.
 * @return string Formatted offset.
 */
function kmn_revenue_resolve_tz_offset( array $input, ?DateTimeImmutable $at = null ): string {

    $tz = isset( $input['timezone'] ) && is_string( $input['timezone'] ) ? $input['timezone'] : null;
    return kmn_revenue_get_utc_offset( $tz, $at );

}

/**
 * Validate + sanitise a WooCommerce status whitelist.
 *
 * Every status must match /^wc-[a-z-]+$/. Anything else is dropped.
 * Preserves the caller's order (useful if callers rank by typical weight)
 * and deduplicates.
 *
 * Default: wc-completed + wc-processing — the canonical "paid" window.
 *
 * @param array $input   Validated ability input (reads $input['status']).
 * @param array $default Fallback list if caller passed nothing.
 * @return string[] Clean status list suitable for SQL placeholders.
 */
function kmn_revenue_status_whitelist( array $input, array $default = [ 'wc-completed', 'wc-processing' ] ): array {

    $raw = isset( $input['status'] ) && is_array( $input['status'] ) ? $input['status'] : $default;

    $clean = [];
    foreach ( $raw as $candidate ) {
        if ( is_string( $candidate ) && preg_match( '/^wc-[a-z-]+$/', $candidate ) ) {
            $clean[] = $candidate;
        }
    }

    // Deduplicate preserving order.
    $clean = array_values( array_unique( $clean ) );

    // Never return empty — fall back to default if filter stripped everything.
    if ( empty( $clean ) ) {
        return $default;
    }

    return $clean;

}

/**
 * Build a comma-joined string of `%s` placeholders for an IN (...) clause.
 *
 * Usage:
 *   $ph = kmn_revenue_prepare_in_placeholders( $statuses );
 *   $wpdb->prepare( "... WHERE status IN ({$ph})", ...$statuses );
 *
 * Zero-length input returns `''` (a literal empty-string SQL value) so the
 * composed query still parses — callers should guard against empty arrays
 * before hitting the DB because `IN ('')` never matches any row.
 *
 * @param array $values Values the caller will pass as prepare arguments.
 * @return string Placeholder fragment, e.g. "%s,%s,%s".
 */
function kmn_revenue_prepare_in_placeholders( array $values ): string {

    if ( empty( $values ) ) {
        return "''";
    }

    return implode( ',', array_fill( 0, count( $values ), '%s' ) );

}

/**
 * Convert a local-time date (YYYY-MM-DD) to UTC bounds for a WHERE clause.
 *
 * Returns the half-open interval [start_utc, end_utc) suitable for
 *   date_created >= %s AND date_created < %s
 *
 * Example:
 *   kmn_revenue_utc_bounds_for_date( '2026-04-23', '+02:00' )
 *     → [ '2026-04-22 22:00:00', '2026-04-23 22:00:00' ]
 *
 * @param string $yyyy_mm_dd Local date, e.g. '2026-04-23'.
 * @param string $offset     Numeric offset from kmn_revenue_get_utc_offset().
 * @return array{0:string,1:string} [start_utc, end_utc] in 'Y-m-d H:i:s'.
 */
function kmn_revenue_utc_bounds_for_date( string $yyyy_mm_dd, string $offset ): array {

    // Build a DateTime at LOCAL midnight using the numeric offset as tz.
    $start_local = DateTimeImmutable::createFromFormat(
        'Y-m-d H:i:sP',
        $yyyy_mm_dd . ' 00:00:00' . $offset
    );

    if ( false === $start_local ) {
        // Fall back to UTC day bounds on invalid input.
        $start_local = new DateTimeImmutable( $yyyy_mm_dd . ' 00:00:00', new DateTimeZone( 'UTC' ) );
    }

    $end_local = $start_local->modify( '+1 day' );

    // Convert both to UTC for DB comparison (wc_order_stats.date_created is UTC).
    $utc      = new DateTimeZone( 'UTC' );
    $start_ut = $start_local->setTimezone( $utc )->format( 'Y-m-d H:i:s' );
    $end_ut   = $end_local->setTimezone( $utc )->format( 'Y-m-d H:i:s' );

    return [ $start_ut, $end_ut ];

}

/**
 * UTC bounds for a trailing window of N days ending at $ref_date (exclusive).
 *
 * Used by repeat-metrics (90-day window) and run-rate (14-day baseline).
 * The window is `[ref_date - days, ref_date+1)` in local time, converted
 * to UTC. $days=14 + ref_date='2026-04-23' produces a 14-day window that
 * covers 2026-04-09..2026-04-22 local, inclusive.
 *
 * @param string $ref_date Local reference date (YYYY-MM-DD).
 * @param int    $days     Window length in days (must be >= 1).
 * @param string $offset   Numeric offset from kmn_revenue_get_utc_offset().
 * @return array{0:string,1:string} [start_utc, end_utc].
 */
function kmn_revenue_utc_bounds_for_window( string $ref_date, int $days, string $offset ): array {

    $days = max( 1, $days );

    list( , $end_utc ) = kmn_revenue_utc_bounds_for_date( $ref_date, $offset );

    $ref_local = DateTimeImmutable::createFromFormat(
        'Y-m-d H:i:sP',
        $ref_date . ' 00:00:00' . $offset
    );

    if ( false === $ref_local ) {
        $ref_local = new DateTimeImmutable( $ref_date . ' 00:00:00', new DateTimeZone( 'UTC' ) );
    }

    $start_local = $ref_local->modify( sprintf( '-%d days', $days ) );
    $start_utc   = $start_local->setTimezone( new DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );

    return [ $start_utc, $end_utc ];

}

/**
 * Set MySQL per-query time budget for the current session.
 *
 * Wraps $wpdb->query( "SET SESSION MAX_EXECUTION_TIME=..." ) so every
 * ability can enforce ABIL-QA-03's 2-second SLA before firing its heavy
 * aggregation. MySQL 8.0+ syntax; not supported on MariaDB (documented
 * in CLAUDE-level architecture notes).
 *
 * Safe to call multiple times per request — it is cheap and scoped to
 * the current DB connection.
 *
 * @param int $ms Milliseconds. Defaults to 2000 (= ABIL-QA-03 budget).
 * @return void
 */
function kmn_revenue_set_query_timeout_ms( int $ms = 2000 ): void {

    global $wpdb;

    $ms = max( 1, $ms );

    // SET SESSION statements cannot be prepared with placeholders on
    // every MySQL build; cast and interpolate an int literal. $ms is
    // clamped to a positive int so no injection surface exists.
    $wpdb->query( sprintf( 'SET SESSION MAX_EXECUTION_TIME=%d', $ms ) );

}
