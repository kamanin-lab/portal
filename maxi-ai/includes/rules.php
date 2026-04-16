<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Maxi AI — Agent Rules entry point.
 *
 * Loads all rules sub-files in dependency order and registers the Rule Gate.
 * Auto-loaded by Maxi_AI::load_includes() via glob('includes/*.php').
 *
 * @see includes/licensing.php for the same loading pattern.
 */

$rules_dir = __DIR__ . '/rules';

// 1. Schema (no dependencies).
require_once $rules_dir . '/class-rule-schema.php';

// 2. Default rules data (no dependencies).
require_once $rules_dir . '/default-rules.php';

// 3. Store (depends on schema).
require_once $rules_dir . '/class-rule-store.php';

// 4. Session cache (no dependencies).
require_once $rules_dir . '/class-rule-session.php';

// 5. Rate limiter (no dependencies). Used by the gate.
require_once $rules_dir . '/class-rate-limiter.php';

// 6. Gate (depends on store + session + rate limiter). Hooks into wp_abilities_api_init.
require_once $rules_dir . '/class-rule-gate.php';
