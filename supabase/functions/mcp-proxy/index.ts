import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const ALLOWED_METHODS = new Set([
  "initialize",
  "tools/list",
  "tools/call",
  "resources/list",
  "resources/read",
]);

const DEFAULT_MCP_SERVER_URL = "https://mcp-poc-three.vercel.app/mcp";

Deno.serve(async (req) => {
  const correlationId = crypto.randomUUID();
  const log = createLogger("mcp-proxy", correlationId.slice(0, 8));
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Method not allowed", correlationId }),
      { status: 405, headers: jsonHeaders },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const mcpServerUrl = Deno.env.get("MCP_SERVER_URL") || DEFAULT_MCP_SERVER_URL;

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    log.error("Missing required env vars");
    return new Response(
      JSON.stringify({ ok: false, code: "SERVER_ERROR", message: "Server misconfigured", correlationId }),
      { status: 500, headers: jsonHeaders },
    );
  }

  try {
    // ── Gate 1: JWT auth ──
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", message: "Missing or invalid authorization header", correlationId }),
        { status: 401, headers: jsonHeaders },
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
        JSON.stringify({ ok: false, code: "UNAUTHORIZED", message: "Invalid or expired token", correlationId }),
        { status: 401, headers: jsonHeaders },
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
        JSON.stringify({ ok: false, code: "FORBIDDEN", message: "No organization membership", correlationId }),
        { status: 403, headers: jsonHeaders },
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
        JSON.stringify({ ok: false, code: "FORBIDDEN", message: "No access to Revenue Intelligence", correlationId }),
        { status: 403, headers: jsonHeaders },
      );
    }

    // ── Parse and validate request body ──
    let body: { method?: string; params?: Record<string, unknown>; id?: unknown; jsonrpc?: string };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid JSON body", correlationId }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const { method, params, id, jsonrpc } = body;

    if (!method || typeof method !== "string") {
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Missing or invalid 'method' field", correlationId }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // ── Whitelist check ──
    if (!ALLOWED_METHODS.has(method)) {
      log.warn("Method not allowed", { method });
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", message: `Method not allowed: ${method}`, correlationId }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // For tools/call: whitelist tools exposed by the kmn MCP server (mcp-poc Vercel deployment).
    // Tool names use underscores (daily_briefing, revenue_today, etc.) per upstream schema.
    const ALLOWED_TOOLS = new Set([
      "daily_briefing",
      "revenue_today",
      "payment_attention_orders",
      "incomplete_orders",
    ]);
    if (method === "tools/call") {
      const toolName = (params as Record<string, unknown> | undefined)?.name;
      if (typeof toolName !== "string" || !ALLOWED_TOOLS.has(toolName)) {
        log.warn("Tool not allowed", { toolName });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: `Tool not allowed: ${String(toolName)}`, correlationId }),
          { status: 400, headers: jsonHeaders },
        );
      }
    }

    // For resources/read: only allow ui:// resource URIs (MCP UI widgets).
    // Upstream uses ui://widgets/... — accept any ui:// scheme, reject http(s)://
    // or file:// which would let a compromised upstream exfiltrate arbitrary URLs.
    if (method === "resources/read") {
      const uri = (params as Record<string, unknown> | undefined)?.uri;
      if (typeof uri !== "string" || !uri.startsWith("ui://")) {
        log.warn("Resource URI not allowed", { uri });
        return new Response(
          JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Resource URI not allowed", correlationId }),
          { status: 400, headers: jsonHeaders },
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

    // Streamable HTTP MCP (spec 2025-03-26) requires both content types in Accept.
    // Upstream may reply with application/json or text/event-stream.
    const upstreamHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    };
    const sessionId = req.headers.get("mcp-session-id");
    if (sessionId) upstreamHeaders["Mcp-Session-Id"] = sessionId;

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(mcpServerUrl, {
        method: "POST",
        headers: upstreamHeaders,
        body: JSON.stringify(rpcEnvelope),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      log.error("Upstream fetch failed", { error: message });
      return new Response(
        JSON.stringify({ ok: false, code: "UPSTREAM_ERROR", message: "MCP server unreachable", correlationId }),
        { status: 502, headers: jsonHeaders },
      );
    }
    clearTimeout(timeout);

    if (!upstreamResponse.ok) {
      const detail = await upstreamResponse.text().catch(() => "Unknown error");
      log.error("Upstream non-2xx", { status: upstreamResponse.status, detail });
      return new Response(
        JSON.stringify({ ok: false, code: "UPSTREAM_ERROR", message: "MCP server returned an error", correlationId }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const upstreamContentType = upstreamResponse.headers.get("content-type") ?? "";
    const upstreamBody = await upstreamResponse.text();
    let upstreamJson: unknown;

    try {
      if (upstreamContentType.includes("text/event-stream")) {
        // Parse first SSE "message" event: lines like "event: message\ndata: {json}\n\n".
        // We join multi-line data fields per SSE spec.
        const dataLines: string[] = [];
        for (const line of upstreamBody.split(/\r?\n/)) {
          if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
          } else if (line === "" && dataLines.length > 0) {
            break; // end of first event
          }
        }
        if (dataLines.length === 0) {
          throw new Error("SSE response contained no data lines");
        }
        upstreamJson = JSON.parse(dataLines.join("\n"));
      } else {
        upstreamJson = JSON.parse(upstreamBody);
      }
    } catch (parseErr) {
      const message = parseErr instanceof Error ? parseErr.message : String(parseErr);
      log.error("Upstream parse failed", { error: message, contentType: upstreamContentType, bodyPreview: upstreamBody.slice(0, 200) });
      return new Response(
        JSON.stringify({ ok: false, code: "UPSTREAM_ERROR", message: "MCP server returned unparseable payload", correlationId }),
        { status: 502, headers: jsonHeaders },
      );
    }

    const responseHeaders: Record<string, string> = { ...jsonHeaders };
    const upstreamSessionId = upstreamResponse.headers.get("mcp-session-id");
    if (upstreamSessionId) responseHeaders["Mcp-Session-Id"] = upstreamSessionId;

    return new Response(
      JSON.stringify({ ok: true, code: "OK", correlationId, data: upstreamJson }),
      { status: 200, headers: responseHeaders },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("Unhandled error", { error: message });
    return new Response(
      JSON.stringify({ ok: false, code: "SERVER_ERROR", message: "Internal server error", correlationId }),
      { status: 500, headers: jsonHeaders },
    );
  }
});
