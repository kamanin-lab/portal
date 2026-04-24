<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Detect whether we are currently handling an HTTP request.
 *
 * Returns false for WP-CLI, cron, and PHP CLI/phpdbg contexts. The gates use
 * this to decide how to treat a missing MCP session: CLI/cron is trusted and
 * passed through; HTTP without a session is refused (fail-closed).
 *
 * @return bool True if in an HTTP request context.
 */
function maxi_ai_is_http_context(): bool {

    if ( defined( 'WP_CLI' ) && WP_CLI ) {
        return false;
    }

    if ( defined( 'DOING_CRON' ) && DOING_CRON ) {
        return false;
    }

    $sapi = php_sapi_name();

    if ( $sapi === 'cli' || $sapi === 'cli-server' || $sapi === 'phpdbg' ) {
        return false;
    }

    return true;

}

/**
 * Helper function to Standardize API responses for Maxi AI abilities.
 *
 * @param bool $success Indicates whether the API request was successful.
 * @param array $data Optional. The data to return in the response.
 * @param string|null $error Optional. The error message, if any.
 * @return array The standardized API response.
 */
function maxi_ai_response( $success, $data = [], $error = null ) {

    if ( ! $success && $error ) {
        // Log the FULL error (including paths) server-side for debugging.
        error_log( sprintf( '[Maxi AI] Error: %s', $error ) );

        // Sanitize the error before returning to the agent.
        $error = maxi_ai_sanitize_error( (string) $error );
    }

    return [
        'success' => (bool) $success,
        'data'    => is_array( $data ) ? $data : [],
        'error'   => $error ? (string) $error : null,
        '_meta'   => [
            'operator_notes_revision'  => maxi_ai_operator_notes_revision_get(),
            'knowledge_notes_revision' => maxi_ai_knowledge_notes_revision_get(),
        ],
    ];

}

/**
 * Read the current operator-notes revision counter.
 *
 * Soft-signal: stamped on every ability response envelope so agents can
 * detect mid-session operator-note changes without re-bootstrapping.
 */
function maxi_ai_operator_notes_revision_get() : int {
    return (int) get_option( 'maxi_ai_operator_notes_revision', 0 );
}

/**
 * Atomically increment the operator-notes revision counter.
 *
 * Uses INSERT ... ON DUPLICATE KEY UPDATE so concurrent writes never
 * lose a tick.
 */
function maxi_ai_operator_notes_revision_bump() : int {

    global $wpdb;

    $wpdb->query(
        "INSERT INTO {$wpdb->options} (option_name, option_value, autoload)
         VALUES ('maxi_ai_operator_notes_revision', '1', 'yes')
         ON DUPLICATE KEY UPDATE option_value = CAST(option_value AS UNSIGNED) + 1"
    );

    wp_cache_delete( 'maxi_ai_operator_notes_revision', 'options' );

    return maxi_ai_operator_notes_revision_get();
}

/**
 * Read the current knowledge-notes revision counter.
 *
 * Soft-signal: stamped on every ability response envelope so agents can
 * detect mid-session agent-knowledge changes without re-bootstrapping.
 */
function maxi_ai_knowledge_notes_revision_get() : int {
    return (int) get_option( 'maxi_ai_knowledge_notes_revision', 0 );
}

/**
 * Atomically increment the knowledge-notes revision counter.
 *
 * Uses INSERT ... ON DUPLICATE KEY UPDATE so concurrent writes never
 * lose a tick.
 */
function maxi_ai_knowledge_notes_revision_bump() : int {

    global $wpdb;

    $wpdb->query(
        "INSERT INTO {$wpdb->options} (option_name, option_value, autoload)
         VALUES ('maxi_ai_knowledge_notes_revision', '1', 'yes')
         ON DUPLICATE KEY UPDATE option_value = CAST(option_value AS UNSIGNED) + 1"
    );

    wp_cache_delete( 'maxi_ai_knowledge_notes_revision', 'options' );

    return maxi_ai_knowledge_notes_revision_get();
}

