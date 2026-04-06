import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { createLogger } from "../_shared/logger.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchWpSiteAudit, formatAuditForPrompt, WpSiteAudit } from "../_shared/wp-audit.ts";

// ---------------------------------------------------------------------------
// Local fetchWithTimeout — defined here per project convention (not shared)
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
// Cost tracking (Anthropic Claude Haiku pricing approximation via OpenRouter)
// ---------------------------------------------------------------------------
const INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 4.0 / 1_000_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface TriageInput {
  clickup_task_id: string;
  clickup_task_name: string;
  description: string;
  list_id: string;
  list_name: string;
  profile_id: string | null; // used to look up wp_mcp_url
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

// ---------------------------------------------------------------------------
// OpenRouter call helper
// ---------------------------------------------------------------------------
async function callOpenRouter(
  messages: { role: string; content: string }[],
  openrouterKey: string,
): Promise<Response> {
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
      body: JSON.stringify({
        model: "anthropic/claude-haiku-4-5",
        max_tokens: 512,
        temperature: 0,
        messages,
      }),
    },
    30000,
  );
}

// ---------------------------------------------------------------------------
// Parse OpenRouter response → TriageOutput | null
// ---------------------------------------------------------------------------
async function parseTriageResponse(resp: Response): Promise<{
  parsed: TriageOutput | null;
  inputTokens: number;
  outputTokens: number;
}> {
  const data = await resp.json();
  const inputTokens: number = data.usage?.prompt_tokens ?? 0;
  const outputTokens: number = data.usage?.completion_tokens ?? 0;
  let text: string = data.choices?.[0]?.message?.content ?? "";
  // Strip markdown code fences if model wraps JSON in them
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  try {
    return { parsed: JSON.parse(text) as TriageOutput, inputTokens, outputTokens };
  } catch {
    return { parsed: null, inputTokens, outputTokens };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const correlationId = crypto.randomUUID().slice(0, 8);
  const log = createLogger("triage-agent", correlationId);

  log.info("Triage agent invoked", { method: req.method });

  // Service-role Supabase client (never anon key)
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
        model_used: "anthropic/claude-haiku-4-5",
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
    // 3. WordPress site audit (optional, non-blocking)
    // ------------------------------------------------------------------
    let siteAudit: WpSiteAudit | null = null;
    if (input.profile_id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("wp_mcp_url")
        .eq("id", input.profile_id)
        .maybeSingle();

      siteAudit = await fetchWpSiteAudit(profile?.wp_mcp_url ?? null, log);
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
    // 4. Read skill prompt from disk
    // ------------------------------------------------------------------
    const skillPrompt = await Deno.readTextFile(
      new URL("../_shared/skills/triage_agent.md", import.meta.url).pathname,
    );

    // ------------------------------------------------------------------
    // 5. Build user message
    // ------------------------------------------------------------------
    let userMessage = `Task: ${input.clickup_task_name}\nDescription: ${input.description || "No description provided."}\nList: ${input.list_name}`;
    if (siteAudit) {
      userMessage += `\n\n${formatAuditForPrompt(siteAudit)}`;
    }

    // ------------------------------------------------------------------
    // 6. Call OpenRouter (Claude Haiku) — with one JSON retry
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

    const baseMessages = [
      { role: "system", content: skillPrompt },
      { role: "user", content: userMessage },
    ];

    log.info("Calling OpenRouter (first attempt)");
    const firstResp = await callOpenRouter(baseMessages, openrouterKey);
    const firstResult = await parseTriageResponse(firstResp);

    let parsed: TriageOutput | null = firstResult.parsed;
    let inputTokens = firstResult.inputTokens;
    let outputTokens = firstResult.outputTokens;

    if (!parsed) {
      // Retry once with explicit JSON instruction
      log.warn("First Claude response was not valid JSON — retrying");
      const retryMessages = [
        ...baseMessages,
        { role: "assistant", content: "Return ONLY valid JSON, no text outside the JSON object." },
      ];
      const retryResp = await callOpenRouter(retryMessages, openrouterKey);
      const retryResult = await parseTriageResponse(retryResp);
      parsed = retryResult.parsed;
      inputTokens += retryResult.inputTokens;
      outputTokens += retryResult.outputTokens;
    }

    // ------------------------------------------------------------------
    // 7. Handle second failure — update job to failed and return
    // ------------------------------------------------------------------
    if (!parsed) {
      log.error("Claude returned invalid JSON twice — marking job as failed");
      await supabase.from("agent_jobs").update({
        status: "failed",
        error_message: "Claude returned invalid JSON twice",
        duration_ms: Date.now() - startedAt,
      }).eq("id", jobId);
      return new Response(
        JSON.stringify({ ok: false, code: "TRIAGE_FAILED", message: "Claude returned invalid JSON twice", correlationId }),
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
    // 9. Build ClickUp comment text
    // ------------------------------------------------------------------
    let commentText = `[Triage] 🤖 Automated Task Assessment\n\n`;
    commentText += `📋 Type: ${parsed.task_type}\n`;
    commentText += `⚡ Complexity: ${parsed.complexity}\n`;
    commentText += `⏱ Estimated time: ${parsed.hours_estimate}h\n`;
    commentText += `💳 Client cost: ${parsed.credits} credit(s) (~€${parsed.credits * 100})\n`;
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
      const productPart =
        siteAudit.product_count !== null ? `, ${siteAudit.product_count} products` : "";
      commentText += `\n🔍 Site context: ${siteAudit.site_name} — WP ${siteAudit.wp_version}, ${pluginCount} plugins${productPart}\n`;
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
    // 11. Update agent_jobs with terminal status
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
    // ------------------------------------------------------------------
    // Global error handler — always update job to failed, always return 200
    // ------------------------------------------------------------------
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
