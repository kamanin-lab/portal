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
 */
export async function fetchWpSiteAudit(
  wpMcpUrl: string | null | undefined,
  logger: ReturnType<typeof createLogger>,
): Promise<WpSiteAudit | null> {
  if (!wpMcpUrl) return null;

  const user = Deno.env.get("WP_MCP_USER");
  const pass = Deno.env.get("WP_MCP_APP_PASS");
  if (!user || !pass) {
    logger.warn("WP_MCP_USER or WP_MCP_APP_PASS not configured — skipping site audit");
    return null;
  }

  const base = wpMcpUrl.replace(/\/$/, "");
  const auth = `Basic ${btoa(`${user}:${pass}`)}`;
  const headers = { Authorization: auth, "Content-Type": "application/json" };

  /**
   * Call a Maxi AI ability via POST.
   * Args are wrapped in { input: {...} } as required by wp-abilities/v1 API.
   */
  const callAbility = async (ability: string, args: Record<string, unknown> = {}) => {
    const res = await fetch(
      `${base}/wp-json/wp-abilities/v1/abilities/${ability}/run`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ input: args }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? json.data : null;
  };

  try {
    // 1. Bootstrap session — gets operator notes.
    //    Wrapped in its own try/catch: failure must NOT abort the audit.
    let operatorNotes: WpOperatorNote[] = [];
    try {
      const bootstrapData = await callAbility("maxi/bootstrap-session");
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
      logger.warn(`maxi/bootstrap-session failed for ${base}: ${String(err)} — continuing without operator notes`);
    }

    // 2. Site info (WP version, name, language, timezone)
    const siteData = await callAbility("maxi/get-site-info");
    if (!siteData) {
      logger.warn(`maxi/get-site-info failed for ${base}`);
      return null;
    }

    // 3. Active plugins via WP REST API (more reliable than WP-CLI)
    let activePlugins: { slug: string; name: string; version: string }[] = [];
    try {
      const pluginResp = await fetch(
        `${base}/wp-json/wp/v2/plugins?per_page=100&status=active`,
        { headers: { Authorization: auth }, signal: AbortSignal.timeout(8000) },
      );
      if (pluginResp.ok) {
        const plugins = await pluginResp.json() as Record<string, string>[];
        activePlugins = plugins.map((p) => ({
          slug: p.plugin ?? "",
          name: p.name ?? "",
          version: p.version ?? "",
        }));
      }
    } catch {
      /* non-fatal — audit continues without plugin list */
    }

    return {
      wp_version: siteData.wp_version ?? "unknown",
      site_url: siteData.url ?? base,
      site_name: siteData.name ?? "",
      language: siteData.language ?? "unknown",
      timezone: siteData.timezone ?? "unknown",
      active_plugins: activePlugins,
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
    .map((p) => `  - ${p.name} (${p.slug})${p.version ? ` v${p.version}` : ""}`)
    .join("\n");

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
Active plugins (${audit.active_plugins.length}):
${plugins || "  (none detected)"}${operatorSection}
</site_audit>`;
}
