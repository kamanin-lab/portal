<?php
/*
Plugin Name: Maxi AI Core
Description: Agentic execution infrastructure for WordPress and WooCommerce - A system layer that enables safe, auditable, and controlled operations on WordPress data. It provides structured abilities, rule enforcement, and execution governance for automated workflows and AI agents — ensuring reliable, predictable, and fully traceable behavior across any site.
Version: 3.4.7
Author: Maxi AI Core - Mihael Zadravec, Maxi Web Studio
Author URI: https://maxicore.ai
License: GPL-2.0+
License URI:  https://www.gnu.org/licenses/gpl-2.0.html
*/

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

final class Maxi_AI {

    const VERSION    = '3.4.7';
    // DB_VERSION is for schema changes only.
    // Content changes are handled by content-hash reseeding in maybe_refresh_seeds().
    // Do NOT bump DB_VERSION for content-only updates.
    const DB_VERSION = '2.0.0';

    public static function init() {

        self::load_includes();
        self::load_bootstrap();
        self::load_abilities();
        self::maybe_upgrade();
        self::maybe_refresh_seeds();
        self::register_masking_filter();

    }

    private static function load_includes() {

        $includes = glob( __DIR__ . '/includes/*.php' );

        if ( empty( $includes ) ) {
            return;
        }

        sort( $includes );

        foreach ( $includes as $file ) {
            require_once $file;
        }

    }

    private static function load_bootstrap() {

        $files = glob( __DIR__ . '/bootstrap/*.php' );

        if ( empty( $files ) ) {
            return;
        }

        sort( $files );

        foreach ( $files as $file ) {
            require_once $file;
        }

    }

    /**
     * Defer ability file loading to contexts that actually need them.
     *
     * Ability files only register hooks for `wp_abilities_api_init`, which
     * only fires on REST / MCP / WP-CLI requests. Loading them eagerly on
     * every page view wastes ~106 require_once calls and the associated
     * memory for closures that will never fire.
     *
     * - REST / MCP requests: load on `rest_api_init` (priority 0), well
     *   before the MCP adapter triggers `wp_abilities_api_init` at priority 15.
     * - WP-CLI: load eagerly (no REST request to trigger the lazy path,
     *   and CLI commands are one-shot — latency is irrelevant).
     * - Everything else (frontend, admin, cron): abilities are never loaded.
     *   The license admin page uses a file-scan approach (see
     *   Maxi_AI_Entitlements::get_summary) that doesn't require the
     *   registry to be populated — deliberately, to avoid triggering the
     *   one-shot `wp_abilities_api_init` hook before other plugins have
     *   attached their listeners.
     */
    private static function load_abilities() {

        if ( defined( 'WP_CLI' ) && WP_CLI ) {
            self::require_ability_files();
            return;
        }

        add_action( 'rest_api_init', [ self::class, 'require_ability_files' ], 0 );

    }

    /**
     * Load all ability PHP files from the abilities/ directory.
     *
     * Each file registers its ability via add_action( 'wp_abilities_api_init' )
     * at the default priority (10). The gates at 9997-9999 wrap them later.
     *
     * Guarded against double-loading so it can be safely hooked from
     * multiple entry points.
     *
     * @internal
     */
    public static function require_ability_files(): void {

        static $loaded = false;

        if ( $loaded ) {
            return;
        }

        $loaded = true;

        $directory = new RecursiveDirectoryIterator(
            __DIR__ . '/abilities',
            RecursiveDirectoryIterator::SKIP_DOTS
        );

        $iterator = new RecursiveIteratorIterator( $directory );

        foreach ( $iterator as $file ) {

            if ( $file->getExtension() !== 'php' ) {
                continue;
            }

            require_once $file->getPathname();

        }

    }

    /**
     * Run on plugin activation — create DB tables, schedule cron.
     */
    public static function activate() {

        self::create_tables();
        self::schedule_cron();

        // Seed baseline ability rules so the Rule Gate has something to
        // enforce immediately. Guarded so a missing class does not fatal
        // activation (e.g. during dev file moves).
        if ( class_exists( 'Maxi_AI_Rule_Store' ) ) {
            Maxi_AI_Rule_Store::seed_defaults();
        }

        self::seed_playbooks();

    }

