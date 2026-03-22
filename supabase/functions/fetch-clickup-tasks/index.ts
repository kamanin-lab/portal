import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { parseClickUpTimestamp } from "../_shared/utils.ts";
import { getVisibilityFromFields } from "../_shared/clickup-contract.ts";

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

// Retry wrapper with exponential backoff
async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries = 2,
  log?: ReturnType<typeof createLogger>
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      
      // Retry on 429 (rate limit) or 5xx (server errors)
      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          log?.debug(`Retry ${attempt + 1} after ${delay}ms`, { status: response.status });
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      if ((error as Error).name === 'AbortError') {
        log?.error('Request timed out');
      }
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500;
        log?.debug(`Retry ${attempt + 1} after ${delay}ms`, { error: (error as Error).name });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Request failed after retries');
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
  last_activity_at: string;
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

interface DiagnosticsData {
  total_tasks_from_lists: number;
  tasks_with_visibility_field: number;
  tasks_missing_visibility_field: number;
  fallback_fetches_attempted: number;
  fallback_fetches_succeeded: number;
  visible_after_filtering: number;
  sample_visibility_values: Array<{ taskId: string; value: unknown; source: string }>;
}

// Helper: Fetch single task detail from ClickUp (for fallback visibility check)
async function fetchTaskDetail(
  taskId: string,
  clickupApiToken: string,
  log?: ReturnType<typeof createLogger>
): Promise<ClickUpTask | null> {
  try {
    const response = await fetchWithTimeout(`https://api.clickup.com/api/v2/task/${taskId}`, {
      headers: {
        Authorization: clickupApiToken,
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      await response.text();
      return null;
    }
    const text = await response.text();
    if (!text || text.trim() === "") return null;
    return JSON.parse(text) as ClickUpTask;
  } catch {
    log?.error('Failed to fetch task detail');
    return null;
  }
}

// Helper: Fetch all tasks from a single list with pagination
async function fetchAllTasksFromList(
  listId: string,
  clickupApiToken: string,
  log?: ReturnType<typeof createLogger>
): Promise<ClickUpTask[]> {
  const allTasks: ClickUpTask[] = [];
  let page = 0;
  const maxPages = 20; // Safety limit

  while (page < maxPages) {
    const url = `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=true&page=${page}`;
    log?.debug(`Fetching page ${page} from list`);

    try {
      const response = await fetchWithRetry(url, {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
      }, 2, log);

      if (!response.ok) {
        await response.text();
        log?.error(`ClickUp API error for list page ${page}`, { status: response.status });
        break;
      }

      const text = await response.text();
      if (!text || text.trim() === "") break;

      const data = JSON.parse(text);
      const tasks: ClickUpTask[] = data.tasks || [];

      if (tasks.length === 0) {
        // No more tasks
        break;
      }

      allTasks.push(...tasks);
      page++;

      // ClickUp returns max 100 per page by default; if less, we're done
      if (tasks.length < 100) {
        break;
      }
    } catch (err) {
      log?.error(`Error fetching page ${page} from list`, { error: (err as Error).message });
      break;
    }
  }

  return allTasks;
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

// Transform ClickUp task to our format
function transformTask(task: ClickUpTask): TransformedTask {
  return {
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
    last_activity_at: parseClickUpTimestamp(task.date_updated).toISOString(),
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
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('fetch-clickup-tasks', requestId);

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

    // Parse optional request body for debug mode
    let debugMode = false;
    try {
      const bodyText = await req.text();
      if (bodyText) {
        const bodyData = JSON.parse(bodyText);
        debugMode = bodyData?.debug === true;
      }
    } catch {
      // No body or invalid JSON - that's fine
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");
    const visibleFieldId = Deno.env.get("CLICKUP_VISIBLE_FIELD_ID");

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

    log.info("Request received", { debug: debugMode });

    // Get user's ClickUp list IDs from profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("clickup_list_ids")
      .eq("id", user.id)
      .single();

    if (profileError) {
      log.error("Failed to fetch profile");
      return new Response(
        JSON.stringify({ error: "Failed to fetch user profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const listIds = profile?.clickup_list_ids || [];
    
    if (listIds.length === 0) {
      log.info("No ClickUp list IDs configured for user");
      return new Response(
        JSON.stringify({ tasks: [], message: "No ClickUp lists configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("Fetching tasks from ClickUp lists", { listCount: listIds.length });

    // Diagnostics tracking
    const diagnostics: DiagnosticsData = {
      total_tasks_from_lists: 0,
      tasks_with_visibility_field: 0,
      tasks_missing_visibility_field: 0,
      fallback_fetches_attempted: 0,
      fallback_fetches_succeeded: 0,
      visible_after_filtering: 0,
      sample_visibility_values: [],
    };

    // Fetch tasks from all configured lists (with pagination)
    const allRawTasks: ClickUpTask[] = [];

    for (const listId of listIds) {
      // Validate list ID format (ClickUp IDs are alphanumeric)
      if (!/^[a-zA-Z0-9]+$/.test(listId)) {
        log.error("Invalid list ID format detected");
        continue;
      }

      try {
        const tasks = await fetchAllTasksFromList(listId, clickupApiToken, log);
        log.debug(`Fetched tasks from list`, { count: tasks.length });
        allRawTasks.push(...tasks);
      } catch (err) {
        log.error("Error fetching from list", { error: (err as Error).message });
      }
    }

    diagnostics.total_tasks_from_lists = allRawTasks.length;
    log.info("Total tasks fetched from all lists", { count: allRawTasks.length });

    // If no visibility field configured, return all tasks
    if (!visibleFieldId) {
      log.info("No visibility field configured - returning all tasks");
      const transformedTasks = allRawTasks.map(transformTask);
      diagnostics.visible_after_filtering = transformedTasks.length;
      
      const response: { tasks: TransformedTask[]; diagnostics?: DiagnosticsData } = { tasks: transformedTasks };
      if (debugMode) response.diagnostics = diagnostics;
      
      return new Response(
        JSON.stringify(response),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Separate tasks into those with visibility field and those without
    const tasksWithKnownVisibility: Array<{ task: ClickUpTask; visible: boolean }> = [];
    const tasksNeedingFallback: ClickUpTask[] = [];

    for (const task of allRawTasks) {
      const { found, visible } = getVisibilityFromFields(task.custom_fields, visibleFieldId);
      
      if (found) {
        diagnostics.tasks_with_visibility_field++;
        tasksWithKnownVisibility.push({ task, visible });
        
        // Sample for diagnostics
        if (diagnostics.sample_visibility_values.length < 5) {
          const fieldValue = task.custom_fields?.find((f) => f.id === visibleFieldId)?.value;
          diagnostics.sample_visibility_values.push({
            taskId: task.id,
            value: fieldValue,
            source: "list_endpoint",
          });
        }
      } else {
        diagnostics.tasks_missing_visibility_field++;
        tasksNeedingFallback.push(task);
      }
    }

    log.debug("Visibility field analysis", {
      withField: diagnostics.tasks_with_visibility_field,
      needingFallback: tasksNeedingFallback.length,
    });

    // Fallback: Fetch task details for tasks missing visibility field
    // Use concurrency limit to avoid overwhelming ClickUp API
    const CONCURRENCY_LIMIT = 5;
    const MAX_FALLBACK_TASKS = 50; // Safety cap
    const tasksToFetchDetail = tasksNeedingFallback.slice(0, MAX_FALLBACK_TASKS);
    diagnostics.fallback_fetches_attempted = tasksToFetchDetail.length;

    for (let i = 0; i < tasksToFetchDetail.length; i += CONCURRENCY_LIMIT) {
      const batch = tasksToFetchDetail.slice(i, i + CONCURRENCY_LIMIT);
      const detailPromises = batch.map((t) => fetchTaskDetail(t.id, clickupApiToken, log));
      const details = await Promise.all(detailPromises);

      for (let j = 0; j < batch.length; j++) {
        const originalTask = batch[j];
        const detailedTask = details[j];

        if (detailedTask) {
          diagnostics.fallback_fetches_succeeded++;
          const { found, visible } = getVisibilityFromFields(detailedTask.custom_fields, visibleFieldId);
          
          if (found) {
            tasksWithKnownVisibility.push({ task: detailedTask, visible });
            
            // Sample for diagnostics
            if (diagnostics.sample_visibility_values.length < 10) {
              const fieldValue = detailedTask.custom_fields?.find((f) => f.id === visibleFieldId)?.value;
              diagnostics.sample_visibility_values.push({
                taskId: detailedTask.id,
                value: fieldValue,
                source: "task_detail_fallback",
              });
            }
          } else {
            // Still no visibility field - assume not visible (safe default)
            tasksWithKnownVisibility.push({ task: detailedTask, visible: false });
          }
        } else {
          // Couldn't fetch detail - use original task, assume not visible
          tasksWithKnownVisibility.push({ task: originalTask, visible: false });
        }
      }
    }

    // Filter to only visible tasks and transform
    const visibleTasks = tasksWithKnownVisibility
      .filter(({ visible }) => visible)
      .map(({ task }) => transformTask(task));

    diagnostics.visible_after_filtering = visibleTasks.length;
    log.info("Returning visible tasks", { count: visibleTasks.length });

    // Cache visible tasks with activity timestamp
    // Trigger ensures last_activity_at never decreases
    if (visibleTasks.length > 0) {
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseServiceKey) {
        const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
        
        // Batch upsert (50 tasks per batch) with error handling
        const BATCH_SIZE = 50;
        for (let i = 0; i < visibleTasks.length; i += BATCH_SIZE) {
          const batch = visibleTasks.slice(i, i + BATCH_SIZE).map(task => ({
            clickup_id: task.id,
            profile_id: user.id,
            name: task.name,
            description: task.description,
            status: task.status,
            status_color: task.status_color,
            priority: task.priority,
            priority_color: task.priority_color,
            due_date: task.due_date,
            clickup_url: task.url,
            list_id: task.list_id,
            list_name: task.list_name,
            raw_data: task,
            last_synced: new Date().toISOString(),
            is_visible: true,
            last_activity_at: task.last_activity_at,
            credits: task.credits,
          }));
          
          const { error: batchError, count } = await supabaseService
            .from("task_cache")
            .upsert(batch, { onConflict: "clickup_id,profile_id" })
            .select("clickup_id", { count: "exact" });
          
          if (batchError) {
            log.error("Batch upsert failed", { 
              batchIndex: Math.floor(i / BATCH_SIZE), 
              batchSize: batch.length,
              error: batchError.message 
            });
          } else {
            log.debug("Batch upsert success", { 
              batchIndex: Math.floor(i / BATCH_SIZE), 
              batchSize: batch.length,
              rowsAffected: count ?? batch.length
            });
          }
        }
        
        log.info("Task cache updated with activity timestamps", { count: visibleTasks.length });
      }
    }

    const response: { tasks: TransformedTask[]; diagnostics?: DiagnosticsData } = { tasks: visibleTasks };
    if (debugMode) response.diagnostics = diagnostics;

    return new Response(
      JSON.stringify(response),
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
