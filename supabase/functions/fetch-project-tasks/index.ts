import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders, corsHeaders as defaultCorsHeaders } from "../_shared/cors.ts";
import { parseClickUpTimestamp } from "../_shared/utils.ts";
import {
  getPhaseOptionId,
  getVisibilityFromFields,
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

// Hash task name+description for change detection (D-01)
async function computeContentHash(name: string, description: string): Promise<string> {
  const content = `${name}::${description}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// Parse milestone_order custom field value (duplicated from transforms-project.ts — Edge Functions cannot import from src/)
function parseMilestoneOrder(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractMilestoneOrder(customFields: ClickUpCustomField[]): number | null {
  const field = customFields?.find(
    f => typeof f.name === 'string' && f.name.trim().toLowerCase() === 'milestone order'
  );
  return field ? parseMilestoneOrder(field.value) : null;
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

// AI Enrichment: Generate step descriptions via OpenRouter (GPT-4o-mini)
async function generateStepEnrichment(
  tasks: Array<{ clickup_id: string; name: string; description: string; contentHash: string }>,
  log: ReturnType<typeof createLogger>
): Promise<Array<{ clickup_task_id: string; why_it_matters: string; what_becomes_fixed: string; contentHash: string }>> {
  const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openrouterKey) {
    log.debug("No OPENROUTER_API_KEY — skipping AI enrichment");
    return [];
  }

  const prompt = `Du bist ein Projektberater für eine Webagentur. Für jeden der folgenden Projektschritte (Tasks), generiere zwei kurze deutsche Texte:
1. "why_it_matters" — Warum ist dieser Schritt wichtig für den Kunden? (1-2 Sätze)
2. "what_becomes_fixed" — Was wird mit Abschluss dieses Schritts festgelegt? (1-2 Sätze)

Antworte NUR mit einem JSON-Array. Kein Markdown, keine Erklärung.

Tasks:
${tasks.map((t, i) => `${i}. "${t.name}" — ${t.description || "Keine Beschreibung"}`).join("\n")}

Format:
[{"task_index": 0, "why_it_matters": "...", "what_becomes_fixed": "..."}, ...]`;

  try {
    const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey}`,
        "HTTP-Referer": "https://portal.kamanin.at",
        "X-Title": "KAMANIN Portal Enrichment",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        max_tokens: 4000,
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }],
      }),
    }, 30000); // 30s timeout for AI

    if (!response.ok) {
      log.warn("OpenRouter API error", { status: response.status });
      return [];
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || "";
    // Strip markdown code block wrapper if present
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) return [];

    return parsed.map((item: { task_index: number; why_it_matters: string; what_becomes_fixed: string }) => ({
      clickup_task_id: tasks[item.task_index]?.clickup_id || "",
      why_it_matters: item.why_it_matters || "",
      what_becomes_fixed: item.what_becomes_fixed || "",
      contentHash: tasks[item.task_index]?.contentHash || "",
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

    log.info("Using frozen ClickUp hardening contract", {
      approvedFolderUrl: TEST_FOLDER_CONTRACT.approvedFolderUrl,
      visibilityFieldName: TEST_FOLDER_CONTRACT.visibilityFieldName,
      publicCommentPrefix: TEST_FOLDER_CONTRACT.publicCommentPrefix,
    });

    // Get existing step_enrichment rows with content_hash for change detection (D-02)
    const { data: existingEnrichments } = await supabaseService
      .from("step_enrichment")
      .select("clickup_task_id, content_hash");
    const enrichmentHashMap = new Map<string, string>(
      (existingEnrichments || []).map(e => [e.clickup_task_id, e.content_hash ?? ""])
    );

    let totalSynced = 0;
    const newTasksForEnrichment: Array<{ clickup_id: string; name: string; description: string; contentHash: string }> = [];
    const taskMilestoneMap = new Map<string, number | null>();

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
            const chapterConfigId = resolveChapterConfigId(phaseOptionId, chapterMap);

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

        // Hash-based change detection: collect tasks needing re-enrichment (D-02)
        for (const task of visibleTasks) {
          const currentHash = await computeContentHash(task.name, task.description || "");
          const storedHash = enrichmentHashMap.get(task.id);
          if (!storedHash || storedHash !== currentHash) {
            newTasksForEnrichment.push({
              clickup_id: task.id,
              name: task.name,
              description: task.description || "",
              contentHash: currentHash,
            });
          }
          // Always record milestone_order for sort_order updates (D-11)
          taskMilestoneMap.set(task.id, extractMilestoneOrder(task.custom_fields || []));
        }
      }
    }

    log.info("Total tasks synced", { count: totalSynced });

    // AI Enrichment for changed/new tasks (batched by 10)
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
                sort_order: taskMilestoneMap.get(e.clickup_task_id) ?? 0,
                content_hash: e.contentHash,
                last_enriched_at: new Date().toISOString(),
              })),
              { onConflict: "clickup_task_id" }
            );

          if (enrichError) {
            log.warn("Enrichment upsert failed", { error: enrichError.message });
          } else {
            log.info("Enrichment saved", { count: enrichments.length });
          }
        }
      }
    }

    // Update sort_order for tasks that were NOT re-enriched (D-11 — keep sort_order current even without content change)
    const sortOrderUpdates: Array<{ clickup_task_id: string; sort_order: number }> = [];
    for (const [taskId, order] of taskMilestoneMap.entries()) {
      if (!newTasksForEnrichment.some(t => t.clickup_id === taskId)) {
        sortOrderUpdates.push({ clickup_task_id: taskId, sort_order: order ?? 0 });
      }
    }
    if (sortOrderUpdates.length > 0) {
      for (const update of sortOrderUpdates) {
        await supabaseService
          .from("step_enrichment")
          .update({ sort_order: update.sort_order })
          .eq("clickup_task_id", update.clickup_task_id);
      }
      log.info("sort_order updated for existing enrichments", { count: sortOrderUpdates.length });
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
