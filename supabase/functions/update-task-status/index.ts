import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { resolvePublicThreadRootId, resolveStatusForAction } from "../_shared/clickup-contract.ts";
import { getUserOrgRole } from "../_shared/org.ts";

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

const VALID_ACTIONS = ["approve", "request_changes", "put_on_hold", "resume", "cancel", "approve_credits", "accept_recommendation", "decline_recommendation"];

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

    // ORG-BE-11: Role guard — viewer cannot update task status
    if (supabaseServiceKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const orgRole = await getUserOrgRole(supabaseAdmin, userId);
      if (orgRole === "viewer") {
        log.warn("Viewer role blocked from update-task-status", { userId });
        return new Response(
          JSON.stringify({ error: "Insufficient permissions" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const body = await req.json();
    const { taskId, action, comment, dueDate } = body;

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

    if (action === "accept_recommendation" && (!dueDate || typeof dueDate !== "number")) {
      return new Response(
        JSON.stringify({ error: "accept_recommendation requires a dueDate (Unix ms timestamp)" }),
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

    // BLOCKING 1 fix: approve_credits requires task to be in AWAITING APPROVAL status
    if (action === "approve_credits") {
      const supabaseService = createClient(supabaseUrl, supabaseServiceKey!);
      const { data: cached } = await supabaseService
        .from("task_cache")
        .select("status")
        .eq("clickup_id", taskId)
        .eq("profile_id", userId)
        .limit(1)
        .maybeSingle();

      const currentStatus = cached?.status?.toLowerCase() || "";
      if (!currentStatus.includes("awaiting approval")) {
        log.error("approve_credits called on task not in AWAITING APPROVAL", { currentStatus });
        return new Response(
          JSON.stringify({
            ok: false,
            code: "INVALID_TRANSITION",
            message: "approve_credits is only allowed when task is in AWAITING APPROVAL status",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

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

    // accept_recommendation: set due_date, remove recommendation tag, add ticket tag
    if (action === "accept_recommendation") {
      log.info("Processing accept_recommendation: setting due_date and swapping tags", { taskId, dueDate });

      // Set due_date on the task
      const dueDateResp = await fetchWithRetry(
        `https://api.clickup.com/api/v2/task/${taskId}`,
        {
          method: "PUT",
          headers: { Authorization: clickupApiToken, "Content-Type": "application/json" },
          body: JSON.stringify({ due_date: dueDate }),
        },
        2,
        log
      );
      if (!dueDateResp.ok) {
        await dueDateResp.text();
        log.error("Failed to set due_date on recommendation task", { status: dueDateResp.status });
      } else {
        log.info("due_date set on recommendation task");
      }

      // Remove tag 'recommendation' (best-effort)
      const removeTagResp = await fetchWithRetry(
        `https://api.clickup.com/api/v2/task/${taskId}/tag/recommendation`,
        {
          method: "DELETE",
          headers: { Authorization: clickupApiToken, "Content-Type": "application/json" },
        },
        2,
        log
      );
      if (!removeTagResp.ok) {
        await removeTagResp.text();
        log.warn("Failed to remove recommendation tag (best-effort)", { status: removeTagResp.status });
      } else {
        log.info("Removed recommendation tag");
      }

      // Add tag 'ticket' (best-effort)
      const addTagResp = await fetchWithRetry(
        `https://api.clickup.com/api/v2/task/${taskId}/tag/ticket`,
        {
          method: "POST",
          headers: { Authorization: clickupApiToken, "Content-Type": "application/json" },
        },
        2,
        log
      );
      if (!addTagResp.ok) {
        await addTagResp.text();
        log.warn("Failed to add ticket tag (best-effort)", { status: addTagResp.status });
      } else {
        log.info("Added ticket tag");
      }

      // Auto-comment for accept_recommendation
      const supabaseAdminRec = createClient(supabaseUrl, supabaseServiceKey!);

      const { data: profileRec } = await supabase
        .from("profiles")
        .select("full_name, organization_id")
        .eq("id", userId)
        .maybeSingle();

      const fullNameRec = profileRec?.full_name || userEmail?.split("@")[0] || "Client";
      const orgIdRec: string | null = profileRec?.organization_id ?? null;
      const firstNameRec = fullNameRec.split(" ")[0];
      const dueDateFormattedRec = new Date(dueDate).toLocaleDateString("de-AT", { day: "2-digit", month: "2-digit", year: "numeric" });
      const displayTextRec = `Empfehlung angenommen. Erledigen bis: ${dueDateFormattedRec}`;
      const clickupAutoCommentRec = `${fullNameRec} (via Client Portal):\n\n${displayTextRec}`;

      const threadResolutionRec = await resolveActivePublicThread(taskId, clickupApiToken, log);
      const autoEndpointRec = threadResolutionRec.rootId
        ? `https://api.clickup.com/api/v2/comment/${threadResolutionRec.rootId}/reply`
        : `https://api.clickup.com/api/v2/task/${taskId}/comment`;

      const autoCommentRespRec = await fetchWithRetry(autoEndpointRec, {
        method: "POST",
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment_text: clickupAutoCommentRec,
          notify_all: false,
        }),
      }, 2, log);

      if (autoCommentRespRec.ok) {
        const autoCommentDataRec = await autoCommentRespRec.json();
        log.info("Auto-comment posted for recommendation acceptance");

        await supabaseAdminRec
          .from("comment_cache")
          .upsert({
            clickup_comment_id: autoCommentDataRec.id,
            task_id: taskId,
            profile_id: userId,
            comment_text: clickupAutoCommentRec,
            display_text: displayTextRec,
            author_id: 0,
            author_name: firstNameRec,
            author_email: userEmail,
            author_avatar: null,
            clickup_created_at: new Date().toISOString(),
            last_synced: new Date().toISOString(),
            is_from_portal: true,
          }, {
            onConflict: "clickup_comment_id,profile_id",
          });
      } else {
        await autoCommentRespRec.text();
        log.error("Failed to post auto-comment for recommendation acceptance", { status: autoCommentRespRec.status });
      }

      // Deduct credits on recommendation acceptance via upsert_task_deduction RPC
      // (same path as approve_credits). The RPC writes organization_id atomically
      // and uses the partial unique index for idempotency.
      const { data: recTaskCache } = await supabaseAdminRec
        .from("task_cache")
        .select("credits, name")
        .eq("clickup_id", taskId)
        .eq("profile_id", userId)
        .maybeSingle();

      const recCredits = recTaskCache?.credits ?? 0;
      if (recCredits > 0) {
        if (!orgIdRec) {
          log.error("Cannot deduct credits — profile has no organization_id", { userId, taskId });
          return new Response(
            JSON.stringify({ ok: false, code: "ORG_MISSING", message: "Profil ist keiner Organisation zugeordnet." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { error: recDeductError } = await supabaseAdminRec.rpc("upsert_task_deduction", {
          p_profile_id: userId,
          p_organization_id: orgIdRec,
          p_amount: -recCredits,
          p_task_id: taskId,
          p_task_name: recTaskCache?.name || null,
          p_description: `${recCredits} Credits — Empfehlung angenommen`,
        });

        if (recDeductError) {
          log.error("Failed to deduct credits on recommendation acceptance", { error: recDeductError.message });
        } else {
          log.info("Credits deducted on recommendation acceptance", { taskId, amount: -recCredits, orgId: orgIdRec });
        }
      }
    }

    // decline_recommendation: remove recommendation tag (best-effort)
    if (action === "decline_recommendation") {
      const removeTagResp = await fetchWithRetry(
        `https://api.clickup.com/api/v2/task/${taskId}/tag/recommendation`,
        {
          method: "DELETE",
          headers: { Authorization: clickupApiToken, "Content-Type": "application/json" },
        },
        2,
        log
      );
      if (!removeTagResp.ok) {
        await removeTagResp.text();
        log.warn("Failed to remove recommendation tag on decline (best-effort)", { status: removeTagResp.status });
      } else {
        log.info("Removed recommendation tag on decline");
      }

      // Auto-comment for decline_recommendation
      const supabaseAdminDec = createClient(supabaseUrl, supabaseServiceKey!);
      const { data: profileDec } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();

      const fullNameDec = profileDec?.full_name || userEmail?.split("@")[0] || "Client";
      const firstNameDec = fullNameDec.split(" ")[0];
      const declineDisplayText = comment?.trim()
        ? `Empfehlung abgelehnt.\n\nBegründung: ${comment.trim()}`
        : "Empfehlung abgelehnt.";
      const declineClickupComment = `${fullNameDec} (via Client Portal):\n\n${declineDisplayText}`;

      const threadResDec = await resolveActivePublicThread(taskId, clickupApiToken, log);
      const declineEndpoint = threadResDec.rootId
        ? `https://api.clickup.com/api/v2/comment/${threadResDec.rootId}/reply`
        : `https://api.clickup.com/api/v2/task/${taskId}/comment`;

      const declineCommentResp = await fetchWithRetry(declineEndpoint, {
        method: "POST",
        headers: { Authorization: clickupApiToken, "Content-Type": "application/json" },
        body: JSON.stringify({ comment_text: declineClickupComment, notify_all: false }),
      }, 2, log);

      if (declineCommentResp.ok) {
        const declineCommentData = await declineCommentResp.json();
        log.info("Auto-comment posted for recommendation decline");
        await supabaseAdminDec
          .from("comment_cache")
          .upsert({
            clickup_comment_id: declineCommentData.id,
            task_id: taskId,
            profile_id: userId,
            comment_text: declineClickupComment,
            display_text: declineDisplayText,
            author_id: 0,
            author_name: firstNameDec,
            author_email: userEmail,
            author_avatar: null,
            clickup_created_at: new Date().toISOString(),
            last_synced: new Date().toISOString(),
            is_from_portal: true,
          }, { onConflict: "clickup_comment_id,profile_id" });
      } else {
        await declineCommentResp.text();
        log.error("Failed to post auto-comment for recommendation decline", { status: declineCommentResp.status });
      }
    }

    // Auto-comment + atomic credit UPSERT for approve_credits action
    if (action === "approve_credits") {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey!);

      // Read credits + approved_credits from task_cache
      const { data: taskCacheRow } = await supabaseAdmin
        .from("task_cache")
        .select("credits, approved_credits, name")
        .eq("clickup_id", taskId)
        .eq("profile_id", userId)
        .limit(1)
        .maybeSingle();

      const credits = taskCacheRow?.credits ?? 0;
      const previousApproved: number | null = taskCacheRow?.approved_credits ?? null;

      // Resolve user profile (name + organization_id for credit transaction)
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, organization_id")
        .eq("id", userId)
        .maybeSingle();

      const fullName = profile?.full_name || userEmail?.split("@")[0] || "Client";
      const firstName = fullName.split(" ")[0];
      const orgId: string | null = profile?.organization_id ?? null;

      // Branch auto-comment text based on whether this is a re-approval
      const isReApproval = previousApproved !== null && previousApproved !== credits;
      const autoCommentText = isReApproval
        ? `Kostenfreigabe aktualisiert (${previousApproved} \u2192 ${credits} Credits)`
        : `Kostenfreigabe erteilt (${credits} Credits)`;
      const clickupAutoComment = `${fullName} (via Client Portal):\n\n${autoCommentText}`;

      const threadResolution = await resolveActivePublicThread(taskId, clickupApiToken, log);
      const autoEndpoint = threadResolution.rootId
        ? `https://api.clickup.com/api/v2/comment/${threadResolution.rootId}/reply`
        : `https://api.clickup.com/api/v2/task/${taskId}/comment`;

      const autoCommentResp = await fetchWithRetry(autoEndpoint, {
        method: "POST",
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment_text: clickupAutoComment,
          notify_all: false,
        }),
      }, 2, log);

      if (autoCommentResp.ok) {
        const autoCommentData = await autoCommentResp.json();
        log.info("Auto-comment posted for credit approval", { isReApproval });

        await supabaseAdmin
          .from("comment_cache")
          .upsert({
            clickup_comment_id: autoCommentData.id,
            task_id: taskId,
            profile_id: userId,
            comment_text: clickupAutoComment,
            display_text: autoCommentText,
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
      } else {
        await autoCommentResp.text();
        log.error("Failed to post auto-comment for credit approval", { status: autoCommentResp.status });
      }

      // Atomic credit UPSERT via RPC: credits can be 0 (re-approval at zero = full refund);
      // block only null/negative. Uses upsert_task_deduction() which targets the partial
      // unique index credit_transactions_task_deduction_unique
      // ON (task_id, type) WHERE type = 'task_deduction'.
      // The Supabase JS SDK .upsert() cannot pass the WHERE clause for partial indexes,
      // so we use a SECURITY DEFINER RPC (service_role only).
      if (credits != null && credits >= 0) {
        const { error: upsertError } = await supabaseAdmin.rpc('upsert_task_deduction', {
          p_profile_id: userId,
          p_organization_id: orgId,
          p_amount: -credits,
          p_task_id: taskId,
          p_task_name: taskCacheRow?.name ?? null,
          p_description: isReApproval
            ? `${credits} Credits \u2014 korrigiert von ${previousApproved} Credits`
            : `${credits} Credits \u2014 Kostenfreigabe erteilt`,
        });

        if (upsertError) {
          log.error("Credit upsert failed", { taskId, error: upsertError.message });
        } else {
          log.info("Credit upsert succeeded", { taskId, amount: -credits, isReApproval });
        }

        // Mirror approved amount onto task_cache so UI can show re-approval state
        const { error: cacheUpdateError } = await supabaseAdmin
          .from("task_cache")
          .update({ approved_credits: credits })
          .eq("clickup_id", taskId);

        if (cacheUpdateError) {
          log.error("Failed to update task_cache.approved_credits", { taskId, error: cacheUpdateError.message });
        }
      }
    }

    if (comment && typeof comment === 'string' && comment.trim() && action !== 'decline_recommendation') {
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
    const cacheUpdate: Record<string, unknown> = {
      status: matchedStatus.status,
      status_color: matchedStatus.color || updatedTask.status?.color,
      last_synced: now,
    };
    if (action === "accept_recommendation" && dueDate) {
      cacheUpdate.due_date = new Date(dueDate).toISOString();
    }
    await supabase
      .from("task_cache")
      .update(cacheUpdate)
      .eq("clickup_id", taskId)
      .eq("profile_id", userId);

    // Belt-and-suspenders: clear recommendation tag from task_cache immediately
    // so React Query refetch doesn't resurrect the approval block before webhook fires
    if (action === "decline_recommendation" || action === "accept_recommendation") {
      const { data: cachedTask } = await supabase
        .from("task_cache")
        .select("tags")
        .eq("clickup_id", taskId)
        .eq("profile_id", userId)
        .maybeSingle();

      if (cachedTask?.tags && Array.isArray(cachedTask.tags)) {
        const filteredTags = (cachedTask.tags as Array<{ name: string }>)
          .filter((t) => t.name.toLowerCase() !== "recommendation");
        await supabase
          .from("task_cache")
          .update({ tags: filteredTags })
          .eq("clickup_id", taskId)
          .eq("profile_id", userId);
        log.info("Cleared recommendation tag from task_cache");
      }
    }

    const ACTION_MESSAGES: Record<string, string> = {
      approve: "Task has been approved",
      request_changes: "Changes have been requested",
      put_on_hold: "Task has been put on hold",
      resume: "Task has been moved to Open",
      cancel: "Task has been cancelled",
      approve_credits: "Credits have been approved",
      accept_recommendation: "Recommendation accepted",
      decline_recommendation: "Recommendation declined",
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
