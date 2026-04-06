import { createLogger } from "./logger.ts";

export interface WpSiteAudit {
  wp_version: string;
  site_url: string;
  site_name: string;
  active_plugins: { slug: string; name: string; version: string }[];
  post_types: string[];
  product_count: number | null;
  fetched_at: string;
}

/**
 * Fetch a minimal WordPress site audit via Maxi AI Core REST API.
 *
 * Auth: WordPress Application Password as Basic Auth.
 * Env vars required: WP_MCP_USER, WP_MCP_APP_PASS
 *
 * Returns null (never throws) if:
 *   - wp_mcp_url is null/empty
 *   - credentials missing
 *   - site unreachable or plugin not installed
 *
 * Callers must treat null as "audit unavailable" and continue without it.
 */
export async function fetchWpSiteAudit(
  wpMcpUrl: string | null | undefined,
  logger: ReturnType<typeof createLogger>,
): Promise<WpSiteAudit | null> {
  if (!wpMcpUrl) return null;

  const user = Deno.env.get("WP_MCP_USER");
  const pass = Deno.env.get("WP_MCP_APP_PASS");
  if (!user || !pass) {
    logger.warn(
      "WP_MCP_USER or WP_MCP_APP_PASS not configured — skipping site audit",
    );
    return null;
  }

  const base = wpMcpUrl.replace(/\/$/, "");
  const auth = `Basic ${btoa(`${user}:${pass}`)}`;
  const headers = { Authorization: auth, "Content-Type": "application/json" };
  const endpoint = `${base}/wp-json/maxi-ai/v1/run-ability`;

  const call = async (ability: string, args?: Record<string, unknown>) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ ability, ...(args ? { args } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? json.data : null;
  };

  try {
    // 1. Site info
    const siteData = await call("maxi/get-site-info");
    if (!siteData) {
      logger.warn(`maxi/get-site-info failed for ${base}`);
      return null;
    }

    // 2. Active plugins via WP-CLI
    let activePlugins: { slug: string; name: string; version: string }[] = [];
    const pluginData = await call("maxi/run-wp-cli", {
      command: "wp plugin list --status=active --format=json",
    });
    if (pluginData?.output) {
      try {
        const raw = JSON.parse(pluginData.output) as Record<string, string>[];
        activePlugins = raw.map((p) => ({
          slug: p.name ?? "",
          name: p.title ?? p.name ?? "",
          version: p.version ?? "",
        }));
      } catch {
        /* ignore */
      }
    }

    // 3. Post types
    let postTypes: string[] = [];
    const ptData = await call("maxi/get-post-types");
    if (Array.isArray(ptData)) {
      postTypes = ptData.map(
        (pt: Record<string, string>) => pt.name ?? pt.slug ?? "",
      );
    }

    // 4. Product count (only if WooCommerce active)
    let productCount: number | null = null;
    const hasWoo = activePlugins.some((p) => p.slug === "woocommerce");
    if (hasWoo) {
      const prodData = await call("maxi/list-content", {
        post_type: "product",
        per_page: 1,
      });
      if (typeof prodData?.total === "number") productCount = prodData.total;
    }

    return {
      wp_version: siteData.wp_version ?? "unknown",
      site_url: siteData.url ?? base,
      site_name: siteData.name ?? "",
      active_plugins: activePlugins,
      post_types: postTypes,
      product_count: productCount,
      fetched_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`Site audit failed for ${base}: ${String(err)}`);
    return null;
  }
}

/**
 * Format audit as compact text for Claude prompt.
 * Keeps token count low — only signals relevant for estimation.
 */
export function formatAuditForPrompt(audit: WpSiteAudit): string {
  const plugins = audit.active_plugins
    .map((p) => `  - ${p.name} (${p.slug}) v${p.version}`)
    .join("\n");

  const productLine =
    audit.product_count !== null
      ? `Products: ${audit.product_count}`
      : "WooCommerce: not installed";

  return `<site_audit>
Site: ${audit.site_name} (${audit.site_url})
WordPress: ${audit.wp_version}
${productLine}
Post types: ${audit.post_types.join(", ")}
Active plugins (${audit.active_plugins.length}):
${plugins}
</site_audit>`;
}