/**
 * Attach an ability-rule body to a maxi_ai_response() envelope under
 * _meta._rule. The shape mirrors the data field of maxi/get-ability-rule so
 * agents can reuse the same reader path regardless of whether the rule
 * arrives via the dedicated ability or inline on a gated response.
 *
 * Called from the rule gate when transitioning a session from unseen to
 * either delivered (reject_first) or acknowledged (inline_on_success). Only
 * the envelope is mutated — the wrapped ability never sees this call.
 *
 * @param array $response Envelope returned by maxi_ai_response(). Modified in place.
 * @param array $rule_row Row from Maxi_AI_Rule_Store::get(). Must carry ability_id, title,
 *                        content, source, version, status, updated_at, delivery_mode.
 */
function maxi_ai_attach_rule( array &$response, array $rule_row ): void {

    if ( ! isset( $response['_meta'] ) || ! is_array( $response['_meta'] ) ) {
        $response['_meta'] = [];
    }

    $response['_meta']['_rule'] = [
        'ability_id'    => (string) ( $rule_row['ability_id'] ?? '' ),
        'title'         => (string) ( $rule_row['title'] ?? '' ),
        'content'       => (string) ( $rule_row['content'] ?? '' ),
        'source'        => (string) ( $rule_row['source'] ?? '' ),
        'version'       => (int) ( $rule_row['version'] ?? 0 ),
        'status'        => (string) ( $rule_row['status'] ?? '' ),
        'updated_at'    => (string) ( $rule_row['updated_at'] ?? '' ),
        'delivery_mode' => (string) ( $rule_row['delivery_mode'] ?? Maxi_AI_Rule_Store::DELIVERY_REJECT_FIRST ),
    ];

}

/**
 * Sanitize an error message for external consumption.
 *
 * Strips filesystem paths, PHP class/function traces, and other
 * internal details that could leak server information. The full
 * unsanitized error is still logged server-side via error_log().
 *
 * @param string $message The raw error message.
 * @return string Sanitized error message.
 */
function maxi_ai_sanitize_error( $message ) {

    $message = (string) $message;

    if ( $message === '' ) {
        return $message;
    }

    // Strip Unix absolute paths (e.g. /var/www/html/wp-content/...).
    $message = preg_replace( '#/(?:var|home|srv|opt|tmp|usr|etc)/[^\s:,)}\]]+#', '[path]', $message );

    // Strip Windows absolute paths (e.g. C:\Users\...).
    $message = preg_replace( '#[A-Z]:\\\\[^\s:,)}\]]+#i', '[path]', $message );

    // Strip ABSPATH-style WordPress paths that start with /.
    $message = preg_replace( '#/[^\s]*?/wp-(?:content|includes|admin)/[^\s:,)}\]]+#', '[path]', $message );

    // Strip PHP class::method() or function() references in stack-trace style.
    $message = preg_replace( '#[A-Z][a-zA-Z0-9_]+::[a-zA-Z0-9_]+\(\)#', '[internal]', $message );

    // Strip "in /path/to/file.php on line N" patterns.
    $message = preg_replace( '#\s+in\s+\[path\]\s+on\s+line\s+\d+#i', '', $message );

    // Strip raw SQL table names with wp_ prefix.
    $message = preg_replace( '#\bwp_[a-z0-9_]+\b#', '[table]', $message );

    // Collapse multiple spaces.
    $message = preg_replace( '#\s{2,}#', ' ', $message );

    // Truncate to 500 chars.
    if ( strlen( $message ) > 500 ) {
        $message = substr( $message, 0, 497 ) . '...';
    }

    return trim( $message );

}

/**
 * Structured logging for Maxi AI operations.
 *
 * Always logs errors. Info-level messages only logged when MAXI_AI_DEBUG is true.
 *
 * @param string $message  The log message.
 * @param string $level    'error' or 'info'. Default 'info'.
 * @param array  $context  Optional context tags (e.g. ['job' => 42, 'item' => 107, 'provider' => 'openai']).
 */
