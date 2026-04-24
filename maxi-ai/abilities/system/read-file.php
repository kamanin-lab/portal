<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/read-file',
        [
            'label'       => 'Read File',
            'description' => 'Read a file from the wp-content/ directory. Can read any file type including PHP source code for debugging. Sensitive filenames (wp-config.php, .env, .htaccess) and dangerous extensions (.sql, .pem, .sh) are blocked. Max file size: 500 KB. Use tail_lines to read only the last N lines of large log files.',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'dev_tools_admin',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'path' => [
                        'type'        => 'string',
                        'description' => 'File path relative to the WordPress root (ABSPATH). E.g. "wp-content/uploads/wc-logs/fatal-errors-2026-04-07.log" or "wp-content/debug.log".',
                    ],
                    'tail_lines' => [
                        'type'        => 'integer',
                        'description' => 'If set, return only the last N lines of the file. Useful for large log files. Max 500.',
                    ],
                ],
                'required' => [ 'path' ],
            ],

            'execute_callback' => function ( $input ) {

                $path = trim( $input['path'] ?? '' );

                if ( $path === '' ) {
                    return maxi_ai_response( false, [], 'File path is required.' );
                }

                // Normalize: strip leading slash, collapse dots and slashes.
                $path = ltrim( $path, '/' );

                // Block path traversal.
                if ( strpos( $path, '..' ) !== false ) {
                    return maxi_ai_response( false, [], 'Path traversal (..) is not allowed.' );
                }

                // Blocked filenames — always rejected regardless of location.
                $blocked_filenames = [
                    'wp-config.php',
                    '.env',
                    '.htaccess',
                    '.htpasswd',
                    'php.ini',
                    '.user.ini',
                    'credentials.json',
                    'auth.json',
                ];

                $basename = basename( $path );

                foreach ( $blocked_filenames as $blocked ) {
                    if ( strcasecmp( $basename, $blocked ) === 0 ) {
                        return maxi_ai_response(
                            false,
                            [ 'path' => $path, 'reason' => 'blocked_filename' ],
                            sprintf( '"%s" is a blocked filename and cannot be read.', $blocked )
                        );
                    }
                }

                // Must be inside wp-content/.
                if ( strpos( $path, 'wp-content/' ) !== 0 ) {
                    return maxi_ai_response(
                        false,
                        [ 'path' => $path, 'reason' => 'path_not_allowed' ],
                        'Path is outside wp-content/.'
                    );
                }

                // Block dangerous non-PHP extensions.
                $blocked_extensions = [ 'phtml', 'phar', 'sh', 'bash', 'sql', 'key', 'pem', 'crt' ];
                $extension          = strtolower( pathinfo( $basename, PATHINFO_EXTENSION ) );

                if ( in_array( $extension, $blocked_extensions, true ) ) {
                    return maxi_ai_response(
                        false,
                        [ 'path' => $path, 'reason' => 'blocked_extension' ],
                        sprintf( '".%s" files cannot be read for security reasons.', $extension )
                    );
                }

                // Resolve to absolute path.
                $absolute = ABSPATH . $path;
                $real     = realpath( $absolute );

                if ( $real === false || ! is_file( $real ) ) {
                    return maxi_ai_response(
                        false,
                        [ 'path' => $path ],
                        'File not found.'
                    );
                }

                // Verify the resolved path is still within ABSPATH (symlink safety).
                if ( strpos( $real, realpath( ABSPATH ) ) !== 0 ) {
                    return maxi_ai_response(
                        false,
                        [ 'path' => $path, 'reason' => 'path_escaped' ],
                        'Resolved path is outside the WordPress installation.'
                    );
                }

                // Max file size: 500 KB.
                $max_size = 512000;
                $size     = filesize( $real );

                $tail_lines = isset( $input['tail_lines'] ) ? (int) $input['tail_lines'] : 0;
                $tail_lines = min( max( $tail_lines, 0 ), 500 );

                if ( $size > $max_size && $tail_lines === 0 ) {
                    return maxi_ai_response(
                        false,
                        [
                            'path'      => $path,
                            'size'      => $size,
                            'max_size'  => $max_size,
                            'reason'    => 'file_too_large',
                        ],
                        sprintf(
                            'File is %s which exceeds the 500 KB limit. Use tail_lines to read the last N lines instead.',
                            size_format( $size )
                        )
                    );
                }

                // Read file content.
                if ( $tail_lines > 0 ) {
                    // Read last N lines efficiently.
                    $lines  = file( $real, FILE_IGNORE_NEW_LINES );
                    $total  = count( $lines );
                    $sliced = array_slice( $lines, -$tail_lines );

                    return maxi_ai_response( true, [
                        'path'        => $path,
                        'size'        => $size,
                        'total_lines' => $total,
                        'showing'     => count( $sliced ) . ' of ' . $total . ' lines (tail)',
                        'content'     => implode( "\n", $sliced ),
                    ] );
                }

                $content = file_get_contents( $real );

                if ( $content === false ) {
                    return maxi_ai_response( false, [ 'path' => $path ], 'Failed to read file.' );
                }

                return maxi_ai_response( true, [
                    'path'    => $path,
                    'size'    => $size,
                    'content' => $content,
                ] );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
