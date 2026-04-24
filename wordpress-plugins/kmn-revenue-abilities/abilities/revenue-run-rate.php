<?php
/**
 * Ability: kmn/revenue-run-rate
 *
 * Intra-day revenue pace + end-of-day projection for the reference date,
 * driven by a trailing baseline of 7..56 days (default 14). The baseline
 * is built by grouping wc_order_stats in the store's local timezone and
 * computing a per-hour prefix-sum curve; the projection applies the
 * baseline's hour/day ratio to today's actual_now.
 *
 * Edge cases (branching explicitly per WP_BRIDGE §4a / RESEARCH §D3):
 * 1. < 5 valid baseline days → confidence=low, projection=null.
 * 2. current_hour == 0        → not enough intra-day signal to extrapolate.
 * 3. expected_by_hour[h] < 5.0 € → fall back to 7-day same-hour/end-of-day
 *    ratio; confidence=medium on success, low otherwise.
 * 4. Happy path                → confidence=high.
 *
 * Payment split: sourced from wc_orders.payment_method TOP-LEVEL COLUMN
 * (RESEARCH §C5 correction). NO wc_orders_meta lookup. NULL / '' payment
 * methods bucket as 'other'.
 *
 * Cache TTL: KMN_REVENUE_TTL_RUN_RATE (5 min) — intra-day churn.
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
        'kmn/revenue-run-rate',
        [
            'label'       => 'Revenue Run-Rate',
            'description' => 'Today\'s revenue so far plus an end-of-day projection built from a 7..56 day hourly baseline. '
                           . 'Includes pace vs the trailing 7-day average, same-hour-last-week scalar, and payment-method '
                           . 'split sourced from wc_orders.payment_method. confidence enum indicates projection reliability.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest'  => true,
                'mcp'           => [ 'public' => true ],
                'feature_group' => 'revenue_analytics',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'baseline_days' => [
                        'type'        => 'integer',
                        'minimum'     => 7,
                        'maximum'     => 56,
                        'description' => 'Days of baseline history for the hourly curve. Default 14.',
                    ],
                    'timezone' => [
                        'type'        => 'string',
                        'description' => 'IANA timezone name or numeric offset. Defaults to wp_timezone().',
                    ],
                    'reference_date' => [
                        'type'        => 'string',
                        'pattern'     => '^\\d{4}-\\d{2}-\\d{2}$',
                        'description' => 'Date the projection is for (YYYY-MM-DD) in the resolved timezone. Defaults to today.',
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
                    'actual_now'          => [ 'type' => 'number' ],
                    'current_hour'        => [ 'type' => 'integer', 'minimum' => 0, 'maximum' => 23 ],
                    'expected_by_hour'    => [
                        'type'  => 'array',
                        'items' => [ 'type' => 'number' ],
                    ],
                    'projection'          => [ 'type' => [ 'number', 'null' ] ],
                    'pace_vs_7day_pct'    => [ 'type' => 'number' ],
                    'same_hour_last_week' => [ 'type' => 'number' ],
                    'payment_split'       => [
                        'type'  => 'array',
                        'items' => [
                            'type'       => 'object',
                            'properties' => [
                                'method' => [ 'type' => 'string' ],
                                'total'  => [ 'type' => 'number' ],
                                'pct'    => [ 'type' => 'number' ],
                            ],
                        ],
                    ],
                    'confidence'          => [ 'type' => 'string', 'enum' => [ 'high', 'medium', 'low' ] ],
                    'currency'            => [ 'type' => 'string' ],
                    'calculated_at'       => [ 'type' => 'string' ],
                ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_orders' ) ) {
                    return kmn_revenue_response( false, [], 'WooCommerce is not active.' );
                }

                try {
                    $skip_cache = ! empty( $input['_skip_cache'] );
                    $key        = kmn_revenue_cache_key( 'kmn/revenue-run-rate', $input );

                    return kmn_revenue_cached(
                        $key,
                        KMN_REVENUE_TTL_RUN_RATE,
                        function () use ( $input ) {

                            global $wpdb;

                            kmn_revenue_set_query_timeout_ms( 2000 );

                            $baseline_days = max( 7, min( 56, (int) ( $input['baseline_days'] ?? 14 ) ) );
                            $statuses      = kmn_revenue_status_whitelist( $input );
                            $offset        = kmn_revenue_resolve_tz_offset( $input );
                            $ref_date      = isset( $input['reference_date'] ) && is_string( $input['reference_date'] )
                                ? sanitize_text_field( $input['reference_date'] )
                                : current_time( 'Y-m-d' );
                            $placeholders  = kmn_revenue_prepare_in_placeholders( $statuses );
                            $currency      = function_exists( 'get_woocommerce_currency' ) ? get_woocommerce_currency() : 'EUR';

                            // 1. Baseline curve: per (local date, hour) revenue over the baseline window.
                            list( $base_start, $base_end ) = kmn_revenue_utc_bounds_for_window( $ref_date, $baseline_days, $offset );

                            // NOTE: Use s.date_created_gmt (UTC) — s.date_created is stored
                            // in site-local time at insert, which drifts under DST and across
                            // gmt_offset changes. Only _gmt is a stable UTC anchor.
                            $curve_sql = $wpdb->prepare(
                                "SELECT DATE(CONVERT_TZ(s.date_created_gmt, '+00:00', %s)) AS d,
                                        HOUR(CONVERT_TZ(s.date_created_gmt, '+00:00', %s))  AS h,
                                        COALESCE(SUM(s.net_total), 0) AS revenue
                                 FROM   {$wpdb->prefix}wc_order_stats s
                                 WHERE  s.date_created_gmt >= %s AND s.date_created_gmt < %s
                                   AND  s.status IN ($placeholders)
                                 GROUP  BY d, h
                                 ORDER  BY d, h",
                                array_merge( [ $offset, $offset, $base_start, $base_end ], $statuses )
                            );

                            $curve_rows = $wpdb->get_results( $curve_sql, ARRAY_A );

                            // Build by_day[$date][$hour] = revenue.
                            $by_day = [];
                            if ( is_array( $curve_rows ) ) {
                                foreach ( $curve_rows as $r ) {
                                    $by_day[ (string) $r['d'] ][ (int) $r['h'] ] = (float) $r['revenue'];
                                }
                            }

                            // Prefix-sum within each day → cumulative[$date][$h].
                            $cumulative = [];
                            foreach ( $by_day as $day => $hours ) {
                                $sum = 0.0;
                                for ( $h = 0; $h <= 23; $h++ ) {
                                    $sum                  += $hours[ $h ] ?? 0.0;
                                    $cumulative[ $day ][ $h ] = $sum;
                                }
                            }

                            // "Valid" = at least €5 total on that day (filter out accidental test/draft days).
                            $expected_by_hour = array_fill( 0, 24, 0.0 );
                            $valid_days       = [];
                            foreach ( $cumulative as $day => $hours ) {
                                if ( ( $hours[23] ?? 0.0 ) >= 5.0 ) {
                                    $valid_days[] = $day;
                                    for ( $h = 0; $h <= 23; $h++ ) {
                                        $expected_by_hour[ $h ] += $hours[ $h ] ?? 0.0;
                                    }
                                }
                            }
                            $valid_count = count( $valid_days );
                            if ( $valid_count > 0 ) {
                                for ( $h = 0; $h <= 23; $h++ ) {
                                    $expected_by_hour[ $h ] = round( $expected_by_hour[ $h ] / $valid_count, 2 );
                                }
                            }

                            // Sort valid_days ascending for deterministic "trailing 7" slicing.
                            sort( $valid_days );

                            // 2. Today's actual + current_hour.
                            list( $today_start, $today_end ) = kmn_revenue_utc_bounds_for_date( $ref_date, $offset );

                            $actual_sql = $wpdb->prepare(
                                "SELECT COALESCE(SUM(s.net_total), 0) AS total
                                 FROM   {$wpdb->prefix}wc_order_stats s
                                 WHERE  s.date_created_gmt >= %s AND s.date_created_gmt < %s
                                   AND  s.status IN ($placeholders)",
                                array_merge( [ $today_start, $today_end ], $statuses )
                            );
                            $actual_now = (float) $wpdb->get_var( $actual_sql );

                            $now_local    = new DateTimeImmutable( 'now', new DateTimeZone( $offset ) );
                            $current_hour = ( $ref_date === $now_local->format( 'Y-m-d' ) )
                                ? (int) $now_local->format( 'H' )
                                : 23;

                            // 3. Payment split from wc_orders.payment_method (top-level column).
                            $payment_sql = $wpdb->prepare(
                                "SELECT COALESCE(NULLIF(o.payment_method, ''), 'other') AS method,
                                        COALESCE(SUM(s.net_total), 0)                   AS total
                                 FROM   {$wpdb->prefix}wc_order_stats s
                                 JOIN   {$wpdb->prefix}wc_orders o ON s.order_id = o.id
                                 WHERE  s.date_created_gmt >= %s AND s.date_created_gmt < %s
                                   AND  s.status IN ($placeholders)
                                 GROUP  BY method
                                 ORDER  BY total DESC",
                                array_merge( [ $today_start, $today_end ], $statuses )
                            );
                            $payment_rows = $wpdb->get_results( $payment_sql, ARRAY_A );

                            $payment_total = 0.0;
                            if ( is_array( $payment_rows ) ) {
                                foreach ( $payment_rows as $r ) {
                                    $payment_total += (float) $r['total'];
                                }
                            }

                            $payment_split = [];
                            if ( is_array( $payment_rows ) ) {
                                foreach ( $payment_rows as $r ) {
                                    $total_val       = (float) $r['total'];
                                    $payment_split[] = [
                                        'method' => (string) $r['method'],
                                        'total'  => $total_val,
                                        'pct'    => $payment_total > 0 ? round( $total_val / $payment_total * 100, 1 ) : 0.0,
                                    ];
                                }
                            }

                            // 4. Projection / confidence branching.
                            $projection = null;
                            $confidence = 'low';

                            if ( $valid_count < 5 ) {
                                // Sparse baseline.
                                $projection = null;
                                $confidence = 'low';
                            } elseif ( 0 === $current_hour ) {
                                // Nothing to extrapolate from.
                                $projection = null;
                                $confidence = 'low';
                            } elseif ( ( $expected_by_hour[ $current_hour ] ?? 0.0 ) < 5.0 ) {
                                // Fallback: trailing-7-day ratio of EOD / same-hour cumulative.
                                $seven = array_slice( $valid_days, -7 );
                                $sh_sum  = 0.0;
                                $eod_sum = 0.0;
                                $n       = 0;
                                foreach ( $seven as $day ) {
                                    $sh  = $cumulative[ $day ][ $current_hour ] ?? 0.0;
                                    $eod = $cumulative[ $day ][23]                ?? 0.0;
                                    if ( $sh > 0 ) {
                                        $sh_sum  += $sh;
                                        $eod_sum += $eod;
                                        $n++;
                                    }
                                }
                                if ( $n > 0 && $sh_sum > 0 ) {
                                    $projection = round( $actual_now * ( $eod_sum / $sh_sum ), 2 );
                                    $confidence = 'medium';
                                } else {
                                    $projection = null;
                                    $confidence = 'low';
                                }
                            } else {
                                // Happy path.
                                $projection = round(
                                    $actual_now / $expected_by_hour[ $current_hour ] * $expected_by_hour[23],
                                    2
                                );
                                $confidence = 'high';
                            }

                            // 5. Pace vs trailing 7-day same-hour average.
                            $seven          = array_slice( $valid_days, -7 );
                            $sh_vals        = [];
                            foreach ( $seven as $day ) {
                                $sh_vals[] = $cumulative[ $day ][ $current_hour ] ?? 0.0;
                            }
                            $sh_avg = count( $sh_vals ) > 0
                                ? array_sum( $sh_vals ) / count( $sh_vals )
                                : 0.0;
                            $pace_vs_7day_pct = $sh_avg > 0
                                ? round( ( $actual_now / $sh_avg - 1 ) * 100, 1 )
                                : 0.0;

                            // 6. same_hour_last_week scalar: exact -7 days same hour.
                            $last_week_date = ( new DateTimeImmutable( $ref_date ) )
                                ->modify( '-7 days' )
                                ->format( 'Y-m-d' );
                            $same_hour_last_week = (float) ( $cumulative[ $last_week_date ][ $current_hour ] ?? 0.0 );

                            return kmn_revenue_response(
                                true,
                                [
                                    'actual_now'          => round( $actual_now, 2 ),
                                    'current_hour'        => $current_hour,
                                    'expected_by_hour'    => array_values( $expected_by_hour ),
                                    'projection'          => $projection,
                                    'pace_vs_7day_pct'    => $pace_vs_7day_pct,
                                    'same_hour_last_week' => round( $same_hour_last_week, 2 ),
                                    'payment_split'       => $payment_split,
                                    'confidence'          => $confidence,
                                    'currency'            => $currency,
                                    'calculated_at'       => gmdate( 'c' ),
                                ]
                            );
                        },
                        $skip_cache
                    );
                } catch ( \Throwable $e ) {
                    return kmn_revenue_response( false, [], 'kmn/revenue-run-rate failed: ' . $e->getMessage() );
                }

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },
        ]
    );

} );
