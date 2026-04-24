<?php
/**
 * Standardised response envelope for every kmn-revenue ability.
 *
 * Forked from maxi-ai's maxi_ai_response() minus the operator-notes /
 * knowledge-notes revision metadata (Maxi-specific signalling that has
 * no meaning in a revenue-analytics plugin).
 *
 * @package KMN_Revenue_Abilities
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Build the canonical response array for an ability.
 *
 * Every ability returns the same envelope so the downstream MCP client
 * (kamanda-mcp) can decode responses uniformly. On failure the raw error
 * is written to the PHP error log server-side for debugging while the
 * returned string is suitable for the agent.
 *
 * @param bool        $success    Whether the call produced valid data.
 * @param array       $data       Payload. Coerced to [] if not an array.
 * @param string|null $error      Error message (null on success).
 * @param array       $extra_meta Optional additional meta fields merged
 *                                into the `_meta` key (e.g. cache_hit,
 *                                calculated_window).
 * @return array{success:bool,data:array,error:string|null,_meta:array}
 */
function kmn_revenue_response( bool $success, array $data = [], ?string $error = null, array $extra_meta = [] ): array {

    if ( ! $success && $error ) {
        error_log( sprintf( '[kmn-revenue-abilities] %s', $error ) );
    }

    return [
        'success' => (bool) $success,
        'data'    => $data,
        'error'   => $error ? (string) $error : null,
        '_meta'   => array_merge(
            [
                'plugin'        => 'kmn-revenue-abilities',
                'version'       => defined( 'KMN_Revenue_Abilities::VERSION' ) ? KMN_Revenue_Abilities::VERSION : '0.0.0',
                'calculated_at' => gmdate( 'c' ),
            ],
            $extra_meta
        ),
    ];

}
