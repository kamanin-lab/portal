<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * License admin page for Maxi AI.
 *
 * Adds a "License" submenu page under Settings and handles AJAX
 * operations for activation, deactivation, and refresh.
 *
 * @package Maxi_AI
 */
final class Maxi_AI_License_Admin {

    /**
     * Menu slug.
     */
    const MENU_SLUG = 'maxi-ai-license';

    /**
     * Nonce action for AJAX requests.
     */
    const NONCE_ACTION = 'maxi_ai_license_nonce';

    /**
     * Register hooks.
     */
    public static function init(): void {

        add_action( 'admin_menu', [ self::class, 'add_menu_page' ] );
        add_action( 'admin_enqueue_scripts', [ self::class, 'enqueue_assets' ] );
        add_action( 'admin_notices', [ self::class, 'render_notices' ] );

        // AJAX handlers.
        add_action( 'wp_ajax_maxi_ai_license_activate', [ self::class, 'ajax_activate' ] );
        add_action( 'wp_ajax_maxi_ai_license_deactivate', [ self::class, 'ajax_deactivate' ] );
        add_action( 'wp_ajax_maxi_ai_license_refresh', [ self::class, 'ajax_refresh' ] );

    }

    /**
     * Add the license settings page.
     */
    public static function add_menu_page(): void {

        add_options_page(
            'Maxi AI License',
            'Maxi AI License',
            'manage_options',
            self::MENU_SLUG,
            [ self::class, 'render_page' ]
        );

    }

    /**
     * Enqueue admin assets only on our page.
     *
     * @param string $hook The current admin page hook.
     */
    public static function enqueue_assets( string $hook ): void {

        if ( $hook !== 'settings_page_' . self::MENU_SLUG ) {
            return;
        }

        wp_enqueue_style(
            'maxi-ai-license-admin',
            plugins_url( 'assets/css/license-admin.css', dirname( __DIR__ ) . '/../maxi-ai.php' ),
            [],
            Maxi_AI::VERSION
        );

        wp_enqueue_script(
            'maxi-ai-license-admin',
            plugins_url( 'assets/js/license-admin.js', dirname( __DIR__ ) . '/../maxi-ai.php' ),
            [ 'jquery' ],
            Maxi_AI::VERSION,
            true
        );

        wp_localize_script( 'maxi-ai-license-admin', 'maxiAiLicense', [
            'ajaxUrl' => admin_url( 'admin-ajax.php' ),
            'nonce'   => wp_create_nonce( self::NONCE_ACTION ),
        ] );

    }

    /**
     * Render admin notices for license status.
     */
    public static function render_notices(): void {

        if ( ! current_user_can( 'manage_options' ) ) {
            return;
        }

        $status = Maxi_AI_License_Manager::get_status();

        if ( $status->is_grace_period() ) {
            $days = $status->grace_days_remaining();
            printf(
                '<div class="notice notice-warning is-dismissible"><p><strong>Maxi AI:</strong> Your Pro license expired on %s. You have <strong>%d day(s)</strong> remaining in your grace period. <a href="%s">Renew now</a> to avoid losing Pro features.</p></div>',
                esc_html( $status->expires_at ?? 'unknown' ),
                $days,
                esc_url( admin_url( 'options-general.php?page=' . self::MENU_SLUG ) )
            );
        }

        if ( $status->status === Maxi_AI_License_Status::STATUS_EXPIRED && ! $status->is_grace_period() ) {
            printf(
                '<div class="notice notice-error is-dismissible"><p><strong>Maxi AI:</strong> Your Pro license has expired. Pro abilities are now disabled. <a href="%s">Renew your license</a> to restore full functionality.</p></div>',
                esc_url( admin_url( 'options-general.php?page=' . self::MENU_SLUG ) )
            );
        }

        // Show warning after repeated validation failures.
        $fail_count = (int) get_option( 'maxi_ai_license_fail_count', 0 );

        if ( $fail_count >= Maxi_AI_License_Manager::MAX_FAIL_COUNT ) {
            printf(
                '<div class="notice notice-warning is-dismissible"><p><strong>Maxi AI:</strong> License validation has failed %d times. Your cached license status is being used. Please check your internet connection or <a href="%s">refresh manually</a>.</p></div>',
                $fail_count,
                esc_url( admin_url( 'options-general.php?page=' . self::MENU_SLUG ) )
            );
        }

    }

