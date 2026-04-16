<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-playbook',
        [
            'label'       => 'Get Playbook',
            'description' => 'Fetch a reference playbook by slug. For on-demand docs like the architecture '
                           . 'reference (PLAYBOOK-DOC). Required playbooks must be fetched via maxi/bootstrap-session '
                           . 'instead — this ability rejects required slugs to prevent bootstrap bypass.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'slug' => [
                        'type'        => 'string',
                        'description' => 'Playbook slug, e.g. "architecture".',
                    ],
                ],
                'required' => [ 'slug' ],
            ],

            'execute_callback' => function ( $input ) {

                $slug = isset( $input['slug'] ) ? trim( (string) $input['slug'] ) : '';

                if ( $slug === '' ) {
                    return maxi_ai_response( false, [], 'slug is required.' );
                }

                $playbook = Maxi_AI_Playbook_Store::get( $slug );

                if ( ! $playbook ) {
                    return maxi_ai_response(
                        false,
                        [
                            'code' => 'playbook_not_found',
                            'slug' => $slug,
                        ],
                        'No playbook found with slug "' . $slug . '".'
                    );
                }

                // Reject required playbooks — they must come through bootstrap.
                if ( (int) $playbook['required'] === 1 ) {
                    return maxi_ai_response(
                        false,
                        [
                            'code'      => 'use_bootstrap',
                            'slug'      => $slug,
                            'handshake' => 'maxi/bootstrap-session',
                        ],
                        'Playbook "' . $slug . '" is required and must be fetched via maxi/bootstrap-session, '
                            . 'not directly. This ensures you also receive operator-notes and knowledge context.'
                    );
                }

                return maxi_ai_response(
                    true,
                    [
                        'slug'    => $playbook['slug'],
                        'title'   => $playbook['title'],
                        'content' => $playbook['content'],
                        'version' => (int) $playbook['version'],
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
