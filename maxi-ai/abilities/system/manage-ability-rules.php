<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/manage-ability-rules',
        [
            'label'       => 'Manage Ability Rules',
            'description' => 'Operator CRUD for site-level ability rules. Actions: "list" (optionally filter by source), "get" (by ability_id), "upsert" (author or override a rule — always stored as source=operator), "delete" (remove by ability_id). Operator rules are never overwritten by rules-sync.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => false ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'action' => [
                        'type'        => 'string',
                        'description' => 'One of: list, get, upsert, delete.',
                        'enum'        => [ 'list', 'get', 'upsert', 'delete' ],
                    ],
                    'ability_id' => [
                        'type'        => 'string',
                        'description' => 'Target ability, e.g. "maxi/update-content". Required for get, upsert, delete.',
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'Short human-readable title. Required for upsert.',
                    ],
                    'content' => [
                        'type'        => 'string',
                        'description' => 'Markdown body of the rule. Required for upsert.',
                    ],
                    'source' => [
                        'type'        => 'string',
                        'description' => 'Optional source filter for list action. One of: default, operator, docu.',
                        'enum'        => [ 'default', 'operator', 'docu' ],
                    ],
                    'delivery_mode' => [
                        'type'        => 'string',
                        'description' => 'Optional for upsert. How the gate delivers this rule to agents. "reject_first" (default, safe) refuses execution until the rule body is delivered via _meta._rule on a rejection and the agent retries. "inline_on_success" executes the ability on first call and delivers the rule alongside the successful response. Use reject_first for prescriptive or hybrid rules whose guidance must shape the call; inline_on_success only for purely descriptive rules that document what PHP guards already enforce.',
                        'enum'        => [ 'reject_first', 'inline_on_success' ],
                    ],
                ],
                'required' => [ 'action' ],
            ],

            'execute_callback' => function ( $input ) {

                $action = isset( $input['action'] ) ? (string) $input['action'] : '';

                switch ( $action ) {

                    case 'list':
                        $source = isset( $input['source'] ) ? (string) $input['source'] : null;
                        $rows   = Maxi_AI_Rule_Store::list_all( $source );

                        // Trim content previews for the list view to keep
                        // the response small. Full content is available via
                        // the "get" action.
                        $preview = array_map(
                            function ( $row ) {
                                return [
                                    'ability_id'    => $row['ability_id'],
                                    'title'         => $row['title'],
                                    'source'        => $row['source'],
                                    'version'       => (int) $row['version'],
                                    'status'        => $row['status'],
                                    'delivery_mode' => Maxi_AI_Rule_Store::normalize_delivery_mode( $row['delivery_mode'] ?? null ),
                                    'updated_at'    => $row['updated_at'],
                                    'chars'         => strlen( (string) $row['content'] ),
                                ];
                            },
                            $rows
                        );

                        return maxi_ai_response(
                            true,
                            [
                                'count' => count( $preview ),
                                'rules' => $preview,
                            ]
                        );

                    case 'get':
                        $ability_id = isset( $input['ability_id'] ) ? trim( (string) $input['ability_id'] ) : '';

                        if ( $ability_id === '' ) {
                            return maxi_ai_response( false, [], 'ability_id is required for get.' );
                        }

                        $row = Maxi_AI_Rule_Store::get( $ability_id );

                        if ( ! $row ) {
                            return maxi_ai_response( false, [ 'ability_id' => $ability_id ], 'Rule not found.' );
                        }

                        return maxi_ai_response(
                            true,
                            [
                                'ability_id'    => $row['ability_id'],
                                'title'         => $row['title'],
                                'content'       => $row['content'],
                                'source'        => $row['source'],
                                'version'       => (int) $row['version'],
                                'status'        => $row['status'],
                                'delivery_mode' => Maxi_AI_Rule_Store::normalize_delivery_mode( $row['delivery_mode'] ?? null ),
                                'created_at'    => $row['created_at'],
                                'updated_at'    => $row['updated_at'],
                            ]
                        );

                    case 'upsert':
                        $ability_id = isset( $input['ability_id'] ) ? trim( (string) $input['ability_id'] ) : '';
                        $title      = isset( $input['title'] ) ? (string) $input['title'] : '';
                        $content    = isset( $input['content'] ) ? (string) $input['content'] : '';

                        if ( $ability_id === '' ) {
                            return maxi_ai_response( false, [], 'ability_id is required for upsert.' );
                        }

                        if ( $title === '' || $content === '' ) {
                            return maxi_ai_response( false, [], 'title and content are required for upsert.' );
                        }

                        // Validate delivery_mode if supplied. Reject unknown
                        // values with a clear error rather than silently
                        // coercing — operators should know when their input
                        // was not accepted.
                        $delivery_mode_raw = $input['delivery_mode'] ?? null;

                        if ( $delivery_mode_raw !== null
                            && ! in_array( $delivery_mode_raw, Maxi_AI_Rule_Store::DELIVERY_MODES, true )
                        ) {
                            return maxi_ai_response(
                                false,
                                [
                                    'ability_id'   => $ability_id,
                                    'valid_values' => Maxi_AI_Rule_Store::DELIVERY_MODES,
                                ],
                                'Invalid delivery_mode. Use one of: reject_first, inline_on_success.'
                            );
                        }

                        // Operator authoring always writes source=operator.
                        // Pass the (validated) delivery_mode through, or null
                        // to preserve the existing mode on update / default
                        // to reject_first on insert.
                        $row_id = Maxi_AI_Rule_Store::upsert(
                            $ability_id,
                            $title,
                            $content,
                            Maxi_AI_Rule_Store::SOURCE_OPERATOR,
                            $delivery_mode_raw !== null ? (string) $delivery_mode_raw : null
                        );

                        if ( false === $row_id ) {
                            return maxi_ai_response( false, [ 'ability_id' => $ability_id ], 'Upsert failed.' );
                        }

                        // Re-fetch so the response reflects the persisted
                        // delivery_mode (may differ from input when caller
                        // passed null on an update).
                        $persisted = Maxi_AI_Rule_Store::get( $ability_id );

                        return maxi_ai_response(
                            true,
                            [
                                'ability_id'    => $ability_id,
                                'row_id'        => $row_id,
                                'source'        => Maxi_AI_Rule_Store::SOURCE_OPERATOR,
                                'delivery_mode' => $persisted
                                    ? Maxi_AI_Rule_Store::normalize_delivery_mode( $persisted['delivery_mode'] ?? null )
                                    : Maxi_AI_Rule_Store::DELIVERY_REJECT_FIRST,
                            ]
                        );

                    case 'delete':
                        $ability_id = isset( $input['ability_id'] ) ? trim( (string) $input['ability_id'] ) : '';

                        if ( $ability_id === '' ) {
                            return maxi_ai_response( false, [], 'ability_id is required for delete.' );
                        }

                        $deleted = Maxi_AI_Rule_Store::delete( $ability_id );

                        if ( false === $deleted ) {
                            return maxi_ai_response( false, [ 'ability_id' => $ability_id ], 'Delete failed.' );
                        }

                        return maxi_ai_response(
                            true,
                            [
                                'ability_id' => $ability_id,
                                'deleted'    => (int) $deleted,
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
