<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-audit-events',
        [
            'label'       => 'Get Audit Events',
            'description' => 'Query the Maxi AI audit log. Returns append-only events across all categories — currently "key" (credential rotation / validation / settings writes) and "wp_cli" (rejected WP-CLI commands). Filter by category, event name, or a since timestamp. Paginated via limit + offset.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'ai_settings_read',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'category' => [
                        'type'        => 'string',
                        'description' => 'Optional category filter (e.g. "key", "wp_cli").',
                    ],
                    'event' => [
                        'type'        => 'string',
                        'description' => 'Optional specific event filter (e.g. "rotated", "validation_failed", "wp_cli_rejected").',
                    ],
                    'since' => [
                        'type'        => 'string',
                        'description' => 'Optional ISO datetime lower bound (e.g. "2026-04-01T00:00:00Z").',
                    ],
                    'limit' => [
                        'type'        => 'integer',
                        'description' => 'Max rows to return. Default 50, max 500.',
                    ],
                    'offset' => [
                        'type'        => 'integer',
                        'description' => 'Row offset for pagination. Default 0.',
                    ],
                ],
            ],

            'execute_callback' => function ( $input ) {

                $filters = [];

                if ( ! empty( $input['category'] ) ) {
                    $filters['category'] = sanitize_key( $input['category'] );
                }

                if ( ! empty( $input['event'] ) ) {
                    $filters['event'] = sanitize_key( $input['event'] );
                }

                if ( ! empty( $input['since'] ) ) {
                    $filters['since'] = sanitize_text_field( $input['since'] );
                }

                if ( isset( $input['limit'] ) ) {
                    $filters['limit'] = (int) $input['limit'];
                }

                if ( isset( $input['offset'] ) ) {
                    $filters['offset'] = (int) $input['offset'];
                }

                $result = Maxi_AI_Audit_Log::query( $filters );

                return maxi_ai_response( true, $result );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
