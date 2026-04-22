import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const log = createLogger("mcp-proxy");

const ALLOWED_METHODS = new Set([
  "initialize",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/read",
]);

const DEFAULT_MCP_SERVER_URL = "https://kamanda-mcp-poc.vercel.app/mcp";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mcpServerUrl = Deno.env.get("MCP_SERVER_URL") || DEFAULT_MCP_SERVER_URL;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    log.error("Missing required env vars");
    return new Response(
      JSON.stringify({ error: "Server misconfigured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // ── Gate 1: JWT auth ──
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      log.warn("Auth failed", { error: userError?.message });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Gate 2: Workspace access check ──
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Resolve caller's organization_id via org_members
    const { data: memberRow, error: memberError } = await supabaseAdmin
      .from("org_members")
      .select("organization_id")
      .eq("profile_id", user.id)
      .limit(1)
      .maybeSingle();

    if (memberError || !memberRow?.organization_id) {
      log.warn("No org membership found", { userId: user.id });
      return new Response(
        JSON.stringify({ error: "No organization membership" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const orgId = memberRow.organization_id as string;

    // Check client_workspaces for revenue-intelligence module
    const { data: workspace, error: wsError } = await supabaseAdmin
      .from("client_workspaces")
      .select("id")
      .eq("organization_id", orgId)
      .eq("module_key", "revenue-intelligence")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (wsError || !workspace) {
      log.warn("No access to Revenue Intelligence", { orgId });
      return new Response(
        JSON.stringify({ error: "No access to Revenue Intelligence" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Parse and validate request body ──
    let body: { method?: string; params?: Record<string, unknown>; id?: unknown; jsonrpc?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { method, params, id, jsonrpc } = body;

    if (!method || typeof method !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'method' field" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Whitelist check ──
    if (!ALLOWED_METHODS.has(method)) {
      log.warn("Method not allowed", { method });
      return new Response(
        JSON.stringify({ error: "Method not allowed", method }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // For tools/call: only allow 'daily-briefing' tool
    if (method === "tools/call") {
      const toolName = (params as Record<string, unknown> | undefined)?.name;
      if (toolName !== "daily-briefing") {
        log.warn("Tool not allowed", { toolName });
        return new Response(
          JSON.stringify({ error: "Tool not allowed", tool: toolName }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // For resources/read: only allow ui://kamanda/ URIs
    if (method === "resources/read") {
      const uri = (params as Record<string, unknown> | undefined)?.uri;
      if (typeof uri !== "string" || !uri.startsWith("ui://kamanda/")) {
        log.warn("Resource URI not allowed", { uri });
        return new Response(
          JSON.stringify({ error: "Resource URI not allowed", uri }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Proxy to upstream MCP server ──
    const rpcEnvelope = {
      jsonrpc: jsonrpc || "2.0",
      method,
      params: params ?? {},
      id: id ?? crypto.randomUUID(),
    };

    log.info("Proxying to MCP server", { method, mcpServerUrl });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(mcpServerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rpcEnvelope),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      log.error("Upstream fetch failed", { error: message });
      return new Response(
        JSON.stringify({ error: "upstream_error", detail: message }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    clearTimeout(timeout);

    if (!upstreamResponse.ok) {
      const detail = await upstreamResponse.text().catch(() => "Unknown error");
      log.error("Upstream non-2xx", { status: upstreamResponse.status, detail });
      return new Response(
        JSON.stringify({ error: "upstream_error", detail }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const upstreamBody = await upstreamResponse.text();

    return new Response(upstreamBody, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Unhandled error", { error: message });
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
