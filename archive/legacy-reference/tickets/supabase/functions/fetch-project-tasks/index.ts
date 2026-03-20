import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { parseClickUpTimestamp } from "../_shared/utils.ts";

// Fetch with timeout (10 seconds default)
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
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
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError || new Error("Request failed after retries");
}

interface ClickUpCustomField {
  id: string;
  name: string;
  type: string;
  value?: unknown;
  type_config?: { options?: Array<{ id: string; name: string; orderindex: number }> };
}

interface ClickUpTask {
  id: string;
  name: string;
  description: string;
  status: { status: string; color: string; type: string };
  priority: { id: string; priority: string; color: string } | null;
  due_date: string | null;
  date_created: string;
  date_updated: string;
  assignees: Array<{ id: number; username: string; email: string; profilePicture: string | null }>;
  url: string;
  list: { id: string; name: string };
  custom_fields?: ClickUpCustomField[];
  attachments?: Array<{ id: string; title: string; url: string; type: string; size: number; date: string }>;
}

// Helper: Check if a value represents "visible"
function isVisibleValue(value: unknown): boolean {
  return value === true || value === 1 || value === "true" || value === "1";
}

// Helper: Find visibility field value from custom_fields
function getVisibilityFromFields(
  customFields: ClickUpCustomField[] | undefined,
  visibleFieldId: string
): { found: boolean; visible: boolean } {
  if (!customFields || !Array.isArray(customFields)) return { found: false, visible: false };
  const field = customFields.find((f) => f.id === visibleFieldId);
  if (!field || field.value === undefined || field.value === null) return { found: false, visible: false };
  return { found: true, visible: isVisibleValue(field.value) };
}

// Helper: Get phase custom field option ID from task
function getPhaseOptionId(
  customFields: ClickUpCustomField[] | undefined,
  phaseFieldId: string
): string | null {
  if (!customFields || !phaseFieldId) return null;
  const field = customFields.find((f) => f.id === phaseFieldId);
  if (!field || !field.value) return null;
  // Dropdown fields store the option index as a number; the actual option UUID is in type_config
  // But ClickUp API returns the option orderindex as value for dropdown fields
  // We need to match by value → type_config.options[orderindex].id
  if (field.type_config?.options && typeof field.value === 'number') {
    const option = field.type_config.options.find(o => o.orderindex === field.value);
    return option?.id || null;
  }
  // If value is already a string UUID (some ClickUp versions), use directly
  if (typeof field.value === 'string') return field.value;
  return null;
}

// Fetch single task detail (fallback for visibility check)
async function fetchTaskDetail(
  taskId: string,
  clickupApiToken: string,
  log?: ReturnType<typeof createLogger>
): Promise<ClickUpTask | null> {
  try {
    const response = await fetchWithTimeout(`https://api.clickup.com/api/v2/task/${taskId}`, {
      headers: { Authorization: clickupApiToken, "Content-Type": "application/json" },
    });
    if (!response.ok) { await response.text(); return null; }
    const text = await response.text();
    if (!text || text.trim() === "") return null;
    return JSON.parse(text) as ClickUpTask;
  } catch {
    log?.error("Failed to fetch task detail");
    return null;
  }
}

// Fetch all tasks from a single list with pagination
async function fetchAllTasksFromList(
  listId: string,
  clickupApiToken: string,
  log?: ReturnType<typeof createLogger>
): Promise<ClickUpTask[]> {
  const allTasks: ClickUpTask[] = [];
  let page = 0;
  const maxPages = 20;

  while (page < maxPages) {
    const url = `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=true&page=${page}`;
    try {
      const response = await fetchWithRetry(url, {
        headers: { Authorization: clickupApiToken, "Content-Type": "application/json" },
      }, 2, log);
      if (!response.ok) { await response.text(); break; }
      const text = await response.text();
      if (!text || text.trim() === "") break;
      const data = JSON.parse(text);
      const tasks: ClickUpTask[] = data.tasks || [];
      if (tasks.length === 0) break;
      allTasks.push(...tasks);
      page++;
      if (tasks.length < 100) break;
    } catch (err) {
      log?.error(`Error fetching page ${page}`, { error: (err as Error).message });
      break;
    }
  }
  return allTasks;
}

