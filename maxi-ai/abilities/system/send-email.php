<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

add_action( 'wp_abilities_api_init', function () {

    if ( ! function_exists( 'wp_register_ability' ) ) {
        return;
    }

    wp_register_ability(
        'maxi/send-email',
        [
            'label'       => 'Send Email',
            'description' => 'Send an email via wp_mail(). Disabled by default — set the maxi_ai_email_security option to "admin" or "open" to enable (or define MAXI_AI_EMAIL_SECURITY constant to lock the value). The "from" identity is controlled by the maxi_ai_email_from option: "wordpress" (default, uses site title + admin email), "woocommerce" (WC sender settings), or "user" (current user\'s name + email). Can be overridden per-email with the from parameter. Every sent email is recorded in the audit log (recipient, subject — no body).',
            'category'    => 'system',

            'meta' => [
                'show_in_rest' => true,
                'mcp'          => [ 'public' => true ],
                'feature_group' => 'dev_tools_admin',
            ],

            'input_schema' => [
                'type'       => 'object',
                'properties' => [
                    'to' => [
                        'type'        => 'string',
                        'description' => 'Recipient email address.',
                    ],
                    'subject' => [
                        'type'        => 'string',
                        'description' => 'Email subject line.',
                    ],
                    'body' => [
                        'type'        => 'string',
                        'description' => 'Email body content. Plain text by default, or HTML if format is set to "html".',
                    ],
                    'format' => [
                        'type'        => 'string',
                        'enum'        => [ 'text', 'html' ],
                        'description' => 'Email format: "text" (default) or "html".',
                    ],
                    'cc' => [
                        'type'        => 'string',
                        'description' => 'Optional CC email address.',
                    ],
                    'from' => [
                        'type'        => 'string',
                        'enum'        => [ 'wordpress', 'woocommerce', 'user' ],
                        'description' => 'Override the "from" identity for this email. Uses the global maxi_ai_email_from option if omitted. "wordpress" = site title + admin email, "woocommerce" = WC sender settings, "user" = current user.',
                    ],
                ],
                'required' => [ 'to', 'subject', 'body' ],
            ],

            'execute_callback' => function ( $input ) {

                // --- Security gate ---------------------------------------------------

                $security = maxi_ai_email_security_level();

                if ( $security === 'off' ) {
                    return maxi_ai_response(
                        false,
                        [ 'reason' => 'disabled' ],
                        'Email sending is disabled. Set the maxi_ai_email_security option to "admin" or "open" to enable it (or define MAXI_AI_EMAIL_SECURITY in wp-config.php).'
                    );
                }

                if ( $security === 'admin' && ! current_user_can( 'manage_options' ) ) {
                    return maxi_ai_response(
                        false,
                        [ 'reason' => 'insufficient_permissions' ],
                        'Email sending is restricted to administrators. Change maxi_ai_email_security to "open" to allow all authenticated users.'
                    );
                }

                // --- Validate inputs -------------------------------------------------

                $to      = sanitize_email( $input['to'] ?? '' );
                $subject = sanitize_text_field( $input['subject'] ?? '' );
                $body    = $input['body'] ?? '';
                $format  = in_array( $input['format'] ?? '', [ 'text', 'html' ], true ) ? $input['format'] : 'text';
                $cc      = isset( $input['cc'] ) ? sanitize_email( $input['cc'] ) : '';

                if ( ! is_email( $to ) ) {
                    return maxi_ai_response( false, [], 'Invalid recipient email address.' );
                }

                if ( $subject === '' ) {
                    return maxi_ai_response( false, [], 'Subject is required.' );
                }

                if ( trim( $body ) === '' ) {
                    return maxi_ai_response( false, [], 'Body is required.' );
                }

                // --- Resolve "from" identity -----------------------------------------

                $from_mode = in_array( $input['from'] ?? '', [ 'wordpress', 'woocommerce', 'user' ], true )
                    ? $input['from']
                    : get_option( 'maxi_ai_email_from', 'wordpress' );

                $from_name  = '';
                $from_email = '';

                switch ( $from_mode ) {

                    case 'woocommerce':
                        $from_name  = get_option( 'woocommerce_email_from_name', get_bloginfo( 'name' ) );
                        $from_email = get_option( 'woocommerce_email_from_address', get_option( 'admin_email' ) );
                        break;

                    case 'user':
                        $current_user = wp_get_current_user();
                        $from_name    = $current_user->display_name;
                        $from_email   = $current_user->user_email;
                        break;

                    case 'wordpress':
                    default:
                        $from_name  = get_bloginfo( 'name' );
                        $from_email = get_option( 'admin_email' );
                        break;
                }

                // --- Build headers ---------------------------------------------------

                $headers = [];

                if ( $format === 'html' ) {
                    $headers[] = 'Content-Type: text/html; charset=UTF-8';
                } else {
                    $headers[] = 'Content-Type: text/plain; charset=UTF-8';
                }

                if ( $from_name && $from_email ) {
                    $headers[] = sprintf( 'From: %s <%s>', $from_name, $from_email );
                }

                // In user mode, set Reply-To so replies reach the user even if
                // an SMTP plugin overrides the From address.
                if ( $from_mode === 'user' && $from_email ) {
                    $headers[] = sprintf( 'Reply-To: %s <%s>', $from_name, $from_email );
                }

                if ( $cc !== '' && is_email( $cc ) ) {
                    $headers[] = sprintf( 'Cc: %s', $cc );
                }

                // --- Send ------------------------------------------------------------

                $sent = wp_mail( $to, $subject, $body, $headers );

                // --- Audit log -------------------------------------------------------

                Maxi_AI_Audit_Log::record(
                    'email',
                    $sent ? 'email_sent' : 'email_failed',
                    get_current_user_id(),
                    $to,
                    [
                        'subject'    => $subject,
                        'from_mode'  => $from_mode,
                        'from_name'  => $from_name,
                        'from_email' => $from_email,
                        'cc'         => $cc ?: null,
                        'format'     => $format,
                    ]
                );

                if ( ! $sent ) {
                    return maxi_ai_response(
                        false,
                        [ 'to' => $to, 'subject' => $subject ],
                        'wp_mail() failed. Check your server mail configuration or SMTP plugin logs.'
                    );
                }

                return maxi_ai_response( true, [
                    'to'         => $to,
                    'subject'    => $subject,
                    'from_name'  => $from_name,
                    'from_email' => $from_email,
                    'from_mode'  => $from_mode,
                    'format'     => $format,
                    'cc'         => $cc ?: null,
                ] );

            },

            'permission_callback' => function () {
                $security = maxi_ai_email_security_level();
                if ( $security === 'off' ) {
                    return false;
                }
                if ( $security === 'admin' ) {
                    return current_user_can( 'manage_options' );
                }
                // 'open' — any authenticated user.
                return is_user_logged_in();
            },

        ]
    );

} );


/**
 * Get the effective email security level.
 *
 * Priority: MAXI_AI_EMAIL_SECURITY constant > maxi_ai_email_security option > 'off'.
 *
 * @return string 'off', 'admin', or 'open'.
 */
function maxi_ai_email_security_level(): string {

    if ( defined( 'MAXI_AI_EMAIL_SECURITY' ) ) {
        $level = strtolower( (string) MAXI_AI_EMAIL_SECURITY );
    } else {
        $level = strtolower( (string) get_option( 'maxi_ai_email_security', 'off' ) );
    }

    $valid = [ 'off', 'admin', 'open' ];

    return in_array( $level, $valid, true ) ? $level : 'off';

}
