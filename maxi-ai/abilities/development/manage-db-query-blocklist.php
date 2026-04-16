<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/manage-db-query-blocklist',
        [
            'label'       => 'Manage DB Query Blocklist',
            'description' => 'Add, remove, or list terms in the DB query output blocklist. When MAXI_AI_WP_CLI_ALLOW_DB_READS is enabled, any db query whose SQL text or output contains a blocklisted term is rejected before data reaches the agent. The blocklist is seeded with sensible defaults (user_pass, user_activation_key, session_tokens) on first use. Use this to customize which sensitive columns are protected.',
            'category'    => 'development',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'action' => [
                        'type'        => 'string',
                        'enum'        => [ 'add', 'remove', 'list' ],
                        'description' => 'The operation to perform: "add" terms to the blocklist, "remove" terms from it, or "list" the current blocklist.',
                    ],
                    'terms' => [
                        'type'        => 'array',
                        'items'       => [ 'type' => 'string' ],
                        'description' => 'Terms to add or remove. Required for "add" and "remove" actions, ignored for "list".',
                    ],
                ],
                'required' => [ 'action' ],
            ],

            'execute_callback' => function ( $input ) {

                $action    = sanitize_key( $input['action'] ?? '' );
                $option_key = 'maxi_ai_db_query_blocklist';

                if ( ! in_array( $action, [ 'add', 'remove', 'list' ], true ) ) {
                    return maxi_ai_response( false, [], 'Invalid action. Use "add", "remove", or "list".' );
                }

                $blocklist = get_option( $option_key, [] );

                if ( ! is_array( $blocklist ) ) {
                    $blocklist = [];
                }

                // List — just return the current state.
                if ( $action === 'list' ) {
                    return maxi_ai_response(
                        true,
                        [
                            'blocklist' => $blocklist,
                            'count'     => count( $blocklist ),
                        ]
                    );
                }

                // Add / Remove — require terms.
                $terms = $input['terms'] ?? [];

                if ( ! is_array( $terms ) || empty( $terms ) ) {
                    return maxi_ai_response( false, [], 'Missing "terms" array for action "' . $action . '".' );
                }

                $sanitized = array_filter(
                    array_map( 'sanitize_text_field', $terms ),
                    function ( $t ) {
                        return $t !== '';
                    }
                );

                if ( empty( $sanitized ) ) {
                    return maxi_ai_response( false, [], 'All provided terms were empty after sanitization.' );
                }

                if ( $action === 'add' ) {

                    $blocklist = array_values( array_unique( array_merge( $blocklist, $sanitized ) ) );
                    update_option( $option_key, $blocklist );

                    Maxi_AI_Audit_Log::record(
                        'wp_cli',
                        'db_query_blocklist_updated',
                        get_current_user_id(),
                        'add',
                        [
                            'added_terms' => array_values( $sanitized ),
                            'blocklist'   => $blocklist,
                        ]
                    );

                    return maxi_ai_response(
                        true,
                        [
                            'added'     => array_values( $sanitized ),
                            'blocklist' => $blocklist,
                            'count'     => count( $blocklist ),
                        ]
                    );

                }

                if ( $action === 'remove' ) {

                    $removed   = array_values( array_intersect( $blocklist, $sanitized ) );
                    $blocklist = array_values( array_diff( $blocklist, $sanitized ) );
                    update_option( $option_key, $blocklist );

                    Maxi_AI_Audit_Log::record(
                        'wp_cli',
                        'db_query_blocklist_updated',
                        get_current_user_id(),
                        'remove',
                        [
                            'removed_terms' => $removed,
                            'blocklist'     => $blocklist,
                        ]
                    );

                    return maxi_ai_response(
                        true,
                        [
                            'removed'   => $removed,
                            'blocklist' => $blocklist,
                            'count'     => count( $blocklist ),
                        ]
                    );

                }

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
