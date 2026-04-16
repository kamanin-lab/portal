<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-ai-settings',
        [
            'label'       => 'Get AI Settings',
            'description' => 'Return the current non-credential Maxi AI configuration: default providers per capability, retry tuning, batch/worker tuning, HTTP timeout, and non-secret identifiers (openai_org_id, local_endpoint). API keys are omitted — use list-provider-keys for credential state and metadata.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [],
                'required'   => [],
            ],

            'execute_callback' => function () {

                // Whitelist of non-credential keys. Mirrors the write surface of
                // maxi/update-ai-settings minus the four raw API key fields, which
                // are intentionally omitted — credential state is exposed via
                // maxi/list-provider-keys with richer metadata (masked prefix,
                // rotation timestamps, last-used, staleness).
                $allowed = [
                    // Per-capability provider selection.
                    'provider_image',
                    'provider_text',
                    'provider_vision',

                    // Non-secret identifiers.
                    'openai_org_id',
                    'local_endpoint',

                    // Retry tuning.
                    'retry_max_attempts',
                    'retry_base_delay',
                    'retry_max_delay',

                    // Batch / worker tuning.
                    'max_items_per_run',
                    'max_jobs_per_run',
                    'max_runtime',

                    // HTTP client.
                    'http_timeout',
                ];

                // Read directly from the canonical option. Maxi_AI_Config is just a
                // cache over this — update-ai-settings flushes it after writes — so
                // a direct read avoids any cache-freshness ambiguity.
                $stored = get_option( 'maxi_ai_settings', [] );
                $stored = is_array( $stored ) ? $stored : [];

                // Omit keys that aren't present, rather than returning nulls. Keeps
                // the payload honest about what's actually stored; agents that want
                // the full field list can call mcp-adapter-get-ability-info on
                // maxi/update-ai-settings to see the schema.
                $settings = [];

                foreach ( $allowed as $key ) {
                    if ( array_key_exists( $key, $stored ) ) {
                        $settings[ $key ] = $stored[ $key ];
                    }
                }

                // Cast to object so an empty result serializes as `{}` rather than
                // `[]` — PHP's empty-array JSON quirk would otherwise produce an
                // array on empty sites, which clients reading `settings.foo` would
                // trip over.
                return maxi_ai_response( true, [ 'settings' => (object) $settings ] );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
