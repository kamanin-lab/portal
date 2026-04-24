<?php
/**
 * Ability: kmn/weekly-heatmap
 *
 * Aggregates paid orders into a 7 × 24 cell matrix (day-of-week × hour)
 * over a trailing window of 4..52 weeks, plus a best_slot pick (cell with
 * the highest order_count; deterministic tie-break by dow ASC, hod ASC).
 *
 * Timezone: query groups on CONVERT_TZ('+00:00', $offset) so bucketing
 * reflects the store's local week even though wc_order_stats.date_created
 * is stored UTC. Numeric offset is resolved in PHP (kmn_revenue_get_utc_offset).
 *
 * MySQL DAYOFWEEK: 1=Sunday..7=Saturday. We subtract 1 so 0=Sunday..6=Saturday
 * matching the WP_BRIDGE_ARCHITECTURE.md §4b output schema.
 *
 * Cache TTL: KMN_REVENUE_TTL_DEFAULT (15 min) — data is not intra-day sensitive.
 *
 * @package KMN_Revenue_Abilities
 * @since   0.5.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'kmn/weekly-heatmap',
        [
            'label'       => 'Weekly Order Heatmap',
            'description' => 'Order counts and net revenue per (day-of-week, hour-of-day) bucket over a trailing window of weeks. '
                           . 'Returns a 7×24 matrix plus the best_slot (cell with the highest order_count). '
                           . 'Used to identify peak traffic windows for campaign timing.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest'  => true,
                'mcp'           => [ 'public' => true ],
                'feature_group' => 'revenue_analytics',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'weeks' => [
                        'type'        => 'integer',
                        'enum'        => [ 4, 8, 12, 26, 52 ],
                        'description' => 'Trailing window length in weeks. Default 8.',
                    ],
                    'timezone' => [
                        'type'        => 'string',
                        'description' => 'IANA timezone name or numeric offset. Defaults to wp_timezone().',
                    ],
                    'reference_date' => [
                        'type'        => 'string',
                        'pattern'     => '^\\d{4}-\\d{2}-\\d{2}$',
                        'description' => 'Window end date (YYYY-MM-DD, inclusive) in the resolved timezone. Defaults to today.',
                    ],
                    'status' => [
                        'type'        => 'array',
                        'items'       => [ 'type' => 'string' ],
                        'description' => 'WooCommerce order statuses to include. Default ["wc-completed","wc-processing"].',
                    ],
                    '_skip_cache' => [
                        'type'        => 'boolean',
                        'description' => 'Debug: bypass the transient cache for this call.',
                    ],
                ],
                'required' => [],
            ],

            'output_schema' => [
                'type'       => 'object',
                'properties' => [
                    'window_weeks'  => [ 'type' => 'integer' ],
                    'timezone'      => [ 'type' => 'string' ],
                    'buckets'       => [
                        'type'  => 'array',
                        'items' => [
                            'type'       => 'object',
                            'properties' => [
                                'day_of_week' => [ 'type' => 'integer', 'minimum' => 0, 'maximum' => 6 ],
                                'hour_of_day' => [ 'type' => 'integer', 'minimum' => 0, 'maximum' => 23 ],
                                'order_count' => [ 'type' => 'integer' ],
                                'net_revenue' => [ 'type' => 'number' ],
                            ],
                        ],
                    ],
                    'best_slot'     => [
                        'type'       => [ 'object', 'null' ],
                        'properties' => [
                            'day_of_week' => [ 'type' => 'integer' ],
                            'hour_of_day' => [ 'type' => 'integer' ],
                            'order_count' => [ 'type' => 'integer' ],
                        ],
                    ],
                    'calculated_at' => [ 'type' => 'string' ],
                ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_orders' ) ) {
                    return kmn_revenue_response( false, [], 'WooCommerce is not active.' );
                }

                try {
                    $skip_cache = ! empty( $input['_skip_cache'] );
                    $key        = kmn_revenue_cache_key( 'kmn/weekly-heatmap', $input );

                    return kmn_revenue_cached(
                        $key,
                        KMN_REVENUE_TTL_DEFAULT,
                        function () use ( $input ) {

                            global $wpdb;

                            kmn_revenue_set_query_timeout_ms( 2000 );

                            $allowed_weeks = [ 4, 8, 12, 26, 52 ];
                            $weeks_in      = (int) ( $input['weeks'] ?? 8 );
                            $weeks         = in_array( $weeks_in, $allowed_weeks, true ) ? $weeks_in : 8;

                            $statuses = kmn_revenue_status_whitelist( $input );
                            $offset   = kmn_revenue_resolve_tz_offset( $input );
                            $ref_date = isset( $input['reference_date'] ) && is_string( $input['reference_date'] )
                                ? sanitize_text_field( $input['reference_date'] )
                                : current_time( 'Y-m-d' );

                            list( $start, $end ) = kmn_revenue_utc_bounds_for_window( $ref_date, $weeks * 7, $offset );
                            $placeholders        = kmn_revenue_prepare_in_placeholders( $statuses );

                            $sql = $wpdb->prepare(
                                "SELECT (DAYOFWEEK(CONVERT_TZ(s.date_created, '+00:00', %s)) - 1) AS dow,
                                        HOUR(CONVERT_TZ(s.date_created, '+00:00', %s))              AS hod,
                                        COUNT(*)                                                    AS order_count,
                                        COALESCE(SUM(s.net_total), 0)                               AS net_revenue
                                 FROM   {$wpdb->prefix}wc_order_stats s
                                 WHERE  s.date_created >= %s AND s.date_created < %s
                                   AND  s.status IN ($placeholders)
                                 GROUP  BY dow, hod
                                 ORDER  BY dow, hod",
                                array_merge( [ $offset, $offset, $start, $end ], $statuses )
                            );

                            $rows = $wpdb->get_results( $sql, ARRAY_A );

                            $buckets = [];
                            if ( is_array( $rows ) ) {
                                foreach ( $rows as $r ) {
                                    $buckets[] = [
                                        'day_of_week' => (int) $r['dow'],
                                        'hour_of_day' => (int) $r['hod'],
                                        'order_count' => (int) $r['order_count'],
                                        'net_revenue' => (float) $r['net_revenue'],
                                    ];
                                }
                            }

                            // best_slot: cell with the highest order_count; tie-break (dow ASC, hod ASC).
                            $best = null;
                            foreach ( $buckets as $b ) {
                                if ( null === $best ) {
                                    $best = $b;
                                    continue;
                                }

                                if ( $b['order_count'] > $best['order_count'] ) {
                                    $best = $b;
                                } elseif ( $b['order_count'] === $best['order_count'] ) {
                                    if ( $b['day_of_week'] < $best['day_of_week']
                                         || ( $b['day_of_week'] === $best['day_of_week'] && $b['hour_of_day'] < $best['hour_of_day'] ) ) {
                                        $best = $b;
                                    }
                                }
                            }

                            return kmn_revenue_response(
                                true,
                                [
                                    'window_weeks'  => $weeks,
                                    'timezone'      => $offset,
                                    'buckets'       => $buckets,
                                    'best_slot'     => $best ? [
                                        'day_of_week' => $best['day_of_week'],
                                        'hour_of_day' => $best['hour_of_day'],
                                        'order_count' => $best['order_count'],
                                    ] : null,
                                    'calculated_at' => gmdate( 'c' ),
                                ]
                            );
                        },
                        $skip_cache
                    );
                } catch ( \Throwable $e ) {
                    return kmn_revenue_response( false, [], 'kmn/weekly-heatmap failed: ' . $e->getMessage() );
                }

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },
        ]
    );

} );
