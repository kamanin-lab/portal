<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/schedule-content',
        [
            'label'       => 'Schedule Content',
            'description' => 'Schedule a post, page, or custom post type entry for future publication.',
            'category'    => 'content',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'content_write_basic',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'post_id' => [
                        'type'        => 'integer',
                        'description' => 'The post ID to schedule.',
                    ],
                    'date' => [
                        'type'        => 'string',
                        'description' => 'Future publish date (Y-m-d H:i:s).',
                    ],
                ],
                'required' => [ 'post_id', 'date' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_id = intval( $input['post_id'] ?? 0 );
                $date    = sanitize_text_field( $input['date'] ?? '' );
                $post    = get_post( $post_id );

                if ( ! $post ) {
                    return maxi_ai_response( false, [], 'Post not found: ' . $post_id );
                }

                if ( ! current_user_can( 'edit_post', $post_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to edit this post.' );
                }

                // Date format validation.
                $dt = \DateTime::createFromFormat( 'Y-m-d H:i:s', $date );
                if ( ! $dt || $dt->format( 'Y-m-d H:i:s' ) !== $date ) {
                    return maxi_ai_response( false, [], 'Invalid date format. Expected Y-m-d H:i:s.' );
                }

                if ( strtotime( $date ) <= time() ) {
                    return maxi_ai_response( false, [], 'Date must be in the future.' );
                }

                $result = wp_update_post(
                    [
                        'ID'          => $post_id,
                        'post_status' => 'future',
                        'post_date'   => $date,
                    ],
                    true
                );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                Maxi_AI_Audit_Log::record(
                    'content',
                    'content_scheduled',
                    get_current_user_id(),
                    'post:' . $post_id,
                    [ 'date' => $date ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id'        => $post_id,
                        'scheduled_date' => $date,
                        'status'         => 'future',
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'publish_posts' );
            },

        ]
    );

} );