// Extract attachments from task (ClickUp returns them in raw_data)
function extractAttachments(task: ClickUpTask): Array<{ name: string; url: string; size: number; type: string; date: string }> {
  if (!task.attachments || !Array.isArray(task.attachments)) return [];
  return task.attachments.map(att => ({
    name: att.title || "Unnamed",
    url: att.url || "",
    size: att.size || 0,
    type: att.type || "",
    date: att.date ? new Date(parseInt(att.date)).toISOString() : new Date().toISOString(),
  }));
}

// AI Enrichment: Generate step descriptions via Claude API
async function generateStepEnrichment(
  tasks: Array<{ clickup_id: string; name: string; description: string }>,
  log: ReturnType<typeof createLogger>
): Promise<Array<{ clickup_task_id: string; why_it_matters: string; what_becomes_fixed: string }>> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) {
    log.debug("No ANTHROPIC_API_KEY — skipping AI enrichment");
    return [];
  }

  const prompt = `Du bist ein Projektberater für eine Webagentur. Für jeden der folgenden Projektschritte (Tasks), generiere zwei kurze deutsche Texte:
1. "why_it_matters" — Warum ist dieser Schritt wichtig für den Kunden? (1-2 Sätze)
2. "what_becomes_fixed" — Was wird mit Abschluss dieses Schritts festgelegt? (1-2 Sätze)

Antworte NUR mit einem JSON-Array. Kein Markdown, keine Erklärung.

Tasks:
${tasks.map((t, i) => `${i + 1}. "${t.name}" — ${t.description || "Keine Beschreibung"}`).join("\n")}

Format:
[{"task_index": 0, "why_it_matters": "...", "what_becomes_fixed": "..."}, ...]`;

  try {
    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      }),
    }, 30000); // 30s timeout for AI

    if (!response.ok) {
      log.warn("Claude API error", { status: response.status });
      return [];
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: { task_index: number; why_it_matters: string; what_becomes_fixed: string }) => ({
      clickup_task_id: tasks[item.task_index]?.clickup_id || "",
      why_it_matters: item.why_it_matters || "",
      what_becomes_fixed: item.what_becomes_fixed || "",
    })).filter((e: { clickup_task_id: string }) => e.clickup_task_id);
  } catch (err) {
    log.warn("AI enrichment failed", { error: (err as Error).message });
    return [];
  }
}

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID().slice(0, 8);
  const log = createLogger("fetch-project-tasks", requestId);

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Validate auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");
    const visibleFieldId = Deno.env.get("CLICKUP_VISIBLE_FIELD_ID");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey || !clickupApiToken) {
      log.error("Missing required configuration");
      return new Response(JSON.stringify({ error: "Service temporarily unavailable" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create Supabase client with user's auth (for RLS)
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    log.info("Request received");

    // Service client for writes (bypasses RLS)
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's project access
    const { data: projectAccess, error: accessError } = await supabase
      .from("project_access")
      .select("project_config_id")
      .eq("profile_id", user.id);

    if (accessError || !projectAccess || projectAccess.length === 0) {
      log.info("No project access for user");
      return new Response(JSON.stringify({ projects: [], message: "No projects configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const projectConfigIds = projectAccess.map(pa => pa.project_config_id);

    // Get project configs
    const { data: projectConfigs } = await supabase
      .from("project_config")
      .select("id, clickup_list_id, clickup_phase_field_id")
      .in("id", projectConfigIds)
      .eq("is_active", true);

    if (!projectConfigs || projectConfigs.length === 0) {
      return new Response(JSON.stringify({ projects: [], message: "No active projects" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Get chapter configs for all projects (for phase mapping)
    const { data: chapterConfigs } = await supabaseService
      .from("chapter_config")
      .select("id, project_config_id, clickup_cf_option_id")
      .in("project_config_id", projectConfigIds)
      .eq("is_active", true);

    const chapterMap = new Map<string, string>(); // clickup_cf_option_id → chapter_config.id
    for (const cc of chapterConfigs || []) {
      if (cc.clickup_cf_option_id) {
        chapterMap.set(cc.clickup_cf_option_id, cc.id);
      }
    }

    // Get existing step_enrichment IDs (to skip AI generation for existing)
    const { data: existingEnrichments } = await supabaseService
      .from("step_enrichment")
      .select("clickup_task_id");
    const enrichedTaskIds = new Set((existingEnrichments || []).map(e => e.clickup_task_id));

    let totalSynced = 0;
    const newTasksForEnrichment: Array<{ clickup_id: string; name: string; description: string }> = [];

    for (const project of projectConfigs) {
      const listId = project.clickup_list_id;
      if (!listId || !/^[a-zA-Z0-9]+$/.test(listId)) {
        log.error("Invalid list ID", { projectId: project.id });
        continue;
      }

      log.info("Fetching tasks from ClickUp list", { listId, projectId: project.id });

      const rawTasks = await fetchAllTasksFromList(listId, clickupApiToken, log);
      log.info("Tasks fetched", { count: rawTasks.length });

      // Filter by visibility
      const visibleTasks: ClickUpTask[] = [];

      if (!visibleFieldId) {
        visibleTasks.push(...rawTasks);
      } else {
        const needsFallback: ClickUpTask[] = [];
        for (const task of rawTasks) {
          const { found, visible } = getVisibilityFromFields(task.custom_fields, visibleFieldId);
          if (found) {
            if (visible) visibleTasks.push(task);
          } else {
            needsFallback.push(task);
          }
        }

        // Fallback: fetch task details for visibility check (max 50, batched by 5)
        const toFetch = needsFallback.slice(0, 50);
        for (let i = 0; i < toFetch.length; i += 5) {
          const batch = toFetch.slice(i, i + 5);
          const details = await Promise.all(batch.map(t => fetchTaskDetail(t.id, clickupApiToken, log)));
          for (let j = 0; j < batch.length; j++) {
            const detail = details[j];
            if (detail) {
              const { visible } = getVisibilityFromFields(detail.custom_fields, visibleFieldId);
              if (visible) visibleTasks.push(detail);
            }
          }
        }
      }

      log.info("Visible tasks after filtering", { count: visibleTasks.length });

      // Upsert into project_task_cache
      if (visibleTasks.length > 0) {
        const BATCH_SIZE = 50;
        for (let i = 0; i < visibleTasks.length; i += BATCH_SIZE) {
          const batch = visibleTasks.slice(i, i + BATCH_SIZE).map(task => {
            const phaseOptionId = getPhaseOptionId(task.custom_fields, project.clickup_phase_field_id || "");
            const chapterConfigId = phaseOptionId ? chapterMap.get(phaseOptionId) || null : null;

            return {
              clickup_id: task.id,
              project_config_id: project.id,
              chapter_config_id: chapterConfigId,
              name: task.name,
              description: task.description || "",
              status: task.status.status,
              status_color: task.status.color,
              due_date: task.due_date ? new Date(parseInt(task.due_date)).toISOString() : null,
              assignees: task.assignees.map(a => ({ id: a.id, username: a.username, email: a.email, avatar: a.profilePicture })),
              attachments: extractAttachments(task),
              raw_data: task,
              is_visible: true,
              last_synced: new Date().toISOString(),
              last_activity_at: parseClickUpTimestamp(task.date_updated).toISOString(),
            };
          });

          const { error: upsertError } = await supabaseService
            .from("project_task_cache")
            .upsert(batch, { onConflict: "clickup_id,project_config_id" });

          if (upsertError) {
            log.error("Batch upsert failed", { error: upsertError.message });
          } else {
            totalSynced += batch.length;
          }
        }

        // Collect new tasks for AI enrichment
        for (const task of visibleTasks) {
          if (!enrichedTaskIds.has(task.id)) {
            newTasksForEnrichment.push({
              clickup_id: task.id,
              name: task.name,
              description: task.description || "",
            });
          }
        }
      }
    }

    log.info("Total tasks synced", { count: totalSynced });

    // AI Enrichment for new tasks (batched by 10)
    if (newTasksForEnrichment.length > 0) {
      log.info("Generating AI enrichment", { newTasks: newTasksForEnrichment.length });

      const AI_BATCH_SIZE = 10;
      for (let i = 0; i < newTasksForEnrichment.length; i += AI_BATCH_SIZE) {
        const batch = newTasksForEnrichment.slice(i, i + AI_BATCH_SIZE);
        const enrichments = await generateStepEnrichment(batch, log);

        if (enrichments.length > 0) {
          const { error: enrichError } = await supabaseService
            .from("step_enrichment")
            .upsert(
              enrichments.map(e => ({
                clickup_task_id: e.clickup_task_id,
                why_it_matters: e.why_it_matters,
                what_becomes_fixed: e.what_becomes_fixed,
              })),
              { onConflict: "clickup_task_id", ignoreDuplicates: true }
            );

          if (enrichError) {
            log.warn("Enrichment upsert failed", { error: enrichError.message });
          } else {
            log.info("Enrichment saved", { count: enrichments.length });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, tasksSynced: totalSynced, enriched: newTasksForEnrichment.length }),
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
