// v5.0.0 - Simplified: Direct attachment handling without ledger binding
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { normalizeAttachmentType } from "../_shared/utils.ts";
import {
  resolvePublicThreadRootId,
} from "../_shared/clickup-contract.ts";
import { getUserOrgRole, getOrgContextForTask, getNonViewerProfileIds } from "../_shared/org.ts";

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

// Validate task ID format (ClickUp task IDs are alphanumeric)
function isValidTaskId(taskId: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(taskId) && taskId.length <= 50;
}

// File validation constants
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES = 5;

interface FileData {
  name: string;
  type: string;
  size: number;
  base64: string;
}

interface UploadedAttachment {
  id: string;
  name: string;
}

interface AttachmentData {
  id: string;
  title: string;
  url: string;
  type: string;
  size?: number;
}

// Upload a single attachment to ClickUp task
async function uploadAttachmentToClickUp(
  taskId: string,
  file: FileData,
  clickupApiToken: string,
  log?: ReturnType<typeof createLogger>
): Promise<{ success: boolean; attachmentId?: string; error?: string }> {
  try {
    // Decode base64 to binary
    const binaryString = atob(file.base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: file.type });

    // Create multipart form data
    const formData = new FormData();
    formData.append("attachment", blob, file.name);

    const response = await fetchWithRetry(
      `https://api.clickup.com/api/v2/task/${taskId}/attachment`,
      {
        method: "POST",
        headers: {
          Authorization: clickupApiToken,
        },
        body: formData,
      },
      2,
      log
    );

    if (!response.ok) {
      const errorText = await response.text();
      log?.error("Failed to upload attachment", { status: response.status });
      return { success: false, error: `Upload failed: ${response.status}` };
    }

    const data = await response.json();
    log?.debug("Uploaded attachment", { name: file.name });
    return { success: true, attachmentId: data.id };
  } catch (error) {
    log?.error("Error uploading attachment", { error: (error as Error).message });
    return { success: false, error: "Upload error" };
  }
}

// Helper: resolve the single active public thread root for this task.
// If multiple public roots exist, fail closed and let the portal create a new top-level message.
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

// Fetch real attachment data from ClickUp after upload
async function fetchAttachmentData(
  taskId: string,
  uploadedAttachments: UploadedAttachment[],
  clickupApiToken: string,
  log: ReturnType<typeof createLogger>
): Promise<AttachmentData[]> {
  if (uploadedAttachments.length === 0) return [];

  try {
    const taskResponse = await fetchWithRetry(
      `https://api.clickup.com/api/v2/task/${taskId}`,
      { headers: { Authorization: clickupApiToken, "Content-Type": "application/json" } },
      2,
      log
    );

    if (!taskResponse.ok) {
      log.warn("Could not fetch task for attachment data");
      // Return placeholder data
      return uploadedAttachments.map(att => ({
        id: att.id,
        title: att.name,
        url: '',
        type: '',
      }));
    }

    const task = await taskResponse.json();
    const taskAttachments = task.attachments || [];

    // Build attachment objects with real data
    return uploadedAttachments.map(uploaded => {
      const real = taskAttachments.find((a: any) => a.id === uploaded.id);
      return {
        id: uploaded.id,
        title: uploaded.name,
        url: real?.url || real?.url_w_host || '',
        type: normalizeAttachmentType(real) || '',
        size: real?.size,
      };
    });
  } catch (error) {
    log.error("Error fetching attachment data", { error: (error as Error).message });
    return uploadedAttachments.map(att => ({
      id: att.id,
      title: att.name,
      url: '',
      type: '',
    }));
  }
}

// ---- Peer notification helpers (mirrored from clickup-webhook) ----

const EMAIL_TYPE_TO_PREF_KEY: Record<string, string> = {
  team_question: "peer_messages",
  project_reply: "peer_messages",
};

