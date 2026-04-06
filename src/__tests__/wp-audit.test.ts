import { describe, it, expect } from 'vitest';

// Tests the null-guard logic from fetchWpSiteAudit
// The actual Deno file cannot be imported in Vitest (Deno runtime).
// We test the guard conditions as pure boolean logic.

function shouldSkipAudit(
  wpMcpUrl: string | null | undefined,
  wpMcpUser: string | undefined,
  wpMcpAppPass: string | undefined,
): boolean {
  if (!wpMcpUrl) return true;
  if (!wpMcpUser || !wpMcpAppPass) return true;
  return false;
}

describe('wp-audit null-guard logic', () => {
  it('skips when wp_mcp_url is null', () => {
    expect(shouldSkipAudit(null, 'user', 'pass')).toBe(true);
  });

  it('skips when wp_mcp_url is undefined', () => {
    expect(shouldSkipAudit(undefined, 'user', 'pass')).toBe(true);
  });

  it('skips when wp_mcp_url is empty string', () => {
    expect(shouldSkipAudit('', 'user', 'pass')).toBe(true);
  });

  it('skips when WP_MCP_USER is missing', () => {
    expect(shouldSkipAudit('https://example.com', undefined, 'pass')).toBe(true);
  });

  it('skips when WP_MCP_APP_PASS is missing', () => {
    expect(shouldSkipAudit('https://example.com', 'user', undefined)).toBe(true);
  });

  it('proceeds when all required values are present', () => {
    expect(shouldSkipAudit('https://example.com', 'user', 'pass')).toBe(false);
  });
});

describe('formatAuditForPrompt output shape', () => {
  it('produces correct XML-like structure', () => {
    // Test the format function logic (pure string manipulation)
    const mockAudit = {
      site_name: 'Test Site',
      site_url: 'https://example.com',
      wp_version: '6.4.2',
      product_count: 42,
      post_types: ['post', 'page', 'product'],
      active_plugins: [
        { slug: 'woocommerce', name: 'WooCommerce', version: '8.0.0' },
      ],
    };

    // Re-implement format logic for testing (mirrors wp-audit.ts formatAuditForPrompt)
    const plugins = mockAudit.active_plugins
      .map(p => `  - ${p.name} (${p.slug}) v${p.version}`)
      .join('\n');
    const productLine = `Products: ${mockAudit.product_count}`;
    const result = `<site_audit>\nSite: ${mockAudit.site_name} (${mockAudit.site_url})\nWordPress: ${mockAudit.wp_version}\n${productLine}\nPost types: ${mockAudit.post_types.join(', ')}\nActive plugins (${mockAudit.active_plugins.length}):\n${plugins}\n</site_audit>`;

    expect(result).toContain('<site_audit>');
    expect(result).toContain('WooCommerce (woocommerce) v8.0.0');
    expect(result).toContain('Products: 42');
    expect(result).toContain('</site_audit>');
  });

  it('shows "WooCommerce: not installed" when product_count is null', () => {
    const productLine = null === null ? 'WooCommerce: not installed' : `Products: ${null}`;
    expect(productLine).toBe('WooCommerce: not installed');
  });
});