function maxi_ai_log( $message, $level = 'info', $context = [] ) {

    if ( $level === 'info' && ( ! defined( 'MAXI_AI_DEBUG' ) || ! MAXI_AI_DEBUG ) ) {
        return;
    }

    $tags = '';

    foreach ( $context as $key => $value ) {
        $tags .= sprintf( ' [%s:%s]', $key, $value );
    }

    error_log( sprintf( '[Maxi AI]%s %s', $tags, $message ) );

}

/**
 * Resolve a mixed array of term identifiers (IDs, slugs, or names) into
 * integer term IDs for a given taxonomy. Existing terms are matched by
 * ID → slug → name, in that order. Missing terms are created only when
 * $create_missing is true.
 *
 * This prevents the common bug where passing slug strings to
 * wp_set_object_terms() silently creates duplicate "-2" terms because
 * WordPress treats unmatched strings as new term names.
 *
 * @param array  $terms          List of ints, numeric strings, slugs, or names.
 * @param string $taxonomy       Taxonomy name (e.g. 'pa_size').
 * @param bool   $create_missing Create terms that can't be resolved. Default true.
 * @return int[]|WP_Error        Deduped array of term IDs, or WP_Error.
 */
function maxi_ai_resolve_term_ids( array $terms, string $taxonomy, bool $create_missing = true ) {

    if ( ! taxonomy_exists( $taxonomy ) ) {
        return new WP_Error( 'invalid_taxonomy', 'Invalid taxonomy: ' . $taxonomy );
    }

    $ids = [];

    foreach ( $terms as $raw ) {

        $term = null;

        // 1. Integer or numeric string → treat as term ID.
        if ( is_int( $raw ) || ( is_string( $raw ) && ctype_digit( $raw ) ) ) {
            $candidate = get_term( (int) $raw, $taxonomy );
            if ( $candidate && ! is_wp_error( $candidate ) ) {
                $term = $candidate;
            }
        }

        // 2. String → try slug, then name.
        if ( ! $term && is_string( $raw ) && $raw !== '' ) {
            $slug_candidate = get_term_by( 'slug', $raw, $taxonomy );
            if ( $slug_candidate ) {
                $term = $slug_candidate;
            } else {
                $name_candidate = get_term_by( 'name', $raw, $taxonomy );
                if ( $name_candidate ) {
                    $term = $name_candidate;
                }
            }
        }

        // 3. Still not found → optionally create.
        if ( ! $term && $create_missing && is_string( $raw ) && $raw !== '' ) {
            $created = wp_insert_term( $raw, $taxonomy );
            if ( is_wp_error( $created ) ) {
                // If it's a "term exists" race, recover the existing term.
                $data = $created->get_error_data();
                if ( is_array( $data ) && isset( $data['term_id'] ) ) {
                    $term = get_term( (int) $data['term_id'], $taxonomy );
                } else {
                    return $created;
                }
            } else {
                $term = get_term( (int) $created['term_id'], $taxonomy );
            }
        }

        if ( $term && ! is_wp_error( $term ) ) {
            $ids[] = (int) $term->term_id;
        }
    }

    return array_values( array_unique( $ids ) );

}

/**
 * Validate that content is structurally valid Gutenberg block markup.
 *
 * Performs a structural sanity check:
 * 1. At least one opening block comment exists.
 * 2. Every opening <!-- wp:blockname --> has a matching <!-- /wp:blockname -->.
 * 3. Self-closing blocks (<!-- wp:blockname /--> ) are counted correctly.
 *
 * This is NOT a full Gutenberg parser. It catches common agent errors
 * (raw HTML, missing closing tags) without being brittle about whitespace
 * or attribute formatting.
 *
 * @param string $content The post content to validate.
 * @return true|string True if valid, error message string if invalid.
 */
