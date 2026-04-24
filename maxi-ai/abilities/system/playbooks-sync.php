<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/playbooks-sync',
        [
            'label'       => 'Sync Playbooks',
            'description' => 'Install or refresh the baseline playbooks shipped with the plugin. Re-seeds defaults from includes/playbooks/default-playbooks.php. Operator-authored playbooks are never overwritten. Call this when an ability returns playbooks_not_installed.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'session_system',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => new \stdClass(),
                'required'   => [],
            ],

            'execute_callback' => function ( $input ) {

                $count = Maxi_AI_Playbook_Store::seed_defaults();

                if ( $count > 0 ) {
                    do_action( 'maxi_ai_audit', 'playbooks_reseeded', [
                        'rows_affected' => $count,
                        'trigger'       => 'manual',
                    ] );
                }

                return maxi_ai_response(
                    true,
                    [
                        'synced'  => $count,
                        'source'  => Maxi_AI_Playbook_Store::SOURCE_DEFAULT,
                        'message' => sprintf(
                            '%d baseline playbook(s) installed or refreshed. Operator playbooks were preserved.',
                            $count
                        ),
                    ]
                );

            },

            'permission_callback' => function () {
                // Editors need to sync playbooks to bootstrap their session.
                // This only re-seeds shipped defaults; no destructive action.
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
