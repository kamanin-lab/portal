import { createLogger } from "./logger.ts";

export interface WpOperatorNote {
  id: number;
  title: string;
  content: string;
  topic: string;
  priority: "low" | "normal" | "high" | "critical";
}

export interface WpSiteAudit {
  wp_version: string;
  site_url: string;
  site_name: string;
  language: string;
  timezone: string;
  active_plugins: { slug: string; name: string; version: string }[];
  post_types: string[];
  product_count: number | null;
  operator_notes: WpOperatorNote[];
  fetched_at: string;
}

const VALID_PRIORITIES = new Set<string>(["low", "normal", "high", "critical"]);

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

  const call = async (ability: string, args?: Record<string, unknown>) => {
    const res = await fetch(
      `${base}/wp-json/wp-abilities/v1/abilities/${ability}/run`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(args ?? {}),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? json.data : null;
  };

  try {
    // 0. Bootstrap session (mandatory for Maxi AI v3.3.0+).
    // Wrapped in its own try/catch: older plugin versions or transient
    // failures must NOT abort the audit — we degrade to empty operator_notes.
    let operatorNotes: WpOperatorNote[] = [];
    try {
      const bootstrapData = await call("maxi/bootstrap-session");
      if (bootstrapData && Array.isArray(bootstrapData.operator_notes)) {
        operatorNotes = (bootstrapData.operator_notes as unknown[])
          .filter(
            (n): n is Record<string, unknown> =>
              typeof n === "object" &&
              n !== null &&
              VALID_PRIORITIES.has(String((n as Record<string, unknown>).priority)),
          )
          .map((n) => ({
            id: Number(n.id ?? 0),
            title: String(n.title ?? ""),
            content: String(n.content ?? ""),
            topic: String(n.topic ?? ""),
            priority: String(n.priority) as WpOperatorNote["priority"],
          }));
      }
    } catch (err) {
      logger.warn(
        `maxi/bootstrap-session failed for ${base}: ${String(err)} — continuing without operator notes`,
      );
    }

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
      language: siteData.language ?? "unknown",
      timezone: siteData.timezone ?? "unknown",
      active_plugins: activePlugins,
      post_types: postTypes,
      product_count: productCount,
      operator_notes: operatorNotes,
      fetched_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`Site audit failed for ${base}: ${String(err)}`);
    return null;
  }
}

const PRIORITY_ORDER: Record<WpOperatorNote["priority"], number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

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

  let operatorSection = "";
  if (audit.operator_notes.length > 0) {
    const sorted = [...audit.operator_notes].sort(
      (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    );
    const lines = sorted
      .map((n) => `[${n.priority.toUpperCase()}] ${n.title}: ${n.content}`)
      .join("\n");
    operatorSection = `\nOperator instructions (${audit.operator_notes.length}):\n${lines}`;
  }

  return `<site_audit>
Site: ${audit.site_name} (${audit.site_url})
WordPress: ${audit.wp_version} | Language: ${audit.language} | Timezone: ${audit.timezone}
${productLine}
Post types: ${audit.post_types.join(", ")}
Active plugins (${audit.active_plugins.length}):
${plugins}${operatorSection}
</site_audit>`;
}