function maxi_ai_validate_block_markup( $content ) {

    $content = (string) $content;

    if ( $content === '' ) {
        return true; // Empty content is valid (e.g. clearing a post).
    }

    // Check for at least one block comment (opening or self-closing).
    if ( strpos( $content, '<!-- wp:' ) === false ) {
        return 'Content must be valid Gutenberg block markup. Wrap content in block comments (e.g. <!-- wp:paragraph --><p>Text</p><!-- /wp:paragraph -->).';
    }

    // Strip self-closing blocks first so they don't interfere with counting.
    // Self-closing: <!-- wp:blockname /--> or <!-- wp:blockname {"attr":"val"} /-->
    $content_no_sc = preg_replace( '#<!-- wp:(?:[a-z][a-z0-9-]*/)?[a-z][a-z0-9-]*\s*(?:\{[^}]*\}\s*)?/-->#', '', $content );

    // Extract opening blocks from the remaining content.
    // Matches: <!-- wp:blockname --> or <!-- wp:blockname {"attr":"val"} -->
    preg_match_all( '#<!-- wp:((?:[a-z][a-z0-9-]*/)?[a-z][a-z0-9-]*)\s*(?:\{[^}]*\}\s*)?-->#', $content_no_sc, $opens );

    // Extract closing blocks.
    // Matches: <!-- /wp:blockname -->
    preg_match_all( '#<!-- /wp:((?:[a-z][a-z0-9-]*/)?[a-z][a-z0-9-]*)\s*-->#', $content_no_sc, $closes );

    $open_count  = count( $opens[0] );
    $close_count = count( $closes[0] );

    if ( $open_count !== $close_count ) {
        return sprintf(
            'Block markup is malformed: found %d opening block tag(s) but %d closing tag(s). Every <!-- wp:blockname --> must have a matching <!-- /wp:blockname -->.',
            $open_count,
            $close_count
        );
    }

    // Verify each opening block name has a matching closing block name.
    $open_names  = [];
    $close_names = [];

    foreach ( $opens[1] as $name ) {
        $open_names[ $name ] = ( $open_names[ $name ] ?? 0 ) + 1;
    }

    foreach ( $closes[1] as $name ) {
        $close_names[ $name ] = ( $close_names[ $name ] ?? 0 ) + 1;
    }

    foreach ( $open_names as $name => $count ) {
        $closed = $close_names[ $name ] ?? 0;
        if ( $count !== $closed ) {
            return sprintf(
                'Block markup mismatch for "wp:%s": %d opening tag(s) but %d closing tag(s).',
                $name,
                $count,
                $closed
            );
        }
    }

    return true;

}

/**
 * Verify that the current user has permission to access a meta object.
 *
 * Centralises object-level capability checks for all meta abilities.
 *
 * Read context:
 *  - post  → read_post (handles private/draft visibility correctly)
 *  - user  → list_users (admin-only — prevents subscriber PII access)
 *  - term  → no check (intentional: terms are public taxonomy objects)
 *
 * Write context:
 *  - post  → edit_post
 *  - user  → edit_user
 *  - term  → taxonomy manage_terms capability
 *
 * @param string $object_type 'post', 'user', or 'term'.
 * @param int    $object_id   The object ID.
 * @param string $context     'read' or 'write'.
 * @return array|true True if authorised, or maxi_ai_response array on failure.
 */
function maxi_ai_verify_meta_access( string $object_type, int $object_id, string $context = 'read' ) {

    if ( $object_type === 'post' ) {
        if ( ! get_post( $object_id ) ) {
            return maxi_ai_response( false, [], 'Post not found: ' . $object_id );
        }
        $cap = $context === 'write' ? 'edit_post' : 'read_post';
        if ( ! current_user_can( $cap, $object_id ) ) {
            return maxi_ai_response( false, [], 'You do not have permission to ' . $context . ' this post\'s meta.' );
        }
    } elseif ( $object_type === 'user' ) {
        if ( ! get_userdata( $object_id ) ) {
            return maxi_ai_response( false, [], 'User not found: ' . $object_id );
        }
        $cap = $context === 'write' ? 'edit_user' : 'list_users';
        if ( ! current_user_can( $cap, $object_id ) ) {
            return maxi_ai_response( false, [], 'You do not have permission to ' . $context . ' this user\'s meta.' );
        }
    } elseif ( $object_type === 'term' ) {
        $term = get_term( $object_id );
        if ( ! $term || is_wp_error( $term ) ) {
            return maxi_ai_response( false, [], 'Term not found: ' . $object_id );
        }
        if ( $context === 'write' ) {
            $taxonomy = $term->taxonomy;
            $tax_obj  = get_taxonomy( $taxonomy );
            if ( $tax_obj && ! current_user_can( $tax_obj->cap->manage_terms ) ) {
                return maxi_ai_response( false, [], 'You do not have permission to edit this term\'s meta.' );
            }
        }
        // Term-meta reads are intentionally open — terms are public taxonomy objects.
    }

    return true;

}

