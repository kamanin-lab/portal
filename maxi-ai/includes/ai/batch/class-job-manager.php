<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Job lifecycle manager for Maxi AI.
 *
 * Handles job creation with items, status transitions, and progress tracking.
 */
class Maxi_AI_Job_Manager {

    /**
     * Create a job with multiple items.
     *
     * @param string $type     Job type (e.g. 'image_generation').
     * @param array  $items    Array of item input arrays.
     * @param array  $params   Job-level parameters.
     * @param int    $priority Job priority (1=urgent, 10=normal, 20=low).
     * @return array|WP_Error { job_id, item_count, status }
     */
    public static function create_job( $type, $items, $params = [], $priority = 10 ) {

        if ( empty( $items ) || ! is_array( $items ) ) {
            return new WP_Error( 'invalid_items', 'At least one item is required.' );
        }

        $max_attempts = intval( Maxi_AI_Config::get( 'retry_max_attempts', 3 ) );

        $job_id = Maxi_AI_Queue::create_job( [
            'type'         => $type,
            'priority'     => $priority,
            'params'       => $params,
            'max_attempts' => $max_attempts,
        ] );

        if ( is_wp_error( $job_id ) ) {
            return $job_id;
        }

        $item_count = 0;

        foreach ( $items as $item_input ) {
            $item_id = Maxi_AI_Queue::add_item( $job_id, $item_input, $max_attempts );

            if ( ! is_wp_error( $item_id ) ) {
                $item_count++;
            }
        }

        // Set total_items on the job.
        Maxi_AI_Queue::update_job( $job_id, [
            'total_items' => $item_count,
        ] );

        // Ensure cron is scheduled.
        self::ensure_cron();

        maxi_ai_log(
            sprintf( 'Job created: %d items, priority %d', $item_count, $priority ),
            'info',
            [ 'job' => $job_id, 'type' => $type ]
        );

        return [
            'job_id'     => $job_id,
            'item_count' => $item_count,
            'status'     => 'pending',
        ];

    }

    /**
     * Increment the processed_items counter on a job.
     *
     * @param int $job_id Job ID.
     */
    public static function increment_processed( $job_id ) {

        global $wpdb;

        $wpdb->query(
            $wpdb->prepare(
                "UPDATE %i SET processed_items = processed_items + 1, updated_at = %s WHERE id = %d",
                Maxi_AI_Queue::jobs_table(),
                current_time( 'mysql', true ),
                intval( $job_id )
            )
        );

    }

    /**
     * Increment the failed_items counter on a job.
     *
     * @param int $job_id Job ID.
     */
    public static function increment_failed( $job_id ) {

        global $wpdb;

        $wpdb->query(
            $wpdb->prepare(
                "UPDATE %i SET failed_items = failed_items + 1, updated_at = %s WHERE id = %d",
                Maxi_AI_Queue::jobs_table(),
                current_time( 'mysql', true ),
                intval( $job_id )
            )
        );

    }

    /**
     * Check if a job is complete and update its status.
     *
     * @param int $job_id Job ID.
     */
    public static function maybe_complete_job( $job_id ) {

        $job = Maxi_AI_Queue::get_job( $job_id );

        if ( ! $job ) {
            return;
        }

        $total     = intval( $job->total_items );
        $processed = intval( $job->processed_items );
        $failed    = intval( $job->failed_items );

        // Check if all items are done (processed + permanently failed = total).
        if ( ( $processed + $failed ) < $total ) {
            // Still have pending or retrying items — check if any are still actionable.
            $pending = Maxi_AI_Queue::get_pending_items( $job_id, 1 );

            if ( ! empty( $pending ) ) {
                return; // Still have items to process.
            }

            // No more pending items — re-count from DB to be sure.
            global $wpdb;

            $remaining = $wpdb->get_var(
                $wpdb->prepare(
                    "SELECT COUNT(*) FROM %i WHERE job_id = %d AND status = 'pending'",
                    Maxi_AI_Queue::items_table(),
                    intval( $job_id )
                )
            );

            if ( intval( $remaining ) > 0 ) {
                return; // Items with future next_attempt_at.
            }
        }

        // All done.
        $final_status = $failed >= $total ? 'failed' : 'completed';

        Maxi_AI_Queue::update_job( $job_id, [
            'status'       => $final_status,
            'completed_at' => current_time( 'mysql', true ),
        ] );

        maxi_ai_log(
            sprintf( 'Job %s: %d processed, %d failed of %d total', $final_status, $processed, $failed, $total ),
            'info',
            [ 'job' => $job_id ]
        );

    }

    /**
     * Get full job status with items.
     *
     * @param int $job_id Job ID.
     * @return array|WP_Error
     */
    public static function get_status( $job_id ) {

        $job = Maxi_AI_Queue::get_job( $job_id );

        if ( ! $job ) {
            return new WP_Error( 'job_not_found', 'Job not found: ' . $job_id );
        }

        $items = Maxi_AI_Queue::get_items( $job_id );

        // Decode JSON fields.
        $job_data = (array) $job;
        $job_data['params'] = json_decode( $job->params ?? '{}', true );
        $job_data['result'] = json_decode( $job->result ?? '{}', true );

        $items_data = array_map( function ( $item ) {
            $row = (array) $item;
            $row['input']  = json_decode( $item->input ?? '{}', true );
            $row['output'] = json_decode( $item->output ?? '{}', true );
            return $row;
        }, $items );

        $job_data['progress'] = 0;
        if ( intval( $job->total_items ) > 0 ) {
            $job_data['progress'] = round(
                ( intval( $job->processed_items ) + intval( $job->failed_items ) ) / intval( $job->total_items ) * 100,
                1
            );
        }

        return [
            'job'   => $job_data,
            'items' => $items_data,
        ];

    }

    /**
     * Ensure the batch processing cron event is scheduled.
     */
    private static function ensure_cron() {

        if ( ! wp_next_scheduled( 'maxi_ai_process_batch' ) ) {
            wp_schedule_event( time(), 'every_minute', 'maxi_ai_process_batch' );
        }

    }

}
