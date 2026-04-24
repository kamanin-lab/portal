<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/list-files',
        [
            'label'       => 'List Files',
            'description' => 'List files and subdirectories inside wp-content/. Returns filenames with sizes and modification dates, plus subdirectory names for navigation. Use pattern to filter files (e.g. "*.log", "fatal-*"). Use sort to order by name or modified date. Pair with maxi/read-file to inspect file contents.',
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
                        'description' => 'Directory path relative to the WordPress root (ABSPATH). E.g. "wp-content/uploads/wc-logs/" or "wp-content/uploads/2026/04/".',
                    ],
                    'pattern' => [
                        'type'        => 'string',
                        'description' => 'Optional glob pattern to filter files. E.g. "*.log", "fatal-*", "*.csv". Default: "*" (all files).',
                    ],
                    'sort' => [
                        'type'        => 'string',
                        'enum'        => [ 'name', 'modified' ],
                        'description' => 'Sort order: "name" (alphabetical) or "modified" (newest first). Default: "modified".',
                    ],
                    'limit' => [
                        'type'        => 'integer',
                        'description' => 'Max number of files to return. Default: 50, max: 200.',
                    ],
                ],
                'required' => [ 'path' ],
            ],

            'execute_callback' => function ( $input ) {

                $path = trim( $input['path'] ?? '' );

                if ( $path === '' ) {
                    return maxi_ai_response( false, [], 'Directory path is required.' );
                }

                // Normalize: strip leading slash, ensure trailing slash.
                $path = ltrim( $path, '/' );
                $path = rtrim( $path, '/' ) . '/';

                // Block path traversal.
                if ( strpos( $path, '..' ) !== false ) {
                    return maxi_ai_response( false, [], 'Path traversal (..) is not allowed.' );
                }

                // Allowed directory prefixes.
                // Must be inside wp-content/.
                if ( strpos( $path, 'wp-content/' ) !== 0 ) {
                    return maxi_ai_response(
                        false,
                        [ 'path' => $path, 'reason' => 'path_not_allowed' ],
                        'Directory is outside wp-content/.'
                    );
                }

                // Resolve to absolute path.
                $absolute = ABSPATH . $path;
                $real     = realpath( $absolute );

                if ( $real === false || ! is_dir( $real ) ) {
                    return maxi_ai_response(
                        false,
                        [ 'path' => $path ],
                        'Directory not found.'
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

                // Parameters.
                // Allow only safe glob characters: alphanumeric, dash, underscore, dot, asterisk, question mark.
                $pattern = preg_replace( '/[^a-zA-Z0-9\-_.*?]/', '', $input['pattern'] ?? '*' );
                if ( $pattern === '' ) {
                    $pattern = '*';
                }
                $sort    = in_array( $input['sort'] ?? '', [ 'name', 'modified' ], true ) ? $input['sort'] : 'modified';
                $limit   = isset( $input['limit'] ) ? min( max( (int) $input['limit'], 1 ), 200 ) : 50;

                // Collect subdirectories (always listed, regardless of pattern).
                $dirs        = [];
                $dir_entries = glob( $real . '/*', GLOB_ONLYDIR );

                if ( is_array( $dir_entries ) ) {
                    foreach ( $dir_entries as $dir ) {
                        $dirname = basename( $dir );

                        // Skip hidden directories.
                        if ( strpos( $dirname, '.' ) === 0 ) {
                            continue;
                        }

                        $dirs[] = [
                            'name' => $dirname,
                            'path' => $path . $dirname . '/',
                        ];
                    }

                    sort( $dirs );
                }

                // Glob for files.
                $glob_path = $real . '/' . $pattern;
                $matches   = glob( $glob_path );

                if ( $matches === false ) {
                    $matches = [];
                }

                // Filter to files only (no directories), exclude hidden files.
                $files = [];

                foreach ( $matches as $file ) {
                    if ( ! is_file( $file ) ) {
                        continue;
                    }

                    $basename = basename( $file );

                    // Skip hidden files.
                    if ( strpos( $basename, '.' ) === 0 ) {
                        continue;
                    }

                    $modified = filemtime( $file );
                    $size     = filesize( $file );

                    $files[] = [
                        'name'     => $basename,
                        'path'     => $path . $basename,
                        'size'     => $size,
                        'size_h'   => size_format( $size ),
                        'modified' => gmdate( 'Y-m-d H:i:s', $modified ),
                        'modified_ts' => $modified,
                    ];
                }

                // Sort.
                if ( $sort === 'modified' ) {
                    usort( $files, function ( $a, $b ) {
                        return $b['modified_ts'] - $a['modified_ts'];
                    } );
                } else {
                    usort( $files, function ( $a, $b ) {
                        return strcmp( $a['name'], $b['name'] );
                    } );
                }

                $total = count( $files );

                // Apply limit.
                $files = array_slice( $files, 0, $limit );

                // Remove internal timestamp field.
                $files = array_map( function ( $f ) {
                    unset( $f['modified_ts'] );
                    return $f;
                }, $files );

                return maxi_ai_response( true, [
                    'path'    => $path,
                    'pattern' => $pattern,
                    'sort'    => $sort,
                    'dirs'    => $dirs,
                    'total'   => $total,
                    'showing' => count( $files ),
                    'files'   => $files,
                ] );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_options' );
            },

        ]
    );

} );
