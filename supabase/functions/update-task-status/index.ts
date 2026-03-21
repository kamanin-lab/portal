import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { resolvePublicThreadRootId, resolveStatusForAction } from "../_shared/clickup-contract.ts";

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

const VALID_ACTIONS = ["approve", "request_changes", "put_on_hold", "resume", "cancel"];

function isValidTaskId(taskId: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(taskId) && taskId.length <= 50;
}

function validateActionComment(action: string, comment: unknown): string | null {
  if (action !== 'request_changes') return null;
  if (typeof comment !== 'string' || !comment.trim()) {
    return 'Request changes requires a comment';
  }
  return null;
}

async function resolveActivePublicThread(
  taskId: string,
  clickupApiToken: string,
  log?: ReturnType<typeof createLogger>
): Promise<{ rootId: string | null; reason: "none" | "single" | "ambiguous" }> {
  try {
    const response = await fetchWithRetry(
      `https://api.clickup.com/api/v2/task/${taskId}/comment`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
      },
      2,
      log
    );

    if (!response.ok) {
      log?.debug("Failed to fetch comments for thread detection", { status: response.status });
      return { rootId: null, reason: "none" };
    }

    const data = await response.json();
    const resolution = resolvePublicThreadRootId(data.comments || []);

    if (resolution.reason === "ambiguous") {
      log?.warn("Multiple public thread roots found; creating a new top-level portal message", { taskId });
    } else if (resolution.reason === "single") {
      log?.debug("Resolved single public thread root", { taskId, rootId: resolution.rootId });
    }

    return resolution;
  } catch (error) {
    log?.error("Error resolving public thread", { error: (error as Error).message });
    return { rootId: null, reason: "none" };
  }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('update-task-status', requestId);

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.error("Missing or invalid authorization header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
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

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      log.error("Failed to verify token", { error: userError?.message });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    const userEmail = user.email || '';
    log.info("User attempting to update task status");

    const body = await req.json();
    const { taskId, action, comment } = body;

    if (!taskId || !isValidTaskId(taskId)) {
      return new Response(
        JSON.stringify({ error: "Invalid task ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Missing required field: action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!VALID_ACTIONS.includes(action)) {
      return new Response(
        JSON.stringify({ error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const commentValidationError = validateActionComment(action, comment);
    if (commentValidationError) {
      return new Response(
        JSON.stringify({ error: commentValidationError }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (comment && typeof comment === 'string' && comment.length > 10000) {
      return new Response(
        JSON.stringify({ error: "Comment is too long (max 10,000 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("Updating task with action", { action });

    const taskResponse = await fetchWithRetry(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
      },
      2,
      log
    );

    if (!taskResponse.ok) {
      await taskResponse.text();
      log.error("External service error fetching task", { status: taskResponse.status });
      return new Response(
        JSON.stringify({ error: "Failed to fetch task" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const task = await taskResponse.json();
    const listId = task.list.id;
    log.debug("Task is in list");

    const listResponse = await fetchWithRetry(
      `https://api.clickup.com/api/v2/list/${listId}`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
      },
      2,
      log
    );

    if (!listResponse.ok) {
      await listResponse.text();
      log.error("External service error fetching list", { status: listResponse.status });
      return new Response(
        JSON.stringify({ error: "Failed to fetch list configuration" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const list = await listResponse.json();
    const availableStatuses = list.statuses || [];
    log.debug("Available statuses", { statuses: availableStatuses.map((s: { status: string }) => s.status) });

    const matchedStatus = resolveStatusForAction(action, availableStatuses);

    if (!matchedStatus) {
      log.error("No matching status found for action", { action });
      return new Response(
        JSON.stringify({
          error: `Cannot ${action === "approve" ? "approve" : "request changes for"} task. The required status is not available in this list.`,
          availableStatuses: availableStatuses.map((s: { status: string }) => s.status)
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("Updating task status", { newStatus: matchedStatus.status });

    const updateResponse = await fetchWithRetry(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      {
        method: "PUT",
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: matchedStatus.status,
        }),
      },
      2,
      log
    );

    if (!updateResponse.ok) {
      await updateResponse.text();
      log.error("External service error updating status", { status: updateResponse.status });
      return new Response(
        JSON.stringify({ error: "Failed to update task status" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const updatedTask = await updateResponse.json();
    log.info("Task status updated successfully");

    if (comment && typeof comment === 'string' && comment.trim()) {
      log.debug("Posting comment to task");

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();

      const fullName = profile?.full_name || userEmail?.split('@')[0] || 'Client';
      const firstName = fullName.split(' ')[0];

      const clickupText = `${fullName} (via Client Portal):\n\n${comment.trim()}`;
      const displayText = comment.trim();

      const threadResolution = await resolveActivePublicThread(taskId, clickupApiToken, log);

      let endpoint: string;
      if (threadResolution.rootId) {
        endpoint = `https://api.clickup.com/api/v2/comment/${threadResolution.rootId}/reply`;
        log.debug("Posting as reply to the active public thread", { rootId: threadResolution.rootId });
      } else {
        endpoint = `https://api.clickup.com/api/v2/task/${taskId}/comment`;
        log.debug("Creating new top-level portal thread", { reason: threadResolution.reason });
      }

      const commentResponse = await fetchWithRetry(endpoint, {
        method: "POST",
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment_text: clickupText,
          notify_all: false,
        }),
      }, 2, log);

      if (!commentResponse.ok) {
        await commentResponse.text();
        log.error("Failed to post comment", { status: commentResponse.status });
      } else {
        const commentData = await commentResponse.json();
        log.info("Comment posted successfully");

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

        const { error: cacheError } = await supabaseAdmin
          .from("comment_cache")
          .upsert({
            clickup_comment_id: commentData.id,
            task_id: taskId,
            profile_id: userId,
            comment_text: clickupText,
            display_text: displayText,
            author_id: 0,
            author_name: firstName,
            author_email: userEmail,
            author_avatar: null,
            clickup_created_at: new Date().toISOString(),
            last_synced: new Date().toISOString(),
            is_from_portal: true,
          }, {
            onConflict: "clickup_comment_id,profile_id",
          });

        if (cacheError) {
          log.error("Failed to cache comment", { error: cacheError.message });
        } else {
          log.debug("Cached comment for instant UI");
        }
      }
    }

    const now = new Date().toISOString();
    await supabase
      .from("task_cache")
      .update({
        status: matchedStatus.status,
        status_color: matchedStatus.color || updatedTask.status?.color,
        last_synced: now,
      })
      .eq("clickup_id", taskId)
      .eq("profile_id", userId);

    const ACTION_MESSAGES: Record<string, string> = {
      approve: "Task has been approved",
      request_changes: "Changes have been requested",
      put_on_hold: "Task has been put on hold",
      resume: "Task has been moved to Open",
      cancel: "Task has been cancelled",
    };

    return new Response(
      JSON.stringify({
        success: true,
        newStatus: matchedStatus.status,
        message: ACTION_MESSAGES[action] || `Task status updated to ${matchedStatus.status}`
      }),
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
