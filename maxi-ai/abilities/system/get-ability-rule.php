<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-ability-rule',
        [
            'label'       => 'Get Ability Rule',
            'description' => 'Fetch the site rule for a Maxi AI ability and mark it acknowledged for the current MCP session. Call this before the first use of an ability in a session — the response contains the full markdown rule body. If no rule is installed for the ability, returns a rules_not_installed error with remediation = maxi/rules-sync.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'session_system',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'ability_id' => [
                        'type'        => 'string',
                        'description' => 'The ability whose rules you want to read, e.g. "maxi/update-content".',
                    ],
                ],
                'required' => [ 'ability_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $ability_id = isset( $input['ability_id'] ) ? trim( (string) $input['ability_id'] ) : '';

                if ( $ability_id === '' ) {
                    return maxi_ai_response( false, [], 'ability_id is required.' );
                }

                $rule = Maxi_AI_Rule_Store::get( $ability_id );

                if ( ! $rule ) {

                    return maxi_ai_response(
                        false,
                        [
                            'code'        => 'rules_not_installed',
                            'ability_id'  => $ability_id,
                            'remediation' => 'maxi/rules-sync',
                        ],
                        'No rule installed for ' . $ability_id . '. Run maxi/rules-sync to install defaults, or author one via maxi/manage-ability-rules.'
                    );
                }

                // Mark the current version as acknowledged for this MCP
                // session. Noop when called outside an MCP session. The gate
                // compares this against the live DB version and forces a
                // re-fetch when operators update the rule.
                $sid = Maxi_AI_Rule_Session::get_session_id();
                maxi_ai_log( 'get-ability-rule ack: ability=' . $ability_id . ' version=' . $rule['version'] . ' session=' . ( $sid ?? 'NULL' ), 'warning', [ 'component' => 'rules' ] );
                Maxi_AI_Rule_Session::mark_acknowledged( $ability_id, (int) $rule['version'] );

                return maxi_ai_response(
                    true,
                    [
                        'ability_id' => $rule['ability_id'],
                        'title'      => $rule['title'],
                        'content'    => $rule['content'],
                        'source'     => $rule['source'],
                        'version'    => (int) $rule['version'],
                        'status'     => $rule['status'],
                        'updated_at' => $rule['updated_at'],
                    ]
                );

            },

            'permission_callback' => function () {
                // Ability rules are readable by anyone who can call abilities.
                // The stored rule is operational guidance, not sensitive data.
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