    /**
     * Render the license settings page.
     */
    public static function render_page(): void {

        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( 'Unauthorized.' );
        }

        $status = Maxi_AI_License_Manager::get_status();
        $tiers  = Maxi_AI_License_Tiers::get_summary();

        ?>
        <div class="wrap maxi-ai-license-wrap">
            <h1>Maxi AI License</h1>

            <div class="maxi-ai-license-card">
                <h2>License Status</h2>

                <div class="maxi-ai-license-status" id="maxi-license-status">
                    <?php self::render_status_badge( $status ); ?>
                </div>

                <table class="form-table maxi-ai-license-details" id="maxi-license-details">
                    <?php if ( $status->status !== Maxi_AI_License_Status::STATUS_INACTIVE ) : ?>
                        <tr>
                            <th>License Key</th>
                            <td><code><?php echo esc_html( $status->license_key_masked ); ?></code></td>
                        </tr>
                        <tr>
                            <th>Domain</th>
                            <td><?php echo esc_html( $status->licensed_domain ?: Maxi_AI_License_Manager::get_domain() ); ?></td>
                        </tr>
                        <tr>
                            <th>Plan</th>
                            <td><?php echo esc_html( ucfirst( $status->plan ) ); ?></td>
                        </tr>
                        <?php if ( $status->expires_at ) : ?>
                            <tr>
                                <th>Expires</th>
                                <td><?php echo esc_html( $status->expires_at ); ?></td>
                            </tr>
                        <?php endif; ?>
                        <?php if ( $status->is_grace_period() ) : ?>
                            <tr>
                                <th>Grace Period Ends</th>
                                <td><strong><?php echo esc_html( $status->grace_until ); ?></strong> (<?php echo $status->grace_days_remaining(); ?> days remaining)</td>
                            </tr>
                        <?php endif; ?>
                        <tr>
                            <th>Last Checked</th>
                            <td><?php echo esc_html( $status->checked_at ); ?></td>
                        </tr>
                        <?php if ( $status->error ) : ?>
                            <tr>
                                <th>Error</th>
                                <td class="maxi-ai-license-error"><?php echo esc_html( $status->error ); ?></td>
                            </tr>
                        <?php endif; ?>
                    <?php endif; ?>
                </table>

                <?php if ( $status->grants_pro() || $status->status === Maxi_AI_License_Status::STATUS_EXPIRED ) : ?>
                    <p class="maxi-ai-license-actions">
                        <button type="button" class="button" id="maxi-license-refresh">Refresh Status</button>
                        <button type="button" class="button button-link-delete" id="maxi-license-deactivate">Deactivate License</button>
                    </p>
                <?php endif; ?>

                <?php if ( $status->status === Maxi_AI_License_Status::STATUS_INACTIVE || $status->status === Maxi_AI_License_Status::STATUS_INVALID ) : ?>
                    <?php
                    $stored_key = Maxi_AI_License_Manager::get_stored_key();

                    if ( ! empty( $stored_key ) ) : ?>
                        <div class="maxi-ai-license-stored-key">
                            <p>
                                <strong>Stored key:</strong> <code><?php echo esc_html( $status->license_key_masked ?: Maxi_AI_License_Manager::mask_key( $stored_key ) ); ?></code>
                                <?php if ( $status->error ) : ?>
                                    <br><span class="maxi-ai-license-error"><?php echo esc_html( $status->error ); ?></span>
                                <?php endif; ?>
                            </p>
                            <p class="maxi-ai-license-actions">
                                <button type="button" class="button" id="maxi-license-refresh">Refresh Status</button>
                                <button type="button" class="button button-link-delete" id="maxi-license-deactivate">Clear License</button>
                            </p>
                        </div>
                        <hr>
                    <?php endif; ?>

                    <div class="maxi-ai-license-activate">
                        <h3><?php echo ! empty( $stored_key ) ? 'Activate a Different Key' : 'Activate License'; ?></h3>
                        <p>
                            <label for="maxi-license-key">License Key</label><br>
                            <input type="text" id="maxi-license-key" class="regular-text" placeholder="Enter your license key" autocomplete="off">
                        </p>
                        <p>
                            <button type="button" class="button button-primary" id="maxi-license-activate">Activate</button>
                            <span class="spinner" id="maxi-license-spinner"></span>
                        </p>
                        <div id="maxi-license-message" class="maxi-ai-license-message"></div>
                    </div>
                <?php endif; ?>
            </div>

