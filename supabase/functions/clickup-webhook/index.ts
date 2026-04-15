// ============ DEPLOYMENT VERSION ============
// Version: 2026-02-12-v6-profile-fallback
// Feature: Fallback recipient lookup via profiles.clickup_list_ids when task_cache is empty
// =============================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { parseClickUpTimestamp } from "../_shared/utils.ts";
import {
  buildChapterConfigMap,
  isPortalOriginatedComment,
  isPublicCommentThreadRoot,
  isTaskVisible,
  resolveClientFacingCommentEvent,
  resolveTaskChapterConfigId,
} from "../_shared/clickup-contract.ts";
import { slugify, buildChapterFolder } from "../_shared/slugify.ts";
import { findOrgByListId, findOrgBySupportTaskId, getNonViewerProfileIds } from "../_shared/org.ts";

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

/**
 * Best-effort Nextcloud folder creation via WebDAV MKCOL.
 * Silently fails if env vars are missing or MKCOL errors.
 * Creates parent directories recursively by calling MKCOL on each path segment.
 */
async function createNextcloudFolder(fullPath: string, log: ReturnType<typeof createLogger>): Promise<void> {
  const ncUrl = Deno.env.get("NEXTCLOUD_URL");
  const ncUser = Deno.env.get("NEXTCLOUD_USER");
  const ncPass = Deno.env.get("NEXTCLOUD_PASS");

  if (!ncUrl || !ncUser || !ncPass) {
    log.warn("Nextcloud env vars not configured — skipping folder creation", { fullPath });
    return;
  }

  const segments = fullPath.split("/").filter(Boolean);
  let currentPath = "";

  for (const segment of segments) {
    currentPath += `/${segment}`;
    const mkcolUrl = `${ncUrl}/remote.php/dav/files/${ncUser}${currentPath}`;
    try {
      const resp = await fetchWithTimeout(mkcolUrl, {
        method: "MKCOL",
        headers: {
          Authorization: `Basic ${btoa(`${ncUser}:${ncPass}`)}`,
        },
      }, 5000);
      // 201 = created, 405 = already exists (both OK)
      if (resp.status !== 201 && resp.status !== 405) {
        log.warn("MKCOL unexpected status", { path: currentPath, status: resp.status });
      }
    } catch (err) {
      log.warn("MKCOL request failed", { path: currentPath, error: String(err) });
      return; // Stop on first failure — parent dirs are needed for children
    }
  }
  log.info("Nextcloud folder created", { fullPath });
}

interface ClickUpWebhookPayload {
  event: string;
  webhook_id: string;
  history_items?: Array<{
    id: string;
    type: number;
    date: string;
    field: string;
    parent_id: string;
    data: Record<string, unknown>;
    source: string | null;
    user: {
      id: number;
      username: string;
      email: string;
      profilePicture?: string;
    };
    before?: {
      status?: string;
      color?: string;
    };
    after?: {
      status?: string;
      color?: string;
    };
    comment?: {
      id: string;
      text_content: string;
      user: {
        id: number;
        username: string;
        email: string;
        profilePicture?: string;
      };
    };
  }>;
  task_id?: string;
  tag_name?: string;
}

// Rate limiting
const recentWebhooks = new Map<string, number[]>();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 100;

function checkRateLimit(webhookId: string): boolean {
  const now = Date.now();
  const timestamps = recentWebhooks.get(webhookId) || [];
  const recentTimestamps = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  
  if (recentTimestamps.length >= RATE_LIMIT_MAX) {
    return false;
  }
  
  recentTimestamps.push(now);
  recentWebhooks.set(webhookId, recentTimestamps);
  return true;
}

function isValidTaskId(taskId: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(taskId) && taskId.length <= 50;
}

function sanitizeCommentText(text: string): string {
  return text.substring(0, 10000);
}

// Map email types to notification_preferences JSONB keys.
// Falls back to email_notifications boolean for backward compat.
const EMAIL_TYPE_TO_PREF_KEY: Record<string, string> = {
  // Task notifications — unchanged
  task_review: "task_review",
  task_completed: "task_completed",
  team_question: "team_comment",
  support_response: "support_response",
  credit_approval: "task_review",
  new_recommendation: "new_recommendation",
  // Project notifications — own preference keys (decoupled from task keys)
  step_ready: "project_task_ready",
  step_completed: "project_step_completed",
  project_reply: "project_messages",
};

function shouldSendEmail(
  profile: { email_notifications?: boolean; notification_preferences?: Record<string, boolean> | null },
  emailType: string,
): boolean {
  const prefKey = EMAIL_TYPE_TO_PREF_KEY[emailType];
  const prefs = profile.notification_preferences;

  // If granular preferences exist, use them
  if (prefs && typeof prefs === "object" && prefKey && prefKey in prefs) {
    return !!prefs[prefKey];
  }

  // Backward compat: fall back to boolean email_notifications
  return profile.email_notifications !== false;
}

async function verifyWebhookSignature(
  body: string, 
  signature: string | null, 
  secret: string
): Promise<boolean> {
  if (!signature) return false;
  
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signatureBytes = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(body)
    );
    
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    if (signature.length !== expectedSignature.length) return false;
    
    let result = 0;
    for (let i = 0; i < signature.length; i++) {
      result |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }
    return result === 0;
  } catch {
    return false;
  }
}

