<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Ability rules table bootstrap.
 *
 * Creates/migrates `wp_maxi_ai_ability_rules` via dbDelta(). Mirrors the
 * pattern used by the notes table in maxi-ai.php. Called from plugin
 * activation and from Maxi_AI::maybe_upgrade_db() when DB_VERSION is bumped.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Rule_Schema {

    /**
     * Return the fully-prefixed table name.
     */
    public static function table_name(): string {

        global $wpdb;

        return $wpdb->prefix . 'maxi_ai_ability_rules';

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
            ability_id varchar(100) NOT NULL DEFAULT '',
            title varchar(255) NOT NULL DEFAULT '',
            content longtext,
            source varchar(20) NOT NULL DEFAULT 'default',
            version int(11) unsigned NOT NULL DEFAULT 1,
            status varchar(20) NOT NULL DEFAULT 'active',
            delivery_mode varchar(20) NOT NULL DEFAULT 'reject_first',
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY ability_id (ability_id),
            KEY source_idx (source),
            KEY status_idx (status)
        ) $charset_collate;";

        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta( $sql );

    }

}
