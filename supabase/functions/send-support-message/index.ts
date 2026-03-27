import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";

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

interface FileData {
  name: string;
  type: string;
  size: number;
  base64: string;
}

interface SendMessageRequest {
  message: string;
  files?: FileData[];
}

interface UploadedAttachment {
  id: string;
  title: string;
  url: string;
  type?: string;
  size?: number;
}

const MAX_MESSAGE_LENGTH = 5000;

// File validation constants (same as post-task-comment)
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

// Upload a single attachment to ClickUp task
async function uploadAttachmentToClickUp(
  taskId: string,
  file: FileData,
  clickupApiToken: string,
  log?: ReturnType<typeof createLogger>
): Promise<{ success: boolean; attachment?: UploadedAttachment; error?: string }> {
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
    
    return { 
      success: true, 
      attachment: {
        id: data.id,
        title: file.name,
        url: data.url || data.url_w_host || '',
        type: file.type,
        size: file.size,
      }
    };
  } catch (error) {
    log?.error("Error uploading attachment", { error: (error as Error).message });
    return { success: false, error: "Upload error" };
  }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('send-support-message', requestId);

  // Get dynamic CORS headers based on request origin
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clickupToken = Deno.env.get("CLICKUP_API_TOKEN");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      log.error("Missing Supabase configuration");
      return new Response(
        JSON.stringify({ error: "Service unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!clickupToken) {
      log.error("Missing ClickUp configuration");
      return new Response(
        JSON.stringify({ error: "ClickUp integration not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user using getUser (stable API)
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      log.error("Auth error", { error: userError?.message });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    log.info("Processing support message request");

    // Parse request body
    const body: SendMessageRequest = await req.json();
    const { message, files } = body;

    // Validate message — allow empty text if files are attached
    const hasFiles = Array.isArray(files) && files.length > 0;
    if ((!message || typeof message !== "string") && !hasFiles) {
      return new Response(
        JSON.stringify({ error: "Message or files are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedMessage = (message || '').trim();
    if (trimmedMessage.length === 0 && !hasFiles) {
      return new Response(
        JSON.stringify({ error: "Message or files are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (trimmedMessage.length > MAX_MESSAGE_LENGTH) {
      return new Response(
        JSON.stringify({ error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` }),
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

    // Get user profile with service role for guaranteed access
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, support_task_id")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      log.error("Profile not found", { error: profileError?.message });
      return new Response(
        JSON.stringify({ error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile.support_task_id) {
      log.error("No support task configured for user");
      return new Response(
        JSON.stringify({ error: "Support chat not configured for your account. Please contact support." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientName = profile.full_name || profile.email?.split("@")[0] || "Client";
    const firstName = clientName.split(" ")[0];
    
    log.info("Sending comment to ClickUp support task", { hasFiles: validFiles.length > 0 });

    // Upload attachments first (if any)
    const uploadedAttachments: UploadedAttachment[] = [];
    if (validFiles.length > 0) {
      log.debug("Uploading attachments", { count: validFiles.length });
      for (const file of validFiles) {
        const result = await uploadAttachmentToClickUp(
          profile.support_task_id,
          file,
          clickupToken,
          log
        );
        if (result.success && result.attachment) {
          uploadedAttachments.push(result.attachment);
        }
      }
      log.debug("Attachments uploaded", { success: uploadedAttachments.length, total: validFiles.length });
    }

    // Build comment text with file references for ClickUp visibility
    const messageBody = trimmedMessage || (uploadedAttachments.length > 0 ? '📎 Dateianhang' : '');
    let clickupText = `${clientName} (via Client Portal):\n\n${messageBody}`;
    
    // Add attachment references if files were uploaded (so team sees them linked to the message)
    if (uploadedAttachments.length > 0) {
      const fileList = uploadedAttachments.map(a => `📎 ${a.title}`).join('\n');
      clickupText += `\n\n---\n${fileList}`;
      log.debug("Added file references to comment text", { count: uploadedAttachments.length });
    }

    // Post comment to ClickUp Task (using Task Comment API v2)
    log.debug("Posting comment to ClickUp", { length: clickupText.length });
    const clickupResponse = await fetchWithRetry(
      `https://api.clickup.com/api/v2/task/${profile.support_task_id}/comment`,
      {
        method: "POST",
        headers: {
          "Authorization": clickupToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment_text: clickupText,
          notify_all: false,
        }),
      },
      2,
      log
    );

    let clickupCommentId: string | null = null;

    if (clickupResponse.ok) {
      try {
        const clickupData = await clickupResponse.json();
        clickupCommentId = clickupData.id || null;
        log.info("Comment posted to ClickUp successfully");
      } catch {
        log.info("Comment posted to ClickUp (no response body)");
      }
    } else {
      const errorText = await clickupResponse.text();
      log.error("ClickUp API error", { status: clickupResponse.status });
      return new Response(
        JSON.stringify({ error: "Failed to send message to support" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save message to support_messages table
    const { data: savedMessage, error: insertError } = await supabaseAdmin
      .from("support_messages")
      .insert({
        profile_id: userId,
        message_text: clickupText,
        display_text: trimmedMessage || (uploadedAttachments.length > 0 ? '📎 Dateianhang' : ''),
        is_from_client: true,
        sender_name: firstName,
        clickup_message_id: clickupCommentId,
        attachments: uploadedAttachments.length > 0 ? uploadedAttachments : [],
      })
      .select()
      .single();

    if (insertError) {
      log.error("Error saving message", { error: insertError.message });
      return new Response(
        JSON.stringify({ error: "Failed to save message" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info("Support message saved");

    return new Response(
      JSON.stringify({
        success: true,
        message: savedMessage,
        attachmentCount: uploadedAttachments.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    log.error("Function error", { error: (error as Error).message });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...defaultCorsHeaders, "Content-Type": "application/json" } }
    );
  }
});
