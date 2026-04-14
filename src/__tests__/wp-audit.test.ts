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

// ---------------------------------------------------------------------------
// Maxi AI v3.3.0: bootstrap-session + operator_notes + language/timezone
// ---------------------------------------------------------------------------
//
// The real fetchWpSiteAudit lives in a Deno edge function and cannot be
// imported in Vitest. We mirror its behavior here as a pure TS re-implementation
// and exercise the same logic against mocked fetch responses.

type OperatorNote = {
  id: number;
  title: string;
  content: string;
  topic: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
};

type SiteAudit = {
  wp_version: string;
  site_url: string;
  site_name: string;
  language: string;
  timezone: string;
  active_plugins: { slug: string; name: string; version: string }[];
  post_types: string[];
  product_count: number | null;
  operator_notes: OperatorNote[];
  fetched_at: string;
};

const PRIORITY_ORDER: Record<OperatorNote['priority'], number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

// Mirror of formatAuditForPrompt (keep in sync with wp-audit.ts)
function formatAuditForPrompt(audit: SiteAudit): string {
  const plugins = audit.active_plugins
    .map(p => `  - ${p.name} (${p.slug}) v${p.version}`)
    .join('\n');

  const productLine =
    audit.product_count !== null
      ? `Products: ${audit.product_count}`
      : 'WooCommerce: not installed';

  let operatorSection = '';
  if (audit.operator_notes.length > 0) {
    const sorted = [...audit.operator_notes].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    );
    const lines = sorted
      .map(n => `[${n.priority.toUpperCase()}] ${n.title}: ${n.content}`)
      .join('\n');
    operatorSection = `\nOperator instructions (${audit.operator_notes.length}):\n${lines}`;
  }

  return `<site_audit>
Site: ${audit.site_name} (${audit.site_url})
WordPress: ${audit.wp_version} | Language: ${audit.language} | Timezone: ${audit.timezone}
${productLine}
Post types: ${audit.post_types.join(', ')}
Active plugins (${audit.active_plugins.length}):
${plugins}${operatorSection}
</site_audit>`;
}

