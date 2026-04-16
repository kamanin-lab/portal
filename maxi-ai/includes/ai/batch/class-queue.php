<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Database-backed job queue for Maxi AI.
 *
 * Provides CRUD operations for jobs and job items.
 */
class Maxi_AI_Queue {

    /**
     * Get the jobs table name.
     *
     * @return string
     */
    public static function jobs_table() {

        global $wpdb;
        return $wpdb->prefix . 'maxi_ai_jobs';

    }

    /**
     * Get the job items table name.
     *
     * @return string
     */
    public static function items_table() {

        global $wpdb;
        return $wpdb->prefix . 'maxi_ai_job_items';

    }

    /**
     * Create a new job.
     *
     * @param array $data {
     *     @type string $type         Job type (e.g. 'image_generation').
     *     @type int    $priority     Priority (1=urgent, 10=normal, 20=low). Default 10.
     *     @type array  $params       Job-level parameters.
     *     @type int    $max_attempts Max retry attempts. Default 3.
     * }
     * @return int|WP_Error Job ID on success.
     */
    public static function create_job( $data ) {

        global $wpdb;

        $now = current_time( 'mysql', true );

        $result = $wpdb->insert(
            self::jobs_table(),
            [
                'type'         => sanitize_key( $data['type'] ?? 'generic' ),
                'status'       => 'pending',
                'priority'     => intval( $data['priority'] ?? 10 ),
                'params'       => wp_json_encode( $data['params'] ?? [] ),
                'max_attempts' => intval( $data['max_attempts'] ?? 3 ),
                'created_at'   => $now,
                'updated_at'   => $now,
            ],
            [ '%s', '%s', '%d', '%s', '%d', '%s', '%s' ]
        );

        if ( $result === false ) {
            return new WP_Error( 'db_error', 'Failed to create job: ' . $wpdb->last_error );
        }

        return $wpdb->insert_id;

    }

    /**
     * Add an item to a job.
     *
     * @param int   $job_id Job ID.
     * @param array $input  Item input data.
     * @param int   $max_attempts Max retry attempts.
     * @return int|WP_Error Item ID on success.
     */
    public static function add_item( $job_id, $input, $max_attempts = 3 ) {

        global $wpdb;

        $now = current_time( 'mysql', true );

        $result = $wpdb->insert(
            self::items_table(),
            [
                'job_id'       => intval( $job_id ),
                'status'       => 'pending',
                'input'        => wp_json_encode( $input ),
                'max_attempts' => intval( $max_attempts ),
                'created_at'   => $now,
                'updated_at'   => $now,
            ],
            [ '%d', '%s', '%s', '%d', '%s', '%s' ]
        );

        if ( $result === false ) {
            return new WP_Error( 'db_error', 'Failed to add job item: ' . $wpdb->last_error );
        }

        return $wpdb->insert_id;

    }

    /**
     * Get a job by ID.
     *
     * @param int $job_id Job ID.
     * @return object|null
     */
    public static function get_job( $job_id ) {

        global $wpdb;

        return $wpdb->get_row(
            $wpdb->prepare(
                "SELECT * FROM %i WHERE id = %d",
                self::jobs_table(),
                intval( $job_id )
            )
        );

    }

