<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Rule gate for Maxi AI abilities.
 *
 * Hooks wp_abilities_api_init at priority 9997 (WRAPS BEFORE the license
 * gate at 9998, so runtime order during execution is: license check →
 * rule check → original callback).
 *
 * For every public maxi/* ability EXCEPT the allow-list and ungated reads,
 * the execute_callback is wrapped so that:
 *
 *   1. If no MCP session ID is present (direct PHP/WP-CLI), pass through.
 *   2. If the ability is allow-listed (get-ability-rule, rules-sync), pass through.
 *   3. If the ability is an ungated read, pass through (no handshake needed).
 *   4. Rate limiting is applied (per-session, per-category).
 *   5. If no rule row exists for the ability, refuse with `rules_not_installed`.
 *   6. If the session has not acknowledged rules for this ability, refuse
 *      with `rules_not_acknowledged`.
 *   7. If the acknowledged version is older than the current rule version,
 *      refuse with `rules_changed` so the agent re-fetches the latest text.
 *   8. Otherwise invoke the original callback.
 *
 * Ungated reads: safe read-only abilities skip the rule handshake by default
 * to eliminate a round-trip per call. They still have WordPress capability
 * checks in their own callbacks. To force all reads through the gate, define
 * MAXI_AI_GATE_READS as true in wp-config.php.
 *
 * Always fail-closed for gated abilities — no permissive fallback.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Rule_Gate {

    private const NAMESPACE_PREFIX = 'maxi/';

    /**
     * Ability IDs that MUST remain callable without a rule handshake,
     * otherwise the system deadlocks (e.g. you cannot fetch rules if the
     * fetcher is itself gated).
     */
    private const ALLOWLIST = [
        'maxi/get-ability-rule',
        'maxi/rules-sync',
        'maxi/bootstrap-session',
        'maxi/get-playbook',
        'maxi/manage-playbooks',
        'maxi/manage-ability-rules',
    ];

    /**
     * Read abilities that skip the rule handshake by default.
     *
     * These are safe, read-only operations where the default rule is
     * trivial ("no restrictions"). Skipping the handshake eliminates
     * one MCP round-trip per call.
     *
     * NOT included (stay gated):
     *  - get-content / get-content-by-slug — rules document read-before-write side-effect
     *  - WooCommerce reads — operators may add store-specific rules
     *  - list-files / read-file — filesystem access
     *  - verify-audit-chain — admin-only
     *
     * Override: define MAXI_AI_GATE_READS as true to gate all reads.
     */
    private const UNGATED_READS = [
        // Content reads (except get-content / get-content-by-slug).
        'maxi/list-content',
        'maxi/search-content',

        // Taxonomy reads.
        'maxi/get-term',
        'maxi/list-terms',

        // Meta reads.
        'maxi/get-meta',
        'maxi/list-meta',

        // Media reads.
        'maxi/get-attachment',
        'maxi/list-attachments',

        // Notes reads.
        'maxi/get-note',
        'maxi/list-notes',
        'maxi/list-note-comments',

        // System reads.
        'maxi/get-site-info',
        'maxi/get-current-user',
        'maxi/get-post-types',
        'maxi/get-taxonomies',
        'maxi/get-site-instructions',
        'maxi/flush-cache',
        'maxi/clear-transients',
        'maxi/regenerate-rewrites',

        // AI config reads (not generation).
        'maxi/get-ai-settings',
        'maxi/list-provider-keys',
        'maxi/get-audit-events',
        'maxi/get-job-status',

        // Analytics reads.
        'maxi/get-analytics',

        // WooCommerce reads — permission_callback already enforces
        // edit_products / manage_woocommerce. Rules carry no additional
        // restrictions for reads; handshake is unnecessary overhead.
        'maxi/get-product',
        'maxi/get-product-attributes',
        'maxi/list-products',
        'maxi/list-variations',
        'maxi/get-order',
        'maxi/list-orders',
        'maxi/get-coupon',
        'maxi/list-coupons',
        'maxi/list-shipping-zones',
        'maxi/list-tax-rates',

        // Playbook abilities (skip rule handshake).
        'maxi/bootstrap-session',
        'maxi/get-playbook',
    ];

    /**
     * Write abilities that require administrator (manage_options) when
     * called via MCP. Non-admin agents are blocked server-side — no
     * text-based rule can override this.
     */
    private const WRITE_ABILITIES = [
        'maxi/update-content',
        'maxi/create-content',
        'maxi/delete-content',
        'maxi/duplicate-content',
        'maxi/change-status',
        'maxi/set-author',
        'maxi/set-parent',
        'maxi/schedule-content',
    ];

    public static function init(): void {

        add_action( 'wp_abilities_api_init', [ self::class, 'apply' ], 9997 );

    }

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

            if ( in_array( $name, self::ALLOWLIST, true ) ) {
                continue;
            }

            // Safe reads skip the gate unless the operator opts in.
            if ( ! self::gate_reads_enabled() && in_array( $name, self::UNGATED_READS, true ) ) {
                continue;
            }

            self::wrap_callback( $ability, $name );
        }

    }

    /**
     * Whether the operator has opted in to gating read abilities.
     *
     * @return bool True if MAXI_AI_GATE_READS is defined and truthy.
     */
    private static function gate_reads_enabled(): bool {

        return defined( 'MAXI_AI_GATE_READS' ) && MAXI_AI_GATE_READS;

    }

    /**
     * Replace the protected execute_callback property via Reflection.
     *
     * Mirrors Maxi_AI_License_Gate::wrap_callback().
     */
    private static function wrap_callback( WP_Ability $ability, string $ability_id ): void {

        try {
            $ref  = new ReflectionClass( $ability );
            $prop = $ref->getProperty( 'execute_callback' );
            $prop->setAccessible( true );

            $original_callback = $prop->getValue( $ability );

            $gated_callback = function ( $input ) use ( $original_callback, $ability_id ) {
                return self::gated_execute( $original_callback, $input, $ability_id );
            };

            $prop->setValue( $ability, $gated_callback );

        } catch ( ReflectionException $e ) {
            maxi_ai_log(
                'Rule gate Reflection failed for ' . $ability_id . ': ' . $e->getMessage(),
                'warning',
                [ 'component' => 'rules' ]
            );
        }

    }

    /**
     * Apply the rule check, then delegate to the original callback.
     *
     * @param callable $original_callback The original execute_callback.
     * @param mixed    $input             The ability input.
     * @param string   $ability_id        The ability ID.
     * @return mixed
     */
    private static function gated_execute( callable $original_callback, $input, string $ability_id ) {

        $session_id = Maxi_AI_Rule_Session::get_session_id();

        if ( null === $session_id ) {

            // CLI / cron / unit tests = trust the caller.
            if ( ! maxi_ai_is_http_context() ) {
                return call_user_func( $original_callback, $input );
            }

            // HTTP request with no MCP session = fail closed. Mirrors the
            // playbook gate; diagnostic logging lives there to avoid double
            // entries per request.
            return maxi_ai_response(
                false,
                [
                    'code'       => 'mcp_session_missing',
                    'ability_id' => $ability_id,
                    'handshake'  => 'maxi/bootstrap-session',
                ],
                'No MCP session detected. Call maxi/bootstrap-session first; if the problem persists, the server may be misrouting the Mcp-Session-Id header.'
            );
        }

        // Rate limiting (per-session, per-category).
        if ( class_exists( 'Maxi_AI_Rate_Limiter' ) ) {
            $rate_result = Maxi_AI_Rate_Limiter::check( $session_id, $ability_id );

            if ( $rate_result !== null ) {
                maxi_ai_log(
                    'rate-limit BLOCKED: ability=' . $ability_id . ' category=' . $rate_result['category'] . ' user=' . get_current_user_id(),
                    'warning',
                    [ 'component' => 'rules' ]
                );

                return maxi_ai_response(
                    false,
                    [
                        'code'        => 'rate_limited',
                        'ability_id'  => $ability_id,
                        'category'    => $rate_result['category'],
                        'limit'       => $rate_result['limit'],
                        'window'      => $rate_result['window'],
                        'retry_after' => $rate_result['retry_after'],
                    ],
                    'Rate limit exceeded for ' . $rate_result['category'] . ' abilities. Limit: '
                        . $rate_result['limit'] . ' per ' . $rate_result['window'] . 's. Retry after '
                        . $rate_result['retry_after'] . ' seconds.'
                );
            }
        }

        // Write gate: content-mutating abilities require administrator.
        if ( in_array( $ability_id, self::WRITE_ABILITIES, true ) && ! current_user_can( 'manage_options' ) ) {

            maxi_ai_log(
                'write-gate BLOCKED: ability=' . $ability_id . ' user=' . get_current_user_id(),
                'warning',
                [ 'component' => 'rules' ]
            );

            return maxi_ai_response(
                false,
                [
                    'code'       => 'write_not_authorized',
                    'ability_id' => $ability_id,
                ],
                'Write abilities require administrator privileges. Your role does not permit content modifications. Use notes to submit suggestions to an administrator.'
            );
        }

        // Read-before-write: reject content updates if the post wasn't read first.
        if ( $ability_id === 'maxi/update-content' && isset( $input['content'] ) ) {
            $post_id = intval( $input['post_id'] ?? 0 );
            if ( $post_id > 0 && ! Maxi_AI_Rule_Session::was_content_read( $post_id ) ) {

                maxi_ai_log(
                    'read-before-write BLOCKED: post_id=' . $post_id . ' user=' . get_current_user_id(),
                    'warning',
                    [ 'component' => 'rules' ]
                );

                return maxi_ai_response(
                    false,
                    [
                        'code'       => 'content_not_read',
                        'ability_id' => $ability_id,
                        'post_id'    => $post_id,
                    ],
                    'You must call maxi/get-content for post ' . $post_id . ' before updating its content. Read first, then update.'
                );
            }
        }

        // Load the rule row once per call. The three-state machine needs the
        // full body to attach via _meta._rule on delivery, and the version to
        // detect operator-driven rule changes mid-session.
        $rule_row = Maxi_AI_Rule_Store::get( $ability_id );

        if ( null === $rule_row ) {

            return maxi_ai_response(
                false,
                [
                    'code'        => 'rules_not_installed',
                    'ability_id'  => $ability_id,
                    'remediation' => 'maxi/rules-sync',
                ],
                'Your installation is not complete. No rule defined for ' . $ability_id . '. Run maxi/rules-sync to install rules.'
            );
        }

        $current_version = (int) $rule_row['version'];
        $delivery_mode   = Maxi_AI_Rule_Store::normalize_delivery_mode( $rule_row['delivery_mode'] ?? null );

        $state = Maxi_AI_Rule_Session::get_state( $ability_id );

        // Version mismatch (operator bumped the rule mid-session) demotes
        // the stored state to unseen for the purposes of this call — the
        // handshake restarts and _meta._rule is re-delivered per the rule's
        // current delivery_mode.
        $trigger = 'fresh_session';

        if ( $state !== null && (int) $state['version'] !== $current_version ) {
            $state   = null;
            $trigger = 'version_mismatch';
        }

        // ---------------------------------------------------------------
        // acknowledged(version==current): steady state. Pass through.
        // ---------------------------------------------------------------
        if ( $state !== null && $state['state'] === Maxi_AI_Rule_Session::STATE_ACKNOWLEDGED ) {
            return call_user_func( $original_callback, $input );
        }

        // ---------------------------------------------------------------
        // delivered(version==current): agent already received _rule on a
        // prior rejection (only reachable under reject_first). Execute the
        // wrapped callback and promote state to acknowledged regardless of
        // ability-level success — the retry IS the acknowledgement signal.
        // Do NOT re-attach _rule; the agent has it.
        // ---------------------------------------------------------------
        if ( $state !== null && $state['state'] === Maxi_AI_Rule_Session::STATE_DELIVERED ) {

            $response = call_user_func( $original_callback, $input );

            Maxi_AI_Rule_Session::mark_acknowledged( $ability_id, $current_version );

            if ( class_exists( 'Maxi_AI_Audit_Log' ) ) {
                Maxi_AI_Audit_Log::record(
                    'rules',
                    'rule_acknowledged',
                    get_current_user_id(),
                    $ability_id,
                    [
                        'ability_id' => $ability_id,
                        'version'    => $current_version,
                        'path'       => 'post_delivery_retry',
                    ]
                );
            }

            return $response;
        }

        // ---------------------------------------------------------------
        // unseen: branch on delivery_mode.
        // ---------------------------------------------------------------
        if ( $delivery_mode === Maxi_AI_Rule_Store::DELIVERY_INLINE_ON_SUCCESS ) {

            // Execute first; on success, attach _rule and transition
            // straight to acknowledged. On failure, change nothing — the
            // next call restarts cleanly from unseen.
            $response = call_user_func( $original_callback, $input );

            $is_success = is_array( $response ) && ! empty( $response['success'] );

            if ( $is_success ) {

                if ( is_array( $response ) ) {
                    maxi_ai_attach_rule( $response, $rule_row );
                }

                Maxi_AI_Rule_Session::mark_acknowledged( $ability_id, $current_version );

                if ( class_exists( 'Maxi_AI_Audit_Log' ) ) {
                    Maxi_AI_Audit_Log::record(
                        'rules',
                        'rule_delivered',
                        get_current_user_id(),
                        $ability_id,
                        [
                            'ability_id' => $ability_id,
                            'version'    => $current_version,
                            'mode'       => Maxi_AI_Rule_Store::DELIVERY_INLINE_ON_SUCCESS,
                            'trigger'    => $trigger,
                        ]
                    );

                    Maxi_AI_Audit_Log::record(
                        'rules',
                        'rule_acknowledged',
                        get_current_user_id(),
                        $ability_id,
                        [
                            'ability_id' => $ability_id,
                            'version'    => $current_version,
                            'path'       => 'inline',
                        ]
                    );
                }
            }

            return $response;
        }

        // Default: reject_first. Return the rejection with _rule attached;
        // the agent's retry will promote the state to acknowledged.
        $rejection = maxi_ai_response(
            false,
            [
                'code'            => 'rules_not_acknowledged',
                'ability_id'      => $ability_id,
                'current_version' => $current_version,
                'handshake'       => 'maxi/get-ability-rule',
            ],
            'Site rules not acknowledged. The rule body is attached under _meta._rule — read it and retry. maxi/get-ability-rule remains available for manual re-fetch.'
        );

        maxi_ai_attach_rule( $rejection, $rule_row );

        Maxi_AI_Rule_Session::mark_delivered( $ability_id, $current_version );

        if ( class_exists( 'Maxi_AI_Audit_Log' ) ) {
            Maxi_AI_Audit_Log::record(
                'rules',
                'rule_delivered',
                get_current_user_id(),
                $ability_id,
                [
                    'ability_id' => $ability_id,
                    'version'    => $current_version,
                    'mode'       => Maxi_AI_Rule_Store::DELIVERY_REJECT_FIRST,
                    'trigger'    => $trigger,
                ]
            );
        }

        return $rejection;

    }

}

Maxi_AI_Rule_Gate::init();
