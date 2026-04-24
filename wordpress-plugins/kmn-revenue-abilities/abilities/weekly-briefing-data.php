<?php
/**
 * Ability: kmn/weekly-briefing-data
 *
 * Combined payload for the Monday 08:00 briefing email (Phase 20 consumer).
 * Aggregates four independent signals into a single response:
 *
 *   1. last_week_summary — revenue_total, order_count, aov, vs_prior_week_pct
 *      (Monday..Sunday of the week preceding $reference_date, local time)
 *   2. best_slot — copy of the best_slot from kmn/weekly-heatmap (weeks=8)
 *   3. repeat_metrics — copy of kmn/repeat-metrics (days=90) minus verbose fields
 *   4. top_products_3 — top 3 products by quantity sold last week
 *
 * Orchestration rules (RESEARCH §D5 + §Q3):
 * - Sub-ability invocation uses `wp_get_ability($id)->get_callback('execute')`
 *   called directly via `call_user_func()` — this deliberately BYPASSES the
 *   wrapper `execute()` method which would re-run `permission_callback` and
 *   re-validate the input schema. The orchestrator has already passed the
 *   caller's `manage_woocommerce` check; sub-abilities are pure SQL
 *   aggregations with no privileged side effects.
 * - Fail-fast: any sub-ability returning success=false aborts the briefing
 *   with a single failure envelope. The Node-side `daily_briefing` tool in
 *   Phase 17 is responsible for the Promise.allSettled partial-failure UX.
 * - Run-rate and market-basket are NOT called here — a briefing email does
 *   not need intra-day projection or basket pairs (per RESEARCH §D5).
 *
 * Cache TTL: KMN_REVENUE_TTL_BRIEFING (5 min). Sub-abilities have their own
 * longer-lived caches (15 min / 1 h), so the orchestrator pays at most one
 * cold-miss per dependency on first call of the day and re-uses cached
 * sub-results on subsequent calls.
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
        'kmn/weekly-briefing-data',
        [
            'label'       => 'Weekly Briefing Data',
            'description' => 'Combined payload for the Monday briefing email. Aggregates last-week revenue summary, '
                           . 'best traffic slot (8-week heatmap), repeat-purchase metrics (90d), and top 3 products '
                           . 'by quantity sold last week. Orchestrates kmn/weekly-heatmap + kmn/repeat-metrics '
                           . 'in-process and adds two custom queries for last-week totals and top products.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest'  => true,
                'mcp'           => [ 'public' => true ],
                'feature_group' => 'revenue_analytics',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'reference_date' => [
                        'type'        => 'string',
                        'pattern'     => '^\\d{4}-\\d{2}-\\d{2}$',
                        'description' => 'Anchor date in the resolved timezone (YYYY-MM-DD). The briefing covers the '
                                       . 'Mon..Sun week preceding this date. Defaults to today.',
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
                    'last_week_summary' => [
                        'type'       => 'object',
                        'properties' => [
                            'week_start'        => [ 'type' => 'string' ],
                            'week_end'          => [ 'type' => 'string' ],
                            'revenue_total'     => [ 'type' => 'number' ],
                            'order_count'       => [ 'type' => 'integer' ],
                            'aov'               => [ 'type' => 'number' ],
                            'vs_prior_week_pct' => [ 'type' => 'number' ],
                        ],
                    ],
                    'best_slot' => [
                        'type'       => [ 'object', 'null' ],
                        'properties' => [
                            'day_of_week' => [ 'type' => 'integer' ],
                            'hour_of_day' => [ 'type' => 'integer' ],
                            'order_count' => [ 'type' => 'integer' ],
                        ],
                    ],
                    'repeat_metrics' => [
                        'type'       => 'object',
                        'properties' => [
                            'repeat_rate_pct'     => [ 'type' => 'number' ],
                            'total_orders'        => [ 'type' => 'integer' ],
                            'unique_customers'    => [ 'type' => 'integer' ],
                            'returning_customers' => [ 'type' => 'integer' ],
                            'median_days_to_2nd'  => [ 'type' => [ 'number', 'null' ] ],
                        ],
                    ],
                    'top_products_3' => [
                        'type'  => 'array',
                        'items' => [
                            'type'       => 'object',
                            'properties' => [
                                'product_id' => [ 'type' => 'integer' ],
                                'name'       => [ 'type' => 'string' ],
                                'qty_sold'   => [ 'type' => 'integer' ],
                            ],
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
                    $key        = kmn_revenue_cache_key( 'kmn/weekly-briefing-data', $input );

                    return kmn_revenue_cached(
                        $key,
                        KMN_REVENUE_TTL_BRIEFING,
                        function () use ( $input ) {

                            global $wpdb;

                            // ABIL-QA-03: 2-second budget at the orchestrator level.
                            // Sub-abilities set their own session timeout on each call;
                            // the last one wins. This call re-asserts the budget for
                            // the two custom queries below.
                            kmn_revenue_set_query_timeout_ms( 2000 );

                            $offset   = kmn_revenue_resolve_tz_offset( $input );
                            $ref_date = isset( $input['reference_date'] ) && is_string( $input['reference_date'] )
                                ? sanitize_text_field( $input['reference_date'] )
                                : current_time( 'Y-m-d' );

                            $statuses     = kmn_revenue_status_whitelist( $input );
                            $placeholders = kmn_revenue_prepare_in_placeholders( $statuses );

                            // ---------------------------------------------------
                            // 1. Sub-ability: kmn/weekly-heatmap (weeks=8)
                            // ---------------------------------------------------

                            $heatmap_ability = wp_get_ability( 'kmn/weekly-heatmap' );
                            if ( ! $heatmap_ability ) {
                                return kmn_revenue_response(
                                    false,
                                    [],
                                    'sub-ability kmn/weekly-heatmap not registered'
                                );
                            }

                            $heatmap_resp = call_user_func(
                                $heatmap_ability->get_callback( 'execute' ),
                                [
                                    'weeks'          => 8,
                                    'reference_date' => $ref_date,
                                    'timezone'       => $input['timezone'] ?? null,
                                ]
                            );

                            if ( empty( $heatmap_resp['success'] ) ) {
                                $err = isset( $heatmap_resp['error'] ) ? $heatmap_resp['error'] : 'unknown';
                                return kmn_revenue_response(
                                    false,
                                    [],
                                    'weekly-briefing-data sub-call failed (weekly-heatmap): ' . $err
                                );
                            }

                            $best_slot = isset( $heatmap_resp['data']['best_slot'] )
                                ? $heatmap_resp['data']['best_slot']
                                : null;

                            // ---------------------------------------------------
                            // 2. Sub-ability: kmn/repeat-metrics (days=90)
                            // ---------------------------------------------------

                            $repeat_ability = wp_get_ability( 'kmn/repeat-metrics' );
                            if ( ! $repeat_ability ) {
                                return kmn_revenue_response(
                                    false,
                                    [],
                                    'sub-ability kmn/repeat-metrics not registered'
                                );
                            }

                            $repeat_resp = call_user_func(
                                $repeat_ability->get_callback( 'execute' ),
                                [
                                    'days'           => 90,
                                    'reference_date' => $ref_date,
                                    'timezone'       => $input['timezone'] ?? null,
                                ]
                            );

                            if ( empty( $repeat_resp['success'] ) ) {
                                $err = isset( $repeat_resp['error'] ) ? $repeat_resp['error'] : 'unknown';
                                return kmn_revenue_response(
                                    false,
                                    [],
                                    'weekly-briefing-data sub-call failed (repeat-metrics): ' . $err
                                );
                            }

                            $rm          = $repeat_resp['data'];
                            $repeat_data = [
                                'repeat_rate_pct'     => isset( $rm['repeat_rate_pct'] ) ? (float) $rm['repeat_rate_pct'] : 0.0,
                                'total_orders'        => isset( $rm['total_orders'] ) ? (int) $rm['total_orders'] : 0,
                                'unique_customers'    => isset( $rm['unique_customers'] ) ? (int) $rm['unique_customers'] : 0,
                                'returning_customers' => isset( $rm['returning_customers'] ) ? (int) $rm['returning_customers'] : 0,
                                'median_days_to_2nd'  => array_key_exists( 'median_days_to_2nd', $rm ) ? $rm['median_days_to_2nd'] : null,
                            ];

                            // ---------------------------------------------------
                            // 3. Custom: last-week summary (Mon..Sun preceding ref_date)
                            // ---------------------------------------------------

                            $ref_local = DateTimeImmutable::createFromFormat(
                                'Y-m-d H:i:sP',
                                $ref_date . ' 00:00:00' . $offset
                            );
                            if ( false === $ref_local ) {
                                $ref_local = new DateTimeImmutable( $ref_date . ' 00:00:00', new DateTimeZone( 'UTC' ) );
                            }

                            // ISO-8601 day-of-week: 1=Mon..7=Sun.
                            $iso_dow         = (int) $ref_local->format( 'N' );
                            $this_monday     = $ref_local->modify( '-' . ( $iso_dow - 1 ) . ' days' );
                            $last_monday     = $this_monday->modify( '-7 days' );
                            $last_sunday_end = $this_monday;                   // exclusive upper bound == this Monday 00:00 local
                            $prior_monday    = $last_monday->modify( '-7 days' );

                            $utc              = new DateTimeZone( 'UTC' );
                            $last_start_utc   = $last_monday->setTimezone( $utc )->format( 'Y-m-d H:i:s' );
                            $last_end_utc     = $last_sunday_end->setTimezone( $utc )->format( 'Y-m-d H:i:s' );
                            $prior_start_utc  = $prior_monday->setTimezone( $utc )->format( 'Y-m-d H:i:s' );
                            $prior_end_utc    = $last_monday->setTimezone( $utc )->format( 'Y-m-d H:i:s' );

                            $week_sql = $wpdb->prepare(
                                "SELECT COUNT(*) AS cnt, COALESCE(SUM(s.net_total), 0) AS total
                                 FROM   {$wpdb->prefix}wc_order_stats s
                                 WHERE  s.date_created_gmt >= %s AND s.date_created_gmt < %s
                                   AND  s.status IN ($placeholders)",
                                array_merge( [ $last_start_utc, $last_end_utc ], $statuses )
                            );
                            $cur = $wpdb->get_row( $week_sql, ARRAY_A );

                            $prior_sql = $wpdb->prepare(
                                "SELECT COUNT(*) AS cnt, COALESCE(SUM(s.net_total), 0) AS total
                                 FROM   {$wpdb->prefix}wc_order_stats s
                                 WHERE  s.date_created_gmt >= %s AND s.date_created_gmt < %s
                                   AND  s.status IN ($placeholders)",
                                array_merge( [ $prior_start_utc, $prior_end_utc ], $statuses )
                            );
                            $prior = $wpdb->get_row( $prior_sql, ARRAY_A );

                            $cur_total   = is_array( $cur ) ? (float) $cur['total'] : 0.0;
                            $cur_count   = is_array( $cur ) ? (int) $cur['cnt']    : 0;
                            $prior_total = is_array( $prior ) ? (float) $prior['total'] : 0.0;

                            $aov      = $cur_count > 0 ? round( $cur_total / $cur_count, 2 ) : 0.0;
                            $vs_prior = $prior_total > 0 ? round( ( $cur_total / $prior_total - 1 ) * 100, 1 ) : 0.0;

                            $last_week_summary = [
                                'week_start'        => $last_monday->format( 'Y-m-d' ),
                                'week_end'          => $last_sunday_end->modify( '-1 second' )->format( 'Y-m-d' ),
                                'revenue_total'     => $cur_total,
                                'order_count'       => $cur_count,
                                'aov'               => $aov,
                                'vs_prior_week_pct' => $vs_prior,
                            ];

                            // ---------------------------------------------------
                            // 4. Custom: top 3 products by quantity sold last week
                            // ---------------------------------------------------

                            $top_sql = $wpdb->prepare(
                                "SELECT p.product_id, SUM(p.product_qty) AS qty_sold
                                 FROM   {$wpdb->prefix}wc_order_product_lookup p
                                 JOIN   {$wpdb->prefix}wc_order_stats s ON p.order_id = s.order_id
                                 WHERE  s.date_created_gmt >= %s AND s.date_created_gmt < %s
                                   AND  s.status IN ($placeholders)
                                 GROUP  BY p.product_id
                                 ORDER  BY qty_sold DESC
                                 LIMIT  3",
                                array_merge( [ $last_start_utc, $last_end_utc ], $statuses )
                            );
                            $top_rows = $wpdb->get_results( $top_sql, ARRAY_A );
                            if ( ! is_array( $top_rows ) ) {
                                $top_rows = [];
                            }

                            // Batch-load product titles via WP core get_posts(post__in=...).
                            // This is the sanctioned WP abstraction for product lookup —
                            // no hand-written JOIN to core catalog tables anywhere on this
                            // path. audit-sql.sh greps for literal table-name tokens only,
                            // so get_posts() does not trip the HPOS lint.
                            $pids  = array_map( static fn( $r ) => (int) $r['product_id'], $top_rows );
                            $names = [];
                            if ( ! empty( $pids ) ) {
                                $posts = get_posts(
                                    [
                                        'post_type'      => 'product',
                                        'post__in'       => $pids,
                                        'posts_per_page' => -1,
                                        'post_status'    => 'any',
                                        'orderby'        => 'post__in',
                                    ]
                                );
                                foreach ( $posts as $p ) {
                                    $names[ (int) $p->ID ] = (string) $p->post_title;
                                }
                            }

                            $top_products_3 = array_map(
                                static function ( $r ) use ( $names ) {
                                    $pid = (int) $r['product_id'];
                                    return [
                                        'product_id' => $pid,
                                        'name'       => isset( $names[ $pid ] ) && '' !== $names[ $pid ] ? $names[ $pid ] : '(unknown)',
                                        'qty_sold'   => (int) $r['qty_sold'],
                                    ];
                                },
                                $top_rows
                            );

                            return kmn_revenue_response(
                                true,
                                [
                                    'last_week_summary' => $last_week_summary,
                                    'best_slot'         => $best_slot,
                                    'repeat_metrics'    => $repeat_data,
                                    'top_products_3'    => $top_products_3,
                                    'calculated_at'     => gmdate( 'c' ),
                                ]
                            );
                        },
                        $skip_cache
                    );
                } catch ( \Throwable $e ) {
                    return kmn_revenue_response(
                        false,
                        [],
                        'kmn/weekly-briefing-data failed: ' . $e->getMessage()
                    );
                }

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },
        ]
    );

} );
