<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * License gate for Maxi AI abilities.
 *
 * Hooks into wp_abilities_api_init at priority 9998 (before the schema patch
 * at 9999) and wraps the execute_callback of every ability whose
 * feature_group is NOT in Maxi_AI_Entitlements::ALWAYS_FREE. If the site
 * has no valid license OR the license does not grant the ability's
 * feature_group, the wrapped callback returns a gated error response via
 * maxi_ai_response(). If in a grace period, the original callback executes
 * normally with a warning appended.
 *
 * Uses the same Reflection approach as Maxi_AI_Ability_Schema_Patch to
 * modify the protected callback property of WP_Ability instances.
 *
 * No ability files are modified — gating is entirely transparent.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_License_Gate {

    /**
     * Ability name prefix to gate.
     */
    private const NAMESPACE_PREFIX = 'maxi/';

    /**
     * Whether the bypass warning has already been logged this request.
     */
    private static bool $bypass_warned = false;

    /**
     * Register the hook.
     */
    public static function init(): void {

        add_action( 'wp_abilities_api_init', [ self::class, 'apply' ], 9998 );

    }

    /**
     * Wrap the execute_callback of every maxi/* ability whose feature_group
     * is NOT in the always-free baseline (session_system, licensing).
     */
    public static function apply(): void {

        if ( ! function_exists( 'wp_get_abilities' ) ) {
            return;
        }

        foreach ( wp_get_abilities() as $ability ) {

            if ( ! $ability instanceof WP_Ability ) {
                continue;
            }

            $name = $ability->get_name();

            if ( strpos( $name, self::NAMESPACE_PREFIX ) !== 0 ) {
                continue;
            }

            if ( ! Maxi_AI_Entitlements::requires_entitlement( $name ) ) {
                // ALWAYS_FREE groups (session_system, licensing) pass ungated.
                continue;
            }

            // Wrap the callback.
            self::wrap_callback( $ability, $name );

            // Tag the description with [PRO] only for Pro-only groups
            // (those not included in the Lite plan). Lite-granted abilities
            // are not tagged — they're available to every paid plan.
            $group = Maxi_AI_Entitlements::get_feature_group( $name );
            if ( $group !== null && Maxi_AI_Entitlements::is_pro_only_group( $group ) ) {
                self::tag_description( $ability );
            }
        }

    }

    /**
     * Wrap the execute_callback of an ability with a license check.
     *
     * @param WP_Ability $ability    The ability instance.
     * @param string     $ability_id The ability ID.
     */
    private static function wrap_callback( WP_Ability $ability, string $ability_id ): void {

        try {
            $ref  = new ReflectionClass( $ability );
            $prop = $ref->getProperty( 'execute_callback' );
            $prop->setAccessible( true );

            $original_callback = $prop->getValue( $ability );

            // Create the gated wrapper.
            $gated_callback = function ( $input ) use ( $original_callback, $ability_id ) {
                return self::gated_execute( $original_callback, $input, $ability_id );
            };

            $prop->setValue( $ability, $gated_callback );

        } catch ( ReflectionException $e ) {
            // If WP_Ability internals change shape, fail silently.
            // The ability works ungated rather than breaking entirely.
            maxi_ai_log(
                'License gate Reflection failed for ' . $ability_id . ': ' . $e->getMessage(),
                'warning',
                [ 'component' => 'license' ]
            );
        }

    }

    /**
     * Append [PRO] to the ability description for MCP discovery.
     *
     * @param WP_Ability $ability The ability instance.
     */
    private static function tag_description( WP_Ability $ability ): void {

        try {
            $ref  = new ReflectionClass( $ability );
            $prop = $ref->getProperty( 'description' );
            $prop->setAccessible( true );

            $desc = $prop->getValue( $ability );

            if ( is_string( $desc ) && strpos( $desc, '[PRO]' ) === false ) {
                $prop->setValue( $ability, '[PRO] ' . $desc );
            }

        } catch ( ReflectionException $e ) {
            // Non-critical — description tagging is informational only.
        }

    }

    /**
     * Execute the gated callback.
     *
     * @param callable $original_callback The original execute_callback.
     * @param mixed    $input             The ability input.
     * @param string   $ability_id        The ability ID.
     * @return mixed
     */
    private static function gated_execute( callable $original_callback, $input, string $ability_id ) {

        // Development bypass — skip all license checks.
        if ( defined( 'MAXI_AI_LICENSE_BYPASS' ) && MAXI_AI_LICENSE_BYPASS ) {

            // Warn once per request so admins notice if this is left in production.
            if ( ! self::$bypass_warned ) {
                self::$bypass_warned = true;

                maxi_ai_log(
                    'MAXI_AI_LICENSE_BYPASS is active — all Pro abilities are ungated. Remove this constant in production.',
                    'warning',
                    [ 'component' => 'license' ]
                );

                if ( class_exists( 'Maxi_AI_Audit_Log' ) ) {
                    Maxi_AI_Audit_Log::record(
                        'license',
                        'bypass_active',
                        get_current_user_id(),
                        'constant:MAXI_AI_LICENSE_BYPASS',
                        [ 'ability_id' => $ability_id ]
                    );
                }
            }

            return call_user_func( $original_callback, $input );
        }

        $status = Maxi_AI_License_Manager::get_status();
        $group  = Maxi_AI_Entitlements::get_feature_group( $ability_id );

        $license_active = $status->is_valid && $status->status === Maxi_AI_License_Status::STATUS_ACTIVE;
        $in_grace       = $status->is_grace_period();

        // Plan includes this ability's feature_group?
        $plan_grants = ( $group !== null ) && in_array( $group, $status->entitlements, true );

        // Active license + plan grants the group — execute normally.
        if ( $license_active && $plan_grants ) {
            return call_user_func( $original_callback, $input );
        }

        // Grace period + plan grants the group — execute with warning.
        if ( $in_grace && $plan_grants ) {
            $result = call_user_func( $original_callback, $input );

            if ( is_array( $result ) && ! empty( $result['success'] ) && isset( $result['data'] ) ) {
                $days = $status->grace_days_remaining();
                $result['data']['_license_warning'] = sprintf(
                    'Your Maxi AI license expired on %s. You have %d day(s) remaining in your grace period. Renew to avoid losing access.',
                    $status->expires_at ?? 'unknown',
                    $days
                );
            }

            return $result;
        }

        // License state valid but plan does not include this ability — "plan
        // insufficient" (upgrade path, not renewal path). Different error
        // from "no license at all" so the operator / agent can surface the
        // right prompt.
        if ( ( $license_active || $in_grace ) && ! $plan_grants ) {

            if ( class_exists( 'Maxi_AI_Audit_Log' ) ) {
                Maxi_AI_Audit_Log::record(
                    'license',
                    'plan_insufficient',
                    get_current_user_id(),
                    $ability_id,
                    [
                        'required_group' => $group,
                        'plan'           => $status->plan,
                        'entitlements'   => $status->entitlements,
                    ]
                );
            }

            return maxi_ai_response(
                false,
                [
                    'ability'        => $ability_id,
                    'reason'         => 'plan_insufficient',
                    'required_group' => $group,
                    'plan'           => $status->plan,
                ],
                sprintf(
                    'This ability requires a feature not included in your %s plan (%s). Upgrade at https://maxicore.ai.',
                    $status->plan ?: 'current',
                    $group ?? 'unknown'
                )
            );
        }

        // No valid license — renewal / activation path.
        return maxi_ai_response(
            false,
            [
                'ability'        => $ability_id,
                'reason'         => 'license_required',
                'required_group' => $group,
                'status'         => $status->status,
            ],
            'This ability requires an active Maxi AI Core license. Get your license at https://maxicore.ai and activate it in Settings > Maxi AI License.'
        );

    }

}

Maxi_AI_License_Gate::init();
