<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/manage-playbooks',
        [
            'label'       => 'Manage Playbooks',
            'description' => 'Operator CRUD for site-level playbooks. Actions: "list" (optionally filter by source), '
                           . '"get" (by slug), "upsert" (create or update a playbook — always stored as source=operator), '
                           . '"delete" (remove by slug — required playbooks cannot be deleted). '
                           . 'Operator playbooks are never overwritten by plugin updates.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'action' => [
                        'type'        => 'string',
                        'description' => 'One of: list, get, upsert, delete.',
                        'enum'        => [ 'list', 'get', 'upsert', 'delete' ],
                    ],
                    'slug' => [
                        'type'        => 'string',
                        'description' => 'Target playbook slug, e.g. "my-custom-playbook". Required for get, upsert, delete.',
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'Short human-readable title. Required for upsert.',
                    ],
                    'content' => [
                        'type'        => 'string',
                        'description' => 'Markdown body of the playbook. Required for upsert.',
                    ],
                    'required' => [
                        'type'        => 'boolean',
                        'description' => 'Whether the playbook gate should enforce reading via bootstrap. Defaults to false (on-demand). Use with caution — required playbooks block all abilities until acknowledged.',
                    ],
                    'source' => [
                        'type'        => 'string',
                        'description' => 'Optional source filter for list action. One of: default, operator, docu.',
                        'enum'        => [ 'default', 'operator', 'docu' ],
                    ],
                ],
                'required' => [ 'action' ],
            ],

            'execute_callback' => function ( $input ) {

                $action = isset( $input['action'] ) ? (string) $input['action'] : '';

                switch ( $action ) {

                    case 'list':
                        $source = isset( $input['source'] ) ? (string) $input['source'] : null;

                        if ( $source && ! in_array( $source, [ 'default', 'operator', 'docu' ], true ) ) {
                            return maxi_ai_response( false, [], 'Invalid source. Use one of: default, operator, docu.' );
                        }

                        $rows = Maxi_AI_Playbook_Store::list_all( $source );

                        $preview = array_map(
                            function ( $row ) {
                                return [
                                    'slug'       => $row['slug'],
                                    'title'      => $row['title'],
                                    'source'     => $row['source'],
                                    'required'   => (int) $row['required'],
                                    'version'    => (int) $row['version'],
                                    'status'     => $row['status'],
                                    'updated_at' => $row['updated_at'],
                                    'chars'      => strlen( (string) $row['content'] ),
                                ];
                            },
                            $rows
                        );

                        return maxi_ai_response(
                            true,
                            [
                                'count'     => count( $preview ),
                                'playbooks' => $preview,
                            ]
                        );

                    case 'get':
                        $slug = isset( $input['slug'] ) ? sanitize_key( trim( (string) $input['slug'] ) ) : '';

                        if ( $slug === '' ) {
                            return maxi_ai_response( false, [], 'slug is required for get.' );
                        }

                        $row = Maxi_AI_Playbook_Store::get( $slug );

                        if ( ! $row ) {
                            return maxi_ai_response( false, [ 'slug' => $slug ], 'Playbook not found.' );
                        }

                        return maxi_ai_response(
                            true,
                            [
                                'slug'       => $row['slug'],
                                'title'      => $row['title'],
                                'content'    => $row['content'],
                                'source'     => $row['source'],
                                'required'   => (int) $row['required'],
                                'version'    => (int) $row['version'],
                                'status'     => $row['status'],
                                'created_at' => $row['created_at'],
                                'updated_at' => $row['updated_at'],
                            ]
                        );

                    case 'upsert':
                        $slug    = isset( $input['slug'] ) ? sanitize_key( trim( (string) $input['slug'] ) ) : '';
                        $title   = isset( $input['title'] ) ? sanitize_text_field( (string) $input['title'] ) : '';
                        $content = isset( $input['content'] ) ? (string) $input['content'] : '';

                        if ( $slug === '' ) {
                            return maxi_ai_response( false, [], 'slug is required for upsert.' );
                        }

                        if ( $title === '' || $content === '' ) {
                            return maxi_ai_response( false, [], 'title and content are required for upsert.' );
                        }

                        // Preserve existing required flag when not explicitly provided.
                        if ( isset( $input['required'] ) ) {
                            $required = (bool) $input['required'];
                        } else {
                            $existing = Maxi_AI_Playbook_Store::get( $slug );
                            $required = $existing ? (bool) $existing['required'] : false;
                        }

                        // Operator authoring always writes source=operator.
                        $row_id = Maxi_AI_Playbook_Store::upsert(
                            $slug,
                            $title,
                            $content,
                            Maxi_AI_Playbook_Store::SOURCE_OPERATOR,
                            $required
                        );

                        if ( false === $row_id ) {
                            return maxi_ai_response( false, [ 'slug' => $slug ], 'Upsert failed.' );
                        }

                        return maxi_ai_response(
                            true,
                            [
                                'slug'   => $slug,
                                'row_id' => $row_id,
                                'source' => Maxi_AI_Playbook_Store::SOURCE_OPERATOR,
                            ]
                        );

                    case 'delete':
                        $slug = isset( $input['slug'] ) ? sanitize_key( trim( (string) $input['slug'] ) ) : '';

                        if ( $slug === '' ) {
                            return maxi_ai_response( false, [], 'slug is required for delete.' );
                        }

                        // Protect required playbooks from deletion.
                        $existing = Maxi_AI_Playbook_Store::get( $slug );

                        if ( ! $existing ) {
                            return maxi_ai_response( false, [ 'slug' => $slug ], 'Playbook not found.' );
                        }

                        if ( (int) $existing['required'] === 1 ) {
                            return maxi_ai_response(
                                false,
                                [ 'slug' => $slug ],
                                'Cannot delete a required playbook. Required playbooks are enforced by the bootstrap gate — removing them would block all agent sessions.'
                            );
                        }

                        $deleted = Maxi_AI_Playbook_Store::delete( $slug );

                        if ( false === $deleted ) {
                            return maxi_ai_response( false, [ 'slug' => $slug ], 'Delete failed.' );
                        }

                        return maxi_ai_response(
                            true,
                            [
                                'slug'    => $slug,
                                'deleted' => (int) $deleted,
                            ]
                        );

                    default:
                        return maxi_ai_response( false, [], 'Unknown action. Use one of: list, get, upsert, delete.' );
                }

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
