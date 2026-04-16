<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action(
    'wp_abilities_api_categories_init',
    function () {

        if ( ! function_exists( 'wp_register_ability_category' ) ) {
            return;
        }

        $categories = [

            'system' => [
                'label'       => 'System',
                'description' => 'Internal system abilities.',
            ],

            'content' => [
                'label'       => 'Content',
                'description' => 'Content and page management.',
            ],

            'media' => [
                'label'       => 'Media',
                'description' => 'Media and file handling.',
            ],

            'taxonomy' => [
                'label'       => 'Taxonomy',
                'description' => 'Taxonomy and term management.',
            ],

            'meta' => [
                'label'       => 'Meta',
                'description' => 'Metadata for posts, terms, users, and options.',
            ],

            'woocommerce' => [
                'label'       => 'WooCommerce',
                'description' => 'WooCommerce store management — products, orders, coupons, shipping, and taxes.',
            ],

            'ai' => [
                'label'       => 'AI',
                'description' => 'AI-powered generation and processing abilities.',
            ],

            'analytics' => [
                'label'       => 'Analytics',
                'description' => 'Page view analytics, traffic sources, and conversion tracking.',
            ],

            'notes' => [
                'label'       => 'Notes',
                'description' => 'Agent knowledge, feedback, and operator instructions.',
            ],

            'development' => [
                'label'       => 'Development',
                'description' => 'Developer and system utilities.',
            ],

        ];

        foreach ( $categories as $slug => $args ) {

            wp_register_ability_category(
                $slug,
                $args
            );

        }

    }
);