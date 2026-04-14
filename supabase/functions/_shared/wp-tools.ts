// ---------------------------------------------------------------------------
// wp-tools.ts — WordPress abilities exposed as Claude tools (OpenAI tool format)
//
// Used by triage-agent to give Claude dynamic access to the site.
// All tools are read-only. executeWpTool never throws — returns error JSON on failure.
// ---------------------------------------------------------------------------

export interface WpToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Curated read-only WordPress abilities exposed as Claude tools. */
export const WP_TRIAGE_TOOLS: WpToolDef[] = [
  {
    type: "function",
    function: {
      name: "wp_get_plugins",
      description:
        "List all active WordPress plugins (name, slug, version). Call this first to understand the site tech stack.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "wp_get_site_info",
      description:
        "Get WordPress version, site name, language, timezone, and Maxi AI Core version.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "wp_list_content",
      description:
        "List posts, pages, or products. Returns id, title, status, date, and URL for each item. Use per_page up to 100.",
      parameters: {
        type: "object",
        properties: {
          post_type: {
            type: "string",
            description: 'Post type slug. Examples: "page", "post", "product". Default: "post".',
          },
          per_page: {
            type: "integer",
            description: "Items per page. Default 20, max 100.",
          },
          status: {
            type: "string",
            description: 'Filter by status. Default: "publish".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wp_get_meta",
      description:
        "Get meta value(s) for a post. Useful for checking SEO meta: use meta_key '_yoast_wpseo_metadesc' for Yoast meta description, '_yoast_wpseo_title' for title. Omit meta_key to retrieve all meta.",
      parameters: {
        type: "object",
        properties: {
          object_id: {
            type: "integer",
            description: "The post ID.",
          },
          meta_key: {
            type: "string",
            description: "Specific meta key to retrieve. Omit to get all meta.",
          },
        },
        required: ["object_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wp_search_content",
      description: "Search posts/pages/products by keyword. Returns matching items with id and title.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search keyword." },
          post_type: { type: "string", description: 'Post type to search. Default: "post".' },
          per_page: { type: "integer", description: "Max results. Default 10." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wp_get_post_types",
      description: "List all registered public post types on the site.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool name → Maxi AI ability slug mapping
// null = synthetic tool handled directly (not via abilities API)
// ---------------------------------------------------------------------------
const TOOL_ABILITY_MAP: Record<string, string | null> = {
  wp_get_plugins:    null,                   // synthetic: /wp/v2/plugins REST API
  wp_get_site_info:  "maxi/get-site-info",
  wp_list_content:   "maxi/list-content",
  wp_get_meta:       "maxi/get-meta",
  wp_search_content: "maxi/search-content",
  wp_get_post_types: "maxi/get-post-types",
};

const MAX_RESULT_CHARS = 4000;

/**
 * Execute a WordPress tool call and return the result as a JSON string.
 * Never throws — returns `{ error: "..." }` on any failure.
 */
export async function executeWpTool(
  base: string,
  auth: string,
  toolName: string,
  toolInput: Record<string, unknown>,
): Promise<string> {
  try {
    let result: unknown;

    if (toolName === "wp_get_plugins") {
      // Synthetic: WP REST API (more reliable than wp-cli)
      const resp = await fetch(
        `${base}/wp-json/wp/v2/plugins?per_page=100&status=active`,
        {
          headers: { Authorization: auth },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (!resp.ok) return JSON.stringify({ error: `HTTP ${resp.status}` });
      const plugins = await resp.json() as Record<string, string>[];
      result = plugins.map((p) => ({
        slug: p.plugin ?? "",
        name: p.name ?? "",
        version: p.version ?? "",
        status: p.status ?? "active",
      }));
    } else {
      const ability = TOOL_ABILITY_MAP[toolName];
      if (ability === undefined) {
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
      }

      // Build input: wp_get_meta always uses object_type: "post"
      const input: Record<string, unknown> =
        toolName === "wp_get_meta"
          ? { object_type: "post", ...toolInput }
          : { ...toolInput };

      const resp = await fetch(
        `${base}/wp-json/wp-abilities/v1/abilities/${ability}/run`,
        {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!resp.ok) {
        const errText = await resp.text();
        return JSON.stringify({ error: `HTTP ${resp.status}: ${errText.slice(0, 200)}` });
      }

      const data = await resp.json() as { success: boolean; data?: unknown; error?: string };
      result = data?.success ? data.data : { error: data?.error ?? "ability returned success=false" };
    }

    const text = JSON.stringify(result);
    if (text.length > MAX_RESULT_CHARS) {
      return text.slice(0, MAX_RESULT_CHARS) + `... [truncated, ${text.length} chars total]`;
    }
    return text;
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}
