/**
 * Maxi AI License Admin
 *
 * Handles AJAX operations for license activation, deactivation, and refresh.
 */
( function ( $ ) {
    'use strict';

    var $spinner = $( '#maxi-license-spinner' );
    var $message = $( '#maxi-license-message' );

    /**
     * Show a status message.
     *
     * @param {string} text    Message text.
     * @param {string} type    'success' or 'error'.
     */
    function showMessage( text, type ) {
        $message
            .removeClass( 'success error' )
            .addClass( type )
            .text( text )
            .show();
    }

    /**
     * Reload the page after a successful operation.
     */
    function reloadPage() {
        setTimeout( function () {
            window.location.reload();
        }, 1000 );
    }

    /**
     * Set all buttons to disabled/enabled state.
     *
     * @param {boolean} disabled Whether to disable buttons.
     */
    function setButtonsDisabled( disabled ) {
        $( '#maxi-license-activate, #maxi-license-deactivate, #maxi-license-refresh' )
            .prop( 'disabled', disabled );
    }

    // Activate license.
    $( '#maxi-license-activate' ).on( 'click', function () {
        var key = $( '#maxi-license-key' ).val().trim();

        if ( ! key ) {
            showMessage( 'Please enter a license key.', 'error' );
            return;
        }

        setButtonsDisabled( true );
        $spinner.addClass( 'is-active' );
        $message.hide();

        $.post( maxiAiLicense.ajaxUrl, {
            action:      'maxi_ai_license_activate',
            nonce:       maxiAiLicense.nonce,
            license_key: key,
        } )
        .done( function ( response ) {
            if ( response.success ) {
                var status = response.data.status;
                if ( status.is_valid ) {
                    showMessage( response.data.message, 'success' );
                    reloadPage();
                } else {
                    showMessage( response.data.message || 'Activation failed.', 'error' );
                }
            } else {
                showMessage( response.data || 'Activation failed.', 'error' );
            }
        } )
        .fail( function () {
            showMessage( 'Network error. Please try again.', 'error' );
        } )
        .always( function () {
            setButtonsDisabled( false );
            $spinner.removeClass( 'is-active' );
        } );
    } );

    // Deactivate license.
    $( '#maxi-license-deactivate' ).on( 'click', function () {
        if ( ! confirm( 'Are you sure you want to deactivate your license? Pro features will be disabled.' ) ) {
            return;
        }

        setButtonsDisabled( true );

        $.post( maxiAiLicense.ajaxUrl, {
            action: 'maxi_ai_license_deactivate',
            nonce:  maxiAiLicense.nonce,
        } )
        .done( function ( response ) {
            if ( response.success ) {
                reloadPage();
            } else {
                alert( response.data || 'Deactivation failed.' );
            }
        } )
        .fail( function () {
            alert( 'Network error. Please try again.' );
        } )
        .always( function () {
            setButtonsDisabled( false );
        } );
    } );

    // Refresh status.
    $( '#maxi-license-refresh' ).on( 'click', function () {
        setButtonsDisabled( true );

        $.post( maxiAiLicense.ajaxUrl, {
            action: 'maxi_ai_license_refresh',
            nonce:  maxiAiLicense.nonce,
        } )
        .done( function ( response ) {
            if ( response.success ) {
                reloadPage();
            } else {
                alert( response.data || 'Refresh failed.' );
            }
        } )
        .fail( function () {
            alert( 'Network error. Please try again.' );
        } )
        .always( function () {
            setButtonsDisabled( false );
        } );
    } );

    // Allow Enter key in the license key input.
    $( '#maxi-license-key' ).on( 'keypress', function ( e ) {
        if ( e.which === 13 ) {
            e.preventDefault();
            $( '#maxi-license-activate' ).trigger( 'click' );
        }
    } );

} )( jQuery );
