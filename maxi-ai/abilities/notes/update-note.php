<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/update-note',
        [
            'label'       => 'Update Note',
            'description' => 'Update a note. Change status (e.g. "new" to "acknowledged" or "resolved"), '
                           . 'edit content, or update topic/priority. Only send fields you want to change.',
            'category'    => 'notes',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'notes',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'id' => [
                        'type'        => 'integer',
                        'description' => 'Note ID to update.',
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'New title.',
                    ],
                    'content' => [
                        'type'        => 'string',
                        'description' => 'New content (markdown).',
                    ],
                    'status' => [
                        'type'        => 'string',
                        'enum'        => [ 'open', 'acknowledged', 'verify', 'fix', 'resolved', 'archived', 'review', 'active', 'idle' ],
                        'description' => 'New status. For agent-note/operator-note: "open", "acknowledged", "verify", "fix", "resolved", "archived". For agent-knowledge: "review" (pending approval), "active" (use this), "idle" (outdated/disabled), "archived".',
                    ],
                    'topic' => [
                        'type'        => 'string',
                        'enum'        => [ 'bug', 'optimization', 'how-to', 'policy', 'warning', 'feedback' ],
                        'description' => 'New topic.',
                    ],
                    'priority' => [
                        'type'        => 'string',
                        'enum'        => [ 'low', 'normal', 'high', 'critical' ],
                        'description' => 'New priority.',
                    ],
                    'assigned_to' => [
                        'type'        => [ 'integer', 'null' ],
                        'description' => 'WordPress user ID to assign this note to, or null to unassign.',
                    ],
                ],
                'required' => [ 'id' ],
            ],

            'execute_callback' => function ( $input ) {

                global $wpdb;

                $table = $wpdb->prefix . 'maxi_ai_notes';
                $id    = (int) ( $input['id'] ?? 0 );

                if ( $id <= 0 ) {
                    return maxi_ai_response( false, [], 'Invalid note ID.' );
                }

                $existing = $wpdb->get_row( $wpdb->prepare(
                    "SELECT * FROM $table WHERE id = %d",
                    $id
                ), ARRAY_A );

                if ( ! $existing ) {
                    return maxi_ai_response( false, [], 'Note not found.' );
                }

                // Note ownership: only the original author or an admin can modify content.
                // Status, topic, and priority changes are allowed from anyone,
                // except agent-knowledge status — only administrators can change it (maker-checker).
                if ( isset( $input['content'] ) ) {
                    $current_user = get_current_user_id();
                    $note_author  = (int) $existing['author_id'];
                    if ( $current_user !== $note_author && ! current_user_can( 'manage_options' ) ) {
                        return maxi_ai_response(
                            false,
                            [
                                'code'      => 'note_ownership',
                                'note_id'   => $id,
                                'author_id' => $note_author,
                            ],
                            'You cannot modify the content of a note authored by another user. Only the original author or an administrator can edit note content. You may still change status, topic, or priority.'
                        );
                    }
                }

                $updates = [];
                $formats = [];

                if ( isset( $input['title'] ) ) {
                    $title             = wp_strip_all_tags( $input['title'] );
                    $title             = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $title );
                    $updates['title']  = trim( mb_substr( $title, 0, 255 ) );
                    $formats[]         = '%s';
                }

                if ( isset( $input['content'] ) ) {
                    $content             = $input['content'];
                    $content             = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $content );
                    $updates['content']  = trim( $content );
                    $formats[]           = '%s';
                }

                if ( isset( $input['status'] ) ) {
                    $status = sanitize_key( $input['status'] );

                    // Status transition map — PHP-enforced state machine per note type.
                    // archived is terminal (no outbound transitions).
                    $transitions_by_type = [
                        'agent-note' => [
                            'open'         => [ 'acknowledged', 'archived' ],
                            'acknowledged' => [ 'verify', 'resolved', 'archived' ],
                            'verify'       => [ 'resolved', 'fix', 'archived' ],
                            'fix'          => [ 'verify', 'archived' ],
                            'resolved'     => [ 'archived' ],
                            'archived'     => [],
                        ],
                        'agent-knowledge' => [
                            'review'   => [ 'active', 'archived' ],
                            'active'   => [ 'idle', 'archived' ],
                            'idle'     => [ 'active', 'archived' ],
                            'archived' => [],
                        ],
                        'operator-note' => [
                            'review'   => [ 'active', 'archived' ],
                            'active'   => [ 'idle', 'archived' ],
                            'idle'     => [ 'active', 'archived' ],
                            'archived' => [],
                        ],
                    ];

                    $transitions    = $transitions_by_type[ $existing['type'] ] ?? $transitions_by_type['agent-note'];
                    $current_status = $existing['status'];

                    // Same-status is a no-op — skip silently.
                    $status_noop = false;
                    if ( $status === $current_status ) {
                        $status_noop = true;
                        // Don't add to $updates — no change needed.
                    } else {
                        // Check target status is valid for this type.
                        if ( ! array_key_exists( $status, $transitions ) ) {
                            return maxi_ai_response( false, [], sprintf(
                                'Invalid status "%s" for %s. Valid statuses: %s',
                                $status,
                                $existing['type'],
                                implode( ', ', array_keys( $transitions ) )
                            ) );
                        }

                        // Check transition is valid from current state.
                        $valid_targets = $transitions[ $current_status ] ?? [];
                        if ( ! in_array( $status, $valid_targets, true ) ) {
                            return maxi_ai_response(
                                false,
                                [
                                    'code'          => 'invalid_transition',
                                    'note_id'       => $id,
                                    'from'          => $current_status,
                                    'to'            => $status,
                                    'valid_targets' => $valid_targets,
                                ],
                                sprintf(
                                    'Invalid status transition: "%s" → "%s" is not allowed for %s. Valid transitions from "%s": %s',
                                    $current_status,
                                    $status,
                                    $existing['type'],
                                    $current_status,
                                    ! empty( $valid_targets ) ? implode( ', ', $valid_targets ) : '(none — terminal state)'
                                )
                            );
                        }

                        // Maker-checker: only administrators can change agent-knowledge status.
                        if ( $existing['type'] === 'agent-knowledge' && ! current_user_can( 'manage_options' ) ) {
                            return maxi_ai_response(
                                false,
                                [ 'code' => 'knowledge_status_restricted', 'note_id' => $id ],
                                'Only an administrator can change agent-knowledge status. Knowledge approval follows the maker-checker pattern: agents create, operators approve.'
                            );
                        }

                        // Read-before-status-change: consume-on-use guard.
                        // Only enforced in MCP context (was_note_read returns false
                        // when no session ID is present, but we check explicitly to
                        // avoid blocking WP-CLI / cron / direct PHP callers).
                        if ( Maxi_AI_Rule_Session::get_session_id() && ! Maxi_AI_Rule_Session::was_note_read( $id ) ) {

                            maxi_ai_log(
                                'read-before-status-change BLOCKED: note_id=' . $id . ' user=' . get_current_user_id(),
                                'warning',
                                [ 'component' => 'rules' ]
                            );

                            return maxi_ai_response(
                                false,
                                [
                                    'code'    => 'note_not_read',
                                    'note_id' => $id,
                                ],
                                'You must call maxi/get-note for note ' . $id . ' before changing its status. Read first to see current context (comments, assignment, status), then update.'
                            );
                        }

                        $updates['status'] = $status;
                        $formats[]         = '%s';
                    }
                }

                if ( isset( $input['topic'] ) ) {
                    $topic          = sanitize_key( $input['topic'] );
                    $allowed_topics = [ 'bug', 'optimization', 'how-to', 'policy', 'warning', 'feedback', '' ];
                    if ( ! in_array( $topic, $allowed_topics, true ) ) {
                        return maxi_ai_response( false, [], 'Invalid topic. Use: ' . implode( ', ', array_filter( $allowed_topics ) ) );
                    }
                    $updates['topic'] = $topic;
                    $formats[]        = '%s';
                }

                if ( isset( $input['priority'] ) ) {
                    $priority            = sanitize_key( $input['priority'] );
                    $allowed_priorities  = [ 'low', 'normal', 'high', 'critical' ];
                    if ( ! in_array( $priority, $allowed_priorities, true ) ) {
                        return maxi_ai_response( false, [], 'Invalid priority. Use: ' . implode( ', ', $allowed_priorities ) );
                    }
                    $updates['priority'] = $priority;
                    $formats[]           = '%s';
                }

                // Handle assigned_to (nullable).
                $set_assigned_null = false;
                if ( array_key_exists( 'assigned_to', $input ) ) {
                    if ( $input['assigned_to'] === null || $input['assigned_to'] === '' ) {
                        $set_assigned_null = true;
                    } else {
                        $assigned = (int) $input['assigned_to'];
                        if ( $assigned <= 0 ) {
                            return maxi_ai_response( false, [], 'assigned_to must be a valid user ID or null.' );
                        }
                        $updates['assigned_to'] = $assigned;
                        $formats[]              = '%d';
                    }
                }

                if ( empty( $updates ) && ! $set_assigned_null ) {
                    // Same-status no-op: return success with the current note.
                    if ( $status_noop ?? false ) {
                        $existing['id']          = (int) $existing['id'];
                        $existing['author_id']   = (int) $existing['author_id'];
                        $existing['assigned_to'] = isset( $existing['assigned_to'] ) && $existing['assigned_to'] !== null ? (int) $existing['assigned_to'] : null;
                        unset( $existing['comments'] );
                        return maxi_ai_response( true, [
                            'note'           => $existing,
                            'updated_fields' => [],
                        ] );
                    }
                    return maxi_ai_response( false, [], 'No valid fields to update.' );
                }

                $updates['updated_at'] = current_time( 'mysql' );
                $formats[]             = '%s';

                $wpdb->update( $table, $updates, [ 'id' => $id ], $formats, [ '%d' ] );

                // Handle NULL assignment separately (wpdb doesn't handle NULL in format arrays).
                if ( $set_assigned_null ) {
                    $wpdb->query( $wpdb->prepare(
                        "UPDATE {$table} SET assigned_to = NULL WHERE id = %d",
                        $id
                    ) );
                }

                // Consume-on-use: clear the note-read flag after a successful
                // status change. The agent must re-read before the next transition.
                if ( isset( $updates['status'] ) ) {
                    Maxi_AI_Rule_Session::clear_note_read( $id );
                }

                if ( $existing['type'] === 'operator-note' ) {
                    maxi_ai_operator_notes_revision_bump();
                } elseif ( $existing['type'] === 'agent-knowledge' ) {
                    maxi_ai_knowledge_notes_revision_bump();
                }

                Maxi_AI_Audit_Log::record(
                    'notes',
                    'note_updated',
                    get_current_user_id(),
                    $existing['type'] . ':' . $id,
                    [
                        'note_id'        => $id,
                        'updated_fields' => array_keys( $updates ),
                    ]
                );

                // Return updated note.
                $note = $wpdb->get_row( $wpdb->prepare(
                    "SELECT * FROM $table WHERE id = %d",
                    $id
                ), ARRAY_A );

                $note['id']          = (int) $note['id'];
                $note['author_id']   = (int) $note['author_id'];
                $note['assigned_to'] = isset( $note['assigned_to'] ) && $note['assigned_to'] !== null ? (int) $note['assigned_to'] : null;

                return maxi_ai_response( true, [
                    'note' => $note,
                ] );

            },

            'permission_callback' => function () {
                return is_user_logged_in();
            },

        ]
    );

} );
