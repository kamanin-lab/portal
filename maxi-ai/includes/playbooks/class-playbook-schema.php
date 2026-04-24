<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Playbooks table bootstrap.
 *
 * Creates/migrates `wp_maxi_ai_playbooks` via dbDelta(). Mirrors the
 * pattern used by the rules table in class-rule-schema.php. Called from
 * plugin activation and from Maxi_AI::maybe_upgrade_db() when DB_VERSION
 * is bumped.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Playbook_Schema {

    /**
     * Return the fully-prefixed table name.
     */
    public static function table_name(): string {

        global $wpdb;

        return $wpdb->prefix . 'maxi_ai_playbooks';

    }

    /**
     * Create or upgrade the table via dbDelta.
     *
     * Idempotent — safe to call on every activation and on DB-version bumps.
     */
    public static function create_or_upgrade(): void {

        global $wpdb;

        $table           = self::table_name();
        $charset_collate = $wpdb->get_charset_collate();

        $sql = "CREATE TABLE {$table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            slug varchar(100) NOT NULL DEFAULT '',
            title varchar(255) NOT NULL DEFAULT '',
            content longtext,
            source varchar(20) NOT NULL DEFAULT 'default',
            required tinyint(1) unsigned NOT NULL DEFAULT 0,
            content_hash varchar(64) NOT NULL DEFAULT '',
            version int(11) unsigned NOT NULL DEFAULT 1,
            status varchar(20) NOT NULL DEFAULT 'active',
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY slug (slug),
            KEY source_idx (source),
            KEY required_status (required, status)
        ) $charset_collate;";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta( $sql );

    }

}
