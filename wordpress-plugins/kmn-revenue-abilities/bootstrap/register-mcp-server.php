<?php
/**
 * Register the `kmn-revenue` MCP server with the MCP Adapter.
 *
 * Hook timing: mcp_adapter_init fires on rest_api_init priority 15 —
 * which is after wp_abilities_api_init (priority 10) on the same
 * rest_api_init cycle. Our ability files have already registered with
 * the Abilities API by the time this action runs.
 *
 * Signature note: WP_BRIDGE_ARCHITECTURE.md §5 uses three wrong PHP-named
 * parameter names (`rest_namespace`, `rest_route`, `abilities`). The
 * real positional signature on McpAdapter::create_server() in v0.5.0 is
 * server_route_namespace / server_route / tools. See 16-RESEARCH.md §B1.
 *
 * Calling create_server() OUTSIDE the mcp_adapter_init action raises
 * _doing_it_wrong and returns a WP_Error with code invalid_timing.
 *
 * Endpoint: /wp-json/{server_route_namespace}/{server_route}
 *        =  /wp-json/mcp/kmn-revenue
 *
 * Tool-name sanitisation: ability ids with slashes are sanitised to
 * hyphens for the MCP protocol layer. `kmn/weekly-heatmap` → MCP tool
 * name `kmn-weekly-heatmap`. We register the slash form here; callers
 * see the hyphen form in tools/list responses.
 *
 * @package KMN_Revenue_Abilities
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'mcp_adapter_init', function ( $adapter ) {

    // Guard against missing adapter classes so a partial install logs
    // cleanly instead of fataling the REST bootstrap.
    if ( ! class_exists( '\\WP\\MCP\\Transport\\HttpTransport' ) ) {
        error_log( '[kmn-revenue-abilities] HttpTransport class missing; skipping MCP server registration.' );
        return;
    }

    $adapter->create_server(
        // server_id
        'kmn-revenue',
        // server_route_namespace — NOT "rest_namespace"
        'mcp',
        // server_route — NOT "rest_route"
        'kmn-revenue',
        // server_name
        'KMN Revenue Intelligence',
        // server_description
        'WooCommerce revenue analytics for KAMANIN Portal.',
        // server_version
        '1.0.0',
        // mcp_transports
        [ \WP\MCP\Transport\HttpTransport::class ],
        // error_handler
        \WP\MCP\Infrastructure\ErrorHandling\ErrorLogMcpErrorHandler::class,
        // observability_handler
        \WP\MCP\Infrastructure\Observability\NullMcpObservabilityHandler::class,
        // tools — ability ids, NOT "abilities".
        // Plan 16-02 registers the actual ability files; for Plan 16-01
        // the adapter emits a warning per missing id but the server
        // registration itself still succeeds and tools/list returns [].
        [
            'kmn/weekly-heatmap',
            'kmn/repeat-metrics',
            'kmn/revenue-run-rate',
            'kmn/market-basket',
            'kmn/weekly-briefing-data',
        ],
        // resources
        [],
        // prompts
        []
    );

} );
