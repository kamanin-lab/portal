<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-notes',
        [
            'label'       => 'List Notes',
            'description' => 'List and search notes. Filter by type, status, topic, priority, or free-text search. '
                           . 'Use exclude_status to hide resolved/archived notes. '
                           . 'Session start: check operator-note, status: open for instructions, then agent-knowledge, status: active for existing solutions.',
            'category'    => 'notes',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'type' => [
                        'type'        => 'string',
                        'enum'        => [ 'agent-knowledge', 'agent-note', 'operator-note' ],
                        'description' => 'Filter by note type.',
                    ],
                    'status' => [
                        'type'        => 'string',
                        'enum'        => [ 'open', 'acknowledged', 'verify', 'fix', 'resolved', 'archived', 'review', 'active', 'idle' ],
                        'description' => 'Filter by status. For agent-knowledge use: review, active, idle. For agent-note/operator-note use: open, acknowledged, verify, fix, resolved, archived.',
                    ],
                    'exclude_status' => [
                        'type'        => 'array',
                        'items'       => [ 'type' => 'string' ],
                        'description' => 'Exclude notes with these statuses. E.g. ["resolved", "archived"] to see only active notes.',
                    ],
                    'topic' => [
                        'type'        => 'string',
                        'enum'        => [ 'bug', 'optimization', 'how-to', 'policy', 'warning', 'feedback' ],
                        'description' => 'Filter by topic.',
                    ],
                    'priority' => [
                        'type'        => 'string',
                        'enum'        => [ 'low', 'normal', 'high', 'critical' ],
                        'description' => 'Filter by priority.',
                    ],
                    'assigned_to' => [
                        'type'        => [ 'integer', 'null' ],
                        'description' => 'Filter by assigned user ID. Omit to see all notes. Use 0 to find unassigned notes only.',
                    ],
                    'search' => [
                        'type'        => 'string',
                        'description' => 'Search title and content (partial match).',
                    ],
                    'include_content' => [
                        'type'        => 'boolean',
                        'description' => 'Include the content field in results. Default: false. Set true if you need to read note bodies inline.',
                    ],
                    'limit' => [
                        'type'        => 'integer',
                        'description' => 'Max results. Default: 20, max: 100.',
                    ],
                    'offset' => [
                        'type'        => 'integer',
                        'description' => 'Offset for pagination. Default: 0.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                global $wpdb;

                $table  = $wpdb->prefix . 'maxi_ai_notes';
                $where  = [];
                $params = [];

                // Filters.
                if ( ! empty( $input['type'] ) ) {
                    $where[]  = 'type = %s';
                    $params[] = sanitize_key( $input['type'] );
                }

                if ( ! empty( $input['status'] ) ) {
                    $where[]  = 'status = %s';
                    $params[] = sanitize_key( $input['status'] );
                }

                if ( ! empty( $input['exclude_status'] ) && is_array( $input['exclude_status'] ) ) {
                    $placeholders = implode( ', ', array_fill( 0, count( $input['exclude_status'] ), '%s' ) );
                    $where[]      = "status NOT IN ($placeholders)";
                    foreach ( $input['exclude_status'] as $es ) {
                        $params[] = sanitize_key( $es );
                    }
                }

                if ( ! empty( $input['topic'] ) ) {
                    $where[]  = 'topic = %s';
                    $params[] = sanitize_key( $input['topic'] );
                }

                if ( ! empty( $input['priority'] ) ) {
                    $where[]  = 'priority = %s';
                    $params[] = sanitize_key( $input['priority'] );
                }

                if ( array_key_exists( 'assigned_to', $input ) ) {
                    $assigned = $input['assigned_to'];
                    if ( $assigned === null || $assigned === 0 || $assigned === '0' ) {
                        $where[] = 'assigned_to IS NULL';
                    } else {
                        $where[]  = 'assigned_to = %d';
                        $params[] = (int) $assigned;
                    }
                }

                if ( ! empty( $input['search'] ) ) {
                    $search   = '%' . $wpdb->esc_like( sanitize_text_field( $input['search'] ) ) . '%';
                    $where[]  = '(title LIKE %s OR content LIKE %s)';
                    $params[] = $search;
                    $params[] = $search;
                }

                $where_clause = ! empty( $where ) ? 'WHERE ' . implode( ' AND ', $where ) : '';
                $limit        = min( max( (int) ( $input['limit'] ?? 20 ), 1 ), 100 );
                $offset       = max( (int) ( $input['offset'] ?? 0 ), 0 );

                // Count total.
                $count_sql = "SELECT COUNT(*) FROM $table $where_clause";
                if ( ! empty( $params ) ) {
                    $total = (int) $wpdb->get_var( $wpdb->prepare( $count_sql, ...$params ) );
                } else {
                    $total = (int) $wpdb->get_var( $count_sql );
                }

                // Fetch results.
                $include_content = $input['include_content'] ?? false;
                $columns         = $include_content ? '*' : 'id, type, status, title, topic, priority, author_id, assigned_to, created_at, updated_at';
                $query_params    = array_merge( $params, [ $limit, $offset ] );
                $select_sql      = "SELECT $columns FROM $table $where_clause ORDER BY created_at DESC LIMIT %d OFFSET %d";
                $notes           = $wpdb->get_results( $wpdb->prepare( $select_sql, ...$query_params ), ARRAY_A );

                if ( ! empty( $notes ) ) {
                    foreach ( $notes as &$note ) {
                        $note['id']          = (int) $note['id'];
                        $note['author_id']   = (int) $note['author_id'];
                        $note['assigned_to'] = isset( $note['assigned_to'] ) && $note['assigned_to'] !== null ? (int) $note['assigned_to'] : null;
                    }
                    unset( $note );
                }

                return maxi_ai_response( true, [
                    'notes'  => $notes ?: [],
                    'total'  => $total,
                    'limit'  => $limit,
                    'offset' => $offset,
                ] );

            },

            'permission_callback' => function () {
                return is_user_logged_in();
            },

        ]
    );

} );
