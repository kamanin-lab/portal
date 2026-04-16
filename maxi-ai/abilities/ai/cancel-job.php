<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/cancel-job',
        [
            'label'       => 'Cancel AI Job',
            'description' => 'Cancel a pending or running AI batch job. Sets the job and all its pending/processing items to cancelled status. Already completed or failed items are not affected.',
            'category'    => 'ai',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'job_id' => [
                        'type'        => 'integer',
                        'description' => 'The batch job ID to cancel.',
                    ],
                ],
                'required' => [ 'job_id' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'Maxi_AI_Queue' ) ) {
                    return maxi_ai_response( false, [], 'Maxi AI batch system is not loaded.' );
                }

                $job_id = intval( $input['job_id'] ?? 0 );

                if ( $job_id <= 0 ) {
                    return maxi_ai_response( false, [], 'A valid job_id is required.' );
                }

                $job = Maxi_AI_Queue::get_job( $job_id );

                if ( ! $job ) {
                    return maxi_ai_response( false, [], 'Job not found: ' . $job_id );
                }

                if ( in_array( $job->status, [ 'completed', 'failed', 'cancelled' ], true ) ) {
                    return maxi_ai_response( false, [], 'Job is already ' . $job->status . '.' );
                }

                $cancelled_items = Maxi_AI_Queue::cancel_job( $job_id );

                maxi_ai_log(
                    sprintf( 'Job cancelled — %d items cancelled', $cancelled_items ),
                    'info',
                    [ 'job' => $job_id ]
                );

                return maxi_ai_response( true, [
                    'job_id'          => $job_id,
                    'status'          => 'cancelled',
                    'cancelled_items' => $cancelled_items,
                ] );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
