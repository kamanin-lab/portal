<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-analytics',
        [
            'label'       => 'Get Analytics',
            'description' => 'Query page view analytics from Maxi Web Analytics. '
                           . 'Supports multiple report types: "views" (total views for a post), '
                           . '"top-posts" (most viewed posts by type), "sources" (traffic sources), '
                           . '"conversions" (view-to-purchase conversion rates for WooCommerce products). '
                           . 'Requires the Maxi Web Analytics plugin to be active.',
            'category'    => 'analytics',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'report' => [
                        'type'        => 'string',
                        'enum'        => [ 'views', 'top-posts', 'sources', 'conversions' ],
                        'description' => 'Report type. "views": total views for a specific post. '
                                       . '"top-posts": most viewed posts (optionally filtered by post_type). '
                                       . '"sources": traffic sources breakdown (for a specific post or site-wide). '
                                       . '"conversions": view-to-purchase conversion rates for WooCommerce products.',
                    ],
                    'post_id' => [
                        'type'        => 'integer',
                        'description' => 'Post ID to filter by. Required for "views", optional for "sources". Ignored for "top-posts" and "conversions".',
                    ],
                    'post_type' => [
                        'type'        => 'string',
                        'description' => 'Post type to filter by. Used in "top-posts" and "conversions" reports. Defaults to "product" for "conversions".',
                    ],
                    'date_from' => [
                        'type'        => 'string',
                        'description' => 'Start date (Y-m-d). Defaults to 30 days ago.',
                    ],
                    'date_to' => [
                        'type'        => 'string',
                        'description' => 'End date (Y-m-d). Defaults to today.',
                    ],
                    'limit' => [
                        'type'        => 'integer',
                        'description' => 'Maximum number of results for "top-posts", "sources", and "conversions". Default: 20.',
                    ],
                    'group_by' => [
                        'type'        => 'string',
                        'enum'        => [ 'day', 'week', 'month', 'total' ],
                        'description' => 'Time grouping for "views" report. Default: "total".',
                    ],
                ],
                'required' => [ 'report' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'MWA_Tracker' ) ) {
                    return maxi_ai_response(
                        false,
                        [],
                        'Maxi Web Analytics plugin is not active. Install and activate it to use analytics.'
                    );
                }

                global $wpdb;

                $table     = $wpdb->prefix . 'mwa_page_views';
                $report    = sanitize_key( $input['report'] ?? '' );
                $post_id   = (int) ( $input['post_id'] ?? 0 );
                $post_type = sanitize_key( $input['post_type'] ?? '' );
                $date_from = sanitize_text_field( $input['date_from'] ?? '' );
                $date_to   = sanitize_text_field( $input['date_to'] ?? '' );
                $limit     = min( max( (int) ( $input['limit'] ?? 20 ), 1 ), 100 );
                $group_by  = sanitize_key( $input['group_by'] ?? 'total' );

                // Default date range: last 30 days.
                if ( $date_from === '' ) {
                    $date_from = wp_date( 'Y-m-d', strtotime( '-30 days' ) );
                }
                if ( $date_to === '' ) {
                    $date_to = wp_date( 'Y-m-d' );
                }

                switch ( $report ) {

                    case 'views':
                        return maxi_ai_get_views_report( $wpdb, $table, $post_id, $date_from, $date_to, $group_by );

                    case 'top-posts':
                        return maxi_ai_get_top_posts_report( $wpdb, $table, $post_type, $date_from, $date_to, $limit );

                    case 'sources':
                        return maxi_ai_get_sources_report( $wpdb, $table, $post_id, $date_from, $date_to, $limit );

                    case 'conversions':
                        return maxi_ai_get_conversions_report( $wpdb, $table, $post_type, $date_from, $date_to, $limit );

                    default:
                        return maxi_ai_response( false, [], 'Invalid report type. Use: views, top-posts, sources, conversions.' );

                }

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );

/**
 * Views report — total or time-grouped views for a single post.
 */