/**
 * Tokenize a WP-CLI command string into an argv array.
 *
 * This is intentionally narrow — it handles WP-CLI command text, NOT shell
 * command text. Shell metacharacters must be rejected BEFORE calling this
 * function (see run-wp-cli.php Layer 1).
 *
 * Supported syntax:
 *  - Space-separated tokens: "option get blogname" → ['option', 'get', 'blogname']
 *  - Double-quoted strings:  'option get "my option"' → ['option', 'get', 'my option']
 *  - Single-quoted strings:  "post get 1 --field='post_title'" → ['post', 'get', '1', '--field=post_title']
 *
 * NOT supported (and not needed for WP-CLI):
 *  - Backslash escaping (\ is rejected by the metacharacter filter)
 *  - Nested quotes
 *  - Shell expansions ($, `, etc.)
 *
 * @param string $command The WP-CLI command (without "wp" prefix).
 * @return array|string Array of argv tokens on success, or error message string on failure.
 */
function maxi_ai_tokenize_cli_command( string $command ): array|string {

    $tokens  = [];
    $current = '';
    $len     = strlen( $command );
    $i       = 0;

    while ( $i < $len ) {
        $char = $command[ $i ];

        if ( $char === '"' || $char === "'" ) {
            $quote = $char;
            $i++;
            while ( $i < $len && $command[ $i ] !== $quote ) {
                $current .= $command[ $i ];
                $i++;
            }
            if ( $i >= $len ) {
                return 'Unbalanced ' . $quote . ' quote in command.';
            }
            $i++; // Skip closing quote.
        } elseif ( $char === ' ' || $char === "\t" ) {
            if ( $current !== '' ) {
                $tokens[] = $current;
                $current  = '';
            }
            $i++;
        } else {
            $current .= $char;
            $i++;
        }
    }

    if ( $current !== '' ) {
        $tokens[] = $current;
    }

    return $tokens;

}

/**
 * Normalize an order-direction string to 'ASC' or 'DESC'.
 *
 * Case-insensitive. Returns uppercase. Falls back to $default on invalid input.
 * Used across list-* abilities to avoid the sanitize_key() trap (sanitize_key
 * lowercases and would mangle 'DESC' to 'desc', which — while harmless for
 * WP_Query — silently breaks any downstream case-sensitive comparison).
 *
 * @param string|null $value   Raw caller-supplied order direction.
 * @param string      $default Fallback if $value is missing or invalid.
 * @return string 'ASC' or 'DESC'.
 */
function maxi_ai_normalize_order( ?string $value, string $default = 'DESC' ): string {

    if ( ! is_string( $value ) ) {
        return $default;
    }

    $up = strtoupper( trim( $value ) );

    return in_array( $up, [ 'ASC', 'DESC' ], true ) ? $up : $default;

}

/**
 * Validate an orderby value against an explicit allowlist.
 *
 * Returns the caller-supplied value only when it appears in $allowed;
 * returns $default for missing, empty, or out-of-list values. Never lets
 * untrusted input reach the backend query layer — even though the schema
 * enum should block invalid values, we re-check in-process for defense
 * in depth. MCP dispatch paths have shown REST-validator gaps in the
 * past (see edge-cases/generic-mcp-tool-error.md).
 *
 * The allowlist is the ability's own enum — pass it in explicitly so
 * the validator stays strict and per-ability.
 *
 * @param string|null $value    Raw caller-supplied orderby.
 * @param string[]    $allowed  Allowlist of valid orderby values for this ability.
 * @param string      $default  Fallback if missing/invalid. Should itself be in $allowed.
 * @return string Validated orderby value.
 */
