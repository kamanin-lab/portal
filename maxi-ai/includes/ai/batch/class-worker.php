<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * WP Cron batch worker for Maxi AI.
 *
 * Processes pending job items with locking, runtime limits, and progress tracking.
 */
class Maxi_AI_Worker {

    /**
     * Process pending batch jobs.
     *
     * Hooked to the `maxi_ai_process_batch` cron action.
     */
    public static function process() {

        $start       = time();
        $max_runtime = intval( Maxi_AI_Config::get( 'max_runtime', 50 ) );
        $max_jobs    = intval( Maxi_AI_Config::get( 'max_jobs_per_run', 3 ) );
        $max_items   = intval( Maxi_AI_Config::get( 'max_items_per_run', 5 ) );
        $worker_id   = 'worker-' . wp_generate_uuid4();

        // Reset stale locks from crashed/timed-out workers before picking up new jobs.
        Maxi_AI_Queue::reset_stale_locks();

        $jobs = Maxi_AI_Queue::get_pending_jobs( $max_jobs );

        if ( empty( $jobs ) ) {
            return;
        }

        maxi_ai_log(
            sprintf( 'Processing started — %d pending jobs, max_runtime=%ds', count( $jobs ), $max_runtime ),
            'info',
            [ 'worker' => $worker_id ]
        );

        $total_processed = 0;
        $total_retried   = 0;
        $total_failed    = 0;

        foreach ( $jobs as $job ) {

            // Runtime check.
            if ( time() - $start >= $max_runtime ) {
                maxi_ai_log(
                    'Max runtime reached, stopping.',
                    'info',
                    [ 'worker' => $worker_id ]
                );
                break;
            }

            // Try to acquire lock.
            $locked = Maxi_AI_Queue::lock_job( $job->id, $worker_id );

            if ( ! $locked ) {
                continue; // Another worker got it.
            }

            try {

                $items = Maxi_AI_Queue::get_pending_items( $job->id, $max_items );

                foreach ( $items as $item ) {

                    // Runtime check before each item.
                    if ( time() - $start >= $max_runtime ) {
                        break 2; // Break out of both loops.
                    }

                    $result = self::process_item( $job, $item );

                    if ( $result === 'success' ) {
                        $total_processed++;
                    } elseif ( $result === 'retry' ) {
                        $total_retried++;
                    } else {
                        $total_failed++;
                    }

                }

                // Check if the job is complete.
                Maxi_AI_Job_Manager::maybe_complete_job( $job->id );

            } finally {

                // Always release the lock.
                Maxi_AI_Queue::unlock_job( $job->id );

            }

        }

        maxi_ai_log(
            sprintf(
                'Processing complete — %d succeeded, %d retried, %d failed (runtime: %ds)',
                $total_processed,
                $total_retried,
                $total_failed,
                time() - $start
            ),
            'info',
            [ 'worker' => $worker_id ]
        );

    }

    /**
     * Process a single job item.
     *
     * @param object $job  Job row.
     * @param object $item Item row.
     * @return string 'success', 'retry', or 'failed'.
     */
    private static function process_item( $job, $item ) {

        $attempt = intval( $item->attempts ) + 1;
        $input   = json_decode( $item->input ?? '{}', true );
        $params  = json_decode( $job->params ?? '{}', true );
        $type    = $job->type ?? 'generic';

        // Mark item as processing.
        Maxi_AI_Queue::update_item( $item->id, [
            'status'   => 'processing',
            'attempts' => $attempt,
        ] );

        // Dispatch to the appropriate service.
        $result = self::dispatch( $type, $input, $params );

        if ( is_wp_error( $result ) ) {

            $error       = $result->get_error_message();
            $retry_after = Maxi_AI_Retry_Handler::extract_retry_after( $result );

            if ( Maxi_AI_Retry_Handler::should_retry( (object) [
                'attempts'     => $attempt,
                'max_attempts' => $item->max_attempts,
            ] ) ) {
                // Schedule retry.
                Maxi_AI_Retry_Handler::schedule_retry( $item->id, $error, $attempt, $retry_after );

                maxi_ai_log(
                    sprintf( 'Item failed (attempt %d), scheduling retry: %s', $attempt, $error ),
                    'info',
                    [ 'job' => $job->id, 'item' => $item->id ]
                );

                return 'retry';
            }

            // Permanently failed.
            Maxi_AI_Retry_Handler::mark_failed( $item->id, $error, $attempt );
            Maxi_AI_Job_Manager::increment_failed( $job->id );

            return 'failed';

        }

        // Success.
        Maxi_AI_Queue::update_item( $item->id, [
            'status'   => 'completed',
            'output'   => wp_json_encode( $result ),
            'attempts' => $attempt,
        ] );

        Maxi_AI_Job_Manager::increment_processed( $job->id );

        return 'success';

    }

    /**
     * Dispatch an item to the appropriate service based on job type.
     *
     * @param string $type   Job type.
     * @param array  $input  Item input.
     * @param array  $params Job-level params.
     * @return array|WP_Error
     */
    private static function dispatch( $type, $input, $params ) {

        // Merge job-level params with item input (item overrides).
        $merged = array_merge( $params, $input );

        switch ( $type ) {

            case 'image_generation':
                return Maxi_AI_Image_Generator::generate( $merged );

            case 'text_generation':
                return Maxi_AI_Text_Generator::generate( $merged );

            case 'vision_analysis':
                return Maxi_AI_Vision_Analyzer::analyze( $merged );

            default:
                /**
                 * Filter to handle custom job types.
                 *
                 * @param array|WP_Error $result Default error.
                 * @param string         $type   Job type.
                 * @param array          $input  Merged input.
                 */
                return apply_filters(
                    'maxi_ai_dispatch_job',
                    new WP_Error( 'unknown_type', 'Unknown job type: ' . $type ),
                    $type,
                    $merged
                );

        }

    }

}
