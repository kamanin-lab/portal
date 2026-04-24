<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/update-ai-settings',
        [
            'label'       => 'Update AI Settings',
            'description' => 'Update Maxi AI configuration. Merges provided fields into existing settings — only send fields you want to change. Supports provider selection per capability, API keys, retry config, and batch processing config.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'ai_settings_write',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [

                    // Per-capability provider selection.
                    'provider_image' => [
                        'type'        => 'string',
                        'description' => 'Default provider for image generation (e.g. "openai", "replicate", "bfl", "local").',
                    ],
                    'provider_text' => [
                        'type'        => 'string',
                        'description' => 'Default provider for text generation (e.g. "openai", "anthropic", "openrouter", "local").',
                    ],
                    'provider_vision' => [
                        'type'        => 'string',
                        'description' => 'Default provider for image analysis (e.g. "openai", "anthropic", "openrouter", "local").',
                    ],
                    'provider_edit_image' => [
                        'type'        => 'string',
                        'description' => 'Default provider for image editing (e.g. "openai", "bfl", "replicate", "local").',
                    ],

                    // API keys.
                    'openai_api_key' => [
                        'type'        => 'string',
                        'description' => 'OpenAI API key.',
                    ],
                    'openai_org_id' => [
                        'type'        => 'string',
                        'description' => 'OpenAI organization ID. Optional.',
                    ],
                    'anthropic_api_key' => [
                        'type'        => 'string',
                        'description' => 'Anthropic (Claude) API key.',
                    ],
                    'openrouter_api_key' => [
                        'type'        => 'string',
                        'description' => 'OpenRouter API key (sk-or-v1-...). Gives access to many upstream models via one key; use vendor-prefixed model slugs like "openai/gpt-4o-mini".',
                    ],
                    'replicate_api_key' => [
                        'type'        => 'string',
                        'description' => 'Replicate API key (for Flux models via Replicate).',
                    ],
                    'bfl_api_key' => [
                        'type'        => 'string',
                        'description' => 'BFL (Black Forest Labs) direct API key.',
                    ],
                    'local_endpoint' => [
                        'type'        => 'string',
                        'description' => 'Local AI endpoint URL (e.g. "http://localhost:11434/v1").',
                    ],

                    // Retry configuration.
                    'retry_max_attempts' => [
                        'type'        => 'integer',
                        'description' => 'Max retry attempts for failed items. Default 3.',
                    ],
                    'retry_base_delay' => [
                        'type'        => 'integer',
                        'description' => 'Base delay in seconds for exponential backoff. Default 5.',
                    ],
                    'retry_max_delay' => [
                        'type'        => 'integer',
                        'description' => 'Maximum delay in seconds for retries. Default 300.',
                    ],

                    // Batch / worker configuration.
                    'max_items_per_run' => [
                        'type'        => 'integer',
                        'description' => 'Max items processed per cron tick. Default 5.',
                    ],
                    'max_jobs_per_run' => [
                        'type'        => 'integer',
                        'description' => 'Max jobs picked up per cron tick. Default 3.',
                    ],
                    'max_runtime' => [
                        'type'        => 'integer',
                        'description' => 'Max worker runtime in seconds per cron tick. Default 50.',
                    ],

                    // HTTP client.
                    'http_timeout' => [
                        'type'        => 'integer',
                        'description' => 'HTTP request timeout in seconds. Default 60.',
                    ],
                ],
            ],

            'execute_callback' => function ( $input ) {

                // Allowed keys with their sanitization type.
                $allowed = [
                    'provider_image'      => 'key',
                    'provider_text'       => 'key',
                    'provider_vision'     => 'key',
                    'provider_edit_image' => 'key',
                    'openai_api_key'     => 'text',
                    'openai_org_id'      => 'text',
                    'anthropic_api_key'  => 'text',
                    'openrouter_api_key' => 'text',
                    'replicate_api_key'  => 'text',
                    'bfl_api_key'        => 'text',
                    'local_endpoint'     => 'url',
                    'retry_max_attempts' => 'int',
                    'retry_base_delay'   => 'int',
                    'retry_max_delay'    => 'int',
                    'max_items_per_run'  => 'int',
                    'max_jobs_per_run'   => 'int',
                    'max_runtime'        => 'int',
                    'http_timeout'       => 'int',
                ];

                $updates = [];

                foreach ( $allowed as $key => $type ) {

                    if ( ! isset( $input[ $key ] ) ) {
                        continue;
                    }

                    switch ( $type ) {
                        case 'key':
                            $updates[ $key ] = sanitize_key( $input[ $key ] );
                            break;
                        case 'text':
                            $updates[ $key ] = sanitize_text_field( $input[ $key ] );
                            break;
                        case 'url':
                            $updates[ $key ] = esc_url_raw( $input[ $key ] );
                            break;
                        case 'int':
                            $updates[ $key ] = intval( $input[ $key ] );
                            break;
                    }

                }

                if ( empty( $updates ) ) {
                    return maxi_ai_response( false, [], 'No valid settings fields provided.' );
                }

                // Keep plaintext copies for audit comparison and response masking.
                $credential_fields = [ 'openai_api_key', 'anthropic_api_key', 'openrouter_api_key', 'replicate_api_key', 'bfl_api_key' ];
                $plaintext_keys    = [];

                foreach ( $credential_fields as $secret ) {
                    if ( isset( $updates[ $secret ] ) && $updates[ $secret ] !== '' ) {
                        $plaintext_keys[ $secret ] = $updates[ $secret ];
                    }
                }

                // Encrypt API keys before persisting.
                if ( class_exists( 'Maxi_AI_Key_Encryption' ) ) {
                    foreach ( $plaintext_keys as $secret => $value ) {
                        $updates[ $secret ] = Maxi_AI_Key_Encryption::encrypt( $value );
                    }
                }

                // Merge with existing settings.
                $current  = get_option( 'maxi_ai_settings', [] );
                $current  = is_array( $current ) ? $current : [];
                $merged   = array_merge( $current, $updates );

                update_option( 'maxi_ai_settings', $merged );

                // Flush cached config so changes take effect immediately.
                Maxi_AI_Config::flush();

                // Audit any credential writes. Compare plaintext values to
                // detect actual changes (encrypted blobs differ on every call
                // due to random nonces).
                $credential_map = [
                    'openai_api_key'     => 'openai',
                    'anthropic_api_key'  => 'anthropic',
                    'openrouter_api_key' => 'openrouter',
                    'replicate_api_key'  => 'replicate',
                    'bfl_api_key'        => 'bfl',
                    'local_endpoint'     => 'local',
                ];

                $actor_id = get_current_user_id();

                foreach ( $credential_map as $field => $provider_id ) {
                    if ( ! array_key_exists( $field, $updates ) ) {
                        continue;
                    }

                    // Decrypt old value for comparison (it may be encrypted).
                    $old_raw = isset( $current[ $field ] ) ? (string) $current[ $field ] : '';
                    $old     = ( class_exists( 'Maxi_AI_Key_Encryption' ) && $old_raw !== '' )
                        ? Maxi_AI_Key_Encryption::decrypt( $old_raw )
                        : $old_raw;

                    // Use plaintext for the new credential (if it's a key field),
                    // otherwise use the raw update value (e.g. local_endpoint).
                    $new = $plaintext_keys[ $field ] ?? (string) $updates[ $field ];

                    if ( $old === $new ) {
                        continue;
                    }
                    if ( class_exists( 'Maxi_AI_Key_Audit' ) ) {
                        Maxi_AI_Key_Audit::record_settings_update( $provider_id, $new, $actor_id );
                    }
                }

                // Mask API keys in the response using plaintext values.
                $safe = $merged;

                foreach ( $credential_fields as $secret ) {
                    if ( ! empty( $safe[ $secret ] ) ) {
                        // Use plaintext for masking (DB value is encrypted).
                        $pt = $plaintext_keys[ $secret ] ?? '';
                        if ( $pt !== '' ) {
                            $safe[ $secret ] = substr( $pt, 0, 8 ) . '...' . substr( $pt, -4 );
                        } else {
                            $safe[ $secret ] = '***encrypted***';
                        }
                    }
                }

                return maxi_ai_response( true, [
                    'updated_fields' => array_keys( $updates ),
                    'settings'       => $safe,
                ] );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
