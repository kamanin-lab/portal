<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Retry handler with exponential backoff for Maxi AI batch processing.
 */
class Maxi_AI_Retry_Handler {

    /**
     * Determine if an item should be retried.
     *
     * @param object $item Job item row from DB.
     * @return bool
     */
    public static function should_retry( $item ) {

        $attempts     = intval( $item->attempts ?? 0 );
        $max_attempts = intval( $item->max_attempts ?? 3 );

        return $attempts < $max_attempts;

    }

    /**
     * Calculate the next retry time using exponential backoff.
     *
     * Formula: base_delay * 2^(attempt - 1), capped at max_delay.
     *
     * @param int      $attempt      Current attempt number (1-based).
     * @param int|null $retry_after  Override delay from rate-limit header (seconds).
     * @return string MySQL datetime for the next attempt.
     */
    public static function get_next_attempt_at( $attempt, $retry_after = null ) {

        if ( $retry_after !== null && $retry_after > 0 ) {
            // Use the provider's Retry-After value.
            $delay = intval( $retry_after );
        } else {
            // Exponential backoff.
            $base_delay = intval( Maxi_AI_Config::get( 'retry_base_delay', 5 ) );
            $max_delay  = intval( Maxi_AI_Config::get( 'retry_max_delay', 300 ) );
            $delay      = min( $base_delay * pow( 2, $attempt - 1 ), $max_delay );
        }

        return gmdate( 'Y-m-d H:i:s', time() + $delay );

    }

    /**
     * Mark an item for retry — increment attempts, set next_attempt_at, reset status to pending.
     *
     * @param int         $item_id     Item ID.
     * @param string      $error       Error message.
     * @param int         $attempt     Current attempt number.
     * @param int|null    $retry_after Override delay from rate-limit header.
     * @return bool
     */
    public static function schedule_retry( $item_id, $error, $attempt, $retry_after = null ) {

        $next_at = self::get_next_attempt_at( $attempt, $retry_after );

        maxi_ai_log(
            sprintf( 'Scheduling retry #%d at %s', $attempt, $next_at ),
            'info',
            [ 'item' => $item_id ]
        );

        return Maxi_AI_Queue::update_item( $item_id, [
            'status'          => 'pending',
            'attempts'        => $attempt,
            'error'           => sanitize_text_field( $error ),
            'next_attempt_at' => $next_at,
        ] );

    }

    /**
     * Mark an item as permanently failed.
     *
     * @param int    $item_id Item ID.
     * @param string $error   Error message.
     * @param int    $attempt Final attempt number.
     * @return bool
     */
    public static function mark_failed( $item_id, $error, $attempt ) {

        maxi_ai_log(
            sprintf( 'Item permanently failed after %d attempts: %s', $attempt, $error ),
            'error',
            [ 'item' => $item_id ]
        );

        return Maxi_AI_Queue::update_item( $item_id, [
            'status'   => 'failed',
            'attempts' => $attempt,
            'error'    => sanitize_text_field( $error ),
        ] );

    }

    /**
     * Extract retry_after value from a WP_Error (if rate limited).
     *
     * @param WP_Error $error The error object.
     * @return int|null Seconds to wait, or null.
     */
    public static function extract_retry_after( $error ) {

        if ( ! is_wp_error( $error ) ) {
            return null;
        }

        if ( $error->get_error_code() !== 'rate_limited' ) {
            return null;
        }

        $data = $error->get_error_data( 'rate_limited' );

        return isset( $data['retry_after'] ) ? intval( $data['retry_after'] ) : null;

    }

}
