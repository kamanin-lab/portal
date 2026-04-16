<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/bootstrap-session',
        [
            'label'       => 'Bootstrap Session',
            'description' => 'Session bootstrap — call this before any other ability. Returns the operational '
                           . 'playbook, active operator-notes (authoritative instructions), knowledge note '
                           . 'headers, and available reference docs. All other abilities are blocked until '
                           . 'this call is acknowledged.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => (object) [],
            ],

            'execute_callback' => function ( $input ) {

                global $wpdb;

                // -------------------------------------------------------
                // 1. Self-heal: ensure playbook infrastructure exists.
                // -------------------------------------------------------
                if ( ! class_exists( 'Maxi_AI_Playbook_Schema' ) || ! class_exists( 'Maxi_AI_Playbook_Store' ) ) {
                    return maxi_ai_response( false, [], 'Playbook classes not loaded. Check plugin installation.' );
                }

                $table  = Maxi_AI_Playbook_Schema::table_name();
                $exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );

                if ( ! $exists ) {
                    Maxi_AI_Playbook_Schema::create_or_upgrade();
                }

                // Ensure required playbooks exist.
                $required = Maxi_AI_Playbook_Store::get_required_versions();

                if ( empty( $required ) ) {
                    Maxi_AI_Playbook_Store::seed_defaults();
                    $required = Maxi_AI_Playbook_Store::get_required_versions();

                    if ( empty( $required ) ) {
                        return maxi_ai_response(
                            false,
                            [ 'code' => 'playbook_system_unavailable' ],
                            'No required playbooks found after seeding. Check that PLAYBOOK-INIT.md exists in the plugin root.'
                        );
                    }
                }

                // -------------------------------------------------------
                // 2. Fetch required playbook(s).
                // -------------------------------------------------------
                $playbook_data = [];

                foreach ( array_keys( $required ) as $slug ) {
                    $pb = Maxi_AI_Playbook_Store::get( $slug );

                    if ( ! $pb ) {
                        continue;
                    }

                    $playbook_data = [
                        'slug'    => $pb['slug'],
                        'version' => (int) $pb['version'],
                        'content' => $pb['content'],
                    ];

                    // Currently only one required playbook (operational).
                    // If multiple become required, this can be expanded to
                    // an array. For now, keep the response flat.
                    break;
                }

                if ( empty( $playbook_data ) ) {
                    return maxi_ai_response(
                        false,
                        [ 'code' => 'playbook_system_unavailable' ],
                        'Required playbook content not found.'
                    );
                }

                // -------------------------------------------------------
                // 3. Active operator-notes (full content).
                // -------------------------------------------------------
                $notes_table = $wpdb->prefix . 'maxi_ai_notes';
                $operator_notes = [];

                $op_rows = $wpdb->get_results(
                    "SELECT id, title, content, topic, priority, created_at, updated_at
                     FROM {$notes_table}
                     WHERE type = 'operator-note' AND status = 'active'
                     ORDER BY id ASC",
                    ARRAY_A
                );

                if ( is_array( $op_rows ) ) {
                    foreach ( $op_rows as $row ) {
                        $operator_notes[] = [
                            'id'         => (int) $row['id'],
                            'title'      => $row['title'],
                            'content'    => $row['content'],
                            'topic'      => $row['topic'],
                            'priority'   => $row['priority'],
                            'created_at' => $row['created_at'],
                            'updated_at' => $row['updated_at'],
                        ];
                    }
                }

                // -------------------------------------------------------
                // 4. Active knowledge note headers (no content).
                // -------------------------------------------------------
                $knowledge_headers = [];

                $kn_rows = $wpdb->get_results(
                    "SELECT id, title, topic, priority
                     FROM {$notes_table}
                     WHERE type = 'agent-knowledge' AND status = 'active'
                     ORDER BY id ASC",
                    ARRAY_A
                );

                if ( is_array( $kn_rows ) ) {
                    foreach ( $kn_rows as $row ) {
                        $knowledge_headers[] = [
                            'id'       => (int) $row['id'],
                            'title'    => $row['title'],
                            'topic'    => $row['topic'],
                            'priority' => $row['priority'],
                        ];
                    }
                }

                // -------------------------------------------------------
                // 5. Available on-demand docs (no content, just listing).
                // -------------------------------------------------------
                $available_docs = [];
                $pb_table = Maxi_AI_Playbook_Schema::table_name();

                $doc_rows = $wpdb->get_results(
                    "SELECT slug, title FROM {$pb_table} WHERE required = 0 AND status = 'active' ORDER BY slug ASC",
                    ARRAY_A
                );

                if ( is_array( $doc_rows ) ) {
                    foreach ( $doc_rows as $row ) {
                        $available_docs[] = [
                            'slug'  => $row['slug'],
                            'title' => $row['title'],
                        ];
                    }
                }

                // -------------------------------------------------------
                // 6. Mark session acknowledged (LAST — ensures the agent
                //    only gets marked if they receive the full payload).
                // -------------------------------------------------------
                $notes_hash = Maxi_AI_Playbook_Session::compute_notes_hash();

                foreach ( array_keys( $required ) as $slug ) {
                    Maxi_AI_Playbook_Session::mark_acknowledged(
                        $slug,
                        $required[ $slug ],
                        $notes_hash
                    );
                }

                $sid = Maxi_AI_Rule_Session::get_session_id();
                maxi_ai_log(
                    'bootstrap-session: acknowledged playbook v' . $playbook_data['version']
                        . ' notes_hash=' . $notes_hash
                        . ' session=' . ( $sid ?? 'NULL' ),
                    'info',
                    [ 'component' => 'playbooks' ]
                );

                // -------------------------------------------------------
                // 7. Return assembled response.
                // -------------------------------------------------------
                return maxi_ai_response( true, [
                    'playbook'                 => $playbook_data,
                    'operator_notes'           => $operator_notes,
                    'operator_notes_revision'  => maxi_ai_operator_notes_revision_get(),
                    'knowledge_notes'          => $knowledge_headers,
                    'knowledge_notes_revision' => maxi_ai_knowledge_notes_revision_get(),
                    'available_docs'           => $available_docs,
                ] );

            },

            'permission_callback' => function () {
                return is_user_logged_in();
            },

        ]
    );

} );
