<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/rules-sync',
        [
            'label'       => 'Sync Ability Rules',
            'description' => 'Install or refresh the baseline ability rules shipped with the plugin. Phase 1: re-seeds defaults from includes/rules/default-rules.php. Phase 2 will also pull policies from docu. Operator-authored rules are never overwritten. Call this when an ability returns rules_not_installed.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => new \stdClass(),
                'required'   => [],
            ],

            'execute_callback' => function ( $input ) {

                // Phase 1: the only sync is the baseline seeder. Phase 2 will
                // wire this to a docu HTTP client without touching the
                // ability shape.
                $count = Maxi_AI_Rule_Store::seed_defaults();

                return maxi_ai_response(
                    true,
                    [
                        'synced'  => $count,
                        'source'  => Maxi_AI_Rule_Store::SOURCE_DEFAULT,
                        'message' => sprintf(
                            '%d baseline rule(s) installed or refreshed. Operator rules were preserved.',
                            $count
                        ),
                    ]
                );

            },

            'permission_callback' => function () {
                // Editors need to sync rules to bootstrap their session.
                // This only re-seeds shipped defaults; no destructive action.
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