function maxi_ai_get_views_report( $wpdb, $table, $post_id, $date_from, $date_to, $group_by ) {

    if ( $post_id <= 0 ) {
        return maxi_ai_response( false, [], 'post_id is required for the "views" report.' );
    }

    if ( $group_by === 'total' ) {

        $total = (int) $wpdb->get_var( $wpdb->prepare(
            "SELECT COUNT(*) FROM $table WHERE post_id = %d AND view_date BETWEEN %s AND %s",
            $post_id, $date_from, $date_to
        ) );

        return maxi_ai_response( true, [
            'post_id'   => $post_id,
            'views'     => $total,
            'date_from' => $date_from,
            'date_to'   => $date_to,
        ] );

    }

    // Time-grouped queries.
    switch ( $group_by ) {
        case 'day':
            $date_expr = 'view_date';
            break;
        case 'week':
            $date_expr = "DATE(DATE_SUB(view_date, INTERVAL WEEKDAY(view_date) DAY))";
            break;
        case 'month':
            $date_expr = "DATE_FORMAT(view_date, '%Y-%m-01')";
            break;
        default:
            return maxi_ai_response( false, [], 'Invalid group_by. Use: day, week, month, total.' );
    }

    $rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT $date_expr AS period, COUNT(*) AS views
         FROM $table
         WHERE post_id = %d AND view_date BETWEEN %s AND %s
         GROUP BY period
         ORDER BY period ASC",
        $post_id, $date_from, $date_to
    ), ARRAY_A );

    return maxi_ai_response( true, [
        'post_id'   => $post_id,
        'group_by'  => $group_by,
        'periods'   => $rows ?: [],
        'total'     => array_sum( array_column( $rows ?: [], 'views' ) ),
        'date_from' => $date_from,
        'date_to'   => $date_to,
    ] );

}

/**
 * Top posts report — most viewed posts, optionally filtered by post type.
 */
function maxi_ai_get_top_posts_report( $wpdb, $table, $post_type, $date_from, $date_to, $limit ) {

    $where = "view_date BETWEEN %s AND %s AND post_id > 0";
    $params = [ $date_from, $date_to ];

    if ( $post_type !== '' ) {
        $where   .= " AND post_type = %s";
        $params[] = $post_type;
    }

    $params[] = $limit;

    $rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT post_id, post_type, COUNT(*) AS views
         FROM $table
         WHERE $where
         GROUP BY post_id, post_type
         ORDER BY views DESC
         LIMIT %d",
        ...$params
    ), ARRAY_A );

    // Enrich with post titles.
    if ( ! empty( $rows ) ) {
        foreach ( $rows as &$row ) {
            $row['title'] = get_the_title( (int) $row['post_id'] ) ?: '(no title)';
            $row['views'] = (int) $row['views'];
        }
        unset( $row );
    }

    return maxi_ai_response( true, [
        'posts'     => $rows ?: [],
        'post_type' => $post_type ?: 'all',
        'date_from' => $date_from,
        'date_to'   => $date_to,
    ] );

}

/**
 * Sources report — traffic source breakdown, for a specific post or site-wide.
 */
function maxi_ai_get_sources_report( $wpdb, $table, $post_id, $date_from, $date_to, $limit ) {

    $where  = "view_date BETWEEN %s AND %s";
    $params = [ $date_from, $date_to ];

    if ( $post_id > 0 ) {
        $where   .= " AND post_id = %d";
        $params[] = $post_id;
    }

    $params[] = $limit;

    $rows = $wpdb->get_results( $wpdb->prepare(
        "SELECT
            CASE
                WHEN utm_source != '' THEN utm_source
                WHEN referer = '' THEN 'direct'
                ELSE SUBSTRING_INDEX(SUBSTRING_INDEX(REPLACE(REPLACE(referer, 'https://', ''), 'http://', ''), '/', 1), '?', 1)
            END AS source,
            CASE
                WHEN utm_medium != '' THEN utm_medium
                WHEN referer = '' THEN 'none'
                ELSE 'referral'
            END AS medium,
            utm_campaign AS campaign,
            COUNT(*) AS views
         FROM $table
         WHERE $where
         GROUP BY source, medium, campaign
         ORDER BY views DESC
         LIMIT %d",
        ...$params
    ), ARRAY_A );

    if ( ! empty( $rows ) ) {
        foreach ( $rows as &$row ) {
            $row['views'] = (int) $row['views'];
        }
        unset( $row );
    }

    return maxi_ai_response( true, [
        'sources'   => $rows ?: [],
        'post_id'   => $post_id ?: 'all',
        'date_from' => $date_from,
        'date_to'   => $date_to,
    ] );

}

