<?php
/**
 * Maxi_AI_Ability_Schema_Patch
 *
 * Local workaround for an upstream bug in `wordpress/mcp-adapter`'s
 * `ExecuteAbilityAbility`. When an MCP client calls a tool with `parameters: {}`,
 * the adapter coerces the empty object to `null` via
 *
 *     $parameters = empty( $input['parameters'] ) ? null : $input['parameters'];
 *
 * because `empty([])` is `true`. The inner ability is then invoked with
 * `$ability->execute(null)`, and `WP_Ability::validate_input(null)` fails for any
 * schema whose top-level is `type: object` (which is effectively all of them) with
 * the cryptic "input is not of type object" error.
 *
 * The `{"_": 1}` hack that the agent stumbled onto "works" only because a non-empty
 * array trips `empty()` and flows through untouched.
 *
 * FIX STRATEGY (without touching the adapter): `WP_Ability::normalize_input()` will
 * substitute the schema's `default` value when it receives `null` input. So if we
 * add `'default' => []` to every `maxi/*` ability with a `type: object` schema, the
 * null coming from the buggy adapter gets rehydrated to an empty array before
 * validation runs, and the call succeeds.
 *
 * Note: we deliberately use `[]` (empty PHP array), not `(object) []` (stdClass).
 * Core's `rest_is_object()` accepts both as valid JSON objects during schema
 * validation, but every maxi ability callback reads input via array access
 * (`$input['foo'] ?? ...`) — handing it a stdClass would fatal with "Cannot use
 * object of type stdClass as array".
 *
 * We can't set a schema default at registration time for every ability individually
 * without touching many files, so this patcher runs once after all abilities are
 * registered and uses Reflection to inject the default into the protected
 * `$input_schema` property of each affected ability. Reflection is used because
 * `WP_Ability` exposes no setter — that is a legitimate constraint of the API, not
 * an oversight we're bypassing.
 *
 * WHY ONLY `maxi/*`: we don't want to mask bugs in third-party abilities or silently
 * alter someone else's schema. This file is scoped to our own namespace on purpose.
 *
 * REMOVE THIS FILE once the upstream fix in `wordpress/mcp-adapter` has propagated
 * into both the standalone plugin and WooCommerce's vendored copy.
 *
 * @package Maxi_AI
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class Maxi_AI_Ability_Schema_Patch {

    /**
     * Ability name prefix this patcher applies to.
     */
    private const NAMESPACE_PREFIX = 'maxi/';

    /**
     * Register the hook.
     */
    public static function init(): void {
        // Priority 10001: run after every plugin has had a chance to register its
        // abilities on the standard `wp_abilities_api_init` hook, and after the
        // Playbook Gate (9999), License Gate (9998), and Rule Gate (9997).
        add_action( 'wp_abilities_api_init', [ self::class, 'apply' ], 10001 );
    }

    /**
     * Inject `default => (object) []` into every maxi/* ability whose input schema
     * is a `type: object` with no existing default.
     */
    public static function apply(): void {

        if ( ! function_exists( 'wp_get_abilities' ) ) {
            return;
        }

        $patched = 0;

        foreach ( wp_get_abilities() as $ability ) {

            if ( ! $ability instanceof WP_Ability ) {
                continue;
            }

            if ( strpos( $ability->get_name(), self::NAMESPACE_PREFIX ) !== 0 ) {
                continue;
            }

            $schema = $ability->get_input_schema();

            // Skip abilities that have no schema at all — those legitimately want
            // null input and the buggy adapter path happens to work for them.
            if ( empty( $schema ) ) {
                continue;
            }

            // Only patch object-typed schemas: the bug is specifically about null
            // failing `type: object` validation.
            if ( ( $schema['type'] ?? null ) !== 'object' ) {
                continue;
            }

            // Respect any default the ability author has already set.
            if ( array_key_exists( 'default', $schema ) ) {
                continue;
            }

            $schema['default'] = [];

            self::set_input_schema( $ability, $schema );
            $patched++;
        }

        if ( $patched === 0 ) {
            // If zero abilities were patched, the upstream bug may be fixed or
            // WP_Ability internals changed. Log so operators notice.
            maxi_ai_log(
                'Schema patch applied to 0 abilities — upstream fix may have landed, or WP_Ability internals changed. Consider removing class-ability-schema-patch.php.',
                'warning',
                [ 'component' => 'schema-patch' ]
            );
        }
    }

    /**
     * Write the schema back onto the ability's protected `$input_schema` property.
     *
     * WP_Ability intentionally has no setter, so Reflection is the only in-process
     * path. The alternative — editing each ability file to add `'default' => ...`
     * inline — would scale badly and make the workaround harder to remove later.
     */
    private static function set_input_schema( WP_Ability $ability, array $schema ): void {

        try {
            $ref  = new ReflectionClass( $ability );
            $prop = $ref->getProperty( 'input_schema' );
            $prop->setAccessible( true );
            $prop->setValue( $ability, $schema );
        } catch ( ReflectionException $e ) {
            // If the WP_Ability internals ever change shape, fail gracefully —
            // the original bug just resurfaces, but we log so operators notice.
            maxi_ai_log(
                'Schema patch Reflection failed for ' . $ability->get_name() . ': ' . $e->getMessage(),
                'warning',
                [ 'component' => 'schema-patch' ]
            );
            return;
        }
    }
}

Maxi_AI_Ability_Schema_Patch::init();
