<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/create-content',
        [
            'label'       => 'Create Content',
            'description' => 'Create a new post, page, or custom post type entry.',
            'category'    => 'content',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'post_type' => [
                        'type'        => 'string',
                        'description' => 'The post type (e.g. post, page, product).',
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'The title.',
                    ],
                    'content' => [
                        'type'        => 'string',
                        'description' => 'The content (HTML).',
                    ],
                    'excerpt' => [
                        'type'        => 'string',
                        'description' => 'The excerpt.',
                    ],
                    'status' => [
                        'type'        => 'string',
                        'description' => 'Post status. Default "draft".',
                        'enum'        => [ 'draft', 'publish', 'pending', 'private', 'future' ],
                    ],
                    'slug' => [
                        'type'        => 'string',
                        'description' => 'The URL slug.',
                    ],
                    'parent' => [
                        'type'        => 'integer',
                        'description' => 'Parent post ID (for hierarchical types).',
                    ],
                    'author' => [
                        'type'        => 'integer',
                        'description' => 'Author user ID.',
                    ],
                    'date' => [
                        'type'        => 'string',
                        'description' => 'Publish date (Y-m-d H:i:s). Required if status is "future".',
                    ],
                ],
                'required' => [ 'post_type', 'title' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_type = sanitize_key( $input['post_type'] );

                if ( ! post_type_exists( $post_type ) ) {
                    return maxi_ai_response( false, [], 'Invalid post type: ' . $post_type );
                }

                $post_data = [
                    'post_type'    => $post_type,
                    'post_title'   => sanitize_text_field( $input['title'] ),
                    'post_content' => wp_kses_post( $input['content'] ?? '' ),
                    'post_status'  => sanitize_key( $input['status'] ?? 'draft' ),
                ];

                if ( isset( $input['excerpt'] ) ) {
                    $post_data['post_excerpt'] = sanitize_textarea_field( $input['excerpt'] );
                }

                if ( isset( $input['slug'] ) ) {
                    $post_data['post_name'] = sanitize_title( $input['slug'] );
                }

                if ( isset( $input['parent'] ) ) {
                    $post_data['post_parent'] = intval( $input['parent'] );
                }

                if ( isset( $input['author'] ) ) {
                    $post_data['post_author'] = intval( $input['author'] );
                }

                if ( isset( $input['date'] ) ) {
                    $post_data['post_date'] = sanitize_text_field( $input['date'] );
                }

                // Status validation: enforce allowed values in PHP, not just schema.
                $allowed_statuses = [ 'draft', 'publish', 'pending', 'private', 'future' ];
                if ( ! in_array( $post_data['post_status'], $allowed_statuses, true ) ) {
                    return maxi_ai_response( false, [], 'Invalid status. Allowed: ' . implode( ', ', $allowed_statuses ) );
                }

                // Author validation: ensure target user exists.
                if ( isset( $input['author'] ) && ! get_userdata( intval( $input['author'] ) ) ) {
                    return maxi_ai_response( false, [], 'Author not found: ' . intval( $input['author'] ) );
                }

                // Parent validation: ensure target post exists.
                if ( isset( $input['parent'] ) && intval( $input['parent'] ) > 0 && ! get_post( intval( $input['parent'] ) ) ) {
                    return maxi_ai_response( false, [], 'Parent post not found: ' . intval( $input['parent'] ) );
                }

                // Date format validation.
                if ( isset( $input['date'] ) ) {
                    $dt = \DateTime::createFromFormat( 'Y-m-d H:i:s', $input['date'] );
                    if ( ! $dt || $dt->format( 'Y-m-d H:i:s' ) !== $input['date'] ) {
                        return maxi_ai_response( false, [], 'Invalid date format. Expected Y-m-d H:i:s.' );
                    }
                }

                // Future status requires a future date.
                if ( $post_data['post_status'] === 'future' ) {
                    if ( ! isset( $input['date'] ) ) {
                        return maxi_ai_response( false, [], 'Status "future" requires a date field.' );
                    }
                    if ( strtotime( $input['date'] ) <= time() ) {
                        return maxi_ai_response( false, [], 'Status "future" requires a date in the future.' );
                    }
                }

                // Gutenberg block validation: structural check for valid block markup.
                if ( ! empty( $post_data['post_content'] ) ) {
                    $block_check = maxi_ai_validate_block_markup( $post_data['post_content'] );
                    if ( $block_check !== true ) {
                        return maxi_ai_response(
                            false,
                            [ 'code' => 'invalid_block_markup' ],
                            $block_check
                        );
                    }
                }

                $post_id = wp_insert_post( $post_data, true );

                if ( is_wp_error( $post_id ) ) {
                    return maxi_ai_response( false, [], $post_id->get_error_message() );
                }

                Maxi_AI_Audit_Log::record(
                    'content',
                    'content_created',
                    get_current_user_id(),
                    'post:' . $post_id,
                    [ 'post_type' => $post_type ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id'   => (int) $post_id,
                        'post_type' => $post_type,
                        'url'       => get_permalink( $post_id ),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
