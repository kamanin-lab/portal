<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Encryption at rest for API keys.
 *
 * Uses sodium_crypto_secretbox with a key derived from WordPress auth salt.
 * Encrypted values are stored as "enc:<base64(nonce + ciphertext)>".
 *
 * Threat model: protects against database-only compromise (SQL injection,
 * leaked backup, hosting panel access). Does NOT protect if the attacker
 * also has filesystem access to wp-config.php (where the salt lives).
 *
 * @package Maxi_AI
 */
final class Maxi_AI_Key_Encryption {

    /**
     * Prefix for encrypted values. Used to distinguish encrypted from
     * legacy plaintext values during auto-migration.
     */
    private const PREFIX = 'enc:';

    /**
     * Domain separation label for key derivation. Ensures the derived
     * encryption key is unique to Maxi AI even if the same salt is
     * used elsewhere.
     */
    private const DOMAIN = 'maxi-ai-key-encryption';

    /**
     * Check if a value is already encrypted (has the enc: prefix).
     *
     * @param string $value The value to check.
     * @return bool
     */
    public static function is_encrypted( string $value ): bool {

        return strpos( $value, self::PREFIX ) === 0;

    }

    /**
     * Encrypt a plaintext value.
     *
     * @param string $plaintext The plaintext to encrypt.
     * @return string Encrypted value with "enc:" prefix, or empty string on empty input.
     */
    public static function encrypt( string $plaintext ): string {

        if ( $plaintext === '' ) {
            return '';
        }

        $key   = self::derive_key();
        $nonce = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
        $ct    = sodium_crypto_secretbox( $plaintext, $nonce, $key );

        sodium_memzero( $key );

        return self::PREFIX . base64_encode( $nonce . $ct );

    }

    /**
     * Decrypt an encrypted value.
     *
     * If the value is not encrypted (no "enc:" prefix), it is returned
     * as-is (passthrough for legacy plaintext values).
     *
     * On decryption failure (corrupt data, changed salt), returns empty
     * string and logs the error. Fail-closed: never returns garbled data.
     *
     * @param string $encrypted The encrypted value (with "enc:" prefix).
     * @return string Decrypted plaintext, or empty string on failure.
     */
    public static function decrypt( string $encrypted ): string {

        if ( ! self::is_encrypted( $encrypted ) ) {
            return $encrypted; // Passthrough plaintext (pre-upgrade values).
        }

        $key = self::derive_key();

        $encoded = substr( $encrypted, strlen( self::PREFIX ) );
        $decoded = base64_decode( $encoded, true );

        $min_length = SODIUM_CRYPTO_SECRETBOX_NONCEBYTES + SODIUM_CRYPTO_SECRETBOX_MACBYTES;

        if ( $decoded === false || strlen( $decoded ) < $min_length ) {
            sodium_memzero( $key );
            maxi_ai_log(
                'Key decryption failed: invalid ciphertext format.',
                'error',
                [ 'component' => 'encryption' ]
            );
            return '';
        }

        $nonce = substr( $decoded, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
        $ct    = substr( $decoded, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
        $pt    = sodium_crypto_secretbox_open( $ct, $nonce, $key );

        sodium_memzero( $key );

        if ( $pt === false ) {
            maxi_ai_log(
                'Key decryption failed: authentication error. This usually means wp_salt("auth") changed after the key was encrypted. Re-enter your API keys to re-encrypt with the current salt.',
                'error',
                [ 'component' => 'encryption' ]
            );
            return '';
        }

        return $pt;

    }

    /**
     * Derive a 32-byte encryption key from the WordPress auth salt.
     *
     * Uses BLAKE2b (sodium_crypto_generichash) with domain separation
     * to produce a key that is:
     * - Deterministic (same salt → same key)
     * - Unique to Maxi AI (domain label prevents cross-plugin collision)
     * - The correct length for secretbox (32 bytes)
     *
     * @return string 32-byte binary key.
     */
    private static function derive_key(): string {

        // wp_salt() can return strings of any length. BLAKE2b requires
        // the key parameter to be between KEYBYTES_MIN (16) and
        // KEYBYTES_MAX (64). We first hash the salt to a fixed 32-byte
        // key, then use that as the BLAKE2b key with our domain label.
        $salt_key = sodium_crypto_generichash(
            wp_salt( 'auth' ),
            '',
            SODIUM_CRYPTO_GENERICHASH_KEYBYTES // 32 bytes — valid as key.
        );

        return sodium_crypto_generichash(
            self::DOMAIN,
            $salt_key,
            SODIUM_CRYPTO_SECRETBOX_KEYBYTES
        );

    }

}