function shouldSendPeerEmail(
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

async function sendMailjetEmail(
  type: string,
  to: { email: string; name?: string | null },
  data: Record<string, unknown>,
  log: ReturnType<typeof createLogger>,
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
      body: JSON.stringify({ type, to, data }),
    });

    if (response.ok) {
      log.info("Peer email sent", { type });
      return true;
    } else {
      const error = await response.text();
      log.error("Peer email send failed", { type, error });
      return false;
    }
  } catch (error) {
    log.error("Peer email send error", { error: String(error) });
    return false;
  }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('post-task-comment', requestId);

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

    // Get request body
    const { taskId, comment, files } = await req.json();
    
    // Validate taskId format
    if (!taskId || !isValidTaskId(taskId)) {
      return new Response(
        JSON.stringify({ error: "Invalid task ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hasFiles = Array.isArray(files) && files.length > 0;
    if ((!comment || typeof comment !== 'string' || comment.trim().length === 0) && !hasFiles) {
      return new Response(
        JSON.stringify({ error: "Comment text or files are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate comment length (only when comment text is provided)
    if (comment && comment.length > 10000) {
      return new Response(
        JSON.stringify({ error: "Comment is too long (max 10,000 characters)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate files if present
    const validFiles: FileData[] = [];
    if (files && Array.isArray(files)) {
      if (files.length > MAX_FILES) {
        return new Response(
          JSON.stringify({ error: `Maximum ${MAX_FILES} files allowed` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      for (const file of files) {
        if (!file.name || !file.type || !file.base64) {
          log.debug("Skipping invalid file data");
          continue;
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
          log.debug("Skipping unsupported file type", { type: file.type });
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          log.debug("Skipping file too large", { name: file.name });
          continue;
        }
        validFiles.push(file);
      }
    }

    // Get environment variables
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

    // Get user profile for the name
    const userId = user.id;
    const userEmail = user.email || '';

    // ORG-BE-11: Role guard — viewer cannot post comments
    if (supabaseServiceKey) {
      const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
      const orgRole = await getUserOrgRole(supabaseAdmin, userId);
      if (orgRole === "viewer") {
        log.warn("Viewer role blocked from post-task-comment", { userId });
        return new Response(
          JSON.stringify({ error: "Insufficient permissions" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .maybeSingle();

    const fullName = profile?.full_name || userEmail?.split('@')[0] || 'Client';
    // Extract first name only for display in portal
    const firstName = fullName.split(' ')[0];

    log.info("Posting comment to task", { hasFiles: validFiles.length > 0 });

    // Upload attachments FIRST so we can include references in the comment
    const uploadedAttachments: UploadedAttachment[] = [];
    if (validFiles.length > 0) {
      log.debug("Uploading attachments before posting comment", { count: validFiles.length });
      for (const file of validFiles) {
        const result = await uploadAttachmentToClickUp(taskId, file, clickupApiToken, log);
        if (result.success && result.attachmentId) {
          uploadedAttachments.push({ id: result.attachmentId, name: file.name });
        }
      }
      log.debug("Attachments uploaded", { success: uploadedAttachments.length, total: validFiles.length });
    }

    // Build comment text with file references (matching support chat format)
    const trimmedComment = (comment || '').trim();
    const commentBody = trimmedComment || (uploadedAttachments.length > 0 ? '📎 Dateianhang' : '');
    let clickupText = `${fullName} (via Client Portal):\n\n${commentBody}`;

    // Add attachment references to comment text so team sees which files belong to this message
    if (uploadedAttachments.length > 0) {
      const fileList = uploadedAttachments.map(a => `📎 ${a.name}`).join('\n');
      clickupText += `\n\n---\n${fileList}`;
    }

    // Clean text for portal display (no prefix, no asterisks, no file references)
    // Use placeholder for file-only sends so UI doesn't show empty bubble
    const displayText = trimmedComment || (uploadedAttachments.length > 0 ? '📎 Dateianhang' : '');

    // Continue only a single unambiguous public thread.
    const threadResolution = await resolveActivePublicThread(taskId, clickupApiToken, log);

    let endpoint: string;

    if (threadResolution.rootId) {
      endpoint = `https://api.clickup.com/api/v2/comment/${threadResolution.rootId}/reply`;
      log.debug("Posting as reply to the active public thread", { rootId: threadResolution.rootId });
    } else {
      endpoint = `https://api.clickup.com/api/v2/task/${taskId}/comment`;
      log.debug("Creating new top-level portal thread", { reason: threadResolution.reason });
    }

    const response = await fetchWithRetry(endpoint, {
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

    if (!response.ok) {
      const errorText = await response.text();
      log.error("External service error", { status: response.status });
      return new Response(
        JSON.stringify({ error: "Failed to post comment" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const commentId = data.id;
    log.info("Comment posted successfully", { attachmentCount: uploadedAttachments.length });

    // Create admin client for cache operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch real attachment data from ClickUp (URLs, types, sizes)
    let attachmentData: AttachmentData[] = [];
    if (uploadedAttachments.length > 0) {
      attachmentData = await fetchAttachmentData(taskId, uploadedAttachments, clickupApiToken, log);
      log.debug("Fetched attachment data", { count: attachmentData.length });
    }

    // Insert the new comment into cache with attachments
    const { error: cacheError } = await supabaseAdmin
      .from("comment_cache")
      .upsert({
        clickup_comment_id: commentId,
        task_id: taskId,
        profile_id: userId,
        comment_text: clickupText, // Full text for reference/debugging
        display_text: displayText, // Clean text for portal display
        author_id: 0, // Client portal user - no ClickUp ID
        author_name: firstName, // First name only for portal display
        author_email: userEmail,
        author_avatar: null,
        clickup_created_at: new Date().toISOString(),
        last_synced: new Date().toISOString(),
        is_from_portal: true, // Flag to identify client portal comments
        attachments: attachmentData.length > 0 ? attachmentData : null, // Include attachments immediately
      }, {
        onConflict: "clickup_comment_id,profile_id",
      });

    if (cacheError) {
      log.error("Failed to cache new comment", { error: cacheError.message });
      // Don't fail the request, the comment was posted successfully
    } else {
      log.debug("Cached new comment with attachments");
    }

    // ---- Peer notification fan-out (org members) ----
    try {
      const orgCtx = await getOrgContextForTask(supabaseAdmin, taskId, log);

      if (orgCtx.orgId && orgCtx.memberProfileIds.length > 0) {
        // Exclude the comment author
        let recipientIds = orgCtx.memberProfileIds.filter(id => id !== userId);
        // Exclude viewers
        recipientIds = await getNonViewerProfileIds(supabaseAdmin, recipientIds);

        if (recipientIds.length > 0) {
          log.info("Fan-out peer notifications", { count: recipientIds.length, surface: orgCtx.surface });

          // Determine notification type and email type based on surface
          const notificationType = orgCtx.surface === "project_task" ? "team_reply" : "team_reply";
          const emailType = orgCtx.surface === "project_task" ? "project_reply" : "team_question";

          // Get task/step name for notification text
          let taskName = "einer Aufgabe";
          if (orgCtx.surface === "ticket") {
            const { data: taskRow } = await supabaseAdmin
              .from("task_cache")
              .select("name")
              .eq("clickup_id", taskId)
              .limit(1)
              .maybeSingle();
            if (taskRow?.name) taskName = taskRow.name;
          } else if (orgCtx.surface === "project_task") {
            const { data: ptRow } = await supabaseAdmin
              .from("project_task_cache")
              .select("name")
              .eq("clickup_id", taskId)
              .limit(1)
              .maybeSingle();
            if (ptRow?.name) taskName = ptRow.name;
          }

          // 1. Upsert comment_cache for each recipient
          for (const recipientId of recipientIds) {
            const { error: peerCacheErr } = await supabaseAdmin
              .from("comment_cache")
              .upsert({
                clickup_comment_id: commentId,
                task_id: taskId,
                profile_id: recipientId,
                comment_text: clickupText,
                display_text: displayText,
                author_id: 0,
                author_name: firstName,
                author_email: userEmail,
                author_avatar: null,
                clickup_created_at: new Date().toISOString(),
                last_synced: new Date().toISOString(),
                is_from_portal: true,
                attachments: attachmentData.length > 0 ? attachmentData : null,
              }, {
                onConflict: "clickup_comment_id,profile_id",
              });

            if (peerCacheErr) {
              log.error("Failed to cache peer comment", { recipientId, error: peerCacheErr.message });
            }
          }

          // 2. Insert notifications for all recipients
          const notificationTitle = orgCtx.surface === "project_task"
            ? `Neue Nachricht zu ${taskName}`
            : `Neue Nachricht zu \u201E${taskName}\u201C`;
          const notificationMessage = `${firstName}: ${displayText.substring(0, 200)}${displayText.length > 200 ? "..." : ""}`;

          const notifications = recipientIds.map(pid => ({
            profile_id: pid,
            type: notificationType,
            title: notificationTitle,
            message: notificationMessage,
            task_id: taskId,
            comment_id: commentId,
            ...(orgCtx.projectConfigId ? { project_config_id: orgCtx.projectConfigId } : {}),
            is_read: false,
          }));

          const { error: notifyErr } = await supabaseAdmin.from("notifications").insert(notifications);
          if (notifyErr) {
            log.error("Failed to insert peer notifications", { error: notifyErr.message });
          } else {
            log.info("Peer notifications created", { count: notifications.length });
          }

          // 3. Send emails to recipients who have peer_messages enabled
          const { data: recipientProfiles } = await supabaseAdmin
            .from("profiles")
            .select("id, email, full_name, email_notifications, notification_preferences")
            .in("id", recipientIds);

          if (recipientProfiles) {
            for (const rp of recipientProfiles) {
              if (!shouldSendPeerEmail(rp, emailType)) {
                log.debug("Skipping peer email — preference disabled");
                continue;
              }

              if (emailType === "project_reply") {
                await sendMailjetEmail("project_reply", { email: rp.email, name: rp.full_name }, {
                  firstName: rp.full_name?.split(" ")[0],
                  stepName: taskName,
                  taskId,
                  projectConfigId: orgCtx.projectConfigId ?? undefined,
                  teamMemberName: firstName,
                  messagePreview: displayText.substring(0, 300),
                }, log);
              } else {
                await sendMailjetEmail("team_question", { email: rp.email, name: rp.full_name }, {
                  firstName: rp.full_name?.split(" ")[0],
                  taskName,
                  taskId,
                  teamMemberName: firstName,
                  messagePreview: displayText.substring(0, 300),
                }, log);
              }
            }
          }
        }
      }
    } catch (fanoutError) {
      // Fan-out must never fail the main request — comment is already posted
      log.error("Peer fan-out error (non-fatal)", { error: String(fanoutError) });
    }

    return new Response(
      JSON.stringify({
        success: true,
        commentId: commentId,
        attachmentCount: uploadedAttachments.length,
        attachmentNames: uploadedAttachments.map(a => a.name),
        message: "Comment posted successfully"
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
