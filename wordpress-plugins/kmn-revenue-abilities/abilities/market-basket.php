<?php
/**
 * Ability: kmn/market-basket
 *
 * Probe-then-mode selection of basket analysis depth over a trailing
 * window of 30..365 days (default 90):
 *
 *   multi_item_orders >= 100 → mode = 'market_basket_product'
 *                              (self-join wc_order_product_lookup on
 *                               order_id with a.product_id < b.product_id)
 *   multi_item_orders >= 30  → mode = 'market_basket_category'
 *                              (self-join + term_relationships +
 *                               term_taxonomy filtered to product_cat)
 *   otherwise                 → mode = 'aov_bands' (no pairs needed)
 *
 * AOV bands are ALWAYS computed regardless of mode. avg + median order
 * value come from the same window and are returned alongside bands.
 * Median is computed PHP-side over a bounded result-set (~hundreds).
 *
 * Performance note: the product self-join is the hottest SQL in this
 * phase. kmn_revenue_set_query_timeout_ms(2000) caps it at 2s; seeded
 * DDEV measurement is ~500ms. Basket-pair enrichment (titles, support /
 * confidence / lift) uses TWO additional small queries rather than N
 * roundtrips: batched get_posts( post__in = [...ids] ) and a single
 * per-product order-count aggregate.
 *
 * Cache TTL: KMN_REVENUE_TTL_BASKET (1 hour).
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
        'kmn/market-basket',
        [
            'label'       => 'Market Basket Analysis',
            'description' => 'Cross-sell pair analysis with AOV band breakdown. Probe-then-mode: falls back from product-level to '
                           . 'category-level to AOV-only depending on multi-item order volume in window. basket_pairs expose '
                           . 'support/confidence/lift for each pair. aov_bands returned unconditionally.',
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
                        'maximum'     => 365,
                        'description' => 'Trailing window length in days. Default 90.',
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
                    'top_n' => [
                        'type'        => 'integer',
                        'minimum'     => 1,
                        'maximum'     => 10,
                        'description' => 'Maximum basket pairs returned. Default 5.',
                    ],
                    'aov_bands' => [
                        'type'        => 'array',
                        'items'       => [ 'type' => 'number' ],
                        'description' => 'Two break-point values defining three AOV bands [0,b1), [b1,b2), [b2,∞). Default [500, 1500].',
                    ],
                    'status' => [
                        'type'        => 'array',
                        'items'       => [ 'type' => 'string' ],
                        'description' => 'WooCommerce order statuses to include. Default ["wc-completed"].',
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
                    'mode'              => [ 'type' => 'string', 'enum' => [ 'market_basket_product', 'market_basket_category', 'aov_bands' ] ],
                    'multi_item_orders' => [ 'type' => 'integer' ],
                    'total_orders'      => [ 'type' => 'integer' ],
                    'basket_pairs'      => [
                        'type'  => 'array',
                        'items' => [
                            'type'       => 'object',
                            'properties' => [
                                'a_id'          => [ 'type' => 'integer' ],
                                'a_name'        => [ 'type' => 'string' ],
                                'b_id'          => [ 'type' => 'integer' ],
                                'b_name'        => [ 'type' => 'string' ],
                                'co_occurrence' => [ 'type' => 'integer' ],
                                'support_pct'   => [ 'type' => 'number' ],
                                'confidence'    => [ 'type' => 'number' ],
                                'lift'          => [ 'type' => 'number' ],
                            ],
                        ],
                    ],
                    'aov_bands' => [
                        'type'  => 'array',
                        'items' => [
                            'type'       => 'object',
                            'properties' => [
                                'label'         => [ 'type' => 'string' ],
                                'min'           => [ 'type' => 'number' ],
                                'max'           => [ 'type' => [ 'number', 'null' ] ],
                                'order_count'   => [ 'type' => 'integer' ],
                                'order_pct'     => [ 'type' => 'number' ],
                                'revenue_share' => [ 'type' => 'number' ],
                            ],
                        ],
                    ],
                    'avg_order_value'   => [ 'type' => 'number' ],
                    'median_order_value'=> [ 'type' => [ 'number', 'null' ] ],
                    'calculated_at'     => [ 'type' => 'string' ],
                ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! function_exists( 'wc_get_orders' ) ) {
                    return kmn_revenue_response( false, [], 'WooCommerce is not active.' );
                }

                try {
                    $skip_cache = ! empty( $input['_skip_cache'] );
                    $key        = kmn_revenue_cache_key( 'kmn/market-basket', $input );

                    return kmn_revenue_cached(
                        $key,
                        KMN_REVENUE_TTL_BASKET,
                        function () use ( $input ) {

                            global $wpdb;

                            kmn_revenue_set_query_timeout_ms( 2000 );

                            $days     = max( 30, min( 365, (int) ( $input['days'] ?? 90 ) ) );
                            $top_n    = max( 1, min( 10, (int) ( $input['top_n'] ?? 5 ) ) );
                            $statuses = kmn_revenue_status_whitelist( $input, [ 'wc-completed' ] );
                            $offset   = kmn_revenue_resolve_tz_offset( $input );
                            $ref_date = isset( $input['reference_date'] ) && is_string( $input['reference_date'] )
                                ? sanitize_text_field( $input['reference_date'] )
                                : current_time( 'Y-m-d' );

                            list( $start, $end ) = kmn_revenue_utc_bounds_for_window( $ref_date, $days, $offset );
                            $placeholders        = kmn_revenue_prepare_in_placeholders( $statuses );

                            // 1. Probe multi-item orders.
                            $probe_sql = $wpdb->prepare(
                                "SELECT COUNT(*)
                                 FROM   {$wpdb->prefix}wc_order_stats s
                                 WHERE  s.date_created >= %s AND s.date_created < %s
                                   AND  s.status IN ($placeholders)
                                   AND  (SELECT COUNT(*) FROM {$wpdb->prefix}wc_order_product_lookup p WHERE p.order_id = s.order_id) > 1",
                                array_merge( [ $start, $end ], $statuses )
                            );
                            $multi_item_orders = (int) $wpdb->get_var( $probe_sql );

                            // 2. Total orders in window (denominator for order_pct).
                            $total_sql = $wpdb->prepare(
                                "SELECT COUNT(*)
                                 FROM   {$wpdb->prefix}wc_order_stats s
                                 WHERE  s.date_created >= %s AND s.date_created < %s
                                   AND  s.status IN ($placeholders)",
                                array_merge( [ $start, $end ], $statuses )
                            );
                            $total_orders = (int) $wpdb->get_var( $total_sql );

                            $mode = $multi_item_orders >= 100
                                ? 'market_basket_product'
                                : ( $multi_item_orders >= 30 ? 'market_basket_category' : 'aov_bands' );

                            // 3. AOV bands (always compute).
                            $bands_input = $input['aov_bands'] ?? [ 500, 1500 ];
                            if ( ! is_array( $bands_input ) || count( $bands_input ) === 0 ) {
                                $bands_input = [ 500, 1500 ];
                            }
                            $bands_input = array_values( array_map( 'floatval', $bands_input ) );
                            sort( $bands_input, SORT_NUMERIC );
                            $b1 = (float) $bands_input[0];
                            $b2 = (float) ( $bands_input[1] ?? ( $b1 * 3 ) );
                            if ( $b2 <= $b1 ) {
                                $b2 = $b1 * 3;
                            }

                            $aov_sql = $wpdb->prepare(
                                "SELECT
                                    SUM(CASE WHEN s.total_sales < %f THEN 1 ELSE 0 END)                                        AS cnt_low,
                                    SUM(CASE WHEN s.total_sales >= %f AND s.total_sales < %f THEN 1 ELSE 0 END)               AS cnt_mid,
                                    SUM(CASE WHEN s.total_sales >= %f THEN 1 ELSE 0 END)                                      AS cnt_high,
                                    COALESCE(SUM(CASE WHEN s.total_sales < %f THEN s.total_sales ELSE 0 END), 0)              AS rev_low,
                                    COALESCE(SUM(CASE WHEN s.total_sales >= %f AND s.total_sales < %f THEN s.total_sales ELSE 0 END), 0) AS rev_mid,
                                    COALESCE(SUM(CASE WHEN s.total_sales >= %f THEN s.total_sales ELSE 0 END), 0)             AS rev_high,
                                    COALESCE(AVG(s.total_sales), 0)                                                           AS avg_val,
                                    COALESCE(SUM(s.total_sales), 0)                                                           AS rev_total,
                                    COUNT(*)                                                                                  AS order_total
                                 FROM   {$wpdb->prefix}wc_order_stats s
                                 WHERE  s.date_created >= %s AND s.date_created < %s
                                   AND  s.status IN ($placeholders)",
                                array_merge(
                                    [ $b1, $b1, $b2, $b2, $b1, $b1, $b2, $b2, $start, $end ],
                                    $statuses
                                )
                            );
                            $aov_row = $wpdb->get_row( $aov_sql, ARRAY_A );

                            $order_total = (int) ( $aov_row['order_total'] ?? 0 );
                            $rev_total   = (float) ( $aov_row['rev_total'] ?? 0 );
                            $avg_val     = (float) ( $aov_row['avg_val'] ?? 0 );

                            $aov_bands = [
                                [
                                    'label'         => 'low',
                                    'min'           => 0.0,
                                    'max'           => $b1,
                                    'order_count'   => (int) ( $aov_row['cnt_low'] ?? 0 ),
                                    'order_pct'     => $order_total > 0 ? round( (int) ( $aov_row['cnt_low'] ?? 0 ) / $order_total * 100, 1 ) : 0.0,
                                    'revenue_share' => $rev_total > 0 ? round( (float) ( $aov_row['rev_low'] ?? 0 ) / $rev_total * 100, 1 ) : 0.0,
                                ],
                                [
                                    'label'         => 'mid',
                                    'min'           => $b1,
                                    'max'           => $b2,
                                    'order_count'   => (int) ( $aov_row['cnt_mid'] ?? 0 ),
                                    'order_pct'     => $order_total > 0 ? round( (int) ( $aov_row['cnt_mid'] ?? 0 ) / $order_total * 100, 1 ) : 0.0,
                                    'revenue_share' => $rev_total > 0 ? round( (float) ( $aov_row['rev_mid'] ?? 0 ) / $rev_total * 100, 1 ) : 0.0,
                                ],
                                [
                                    'label'         => 'high',
                                    'min'           => $b2,
                                    'max'           => null,
                                    'order_count'   => (int) ( $aov_row['cnt_high'] ?? 0 ),
                                    'order_pct'     => $order_total > 0 ? round( (int) ( $aov_row['cnt_high'] ?? 0 ) / $order_total * 100, 1 ) : 0.0,
                                    'revenue_share' => $rev_total > 0 ? round( (float) ( $aov_row['rev_high'] ?? 0 ) / $rev_total * 100, 1 ) : 0.0,
                                ],
                            ];

                            // 4. Median order value — fetch sorted list, PHP-side median.
                            $sales_sql = $wpdb->prepare(
                                "SELECT s.total_sales
                                 FROM   {$wpdb->prefix}wc_order_stats s
                                 WHERE  s.date_created >= %s AND s.date_created < %s
                                   AND  s.status IN ($placeholders)
                                 ORDER  BY s.total_sales ASC",
                                array_merge( [ $start, $end ], $statuses )
                            );
                            $sales_vals = $wpdb->get_col( $sales_sql );
                            $median_val = null;
                            if ( is_array( $sales_vals ) && count( $sales_vals ) > 0 ) {
                                $sorted     = array_map( 'floatval', $sales_vals );
                                $n          = count( $sorted );
                                $median_val = ( 0 === $n % 2 )
                                    ? round( ( $sorted[ intval( $n / 2 ) - 1 ] + $sorted[ intval( $n / 2 ) ] ) / 2, 2 )
                                    : round( $sorted[ intval( $n / 2 ) ], 2 );
                            }

                            // 5. Basket pairs — only when mode != aov_bands.
                            $basket_pairs = [];

                            if ( 'market_basket_product' === $mode ) {

                                $pair_sql = $wpdb->prepare(
                                    "SELECT a.product_id AS pid_a, b.product_id AS pid_b,
                                            COUNT(DISTINCT a.order_id) AS co_occ
                                     FROM   {$wpdb->prefix}wc_order_product_lookup a
                                     JOIN   {$wpdb->prefix}wc_order_product_lookup b
                                            ON a.order_id = b.order_id
                                           AND a.product_id < b.product_id
                                     JOIN   {$wpdb->prefix}wc_order_stats s ON a.order_id = s.order_id
                                     WHERE  s.date_created >= %s AND s.date_created < %s
                                       AND  s.status IN ($placeholders)
                                     GROUP  BY pid_a, pid_b
                                     HAVING co_occ >= 2
                                     ORDER  BY co_occ DESC
                                     LIMIT  %d",
                                    array_merge( [ $start, $end ], $statuses, [ $top_n ] )
                                );
                                $raw_pairs = $wpdb->get_results( $pair_sql, ARRAY_A );

                                if ( is_array( $raw_pairs ) && count( $raw_pairs ) > 0 ) {

                                    // Batch-resolve product IDs → titles via get_posts( post__in ).
                                    $pids = array_values( array_unique( array_merge(
                                        array_map( 'intval', array_column( $raw_pairs, 'pid_a' ) ),
                                        array_map( 'intval', array_column( $raw_pairs, 'pid_b' ) )
                                    ) ) );

                                    $titles = [];
                                    if ( count( $pids ) > 0 ) {
                                        $posts = get_posts(
                                            [
                                                'post_type'      => 'product',
                                                'post__in'       => $pids,
                                                'posts_per_page' => -1,
                                                'post_status'    => 'any',
                                                'orderby'        => 'post__in',
                                                'suppress_filters' => false,
                                            ]
                                        );
                                        foreach ( $posts as $p ) {
                                            $titles[ (int) $p->ID ] = (string) $p->post_title;
                                        }
                                    }

                                    // Per-product order counts in window — one query for lift/confidence denominators.
                                    $pid_placeholders = kmn_revenue_prepare_in_placeholders( $pids );
                                    $count_sql        = $wpdb->prepare(
                                        "SELECT p.product_id, COUNT(DISTINCT p.order_id) AS orders_with
                                         FROM   {$wpdb->prefix}wc_order_product_lookup p
                                         JOIN   {$wpdb->prefix}wc_order_stats s ON p.order_id = s.order_id
                                         WHERE  s.date_created >= %s AND s.date_created < %s
                                           AND  s.status IN ($placeholders)
                                           AND  p.product_id IN ($pid_placeholders)
                                         GROUP  BY p.product_id",
                                        array_merge(
                                            [ $start, $end ],
                                            $statuses,
                                            array_map( 'intval', $pids )
                                        )
                                    );
                                    $count_rows    = $wpdb->get_results( $count_sql, ARRAY_A );
                                    $orders_with  = [];
                                    if ( is_array( $count_rows ) ) {
                                        foreach ( $count_rows as $cr ) {
                                            $orders_with[ (int) $cr['product_id'] ] = (int) $cr['orders_with'];
                                        }
                                    }

                                    foreach ( $raw_pairs as $pair ) {
                                        $pid_a = (int) $pair['pid_a'];
                                        $pid_b = (int) $pair['pid_b'];
                                        $cooc  = (int) $pair['co_occ'];

                                        $oa = $orders_with[ $pid_a ] ?? 0;
                                        $ob = $orders_with[ $pid_b ] ?? 0;

                                        $support_pct = $multi_item_orders > 0
                                            ? round( $cooc / $multi_item_orders * 100, 2 )
                                            : 0.0;
                                        $confidence  = $oa > 0 ? round( $cooc / $oa, 4 ) : 0.0;
                                        $lift        = ( $oa > 0 && $ob > 0 && $multi_item_orders > 0 )
                                            ? round( $confidence / ( $ob / $multi_item_orders ), 4 )
                                            : 0.0;

                                        $basket_pairs[] = [
                                            'a_id'          => $pid_a,
                                            'a_name'        => $titles[ $pid_a ] ?? ( 'Product #' . $pid_a ),
                                            'b_id'          => $pid_b,
                                            'b_name'        => $titles[ $pid_b ] ?? ( 'Product #' . $pid_b ),
                                            'co_occurrence' => $cooc,
                                            'support_pct'   => $support_pct,
                                            'confidence'    => $confidence,
                                            'lift'          => $lift,
                                        ];
                                    }
                                }
                            } elseif ( 'market_basket_category' === $mode ) {

                                // Category-pair mode: wp-core term tables are the authoritative taxonomy
                                // source and are NOT HPOS-scoped — these tables remain regardless of
                                // HPOS. No wp-post-body or post-meta reads anywhere on this path.
                                $cat_sql = $wpdb->prepare(
                                    "SELECT ta.term_id AS tid_a, tb.term_id AS tid_b,
                                            COUNT(DISTINCT a.order_id) AS co_occ
                                     FROM   {$wpdb->prefix}wc_order_product_lookup a
                                     JOIN   {$wpdb->prefix}wc_order_product_lookup b
                                            ON a.order_id = b.order_id
                                           AND a.product_id < b.product_id
                                     JOIN   {$wpdb->prefix}wc_order_stats s ON a.order_id = s.order_id
                                     JOIN   {$wpdb->term_relationships} tra ON tra.object_id = a.product_id
                                     JOIN   {$wpdb->term_taxonomy} tta ON tta.term_taxonomy_id = tra.term_taxonomy_id AND tta.taxonomy = 'product_cat'
                                     JOIN   {$wpdb->terms} ta ON ta.term_id = tta.term_id
                                     JOIN   {$wpdb->term_relationships} trb ON trb.object_id = b.product_id
                                     JOIN   {$wpdb->term_taxonomy} ttb ON ttb.term_taxonomy_id = trb.term_taxonomy_id AND ttb.taxonomy = 'product_cat'
                                     JOIN   {$wpdb->terms} tb ON tb.term_id = ttb.term_id
                                     WHERE  s.date_created >= %s AND s.date_created < %s
                                       AND  s.status IN ($placeholders)
                                       AND  ta.term_id < tb.term_id
                                     GROUP  BY tid_a, tid_b
                                     HAVING co_occ >= 2
                                     ORDER  BY co_occ DESC
                                     LIMIT  %d",
                                    array_merge( [ $start, $end ], $statuses, [ $top_n ] )
                                );
                                $raw_cat_pairs = $wpdb->get_results( $cat_sql, ARRAY_A );

                                if ( is_array( $raw_cat_pairs ) ) {
                                    foreach ( $raw_cat_pairs as $pair ) {
                                        $tid_a = (int) $pair['tid_a'];
                                        $tid_b = (int) $pair['tid_b'];
                                        $cooc  = (int) $pair['co_occ'];

                                        $term_a = get_term( $tid_a, 'product_cat' );
                                        $term_b = get_term( $tid_b, 'product_cat' );

                                        $basket_pairs[] = [
                                            'a_id'          => $tid_a,
                                            'a_name'        => ( $term_a && ! is_wp_error( $term_a ) ) ? $term_a->name : ( 'Category #' . $tid_a ),
                                            'b_id'          => $tid_b,
                                            'b_name'        => ( $term_b && ! is_wp_error( $term_b ) ) ? $term_b->name : ( 'Category #' . $tid_b ),
                                            'co_occurrence' => $cooc,
                                            'support_pct'   => $multi_item_orders > 0 ? round( $cooc / $multi_item_orders * 100, 2 ) : 0.0,
                                            'confidence'    => 0.0,
                                            'lift'          => 0.0,
                                        ];
                                    }
                                }
                            }

                            return kmn_revenue_response(
                                true,
                                [
                                    'mode'               => $mode,
                                    'multi_item_orders'  => $multi_item_orders,
                                    'total_orders'       => $total_orders,
                                    'basket_pairs'       => $basket_pairs,
                                    'aov_bands'          => $aov_bands,
                                    'avg_order_value'    => round( $avg_val, 2 ),
                                    'median_order_value' => $median_val,
                                    'calculated_at'      => gmdate( 'c' ),
                                ]
                            );
                        },
                        $skip_cache
                    );
                } catch ( \Throwable $e ) {
                    return kmn_revenue_response( false, [], 'kmn/market-basket failed: ' . $e->getMessage() );
                }

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },
        ]
    );

} );
