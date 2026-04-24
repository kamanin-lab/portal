<?php
/**
 * Ability: kmn/repeat-metrics
 *
 * Returns repeat-purchase metrics over a trailing window of 30..730 days,
 * computed by grouping wc_order_stats rows by the JOINed wc_orders.billing_email.
 *
 * Why email-join: wc_order_stats has a `returning_customer` tinyint, but
 * Phase 15 validated it is unreliable (5.8% vs. the correct 20.1%
 * email-join result on seeded data). Guest checkouts create new customer_id
 * rows even for identical emails. The email join is the source of truth.
 * See RESEARCH.md §C1 + §D1.
 *
 * Output fields beyond the raw counts:
 * - median_days_to_2nd: days between first and second order per email
 *   (emails with ≥2 orders in window). Computed with MySQL 8.0 window
 *   function ROW_NUMBER() then median in PHP over ~O(hundreds) of rows.
 * - trend_pp: percentage-point delta vs the prior window of the same length.
 * - benchmark_pct: hardcoded 27.0 — industry KMN reference for furniture e-com.
 *
 * Cache TTL: KMN_REVENUE_TTL_REPEAT (1 hour) at outer level. Inner window
 * computations hit the DB twice (current + prior) within that single call.
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
        'kmn/repeat-metrics',
        [
            'label'       => 'Repeat Purchase Metrics',
            'description' => 'Repeat-purchase rate, unique customers, new vs returning counts, median days to second order, and '
                           . 'trend vs the prior window. Groups by wc_orders.billing_email (NOT wc_order_stats.returning_customer) '
                           . 'to correctly attribute guest-checkout repeats. Window 30..730 days, default 90.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest'  => true,
                'mcp'           => [ 'public' => true ],
                'feature_group' => 'revenue_analytics',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'days' => [
                        'type'        => 'integer',
                        'minimum'     => 30,
                        'maximum'     => 730,
                        'description' => 'Window length in days. Default 90.',
                    ],
                    'reference_date' => [
                        'type'        => 'string',
                        'pattern'     => '^\\d{4}-\\d{2}-\\d{2}$',
                        'description' => 'Window end date (YYYY-MM-DD, inclusive) in the resolved timezone. Defaults to today.',
                    ],
                    'timezone' => [
                        'type'        => 'string',
                        'description' => 'IANA timezone name or numeric offset. Defaults to wp_timezone().',
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
                    'window_days'         => [ 'type' => 'integer' ],
                    'window_start'        => [ 'type' => 'string' ],
                    'window_end'          => [ 'type' => 'string' ],
                    'total_orders'        => [ 'type' => 'integer' ],
                    'unique_customers'    => [ 'type' => 'integer' ],
                    'new_customers'       => [ 'type' => 'integer' ],
                    'returning_customers' => [ 'type' => 'integer' ],
                    'repeat_rate_pct'     => [ 'type' => 'number' ],
                    'median_days_to_2nd'  => [ 'type' => [ 'number', 'null' ] ],
                    'trend_pp'            => [ 'type' => 'number' ],
                    'benchmark_pct'       => [ 'type' => 'number' ],
                    'calculated_at'       => [ 'type' => 'string' ],
                ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_orders' ) ) {
                    return kmn_revenue_response( false, [], 'WooCommerce is not active.' );
                }

                try {
                    $skip_cache = ! empty( $input['_skip_cache'] );
                    $key        = kmn_revenue_cache_key( 'kmn/repeat-metrics', $input );

                    return kmn_revenue_cached(
                        $key,
                        KMN_REVENUE_TTL_REPEAT,
                        function () use ( $input ) {

                            global $wpdb;

                            kmn_revenue_set_query_timeout_ms( 2000 );

                            $days     = max( 30, min( 730, (int) ( $input['days'] ?? 90 ) ) );
                            $statuses = kmn_revenue_status_whitelist( $input );
                            $offset   = kmn_revenue_resolve_tz_offset( $input );
                            $ref_date = isset( $input['reference_date'] ) && is_string( $input['reference_date'] )
                                ? sanitize_text_field( $input['reference_date'] )
                                : current_time( 'Y-m-d' );

                            // Current window: [ref_date - days, ref_date+1).
                            list( $cur_start, $cur_end ) = kmn_revenue_utc_bounds_for_window( $ref_date, $days, $offset );

                            // Prior window of the same length, ending where the current begins.
                            list( $prior_start, ) = kmn_revenue_utc_bounds_for_window( $ref_date, $days * 2, $offset );
                            $prior_end            = $cur_start;

                            // Compute a per-window repeat aggregate — one $wpdb->prepare() call per window.
                            $compute = function ( $window_start, $window_end ) use ( $wpdb, $statuses ) {

                                $placeholders = kmn_revenue_prepare_in_placeholders( $statuses );

                                $sql = $wpdb->prepare(
                                    "SELECT o.billing_email, COUNT(*) AS cnt
                                     FROM   {$wpdb->prefix}wc_order_stats s
                                     JOIN   {$wpdb->prefix}wc_orders o ON s.order_id = o.id
                                     WHERE  s.date_created >= %s AND s.date_created < %s
                                       AND  s.status IN ($placeholders)
                                       AND  o.billing_email IS NOT NULL
                                       AND  o.billing_email <> ''
                                     GROUP  BY o.billing_email",
                                    array_merge( [ $window_start, $window_end ], $statuses )
                                );

                                $rows = $wpdb->get_results( $sql, ARRAY_A );

                                $total_orders = 0;
                                $unique       = 0;
                                $returning    = 0;

                                if ( is_array( $rows ) ) {
                                    foreach ( $rows as $r ) {
                                        $cnt = (int) $r['cnt'];
                                        $total_orders += $cnt;
                                        $unique++;
                                        if ( $cnt >= 2 ) {
                                            $returning++;
                                        }
                                    }
                                }

                                $new             = $unique - $returning;
                                $repeat_rate_pct = $unique > 0
                                    ? round( $returning / $unique * 100, 2 )
                                    : 0.0;

                                return [
                                    'total_orders'        => $total_orders,
                                    'unique_customers'    => $unique,
                                    'new_customers'       => $new,
                                    'returning_customers' => $returning,
                                    'repeat_rate_pct'     => $repeat_rate_pct,
                                ];

                            };

                            $current  = $compute( $cur_start, $cur_end );
                            $previous = $compute( $prior_start, $prior_end );

                            $trend_pp = round( $current['repeat_rate_pct'] - $previous['repeat_rate_pct'], 2 );

                            // Median days-to-2nd-order: window function then PHP-side median.
                            // Restricted to the CURRENT window only — trend calcs only need repeat-rate.
                            $placeholders = kmn_revenue_prepare_in_placeholders( $statuses );
                            $median_sql   = $wpdb->prepare(
                                "SELECT DATEDIFF(pairs.second_date, pairs.first_date) AS days_diff
                                 FROM (
                                     SELECT t.billing_email,
                                            MIN(CASE WHEN t.rn = 1 THEN t.date_created END) AS first_date,
                                            MIN(CASE WHEN t.rn = 2 THEN t.date_created END) AS second_date
                                     FROM (
                                         SELECT o.billing_email, s.date_created,
                                                ROW_NUMBER() OVER (
                                                    PARTITION BY o.billing_email
                                                    ORDER BY s.date_created
                                                ) AS rn
                                         FROM   {$wpdb->prefix}wc_order_stats s
                                         JOIN   {$wpdb->prefix}wc_orders o ON s.order_id = o.id
                                         WHERE  s.date_created >= %s AND s.date_created < %s
                                           AND  s.status IN ($placeholders)
                                           AND  o.billing_email IS NOT NULL
                                           AND  o.billing_email <> ''
                                     ) t
                                     GROUP BY t.billing_email
                                     HAVING second_date IS NOT NULL
                                 ) pairs",
                                array_merge( [ $cur_start, $cur_end ], $statuses )
                            );

                            $diffs  = $wpdb->get_col( $median_sql );
                            $median = null;
                            if ( is_array( $diffs ) && count( $diffs ) > 0 ) {
                                $diffs_num = array_map( 'intval', $diffs );
                                sort( $diffs_num, SORT_NUMERIC );
                                $median = (float) $diffs_num[ intval( count( $diffs_num ) / 2 ) ];
                            }

                            return kmn_revenue_response(
                                true,
                                [
                                    'window_days'         => $days,
                                    'window_start'        => $cur_start,
                                    'window_end'          => $cur_end,
                                    'total_orders'        => $current['total_orders'],
                                    'unique_customers'    => $current['unique_customers'],
                                    'new_customers'       => $current['new_customers'],
                                    'returning_customers' => $current['returning_customers'],
                                    'repeat_rate_pct'     => $current['repeat_rate_pct'],
                                    'median_days_to_2nd'  => $median,
                                    'trend_pp'            => $trend_pp,
                                    'benchmark_pct'       => 27.0,
                                    'calculated_at'       => gmdate( 'c' ),
                                ]
                            );
                        },
                        $skip_cache
                    );
                } catch ( \Throwable $e ) {
                    return kmn_revenue_response( false, [], 'kmn/repeat-metrics failed: ' . $e->getMessage() );
                }

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },
        ]
    );

} );
