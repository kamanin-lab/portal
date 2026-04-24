<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-note',
        [
            'label'       => 'Get Note',
            'description' => 'Read a single note by ID. Includes the last 20 comments.',
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
                        'description' => 'Note ID.',
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

                $note = $wpdb->get_row( $wpdb->prepare(
                    "SELECT * FROM $table WHERE id = %d",
                    $id
                ), ARRAY_A );

                if ( ! $note ) {
                    return maxi_ai_response( false, [], 'Note not found.' );
                }

                $note['id']        = (int) $note['id'];
                $note['author_id'] = (int) $note['author_id'];

                // Fetch last 20 comments chronologically.
                $comments_table = $wpdb->prefix . 'maxi_ai_note_comments';
                $comments = $wpdb->get_results( $wpdb->prepare(
                    "SELECT * FROM $comments_table WHERE note_id = %d ORDER BY created_at ASC LIMIT 20",
                    $id
                ), ARRAY_A );

                if ( ! empty( $comments ) ) {
                    foreach ( $comments as &$comment ) {
                        $comment['id']      = (int) $comment['id'];
                        $comment['note_id'] = (int) $comment['note_id'];
                    }
                    unset( $comment );
                }

                $note['comments'] = $comments ?: [];

                // Track that this note was read in the current MCP session.
                // Satisfies the read-before-status-change guard in update-note.
                Maxi_AI_Rule_Session::mark_note_read( $id );

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