    /**
     * Get all items for a job.
     *
     * @param int $job_id Job ID.
     * @return array
     */
    public static function get_items( $job_id ) {

        global $wpdb;

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM %i WHERE job_id = %d ORDER BY id ASC",
                self::items_table(),
                intval( $job_id )
            )
        );

    }

    /**
     * Update a job's fields.
     *
     * @param int   $job_id Job ID.
     * @param array $data   Fields to update.
     * @return bool
     */
    public static function update_job( $job_id, $data ) {

        global $wpdb;

        $data['updated_at'] = current_time( 'mysql', true );

        return $wpdb->update(
            self::jobs_table(),
            $data,
            [ 'id' => intval( $job_id ) ]
        ) !== false;

    }

    /**
     * Update an item's fields.
     *
     * @param int   $item_id Item ID.
     * @param array $data    Fields to update.
     * @return bool
     */
    public static function update_item( $item_id, $data ) {

        global $wpdb;

        $data['updated_at'] = current_time( 'mysql', true );

        return $wpdb->update(
            self::items_table(),
            $data,
            [ 'id' => intval( $item_id ) ]
        ) !== false;

    }

    /**
     * Fetch pending jobs that are not locked, ordered by priority.
     *
     * @param int $limit Max jobs to return.
     * @return array
     */
    public static function get_pending_jobs( $limit = 3 ) {

        global $wpdb;

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM %i
                 WHERE status IN ('pending', 'processing')
                 AND locked_at IS NULL
                 ORDER BY priority ASC, created_at ASC
                 LIMIT %d",
                self::jobs_table(),
                intval( $limit )
            )
        );

    }

    /**
     * Fetch pending items for a job that are ready to process.
     *
     * @param int $job_id Job ID.
     * @param int $limit  Max items to return.
     * @return array
     */
    public static function get_pending_items( $job_id, $limit = 5 ) {

        global $wpdb;

        $now = current_time( 'mysql', true );

        return $wpdb->get_results(
            $wpdb->prepare(
                "SELECT * FROM %i
                 WHERE job_id = %d
                 AND status = 'pending'
                 AND (next_attempt_at IS NULL OR next_attempt_at <= %s)
                 ORDER BY id ASC
                 LIMIT %d",
                self::items_table(),
                intval( $job_id ),
                $now,
                intval( $limit )
            )
        );

    }

    /**
     * Atomically lock a job for processing.
     *
     * @param int    $job_id    Job ID.
     * @param string $worker_id Worker identifier.
     * @return bool True if lock acquired.
     */
    public static function lock_job( $job_id, $worker_id ) {

        global $wpdb;

        $now = current_time( 'mysql', true );

        $affected = $wpdb->query(
            $wpdb->prepare(
                "UPDATE %i
                 SET locked_at = %s, locked_by = %s, status = 'processing', updated_at = %s
                 WHERE id = %d AND locked_at IS NULL",
                self::jobs_table(),
                $now,
                sanitize_text_field( $worker_id ),
                $now,
                intval( $job_id )
            )
        );

        return $affected > 0;

    }

    /**
     * Release the lock on a job.
     *
     * @param int $job_id Job ID.
     * @return bool
     */
    public static function unlock_job( $job_id ) {

        global $wpdb;

        return $wpdb->query(
            $wpdb->prepare(
                "UPDATE %i
                 SET locked_at = NULL, locked_by = NULL, updated_at = %s
                 WHERE id = %d",
                self::jobs_table(),
                current_time( 'mysql', true ),
                intval( $job_id )
            )
        ) !== false;

    }

    /**
     * Reset locks older than the stale threshold.
     *
     * Jobs locked longer than max_execution_time + buffer are assumed
     * abandoned (worker crashed / timed out). Reset them so they can
     * be picked up again on the next cron tick.
     *
     * @param int $threshold_seconds Seconds after which a lock is stale. Default 300 (5 min).
     * @return int Number of locks reset.
     */
    public static function reset_stale_locks( int $threshold_seconds = 300 ): int {

        global $wpdb;

        $cutoff = gmdate( 'Y-m-d H:i:s', time() - $threshold_seconds );

        $affected = $wpdb->query(
            $wpdb->prepare(
                "UPDATE %i
                 SET locked_at = NULL, locked_by = NULL, updated_at = %s
                 WHERE locked_at IS NOT NULL
                 AND locked_at < %s
                 AND status = 'processing'",
                self::jobs_table(),
                current_time( 'mysql', true ),
                $cutoff
            )
        );

        if ( $affected > 0 ) {
            maxi_ai_log(
                sprintf( 'Reset %d stale job lock(s) older than %ds', $affected, $threshold_seconds ),
                'warning',
                [ 'component' => 'batch' ]
            );
        }

        return (int) $affected;

    }

    /**
     * Cancel a job and its pending items.
     *
     * @param int $job_id Job ID.
     * @return int Number of items cancelled.
     */
    public static function cancel_job( $job_id ) {

        global $wpdb;

        $now = current_time( 'mysql', true );

        // Cancel pending/processing items.
        $cancelled = $wpdb->query(
            $wpdb->prepare(
                "UPDATE %i
                 SET status = 'cancelled', updated_at = %s
                 WHERE job_id = %d AND status IN ('pending', 'processing')",
                self::items_table(),
                $now,
                intval( $job_id )
            )
        );

        // Cancel the job itself.
        $wpdb->update(
            self::jobs_table(),
            [
                'status'     => 'cancelled',
                'locked_at'  => null,
                'locked_by'  => null,
                'updated_at' => $now,
            ],
            [ 'id' => intval( $job_id ) ]
        );

        return intval( $cancelled );

    }

}
