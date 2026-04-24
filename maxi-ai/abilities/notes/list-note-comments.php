<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-note-comments',
        [
            'label'       => 'List Note Comments',
            'description' => 'List comments on a note in chronological order. Use when a note has more than 20 comments '
                           . 'and you need to paginate beyond what get-note returns.',
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
                        'description' => 'The note ID to get comments for.',
                    ],
                    'limit' => [
                        'type'        => 'integer',
                        'description' => 'Max results. Default: 50, max: 100.',
                    ],
                    'offset' => [
                        'type'        => 'integer',
                        'description' => 'Offset for pagination. Default: 0.',
                    ],
                ],
                'required' => [ 'note_id' ],
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

                $limit  = min( max( (int) ( $input['limit'] ?? 50 ), 1 ), 100 );
                $offset = max( (int) ( $input['offset'] ?? 0 ), 0 );

                // Count total.
                $total = (int) $wpdb->get_var( $wpdb->prepare(
                    "SELECT COUNT(*) FROM $comments_table WHERE note_id = %d",
                    $note_id
                ) );

                // Fetch comments chronologically.
                $comments = $wpdb->get_results( $wpdb->prepare(
                    "SELECT * FROM $comments_table WHERE note_id = %d ORDER BY created_at ASC LIMIT %d OFFSET %d",
                    $note_id,
                    $limit,
                    $offset
                ), ARRAY_A );

                if ( ! empty( $comments ) ) {
                    foreach ( $comments as &$comment ) {
                        $comment['id']      = (int) $comment['id'];
                        $comment['note_id'] = (int) $comment['note_id'];
                    }
                    unset( $comment );
                }

                return maxi_ai_response( true, [
                    'comments' => $comments ?: [],
                    'total'    => $total,
                    'limit'    => $limit,
                    'offset'   => $offset,
                ] );

            },

            'permission_callback' => function () {
                return is_user_logged_in();
            },

        ]
    );

} );
