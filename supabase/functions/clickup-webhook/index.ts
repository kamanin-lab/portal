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
  getClientFacingDisplayText,
  isExplicitPublicTopLevelComment,
  isPortalOriginatedComment,
  isTaskVisible,
  resolveTaskChapterConfigId,
} from "../_shared/clickup-contract.ts";

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
  return statusLower.includes("done") || statusLower.includes("complete") || statusLower.includes("closed");
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
): Promise<{ visible: boolean; name: string; listId: string | null } | null> {
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
    };
  } catch (error) {
    log.error(`Error fetching task for visibility check`, { taskId, error: String(error) });
    return null;
  }
}

/**
 * Find profile IDs that should receive notifications for a given task.
 * 1. Try task_cache first (fast, exact match).
 * 2. Fallback: find profiles whose clickup_list_ids contain the task's listId.
 */
async function findProfilesForTask(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  listId: string | null,
  log: ReturnType<typeof createLogger>
): Promise<string[]> {
  // 1. Try task_cache first (fast, exact)
  const { data: cacheEntries } = await supabase
    .from("task_cache")
    .select("profile_id")
    .eq("clickup_id", taskId);

  if (cacheEntries && cacheEntries.length > 0) {
    const ids = Array.from(new Set(cacheEntries.map((e: { profile_id: string }) => e.profile_id)));
    log.info("Profiles resolved via task_cache", { taskId, count: ids.length });
    return ids;
  }

  // 2. Fallback: find profiles by list_id in clickup_list_ids (jsonb array)
  if (!listId) {
    log.warn("No task_cache entries and no listId for fallback", { taskId });
    return [];
  }

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id")
    .contains("clickup_list_ids", [listId]);

  if (profiles && profiles.length > 0) {
    const ids = Array.from(new Set(profiles.map((p: { id: string }) => p.id)));
    log.info("Profiles resolved via list_id fallback", {
      taskId, listId, count: ids.length
    });

    // Sanity check: warn if unexpectedly many recipients
    if (ids.length > 10) {
      log.warn("Fallback returned many profiles - verify list configuration", {
        taskId, listId, count: ids.length
      });
    }

    return ids;
  }

  log.warn("No profiles found for task", { taskId, listId });
  return [];
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
            const isClientFacing = isPortalOriginatedComment(parentText) || isExplicitPublicTopLevelComment(parentText);
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
        .select("project_config_id")
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
              const isClientReview = statusAfter.toLowerCase() === "client review";
              const notifType = isClientReview ? "step_ready" : "project_update";

              const notifications = profileIds.map(pid => ({
                profile_id: pid,
                type: notifType,
                title: isClientReview ? `${stepName} ist bereit für Ihre Prüfung` : `Status-Update: ${stepName}`,
                message: isClientReview
                  ? `Ihr Schritt „${stepName}" wartet auf Ihre Prüfung.`
                  : `Der Status von „${stepName}" wurde auf „${statusAfter}" geändert.`,
                task_id: taskId,
                project_config_id: projectConfigId,
                clickup_task_id: taskId,
                is_read: false,
              }));
              await supabase.from("notifications").insert(notifications);
              log.info("Project notifications created", { count: notifications.length, type: notifType });

              // Email for step_ready
              if (isClientReview) {
                const { data: profiles } = await supabase
                  .from("profiles")
                  .select("id, email, full_name, email_notifications")
                  .in("id", profileIds);
                for (const p of profiles || []) {
                  if (p.email_notifications) {
                    await sendMailjetEmail("step_ready", { email: p.email, name: p.full_name }, {
                      firstName: p.full_name?.split(" ")[0], stepName, taskId,
                    }, log);
                  }
                }
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

          // Only process explicit public top-level comments
          if (!isExplicitPublicTopLevelComment(commentText)) {
            return new Response(JSON.stringify({ message: "Internal comment ignored", context: "project" }),
              { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const displayText = getClientFacingDisplayText(commentText);
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
            profile_id: pid, type: "project_reply",
            title: `Neue Nachricht zu ${stepName}`,
            message: `${firstName}: ${displayText.substring(0, 200)}${displayText.length > 200 ? "..." : ""}`,
            task_id: taskId, comment_id: commentId,
            project_config_id: projectConfigId, clickup_task_id: taskId, is_read: false,
          }));
          await supabase.from("notifications").insert(notifications);

          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, email, full_name, email_notifications")
            .in("id", profileIds);
          for (const p of profiles || []) {
            if (p.email_notifications) {
              await sendMailjetEmail("project_reply", { email: p.email, name: p.full_name }, {
                firstName: p.full_name?.split(" ")[0], stepName,
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

    // Handle task status updates
    if (payload.event === "taskStatusUpdated" && historyItem) {
      const statusAfter = historyItem.after?.status;
      
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
        const profileIds = await findProfilesForTask(supabase, taskId, taskInfo.listId, log);

        if (profileIds.length > 0) {
          // Get profiles for notifications
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, email, full_name, email_notifications")
            .in("id", profileIds);

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
          log.info(`Created status change notifications`, { count: notifications.length });

          // Update task activity timestamp
          const eventTimestamp = parseClickUpTimestamp(historyItem.date);
          await updateTaskActivity(supabase, taskId, eventTimestamp, log);

          // Send emails
          if (profiles) {
            for (const profile of profiles) {
              if (profile.email_notifications) {
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

      // Handle task completion notifications (done/completed, not cancelled)
      if (statusAfter && isDoneStatus(statusAfter) && taskId && isValidTaskId(taskId)) {
        log.info(`Task moved to done status`, { taskId, status: statusAfter });

        // Check if we already sent a completion email for this task (prevent duplicates)
        const { data: existingNotif } = await supabase
          .from("notifications")
          .select("id")
          .eq("task_id", taskId)
          .eq("type", "status_change")
          .ilike("title", "%completed%")
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
            const profileIds = await findProfilesForTask(supabase, taskId, taskListId, log);

            if (profileIds.length > 0) {
              const { data: profiles } = await supabase
                .from("profiles")
                .select("id, email, full_name, email_notifications")
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
                  if (profile.email_notifications) {
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
            .ilike("title", "%started%")
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
              const profileIds = await findProfilesForTask(supabase, taskId, taskListId, log);

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

      // For ALL status changes (not just review), update task_cache so Realtime pushes to frontend
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
          log.info("Updated task_cache status", { taskId, status: statusAfter, rowsAffected: count ?? 0 });
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
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

      // Detect explicit public top-level messages
      const isTeamToClient = isExplicitPublicTopLevelComment(commentText);

      // Always check thread context to determine if this is a reply and whether the thread is client-facing
      let shouldNotify = false;
      let isThreadedReply = false;
      const clickupToken = Deno.env.get("CLICKUP_API_TOKEN");

      if (clickupToken) {
        const threadContext = await checkCommentThreadContext(taskId, commentId, clickupToken, log);

        if (threadContext.isReply) {
          // It's a reply -- only notify if the parent thread is client-facing
          if (threadContext.isClientFacingThread) {
            shouldNotify = true;
            isThreadedReply = true;
          } else {
            // Reply in internal thread -- block even if @client: prefix
            log.info("Blocking notification: comment is in an internal thread", {
              commentId, hasClientPrefix: isTeamToClient,
            });
          }
        } else {
          // Top-level comment -- notify only if has @client: prefix
          shouldNotify = isTeamToClient;
        }
      } else {
        // No ClickUp token -- fall back to prefix-only check (top-level assumption)
        shouldNotify = isTeamToClient;
      }

      // Skip if not client-facing
      if (!shouldNotify) {
        log.debug("Skipping comment - not client-facing", { isTeamToClient, isThreadedReply });
        return new Response(
          JSON.stringify({ message: "Internal comment ignored" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // For @client: prefixed messages, strip the prefix; for threaded replies, show as-is
      const displayTextForClient = isTeamToClient
        ? getClientFacingDisplayText(commentText)
        : commentText;

      log.info(`Processing client-facing message`, { type: isTeamToClient ? "@client: prefix" : "threaded reply" });

      // ============ CHECK IF THIS IS A SUPPORT TASK ============
      log.debug(`Checking if task is a support task`, { taskId });
      
      // Normalize task ID
      const normalizedTaskId = taskId.replace(/^#/, '');
      
      // Check if this task is a support task for any profile
      const { data: supportProfiles, error: supportLookupError } = await supabase
        .from("profiles")
        .select("id, email, full_name, email_notifications")
        .eq("support_task_id", normalizedTaskId);

      if (supportLookupError) {
        log.error("Support profile lookup error", { error: supportLookupError.message });
      }

      log.info(`Support profiles found`, { count: supportProfiles?.length || 0, taskId: normalizedTaskId });

      if (supportProfiles && supportProfiles.length > 0) {
        // This is a SUPPORT TASK comment - save to comment_cache
        log.info(`Task is a support task - routing to unified pipeline`, { taskId });
        
        const profile = supportProfiles[0];
        const firstName = commenterName.split(" ")[0];

        // Save to comment_cache for unified pipeline (no attachments from ClickUp)
        const { error: cacheError } = await supabase
          .from("comment_cache")
          .upsert({
            clickup_comment_id: commentId,
            task_id: taskId,
            profile_id: profile.id,
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
          log.error("Failed to cache support comment", { error: cacheError.message });
        } else {
          log.info("Support comment cached for realtime updates");
          
          // Update task activity for support task
          const supportCommentTimestamp = parseClickUpTimestamp(historyItem.date);
          await updateTaskActivity(supabase, taskId, supportCommentTimestamp, log);
        }

        // Create in-app notification
        const { error: notifyError } = await supabase
          .from("notifications")
          .insert({
            profile_id: profile.id,
            type: "team_reply",
            title: `Nachricht von ${firstName}`,
            message: displayTextForClient.substring(0, 200) + (displayTextForClient.length > 200 ? "..." : ""),
            task_id: taskId,
            comment_id: commentId,
            is_read: false,
          });

        if (notifyError) {
          log.error("Error creating notification", { error: notifyError.message });
        } else {
          log.info("Support notification created");
        }

        // Send email notification for support response
        if (profile.email_notifications) {
          await sendMailjetEmail("support_response", {
            email: profile.email,
            name: profile.full_name,
          }, {
            firstName: profile.full_name?.split(" ")[0],
            teamMemberName: firstName,
            messagePreview: displayTextForClient.substring(0, 300),
          }, log);
          log.info("Support response email sent");
        }

        return new Response(
          JSON.stringify({ success: true, type: "support_response" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // ============ REGULAR TASK COMMENT (not support) ============
      // Find portal users for this task
      // Fetch task info for list_id fallback and task name
      const clickupTokenForComment = Deno.env.get("CLICKUP_API_TOKEN");
      let commentTaskListId: string | null = null;
      let commentTaskName = "a task";

      if (clickupTokenForComment) {
        const commentTaskInfo = await fetchTaskForVisibilityCheck(taskId, clickupTokenForComment, log);
        if (commentTaskInfo) {
          commentTaskListId = commentTaskInfo.listId;
          commentTaskName = commentTaskInfo.name;
        }
      }

      // Find portal users for this task (with list_id fallback)
      const profileIds = await findProfilesForTask(supabase, taskId, commentTaskListId, log);

      if (profileIds.length === 0) {
        log.debug("No portal users subscribed to this task", { taskId });
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
        .select("id, email, full_name, email_notifications")
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
          if (!profile.email_notifications) {
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
