<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/add-note-comment',
        [
            'label'       => 'Add Note Comment',
            'description' => 'Post a comment on a note. Use to reply to bug reports, provide verification results, or add context. '
                           . 'Comments are append-only and cannot be edited.',
            'category'    => 'notes',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'notes',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'note_id' => [
                        'type'        => 'integer',
                        'description' => 'The note ID to comment on.',
                    ],
                    'author_name' => [
                        'type'        => 'string',
                        'description' => 'Who is posting. Use a descriptive label like "dev-agent@docu" or "store-agent@vanillawp".',
                    ],
                    'content' => [
                        'type'        => 'string',
                        'description' => 'Comment body in markdown.',
                    ],
                ],
                'required' => [ 'note_id', 'author_name', 'content' ],
            ],

            'execute_callback' => function ( $input ) {

                global $wpdb;

                $notes_table    = $wpdb->prefix . 'maxi_ai_notes';
                $comments_table = $wpdb->prefix . 'maxi_ai_note_comments';

                $note_id = (int) ( $input['note_id'] ?? 0 );

                if ( $note_id <= 0 ) {
                    return maxi_ai_response( false, [], 'Invalid note ID.' );
                }

                // Verify note exists.
                $note = $wpdb->get_row( $wpdb->prepare(
                    "SELECT id FROM $notes_table WHERE id = %d",
                    $note_id
                ) );

                if ( ! $note ) {
                    return maxi_ai_response( false, [], 'Note not found.' );
                }

                // Sanitize inputs.
                $author_name = wp_strip_all_tags( $input['author_name'] ?? '' );
                $author_name = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $author_name );
                $author_name = trim( mb_substr( $author_name, 0, 100 ) );

                $content = wp_strip_all_tags( $input['content'] ?? '' );
                $content = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $content );
                $content = trim( $content );

                if ( $author_name === '' ) {
                    return maxi_ai_response( false, [], 'Author name is required.' );
                }

                if ( $content === '' ) {
                    return maxi_ai_response( false, [], 'Content is required.' );
                }

                $now = current_time( 'mysql' );

                $inserted = $wpdb->insert(
                    $comments_table,
                    [
                        'note_id'     => $note_id,
                        'author_name' => $author_name,
                        'content'     => $content,
                        'created_at'  => $now,
                    ],
                    [ '%d', '%s', '%s', '%s' ]
                );

                if ( ! $inserted ) {
                    return maxi_ai_response( false, [], 'Failed to add comment.' );
                }

                $comment_id = (int) $wpdb->insert_id;

                // Bump parent note's updated_at.
                $wpdb->update(
                    $notes_table,
                    [ 'updated_at' => $now ],
                    [ 'id' => $note_id ],
                    [ '%s' ],
                    [ '%d' ]
                );

                // Audit log.
                if ( class_exists( 'Maxi_AI_Audit_Log' ) ) {
                    Maxi_AI_Audit_Log::record(
                        'notes',
                        'comment_added',
                        get_current_user_id(),
                        'note:' . $note_id,
                        [
                            'comment_id'  => $comment_id,
                            'note_id'     => $note_id,
                            'author_name' => $author_name,
                        ]
                    );
                }

                return maxi_ai_response( true, [
                    'comment' => [
                        'id'          => $comment_id,
                        'note_id'     => $note_id,
                        'author_name' => $author_name,
                        'content'     => $content,
                        'created_at'  => $now,
                    ],
                ] );

            },

            'permission_callback' => function () {
                return is_user_logged_in();
            },

        ]
    );

} );
