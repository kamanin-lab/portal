<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/update-content',
        [
            'label'       => 'Update Content',
            'description' => 'Update any post, page, or custom post type entry. Send only the fields to change.',
            'category'    => 'content',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'content_write_basic',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'post_id' => [
                        'type'        => 'integer',
                        'description' => 'The post ID to update.',
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'New title.',
                    ],
                    'content' => [
                        'type'        => 'string',
                        'description' => 'New content (HTML).',
                    ],
                    'excerpt' => [
                        'type'        => 'string',
                        'description' => 'New excerpt.',
                    ],
                    'status' => [
                        'type'        => 'string',
                        'description' => 'New status.',
                        'enum'        => [ 'draft', 'publish', 'pending', 'private', 'future' ],
                    ],
                    'slug' => [
                        'type'        => 'string',
                        'description' => 'New URL slug.',
                    ],
                    'parent' => [
                        'type'        => 'integer',
                        'description' => 'New parent post ID.',
                    ],
                    'author' => [
                        'type'        => 'integer',
                        'description' => 'New author user ID.',
                    ],
                    'date' => [
                        'type'        => 'string',
                        'description' => 'New publish date (Y-m-d H:i:s).',
                    ],
                ],
                'required' => [ 'post_id' ],
            ],

            'execute_callback' => function ( $input ) {

                $post_id = intval( $input['post_id'] ?? 0 );

                if ( ! get_post( $post_id ) ) {
                    return maxi_ai_response( false, [], 'Post not found: ' . $post_id );
                }

                if ( ! current_user_can( 'edit_post', $post_id ) ) {
                    return maxi_ai_response( false, [], 'You do not have permission to edit this post.' );
                }

                $post_data = [ 'ID' => $post_id ];

                $field_map = [
                    'title'   => 'post_title',
                    'content' => 'post_content',
                    'excerpt' => 'post_excerpt',
                    'status'  => 'post_status',
                    'slug'    => 'post_name',
                    'parent'  => 'post_parent',
                    'author'  => 'post_author',
                    'date'    => 'post_date',
                ];

                $sanitizers = [
                    'title'   => 'sanitize_text_field',
                    'content' => 'wp_kses_post',
                    'excerpt' => 'sanitize_textarea_field',
                    'status'  => 'sanitize_key',
                    'slug'    => 'sanitize_title',
                    'parent'  => 'intval',
                    'author'  => 'intval',
                    'date'    => 'sanitize_text_field',
                ];

                foreach ( $field_map as $input_key => $post_key ) {
                    if ( isset( $input[ $input_key ] ) ) {
                        $post_data[ $post_key ] = $sanitizers[ $input_key ]( $input[ $input_key ] );
                    }
                }

                if ( count( $post_data ) === 1 ) {
                    return maxi_ai_response( false, [], 'No fields to update.' );
                }

                // Status validation: enforce allowed values in PHP, not just schema.
                if ( isset( $input['status'] ) ) {
                    $allowed_statuses = [ 'draft', 'publish', 'pending', 'private', 'future' ];
                    if ( ! in_array( $post_data['post_status'], $allowed_statuses, true ) ) {
                        return maxi_ai_response( false, [], 'Invalid status. Allowed: ' . implode( ', ', $allowed_statuses ) );
                    }
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
                if ( ( $post_data['post_status'] ?? '' ) === 'future' ) {
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

                $result = wp_update_post( $post_data, true );

                if ( is_wp_error( $result ) ) {
                    return maxi_ai_response( false, [], $result->get_error_message() );
                }

                Maxi_AI_Audit_Log::record(
                    'content',
                    'content_updated',
                    get_current_user_id(),
                    'post:' . $post_id,
                    [ 'updated_fields' => array_keys( $post_data ) ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'post_id' => $post_id,
                        'url'     => get_permalink( $post_id ),
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'edit_posts' );
            },

        ]
    );

} );
