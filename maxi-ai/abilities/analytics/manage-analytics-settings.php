<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/manage-analytics-settings',
        [
            'label'       => 'Manage Analytics Settings',
            'description' => 'View or update analytics configuration. '
                           . 'Currently supports setting the analytics provider ("server" for Maxi Web Analytics, '
                           . '"ga4" reserved for future Google Analytics integration). '
                           . 'Use action "get" to view current settings, "update" to change them.',
            'category'    => 'analytics',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'analytics',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'action' => [
                        'type'        => 'string',
                        'enum'        => [ 'get', 'update' ],
                        'description' => 'Action to perform: "get" current settings or "update" them.',
                    ],
                    'provider' => [
                        'type'        => 'string',
                        'enum'        => [ 'server', 'ga4' ],
                        'description' => 'Analytics provider to use. "server" = Maxi Web Analytics (local tracking). "ga4" = Google Analytics 4 (future).',
                    ],
                ],
                'required' => [ 'action' ],
            ],

            'execute_callback' => function ( $input ) {

                $action    = sanitize_key( $input['action'] ?? '' );
                $option_key = 'maxi_ai_analytics_settings';

                if ( ! in_array( $action, [ 'get', 'update' ], true ) ) {
                    return maxi_ai_response( false, [], 'Invalid action. Use "get" or "update".' );
                }

                $settings = get_option( $option_key, [
                    'provider' => 'server',
                ] );

                if ( ! is_array( $settings ) ) {
                    $settings = [ 'provider' => 'server' ];
                }

                if ( $action === 'get' ) {

                    // Enrich with status info.
                    $tracker_active = class_exists( 'MWA_Tracker' );

                    return maxi_ai_response( true, [
                        'settings'              => $settings,
                        'maxi_web_analytics'    => $tracker_active ? 'active' : 'not_active',
                        'available_providers'   => [
                            'server' => [
                                'label'  => 'Maxi Web Analytics',
                                'status' => $tracker_active ? 'available' : 'requires_plugin',
                            ],
                            'ga4' => [
                                'label'  => 'Google Analytics 4',
                                'status' => 'coming_soon',
                            ],
                        ],
                    ] );

                }

                // Update.
                $provider = sanitize_key( $input['provider'] ?? '' );

                if ( $provider === '' ) {
                    return maxi_ai_response( false, [], 'Missing "provider" parameter.' );
                }

                $allowed_providers = [ 'server', 'ga4' ];

                if ( ! in_array( $provider, $allowed_providers, true ) ) {
                    return maxi_ai_response( false, [], 'Invalid provider. Allowed: ' . implode( ', ', $allowed_providers ) );
                }

                if ( $provider === 'ga4' ) {
                    return maxi_ai_response( false, [], 'Google Analytics 4 integration is not yet available. Use "server" for now.' );
                }

                if ( $provider === 'server' && ! class_exists( 'MWA_Tracker' ) ) {
                    return maxi_ai_response(
                        false,
                        [],
                        'Maxi Web Analytics plugin is not active. Install and activate it before selecting "server" provider.'
                    );
                }

                $settings['provider'] = $provider;
                update_option( $option_key, $settings );

                Maxi_AI_Audit_Log::record(
                    'analytics',
                    'analytics_settings_updated',
                    get_current_user_id(),
                    'provider:' . $provider,
                    [ 'settings' => $settings ]
                );

                return maxi_ai_response( true, [
                    'settings' => $settings,
                    'message'  => 'Analytics provider set to "' . $provider . '".',
                ] );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
