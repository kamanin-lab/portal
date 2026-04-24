<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/delete-note',
        [
            'label'       => 'Delete Note',
            'description' => 'Permanently delete a note. Prefer updating status to "archived" instead of deleting. '
                           . 'Only administrators can delete notes.',
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
                        'description' => 'Note ID to delete.',
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

                $wpdb->delete( $table, [ 'id' => $id ], [ '%d' ] );

                if ( $existing['type'] === 'operator-note' ) {
                    maxi_ai_operator_notes_revision_bump();
                } elseif ( $existing['type'] === 'agent-knowledge' ) {
                    maxi_ai_knowledge_notes_revision_bump();
                }

                Maxi_AI_Audit_Log::record(
                    'notes',
                    'note_deleted',
                    get_current_user_id(),
                    $existing['type'] . ':' . $id,
                    [
                        'note_id' => $id,
                        'title'   => $existing['title'],
                        'type'    => $existing['type'],
                    ]
                );

                return maxi_ai_response( true, [
                    'deleted' => $id,
                    'title'   => $existing['title'],
                ] );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
