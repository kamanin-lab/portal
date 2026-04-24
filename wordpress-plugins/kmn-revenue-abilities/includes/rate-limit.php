<?php
/**
 * Per-user rate limiter — **DEFERRED to v3.1**.
 *
 * MCP Adapter v0.5.0 does not provide rate-limit middleware (verified in
 * Phase 16 research §B6). This file exists as a named stub so turning it
 * on later is a single-line flip: uncomment the body and wire the call
 * from each ability's execute_callback.
 *
 * Why not now? Call volume is 1 human per 15 minutes via transient cache
 * on the portal side; nowhere near a limit threshold. A reverse-proxy
 * layer (Cloudflare / nginx) is the better long-term home for this.
 *
 * @package KMN_Revenue_Abilities
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Check — and optionally increment — a per-user call counter.
 *
 * STUB: currently returns true unconditionally. Body commented out below.
 * Activate in v3.1 once we have real call-volume evidence.
 *
 * @param string $ability_id Ability slug being called.
 * @param int    $limit      Max calls within the window.
 * @param int    $window_s   Window length in seconds.
 * @return bool True if the call should proceed (i.e. under limit).
 */
function kmn_revenue_rate_limit_check( string $ability_id, int $limit = 60, int $window_s = 60 ): bool {

    // TODO(v3.1): activate the transient-backed counter below once we
    // have evidence of call volume justifying it.
    //
    // $user_id = get_current_user_id();
    // if ( $user_id <= 0 ) {
    //     return true; // unauthenticated calls are already gated by auth layer
    // }
    //
    // $key     = sprintf( 'kmn_rl_%d_%s', $user_id, md5( $ability_id ) );
    // $current = (int) get_transient( $key );
    //
    // if ( $current >= $limit ) {
    //     return false;
    // }
    //
    // set_transient( $key, $current + 1, $window_s );
    // return true;

    return true;

}