    /**
     * Run on plugin deactivation — clear cron event.
     */
    public static function deactivate() {

        $timestamp = wp_next_scheduled( 'maxi_ai_process_batch' );

        if ( $timestamp ) {
            wp_unschedule_event( $timestamp, 'maxi_ai_process_batch' );
        }

    }

    /**
     * Run schema migrations and seeders only when the plugin version changes.
     *
     * One get_option() call per request instead of four. On version match
     * (99.9% of requests), returns immediately with no further DB queries.
     */
    private static function maybe_upgrade() {

        $installed_version = get_option( 'maxi_ai_db_version', '0' );

        if ( version_compare( $installed_version, self::DB_VERSION, '>=' ) ) {
            return;
        }

        // v1.5.0: rename agent_rules → ability_rules table.
        if ( version_compare( $installed_version, '1.5.0', '<' ) ) {
            self::rename_rules_table();
        }

        // v1.6.0: operator-note lifecycle change (open/acknowledged/resolved → review/active/idle/archived).
        if ( version_compare( $installed_version, '1.6.0', '<' ) ) {
            self::migrate_operator_note_statuses();
        }

        // v1.8.0: add assigned_to column for multi-agent note assignment.
        if ( version_compare( $installed_version, '1.8.0', '<' ) ) {
            self::add_assigned_to_column();
        }

        // Version changed — run schema migration + all seeders.
        self::create_tables();
        self::seed_blocklist();
        self::seed_mask_fields();
        self::seed_ability_rules();
        self::seed_playbooks();
        update_option( 'maxi_ai_db_version', self::DB_VERSION );

    }

    /**
     * Detect shipped content drift and re-seed playbooks / rules automatically.
     *
     * Compares a hash-of-hashes fingerprint of the shipped defaults against
     * a stored option. On mismatch, runs seed_defaults() — which only
     * touches rows whose per-row content_hash actually differs (no version
     * churn on unchanged rows). After seeding, verifies all rows converged
     * before storing the new fingerprint; a partial failure leaves the
     * option stale so the next request retries.
     *
     * Steady-state cost: two get_option() reads + two memoized SHA-256
     * hashes over in-memory arrays. Zero DB writes.
     */
    private static function maybe_refresh_seeds() {

        // --- Playbooks ---
        // Defensive: if includes/playbooks.php failed to load (partial deploy,
        // filesystem race, etc.), skip this branch with a log line rather than
        // taking the site down with a fatal. This path is an optimization
        // (drift detection), not critical functionality.
        if ( class_exists( 'Maxi_AI_Playbook_Store' ) ) {

            $shipped_pb = Maxi_AI_Playbook_Store::fingerprint_shipped_defaults();

            if ( $shipped_pb !== get_option( 'maxi_ai_playbooks_seed_hash', '' ) ) {

                $count = Maxi_AI_Playbook_Store::seed_defaults();

                // Only store the fingerprint if every default row now matches.
                // Prevents a partial failure from being silently accepted.
                if ( Maxi_AI_Playbook_Store::verify_seed_hashes() ) {
                    update_option( 'maxi_ai_playbooks_seed_hash', $shipped_pb, false );
                }

                if ( $count > 0 ) {
                    do_action( 'maxi_ai_audit', 'playbooks_reseeded', [
                        'rows_affected' => $count,
                        'trigger'       => 'auto',
                    ] );
                }
            }

        } else {
            error_log( '[Maxi AI] maybe_refresh_seeds: Maxi_AI_Playbook_Store not loaded — skipping playbook drift check. Likely a partial deploy; normal operation resumes when includes/playbooks.php is in place.' );
        }

        // --- Rules ---
        if ( class_exists( 'Maxi_AI_Rule_Store' ) ) {

            $shipped_r = Maxi_AI_Rule_Store::fingerprint_shipped_defaults();

            if ( $shipped_r !== get_option( 'maxi_ai_rules_seed_hash', '' ) ) {

                $count = Maxi_AI_Rule_Store::seed_defaults();

                if ( Maxi_AI_Rule_Store::verify_seed_hashes() ) {
                    update_option( 'maxi_ai_rules_seed_hash', $shipped_r, false );
                }

                if ( $count > 0 ) {
                    do_action( 'maxi_ai_audit', 'rules_reseeded', [
                        'rows_affected' => $count,
                        'trigger'       => 'auto',
                    ] );
                }
            }

        } else {
            error_log( '[Maxi AI] maybe_refresh_seeds: Maxi_AI_Rule_Store not loaded — skipping rule drift check. Likely a partial deploy; normal operation resumes when includes/rules.php is in place.' );
        }

    }

