<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Immutable value object representing a license validation result.
 *
 * Returned by every provider method and cached as a transient by the
 * license manager. Provides to_array() / from_array() for serialization.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_License_Status {

    /**
     * Valid status constants.
     */
    const STATUS_ACTIVE       = 'active';
    const STATUS_EXPIRED      = 'expired';
    const STATUS_INACTIVE     = 'inactive';
    const STATUS_INVALID      = 'invalid';
    const STATUS_GRACE_PERIOD = 'grace_period';
    const STATUS_DISABLED     = 'disabled';

    /**
     * Whether the license currently grants pro access.
     *
     * @var bool
     */
    public $is_valid;

    /**
     * License status string.
     *
     * @var string One of the STATUS_* constants.
     */
    public $status;

    /**
     * Masked license key for display (e.g. 'XXXX-XXXX-XXXX-7f3a').
     *
     * @var string
     */
    public $license_key_masked;

    /**
     * ISO 8601 expiration date, or null for lifetime licenses.
     *
     * @var string|null
     */
    public $expires_at;

    /**
     * ISO 8601 end of grace period, or null if not in grace.
     *
     * @var string|null
     */
    public $grace_until;

    /**
     * The domain this license is activated on.
     *
     * @var string
     */
    public $licensed_domain;

    /**
     * The activation instance ID from the provider.
     *
     * @var string
     */
    public $instance_id;

    /**
     * License plan identifier (e.g. 'pro', 'agency').
     *
     * @var string
     */
    public $plan;

    /**
     * Human-readable error message, if any.
     *
     * @var string|null
     */
    public $error;

    /**
     * Full provider response for debugging.
     *
     * @var array
     */
    public $raw;

    /**
     * Timestamp when this status was last validated remotely.
     *
     * @var string ISO 8601 timestamp.
     */
    public $checked_at;

    /**
     * Constructor.
     *
     * @param array $args Status fields.
     */
    public function __construct( array $args = [] ) {

        $this->is_valid           = (bool) ( $args['is_valid'] ?? false );
        $this->status             = (string) ( $args['status'] ?? self::STATUS_INACTIVE );
        $this->license_key_masked = (string) ( $args['license_key_masked'] ?? '' );
        $this->expires_at         = $args['expires_at'] ?? null;
        $this->grace_until        = $args['grace_until'] ?? null;
        $this->licensed_domain    = (string) ( $args['licensed_domain'] ?? '' );
        $this->instance_id        = (string) ( $args['instance_id'] ?? '' );
        $this->plan               = (string) ( $args['plan'] ?? 'pro' );
        $this->error              = $args['error'] ?? null;
        $this->raw                = (array) ( $args['raw'] ?? [] );
        $this->checked_at         = (string) ( $args['checked_at'] ?? gmdate( 'c' ) );

    }

    /**
     * Whether the license grants pro access (active or in grace period).
     *
     * @return bool
     */
    public function grants_pro(): bool {

        return $this->is_valid || $this->status === self::STATUS_GRACE_PERIOD;

    }

    /**
     * Whether the license is in a grace period.
     *
     * @return bool
     */
    public function is_grace_period(): bool {

        return $this->status === self::STATUS_GRACE_PERIOD;

    }

    /**
     * Get the number of days remaining in the grace period.
     *
     * @return int Days remaining, or 0 if not in grace.
     */
    public function grace_days_remaining(): int {

        if ( ! $this->is_grace_period() || empty( $this->grace_until ) ) {
            return 0;
        }

        $until = strtotime( $this->grace_until );

        if ( ! $until ) {
            return 0;
        }

        $remaining = $until - time();

        return max( 0, (int) ceil( $remaining / DAY_IN_SECONDS ) );

    }

    /**
     * Serialize to array for transient storage.
     *
     * @return array
     */
    public function to_array(): array {

        return [
            'is_valid'           => $this->is_valid,
            'status'             => $this->status,
            'license_key_masked' => $this->license_key_masked,
            'expires_at'         => $this->expires_at,
            'grace_until'        => $this->grace_until,
            'licensed_domain'    => $this->licensed_domain,
            'instance_id'        => $this->instance_id,
            'plan'               => $this->plan,
            'error'              => $this->error,
            'raw'                => $this->raw,
            'checked_at'         => $this->checked_at,
        ];

    }

    /**
     * Reconstruct from a previously serialized array.
     *
     * @param array $data Serialized status data.
     * @return self
     */
    public static function from_array( array $data ): self {

        return new self( $data );

    }

    /**
     * Create a status object representing "no license" / inactive state.
     *
     * @return self
     */
    public static function inactive(): self {

        return new self( [
            'is_valid' => false,
            'status'   => self::STATUS_INACTIVE,
        ] );

    }

    /**
     * Create a status object representing an invalid/error state.
     *
     * @param string $error Human-readable error message.
     * @return self
     */
    public static function invalid( string $error = '' ): self {

        return new self( [
            'is_valid' => false,
            'status'   => self::STATUS_INVALID,
            'error'    => $error,
        ] );

    }

}
