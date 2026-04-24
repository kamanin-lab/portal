<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/create-note',
        [
            'label'       => 'Create Note',
            'description' => 'Create a persistent note that survives across sessions. '
                           . '"agent-knowledge": reference material — how to do something, a workaround, a procedure. '
                           . 'Written once, read many times, updated when the system changes. '
                           . '"agent-note": actionable feedback — a bug found, a missing feature, a process that should be optimized. '
                           . 'Meant to be reviewed and resolved. '
                           . '"operator-note": human instructions — context, priorities, or policies the agent should follow.',
            'category'    => 'notes',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'notes',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'type' => [
                        'type'        => 'string',
                        'enum'        => [ 'agent-knowledge', 'agent-note', 'operator-note' ],
                        'description' => 'Note type. '
                                       . '"agent-knowledge": something you learned that future sessions should know (e.g. "ACF post types must be created via acf json import, not wp post create"). '
                                       . '"agent-note": something that needs attention (e.g. "get-taxonomies was missing pa_* attributes" or "order search is slow without date filters"). '
                                       . '"operator-note": written by the operator for agents to read.',
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'Short descriptive title (max 255 chars).',
                    ],
                    'content' => [
                        'type'        => 'string',
                        'description' => 'Note body in markdown.',
                    ],
                    'topic' => [
                        'type'        => 'string',
                        'enum'        => [ 'bug', 'optimization', 'how-to', 'policy', 'warning', 'feedback' ],
                        'description' => 'Optional topic categorization.',
                    ],
                    'priority' => [
                        'type'        => 'string',
                        'enum'        => [ 'low', 'normal', 'high', 'critical' ],
                        'description' => 'Priority level. Default: normal.',
                    ],
                    'assigned_to' => [
                        'type'        => [ 'integer', 'null' ],
                        'description' => 'WordPress user ID to assign this note to, or null/omit for unassigned.',
                    ],
                ],
                'required' => [ 'type', 'title', 'content' ],
            ],

            'execute_callback' => function ( $input ) {

                global $wpdb;

                $table = $wpdb->prefix . 'maxi_ai_notes';

                $type     = sanitize_key( $input['type'] ?? '' );
                $title    = wp_strip_all_tags( $input['title'] ?? '' );
                $title    = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $title );
                $title    = trim( mb_substr( $title, 0, 255 ) );
                $content  = $input['content'] ?? '';
                $content  = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $content );
                $content  = trim( $content );
                $topic    = sanitize_key( $input['topic'] ?? '' );
                $priority = sanitize_key( $input['priority'] ?? 'normal' );

                $allowed_types = [ 'agent-knowledge', 'agent-note', 'operator-note' ];
                if ( ! in_array( $type, $allowed_types, true ) ) {
                    return maxi_ai_response( false, [], 'Invalid type. Use: ' . implode( ', ', $allowed_types ) );
                }

                if ( $title === '' ) {
                    return maxi_ai_response( false, [], 'Title is required.' );
                }

                if ( $content === '' ) {
                    return maxi_ai_response( false, [], 'Content is required.' );
                }

                $allowed_topics = [ 'bug', 'optimization', 'how-to', 'policy', 'warning', 'feedback', '' ];
                if ( ! in_array( $topic, $allowed_topics, true ) ) {
                    return maxi_ai_response( false, [], 'Invalid topic. Use: ' . implode( ', ', array_filter( $allowed_topics ) ) );
                }

                $allowed_priorities = [ 'low', 'normal', 'high', 'critical' ];
                if ( ! in_array( $priority, $allowed_priorities, true ) ) {
                    return maxi_ai_response( false, [], 'Invalid priority. Use: ' . implode( ', ', $allowed_priorities ) );
                }

                $assigned_to = null;
                if ( isset( $input['assigned_to'] ) && $input['assigned_to'] !== null ) {
                    $assigned_to = (int) $input['assigned_to'];
                    if ( $assigned_to <= 0 ) {
                        return maxi_ai_response( false, [], 'assigned_to must be a valid user ID or null.' );
                    }
                }

                $now            = current_time( 'mysql' );
                $default_status = ( $type === 'agent-knowledge' || $type === 'operator-note' ) ? 'review' : 'open';

                $insert_data = [
                    'type'        => $type,
                    'status'      => $default_status,
                    'title'       => $title,
                    'content'     => $content,
                    'topic'       => $topic,
                    'priority'    => $priority,
                    'author_id'   => get_current_user_id(),
                    'assigned_to' => $assigned_to,
                    'created_at'  => $now,
                    'updated_at'  => $now,
                ];

                $insert_formats = [ '%s', '%s', '%s', '%s', '%s', '%s', '%d' ];

                if ( $assigned_to !== null ) {
                    $insert_formats[] = '%d';
                } else {
                    // Remove NULL assigned_to from data — insert it separately.
                    unset( $insert_data['assigned_to'] );
                }

                $insert_formats[] = '%s';
                $insert_formats[] = '%s';

                $inserted = $wpdb->insert( $table, $insert_data, $insert_formats );

                if ( ! $inserted ) {
                    return maxi_ai_response( false, [], 'Failed to create note.' );
                }

                $note_id = $wpdb->insert_id;

                if ( $type === 'operator-note' ) {
                    maxi_ai_operator_notes_revision_bump();
                } elseif ( $type === 'agent-knowledge' ) {
                    maxi_ai_knowledge_notes_revision_bump();
                }

                Maxi_AI_Audit_Log::record(
                    'notes',
                    'note_created',
                    get_current_user_id(),
                    $type . ':' . $note_id,
                    [
                        'note_id'  => $note_id,
                        'type'     => $type,
                        'title'    => $title,
                        'topic'    => $topic,
                        'priority' => $priority,
                    ]
                );

                // Creator has full context — mark as read so they can
                // change status without an extra get-note round-trip.
                Maxi_AI_Rule_Session::mark_note_read( $note_id );

                return maxi_ai_response( true, [
                    'note' => [
                        'id'          => $note_id,
                        'type'        => $type,
                        'status'      => $default_status,
                        'title'       => $title,
                        'content'     => $content,
                        'topic'       => $topic,
                        'priority'    => $priority,
                        'author_id'   => get_current_user_id(),
                        'assigned_to' => $assigned_to,
                        'created_at'  => $now,
                        'updated_at'  => $now,
                    ],
                ] );

            },

            'permission_callback' => function () {
                return is_user_logged_in();
            },

        ]
    );

} );
