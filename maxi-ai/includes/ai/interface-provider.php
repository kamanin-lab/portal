<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Provider contract for Maxi AI.
 *
 * All AI providers must implement this interface.
 * Methods return an associative array on success, or WP_Error on failure.
 */
interface Maxi_AI_Provider {

    /**
     * Generate an image from a text prompt.
     *
     * @param array $params {
     *     @type string $prompt  The text prompt.
     *     @type string $size    Image size (e.g. '1024x1024'). Optional.
     *     @type string $style   Image style. Optional.
     *     @type string $model   Model override. Optional.
     *     @type int    $seed    Seed for reproducibility. Optional. Silently ignored by providers that don't support it (e.g. OpenAI).
     * }
     * @return array|WP_Error Array with 'url' key on success.
     */
    public function generate_image( array $params );

    /**
     * Edit an existing image using a text prompt, optionally with a mask.
     *
     * @param array $params {
     *     @type string $prompt Edit instructions. Required.
     *     @type string $image  Source image as absolute URL or base64 data URI. Required.
     *     @type string $mask   Optional. Base64 PNG mask. Required for OpenAI and Replicate flux-fill.
     *                          If omitted, BFL will use Flux Kontext (instruction-based editing).
     *     @type string $size   Output size (e.g. '1024x1024'). Optional.
     *     @type int    $seed   Seed for reproducibility. Optional.
     *     @type string $model  Model override. Optional.
     * }
     * @return array|WP_Error Array with 'url' key on success.
     */
    public function edit_image( array $params );

    /**
     * Generate text from a prompt.
     *
     * @param array $params {
     *     @type string $prompt      The text prompt.
     *     @type string $system      System message. Optional.
     *     @type int    $max_tokens  Max tokens. Optional.
     *     @type float  $temperature Temperature. Optional.
     *     @type string $model       Model override. Optional.
     * }
     * @return array|WP_Error Array with 'content' key on success.
     */
    public function generate_text( array $params );

    /**
     * Analyze an image (vision).
     *
     * @param array $params {
     *     @type string $image_url  URL of the image to analyze.
     *     @type string $prompt     Analysis instructions.
     *     @type string $model      Model override. Optional.
     * }
     * @return array|WP_Error Array with 'analysis' key on success.
     */
    public function analyze_image( array $params );

    /**
     * Check if this provider supports a given capability.
     *
     * @param string $capability One of 'image', 'edit_image', 'text', 'vision'.
     * @return bool
     */
    public function supports( string $capability ): bool;

    /**
     * Get the provider's display name.
     *
     * @return string
     */
    public function get_name(): string;

    /**
     * Validate a candidate API key against the provider with a live, lightweight
     * request. Used by the credential rotation flow to verify a new key before
     * the old one is overwritten.
     *
     * Implementations should hit a cheap read-only endpoint (e.g. /models,
     * /account) and return true on success or a WP_Error describing the
     * failure (missing key, HTTP error, unauthorized, etc.).
     *
     * For the "local" provider the $key argument is the endpoint URL.
     *
     * @param string $key Candidate API key or endpoint URL.
     * @return true|WP_Error
     */
    public function test_key( string $key );

}
