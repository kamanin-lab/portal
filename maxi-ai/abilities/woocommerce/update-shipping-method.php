<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/update-shipping-method',
        [
            'label'       => 'Update Shipping Method',
            'description' => 'Update an existing WooCommerce shipping method instance (flat_rate, free_shipping, local_pickup, ...). Send only the fields to change. Settings keys vary by method type — call list-shipping-zones first to see which keys exist on the target instance. Booleans (like enabled) can be set to false explicitly.',
            'category'    => 'woocommerce',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'instance_id' => [
                        'type'        => 'integer',
                        'description' => 'The shipping method instance ID (from list-shipping-zones).',
                    ],
                    'settings' => [
                        'type'        => 'object',
                        'description' => 'Partial settings to merge into the method instance settings. Common keys per method type: flat_rate → cost, tax_status, title, min_amount, requires; free_shipping → requires, min_amount, ignore_discounts; local_pickup → cost, tax_status, title. Read the current settings via list-shipping-zones before updating to see exact keys and current values.',
                    ],
                    'enabled' => [
                        'type'        => 'boolean',
                        'description' => 'Whether the method is enabled. Can be set to false to disable.',
                    ],
                ],
                'required' => [ 'instance_id' ],
            ],

            'execute_callback' => function ( $input ) {

                if ( ! class_exists( 'WC_Shipping_Zones' ) ) {
                    return maxi_ai_response( false, [], 'WooCommerce is not active.' );
                }

                $instance_id = intval( $input['instance_id'] ?? 0 );

                if ( ! $instance_id ) {
                    return maxi_ai_response( false, [], 'Invalid instance ID.' );
                }

                $method = WC_Shipping_Zones::get_shipping_method( $instance_id );

                if ( ! $method ) {
                    return maxi_ai_response( false, [], 'Shipping method not found.' );
                }

                $updated_fields = [];

                // --- settings merge ---
                // Partial merge: keep every existing key the caller didn't touch.
                // Values are not individually sanitized because keys vary by method type
                // and would need per-method-type schemas. WC stores them as-is and
                // escapes them at render time; this ability is already gated on
                // manage_woocommerce so the trust boundary is satisfied.
                if ( array_key_exists( 'settings', $input ) && is_array( $input['settings'] ) ) {
                    $current = is_array( $method->instance_settings ) ? $method->instance_settings : [];
                    $merged  = array_merge( $current, $input['settings'] );

                    update_option(
                        'woocommerce_' . $method->id . '_' . $instance_id . '_settings',
                        $merged
                    );

                    $updated_fields = array_keys( $input['settings'] );
                }

                // --- enabled toggle ---
                // is_enabled lives in wp_woocommerce_shipping_zone_methods, not in the
                // settings option. WC's admin UI toggles it via direct UPDATE; we do the
                // same. array_key_exists so `enabled: false` flows through.
                if ( array_key_exists( 'enabled', $input ) ) {
                    global $wpdb;
                    $wpdb->update(
                        $wpdb->prefix . 'woocommerce_shipping_zone_methods',
                        [ 'is_enabled' => $input['enabled'] ? 1 : 0 ],
                        [ 'instance_id' => $instance_id ],
                        [ '%d' ],
                        [ '%d' ]
                    );
                    $updated_fields[] = 'enabled';
                }

                // Bump the shipping cache version so the front-end sees the change
                // on the next request — matches WC's own save flow.
                if ( ! empty( $updated_fields ) && class_exists( 'WC_Cache_Helper' ) ) {
                    WC_Cache_Helper::get_transient_version( 'shipping', true );
                }

                // Re-read for authoritative return.
                $fresh = WC_Shipping_Zones::get_shipping_method( $instance_id );

                $audit_zone_id = (int) $wpdb->get_var( $wpdb->prepare(
                    "SELECT zone_id FROM {$wpdb->prefix}woocommerce_shipping_zone_methods WHERE instance_id = %d",
                    $instance_id
                ) );

                Maxi_AI_Audit_Log::record(
                    'woocommerce',
                    'shipping_method_updated',
                    get_current_user_id(),
                    'zone:' . $audit_zone_id,
                    [ 'instance_id' => $instance_id ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'instance_id'    => (int) $fresh->get_instance_id(),
                        'method_id'      => $fresh->id,
                        'title'          => $fresh->get_title(),
                        'enabled'        => $fresh->is_enabled(),
                        'settings'       => $fresh->instance_settings ?? [],
                        'updated_fields' => $updated_fields,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_woocommerce' );
            },

        ]
    );

} );
