<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Bridge Abilities API → MCP
 * Ensures all registered abilities are exposed to MCP.
 */

add_action( 'mcp_adapter_init', function () {

    if ( ! function_exists( 'wp_get_abilities' ) ) {
        return;
    }

    $abilities = wp_get_abilities();

    foreach ( $abilities as $ability_id => $ability ) {

        do_action(
            'mcp_register_ability_tool',
            $ability_id,
            $ability
        );

    }

});