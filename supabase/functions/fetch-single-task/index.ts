import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { isTaskVisible } from "../_shared/clickup-contract.ts";
import { parseClickUpTimestamp } from "../_shared/utils.ts";
import { getOrgForUser } from "../_shared/org.ts";

// Fetch with timeout (10 seconds default)
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  value?: boolean | string | number | null;
}

interface ClickUpTask {
  id: string;
  name: string;
  description: string;
  status: {
    status: string;
    color: string;
    type: string;
  };
  priority: {
    id: string;
    priority: string;
    color: string;
  } | null;
  due_date: string | null;
  time_estimate: number | null;
  date_created: string;
  date_updated: string;
  assignees: Array<{
    id: number;
    username: string;
    email: string;
    profilePicture: string | null;
  }>;
  tags: Array<{
    name: string;
    tag_fg: string;
    tag_bg: string;
  }>;
  url: string;
  list: {
    id: string;
    name: string;
  };
  custom_fields?: ClickUpCustomField[];
}

interface TransformedTask {
  id: string;
  clickup_id: string;
  name: string;
  description: string;
  status: string;
  status_color: string;
  priority: string | null;
  priority_color: string | null;
  due_date: string | null;
  time_estimate: number | null;
  created_at: string;
  updated_at: string;
  assignees: Array<{
    id: number;
    username: string;
    email: string;
    avatar: string | null;
  }>;
  tags: Array<{
    name: string;
    color: string;
    background: string;
  }>;
  url: string;
  list_id: string;
  list_name: string;
  credits: number | null;
}

// Extract Credits value from ClickUp custom fields
function extractCredits(customFields: ClickUpCustomField[] | undefined): number | null {
  if (!customFields || !Array.isArray(customFields)) return null;
  const creditsFieldId = Deno.env.get("CLICKUP_CREDITS_FIELD_ID") || "";
  const field = customFields.find(
    (f) => (creditsFieldId && f.id === creditsFieldId) || f.name === "Credits"
  );
  if (!field || field.value === undefined || field.value === null) return null;
  const num = Number(field.value);
  return isNaN(num) ? null : num;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('fetch-single-task', requestId);

  // Get dynamic CORS headers based on request origin
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.error("Missing or invalid authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body = await req.text();
    if (!body) {
      return new Response(
        JSON.stringify({ error: "Missing request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let requestData;
    try {
      requestData = JSON.parse(body);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { taskId } = requestData;

    // Validate taskId format (ClickUp IDs are alphanumeric)
    if (!taskId || typeof taskId !== "string" || !/^[a-zA-Z0-9]+$/.test(taskId)) {
      log.error("Invalid or missing taskId");
      return new Response(
        JSON.stringify({ error: "Invalid task ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");

    if (!supabaseUrl || !supabaseAnonKey) {
      log.error("Missing required server configuration");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clickupApiToken) {
      log.error("Missing required API configuration");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's auth
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user using getUser (stable API)
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      log.error("Failed to verify token", { error: userError?.message });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("Fetching single task");

    // ORG-BE-01: Resolve org config via service role (bypasses RLS on org_members)
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseServiceKey) {
      log.error("SUPABASE_SERVICE_ROLE_KEY missing");
      return new Response(
        JSON.stringify({ error: "Server misconfigured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const org = await getOrgForUser(supabaseAdmin, user.id);
    if (!org) {
      log.error("No org_members row for user");
      return new Response(
        JSON.stringify({ error: "Organisation nicht konfiguriert" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userListIds: string[] = org.clickup_list_ids;

    // Fetch the task directly from ClickUp API
    log.debug("Fetching task from ClickUp API");
    
    const response = await fetchWithTimeout(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const status = response.status;
      await response.text(); // Consume response body
      
      if (status === 404) {
        log.info("Task not found in ClickUp");
        return new Response(
          JSON.stringify({ task: null, message: "Task not found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      log.error("ClickUp API error", { status });
      return new Response(
        JSON.stringify({ error: "Failed to fetch task from ClickUp" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const responseText = await response.text();
    if (!responseText || responseText.trim() === '') {
      log.error("Empty response from ClickUp API");
      return new Response(
        JSON.stringify({ task: null, message: "Empty response from ClickUp" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let task: ClickUpTask;
    try {
      task = JSON.parse(responseText);
    } catch {
      log.error("Failed to parse ClickUp response");
      return new Response(
        JSON.stringify({ error: "Invalid response from ClickUp" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the task belongs to one of the user's configured lists
    const taskListId = task.list?.id;
    if (!taskListId || !userListIds.includes(taskListId)) {
      log.info("User does not have access to task's list");
      return new Response(
        JSON.stringify({ task: null, message: "You don't have access to this task" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check visibility custom field - only return tasks marked as visible
    const visibleFieldId = Deno.env.get("CLICKUP_VISIBLE_FIELD_ID");
    if (visibleFieldId && !isTaskVisible(task.custom_fields, visibleFieldId)) {
      log.info("Task is not visible in client portal");
      return new Response(
        JSON.stringify({ task: null, message: "Task not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Transform task to our format
    const transformedTask: TransformedTask = {
      id: task.id,
      clickup_id: task.id,
      name: task.name,
      description: task.description || "",
      status: task.status.status,
      status_color: task.status.color,
      priority: task.priority?.priority || null,
      priority_color: task.priority?.color || null,
      due_date: task.due_date ? new Date(parseInt(task.due_date)).toISOString() : null,
      time_estimate: task.time_estimate || null,
      created_at: new Date(parseInt(task.date_created)).toISOString(),
      updated_at: new Date(parseInt(task.date_updated)).toISOString(),
      assignees: task.assignees.map((a) => ({
        id: a.id,
        username: a.username,
        email: a.email,
        avatar: a.profilePicture,
      })),
      tags: task.tags.map((t) => ({
        name: t.name,
        color: t.tag_fg,
        background: t.tag_bg,
      })),
      url: task.url,
      list_id: task.list.id,
      list_name: task.list.name,
      credits: extractCredits(task.custom_fields),
    };

    // Write to task_cache so Realtime subscribers pick up the update
    // supabaseAdmin already constructed above for org lookup — reuse it
    {
      const { error: upsertError } = await supabaseAdmin
        .from("task_cache")
        .upsert({
          clickup_id: task.id,
          profile_id: user.id,
          name: task.name,
          description: task.description || "",
          status: task.status.status,
          status_color: task.status.color,
          priority: task.priority?.priority || null,
          priority_color: task.priority?.color || null,
          due_date: task.due_date ? new Date(parseInt(task.due_date)).toISOString() : null,
          time_estimate: task.time_estimate || null,
          clickup_url: task.url,
          list_id: task.list.id,
          list_name: task.list.name,
          raw_data: transformedTask,
          last_synced: new Date().toISOString(),
          is_visible: true,
          last_activity_at: parseClickUpTimestamp(task.date_updated).toISOString(),
          credits: extractCredits(task.custom_fields),
        }, { onConflict: "clickup_id,profile_id" });

      if (upsertError) {
        log.error("Failed to upsert task_cache", { error: upsertError.message });
      } else {
        log.debug("task_cache updated for single task");
      }
    }

    log.info("Successfully fetched task", { name: task.name });

    return new Response(
      JSON.stringify({ task: transformedTask }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log.error("Function error", { error: (error as Error).message });
    return new Response(
      JSON.stringify({ error: "An error occurred" }),
      { status: 500, headers: { ...defaultCorsHeaders, "Content-Type": "application/json" } }
    );
  }
});
