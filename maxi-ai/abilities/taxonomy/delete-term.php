<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/delete-term',
        [
            'label'       => 'Delete Term',
            'description' => 'Delete a term from a taxonomy.',
            'category'    => 'taxonomy',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'taxonomy',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'term_id' => [
                        'type'        => 'integer',
                        'description' => 'The term ID to delete.',
                    ],
                    'taxonomy' => [
                        'type'        => 'string',
                        'description' => 'The taxonomy.',
                    ],
                ],
                'required' => [ 'term_id', 'taxonomy' ],
            ],

            'execute_callback' => function ( $input ) {

                $term_id  = intval( $input['term_id'] ?? 0 );
                $taxonomy = sanitize_key( $input['taxonomy'] );

                if ( ! taxonomy_exists( $taxonomy ) ) {
                    return maxi_ai_response( false, [], 'Invalid taxonomy: ' . $taxonomy );
                }

                $result = wp_delete_term( $term_id, $taxonomy );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                if ( $result === false ) {
                    return maxi_ai_response( false, [], 'Term not found: ' . $term_id );
                }

                Maxi_AI_Audit_Log::record(
                    'taxonomy',
                    'term_deleted',
                    get_current_user_id(),
                    'term:' . $term_id,
                    [ 'taxonomy' => $taxonomy ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'term_id'  => $term_id,
                        'taxonomy' => $taxonomy,
                        'deleted'  => true,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_categories' );
            },

        ]
    );

} );