// Send email via Mailjet
async function sendMailjetEmail(
  type: string,
  to: { email: string; name?: string },
  data: Record<string, unknown>,
  log: ReturnType<typeof createLogger>
): Promise<boolean> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  
  if (!supabaseUrl || !supabaseServiceKey) {
    log.error("Missing Supabase config for email");
    return false;
  }

  try {
    const response = await fetchWithTimeout(`${supabaseUrl}/functions/v1/send-mailjet-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        type,
        to,
        data,
      }),
    });

    if (response.ok) {
      log.info(`Email sent`, { type });
      return true;
    } else {
      const error = await response.text();
      log.error(`Email send failed`, { type, error });
      return false;
    }
  } catch (error) {
    log.error("Email send error", { error: String(error) });
    return false;
  }
}

// Check if status indicates "Client Review" (not Internal Review)
function isReviewStatus(status: string): boolean {
  const statusLower = status.toLowerCase();
  return statusLower === "client review";
}

// Check if status indicates "Done / Completed"
function isDoneStatus(status: string): boolean {
  const statusLower = status.toLowerCase();
  return statusLower.includes("done") || statusLower.includes("complete") || statusLower.includes("closed") || statusLower.includes("approved");
}

// Check if status indicates "Awaiting Approval" (credit approval needed)
function isAwaitingApprovalStatus(status: string): boolean {
  const statusLower = status.toLowerCase();
  return statusLower === "awaiting approval";
}

// Check if status indicates "In Progress"
function isInProgressStatus(status: string): boolean {
  const statusLower = status.toLowerCase();
  return statusLower === "in progress" || statusLower === "in_progress";
}

/**
 * Update task activity timestamp for ALL cached entries of this task.
 */
async function updateTaskActivity(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  activityTimestamp: Date,
  log: ReturnType<typeof createLogger>
): Promise<void> {
  try {
    const { error, count } = await supabase
      .from("task_cache")
      .update({ last_activity_at: activityTimestamp.toISOString() })
      .eq("clickup_id", taskId)
      .select("clickup_id", { count: "exact" });
    
    if (error) {
      log.warn("Failed to update task activity", { taskId, error: error.message });
    } else {
      log.debug("Task activity updated", { taskId, rowsAffected: count ?? 0 });
    }
  } catch (error) {
    log.error("Error updating task activity", { taskId, error: String(error) });
  }
}

// Fetch task details to check visibility before sending notifications
async function fetchTaskForVisibilityCheck(
  taskId: string,
  clickupApiToken: string,
  log: ReturnType<typeof createLogger>
): Promise<{ visible: boolean; name: string; listId: string | null; tags?: Array<{ name: string }> } | null> {
  try {
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
      log.warn(`Failed to fetch task for visibility check`, { taskId, status: response.status });
      return null;
    }
    const task = await response.json();
    const visibleFieldId = Deno.env.get("CLICKUP_VISIBLE_FIELD_ID") || "";
    return {
      visible: isTaskVisible(task.custom_fields, visibleFieldId),
      name: task.name || "Task",
      listId: task.list?.id || null,
      tags: task.tags || [],
    };
  } catch (error) {
    log.error(`Error fetching task for visibility check`, { taskId, error: String(error) });
    return null;
  }
}

type ProfileResolutionSource = "org_members" | "task_cache" | "list_fallback" | "none" | "ambiguous_fallback";

interface ProfileResolutionResult {
  profileIds: string[];
  source: ProfileResolutionSource;
}

/**
 * Find profile IDs that should receive notifications for a given task.
 * 1. Try org_members first (primary — org-first resolution via findOrgByListId).
 * 2. Try task_cache fallback (fast, exact match).
 * 3. Fallback to list ownership only when it resolves to a single recipient.
 */
async function findProfilesForTask(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  listId: string | null,
  log: ReturnType<typeof createLogger>
): Promise<ProfileResolutionResult> {
  // Step 1 (NEW): org_members primary lookup
  if (listId) {
    const orgResult = await findOrgByListId(supabase, listId);
    if (orgResult && orgResult.profileIds.length > 0) {
      log.info("Profiles resolved via org_members", {
        taskId,
        count: orgResult.profileIds.length,
      });
      return { profileIds: orgResult.profileIds, source: "org_members" };
    }
  }

  // Step 2 (existing): task_cache fallback
  const { data: cacheEntries } = await supabase
    .from("task_cache")
    .select("profile_id")
    .eq("clickup_id", taskId);

  if (cacheEntries && cacheEntries.length > 0) {
    const ids = Array.from(new Set(cacheEntries.map((e: { profile_id: string }) => e.profile_id)));
    log.info("Profiles resolved via task_cache", { taskId, count: ids.length });
    return { profileIds: ids, source: "task_cache" };
  }

  if (!listId) {
    log.warn("No task_cache entries and no listId for fallback", { taskId });
    return { profileIds: [], source: "none" };
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .contains("clickup_list_ids", [listId]);

  const ids = Array.from(new Set((profiles || []).map((p: { id: string }) => p.id)));

  if (ids.length === 1) {
    log.info("Profile resolved via single-recipient list fallback", { taskId, listId });
    return { profileIds: ids, source: "list_fallback" };
  }

  if (ids.length > 1) {
    log.warn("Ambiguous list fallback - dropping notification recipient resolution", {
      taskId,
      listId,
      count: ids.length,
    });
    return { profileIds: [], source: "ambiguous_fallback" };
  }

  log.warn("No profiles found for task", { taskId, listId });
  return { profileIds: [], source: "none" };
}

// ---- TRIAGE: handleTaskCreated — invokes triage-agent fire-and-forget for monitored lists ----
async function handleTaskCreated(
  payload: { task_id?: string; task_name?: string; history_items?: unknown[] },
  supabase: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>
): Promise<void> {
  const taskId = payload.task_id;
  if (!taskId) {
    log.warn("taskCreated payload missing task_id — skipping triage");
    return;
  }

  // Check if list is monitored
  const enabledListIdsRaw = Deno.env.get("TRIAGE_ENABLED_LIST_IDS") ?? "";
  const enabledListIds = enabledListIdsRaw.split(",").map(s => s.trim()).filter(Boolean);
  if (enabledListIds.length === 0) {
    log.debug("TRIAGE_ENABLED_LIST_IDS not configured — skipping triage");
    return;
  }

  // Fetch task details from ClickUp to get list_id, task_name, description
  // (taskCreated webhook payload does NOT reliably include these fields)
  const clickupToken = Deno.env.get("CLICKUP_API_TOKEN");
  if (!clickupToken) {
    log.warn("CLICKUP_API_TOKEN not set — cannot fetch task for triage");
    return;
  }

  const taskResp = await fetchWithTimeout(
    `https://api.clickup.com/api/v2/task/${taskId}`,
    { headers: { Authorization: clickupToken, "Content-Type": "application/json" } },
    10000
  );
  if (!taskResp.ok) {
    log.warn("Failed to fetch task details for triage", { taskId, status: taskResp.status });
    return;
  }

  const task = await taskResp.json();
  const listId: string = task.list?.id ?? "";
  const listName: string = task.list?.name ?? "";
  const taskName: string = task.name ?? "";
  const description: string = task.description ?? "";

  if (!enabledListIds.includes(listId)) {
    log.debug("Task list not in TRIAGE_ENABLED_LIST_IDS — skipping triage", { listId });
    return;
  }

  // Look up profile_id from task_cache (may not exist yet for very new tasks)
  const { data: cachedTask } = await supabase
    .from("task_cache")
    .select("profile_id")
    .eq("clickup_id", taskId)
    .maybeSingle();
  const profileId: string | null = cachedTask?.profile_id ?? null;

  log.info("Invoking triage-agent for new task", { taskId, listId, listName });

  // Fire-and-forget — do NOT await, must not block webhook 200 response
  supabase.functions.invoke("triage-agent", {
    body: {
      clickup_task_id: taskId,
      clickup_task_name: taskName,
      description,
      list_id: listId,
      list_name: listName,
      profile_id: profileId,
    },
  }).catch((err: Error) => log.error("triage-agent invocation failed", { error: err.message }));
}

// ---- TRIAGE: handleTriageHitl — detects [approve]/[reject] developer responses in comments ----
async function handleTriageHitl(
  payload: { task_id?: string; history_items?: Array<{ comment?: { text_content?: string }; text?: string }> },
  supabase: ReturnType<typeof createClient>,
  log: ReturnType<typeof createLogger>
): Promise<void> {
  const taskId = payload.task_id;
  if (!taskId) return;

  // Extract comment text from webhook payload
  const historyItem = payload.history_items?.[0];
  const rawText = (historyItem?.comment?.text_content ?? historyItem?.text ?? "").trim();
  if (!rawText) return;

  // Pattern matching (case-insensitive, anchored)
  const approveSimple = /^\[approve\]$/i.test(rawText);
  const approveDetailed = /^\[approve:\s*(\d+(?:\.\d+)?)h\s+(\d+(?:\.\d+)?)cr\]$/i.exec(rawText);
  const rejectMatch = /^\[reject:\s*(.+)\]$/i.exec(rawText);

  if (!approveSimple && !approveDetailed && !rejectMatch) {
    return; // Not a HITL command — ignore silently
  }

  // Find most recent awaiting_hitl job for this task
  const { data: job } = await supabase
    .from("agent_jobs")
    .select("id")
    .eq("clickup_task_id", taskId)
    .eq("status", "awaiting_hitl")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!job) {
    log.warn("HITL comment received but no awaiting_hitl job found", { taskId, rawText });
    return;
  }

  // Build update payload
  let updatePayload: Record<string, unknown>;
  if (approveSimple) {
    updatePayload = { status: "approved", hitl_action: "approved", hitl_at: new Date().toISOString() };
  } else if (approveDetailed) {
    updatePayload = {
      status: "approved",
      hitl_action: "approved",
      hitl_hours: parseFloat(approveDetailed[1]),
      hitl_credits: parseFloat(approveDetailed[2]),
      hitl_at: new Date().toISOString(),
    };
  } else {
    // rejectMatch
    updatePayload = {
      status: "rejected",
      hitl_action: "rejected",
      hitl_comment: rejectMatch![1].trim(),
      hitl_at: new Date().toISOString(),
    };
  }

  const { error: updateErr } = await supabase
    .from("agent_jobs")
    .update(updatePayload)
    .eq("id", job.id);

  if (updateErr) {
    log.error("Failed to update agent_jobs for HITL", { error: updateErr.message, jobId: job.id });
  } else {
    log.info("HITL action recorded", { jobId: job.id, action: updatePayload.hitl_action, taskId });
  }
}

