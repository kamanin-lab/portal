// v5.0.0 - Simplified: No ledger binding, portal-safe attachment handling
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
  maxRetries = 2
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options);
      
      if (response.status === 429 || response.status >= 500) {
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 500;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error('Request failed after retries');
}

// Validate task ID format
function isValidTaskId(taskId: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(taskId) && taskId.length <= 50;
}

// ============ COMMENT TYPES & FUNCTIONS ============

interface ClickUpComment {
  id: string;
  comment_text: string;
  user: {
    id: number;
    username: string;
    email: string;
    profilePicture: string | null;
  };
  date: string;
  reply_count?: number;
}

interface TransformedComment {
  id: string;
  text: string;
  displayText: string;
  author: {
    id: number;
    name: string;
    email: string;
    avatar: string | null;
  };
  created_at: string;
  isFromPortal: boolean;
  isTeamToClient?: boolean;
}

// Regex patterns for comment filtering
const CLIENT_PORTAL_REGEX = /^(?:\*\*)?(.+?)(?:\*\*)? \(via Client Portal\):\n\n([\s\S]*)/;
const TEAM_TO_CLIENT_REGEX = /^@client:\s*/i;

// Fetch threaded replies for a comment
async function fetchThreadedReplies(
  commentId: string,
  clickupApiToken: string,
  log: ReturnType<typeof createLogger>
): Promise<ClickUpComment[]> {
  try {
    const response = await fetchWithRetry(
      `https://api.clickup.com/api/v2/comment/${commentId}/reply`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      await response.text();
      return [];
    }

    const data = await response.json();
    log.debug('Fetched comment replies', { commentId, count: data.comments?.length || 0 });
    return data.comments || [];
  } catch (error) {
    log.error('Error fetching replies', { commentId });
    return [];
  }
}

// Parse a single comment (no attachment binding - simplified)
function parseComment(comment: ClickUpComment): TransformedComment {
  const portalMatch = comment.comment_text.match(CLIENT_PORTAL_REGEX);
  const teamToClientMatch = comment.comment_text.match(TEAM_TO_CLIENT_REGEX);
  
  if (portalMatch) {
    const fullNameFromPrefix = portalMatch[1];
    const rawMessage = portalMatch[2];
    const firstName = fullNameFromPrefix.split(' ')[0];
    
    return {
      id: comment.id,
      text: comment.comment_text,
      displayText: rawMessage.trim(),
      author: {
        id: 0,
        name: firstName,
        email: '',
        avatar: null,
      },
      created_at: new Date(parseInt(comment.date)).toISOString(),
      isFromPortal: true,
    };
  } else if (teamToClientMatch) {
    const rawMessage = comment.comment_text.replace(TEAM_TO_CLIENT_REGEX, '');
    const firstName = comment.user.username.split(' ')[0];
    
    return {
      id: comment.id,
      text: comment.comment_text,
      displayText: rawMessage.trim(),
      author: {
        id: comment.user.id,
        name: firstName,
        email: comment.user.email,
        avatar: comment.user.profilePicture,
      },
      created_at: new Date(parseInt(comment.date)).toISOString(),
      isFromPortal: false,
      isTeamToClient: true,
    };
  } else {
    const firstName = comment.user.username.split(' ')[0];
    
    return {
      id: comment.id,
      text: comment.comment_text,
      displayText: comment.comment_text,
      author: {
        id: comment.user.id,
        name: firstName,
        email: comment.user.email,
        avatar: comment.user.profilePicture,
      },
      created_at: new Date(parseInt(comment.date)).toISOString(),
      isFromPortal: false,
    };
  }
}

