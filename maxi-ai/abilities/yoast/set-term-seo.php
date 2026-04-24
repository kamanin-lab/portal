<?php
/**
 * maxi/set-yoast-term-seo
 *
 * Writes Yoast SEO title and meta description for a taxonomy term.
 *
 * Yoast stores these as a nested option (`wpseo_taxonomy_meta`) keyed by
 * taxonomy → term_id → field. When a term has no entry yet, WP-CLI's
 * `option patch insert` cannot create it (fails on NULL intermediate parent),
 * so a native ability is needed to bootstrap missing records.
 *
 * For Yoast versions with the Indexables layer, also syncs the corresponding
 * `wp_yoast_indexable` row so the change shows up immediately in the
 * front-end head — the option alone is only a legacy-compatibility store.
 *
 * See agent-note on vanillawp: "Add Maxi AI support for creating missing
 * Yoast taxonomy SEO meta records".
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/set-yoast-term-seo',
        [
            'label'       => 'Set Yoast Term SEO',
            'description' => 'Set the Yoast SEO title and/or meta description for a taxonomy term. Creates the Yoast record if it does not exist yet.',
            'category'    => 'yoast',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'meta_basic',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'term_id' => [
                        'type'        => 'integer',
                        'description' => 'The term ID.',
                    ],
                    'taxonomy' => [
                        'type'        => 'string',
                        'description' => 'The taxonomy the term belongs to (e.g. product_cat).',
                    ],
                    'title' => [
                        'type'        => 'string',
                        'description' => 'Yoast SEO title. Omit to leave unchanged.',
                    ],
                    'description' => [
                        'type'        => 'string',
                        'description' => 'Yoast SEO meta description. Omit to leave unchanged.',
                    ],
                ],
                'required' => [ 'term_id', 'taxonomy' ],
            ],

            'execute_callback' => function ( $input ) {

                $term_id  = intval( $input['term_id'] ?? 0 );
                $taxonomy = sanitize_key( $input['taxonomy'] ?? '' );

                if ( $term_id <= 0 ) {
                    return maxi_ai_response( false, [], 'term_id must be a positive integer.' );
                }

                if ( ! taxonomy_exists( $taxonomy ) ) {
                    return maxi_ai_response( false, [], 'Invalid taxonomy: ' . $taxonomy );
                }

                $term = get_term( $term_id, $taxonomy );

                if ( ! $term || is_wp_error( $term ) ) {
                    return maxi_ai_response( false, [], 'Term not found in taxonomy: ' . $term_id );
                }

                if ( ! defined( 'WPSEO_VERSION' ) ) {
                    return maxi_ai_response( false, [], 'Yoast SEO plugin is not active on this site.' );
                }

                $has_title = array_key_exists( 'title', $input ) && $input['title'] !== null;
                $has_desc  = array_key_exists( 'description', $input ) && $input['description'] !== null;

                if ( ! $has_title && ! $has_desc ) {
                    return maxi_ai_response( false, [], 'Provide at least one of: title, description.' );
                }

                // Read existing option; ensure nested structure exists.
                $option = get_option( 'wpseo_taxonomy_meta', [] );

                if ( ! is_array( $option ) ) {
                    $option = [];
                }

                if ( ! isset( $option[ $taxonomy ] ) || ! is_array( $option[ $taxonomy ] ) ) {
                    $option[ $taxonomy ] = [];
                }

                if ( ! isset( $option[ $taxonomy ][ $term_id ] ) || ! is_array( $option[ $taxonomy ][ $term_id ] ) ) {
                    $option[ $taxonomy ][ $term_id ] = [];
                }

                $updated_fields = [];

                if ( $has_title ) {
                    $option[ $taxonomy ][ $term_id ]['wpseo_title'] = sanitize_text_field( (string) $input['title'] );
                    $updated_fields[] = 'title';
                }

                if ( $has_desc ) {
                    $option[ $taxonomy ][ $term_id ]['wpseo_desc'] = sanitize_textarea_field( (string) $input['description'] );
                    $updated_fields[] = 'description';
                }

                update_option( 'wpseo_taxonomy_meta', $option );

                // Sync Yoast Indexables when available. The option is a
                // legacy-compatibility store; Indexables is canonical on
                // modern Yoast and is what actually renders in <head>.
                $indexable_synced = false;

                if (
                    function_exists( 'YoastSEO' )
                    && class_exists( '\\Yoast\\WP\\SEO\\Repositories\\Indexable_Repository' )
                ) {
                    try {
                        $repo = YoastSEO()->classes->get( \Yoast\WP\SEO\Repositories\Indexable_Repository::class );

                        if ( $repo && method_exists( $repo, 'find_by_id_and_type' ) ) {
                            $indexable = $repo->find_by_id_and_type( $term_id, 'term', false );

                            if ( $indexable ) {
                                if ( $has_title ) {
                                    $indexable->title = $option[ $taxonomy ][ $term_id ]['wpseo_title'];
                                }
                                if ( $has_desc ) {
                                    $indexable->description = $option[ $taxonomy ][ $term_id ]['wpseo_desc'];
                                }
                                $indexable->save();
                                $indexable_synced = true;
                            }
                        }
                    } catch ( \Throwable $e ) {
                        maxi_ai_log(
                            'Yoast indexable sync failed: ' . $e->getMessage(),
                            'warning',
                            [ 'ability' => 'maxi/set-yoast-term-seo', 'term_id' => $term_id, 'taxonomy' => $taxonomy ]
                        );
                    }
                }

                Maxi_AI_Audit_Log::record(
                    'taxonomy',
                    'yoast_term_seo_updated',
                    get_current_user_id(),
                    'term:' . $term_id,
                    [
                        'taxonomy'         => $taxonomy,
                        'updated_fields'   => $updated_fields,
                        'indexable_synced' => $indexable_synced,
                    ]
                );

                return maxi_ai_response(
                    true,
                    [
                        'term_id'          => $term_id,
                        'taxonomy'         => $taxonomy,
                        'updated_fields'   => $updated_fields,
                        'indexable_synced' => $indexable_synced,
                        'yoast_seo'        => [
                            'title'       => $option[ $taxonomy ][ $term_id ]['wpseo_title'] ?? null,
                            'description' => $option[ $taxonomy ][ $term_id ]['wpseo_desc'] ?? null,
                        ],
                    ]
                );

            },

            'permission_callback' => function () {
                return current_user_can( 'manage_categories' );
            },

        ]
    );

} );