/**
 * Conversions report — views vs purchases for WooCommerce products.
 */
function maxi_ai_get_conversions_report( $wpdb, $table, $post_type, $date_from, $date_to, $limit ) {

    if ( ! function_exists( 'wc_get_product' ) ) {
        return maxi_ai_response( false, [], 'WooCommerce is not active. The "conversions" report requires WooCommerce.' );
    }

    if ( $post_type === '' ) {
        $post_type = 'product';
    }

    // Get views per product.
    $views = $wpdb->get_results( $wpdb->prepare(
        "SELECT post_id, COUNT(*) AS views
         FROM $table
         WHERE post_type = %s AND view_date BETWEEN %s AND %s AND post_id > 0
         GROUP BY post_id
         ORDER BY views DESC
         LIMIT %d",
        $post_type, $date_from, $date_to, $limit
    ), ARRAY_A );

    if ( empty( $views ) ) {
        return maxi_ai_response( true, [
            'conversions' => [],
            'date_from'   => $date_from,
            'date_to'     => $date_to,
            'note'        => 'No page view data found for this period.',
        ] );
    }

    // Get order counts per product in the same period.
    $order_stats_table = $wpdb->prefix . 'wc_order_stats';
    $order_product_table = $wpdb->prefix . 'wc_order_product_lookup';

    $post_ids = array_column( $views, 'post_id' );
    $placeholders = implode( ',', array_fill( 0, count( $post_ids ), '%d' ) );

    $order_counts = $wpdb->get_results( $wpdb->prepare(
        "SELECT opl.product_id, COUNT(DISTINCT opl.order_id) AS orders, SUM(opl.product_qty) AS units_sold
         FROM $order_product_table opl
         INNER JOIN $order_stats_table os ON os.order_id = opl.order_id
         WHERE opl.product_id IN ($placeholders)
           AND os.status IN ('wc-completed', 'wc-processing')
           AND os.date_created BETWEEN %s AND %s
         GROUP BY opl.product_id",
        ...array_merge( $post_ids, [ $date_from . ' 00:00:00', $date_to . ' 23:59:59' ] )
    ), ARRAY_A );

    // Index order data by product_id.
    $orders_map = [];
    if ( ! empty( $order_counts ) ) {
        foreach ( $order_counts as $oc ) {
            $orders_map[ (int) $oc['product_id'] ] = [
                'orders'     => (int) $oc['orders'],
                'units_sold' => (int) $oc['units_sold'],
            ];
        }
    }

    // Build result.
    $results = [];
    foreach ( $views as $v ) {
        $pid         = (int) $v['post_id'];
        $view_count  = (int) $v['views'];
        $order_data  = $orders_map[ $pid ] ?? [ 'orders' => 0, 'units_sold' => 0 ];
        $orders      = $order_data['orders'];
        $rate        = $view_count > 0 ? round( ( $orders / $view_count ) * 100, 2 ) : 0;

        $results[] = [
            'post_id'         => $pid,
            'title'           => get_the_title( $pid ) ?: '(no title)',
            'views'           => $view_count,
            'orders'          => $orders,
            'units_sold'      => $order_data['units_sold'],
            'conversion_rate' => $rate,
        ];
    }

    // Sort by conversion rate descending.
    usort( $results, function ( $a, $b ) {
        return $b['conversion_rate'] <=> $a['conversion_rate'];
    } );

    return maxi_ai_response( true, [
        'conversions' => $results,
        'date_from'   => $date_from,
        'date_to'     => $date_to,
    ] );

}