    /**
     * Seed the DB query blocklist with sensible defaults the first time
     * MAXI_AI_WP_CLI_ALLOW_DB_READS is enabled. Runs once — if the option
     * already exists (even as an empty array) the user's choice is respected.
     */
    private static function seed_blocklist() {

        if ( ! defined( 'MAXI_AI_WP_CLI_ALLOW_DB_READS' ) || ! MAXI_AI_WP_CLI_ALLOW_DB_READS ) {
            return;
        }

        // false means the option does not exist yet — first run.
        if ( false !== get_option( 'maxi_ai_db_query_blocklist' ) ) {
            return;
        }

        $defaults = [
            'user_pass',
            'user_activation_key',
            'session_tokens',
        ];

        add_option( 'maxi_ai_db_query_blocklist', $defaults );

    }

    /**
     * Seed the GDPR data mask fields with sensible defaults on first load.
     * Covers common PII field names used by WordPress core and WooCommerce.
     */
    private static function seed_mask_fields() {

        // false means the option does not exist yet — first run.
        if ( false !== get_option( 'maxi_ai_mask_fields' ) ) {
            return;
        }

        $defaults = [
            // Core user fields.
            'first_name',
            'last_name',
            'display_name',
            'nickname',
            'user_email',

            // Generic PII keys (appear as leaf keys in nested structures).
            'email',
            'phone',
            'address_1',
            'address_2',
            'postcode',
            'city',
            'company',

            // WooCommerce billing (flat meta keys).
            'billing_first_name',
            'billing_last_name',
            'billing_email',
            'billing_phone',
            'billing_address_1',
            'billing_address_2',
            'billing_postcode',
            'billing_city',
            'billing_company',

            // WooCommerce shipping (flat meta keys).
            'shipping_first_name',
            'shipping_last_name',
            'shipping_phone',
            'shipping_address_1',
            'shipping_address_2',
            'shipping_postcode',
            'shipping_city',
            'shipping_company',
        ];

        add_option( 'maxi_ai_mask_fields', $defaults );

    }

    /**
     * Register the MCP response masking filter.
     *
     * Hooks into `mcp_adapter_tool_result` so every ability response is
     * checked for PII fields before reaching the agent.
     *
     * Skipped entirely if MAXI_AI_DATA_MASKING is defined as false.
     */
    private static function register_masking_filter() {

        if ( defined( 'MAXI_AI_DATA_MASKING' ) && MAXI_AI_DATA_MASKING === false ) {
            return;
        }

        // Filter at the REST API level — catches both MCP adapter and direct ability calls.
        add_filter(
            'rest_post_dispatch',
            [ 'Maxi_AI_Data_Masking', 'filter_rest_response' ],
            999,
            3
        );

    }

    /**
     * Create or update custom database tables via dbDelta.
     */
    private static function create_tables() {

        global $wpdb;

        $charset_collate = $wpdb->get_charset_collate();

        $jobs_table  = $wpdb->prefix . 'maxi_ai_jobs';
        $items_table = $wpdb->prefix . 'maxi_ai_job_items';
        $audit_table = $wpdb->prefix . 'maxi_ai_audit_log';
        $notes_table    = $wpdb->prefix . 'maxi_ai_notes';
        $comments_table = $wpdb->prefix . 'maxi_ai_note_comments';

        $sql = "CREATE TABLE {$jobs_table} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            type varchar(50) NOT NULL DEFAULT '',
            status varchar(20) NOT NULL DEFAULT 'pending',
            priority int(11) NOT NULL DEFAULT 10,
            params longtext,
            result longtext,
            created_at datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
            updated_at datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
            completed_at datetime DEFAULT NULL,
            attempts int(11) NOT NULL DEFAULT 0,
            max_attempts int(11) NOT NULL DEFAULT 3,
            error text,
            locked_at datetime DEFAULT NULL,
            locked_by varchar(64) DEFAULT NULL,
            total_items int(11) NOT NULL DEFAULT 0,
            processed_items int(11) NOT NULL DEFAULT 0,
            failed_items int(11) NOT NULL DEFAULT 0,
            PRIMARY KEY  (id),
            KEY status_priority (status, priority, created_at),
            KEY locked_at (locked_at)
        ) $charset_collate;

