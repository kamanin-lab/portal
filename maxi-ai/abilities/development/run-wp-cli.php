<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/run-wp-cli',
        [
            'label'       => 'Run WP-CLI',
            'description' => 'Execute a WP-CLI command on the server. Restricted to administrators and to a prefix-based allowlist: read-only commands (option get, post list, core version, ...) are always allowed; write commands must be enabled individually via wp-config.php constants (MAXI_AI_WP_CLI_ALLOW_CACHE_WRITES, _CONTENT_WRITES, _USER_WRITES, _OPTION_WRITES). A NEVER list (db drop, plugin install, eval, ...) cannot be enabled by any constant. Rejected commands are recorded in the audit log.',
            'category'    => 'development',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'command' => [
                        'type'        => 'string',
                        'description' => 'The WP-CLI command to run (without "wp" prefix). This accepts WP-CLI command text only — shell syntax (pipes, redirects, semicolons, backticks, $() etc.) is not permitted. Use double or single quotes for values containing spaces. E.g. "option get blogname", "option get \"my option\"".',
                    ],
                ],
                'required' => [ 'command' ],
            ],

            'execute_callback' => function ( $input ) {

                $command = wp_strip_all_tags( $input['command'] ?? '' );
                $command = preg_replace( '/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $command );
                $command = trim( $command );

                if ( empty( $command ) ) {
                    return maxi_ai_response( false, [], 'Missing command.' );
                }

                // Layer 1: Reject shell metacharacters — security boundary.
                // This is WP-CLI command text, not shell command text.
                // WP-CLI commands are "subcommand arg --flag=value" — shell syntax
                // (pipes, redirects, subshells, etc.) is never needed or allowed.
                if ( preg_match( '/[;|&`$()<>{}!\\\\\n\r]/', $command ) ) {
                    Maxi_AI_Audit_Log::record(
                        'wp_cli',
                        'wp_cli_rejected',
                        get_current_user_id(),
                        $command,
                        [
                            'reason'      => 'dangerous_characters',
                            'raw_command' => $command,
                        ]
                    );

                    return maxi_ai_response(
                        false,
                        [
                            'command' => $command,
                            'reason'  => 'dangerous_characters',
                        ],
                        'Command contains disallowed characters. Shell syntax (;, |, &, $, backticks, etc.) is not permitted. This accepts WP-CLI command text only.'
                    );
                }

                // Allowlist check.
                $check = Maxi_AI_WP_CLI_Allowlist::is_allowed( $command );

                if ( ! $check['allowed'] ) {

                    $suggest = $check['reason'] === 'not_allowed'
                        ? Maxi_AI_WP_CLI_Allowlist::suggest_enabling_constant( $check['normalized'] )
                        : null;

                    Maxi_AI_Audit_Log::record(
                        'wp_cli',
                        'wp_cli_rejected',
                        get_current_user_id(),
                        $check['normalized'],
                        [
                            'reason'                  => $check['reason'],
                            'matched_prefix'          => $check['matched'],
                            'raw_command'             => $command,
                            'enabling_constant_hint'  => $suggest,
                        ]
                    );

                    $message = sprintf(
                        'Command rejected (%s).',
                        $check['reason']
                    );

                    if ( $check['reason'] === 'hard_banned' ) {
                        $message .= sprintf( ' "%s" is on the NEVER list and cannot be enabled.', $check['matched'] );
                    } elseif ( $check['reason'] === 'not_allowed' ) {
                        $message .= $suggest
                            ? sprintf( ' Define %s in wp-config.php to enable this command group.', $suggest )
                            : ' Not in the read-only allowlist and not covered by any opt-in group.';
                    }

                    return maxi_ai_response(
                        false,
                        [
                            'command'                => $command,
                            'normalized'             => $check['normalized'],
                            'reason'                 => $check['reason'],
                            'matched_prefix'         => $check['matched'],
                            'enabling_constant_hint' => $suggest,
                        ],
                        $message
                    );
                }

                // DB_READS group: only SELECT statements allowed.
                $is_db_reads = false;
                $blocklist   = [];

                if ( $check['reason'] === 'MAXI_AI_WP_CLI_ALLOW_DB_READS' && $check['matched'] === 'db query' ) {
                    $is_db_reads = true;
                    $normalized = $check['normalized'];
                    // Extract SQL after "db query " prefix.
                    $sql = trim( substr( $normalized, strlen( 'db query ' ) ) );
                    // Strip surrounding quotes if present.
                    $sql = trim( $sql, "\"'" );
                    $sql = ltrim( $sql );

                    $first_word = strtoupper( strtok( $sql, " \t\n\r" ) );

                    if ( $first_word !== 'SELECT' && $first_word !== '(SELECT' ) {
                        Maxi_AI_Audit_Log::record(
                            'wp_cli',
                            'wp_cli_rejected',
                            get_current_user_id(),
                            $check['normalized'],
                            [
                                'reason'      => 'db_reads_select_only',
                                'raw_command' => $command,
                                'sql_keyword' => $first_word,
                            ]
                        );

                        return maxi_ai_response(
                            false,
                            [
                                'command'    => $command,
                                'normalized' => $check['normalized'],
                                'reason'     => 'db_reads_select_only',
                            ],
                            'MAXI_AI_WP_CLI_ALLOW_DB_READS only permits SELECT queries. Got: ' . $first_word
                        );
                    }

                    // Pre-execution blocklist check (SQL text).
                    $blocklist = get_option( 'maxi_ai_db_query_blocklist', [] );

                    if ( ! empty( $blocklist ) && is_array( $blocklist ) ) {
                        $matched_terms = [];

                        foreach ( $blocklist as $term ) {
                            if ( stripos( $sql, $term ) !== false ) {
                                $matched_terms[] = $term;
                            }
                        }

                        if ( ! empty( $matched_terms ) ) {
                            Maxi_AI_Audit_Log::record(
                                'wp_cli',
                                'wp_cli_rejected',
                                get_current_user_id(),
                                $check['normalized'],
                                [
                                    'reason'        => 'db_query_blocklist_sql',
                                    'raw_command'   => $command,
                                    'matched_terms' => $matched_terms,
                                ]
                            );

                            return maxi_ai_response(
                                false,
                                [
                                    'command'       => $command,
                                    'normalized'    => $check['normalized'],
                                    'reason'        => 'db_query_blocklist_sql',
                                    'matched_terms' => $matched_terms,
                                ],
                                sprintf(
                                    'Query rejected: SQL contains blocklisted term(s): %s',
                                    implode( ', ', $matched_terms )
                                )
                            );
                        }
                    }
                }

                $wp_cli = '/usr/local/bin/wp';

                // DDEV environment uses different path.
                if ( getenv( 'IS_DDEV_PROJECT' ) === 'true' ) {
                    $wp_cli = 'wp';
                }

                // Layer 2: Build argv array for proc_open — defense in depth.
                // Even though Layer 1 rejects shell metacharacters, we still avoid
                // shell interpretation entirely by using proc_open with an argv array.
                $cmd_parts = maxi_ai_tokenize_cli_command( $command );

                if ( is_string( $cmd_parts ) ) {
                    // Tokenizer returned an error (e.g. unbalanced quote).
                    return maxi_ai_response(
                        false,
                        [ 'command' => $command, 'reason' => 'tokenizer_error' ],
                        $cmd_parts
                    );
                }

                $argv = array_merge(
                    [ $wp_cli ],
                    $cmd_parts,
                    [ '--path=' . ABSPATH ]
                );

                // Multisite: always pass --url so WP-CLI runs in the correct site context.
                $has_url = false;
                $has_user = false;
                foreach ( $cmd_parts as $part ) {
                    if ( stripos( $part, '--url=' ) === 0 ) {
                        $has_url = true;
                    }
                    if ( stripos( $part, '--user=' ) === 0 ) {
                        $has_user = true;
                    }
                }

                if ( ! $has_url ) {
                    $argv[] = '--url=' . get_site_url();
                }

                // WooCommerce CLI commands require --user for REST API auth.
                if ( ! $has_user && isset( $cmd_parts[0] ) && strcasecmp( $cmd_parts[0], 'wc' ) === 0 ) {
                    $argv[] = '--user=' . get_current_user_id();
                }

                $proc = proc_open(
                    $argv,
                    [
                        1 => [ 'pipe', 'w' ],  // stdout
                        2 => [ 'pipe', 'w' ],  // stderr
                    ],
                    $pipes
                );

                if ( ! is_resource( $proc ) ) {
                    return maxi_ai_response(
                        false,
                        [ 'command' => $command, 'reason' => 'process_failed' ],
                        'Failed to start WP-CLI process.'
                    );
                }

                $stdout = stream_get_contents( $pipes[1] );
                $stderr = stream_get_contents( $pipes[2] );
                fclose( $pipes[1] );
                fclose( $pipes[2] );
                $return_code = proc_close( $proc );

                $output_text = trim( $stdout . ( ! empty( $stderr ) ? "\n" . $stderr : '' ) );

                // Post-execution blocklist check (output text).
                if ( $is_db_reads && ! empty( $blocklist ) ) {
                    $matched_terms = [];

                    foreach ( $blocklist as $term ) {
                        if ( stripos( $output_text, $term ) !== false ) {
                            $matched_terms[] = $term;
                        }
                    }

                    if ( ! empty( $matched_terms ) ) {
                        Maxi_AI_Audit_Log::record(
                            'wp_cli',
                            'wp_cli_rejected',
                            get_current_user_id(),
                            $check['normalized'],
                            [
                                'reason'        => 'db_query_blocklist_output',
                                'raw_command'   => $command,
                                'matched_terms' => $matched_terms,
                            ]
                        );

                        return maxi_ai_response(
                            false,
                            [
                                'command'       => $command,
                                'reason'        => 'db_query_blocklist_output',
                                'matched_terms' => $matched_terms,
                            ],
                            sprintf(
                                'Query output blocked: contains blocklisted term(s): %s. Refine your SELECT columns to exclude sensitive fields.',
                                implode( ', ', $matched_terms )
                            )
                        );
                    }
                }

                if ( $return_code !== 0 ) {
                    return maxi_ai_response(
                        false,
                        [
                            'command'     => $command,
                            'output'      => $output_text,
                            'return_code' => $return_code,
                        ],
                        'WP-CLI command failed with exit code ' . $return_code
                    );
                }

                return maxi_ai_response(
                    true,
                    [
                        'command'     => $command,
                        'output'      => $output_text,
                        'return_code' => $return_code,
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
