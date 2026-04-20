/**
 * update-task-departments — Admin-only EF to set Fachbereich (department labels)
 * on a ClickUp task and sync to task_cache.
 *
 * Input:  { clickupId: string, departmentIds: string[] }
 * Output: { success: true } | { error: string }
 *
 * Auth: Bearer token (user JWT). Caller must be admin in the task's org.
 * ClickUp API: POST /task/{id}/field/{field_id} with value = array of option UUIDs.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { getUserOrgRole } from "../_shared/org.ts";

// Fetch with timeout (10 seconds default)
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger("update-task-departments", requestId);

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // ---- Auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !clickupApiToken) {
      log.error("Missing required environment variables");
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Parse body ----
    const body = await req.json();
    const clickupId: string | undefined = body.clickupId;
    const departmentIds: string[] | undefined = body.departmentIds;

    if (!clickupId || typeof clickupId !== "string" || !/^[a-zA-Z0-9]+$/.test(clickupId)) {
      return new Response(JSON.stringify({ error: "Invalid clickupId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(departmentIds) || !departmentIds.every((id) => typeof id === "string")) {
      return new Response(JSON.stringify({ error: "departmentIds must be an array of strings" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ---- Admin check ----
    const role = await getUserOrgRole(supabaseAdmin, user.id);
    if (role !== "admin") {
      log.warn("Non-admin attempted to update departments", { role });
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Resolve org department field ----
    // Get org from the task's list_id via task_cache
    const { data: taskRow } = await supabaseAdmin
      .from("task_cache")
      .select("list_id")
      .eq("clickup_id", clickupId)
      .limit(1)
      .maybeSingle();

    if (!taskRow?.list_id) {
      return new Response(JSON.stringify({ error: "Task not found in cache" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find org by list_id
    const { data: orgs } = await supabaseAdmin
      .from("organizations")
      .select("id, clickup_department_field_id")
      .contains("clickup_list_ids", [taskRow.list_id])
      .limit(1)
      .maybeSingle();

    if (!orgs?.clickup_department_field_id) {
      return new Response(
        JSON.stringify({ error: "Department field not configured for this organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fieldId = orgs.clickup_department_field_id;

    // ---- Write to ClickUp ----
    // Labels type: POST /task/{id}/field/{field_id} with value = array of option UUIDs
    const clickupResp = await fetchWithTimeout(
      `https://api.clickup.com/api/v2/task/${clickupId}/field/${fieldId}`,
      {
        method: "POST",
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ value: departmentIds }),
      },
    );

    if (!clickupResp.ok) {
      const errText = await clickupResp.text();
      log.error("ClickUp field update failed", { status: clickupResp.status, body: errText });
      return new Response(
        JSON.stringify({ error: "Failed to update ClickUp field" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---- Sync to task_cache ----
    // Update ALL rows for this clickup_id (service role, no profile_id filter)
    const { error: cacheError, count } = await supabaseAdmin
      .from("task_cache")
      .update({ departments: departmentIds, last_synced: new Date().toISOString() })
      .eq("clickup_id", clickupId)
      .select("clickup_id", { count: "exact" });

    if (cacheError) {
      log.error("Failed to update task_cache.departments", { error: cacheError.message });
      // Don't fail the request — ClickUp is already updated
    } else {
      log.info("Updated task_cache.departments", { clickupId, departments: departmentIds, rowsAffected: count ?? 0 });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    log.error("Function error", { error: (error as Error).message });
    return new Response(JSON.stringify({ error: "An error occurred" }), {
      status: 500,
      headers: { ...defaultCorsHeaders, "Content-Type": "application/json" },
    });
  }
});
