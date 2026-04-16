<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Default playbook definitions.
 *
 * Each key is a playbook slug. Content is read from .md files in the
 * plugin root. The `required` flag determines whether the playbook gate
 * blocks abilities until the playbook is acknowledged.
 *
 * @package Maxi_AI
 */
return [
    'operational' => [
        'title'    => 'Operational Playbook',
        'content'  => file_get_contents( dirname( __DIR__, 2 ) . '/PLAYBOOK-INIT.md' ),
        'required' => true,
    ],
    'architecture' => [
        'title'    => 'Architecture & Reference',
        'content'  => file_get_contents( dirname( __DIR__, 2 ) . '/PLAYBOOK-DOC.md' ),
        'required' => false,
    ],
];