// ============ MAIN HANDLER ============

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger('fetch-task-comments', requestId);
  
  // Get dynamic CORS headers based on request origin
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      log.warn('Missing authorization header');
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { taskId } = await req.json();
    
    if (!taskId || !isValidTaskId(taskId)) {
      log.warn('Invalid task ID', { taskId });
      return new Response(
        JSON.stringify({ error: "Invalid task ID format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    log.info('Fetching comments', { taskId });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !clickupApiToken) {
      log.error('Missing required configuration');
      return new Response(
        JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(token);
    
    if (userError || !user) {
      log.warn('Token verification failed');
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = user.id;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch comments from ClickUp
    const commentsResponse = await fetchWithRetry(
      `https://api.clickup.com/api/v2/task/${taskId}/comment`,
      {
        headers: {
          Authorization: clickupApiToken,
          "Content-Type": "application/json",
        },
      }
    );

    if (!commentsResponse.ok) {
      await commentsResponse.text();
      log.error('ClickUp comments API failed', { status: commentsResponse.status });
      return new Response(
        JSON.stringify({ error: "Failed to fetch comments" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const commentsData = await commentsResponse.json();
    const comments: ClickUpComment[] = commentsData.comments || [];
    
    log.info('Comments fetched from ClickUp', { count: comments.length });

    // Filter client-facing comments and collect them with replies
    const clientFacingComments: ClickUpComment[] = [];
    
    for (const comment of comments) {
      const portalMatch = CLIENT_PORTAL_REGEX.test(comment.comment_text);
      const teamToClientMatch = TEAM_TO_CLIENT_REGEX.test(comment.comment_text);
      
      if (portalMatch || teamToClientMatch) {
        clientFacingComments.push(comment);
        
        const replyCount = comment.reply_count || 0;
        if (replyCount > 0) {
          const replies = await fetchThreadedReplies(comment.id, clickupApiToken, log);
          clientFacingComments.push(...replies);
        }
      }
    }

    log.info('Client-facing comments filtered', { count: clientFacingComments.length });

    // Transform comments (no attachment binding - simplified)
    const transformedComments: TransformedComment[] = clientFacingComments.map(comment => 
      parseComment(comment)
    );

    // Cache comments with protection for portal comments
    // For portal comments: don't overwrite attachments if they exist (writer wars protection)
    if (transformedComments.length > 0) {
      for (const comment of transformedComments) {
        if (comment.isFromPortal) {
          // Check if portal comment already has attachments
          const { data: existing } = await supabaseAdmin
            .from("comment_cache")
            .select("attachments")
            .eq("clickup_comment_id", comment.id)
            .eq("profile_id", userId)
            .maybeSingle();
          
          // If exists with attachments, skip (don't overwrite portal data)
          if (existing?.attachments && Array.isArray(existing.attachments) && existing.attachments.length > 0) {
            log.debug('Skipping portal comment (already has attachments)', { id: comment.id });
            continue;
          }
        }

        // Upsert this comment
        // For non-portal: set attachments to null (we don't show ClickUp attachments)
        // For portal: only set if creating new (protection above prevents overwrite)
        const { error: upsertError } = await supabaseAdmin
          .from("comment_cache")
          .upsert({
            clickup_comment_id: comment.id,
            task_id: taskId,
            profile_id: userId,
            comment_text: comment.text,
            display_text: comment.displayText,
            author_id: comment.author.id,
            author_name: comment.author.name,
            author_email: comment.author.email,
            author_avatar: comment.author.avatar,
            clickup_created_at: comment.created_at,
            last_synced: new Date().toISOString(),
            is_from_portal: comment.isFromPortal,
            attachments: null, // No ClickUp attachments - only portal uploads get attachments
          }, {
            onConflict: "clickup_comment_id,profile_id",
          });

        if (upsertError) {
          log.error('Failed to cache comment', { error: upsertError.message, id: comment.id });
        }
      }
      log.info('Comments cached', { count: transformedComments.length });
    }

    // Sort by newest first
    transformedComments.sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    // For portal comments, fetch their cached attachments (these are authoritative)
    const portalCommentIds = transformedComments
      .filter(c => c.isFromPortal)
      .map(c => c.id);

    let portalAttachmentMap: Record<string, any[]> = {};
    if (portalCommentIds.length > 0) {
      const { data: cachedPortal } = await supabaseAdmin
        .from("comment_cache")
        .select("clickup_comment_id, attachments")
        .eq("profile_id", userId)
        .in("clickup_comment_id", portalCommentIds);
      
      if (cachedPortal) {
        for (const row of cachedPortal) {
          if (row.attachments && Array.isArray(row.attachments) && row.attachments.length > 0) {
            portalAttachmentMap[row.clickup_comment_id] = row.attachments;
          }
        }
      }
      log.debug('Portal attachments from cache', { count: Object.keys(portalAttachmentMap).length });
    }

    // Return comments - portal attachments from cache, ClickUp attachments empty
    const responseComments = transformedComments.map((c) => ({
      id: c.id,
      text: c.displayText,
      author: c.author,
      created_at: c.created_at,
      attachments: c.isFromPortal ? (portalAttachmentMap[c.id] || []) : [],
      isFromPortal: c.isFromPortal,
    }));

    log.info('Returning comments', { count: responseComments.length });

    return new Response(
      JSON.stringify({ comments: responseComments }),
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
