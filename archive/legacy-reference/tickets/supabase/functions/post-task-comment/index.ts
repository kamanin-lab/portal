// v5.0.0 - Simplified: Direct attachment handling without ledger binding
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { normalizeAttachmentType } from "../_shared/utils.ts";

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

// Helper: Find the most recent client-facing comment to thread replies
async function findLatestClientFacingComment(
  taskId: string,
  clickupApiToken: string,
  log?: ReturnType<typeof createLogger>
): Promise<string | null> {
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
      return null;
    }

    const data = await response.json();
    const comments = data.comments || [];

    // Match portal comments or team-to-client (@client:) comments
    const portalRegex = /^(?:\*\*)?(.+?)(?:\*\*)? \(via Client Portal\):/;
    const teamToClientRegex = /^@client:\s*/i;

    // Find the most recent client-facing comment (they come sorted by date desc)
    for (const comment of comments) {
      if (portalRegex.test(comment.comment_text) || teamToClientRegex.test(comment.comment_text)) {
        log?.debug("Found existing client-facing thread");
        return comment.id;
      }
    }

    return null; // No existing client-facing comments
  } catch (error) {
    log?.error("Error finding client-facing thread", { error: (error as Error).message });
    return null;
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

    if (!comment || typeof comment !== 'string' || comment.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Comment text is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate comment length
    if (comment.length > 10000) {
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
    let clickupText = `${fullName} (via Client Portal):\n\n${comment.trim()}`;
    
    // Add attachment references to comment text so team sees which files belong to this message
    if (uploadedAttachments.length > 0) {
      const fileList = uploadedAttachments.map(a => `📎 ${a.name}`).join('\n');
      clickupText += `\n\n---\n${fileList}`;
    }
    
    // Clean text for portal display (no prefix, no asterisks, no file references)
    const displayText = comment.trim();

    // Find existing client-facing thread for this task (portal or @client: comments)
    const existingThreadId = await findLatestClientFacingComment(taskId, clickupApiToken, log);

    let endpoint: string;

    if (existingThreadId) {
      // Post as a threaded reply to continue the conversation
      endpoint = `https://api.clickup.com/api/v2/comment/${existingThreadId}/reply`;
      log.debug("Posting as reply to existing thread");
    } else {
      // First message - create new top-level comment
      endpoint = `https://api.clickup.com/api/v2/task/${taskId}/comment`;
      log.debug("Creating new portal thread");
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