// Check thread context for a comment: is it a reply? If so, is the parent thread client-facing?
async function checkCommentThreadContext(
  taskId: string,
  newCommentId: string,
  clickupApiToken: string,
  log: ReturnType<typeof createLogger>
): Promise<{ isReply: boolean; isClientFacingThread: boolean }> {
  const maxAttempts = 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Delay to allow ClickUp to index the new reply before fetching
    const delayMs = attempt === 0 ? 1500 : 2000;
    log.debug(`Thread check: waiting ${delayMs}ms before attempt ${attempt + 1}`);
    await new Promise(resolve => setTimeout(resolve, delayMs));

    try {
      log.debug(`Checking comment thread context`, { taskId, commentId: newCommentId, attempt: attempt + 1 });

      // Fetch all task comments
      const response = await fetchWithTimeout(
        `https://api.clickup.com/api/v2/task/${taskId}/comment`,
        {
          headers: {
            Authorization: clickupApiToken,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        log.warn(`Failed to fetch task comments for thread check`, { status: response.status, attempt: attempt + 1 });
        continue; // retry on next attempt
      }

      const data = await response.json();
      const comments = data.comments || [];

      // Shared client-facing comment contract

      const commentsWithReplies = comments.filter((c: any) => (c.reply_count || 0) > 0);

      log.debug(`Thread check diagnostics`, {
        attempt: attempt + 1,
        totalComments: comments.length,
        commentsWithReplies: commentsWithReplies.length,
        parentSnippets: commentsWithReplies.map((c: any) => ({
          id: c.id,
          replyCount: c.reply_count,
          textSnippet: (c.comment_text || "").substring(0, 50),
        })),
      });

      // For each top-level comment with replies, check if our comment is in the thread
      for (const comment of commentsWithReplies) {
        log.debug(`Checking replies for comment`, { commentId: comment.id, replyCount: comment.reply_count });

        // Fetch replies to this comment
        const repliesResponse = await fetchWithTimeout(
          `https://api.clickup.com/api/v2/comment/${comment.id}/reply`,
          {
            headers: {
              Authorization: clickupApiToken,
              "Content-Type": "application/json",
            },
          }
        );

        if (repliesResponse.ok) {
          const repliesData = await repliesResponse.json();
          const replies = repliesData.comments || [];

          log.debug(`Replies fetched for parent`, {
            parentId: comment.id,
            replyIds: replies.map((r: any) => r.id),
            searchingFor: newCommentId,
            found: replies.some((r: any) => r.id === newCommentId),
          });

          // Check if our new comment is in the replies
          if (replies.some((r: any) => r.id === newCommentId)) {
            const parentText = comment.comment_text || "";
            const isClientFacing = isPublicCommentThreadRoot(parentText);
            log.info(`Comment is a reply`, {
              commentId: newCommentId,
              parentCommentId: comment.id,
              isClientFacingThread: isClientFacing,
              attempt: attempt + 1,
            });
            return { isReply: true, isClientFacingThread: isClientFacing };
          }
        }
      }

      // Comment not found in any thread on this attempt
      if (attempt < maxAttempts - 1) {
        log.info(`Comment not found in any thread on attempt ${attempt + 1}, will retry`, { commentId: newCommentId });
      }
    } catch (error) {
      log.error("Error in thread check attempt", { error: String(error), attempt: attempt + 1 });
    }
  }

  // Not found after all retries — treat as top-level
  log.warn(`Comment not found in any thread after ${maxAttempts} attempts — treating as top-level`, { commentId: newCommentId });
  return { isReply: false, isClientFacingThread: false };
}

Deno.serve(async (req) => {
  // Generate unique request ID for tracing
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('clickup-webhook', requestId);
  
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // GET endpoint for availability check
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ 
        status: "ok", 
        version: "2026-02-08-v5-simplified",
        timestamp: new Date().toISOString() 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    log.info("Webhook request received", { method: req.method });
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clickupWebhookSecret = Deno.env.get("CLICKUP_WEBHOOK_SECRET");

    if (!supabaseUrl || !supabaseServiceKey) {
      log.error("Missing required server configuration");
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const bodyText = await req.text();
    
    // Verify signature if configured
    if (clickupWebhookSecret) {
      const signature = req.headers.get("X-Signature");
      const isValid = await verifyWebhookSignature(bodyText, signature, clickupWebhookSecret);
      
      if (!isValid) {
        log.error("Invalid webhook signature");
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      log.debug("Webhook signature verified");
    }
    
    const payload: ClickUpWebhookPayload = JSON.parse(bodyText);
    log.info("Webhook event parsed", { event: payload.event, webhookId: payload.webhook_id });

    if (!checkRateLimit(payload.webhook_id)) {
      log.error("Rate limit exceeded for webhook");
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const historyItem = payload.history_items?.[0];
    const taskId = payload.task_id || historyItem?.parent_id;

    // ============ PROJECT ROUTING ============
    // Check if this task belongs to a project (via project_task_cache or list_id → project_config)
    // If yes, route to project-specific handlers; otherwise fall through to ticket handlers
    if (taskId && isValidTaskId(taskId)) {
      let routeContext: "ticket" | "project" = "ticket";
      let projectConfigId: string | null = null;

      // Try project_task_cache first (fast, exact)
      const { data: existingProjectTask } = await supabase
        .from("project_task_cache")
        .select("project_config_id, chapter_config_id")
        .eq("clickup_id", taskId)
        .limit(1);

      if (existingProjectTask && existingProjectTask.length > 0) {
        routeContext = "project";
        projectConfigId = existingProjectTask[0].project_config_id;
      } else {
        // Fallback: fetch task list_id → check project_config
        const clickupApiTokenForRouting = Deno.env.get("CLICKUP_API_TOKEN");
        if (clickupApiTokenForRouting) {
          const taskInfoForRouting = await fetchTaskForVisibilityCheck(taskId, clickupApiTokenForRouting, log);
          if (taskInfoForRouting?.listId) {
            const { data: projectConfig } = await supabase
              .from("project_config")
              .select("id")
              .eq("clickup_list_id", taskInfoForRouting.listId)
              .eq("is_active", true)
              .limit(1);

            if (projectConfig && projectConfig.length > 0) {
              routeContext = "project";
              projectConfigId = projectConfig[0].id;
            }
          }
        }
      }

      if (routeContext === "project" && projectConfigId) {
        log.info("Routing to project handler", { taskId, projectConfigId, event: payload.event });

        // chapter_config_id from the initial cache lookup (null if task routed via fallback path)
        const chapterConfigId: string | null = existingProjectTask?.[0]?.chapter_config_id ?? null;

        // Helper: get all profile IDs with access to this project
        async function getProjectProfileIds(): Promise<string[]> {
          const { data: rows } = await supabase
            .from("project_access")
            .select("profile_id")
            .eq("project_config_id", projectConfigId!);
          return (rows || []).map((r: { profile_id: string }) => r.profile_id);
        }

        // Helper: get step name from cache
        async function getStepName(): Promise<string> {
          const { data: rows } = await supabase
            .from("project_task_cache")
            .select("name")
            .eq("clickup_id", taskId!)
            .limit(1);
          return rows?.[0]?.name || "Schritt";
        }

        async function getProjectChapterConfigId(taskData: { custom_fields?: Array<{ id: string; value?: unknown; type_config?: { options?: Array<{ id: string; orderindex?: number | string }> } }>; }): Promise<string | null> {
          const { data: projectConfigRows } = await supabase
            .from("project_config")
            .select("clickup_phase_field_id")
            .eq("id", projectConfigId!)
            .limit(1);

          const phaseFieldId = projectConfigRows?.[0]?.clickup_phase_field_id;
          if (!phaseFieldId) {
            return null;
          }

          const { data: chapterRows } = await supabase
            .from("chapter_config")
            .select("id, clickup_cf_option_id")
            .eq("project_config_id", projectConfigId!)
            .eq("is_active", true);

          return resolveTaskChapterConfigId(
            taskData.custom_fields,
            phaseFieldId,
            buildChapterConfigMap(chapterRows || []),
          );
        }

        // ---- PROJECT: taskStatusUpdated ----
        if (payload.event === "taskStatusUpdated" && historyItem) {
          const statusAfter = historyItem.after?.status;
          if (statusAfter) {
            const eventTimestamp = parseClickUpTimestamp(historyItem.date);
            await supabase.from("project_task_cache").update({
              status: statusAfter,
              status_color: historyItem.after?.color || null,
              last_activity_at: eventTimestamp.toISOString(),
              last_synced: new Date().toISOString(),
            }).eq("clickup_id", taskId);

            const profileIds = await getProjectProfileIds();
            if (profileIds.length > 0) {
              const stepName = await getStepName();
              const statusLower = statusAfter.toLowerCase();
              const isClientReview = statusLower === "client review";
              const isComplete = isDoneStatus(statusAfter);
              const isWorkStarted = isInProgressStatus(statusAfter);
              const statusBefore = historyItem.before?.status || "";
              const notifType = "status_change";

              // --- CLIENT REVIEW: bell + step_ready email ---
              if (isClientReview) {
                const notifications = profileIds.map(pid => ({
                  profile_id: pid,
                  type: notifType,
                  title: `${stepName} ist bereit für Ihre Prüfung`,
                  message: `Ihr Schritt „${stepName}" wartet auf Ihre Prüfung.`,
                  task_id: taskId,
                  project_config_id: projectConfigId,
                  clickup_task_id: taskId,
                  is_read: false,
                }));
                await supabase.from("notifications").insert(notifications);
                log.info("Project step_ready notifications created", { count: notifications.length });

                const nonViewerProfileIds = await getNonViewerProfileIds(supabase, profileIds);
                if (nonViewerProfileIds.length < profileIds.length) {
                  log.info("step_ready email filtered to non-viewers", {
                    total: profileIds.length,
                    sending: nonViewerProfileIds.length,
                  });
                }
                const { data: profiles } = await supabase
                  .from("profiles")
                  .select("id, email, full_name, email_notifications, notification_preferences")
                  .in("id", nonViewerProfileIds);
                for (const p of profiles || []) {
                  if (shouldSendEmail(p, "step_ready")) {
                    await sendMailjetEmail("step_ready", { email: p.email, name: p.full_name }, {
                      firstName: p.full_name?.split(" ")[0], stepName, taskId, projectConfigId: projectConfigId ?? undefined,
                    }, log);
                  }
                }
              }

              // --- COMPLETION: bell + task_completed email (deduplicated) ---
              else if (isComplete) {
                // Deduplicate: check if completion notification already exists
                const { data: existingNotif } = await supabase
                  .from("notifications")
                  .select("id")
                  .eq("task_id", taskId)
                  .eq("type", "status_change")
                  .ilike("title", "%abgeschlossen%")
                  .not("project_config_id", "is", null)
                  .limit(1);

                if (existingNotif && existingNotif.length > 0) {
                  log.info("Project completion notification already sent, skipping", { taskId });
                } else {
                  const notifications = profileIds.map(pid => ({
                    profile_id: pid,
                    type: notifType,
                    title: `${stepName} ist abgeschlossen`,
                    message: `Ihr Projektschritt „${stepName}" wurde erfolgreich abgeschlossen.`,
                    task_id: taskId,
                    project_config_id: projectConfigId,
                    clickup_task_id: taskId,
                    is_read: false,
                  }));
                  await supabase.from("notifications").insert(notifications);
                  log.info("Project completion notifications created", { count: notifications.length });

                  const { data: profiles } = await supabase
                    .from("profiles")
                    .select("id, email, full_name, email_notifications, notification_preferences")
                    .in("id", profileIds);
                  for (const p of profiles || []) {
                    if (shouldSendEmail(p, "task_completed")) {
                      await sendMailjetEmail("task_completed", { email: p.email, name: p.full_name }, {
                        firstName: p.full_name?.split(" ")[0], taskName: stepName, taskId,
                      }, log);
                    }
                  }

                  // Chapter completion check: if all tasks in same chapter are done, fire chapter-level notification
                  if (chapterConfigId) {
                    const { data: chapterTasks } = await supabase
                      .from("project_task_cache")
                      .select("id, status")
                      .eq("chapter_config_id", chapterConfigId)
                      .eq("is_visible", true);

                    const allDone = chapterTasks && chapterTasks.length > 0 &&
                      chapterTasks.every((t: { id: string; status: string | null }) => {
                        const s = (t.status || "").toLowerCase();
                        return s.includes("done") || s.includes("complete") || s.includes("closed") || s.includes("approved");
                      });

                    if (allDone) {
                      // Deduplication: check if project_update already sent for this chapter in last 24h
                      const { data: recentNotif } = await supabase
                        .from("notifications")
                        .select("id")
                        .eq("type", "project_update")
                        .in("profile_id", profileIds)
                        .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
                        .eq("task_id", taskId)
                        .limit(1);

                      if (!recentNotif || recentNotif.length === 0) {
                        // Get chapter name
                        const { data: chapter } = await supabase
                          .from("chapter_config")
                          .select("title")
                          .eq("id", chapterConfigId)
                          .single();
                        const chapterName = chapter?.title || stepName;

                        // Bell notification for chapter completion
                        const chapterNotifs = profileIds.map((pid: string) => ({
                          profile_id: pid,
                          type: "project_update",
                          title: `Schritt abgeschlossen: ${chapterName}`,
                          message: `Alle Aufgaben in „${chapterName}" wurden abgeschlossen.`,
                          task_id: taskId,
                          is_read: false,
                        }));
                        await supabase.from("notifications").insert(chapterNotifs);
                        log.info("Chapter completion notifications created", { chapterName, count: chapterNotifs.length });

                        // Chapter completion email
                        const { data: profilesForEmail } = await supabase
                          .from("profiles")
                          .select("id, email, full_name, email_notifications, notification_preferences")
                          .in("id", profileIds);
                        for (const p of profilesForEmail || []) {
                          if (shouldSendEmail(p, "step_completed")) {
                            await sendMailjetEmail("step_completed", { email: p.email, name: p.full_name }, {
                              firstName: p.full_name?.split(" ")[0], chapterName, taskId, projectConfigId: projectConfigId ?? undefined,
                            }, log);
                          }
                        }
                      }
                    }
                  }
                }
              }

              // --- WORK STARTED: bell only, no email (deduplicated) ---
              else if (isWorkStarted && !isInProgressStatus(statusBefore)) {
                // Deduplicate: check if work-started notification already exists
                const { data: existingStarted } = await supabase
                  .from("notifications")
                  .select("id")
                  .eq("task_id", taskId)
                  .eq("type", "status_change")
                  .ilike("title", "%begonnen%")
                  .not("project_config_id", "is", null)
                  .limit(1);

                if (existingStarted && existingStarted.length > 0) {
                  log.info("Project work-started notification already sent, skipping", { taskId });
                } else {
                  const notifications = profileIds.map(pid => ({
                    profile_id: pid,
                    type: notifType,
                    title: `Arbeit an ${stepName} hat begonnen`,
                    message: `Die Arbeit an Ihrem Projektschritt „${stepName}" hat begonnen.`,
                    task_id: taskId,
                    project_config_id: projectConfigId,
                    clickup_task_id: taskId,
                    is_read: false,
                  }));
                  await supabase.from("notifications").insert(notifications);
                  log.info("Project work-started notifications created", { count: notifications.length });
                }
              }

              // --- Other status changes: generic bell notification ---
              else {
                const notifications = profileIds.map(pid => ({
                  profile_id: pid,
                  type: notifType,
                  title: `Status-Update: ${stepName}`,
                  message: `Der Status von „${stepName}" wurde auf „${statusAfter}" geändert.`,
                  task_id: taskId,
                  project_config_id: projectConfigId,
                  clickup_task_id: taskId,
                  is_read: false,
                }));
                await supabase.from("notifications").insert(notifications);
                log.info("Project status notifications created", { count: notifications.length, status: statusAfter });
              }
            }
          }
          return new Response(JSON.stringify({ success: true, context: "project" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ---- PROJECT: taskCommentPosted ----
        if (payload.event === "taskCommentPosted" && historyItem?.comment?.text_content) {
          const commentText = sanitizeCommentText(historyItem.comment.text_content);
          const commentId = historyItem.comment.id || historyItem.id;

          // Skip portal-originated comments
          if (isPortalOriginatedComment(commentText)) {
            return new Response(JSON.stringify({ message: "Portal comment ignored", context: "project" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          let isThreadedReply = false;
          let isClientFacingThread = false;
          const clickupToken = Deno.env.get("CLICKUP_API_TOKEN");

          if (clickupToken) {
            const threadContext = await checkCommentThreadContext(taskId, commentId, clickupToken, log);
            isThreadedReply = threadContext.isReply;
            isClientFacingThread = threadContext.isClientFacingThread;
          }

          const commentEvent = resolveClientFacingCommentEvent({
            commentText,
            isReply: isThreadedReply,
            isClientFacingThread,
          });

          if (!commentEvent.shouldNotify) {
            return new Response(JSON.stringify({ message: "Internal comment ignored", context: "project" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const displayText = commentEvent.displayText;
          const firstName = historyItem.user.username.split(" ")[0];
          const profileIds = await getProjectProfileIds();
          const stepName = await getStepName();

          // Cache comment for all project users
          for (const pid of profileIds) {
            await supabase.from("comment_cache").upsert({
              clickup_comment_id: commentId, task_id: taskId, profile_id: pid,
              comment_text: commentText, display_text: displayText,
              author_id: historyItem.user.id, author_name: firstName,
              author_email: historyItem.user.email,
              author_avatar: historyItem.user.profilePicture || null,
              clickup_created_at: new Date(parseInt(historyItem.date)).toISOString(),
              last_synced: new Date().toISOString(), is_from_portal: false, attachments: null,
            }, { onConflict: "clickup_comment_id,profile_id" });
          }

          // Notifications + email
          const notifications = profileIds.map(pid => ({
            profile_id: pid, type: "team_reply",
            title: `Neue Nachricht zu ${stepName}`,
            message: `${firstName}: ${displayText.substring(0, 200)}${displayText.length > 200 ? "..." : ""}`,
            task_id: taskId, comment_id: commentId,
            project_config_id: projectConfigId, clickup_task_id: taskId, is_read: false,
          }));
          await supabase.from("notifications").insert(notifications);

          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, email, full_name, email_notifications, notification_preferences")
            .in("id", profileIds);
          for (const p of profiles || []) {
            if (shouldSendEmail(p, "project_reply")) {
              await sendMailjetEmail("project_reply", { email: p.email, name: p.full_name }, {
                firstName: p.full_name?.split(" ")[0], stepName, taskId, projectConfigId: projectConfigId ?? undefined,
                teamMemberName: firstName, messagePreview: displayText.substring(0, 300),
              }, log);
            }
          }

          return new Response(JSON.stringify({ success: true, context: "project" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ---- PROJECT: taskCreated/taskUpdated/taskDeleted ----
        if (["taskCreated", "taskUpdated", "taskDeleted"].includes(payload.event)) {
          if (payload.event === "taskDeleted") {
            await supabase.from("project_task_cache").delete().eq("clickup_id", taskId);
            log.info("Deleted project task from cache", { taskId });
          } else {
            const clickupApiTokenForUpdate = Deno.env.get("CLICKUP_API_TOKEN");
            if (clickupApiTokenForUpdate) {
              const taskDetail = await fetchTaskForVisibilityCheck(taskId, clickupApiTokenForUpdate, log);
              if (taskDetail?.visible) {
                // Re-fetch full task detail for upsert
                const fullTask = await fetchWithTimeout(
                  `https://api.clickup.com/api/v2/task/${taskId}`,
                  { headers: { Authorization: clickupApiTokenForUpdate, "Content-Type": "application/json" } }
                );
                if (fullTask.ok) {
                  const taskData = await fullTask.json();
                  const chapterConfigId = await getProjectChapterConfigId(taskData);
                  await supabase.from("project_task_cache").upsert({
                    clickup_id: taskData.id,
                    project_config_id: projectConfigId,
                    chapter_config_id: chapterConfigId,
                    name: taskData.name,
                    description: taskData.description || "",
                    status: taskData.status.status,
                    status_color: taskData.status.color,
                    due_date: taskData.due_date ? new Date(parseInt(taskData.due_date)).toISOString() : null,
                    assignees: (taskData.assignees || []).map((a: { id: number; username: string; email: string; profilePicture: string | null }) => ({ id: a.id, username: a.username, email: a.email, avatar: a.profilePicture })),
                    raw_data: taskData,
                    is_visible: true,
                    last_synced: new Date().toISOString(),
                    last_activity_at: parseClickUpTimestamp(taskData.date_updated).toISOString(),
                  }, { onConflict: "clickup_id,project_config_id" });
                  log.info("Upserted project task", { taskId, event: payload.event });

                  // Auto-create Nextcloud folder for the new task (D-05, D-06, D-07)
                  if (payload.event === "taskCreated" && chapterConfigId && taskData?.name) {
                    try {
                      const { data: projConfig } = await supabase
                        .from("project_config")
                        .select("nextcloud_root_path")
                        .eq("id", projectConfigId)
                        .single();

                      const rootPath = projConfig?.nextcloud_root_path;
                      if (rootPath) {
                        const { data: chapter } = await supabase
                          .from("chapter_config")
                          .select("sort_order, title")
                          .eq("id", chapterConfigId)
                          .single();

                        if (chapter) {
                          const chapterFolder = buildChapterFolder(chapter.sort_order, chapter.title);
                          const taskFolder = slugify(taskData.name);
                          await createNextcloudFolder(`${rootPath}/${chapterFolder}/${taskFolder}`, log);
                        }
                      }
                    } catch (err) {
                      log.error("Nextcloud folder creation failed (non-fatal)", { error: String(err), taskId });
                    }
                  }
                }
              } else {
                await supabase.from("project_task_cache").delete().eq("clickup_id", taskId);
                log.info("Removed non-visible project task", { taskId });
              }
            }
          }
          return new Response(JSON.stringify({ success: true, context: "project" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // Other project events — acknowledge
        return new Response(JSON.stringify({ message: "Project event ignored" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    // ============ END PROJECT ROUTING — fall through to ticket handlers ============

    // ---- TRIAGE: handleTaskCreated for monitored lists (independent of project/ticket routing) ----
    // Note: project tasks already returned above inside the project routing block.
    // This only runs for non-project tasks (or when projectConfigId check failed).
    if (payload.event === "taskCreated" && taskId && isValidTaskId(taskId)) {
      // Fire-and-forget triage invocation — does not affect webhook response
      await handleTaskCreated(payload, supabase, log);
      return new Response(
        JSON.stringify({ success: true, context: "triage_check" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle task status updates
    if (payload.event === "taskStatusUpdated" && historyItem) {
      const statusAfter = historyItem.after?.status;

      // CRITICAL: Update task_cache status FIRST, before any notification logic.
      // Notification handlers below may early-return (visibility checks, missing tokens, etc.),
      // but the cache must always reflect the latest ClickUp status for Realtime to work.
      if (taskId && isValidTaskId(taskId) && statusAfter) {
        const eventTimestamp = parseClickUpTimestamp(historyItem.date);
        const { error: cacheUpdateError, count } = await supabase
          .from("task_cache")
          .update({
            status: statusAfter,
            status_color: historyItem.after?.color || null,
            last_activity_at: eventTimestamp.toISOString(),
            last_synced: new Date().toISOString(),
          })
          .eq("clickup_id", taskId)
          .select("clickup_id", { count: "exact" });

        if (cacheUpdateError) {
          log.warn("Failed to update task_cache status", { taskId, error: cacheUpdateError.message });
        } else {
          log.info("Updated task_cache status", { taskId, status: statusAfter, color: historyItem.after?.color, rowsAffected: count ?? 0 });
        }
      }

      if (statusAfter && isReviewStatus(statusAfter) && taskId && isValidTaskId(taskId)) {
        log.info(`Task moved to review status`, { taskId, status: statusAfter });
        
        // Check task visibility before sending notifications
        const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");
        if (!clickupApiToken) {
          log.error("Missing CLICKUP_API_TOKEN - cannot check visibility");
          return new Response(
            JSON.stringify({ error: "Service temporarily unavailable" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const taskInfo = await fetchTaskForVisibilityCheck(taskId, clickupApiToken, log);
        
        if (!taskInfo) {
          log.warn(`Could not fetch task for visibility check - skipping notification`, { taskId });
          return new Response(
            JSON.stringify({ success: true, message: "Visibility check failed - notification skipped" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        if (!taskInfo.visible) {
          log.info(`Task is not visible in client portal - skipping notification`, { taskId });
          return new Response(
            JSON.stringify({ success: true, message: "Task not visible - notification skipped" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        log.info(`Task is visible in client portal - proceeding with notification`, { taskId });
        const taskName = taskInfo.name;
        
        // Find portal users for this task (with list_id fallback)
        const { profileIds, source } = await findProfilesForTask(supabase, taskId, taskInfo.listId, log);

        if (profileIds.length > 0) {
          // Create in-app notifications
          const notifications = profileIds.map(profileId => ({
            profile_id: profileId,
            type: "status_change",
            title: `Aufgabe bereit zur Überprüfung`,
            message: `„${taskName}" ist bereit für Ihre Überprüfung.`,
            task_id: taskId,
            is_read: false,
          }));

          await supabase.from("notifications").insert(notifications);
          log.info(`Created status change notifications`, { count: notifications.length, source });

          // Update task activity timestamp
          const eventTimestamp = parseClickUpTimestamp(historyItem.date);
          await updateTaskActivity(supabase, taskId, eventTimestamp, log);

          // Send emails (viewer-role members excluded — they cannot act on review emails)
          const nonViewerProfileIds = await getNonViewerProfileIds(supabase, profileIds);
          if (nonViewerProfileIds.length < profileIds.length) {
            log.info("task_review email filtered to non-viewers", {
              total: profileIds.length,
              sending: nonViewerProfileIds.length,
            });
          }
          const { data: emailProfiles } = await supabase
            .from("profiles")
            .select("id, email, full_name, email_notifications, notification_preferences")
            .in("id", nonViewerProfileIds);
          if (emailProfiles) {
            for (const profile of emailProfiles) {
              if (shouldSendEmail(profile, "task_review")) {
                await sendMailjetEmail("task_review", {
                  email: profile.email,
                  name: profile.full_name,
                }, {
                  firstName: profile.full_name?.split(" ")[0],
                  taskName,
                  taskId,
                }, log);
              }
            }
          }
        }
      }

      // Handle AWAITING APPROVAL status — credit approval needed
      if (statusAfter && isAwaitingApprovalStatus(statusAfter) && taskId && isValidTaskId(taskId)) {
        log.info(`Task moved to awaiting approval`, { taskId, status: statusAfter });

        const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");
        if (clickupApiToken) {
          const taskInfo = await fetchTaskForVisibilityCheck(taskId, clickupApiToken, log);
          if (taskInfo?.visible) {
            const taskName = taskInfo.name;
            const { profileIds } = await findProfilesForTask(supabase, taskId, taskInfo.listId, log);

            if (profileIds.length > 0) {
              // Read credits from task_cache
              let { data: cachedTaskCredits } = await supabase
                .from("task_cache")
                .select("credits")
                .eq("clickup_id", taskId)
                .limit(1)
                .maybeSingle();

              let credits = cachedTaskCredits?.credits ?? 0;

              // BLOCKING 4 fix: If credits are missing from cache, fetch from ClickUp API
              if (!credits || credits <= 0) {
                log.warn("Credits not in cache for AWAITING APPROVAL notification, fetching from ClickUp", { taskId });
                const creditsFieldId = Deno.env.get("CLICKUP_CREDITS_FIELD_ID") || "";
                if (creditsFieldId) {
                  try {
                    const taskDetailResp = await fetchWithTimeout(
                      `https://api.clickup.com/api/v2/task/${taskId}`,
                      {
                        headers: {
                          Authorization: clickupApiToken,
                          "Content-Type": "application/json",
                        },
                      }
                    );
                    if (taskDetailResp.ok) {
                      const taskDetail = await taskDetailResp.json();
                      const creditsField = (taskDetail.custom_fields || []).find(
                        (f: { id: string }) => f.id === creditsFieldId
                      );
                      if (creditsField?.value != null && !isNaN(Number(creditsField.value))) {
                        credits = Number(creditsField.value);
                        log.info("Credits fetched from ClickUp API for notification", { taskId, credits });

                        // Also update cache so subsequent reads are consistent
                        await supabase
                          .from("task_cache")
                          .update({ credits, last_synced: new Date().toISOString() })
                          .eq("clickup_id", taskId);
                      }
                    }
                  } catch (fetchErr) {
                    log.error("Failed to fetch credits from ClickUp for notification", { taskId, error: String(fetchErr) });
                  }
                }

                // If credits are still missing after fetch attempt, skip notification
                if (!credits || credits <= 0) {
                  log.warn("Skipping credit approval notification — credits not available", { taskId });
                  return new Response(
                    JSON.stringify({ success: true, message: "Credits not available, notification skipped" }),
                    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                  );
                }
              }

              const creditsStr = credits > 0 ? ` (${credits} Credits)` : "";

              // Create bell notifications
              const notifications = profileIds.map(profileId => ({
                profile_id: profileId,
                type: "status_change",
                title: `Kostenfreigabe: ${taskName}`,
                message: `Aufgabe "${taskName}" erfordert Ihre Kostenfreigabe${creditsStr}.`,
                task_id: taskId,
                is_read: false,
              }));
              await supabase.from("notifications").insert(notifications);
              log.info("Created awaiting approval notifications", { count: notifications.length });

              // Update task activity
              const eventTimestamp = parseClickUpTimestamp(historyItem.date);
              await updateTaskActivity(supabase, taskId, eventTimestamp, log);

              // Send emails
              const { data: profiles } = await supabase
                .from("profiles")
                .select("id, email, full_name, email_notifications, notification_preferences")
                .in("id", profileIds);

              if (profiles) {
                for (const profile of profiles) {
                  if (shouldSendEmail(profile, "credit_approval")) {
                    await sendMailjetEmail("credit_approval", {
                      email: profile.email,
                      name: profile.full_name,
                    }, {
                      firstName: profile.full_name?.split(" ")[0],
                      taskName,
                      taskId,
                      credits: String(credits),
                    }, log);
                  }
                }
              }
            }
          }
        }
      }

      // Handle task completion notifications (done/completed, not cancelled)
      if (statusAfter && isDoneStatus(statusAfter) && taskId && isValidTaskId(taskId)) {
        log.info(`Task moved to done status`, { taskId, status: statusAfter });

        // Check if we already sent a completion email for this task (prevent duplicates)
        const { data: existingNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("task_id", taskId)
          .eq("type", "status_change")
          .ilike("title", "%abgeschlossen%")
          .limit(1);

        if (existingNotif && existingNotif.length > 0) {
          log.info(`Completion notification already sent for task, skipping`, { taskId });
        } else {
          // Visibility check
          const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");
          let taskName = "your task";
          let isVisible = false;
          let taskListId: string | null = null;

          if (clickupApiToken) {
            const taskInfo = await fetchTaskForVisibilityCheck(taskId, clickupApiToken, log);
            if (taskInfo) {
              isVisible = taskInfo.visible;
              taskName = taskInfo.name;
              taskListId = taskInfo.listId;
            }
          }

          if (isVisible) {
            // Find portal users for this task (with list_id fallback)
            const { profileIds } = await findProfilesForTask(supabase, taskId, taskListId, log);

            if (profileIds.length > 0) {
              const { data: profiles } = await supabase
                .from("profiles")
                .select("id, email, full_name, email_notifications, notification_preferences")
                .in("id", profileIds);

              // Create in-app notifications
              const notifications = profileIds.map(profileId => ({
                profile_id: profileId,
                type: "status_change",
                title: `Aufgabe abgeschlossen`,
                message: `„${taskName}" wurde abgeschlossen.`,
                task_id: taskId,
                is_read: false,
              }));

              await supabase.from("notifications").insert(notifications);
              log.info(`Created completion notifications`, { count: notifications.length });

              // Send emails
              if (profiles) {
                for (const profile of profiles) {
                  if (shouldSendEmail(profile, "task_completed")) {
                    await sendMailjetEmail("task_completed", {
                      email: profile.email,
                      name: profile.full_name,
                    }, {
                      firstName: profile.full_name?.split(" ")[0],
                      taskName,
                      taskId,
                    }, log);
                  }
                }
              }
            }
          } else {
            log.info(`Task not visible in portal - skipping completion notification`, { taskId });
          }
        }

        // Credits are deducted at approval time (approve_credits action), not on completion.
        // No auto-deduction needed here.
        // Legacy code removed — see TASK-013 for context.

      }

      // Handle task started (IN PROGRESS) notification — bell only, no email
      if (statusAfter && isInProgressStatus(statusAfter) && taskId && isValidTaskId(taskId)) {
        const statusBefore = historyItem.before?.status || "";
        // Only trigger if transitioning INTO in_progress from a different status
        if (!isInProgressStatus(statusBefore)) {
          log.info(`Task moved to in_progress`, { taskId, from: statusBefore, to: statusAfter });

          // Deduplicate: check if we already sent a "started" notification for this task
          const { data: existingStartedNotif } = await supabase
            .from("notifications")
            .select("id")
            .eq("task_id", taskId)
            .eq("type", "status_change")
            .ilike("title", "%begonnen%")
            .limit(1);

          if (existingStartedNotif && existingStartedNotif.length > 0) {
            log.info(`Work started notification already sent for task, skipping`, { taskId });
          } else {
            const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");
            let taskName = "your task";
            let isVisible = false;
            let taskListId: string | null = null;

            if (clickupApiToken) {
              const taskInfo = await fetchTaskForVisibilityCheck(taskId, clickupApiToken, log);
              if (taskInfo) {
                isVisible = taskInfo.visible;
                taskName = taskInfo.name;
                taskListId = taskInfo.listId;
              }
            }

            if (isVisible) {
              // Find portal users for this task (with list_id fallback)
              const { profileIds } = await findProfilesForTask(supabase, taskId, taskListId, log);

              if (profileIds.length > 0) {
                const notifications = profileIds.map(profileId => ({
                  profile_id: profileId,
                  type: "status_change",
                  title: `Arbeit hat begonnen`,
                  message: `Wir haben mit der Arbeit an Ihrer Aufgabe „${taskName}" begonnen.`,
                  task_id: taskId,
                  is_read: false,
                }));

                await supabase.from("notifications").insert(notifications);
                log.info(`Created work-started notifications`, { count: notifications.length });
              }
            } else {
              log.info(`Task not visible in portal - skipping work-started notification`, { taskId });
            }
          }
        }
      }

      // task_cache status update already happened at the top of this handler.

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle taskUpdated for custom field changes (Credits) and tag changes (Recommendations)
    if (payload.event === "taskUpdated" && historyItem) {
      // --- TAG FIELD: recommendation tag detection ---
      if (historyItem.field === "tag" && taskId && isValidTaskId(taskId)) {
        const afterTags = historyItem.after as unknown;
        const tagName = typeof afterTags === "string" ? afterTags : (afterTags as any)?.name;

        if (tagName === "recommendation") {
          log.info("Recommendation tag added to task", { taskId });

          const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");
          if (!clickupApiToken) {
            log.error("Missing CLICKUP_API_TOKEN for recommendation tag handler");
            return new Response(
              JSON.stringify({ success: true, type: "recommendation_tag_skipped_no_token" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const taskInfo = await fetchTaskForVisibilityCheck(taskId, clickupApiToken, log);
          if (!taskInfo || !taskInfo.visible) {
            log.info("Task not visible or not found — skipping recommendation notification", { taskId });
            return new Response(
              JSON.stringify({ success: true, type: "recommendation_tag_skipped_not_visible" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const taskName = taskInfo.name;
          const { profileIds } = await findProfilesForTask(supabase, taskId, taskInfo.listId, log);

          if (profileIds.length > 0) {
            const notifications = profileIds.map((profileId) => ({
              profile_id: profileId,
              type: "new_recommendation",
              title: "Neue Empfehlung",
              message: `Ihr Team hat eine Empfehlung erstellt: "${taskName}"`,
              task_id: taskId,
              is_read: false,
            }));

            const { error: notifError } = await supabase.from("notifications").insert(notifications);
            if (notifError) {
              log.error("Failed to insert recommendation notifications", { taskId, error: notifError.message });
            } else {
              log.info("Recommendation notifications created", { taskId, count: notifications.length });
            }

            const { data: profiles } = await supabase
              .from("profiles")
              .select("id, email, full_name, email_notifications, notification_preferences")
              .in("id", profileIds);

            for (const p of profiles || []) {
              if (shouldSendEmail(p, "new_recommendation")) {
                await sendMailjetEmail(
                  "new_recommendation",
                  { email: p.email, name: p.full_name },
                  { firstName: p.full_name?.split(" ")[0], taskName, taskId },
                  log
                );
              }
            }
          } else {
            log.warn("No profiles found for recommendation notification", { taskId });
          }

          return new Response(
            JSON.stringify({ success: true, type: "recommendation_tag_handled" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Non-recommendation tag changes fall through to ignore
        log.debug("taskUpdated tag event ignored (not recommendation tag)", { taskId, tagName });
        return new Response(
          JSON.stringify({ message: "taskUpdated tag event ignored" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (historyItem.field === "custom_field" && taskId && isValidTaskId(taskId)) {
        const fieldData = historyItem.data as {
          field?: { id?: string; name?: string };
          value?: unknown;
          old_value?: unknown;
        };

        const creditsFieldId = Deno.env.get("CLICKUP_CREDITS_FIELD_ID") || "";
        const fieldId = fieldData?.field?.id || "";
        const fieldName = fieldData?.field?.name || "";

        // Match by field ID (primary) or field name (fallback)
        const isCreditsField = (creditsFieldId && fieldId === creditsFieldId) || fieldName === "Credits";

        if (isCreditsField) {
          const rawNew = fieldData?.value;
          const rawOld = fieldData?.old_value;
          const newValue = rawNew != null && !isNaN(Number(rawNew)) ? Number(rawNew) : null;
          const oldValue = rawOld != null && !isNaN(Number(rawOld)) ? Number(rawOld) : null;

          log.info("Credits custom field updated", { taskId, oldValue, newValue });

          // Update task_cache.credits for all cached entries of this task
          const { error: creditsUpdateError, count: creditsUpdateCount } = await supabase
            .from("task_cache")
            .update({ credits: newValue, last_synced: new Date().toISOString() })
            .eq("clickup_id", taskId)
            .select("clickup_id", { count: "exact" });

          if (creditsUpdateError) {
            log.error("Failed to update task_cache.credits", { taskId, error: creditsUpdateError.message });
          } else {
            log.info("Updated task_cache.credits", { taskId, newValue, rowsAffected: creditsUpdateCount ?? 0 });
          }

          // If credits cleared (null), skip transaction but still update task_cache above
          if (newValue === null) {
            log.info("Credits cleared to null, skipping transaction", { taskId });
            return new Response(
              JSON.stringify({ success: true, type: "credits_cleared" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Insert credit_transaction if value actually changed
          const delta = newValue - (oldValue ?? 0);
          if (delta !== 0) {
            const amount = -delta; // negative = deduction, positive = refund

            // Resolve profile_id from task_cache
            const { data: taskCacheRows } = await supabase
              .from("task_cache")
              .select("profile_id, name")
              .eq("clickup_id", taskId);

            if (taskCacheRows && taskCacheRows.length > 0) {
              const taskName = taskCacheRows[0].name || "Task";

              for (const row of taskCacheRows) {
                // Idempotency: check for duplicate transaction within last 60 seconds
                const { data: existing } = await supabase
                  .from("credit_transactions")
                  .select("id")
                  .eq("profile_id", row.profile_id)
                  .eq("task_id", taskId)
                  .eq("amount", amount)
                  .gte("created_at", new Date(Date.now() - 60000).toISOString())
                  .limit(1);

                if (existing && existing.length > 0) {
                  log.info("Duplicate credit transaction detected, skipping", { taskId, profileId: "[REDACTED]" });
                  continue;
                }

                const { error: txError } = await supabase
                  .from("credit_transactions")
                  .insert({
                    profile_id: row.profile_id,
                    amount,
                    type: "task_deduction",
                    task_id: taskId,
                    task_name: taskName,
                    description: `Credits: ${oldValue} → ${newValue}`,
                  });

                if (txError) {
                  log.error("Failed to insert credit_transaction", { taskId, error: txError.message });
                } else {
                  log.info("Credit transaction inserted", { taskId, amount });
                }
              }
            } else {
              log.warn("No task_cache entries found for credits transaction", { taskId });
            }
          }

          return new Response(
            JSON.stringify({ success: true, type: "credits_updated" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Non-tag, non-credits taskUpdated events for tickets are ignored
      log.debug("taskUpdated event ignored (not tag or credits field)", { taskId });
      return new Response(
        JSON.stringify({ message: "taskUpdated event ignored" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle comment posted events
    if (payload.event === "taskCommentPosted") {
      if (!historyItem || !historyItem.comment?.text_content) {
        log.debug("No comment data in webhook");
        return new Response(
          JSON.stringify({ message: "No comment data" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!taskId || !isValidTaskId(taskId)) {
        log.error("Invalid task ID in webhook", { taskId });
        return new Response(
          JSON.stringify({ error: "Invalid task ID" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const commentText = sanitizeCommentText(historyItem.comment.text_content);
      const commentId = historyItem.comment.id || historyItem.id;
      const commenterName = historyItem.user.username;
      const commenterEmail = historyItem.user.email;

      log.info(`Comment received`, { taskId, commenterName, commentId });

      // Skip portal-originated comments (clients already see their own messages)
      if (isPortalOriginatedComment(commentText)) {
        log.debug("Skipping portal-originated comment");
        return new Response(
          JSON.stringify({ message: "Portal comment ignored" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ---- TRIAGE HITL: check for [approve]/[reject] developer responses ----
      // MUST run before checkCommentThreadContext — thread filter would drop these internal comments
      await handleTriageHitl(payload, supabase, log);
      // HITL handler does not return early — always continues to existing notification logic

      // Always check thread context to determine if this is a reply and whether the thread is client-facing
      let isThreadedReply = false;
      let isClientFacingThread = false;
      const clickupToken = Deno.env.get("CLICKUP_API_TOKEN");

      if (clickupToken) {
        const threadContext = await checkCommentThreadContext(taskId, commentId, clickupToken, log);
        isThreadedReply = threadContext.isReply;
        isClientFacingThread = threadContext.isClientFacingThread;
      }

      const commentEvent = resolveClientFacingCommentEvent({
        commentText,
        isReply: isThreadedReply,
        isClientFacingThread,
      });

      if (!commentEvent.shouldNotify) {
        log.debug("Skipping comment - not client-facing", { isThreadedReply, isClientFacingThread });
        return new Response(
          JSON.stringify({ message: "Internal comment ignored" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const displayTextForClient = commentEvent.displayText;

      log.info(`Processing client-facing message`, { type: isThreadedReply ? "threaded reply" : "@client: prefix" });

      // ============ CHECK IF THIS IS A SUPPORT TASK ============
      log.debug(`Checking if task is a support task`, { taskId });

      // Normalize task ID
      const normalizedTaskId = taskId.replace(/^#/, '');

      // ORG-BE-06: Org-first support chat fan-out
      const supportOrgResult = await findOrgBySupportTaskId(supabase, normalizedTaskId);
      let supportProfileIds: string[];
      if (supportOrgResult && supportOrgResult.profileIds.length > 0) {
        supportProfileIds = supportOrgResult.profileIds;
        log.info("Support task resolved via org_members", {
          taskId: normalizedTaskId,
          count: supportProfileIds.length,
        });
      } else {
        // Fallback: existing profiles.support_task_id lookup
        const { data: supportProfiles, error: supportLookupError } = await supabase
          .from("profiles")
          .select("id")
          .eq("support_task_id", normalizedTaskId);
        if (supportLookupError) {
          log.error("Support profile lookup error", { error: supportLookupError.message });
        }
        supportProfileIds = (supportProfiles ?? []).map((p: { id: string }) => p.id);
        log.info("Support task resolved via profiles fallback", {
          taskId: normalizedTaskId,
          count: supportProfileIds.length,
        });
      }

      log.info(`Support profiles found`, { count: supportProfileIds.length, taskId: normalizedTaskId });

      if (supportProfileIds.length > 0) {
        // This is a SUPPORT TASK comment - fan out to all org members
        log.info(`Task is a support task - routing to unified pipeline`, { taskId });

        const firstName = commenterName.split(" ")[0];
        let activityUpdated = false;

        for (const profileId of supportProfileIds) {
          // Load per-member profile for notification preferences
          const { data: memberProfile } = await supabase
            .from("profiles")
            .select("id, email, full_name, email_notifications, notification_preferences")
            .eq("id", profileId)
            .maybeSingle();

          if (!memberProfile) {
            log.warn("Member profile not found — skipping fan-out for profile", { profileId });
            continue;
          }

          // Save to comment_cache for unified pipeline (no attachments from ClickUp)
          const { error: cacheError } = await supabase
            .from("comment_cache")
            .upsert({
              clickup_comment_id: commentId,
              task_id: taskId,
              profile_id: profileId,
              comment_text: commentText,
              display_text: displayTextForClient,
              author_id: historyItem.user.id,
              author_name: firstName,
              author_email: commenterEmail,
              author_avatar: historyItem.user.profilePicture || null,
              clickup_created_at: new Date(parseInt(historyItem.date)).toISOString(),
              last_synced: new Date().toISOString(),
              is_from_portal: false,
              attachments: null, // No ClickUp attachments - can't guarantee binding
            }, {
              onConflict: "clickup_comment_id,profile_id",
            });

          if (cacheError) {
            log.error("Failed to cache support comment", { error: cacheError.message, profileId });
          } else {
            log.info("Support comment cached for realtime updates", { profileId });

            // Update task activity once (not per-member)
            if (!activityUpdated) {
              const supportCommentTimestamp = parseClickUpTimestamp(historyItem.date);
              await updateTaskActivity(supabase, taskId, supportCommentTimestamp, log);
              activityUpdated = true;
            }
          }

          // Create in-app notification
          const { error: notifyError } = await supabase
            .from("notifications")
            .insert({
              profile_id: profileId,
              type: "team_reply",
              title: `Nachricht von ${firstName}`,
              message: displayTextForClient.substring(0, 200) + (displayTextForClient.length > 200 ? "..." : ""),
              task_id: taskId,
              comment_id: commentId,
              is_read: false,
            });

          if (notifyError) {
            log.error("Error creating notification", { error: notifyError.message, profileId });
          } else {
            log.info("Support notification created", { profileId });
          }

          // Send email notification for support response (respects per-member preferences)
          if (shouldSendEmail(memberProfile, "support_response")) {
            await sendMailjetEmail("support_response", {
              email: memberProfile.email,
              name: memberProfile.full_name,
            }, {
              firstName: memberProfile.full_name?.split(" ")[0],
              teamMemberName: firstName,
              messagePreview: displayTextForClient.substring(0, 300),
            }, log);
            log.info("Support response email sent", { profileId });
          }
        }

        return new Response(
          JSON.stringify({ success: true, type: "support_response" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ============ REGULAR TASK COMMENT (not support) ============
      // Find portal users for this task
      // Fetch task info for visibility check, list_id fallback and task name
      const clickupTokenForComment = Deno.env.get("CLICKUP_API_TOKEN");
      let commentTaskListId: string | null = null;
      let commentTaskName = "a task";

      if (clickupTokenForComment) {
        const commentTaskInfo = await fetchTaskForVisibilityCheck(taskId, clickupTokenForComment, log);
        if (commentTaskInfo) {
          // CRITICAL: Skip all notifications if task is not visible in the client portal
          if (!commentTaskInfo.visible) {
            log.info("Task not visible in client portal — skipping comment notification", { taskId });
            return new Response(
              JSON.stringify({ message: "Task not visible in portal — comment notification skipped" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          commentTaskListId = commentTaskInfo.listId;
          commentTaskName = commentTaskInfo.name;
        }
      }

      // Find portal users for this task (with list_id fallback)
      const { profileIds, source } = await findProfilesForTask(supabase, taskId, commentTaskListId, log);

      if (profileIds.length === 0) {
        log.debug("No portal users subscribed to this task", { taskId, source });
        return new Response(
          JSON.stringify({ message: "No subscribers" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const taskName = commentTaskName;
      log.info(`Found portal users for this task`, { count: profileIds.length, taskId });

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, email_notifications, notification_preferences")
        .in("id", profileIds);

      // Create in-app notifications
      const commenterFirstName = commenterName.split(" ")[0];
      const notificationsToInsert = profileIds.map(profileId => ({
        profile_id: profileId,
        type: "team_reply",
        title: `Neue Antwort zu „${taskName}"`,
        message: `${commenterFirstName} hat geantwortet: ${displayTextForClient.substring(0, 200)}${displayTextForClient.length > 200 ? "..." : ""}`,
        task_id: taskId,
        comment_id: commentId,
        is_read: false,
      }));

      const { error: notifyError } = await supabase
        .from("notifications")
        .insert(notificationsToInsert);

      if (notifyError) {
        log.error("Error creating notifications", { error: notifyError.message });
      } else {
        log.info(`Created in-app notifications`, { count: notificationsToInsert.length });
      }

      // Send email notification for team questions
      if (profiles) {
        for (const profile of profiles) {
          if (!shouldSendEmail(profile, "team_question")) {
            log.debug(`Skipping email - notifications disabled for profile`);
            continue;
          }

          // Send team question email
          await sendMailjetEmail("team_question", {
            email: profile.email,
            name: profile.full_name,
          }, {
            firstName: profile.full_name?.split(" ")[0],
            taskName,
            taskId,
            teamMemberName: commenterName.split(' ')[0],
            messagePreview: displayTextForClient.substring(0, 300),
          }, log);
        }
      }

      // Update comment cache (no attachments from ClickUp - can't guarantee binding)
      const firstName = commenterName.split(" ")[0];
      
      for (const profileId of profileIds) {
        const { error: commentCacheError } = await supabase
          .from("comment_cache")
          .upsert({
            clickup_comment_id: commentId,
            task_id: taskId,
            profile_id: profileId,
            comment_text: commentText, // Original with @client: prefix
            display_text: displayTextForClient, // Clean text for portal display
            author_id: historyItem.user.id,
            author_name: firstName,
            author_email: commenterEmail,
            author_avatar: historyItem.user.profilePicture || null,
            clickup_created_at: new Date(parseInt(historyItem.date)).toISOString(),
            last_synced: new Date().toISOString(),
            is_from_portal: false,
            attachments: null, // No ClickUp attachments - can't guarantee binding
          }, {
            onConflict: "clickup_comment_id,profile_id",
          });

        if (commentCacheError) {
          log.error("Failed to cache comment", { error: commentCacheError.message });
        }
      }

      // Update task activity for regular task comment
      const taskCommentTimestamp = parseClickUpTimestamp(historyItem.date);
      await updateTaskActivity(supabase, taskId, taskCommentTimestamp, log);

      log.info(`Webhook processing completed`, { notificationsCreated: notificationsToInsert.length });

      return new Response(
        JSON.stringify({ 
          success: true, 
          notificationsCreated: notificationsToInsert.length 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle taskTagUpdated event (ClickUp sends tag name in history_items[0].after[0].name, not payload.tag_name)
    if (payload.event === "taskTagUpdated" && taskId && isValidTaskId(taskId)) {
      const historyTagItem = payload.history_items?.[0];
      const isTagAdd = historyTagItem?.field === "tag";
      const tagName = isTagAdd
        ? (historyTagItem?.after as Array<{ name: string }> | undefined)?.[0]?.name
        : undefined;

      if (tagName !== "recommendation") {
        log.debug("taskTagUpdated event ignored (not recommendation tag)", { taskId, tagName });
        return new Response(
          JSON.stringify({ message: "tag event ignored" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");
      if (!clickupApiToken) {
        log.error("Missing CLICKUP_API_TOKEN for taskTagUpdated handler");
        return new Response(
          JSON.stringify({ success: true, type: "recommendation_tag_skipped_no_token" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Fetch the task to determine if tag was added or removed, and check visibility
      const taskInfo = await fetchTaskForVisibilityCheck(taskId, clickupApiToken, log);

      if (!taskInfo) {
        log.info("Task not found — skipping taskTagUpdated recommendation notification", { taskId });
        return new Response(
          JSON.stringify({ success: true, type: "recommendation_tag_skipped_not_found" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if recommendation tag is currently present (add vs remove detection)
      const tagStillPresent = taskInfo.tags?.some((t: { name: string }) => t.name === "recommendation");
      if (!tagStillPresent) {
        log.info("Recommendation tag was removed — skipping notification", { taskId });
        return new Response(
          JSON.stringify({ success: true, type: "recommendation_tag_removed" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!taskInfo.visible) {
        log.info("Task not visible in portal — skipping taskTagUpdated recommendation notification", { taskId });
        return new Response(
          JSON.stringify({ success: true, type: "recommendation_tag_skipped_not_visible" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const taskName = taskInfo.name;
      const { profileIds } = await findProfilesForTask(supabase, taskId, taskInfo.listId, log);

      if (profileIds.length > 0) {
        const notifications = profileIds.map((profileId) => ({
          profile_id: profileId,
          type: "new_recommendation",
          title: "Neue Empfehlung",
          message: `Ihr Team hat eine Empfehlung erstellt: "${taskName}"`,
          task_id: taskId,
          is_read: false,
        }));

        const { error: notifError } = await supabase.from("notifications").insert(notifications);
        if (notifError) {
          log.error("Failed to insert recommendation notifications (taskTagUpdated)", { taskId, error: notifError.message });
        } else {
          log.info("Recommendation notifications created (taskTagUpdated)", { taskId, count: notifications.length });
        }

        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, full_name, email_notifications, notification_preferences")
          .in("id", profileIds);

        for (const p of profiles || []) {
          if (shouldSendEmail(p, "new_recommendation")) {
            await sendMailjetEmail(
              "new_recommendation",
              { email: p.email, name: p.full_name },
              { firstName: p.full_name?.split(" ")[0], taskName, taskId },
              log
            );
          }
        }
      } else {
        log.warn("No profiles found for recommendation notification (taskTagUpdated)", { taskId });
      }

      return new Response(
        JSON.stringify({ success: true, type: "recommendation_tag_handled" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ignore other event types
    log.debug(`Ignoring event type`, { event: payload.event });
    return new Response(
      JSON.stringify({ message: "Event ignored" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("Webhook error", { error: String(error) });
    return new Response(
      JSON.stringify({ error: "An error occurred" }),
      { status: 500, headers: { ...defaultCorsHeaders, "Content-Type": "application/json" } }
    );
  }
});
