<?php
/**
 * Maxi AI Core — Uninstall.
 *
 * Fired when the plugin is deleted via the WordPress admin.
 * Drops custom database tables and removes all plugin options.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
    exit;
}

global $wpdb;

// Drop custom tables.
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}maxi_ai_job_items" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}maxi_ai_jobs" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}maxi_ai_audit_log" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}maxi_ai_note_comments" );
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}maxi_ai_notes" );

// Attempt to deactivate the license before removing data.
// Load minimal licensing classes if available.
$licensing_dir = __DIR__ . '/includes/licensing';
if ( file_exists( $licensing_dir . '/interface-license-provider.php' ) ) {
    require_once $licensing_dir . '/interface-license-provider.php';
    require_once $licensing_dir . '/class-license-status.php';
    require_once $licensing_dir . '/class-license-manager.php';

    // Load the active provider and deactivate the license.
    $settings      = get_option( 'maxi_ai_settings', [] );
    $provider_slug = $settings['license_provider'] ?? 'self-hosted';
    $provider_file = $licensing_dir . '/providers/class-provider-' . $provider_slug . '.php';

    if ( file_exists( $provider_file ) ) {
        require_once $provider_file;
    }

    // Build the expected class name and register if available.
    $class_name = 'Maxi_AI_Provider_' . str_replace( '-', '_', ucwords( $provider_slug, '-' ) );

    if ( class_exists( $class_name ) ) {
        Maxi_AI_License_Manager::register_provider( $provider_slug, new $class_name() );
    }

    Maxi_AI_License_Manager::deactivate();
}

// Delete plugin options.
delete_option( 'maxi_ai_settings' );
delete_option( 'maxi_ai_db_version' );
delete_option( 'maxi_ai_key_usage' );
delete_option( 'maxi_ai_db_query_blocklist' );
delete_option( 'maxi_ai_license_fail_count' );
delete_option( 'maxi_ai_operator_notes_revision' );

// Delete license transients.
delete_transient( 'maxi_ai_license_status' );
delete_transient( 'maxi_ai_update_check' );
delete_transient( 'maxi_ai_license_attempts' );

// Clear any leftover cron events.
$timestamp = wp_next_scheduled( 'maxi_ai_process_batch' );

if ( $timestamp ) {
    wp_unschedule_event( $timestamp, 'maxi_ai_process_batch' );
}
