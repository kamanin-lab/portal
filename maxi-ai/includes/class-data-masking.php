<?php

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * GDPR field-level data masking for MCP responses.
 *
 * Intercepts ability responses via the `mcp_adapter_tool_result` filter and
 * replaces values of configured field names with partially-redacted strings
 * (e.g. "John Doe" → "J*** D**").
 *
 * Matching is by exact leaf-key name at any nesting depth. The list of masked
 * fields is stored in the `maxi_ai_mask_fields` wp_option and managed via
 * the `maxi/manage-mask-fields` ability.
 */
class Maxi_AI_Data_Masking {

    /**
     * wp_option key that stores the array of field names to mask.
     */
    const OPTION_KEY = 'maxi_ai_mask_fields';

    /**
     * Filter callback for `mcp_adapter_tool_result`.
     *
     * @param mixed  $result    The ability result (associative array).
     * @param string $tool_name The tool/ability name (e.g. "maxi/get-order").
     * @return mixed The result with PII fields masked.
     */
    public static function filter_tool_result( $result, $tool_name ) {

        if ( defined( 'MAXI_AI_DATA_MASKING' ) && MAXI_AI_DATA_MASKING === false ) {
            return $result;
        }

        $fields = get_option( self::OPTION_KEY, [] );

        if ( empty( $fields ) || ! is_array( $fields ) ) {
            return $result;
        }

        // Flip for O(1) lookup.
        $fields_map = array_flip( $fields );

        return self::mask_recursive( $result, $fields_map );

    }

    /**
     * Recursively walk an array and mask string values whose key is in the mask list.
     *
     * @param mixed $data       The data to walk (array or scalar).
     * @param array $fields_map Flipped field names for O(1) lookup.
     * @return mixed The data with matching fields masked.
     */
    private static function mask_recursive( $data, array $fields_map ) {

        if ( is_object( $data ) ) {
            foreach ( $data as $key => $value ) {
                if ( is_array( $value ) || is_object( $value ) ) {
                    $data->$key = self::mask_recursive( $value, $fields_map );
                } elseif ( is_string( $value ) && $value !== '' && isset( $fields_map[ $key ] ) ) {
                    $data->$key = self::mask_value( $value );
                }
            }
            return $data;
        }

        if ( ! is_array( $data ) ) {
            return $data;
        }

        foreach ( $data as $key => &$value ) {
            if ( is_array( $value ) || is_object( $value ) ) {
                $value = self::mask_recursive( $value, $fields_map );
            } elseif ( is_string( $value ) && $value !== '' && isset( $fields_map[ $key ] ) ) {
                $value = self::mask_value( $value );
            }
        }
        unset( $value );

        return $data;

    }

    /**
     * Mask a single string value.
     *
     * Splits by spaces, each word shows first character + asterisks:
     * "John Doe" → "J*** D**"
     * "john@example.com" → "j***************"
     *
     * @param string $value The value to mask.
     * @return string The masked value.
     */
    public static function mask_value( string $value ): string {

        if ( mb_strlen( $value ) <= 1 ) {
            return $value;
        }

        $words  = explode( ' ', $value );
        $masked = array_map( function ( $word ) {
            $len = mb_strlen( $word );
            if ( $len <= 1 ) {
                return $word;
            }
            return mb_substr( $word, 0, 1 ) . str_repeat( '*', $len - 1 );
        }, $words );

        return implode( ' ', $masked );

    }

    /**
     * Filter callback for `rest_post_dispatch`.
     *
     * Only applies masking to requests hitting the MCP or Abilities API endpoints.
     *
     * @param WP_REST_Response $response The REST response.
     * @param WP_REST_Server   $server   The REST server.
     * @param WP_REST_Request  $request  The REST request.
     * @return WP_REST_Response The response with PII fields masked.
     */
    public static function filter_rest_response( $response, $server, $request ) {

        if ( defined( 'MAXI_AI_DATA_MASKING' ) && MAXI_AI_DATA_MASKING === false ) {
            return $response;
        }

        // Only mask responses going through the MCP or Abilities API endpoints.
        $route = $request->get_route();
        if ( strpos( $route, '/mcp/' ) === false && strpos( $route, '/wp-abilities/' ) === false ) {
            return $response;
        }

        $fields = get_option( self::OPTION_KEY, [] );

        if ( empty( $fields ) || ! is_array( $fields ) ) {
            return $response;
        }

        $data = $response->get_data();

        if ( ! is_array( $data ) && ! is_object( $data ) ) {
            return $response;
        }

        $fields_map = array_flip( $fields );
        $masked     = self::mask_recursive( $data, $fields_map );

        $response->set_data( $masked );

        return $response;

    }

    /**
     * Get the current list of masked field names.
     *
     * @return array
     */
    public static function get_fields(): array {

        $fields = get_option( self::OPTION_KEY, [] );

        return is_array( $fields ) ? $fields : [];

    }

}