        CREATE TABLE {$items_table} (
            id bigint(20) NOT NULL AUTO_INCREMENT,
            job_id bigint(20) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            input longtext,
            output longtext,
            attempts int(11) NOT NULL DEFAULT 0,
            max_attempts int(11) NOT NULL DEFAULT 3,
            error text,
            next_attempt_at datetime DEFAULT NULL,
            created_at datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
            updated_at datetime NOT NULL DEFAULT '0000-00-00 00:00:00',
            PRIMARY KEY  (id),
            KEY job_id (job_id),
            KEY status_next_attempt (status, next_attempt_at)
        ) $charset_collate;

        CREATE TABLE {$audit_table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            ts datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            category varchar(30) NOT NULL DEFAULT '',
            event varchar(40) NOT NULL DEFAULT '',
            actor_id bigint(20) unsigned NOT NULL DEFAULT 0,
            subject varchar(190) NOT NULL DEFAULT '',
            context text,
            entry_hash varchar(64) NOT NULL DEFAULT '',
            PRIMARY KEY  (id),
            KEY category_ts (category, ts),
            KEY event_ts (event, ts),
            KEY ts (ts)
        ) $charset_collate;

        CREATE TABLE {$notes_table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            type varchar(20) NOT NULL DEFAULT 'agent-note',
            status varchar(20) NOT NULL DEFAULT 'open',
            title varchar(255) NOT NULL DEFAULT '',
            content longtext,
            topic varchar(50) DEFAULT '',
            priority varchar(10) NOT NULL DEFAULT 'normal',
            author_id bigint(20) unsigned NOT NULL DEFAULT 0,
            assigned_to bigint(20) unsigned DEFAULT NULL,
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            KEY type_status (type, status),
            KEY type_topic (type, topic),
            KEY priority_created (priority, created_at),
            KEY created_at (created_at),
            KEY assigned_to (assigned_to)
        ) $charset_collate;

        CREATE TABLE {$comments_table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            note_id bigint(20) unsigned NOT NULL,
            author_name varchar(100) NOT NULL DEFAULT '',
            content longtext,
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            KEY note_id (note_id),
            KEY created_at (created_at)
        ) $charset_collate;";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta( $sql );

        // Agent rules table lives in its own schema class so it can be
        // reused from activation, upgrade, and tests. Guarded for the same
        // reason as activate() — a bad class load shouldn't fatal the
        // upgrade path.
        if ( class_exists( 'Maxi_AI_Rule_Schema' ) ) {
            Maxi_AI_Rule_Schema::create_or_upgrade();
        }

