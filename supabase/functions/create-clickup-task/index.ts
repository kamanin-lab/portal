import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import {
  buildChapterConfigMap,
  resolveChapterConfigId,
  TEST_FOLDER_CONTRACT,
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
  data: string; // base64 encoded
  type: string;
}

interface CreateTaskRequest {
  name: string;
  description?: string;
  priority: 1 | 2 | 3 | 4;
  files?: FileData[];
  listId?: string;
  phaseFieldId?: string;
  phaseOptionId?: string;
}

// Allowed file types for upload
const ALLOWED_FILE_TYPES = new Set([
  // Images
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp', 'image/tiff',
  // PDF
  'application/pdf',
  // Office documents
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Text
  'text/plain', 'text/csv', 'text/markdown', 'text/html',
  // Archives
  'application/zip', 'application/x-zip-compressed',
  // Generic binary (client fallback when type is unknown)
  'application/octet-stream',
]);

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Sanitize filename to prevent path traversal
function sanitizeFilename(filename: string): string {
  // Remove path components and special characters
  return filename
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/[<>:"|?*]/g, '_')
    .substring(0, 255);
}

// Decode base64 to ArrayBuffer
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer as ArrayBuffer;
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('create-clickup-task', requestId);

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

    log.info("Creating task for user", {
      approvedFolderUrl: TEST_FOLDER_CONTRACT.approvedFolderUrl,
    });

    // Parse request body
    const requestText = await req.text();
    if (!requestText || requestText.trim() === '') {
      return new Response(
        JSON.stringify({ error: "Request body is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let body: CreateTaskRequest;
    try {
      body = JSON.parse(requestText);
    } catch (parseError) {
      log.error("Failed to parse request body");
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate required fields
    if (!body.name || body.name.trim() === '') {
      return new Response(
        JSON.stringify({ error: "Task name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.name.length > 200) {
      return new Response(
        JSON.stringify({ error: "Task name must be 200 characters or less" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate description length
    if (body.description && body.description.length > 5000) {
      return new Response(
        JSON.stringify({ error: "Description must be 5,000 characters or less" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate priority
    const validPriorities = [1, 2, 3, 4];
    if (!validPriorities.includes(body.priority)) {
      return new Response(
        JSON.stringify({ error: "Invalid priority. Must be 1 (Urgent), 2 (High), 3 (Normal), or 4 (Low)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate files
    const files = body.files || [];
    if (files.length > 5) {
      return new Response(
        JSON.stringify({ error: "Maximum 5 files allowed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate each file
    for (const file of files) {
      if (!ALLOWED_FILE_TYPES.has(file.type)) {
        return new Response(
          JSON.stringify({ error: `File type not allowed: ${file.type}. Allowed types: images, PDF, Office documents, text files.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Check approximate file size from base64 (base64 is ~33% larger than binary)
      const approxSize = (file.data.length * 3) / 4;
      if (approxSize > MAX_FILE_SIZE) {
        return new Response(
          JSON.stringify({ error: `File "${sanitizeFilename(file.name)}" is too large. Maximum size is 10MB.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Get user's ClickUp list IDs and chat channel from profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("clickup_list_ids, full_name, clickup_chat_channel_id")
      .eq("id", user.id)
      .single();

    if (profileError) {
      log.error("Failed to fetch profile");
      return new Response(
        JSON.stringify({ error: "Failed to fetch user profile" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use explicit listId from request (project mode) or fall back to profile's list
    let listId: string;
    if (body.listId) {
      listId = body.listId;
    } else {
      const listIds = profile?.clickup_list_ids || [];
      if (listIds.length === 0) {
        log.info("No ClickUp list IDs configured for user");
        return new Response(
          JSON.stringify({ error: "No list configured. Please contact your administrator." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      listId = listIds[0];
    }
    log.debug("Creating task in ClickUp list");

    // Get visibility field ID for automatic tagging
    const visibleFieldId = Deno.env.get("CLICKUP_VISIBLE_FIELD_ID");

    // Build custom_fields array
    const customFields: Array<{ id: string; value: unknown }> = [];
    if (visibleFieldId) {
      customFields.push({ id: visibleFieldId, value: true });
    }
    if (body.phaseFieldId && body.phaseOptionId) {
      customFields.push({ id: body.phaseFieldId, value: body.phaseOptionId });
    }

    // Create task in ClickUp with visibility checkbox and optional phase
    const createTaskResponse = await fetchWithRetry(
      `https://api.clickup.com/api/v2/list/${listId}/task`,
      {
        method: "POST",
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: body.name.trim(),
          description: body.description?.trim() || "",
          priority: body.priority,
          status: "to do",
          custom_fields: customFields,
        }),
      },
      2,
      log
    );

    if (!createTaskResponse.ok) {
      await createTaskResponse.text(); // Consume response body
      log.error("External service error", { status: createTaskResponse.status });
      return new Response(
        JSON.stringify({ error: "Failed to create task" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const taskData = await createTaskResponse.json();
    log.info("Task created successfully");

    // Upsert cache with creator info (service role client)
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || supabaseAnonKey);
    const fullName = (profile.full_name || '').trim();
    const firstName = fullName.split(' ').filter(Boolean)[0] || 'Portal User';

    const isProjectTask = !!body.listId;
    const cacheTable = isProjectTask ? 'project_task_cache' : 'task_cache';

    if (isProjectTask) {
      // Look up project_config_id from clickup_list_id
      const { data: projectConfig } = await supabaseAdmin
        .from('project_config')
        .select('id')
        .eq('clickup_list_id', listId)
        .single();

      let chapterConfigId: string | null = null;
      if (projectConfig?.id && body.phaseOptionId) {
        const { data: chapterConfigs } = await supabaseAdmin
          .from('chapter_config')
          .select('id, clickup_cf_option_id')
          .eq('project_config_id', projectConfig.id)
          .eq('is_active', true);

        const chapterMap = buildChapterConfigMap(chapterConfigs || []);
        chapterConfigId = resolveChapterConfigId(body.phaseOptionId, chapterMap);
      }

      if (projectConfig) {
        const { error: cacheError } = await supabaseAdmin
          .from('project_task_cache')
          .upsert({
            clickup_id: taskData.id,
            project_config_id: projectConfig.id,
            name: taskData.name,
            description: body.description?.trim() || '',
            status: 'to do',
            status_color: '',
            chapter_config_id: chapterConfigId,
            is_visible: true,
            last_synced: new Date().toISOString(),
          }, { onConflict: 'clickup_id,project_config_id' });

        if (cacheError) {
          log.error("Failed to cache project task", { error: cacheError.message });
        } else {
          log.debug("Project task cached", { firstName });
        }
      } else {
        log.warn("No project_config found for list", { listId });
      }
    } else {
      const { error: cacheError } = await supabaseAdmin
        .from('task_cache')
        .upsert({
          clickup_id: taskData.id,
          profile_id: user.id,
          name: taskData.name,
          description: body.description?.trim() || '',
          status: 'to do',
          status_color: '',
          list_id: listId,
          list_name: '',
          clickup_url: taskData.url,
          is_visible: true,
          last_synced: new Date().toISOString(),
          created_by_user_id: user.id,
          created_by_name: firstName,
        }, { onConflict: 'clickup_id,profile_id' });

      if (cacheError) {
        log.error("Failed to cache task with creator info", { error: cacheError.message });
      } else {
        log.debug("Task cached with creator info", { firstName });
      }
    }

    // Upload attachments if any
    const uploadedAttachments: string[] = [];
    const failedAttachments: string[] = [];

    for (const file of files) {
      try {
        const sanitizedName = sanitizeFilename(file.name);
        log.debug("Uploading attachment", { name: sanitizedName });
        
        // Decode base64 to binary
        const fileBuffer = base64ToArrayBuffer(file.data);
        
        // Validate actual file size
        if (fileBuffer.byteLength > MAX_FILE_SIZE) {
          log.error("File too large", { name: sanitizedName });
          failedAttachments.push(sanitizedName);
          continue;
        }
        
        // Create FormData with the file
        const formData = new FormData();
        formData.append("attachment", new Blob([fileBuffer], { type: file.type }), sanitizedName);

        const attachmentResponse = await fetchWithRetry(
          `https://api.clickup.com/api/v2/task/${taskData.id}/attachment`,
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

        if (!attachmentResponse.ok) {
          await attachmentResponse.text(); // Consume response body
          log.error("Failed to upload attachment", { status: attachmentResponse.status });
          failedAttachments.push(sanitizedName);
        } else {
          log.debug("Attachment uploaded successfully");
          uploadedAttachments.push(sanitizedName);
        }
      } catch (attachError) {
        log.error("Error uploading attachment", { error: (attachError as Error).message });
        failedAttachments.push(sanitizeFilename(file.name));
      }
    }

    // Build response
    const response: {
      success: boolean;
      task: {
        id: string;
        name: string;
        url: string;
        attachments: string[];
      };
      warning?: string;
    } = {
      success: true,
      task: {
        id: taskData.id,
        name: taskData.name,
        url: taskData.url,
        attachments: uploadedAttachments,
      },
    };

    if (failedAttachments.length > 0) {
      response.warning = `Some attachments failed to upload: ${failedAttachments.join(", ")}`;
    }

    // Send notification to ClickUp Chat channel if configured
    const chatChannelId = profile.clickup_chat_channel_id;
    const workspaceId = Deno.env.get("CLICKUP_WORKSPACE_ID");

    if (chatChannelId && workspaceId) {
      const priorityLabels: Record<number, string> = {
        1: "🔴 Urgent",
        2: "🟠 High",
        3: "🟡 Normal",
        4: "🟢 Low"
      };

      const fullName = profile.full_name || "Client";

      const chatMessage = `📋 **New Task Submitted via Client Portal**

**Task:** ${body.name.trim()}
**Priority:** ${priorityLabels[body.priority]}
**Created by:** ${fullName}

[View task](${taskData.url})`;

      try {
        const chatResponse = await fetchWithRetry(
          `https://api.clickup.com/api/v3/workspaces/${workspaceId}/chat/channels/${chatChannelId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: clickupApiToken,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: chatMessage,
            }),
          },
          2,
          log
        );

        if (!chatResponse.ok) {
          const errorText = await chatResponse.text();
          log.error("Failed to send chat notification", { status: chatResponse.status });
        } else {
          log.debug("Chat notification sent successfully");
        }
      } catch (chatError) {
        log.error("Error sending chat notification", { error: (chatError as Error).message });
        // Don't fail the task creation if chat notification fails
      }
    }

    log.info("Task creation completed successfully");

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
