<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/get-job-status',
        [
            'label'       => 'Get AI Job Status',
            'description' => 'Get the status and progress of an AI batch job. Returns job details (status, priority, progress percentage, total/processed/failed item counts) and all item records with their individual statuses and outputs.',
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
                        'description' => 'The batch job ID.',
                    ],
                ],
                'required' => [ 'job_id' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'Maxi_AI_Job_Manager' ) ) {
                    return maxi_ai_response( false, [], 'Maxi AI batch system is not loaded.' );
                }

                $job_id = intval( $input['job_id'] ?? 0 );

                if ( $job_id <= 0 ) {
                    return maxi_ai_response( false, [], 'A valid job_id is required.' );
                }

                $result = Maxi_AI_Job_Manager::get_status( $job_id );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                return maxi_ai_response( true, $result );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