        // Playbooks table — same pattern.
        if ( class_exists( 'Maxi_AI_Playbook_Schema' ) ) {
            Maxi_AI_Playbook_Schema::create_or_upgrade();
        }

    }

    /**
     * Rename wp_maxi_ai_agent_rules → wp_maxi_ai_ability_rules.
     *
     * Atomic RENAME TABLE — preserves all data, indexes, and constraints.
     * Only runs when upgrading from < 1.5.0. New installs get the new
     * table name directly via dbDelta in create_tables().
     */
    private static function rename_rules_table() {

        global $wpdb;

        $old = $wpdb->prefix . 'maxi_ai_agent_rules';
        $new = $wpdb->prefix . 'maxi_ai_ability_rules';

        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $old ) ) === $old ) {
            $wpdb->query( "RENAME TABLE `{$old}` TO `{$new}`" );
        }

    }

    /**
     * Migrate operator-note statuses from the old lifecycle to the new one.
     *
     * Old: open, acknowledged, resolved, archived
     * New: review, active, idle, archived
     *
     * Mapping: open → review, acknowledged → active, resolved → archived.
     * Only runs when upgrading from < 1.6.0.
     */
    private static function migrate_operator_note_statuses() {

        global $wpdb;

        $table = $wpdb->prefix . 'maxi_ai_notes';

        // Check table exists (fresh installs won't have notes yet).
        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
            return;
        }

        $wpdb->query( "UPDATE {$table} SET status = 'review' WHERE type = 'operator-note' AND status = 'open'" );
        $wpdb->query( "UPDATE {$table} SET status = 'active' WHERE type = 'operator-note' AND status = 'acknowledged'" );
        $wpdb->query( "UPDATE {$table} SET status = 'archived' WHERE type = 'operator-note' AND status = 'resolved'" );

    }

    /**
     * Add assigned_to column to notes table for multi-agent task routing.
     * Only runs when upgrading from < 1.8.0.
     */
    private static function add_assigned_to_column() {

        global $wpdb;

        $table = $wpdb->prefix . 'maxi_ai_notes';

        // Check table exists (fresh installs won't have notes yet).
        if ( $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) !== $table ) {
            return;
        }

        // Idempotent: skip if column already exists.
        $column = $wpdb->get_results( "SHOW COLUMNS FROM {$table} LIKE 'assigned_to'" );
        if ( ! empty( $column ) ) {
            return;
        }

        $wpdb->query( "ALTER TABLE {$table} ADD COLUMN assigned_to bigint(20) unsigned DEFAULT NULL AFTER author_id" );
        $wpdb->query( "ALTER TABLE {$table} ADD KEY assigned_to (assigned_to)" );

    }

    /**
     * Seed the baseline ability rules on every DB-version bump.
     *
     * `Rule_Store::seed_defaults()` is idempotent and never overwrites
     * operator-authored rules, so it is safe to run on every upgrade.
     * This ensures shipped rule content stays current after plugin updates
     * (e.g. ability renames, workflow improvements, new anti-patterns).
     */
    private static function seed_ability_rules() {

        if ( ! class_exists( 'Maxi_AI_Rule_Store' ) || ! class_exists( 'Maxi_AI_Rule_Schema' ) ) {
            return;
        }

        global $wpdb;

        $table = Maxi_AI_Rule_Schema::table_name();

        // If the table does not exist yet (e.g. activation hook skipped in
        // a dev environment), create it before seeding.
        $exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );

        if ( ! $exists ) {
            Maxi_AI_Rule_Schema::create_or_upgrade();
        }

        Maxi_AI_Rule_Store::seed_defaults();

    }

    /**
     * Seed baseline playbooks on every DB-version bump.
     *
     * `Playbook_Store::seed_defaults()` is idempotent and never overwrites
     * operator-authored playbooks, so it is safe to run on every upgrade.
     */
    private static function seed_playbooks() {

        if ( ! class_exists( 'Maxi_AI_Playbook_Store' ) || ! class_exists( 'Maxi_AI_Playbook_Schema' ) ) {
            return;
        }

        global $wpdb;

        $table = Maxi_AI_Playbook_Schema::table_name();

        // If the table does not exist yet (e.g. activation hook skipped in
        // a dev environment), create it before seeding.
        $exists = $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) );

        if ( ! $exists ) {
            Maxi_AI_Playbook_Schema::create_or_upgrade();
        }

        Maxi_AI_Playbook_Store::seed_defaults();

    }

    /**
     * Schedule the batch processing cron event if not already scheduled.
     */
    private static function schedule_cron() {

        if ( ! wp_next_scheduled( 'maxi_ai_process_batch' ) ) {
            wp_schedule_event( time(), 'every_minute', 'maxi_ai_process_batch' );
        }

    }

}

register_activation_hook( __FILE__, [ 'Maxi_AI', 'activate' ] );
register_deactivation_hook( __FILE__, [ 'Maxi_AI', 'deactivate' ] );

add_action( 'plugins_loaded', [ 'Maxi_AI', 'init' ] );

/**
 * Capture Mcp-Session-Id from every REST request into Maxi_AI_Rule_Session.
 *
 * The MCP adapter reads this header via WP_REST_Request::get_header() and
 * stores it on its own context object — it never populates $_SERVER. Without
 * this filter the playbook/rule gates see a null session ID on every MCP
 * call and fail open. See class-rule-session.php::capture_from_request().
 *
 * Priority 1 to run before any dispatch logic; this filter only reads from
 * the request and does not modify $result.
 */
add_filter( 'rest_pre_dispatch', function ( $result, $server, $request ) {

    if ( class_exists( 'Maxi_AI_Rule_Session' ) && $request instanceof WP_REST_Request ) {
        Maxi_AI_Rule_Session::capture_from_request( $request );
    }

    return $result;

}, 1, 3 );
