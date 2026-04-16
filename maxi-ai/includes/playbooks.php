<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Maxi AI — Playbooks entry point.
 *
 * Loads all playbook sub-files in dependency order and registers the
 * Playbook Gate. Auto-loaded by Maxi_AI::load_includes() via
 * glob('includes/*.php').
 *
 * @see includes/rules.php for the same loading pattern.
 */

$playbooks_dir = __DIR__ . '/playbooks';

// 1. Schema (no dependencies).
require_once $playbooks_dir . '/class-playbook-schema.php';

// 2. Store (depends on schema).
require_once $playbooks_dir . '/class-playbook-store.php';

// 3. Session cache (depends on store + rule-session for session ID).
require_once $playbooks_dir . '/class-playbook-session.php';

// 4. Gate (depends on schema + store + session). Hooks into wp_abilities_api_init.
require_once $playbooks_dir . '/class-playbook-gate.php';