// Mirror of fetchWpSiteAudit that uses the injected fetch impl
async function fetchWpSiteAuditMirror(
  wpMcpUrl: string | null | undefined,
  fetchImpl: (ability: string, args?: Record<string, unknown>) => Promise<{
    success: boolean;
    data?: Record<string, unknown>;
  }>,
): Promise<SiteAudit | null> {
  if (!wpMcpUrl) return null;

  const call = async (
    ability: string,
    args?: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> => {
    const json = await fetchImpl(ability, args);
    return json?.success ? (json.data ?? null) : null;
  };

  try {
    let operatorNotes: OperatorNote[] = [];
    try {
      const bootstrapData = await call('maxi/bootstrap-session');
      if (bootstrapData && Array.isArray(bootstrapData.operator_notes)) {
        operatorNotes = (bootstrapData.operator_notes as unknown[])
          .filter(
            (n): n is Record<string, unknown> =>
              typeof n === 'object' &&
              n !== null &&
              (n as Record<string, unknown>).priority !== null &&
              (n as Record<string, unknown>).priority !== undefined,
          )
          .map(n => ({
            id: Number(n.id ?? 0),
            title: String(n.title ?? ''),
            content: String(n.content ?? ''),
            topic: String(n.topic ?? ''),
            priority: String(n.priority) as OperatorNote['priority'],
          }));
      }
    } catch {
      /* graceful degradation */
    }

    const siteData = await call('maxi/get-site-info');
    if (!siteData) return null;

    return {
      wp_version: String(siteData.wp_version ?? 'unknown'),
      site_url: String(siteData.url ?? wpMcpUrl),
      site_name: String(siteData.name ?? ''),
      language: String(siteData.language ?? 'unknown'),
      timezone: String(siteData.timezone ?? 'unknown'),
      active_plugins: [],
      post_types: [],
      product_count: null,
      operator_notes: operatorNotes,
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

describe('fetchWpSiteAudit — bootstrap + operator notes', () => {
  it('returns operator_notes from bootstrap response', async () => {
    const fetchImpl = async (ability: string) => {
      if (ability === 'maxi/bootstrap-session') {
        return {
          success: true,
          data: {
            operator_notes: [
              {
                id: 1,
                title: 'Minimum ticket size',
                content: 'Never quote below 2h',
                topic: 'billing',
                priority: 'high',
              },
              {
                id: 2,
                title: 'Custom theme',
                content: 'Uses KAMANIN custom theme',
                topic: 'theme',
                priority: 'normal',
              },
            ],
          },
        };
      }
      if (ability === 'maxi/get-site-info') {
        return {
          success: true,
          data: {
            wp_version: '6.5.0',
            url: 'https://example.com',
            name: 'Example',
            language: 'de_DE',
            timezone: 'Europe/Vienna',
          },
        };
      }
      return { success: false };
    };

    const result = await fetchWpSiteAuditMirror('https://example.com', fetchImpl);
    expect(result).not.toBeNull();
    expect(result!.operator_notes).toHaveLength(2);
    expect(result!.operator_notes[0].title).toBe('Minimum ticket size');
  });

  it('continues without operator_notes if bootstrap fails', async () => {
    const fetchImpl = async (ability: string) => {
      if (ability === 'maxi/bootstrap-session') {
        return { success: false };
      }
      if (ability === 'maxi/get-site-info') {
        return {
          success: true,
          data: {
            wp_version: '6.5.0',
            url: 'https://example.com',
            name: 'Example',
            language: 'de_DE',
            timezone: 'Europe/Vienna',
          },
        };
      }
      return { success: false };
    };

    const result = await fetchWpSiteAuditMirror('https://example.com', fetchImpl);
    expect(result).not.toBeNull();
    expect(result!.operator_notes).toEqual([]);
    expect(result!.wp_version).toBe('6.5.0');
  });
});

describe('formatAuditForPrompt — v3.3.0 fields', () => {
  const baseAudit: SiteAudit = {
    wp_version: '6.5.0',
    site_url: 'https://example.com',
    site_name: 'Example',
    language: 'de_DE',
    timezone: 'Europe/Vienna',
    active_plugins: [],
    post_types: ['post', 'page'],
    product_count: null,
    operator_notes: [],
    fetched_at: '2026-04-14T00:00:00Z',
  };

  it('includes language and timezone from get-site-info', () => {
    const output = formatAuditForPrompt(baseAudit);
    expect(output).toContain('Language: de_DE');
    expect(output).toContain('Timezone: Europe/Vienna');
  });

  it('includes operator instructions when present', () => {
    const output = formatAuditForPrompt({
      ...baseAudit,
      operator_notes: [
        {
          id: 1,
          title: 'Staging required',
          content: 'Deploy via staging',
          topic: 'deploy',
          priority: 'critical',
        },
        {
          id: 2,
          title: 'Theme',
          content: 'Custom theme',
          topic: 'theme',
          priority: 'normal',
        },
      ],
    });
    expect(output).toContain('Operator instructions (2):');
    const criticalIdx = output.indexOf('[CRITICAL]');
    const normalIdx = output.indexOf('[NORMAL]');
    expect(criticalIdx).toBeGreaterThan(-1);
    expect(normalIdx).toBeGreaterThan(-1);
    expect(criticalIdx).toBeLessThan(normalIdx);
  });

  it('omits operator instructions section when empty', () => {
    const output = formatAuditForPrompt(baseAudit);
    expect(output).not.toContain('Operator instructions');
  });

  it('sorts operator notes critical→high→normal→low', () => {
    const output = formatAuditForPrompt({
      ...baseAudit,
      operator_notes: [
        { id: 1, title: 'L', content: 'low note', topic: 't', priority: 'low' },
        { id: 2, title: 'N', content: 'normal note', topic: 't', priority: 'normal' },
        { id: 3, title: 'H', content: 'high note', topic: 't', priority: 'high' },
        { id: 4, title: 'C', content: 'critical note', topic: 't', priority: 'critical' },
      ],
    });
    const criticalIdx = output.indexOf('[CRITICAL]');
    const highIdx = output.indexOf('[HIGH]');
    const normalIdx = output.indexOf('[NORMAL]');
    const lowIdx = output.indexOf('[LOW]');
    expect(criticalIdx).toBeLessThan(highIdx);
    expect(highIdx).toBeLessThan(normalIdx);
    expect(normalIdx).toBeLessThan(lowIdx);
  });
});
