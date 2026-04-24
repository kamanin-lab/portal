<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/clear-transients',
        [
            'label'       => 'Clear Transients',
            'description' => 'Delete all expired transients, or a specific transient by name.',
            'category'    => 'development',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'dev_tools_basic',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'name' => [
                        'type'        => 'string',
                        'description' => 'Specific transient name to delete. Omit to delete all expired transients.',
                    ],
                ],
                'required' => [],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! empty( $input['name'] ) ) {
                    $name   = sanitize_key( $input['name'] );
                    $result = delete_transient( $name );

                    return maxi_ai_response(
                        true,
                        [
                            'action'    => 'deleted_single',
                            'transient' => $name,
                            'existed'   => $result,
                        ]
                    );
                }

                global $wpdb;

                $count = $wpdb->query(
                    $wpdb->prepare(
                        "DELETE a, b FROM {$wpdb->options} a
                        LEFT JOIN {$wpdb->options} b
                            ON b.option_name = CONCAT('_transient_timeout_', SUBSTRING(a.option_name, %d))
                        WHERE a.option_name LIKE %s
                            AND b.option_value < %d",
                        strlen( '_transient_' ) + 1,
                        $wpdb->esc_like( '_transient_' ) . '%',
                        time()
                    )
                );

                return maxi_ai_response(
                    true,
                    [
                        'action'       => 'cleared_expired',
                        'rows_deleted' => (int) $count,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
