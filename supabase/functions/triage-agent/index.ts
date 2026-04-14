import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchWpSiteAudit, formatAuditForPrompt, WpSiteAudit } from "../_shared/wp-audit.ts";
import { WP_TRIAGE_TOOLS, WpToolDef, executeWpTool } from "../_shared/wp-tools.ts";
import { TRIAGE_AGENT_PROMPT } from "../_shared/skills/triage-agent-prompt.ts";

// ---------------------------------------------------------------------------
// Local fetchWithTimeout
// ---------------------------------------------------------------------------
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ---------------------------------------------------------------------------
// Cost tracking (Claude Haiku via OpenRouter)
// ---------------------------------------------------------------------------
const INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 4.0 / 1_000_000;

const MAX_TOOL_ITERATIONS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TriageInput {
  clickup_task_id: string;
  clickup_task_name: string;
  description: string;
  list_id: string;
  list_name: string;
  profile_id: string | null;
}

interface TriageOutput {
  task_type: string;
  complexity: "simple" | "medium" | "complex";
  hours_estimate: number;
  credits: number;
  confidence: "high" | "medium" | "low";
  reasoning: string;
  questions: string[];
}

type Message = { role: string; content: unknown; tool_calls?: unknown };

// ---------------------------------------------------------------------------
// OpenRouter call — with optional tools (agentic mode)
// ---------------------------------------------------------------------------
async function callOpenRouter(
  messages: Message[],
  openrouterKey: string,
  tools?: WpToolDef[],
): Promise<Response> {
  const body: Record<string, unknown> = {
    model: "anthropic/claude-haiku-4.5",
    max_tokens: tools?.length ? 2048 : 512,
    temperature: 0,
    messages,
  };

  if (tools?.length) {
    body.tools = tools;
    // response_format: json_object is incompatible with tool use
  } else {
    body.response_format = { type: "json_object" };
  }

  return await fetchWithTimeout(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openrouterKey}`,
        "HTTP-Referer": "https://portal.kamanin.at",
        "X-Title": "KAMANIN Triage Agent",
      },
      body: JSON.stringify(body),
    },
    30000,
  );
}

// ---------------------------------------------------------------------------
// Parse JSON estimate from a text string (handles markdown fences + preamble)
// ---------------------------------------------------------------------------
function extractJson(text: string): TriageOutput | null {
  let t = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  if (!t.startsWith("{")) {
    const match = t.match(/\{[\s\S]*\}/);
    if (match) t = match[0];
  }
  try {
    return JSON.parse(t) as TriageOutput;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Agentic triage loop
// Returns parsed output + total token counts
// ---------------------------------------------------------------------------
async function runAgenticTriage(
  systemPrompt: string,
  userMessage: string,
  openrouterKey: string,
  wpBase: string | null,
  wpAuth: string | null,
  log: ReturnType<typeof createLogger>,
): Promise<{ parsed: TriageOutput | null; inputTokens: number; outputTokens: number }> {
  const tools = wpBase && wpAuth ? WP_TRIAGE_TOOLS : [];
  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  let inputTokens = 0;
  let outputTokens = 0;
  let parsed: TriageOutput | null = null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const resp = await callOpenRouter(messages, openrouterKey, tools);

    if (!resp.ok) {
      const errBody = await resp.text();
      log.error("OpenRouter non-OK response", { status: resp.status, body: errBody.slice(0, 400) });
      break;
    }

    const data = await resp.json();
    inputTokens += data.usage?.prompt_tokens ?? 0;
    outputTokens += data.usage?.completion_tokens ?? 0;

    const choice = data.choices?.[0];
    if (!choice) {
      log.error("OpenRouter returned no choices", { raw: JSON.stringify(data).slice(0, 300) });
      break;
    }

    const assistantMessage = choice.message;
    const finishReason: string = choice.finish_reason ?? "stop";
    const toolCalls = assistantMessage?.tool_calls;

    // Push assistant message to history
    messages.push({
      role: "assistant",
      content: assistantMessage?.content ?? null,
      tool_calls: toolCalls,
    });

    // ---- Final answer ----
    if (finishReason === "stop" || !toolCalls?.length) {
      const text: string = assistantMessage?.content ?? "";
      if (!text) {
        log.error("OpenRouter returned empty content on final turn");
        break;
      }
      parsed = extractJson(text);
      if (!parsed) {
        log.warn("JSON parse failed on final turn", { text: text.slice(0, 300) });
      }
      log.info(`Agentic loop complete in ${i + 1} iteration(s)`);
      break;
    }

    // ---- Tool calls — execute in parallel ----
    log.info(`Tool calls in iteration ${i + 1}`, {
      tools: toolCalls.map((tc: { function: { name: string } }) => tc.function.name),
    });

    const toolResults = await Promise.all(
      toolCalls.map(async (tc: { id: string; function: { name: string; arguments: string } }) => {
        let toolInput: Record<string, unknown> = {};
        try {
          toolInput = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch { /* ignore parse error, use empty input */ }

        const result = await executeWpTool(wpBase!, wpAuth!, tc.function.name, toolInput);
        log.info(`Tool result: ${tc.function.name}`, { resultLen: result.length });
        return { role: "tool", tool_call_id: tc.id, content: result };
      }),
    );

    messages.push(...toolResults);
  }

  return { parsed, inputTokens, outputTokens };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const correlationId = crypto.randomUUID().slice(0, 8);
  const log = createLogger("triage-agent", correlationId);
  log.info("Triage agent invoked", { method: req.method });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let jobId: string | null = null;
  let startedAt = Date.now();

  try {
    // ------------------------------------------------------------------
    // 1. Parse and validate input
    // ------------------------------------------------------------------
    let input: TriageInput;
    try {
      input = await req.json() as TriageInput;
    } catch {
      log.warn("Failed to parse request body as JSON");
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid JSON body", correlationId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const missingFields: string[] = [];
    if (!input.clickup_task_id) missingFields.push("clickup_task_id");
    if (!input.clickup_task_name) missingFields.push("clickup_task_name");
    if (!input.list_id) missingFields.push("list_id");
    if (!input.list_name) missingFields.push("list_name");

    if (missingFields.length > 0) {
      log.warn("Missing required fields", { missingFields });
      return new Response(
        JSON.stringify({ ok: false, code: "BAD_REQUEST", message: `Missing fields: ${missingFields.join(", ")}`, correlationId }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log.info("Input validated", {
      taskId: input.clickup_task_id,
      taskName: input.clickup_task_name,
      listId: input.list_id,
    });

    // ------------------------------------------------------------------
    // 2. Insert agent_jobs row (status: 'running')
    // ------------------------------------------------------------------
    startedAt = Date.now();

    const { data: job, error: insertErr } = await supabase
      .from("agent_jobs")
      .insert({
        clickup_task_id: input.clickup_task_id,
        clickup_task_name: input.clickup_task_name,
        profile_id: input.profile_id,
        job_type: "triage",
        status: "running",
        input: {
          task_name: input.clickup_task_name,
          description: input.description,
          list_id: input.list_id,
          list_name: input.list_name,
        },
        model_used: "anthropic/claude-haiku-4.5",
      })
      .select()
      .single();

    if (insertErr) {
      log.error("Failed to insert agent_jobs row", { error: insertErr.message });
      return new Response(
        JSON.stringify({ ok: false, code: "DB_ERROR", message: "Failed to create job record", correlationId }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    jobId = job.id;
    log.info("agent_jobs row created", { jobId });

    // ------------------------------------------------------------------
    // 3. WordPress site audit (basic context: plugins, WP version, operator notes)
    // ------------------------------------------------------------------
    let siteAudit: WpSiteAudit | null = null;
    let wpBase: string | null = null;
    let wpAuth: string | null = null;

    if (input.profile_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("wp_mcp_url")
        .eq("id", input.profile_id)
        .maybeSingle();

      const wpMcpUrl = profile?.wp_mcp_url ?? null;
      siteAudit = await fetchWpSiteAudit(wpMcpUrl, log);

      // Prepare credentials for tool execution in agentic loop
      const wpUser = Deno.env.get("WP_MCP_USER");
      const wpPass = Deno.env.get("WP_MCP_APP_PASS");
      if (wpMcpUrl && wpUser && wpPass) {
        wpBase = wpMcpUrl.replace(/\/$/, "");
        wpAuth = `Basic ${btoa(`${wpUser}:${wpPass}`)}`;
      }

      if (siteAudit) {
        log.info("WordPress site audit fetched", {
          siteName: siteAudit.site_name,
          pluginCount: siteAudit.active_plugins.length,
        });
      } else {
        log.info("WordPress site audit not available — continuing without it");
      }
    }

    const auditFetched = siteAudit !== null;

    // ------------------------------------------------------------------
    // 4. Check OpenRouter key
    // ------------------------------------------------------------------
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!openrouterKey) {
      log.error("OPENROUTER_API_KEY not set");
      await supabase.from("agent_jobs").update({
        status: "failed",
        error_message: "OPENROUTER_API_KEY not configured",
        duration_ms: Date.now() - startedAt,
      }).eq("id", jobId);
      return new Response(
        JSON.stringify({ ok: false, code: "CONFIG_ERROR", message: "OpenRouter key not configured", correlationId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ------------------------------------------------------------------
    // 5. Build user message
    // ------------------------------------------------------------------
    let userMessage = `Task: ${input.clickup_task_name}\nDescription: ${input.description || "No description provided."}\nList: ${input.list_name}`;
    if (siteAudit) {
      userMessage += `\n\n${formatAuditForPrompt(siteAudit)}`;
    }
    if (wpBase) {
      userMessage += `\n\nWordPress tools are available. Use them to gather relevant context before estimating.`;
    }

    // ------------------------------------------------------------------
    // 6. Run agentic triage loop
    // ------------------------------------------------------------------
    log.info("Starting agentic triage", {
      hasTools: wpBase !== null,
      toolCount: wpBase ? WP_TRIAGE_TOOLS.length : 0,
    });

    const { parsed, inputTokens, outputTokens } = await runAgenticTriage(
      TRIAGE_AGENT_PROMPT,
      userMessage,
      openrouterKey,
      wpBase,
      wpAuth,
      log,
    );

    // ------------------------------------------------------------------
    // 7. Handle failure
    // ------------------------------------------------------------------
    if (!parsed) {
      log.error("Agentic triage returned no valid JSON — marking job as failed");
      await supabase.from("agent_jobs").update({
        status: "failed",
        error_message: "Triage agent returned no valid JSON",
        duration_ms: Date.now() - startedAt,
      }).eq("id", jobId);
      return new Response(
        JSON.stringify({ ok: false, code: "TRIAGE_FAILED", message: "Triage agent returned no valid JSON", correlationId }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log.info("Triage output parsed successfully", {
      taskType: parsed.task_type,
      complexity: parsed.complexity,
      hours: parsed.hours_estimate,
      credits: parsed.credits,
      confidence: parsed.confidence,
    });

    // ------------------------------------------------------------------
    // 8. Calculate cost
    // ------------------------------------------------------------------
    const costUsd = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;

    // ------------------------------------------------------------------
    // 9. Build ClickUp comment
    // ------------------------------------------------------------------
    let commentText = `[Triage] 🤖 Automated Task Assessment\n\n`;
    commentText += `📋 Type: ${parsed.task_type}\n`;
    commentText += `⚡ Complexity: ${parsed.complexity}\n`;
    commentText += `⏱ Estimated time: ${parsed.hours_estimate}h\n`;
    commentText += `🎯 Confidence: ${parsed.confidence}\n\n`;
    commentText += `💭 Reasoning:\n${parsed.reasoning}\n`;

    if (parsed.questions && parsed.questions.length > 0) {
      commentText += `\n❓ Open questions:\n`;
      for (const q of parsed.questions) {
        commentText += `• ${q}\n`;
      }
    }

    if (auditFetched && siteAudit) {
      const pluginCount = siteAudit.active_plugins.length;
      commentText += `\n🔍 Site context: ${siteAudit.site_name} — WP ${siteAudit.wp_version}, ${pluginCount} plugins\n`;
    }

    commentText += `\n---\nReply with:\n`;
    commentText += `✅ [approve] — accept estimate\n`;
    commentText += `✅ [approve: Xh Ycr] — accept with corrections (e.g. [approve: 3h 5cr])\n`;
    commentText += `❌ [reject: reason] — reject and explain`;

    // ------------------------------------------------------------------
    // 10. POST comment to ClickUp
    // ------------------------------------------------------------------
    const clickupToken = Deno.env.get("CLICKUP_API_TOKEN");
    let clickupCommentId: string | null = null;
    let commentPosted = false;

    try {
      const commentResp = await fetchWithTimeout(
        `https://api.clickup.com/api/v2/task/${input.clickup_task_id}/comment`,
        {
          method: "POST",
          headers: {
            Authorization: clickupToken!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ comment_text: commentText, notify_all: false }),
        },
        15000,
      );

      if (commentResp.ok) {
        const commentData = await commentResp.json();
        clickupCommentId = commentData.id ?? null;
        commentPosted = true;
        log.info("Triage comment posted to ClickUp", {
          taskId: input.clickup_task_id,
          commentId: clickupCommentId,
        });
      } else {
        log.error("ClickUp comment POST failed", {
          status: commentResp.status,
          taskId: input.clickup_task_id,
        });
      }
    } catch (err) {
      log.error("ClickUp comment POST threw an exception", { error: String(err) });
    }

    // ------------------------------------------------------------------
    // 11. Update agent_jobs
    // ------------------------------------------------------------------
    await supabase.from("agent_jobs").update({
      status: commentPosted ? "awaiting_hitl" : "failed",
      output: parsed,
      cost_usd: costUsd,
      duration_ms: Date.now() - startedAt,
      audit_fetched: auditFetched,
      clickup_comment_id: clickupCommentId,
      error_message: commentPosted ? null : "ClickUp comment POST failed",
    }).eq("id", jobId);

    log.info("Job finalized", {
      status: commentPosted ? "awaiting_hitl" : "failed",
      costUsd,
      durationMs: Date.now() - startedAt,
    });

    // ------------------------------------------------------------------
    // 12. Return response
    // ------------------------------------------------------------------
    return new Response(
      JSON.stringify({
        ok: commentPosted,
        code: commentPosted ? "TRIAGE_COMPLETE" : "TRIAGE_FAILED",
        message: commentPosted ? "Triage complete" : "Comment post failed",
        job_id: jobId,
        comment_id: clickupCommentId,
        correlationId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    log.error("Unhandled error in triage-agent", { error: String(err) });

    if (jobId) {
      try {
        await supabase.from("agent_jobs").update({
          status: "failed",
          error_message: `Unhandled error: ${String(err)}`,
          duration_ms: Date.now() - startedAt,
        }).eq("id", jobId);
      } catch (updateErr) {
        log.error("Failed to update agent_jobs after unhandled error", { error: String(updateErr) });
      }
    }

    return new Response(
      JSON.stringify({
        ok: false,
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred",
        correlationId,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