function maxi_ai_normalize_orderby( ?string $value, array $allowed, string $default ): string {

    if ( ! is_string( $value ) || $value === '' ) {
        return $default;
    }

    return in_array( $value, $allowed, true ) ? $value : $default;

}

/**
 * Map a validated list-notes orderby enum value to a SQL ORDER BY fragment.
 *
 * Only consumed by maxi/list-notes, which queries the custom wp_maxi_ai_notes
 * table directly. Caller must pre-validate $orderby via
 * maxi_ai_normalize_orderby() against the list-notes enum, and $order via
 * maxi_ai_normalize_order(). Inputs are constants by the time they reach here,
 * so direct interpolation into SQL is safe.
 *
 * Priority ordering uses an explicit CASE expression so 'priority DESC'
 * yields critical → high → normal → low (semantic rank, not alphabetical
 * string sort). 'rand' ignores direction. Secondary 'created_at DESC'
 * tie-breaker on priority keeps ordering deterministic within a bucket.
 *
 * @param string $orderby Pre-validated enum value (one of:
 *                        created_at, updated_at, id, title, priority, rand).
 * @param string $order   'ASC' or 'DESC'. Ignored when $orderby is 'rand'.
 * @return string SQL fragment safe to interpolate into ORDER BY.
 */
function maxi_ai_notes_order_sql( string $orderby, string $order ): string {

    $priority_case = "CASE priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 WHEN 'low' THEN 1 ELSE 0 END";

    $map = [
        'created_at' => "created_at {$order}",
        'updated_at' => "updated_at {$order}",
        'id'         => "id {$order}",
        'title'      => "title {$order}",
        'priority'   => "{$priority_case} {$order}, created_at DESC",
        'rand'       => "RAND()",
    ];

    return $map[ $orderby ] ?? $map['created_at'];

}

/**
 * Compute a price-range aggregate for a WooCommerce variable product.
 *
 * Returns an array of min/max values across visible variations for regular
 * price, sale price, and active price (sale-if-applicable). Returns null for
 * non-variable products or variable products with no visible variations —
 * callers should treat null as "price_range is not applicable for this
 * product; use the parent's own price fields."
 *
 * All values are raw numeric strings as returned by WC (e.g. "44.99").
 * Sale min/max are empty string if no variations are currently on sale.
 *
 * Uses WC's built-in cached methods — typical cost is one transient lookup
 * per product, not one per variation.
 *
 * @param mixed $product A WC_Product instance, or anything else (returns null).
 * @return array|null
 *   [
 *     'regular_min' => string,
 *     'regular_max' => string,
 *     'sale_min'    => string,  // "" if no variation on sale
 *     'sale_max'    => string,  // "" if no variation on sale
 *     'min'         => string,  // active price min (sale if applicable)
 *     'max'         => string,  // active price max
 *   ]
 */
function maxi_ai_compute_price_range( $product ): ?array {

    if ( ! class_exists( 'WC_Product_Variable' ) ) {
        return null;
    }

    if ( ! ( $product instanceof WC_Product_Variable ) ) {
        return null;
    }

    $prices = $product->get_variation_prices( false );

    // Empty arrays mean no visible variations — aggregate is meaningless.
    if ( empty( $prices['price'] ) ) {
        return null;
    }

    // WC's min/max getters return false when no variations qualify
    // (e.g. sale_min when no variations are on sale). Normalize to
    // empty string for JSON cleanliness.
    $normalize = static function ( $value ): string {
        if ( $value === false || $value === null ) {
            return '';
        }
        return (string) $value;
    };

    return [
        'regular_min' => $normalize( $product->get_variation_regular_price( 'min', false ) ),
        'regular_max' => $normalize( $product->get_variation_regular_price( 'max', false ) ),
        'sale_min'    => $normalize( $product->get_variation_sale_price( 'min', false ) ),
        'sale_max'    => $normalize( $product->get_variation_sale_price( 'max', false ) ),
        'min'         => $normalize( $product->get_variation_price( 'min', false ) ),
        'max'         => $normalize( $product->get_variation_price( 'max', false ) ),
    ];

}