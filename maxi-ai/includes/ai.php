<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Maxi AI — AI infrastructure entry point.
 *
 * Loads all AI sub-files in dependency order and registers the cron interval + worker hook.
 * Auto-loaded by Maxi_AI::load_includes() via glob('includes/*.php').
 */

$ai_dir = __DIR__ . '/ai';

// 0. Key encryption (no dependencies — must load before config).
require_once $ai_dir . '/class-key-encryption.php';

// 1. Configuration (depends on key encryption for transparent decrypt).
require_once $ai_dir . '/class-config.php';

// 2. HTTP client (depends on config).
require_once $ai_dir . '/class-client.php';

// 3. Provider interface (no dependencies).
require_once $ai_dir . '/interface-provider.php';

// 4. Provider factory (depends on interface + config).
require_once $ai_dir . '/class-provider-factory.php';

// 4b. Key audit service (depends on config + audit log + factory).
require_once $ai_dir . '/class-key-audit.php';

// 5. Provider implementations (depend on interface + client + config).
foreach ( glob( $ai_dir . '/providers/class-*.php' ) as $provider_file ) {
    require_once $provider_file;
}

// 6. Services (depend on providers + factory).
foreach ( glob( $ai_dir . '/services/class-*.php' ) as $service_file ) {
    require_once $service_file;
}

// 7. Batch system (depends on queue, config, services).
require_once $ai_dir . '/batch/class-queue.php';
require_once $ai_dir . '/batch/class-retry-handler.php';
require_once $ai_dir . '/batch/class-job-manager.php';
require_once $ai_dir . '/batch/class-worker.php';

/**
 * Register the custom cron interval (every minute).
 */
add_filter( 'cron_schedules', function ( $schedules ) {

    if ( ! isset( $schedules['every_minute'] ) ) {
        $schedules['every_minute'] = [
            'interval' => 60,
            'display'  => 'Every Minute',
        ];
    }

    return $schedules;

} );

/**
 * Register built-in AI providers.
 */
add_action( 'init', function () {

    Maxi_AI_Provider_Factory::register( 'openai', 'Maxi_AI_Provider_OpenAI' );
    Maxi_AI_Provider_Factory::register( 'anthropic', 'Maxi_AI_Provider_Anthropic' );
    Maxi_AI_Provider_Factory::register( 'openrouter', 'Maxi_AI_Provider_OpenRouter' );
    Maxi_AI_Provider_Factory::register( 'replicate', 'Maxi_AI_Provider_Replicate' );
    Maxi_AI_Provider_Factory::register( 'bfl', 'Maxi_AI_Provider_BFL' );
    Maxi_AI_Provider_Factory::register( 'local', 'Maxi_AI_Provider_Local' );

}, 5 );

/**
 * Hook the batch worker to the cron action.
 */
add_action( 'maxi_ai_process_batch', [ 'Maxi_AI_Worker', 'process' ] );