            <div class="maxi-ai-license-card">
                <h2>Ability Tiers</h2>
                <p>Abilities available by license tier:</p>

                <div class="maxi-ai-license-tiers">
                    <div class="maxi-ai-tier-column">
                        <h3>Free (<?php echo count( $tiers['free'] ); ?> abilities)</h3>
                        <ul>
                            <?php foreach ( $tiers['free'] as $ability ) : ?>
                                <li><code><?php echo esc_html( $ability ); ?></code></li>
                            <?php endforeach; ?>
                        </ul>
                    </div>

                    <div class="maxi-ai-tier-column">
                        <h3>Pro (<?php echo count( $tiers['pro'] ); ?> abilities)</h3>
                        <ul>
                            <?php foreach ( $tiers['pro'] as $ability ) : ?>
                                <li><code><?php echo esc_html( $ability ); ?></code></li>
                            <?php endforeach; ?>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
        <?php

    }

    /**
     * Render the status badge HTML.
     *
     * @param Maxi_AI_License_Status $status License status.
     */
    private static function render_status_badge( Maxi_AI_License_Status $status ): void {

        $badges = [
            Maxi_AI_License_Status::STATUS_ACTIVE       => [ 'label' => 'Active',       'class' => 'maxi-badge-active' ],
            Maxi_AI_License_Status::STATUS_GRACE_PERIOD  => [ 'label' => 'Grace Period', 'class' => 'maxi-badge-grace' ],
            Maxi_AI_License_Status::STATUS_EXPIRED       => [ 'label' => 'Expired',      'class' => 'maxi-badge-expired' ],
            Maxi_AI_License_Status::STATUS_INACTIVE      => [ 'label' => 'Inactive',     'class' => 'maxi-badge-inactive' ],
            Maxi_AI_License_Status::STATUS_INVALID       => [ 'label' => 'Invalid',      'class' => 'maxi-badge-invalid' ],
            Maxi_AI_License_Status::STATUS_DISABLED      => [ 'label' => 'Disabled',     'class' => 'maxi-badge-expired' ],
        ];

        $badge = $badges[ $status->status ] ?? [ 'label' => ucfirst( $status->status ), 'class' => 'maxi-badge-inactive' ];

        printf(
            '<span class="maxi-ai-badge %s">%s</span>',
            esc_attr( $badge['class'] ),
            esc_html( $badge['label'] )
        );

    }

    // ------------------------------------------------------------------
    // AJAX handlers.
    // ------------------------------------------------------------------

    /**
     * AJAX: Activate a license key.
     */
    public static function ajax_activate(): void {

        check_ajax_referer( self::NONCE_ACTION, 'nonce' );

        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'Unauthorized.' );
        }

        $key = sanitize_text_field( wp_unslash( $_POST['license_key'] ?? '' ) );

        if ( empty( $key ) ) {
            wp_send_json_error( 'License key is required.' );
        }

        $status = Maxi_AI_License_Manager::activate( $key );

        wp_send_json_success( [
            'status'  => $status->to_array(),
            'message' => $status->is_valid
                ? 'License activated successfully!'
                : ( $status->error ?? 'Activation failed.' ),
        ] );

    }

    /**
     * AJAX: Deactivate the current license.
     */
    public static function ajax_deactivate(): void {

        check_ajax_referer( self::NONCE_ACTION, 'nonce' );

        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'Unauthorized.' );
        }

        $status = Maxi_AI_License_Manager::deactivate();

        wp_send_json_success( [
            'status'  => $status->to_array(),
            'message' => 'License deactivated.',
        ] );

    }

    /**
     * AJAX: Refresh license status.
     */
    public static function ajax_refresh(): void {

        check_ajax_referer( self::NONCE_ACTION, 'nonce' );

        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'Unauthorized.' );
        }

        $status = Maxi_AI_License_Manager::refresh();

        if ( $status === null ) {
            wp_send_json_error( 'No license key stored.' );
        }

        wp_send_json_success( [
            'status'  => $status->to_array(),
            'message' => 'License status refreshed.',
        ] );

    }

}

Maxi_AI_License_Admin::init();
