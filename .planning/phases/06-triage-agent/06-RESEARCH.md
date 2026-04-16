# Phase 6: Triage Agent — Research

**Researched:** 2026-04-06
**Domain:** Supabase Edge Functions / Deno runtime / ClickUp API / OpenRouter / WordPress REST API
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **AI Provider:** OpenRouter (`OPENROUTER_API_KEY`), endpoint `https://openrouter.ai/api/v1/chat/completions`, model `anthropic/claude-haiku-4-5` (NOT `anthropic/claude-haiku-4-5-20251001`)
- **fetchWithTimeout:** Define locally in `triage-agent/index.ts` — do NOT create a new shared file. Same AbortController+setTimeout pattern used in `clickup-webhook` and `fetch-project-tasks`.
- **taskCreated payload:** Only `task_id` is reliably present. Must call `GET /api/v2/task/{task_id}` to get name, description, list.id, list.name.
- **Existing taskCreated handler (lines 953–990):** Handles project tasks; must not be touched. Triage runs on ALL monitored lists via `TRIAGE_ENABLED_LIST_IDS` env var as the gate — independent of project/ticket routing.
- **HITL placement:** `await handleTriageHitl(payload, supabase, correlationId)` added at END of `taskCommentPosted` handler.
- **agent_jobs RLS:** Service role only. No anon/authenticated policy.
- **set_updated_at trigger:** Use `create or replace function` — safe to re-create.
- **Skill file Deno path:** `Deno.readTextFile(new URL('../_shared/skills/triage_agent.md', import.meta.url).pathname)`
- **wp_mcp_url migration:** `alter table public.profiles add column if not exists wp_mcp_url text;` — idempotent.
- **model_used column default in migration:** PRD uses `'claude-haiku-4-5-20251001'` but CONTEXT.md specifies `'anthropic/claude-haiku-4-5'` (the OpenRouter ID). Use the OpenRouter ID in code; the migration default can reflect it too.

### Claude's Discretion

- `handleTaskCreated` function structure within `clickup-webhook/index.ts` (as separate function called after existing routing)
- HITL `handleTriageHitl` function structure
- Exact error logging verbosity
- Exact format of `cost_usd` calculation placement
- Whether to use `fetchWithTimeout` or `AbortSignal.timeout` in `wp-audit.ts` (PRD uses `AbortSignal.timeout`)
- Test file placement and test strategy for HITL regex patterns

### Deferred Ideas (OUT OF SCOPE)

- Frontend UI for triage results
- Admin dashboard for `agent_jobs`
- Automatic credit deduction on approval
- Slack/Telegram notifications on approval
- Confidence-based routing
- Multi-list config via Supabase table

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TRIAGE-01 | `agent_jobs` table with correct schema, RLS enabled (service role only) | Migration SQL fully specified in PRD + CONTEXT.md. `set_updated_at` function does not exist in current migrations — safe to create. `wp_mcp_url` column does not yet exist in profiles (not in DATABASE_SCHEMA.md). |
| TRIAGE-02 | `triage-agent` Edge Function — receives task input, calls Claude Haiku via OpenRouter, posts `[Triage]` comment | OpenRouter call pattern confirmed from `fetch-project-tasks`. ClickUp comment POST pattern confirmed from `post-task-comment`. Deno.readTextFile path pattern confirmed. Service role client pattern clear from existing functions. |
| TRIAGE-03 | `clickup-webhook` extended — handle `taskCreated`, invoke `triage-agent` for monitored lists only | Webhook structure fully read (lines 580–1981). `taskCreated` currently falls through to "ignore" at line 1977. `supabase.functions.invoke()` is NOT currently used anywhere in the codebase — see research finding below. |
| TRIAGE-04 | WordPress site audit — `wp-audit.ts` fetches WP version, active plugins, post types via Maxi AI Core REST API (non-blocking, failure-safe) | `AbortSignal.timeout(8000)` pattern specified in PRD. Endpoint and auth pattern fully specified. `WP_MCP_USER` and `WP_MCP_APP_PASS` are new secrets, not in current allow-list. |
| TRIAGE-05 | HITL loop — `taskCommentPosted` detects `[approve]`/`[approve: Xh Ycr]`/`[reject: reason]` and updates `agent_jobs` | HITL detection at end of taskCommentPosted confirmed safe — must bypass the early-return guards that reject portal-originated comments and non-client-facing thread comments. `[Triage]` comments will trigger those early returns — HITL detection must precede or bypass those. See Pitfall #1. |
| TRIAGE-06 | Setup documentation + `.env.example` updated with new secrets | No `.env.example` exists currently — must be created. New secrets: `TRIAGE_ENABLED_LIST_IDS`, `WP_MCP_USER`, `WP_MCP_APP_PASS`. `OPENROUTER_API_KEY` and `ANTHROPIC_API_KEY` already in secrets allow-list. |

</phase_requirements>

---

## Summary

Phase 6 builds an automated triage agent that fires within 15 seconds of a task being created in a monitored ClickUp list. The data flow is: `clickup-webhook` receives `taskCreated` event → fetches task details from ClickUp API → inserts `agent_jobs` row → invokes `triage-agent` Edge Function → which optionally fetches WordPress site context → calls Claude Haiku via OpenRouter → parses structured JSON output → posts a formatted `[Triage]` comment to ClickUp → updates `agent_jobs` status. A HITL loop handles developer replies `[approve]`/`[reject]` in ClickUp comments.

All technical patterns required by this phase exist in the codebase already. The OpenRouter call pattern is in `fetch-project-tasks`. The ClickUp comment POST is in `post-task-comment`. The `fetchWithTimeout` pattern is in both `clickup-webhook` and `post-task-comment`. The critical architectural question is how to safely invoke `triage-agent` from within `clickup-webhook` — `supabase.functions.invoke()` is NOT currently used in any Edge Function in this codebase. The PRD specifies using it; this is viable but requires the service role key and Supabase URL to be available in the webhook function (they are).

The most significant pitfall is the HITL comment detection placement. The `taskCommentPosted` handler has an early return at line 1615 that filters out portal-originated comments (which checks for `(via Client Portal)` prefix). The `[Triage]` bot comment posted by the triage agent will NOT have that prefix, so it won't be filtered there. However, the HITL needs to detect developer replies to `[Triage]` threads — those replies may not be `@client:` prefixed either, meaning they could be filtered by the thread-context check at line 1640. The safest placement is BEFORE the `isPortalOriginatedComment` guard, not at the end.

**Primary recommendation:** Place `handleTriageHitl` BEFORE the `isPortalOriginatedComment` early return (line ~1615), not at the end of the handler. This avoids the risk of HITL comments being silently dropped by existing filters.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.47.10 | Supabase client (DB + functions.invoke) | Already in all Edge Functions — same import URL |
| Deno built-ins | Deno 1.x | `Deno.env`, `Deno.readTextFile`, `AbortSignal.timeout` | Deno runtime is the Edge Function execution environment |
| `fetch()` | Web API | HTTP calls to ClickUp API and OpenRouter | Standard Web API, no import needed |
| `_shared/logger.ts` | project | Structured JSON logging | Used in all Edge Functions |
| `_shared/cors.ts` | project | CORS headers | Used in all Edge Functions |
| `_shared/wp-audit.ts` | NEW | WordPress site audit | New file for this phase |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `_shared/skills/triage_agent.md` | NEW | System prompt for Claude | Read once at startup via `Deno.readTextFile` |
| `AbortSignal.timeout()` | Web API | Simpler timeout for WP audit calls | Available in Deno; used in `wp-audit.ts` per PRD |
| `AbortController + setTimeout` | Web API | Timeout for general fetches | Used in `fetchWithTimeout` — existing pattern |

**No new npm/deno registry dependencies.** The PRD constraint "No new dependencies — only fetch() for Anthropic" is confirmed achievable.

**Version verification:** `@supabase/supabase-js@2.47.10` is the pinned version in all existing functions via `https://esm.sh/@supabase/supabase-js@2.47.10`. Do not change this import URL.

---

## Architecture Patterns

### Recommended Project Structure
```
supabase/
├── functions/
│   ├── triage-agent/
│   │   └── index.ts              # new Edge Function
│   ├── clickup-webhook/
│   │   └── index.ts              # modified — add taskCreated + HITL handlers
│   └── _shared/
│       ├── wp-audit.ts           # new shared helper
│       └── skills/
│           └── triage_agent.md   # new skill prompt file
├── migrations/
│   └── YYYYMMDD_create_agent_jobs.sql   # new migration
docs/
└── agent-setup/
    └── triage-agent-setup.md     # new setup doc
```

### Pattern 1: OpenRouter Call (from fetch-project-tasks)
**What:** POST to `https://openrouter.ai/api/v1/chat/completions` with specific headers
**When to use:** Any OpenRouter AI call in this codebase
**Example:**
```typescript
// Source: supabase/functions/fetch-project-tasks/index.ts lines 200-214
const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
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
    messages: [{ role: "system", content: skillPrompt }, { role: "user", content: userMessage }],
  }),
}, 30000);

// Extract response text:
const data = await response.json();
let text = data.choices?.[0]?.message?.content || "";
// Strip markdown code block wrapper if present:
text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
```
**Note:** The existing `fetch-project-tasks` uses `openai/gpt-4o-mini`. The triage agent uses `anthropic/claude-haiku-4-5`. Both are valid OpenRouter model IDs.

### Pattern 2: ClickUp Comment POST (from post-task-comment)
**What:** POST comment to ClickUp task
**When to use:** Any time an Edge Function needs to write a comment to ClickUp
**Example:**
```typescript
// Source: supabase/functions/post-task-comment/index.ts lines 428-438
const response = await fetchWithRetry(endpoint, {
  method: "POST",
  headers: {
    Authorization: clickupApiToken,   // NO "Bearer" prefix for personal tokens
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    comment_text: clickupText,
    notify_all: false,
  }),
}, 2, log);
// endpoint for new top-level comment: `https://api.clickup.com/api/v2/task/${taskId}/comment`
```
**CRITICAL:** ClickUp personal tokens use `Authorization: {token}` with NO "Bearer" prefix. This is confirmed in the ClickUp API skill.

### Pattern 3: fetchWithTimeout (defined locally)
**What:** AbortController + setTimeout pattern — defined inline in each Edge Function that needs it
**When to use:** Any fetch call that needs a timeout in an Edge Function
**Example:**
```typescript
// Source: supabase/functions/post-task-comment/index.ts lines 11-28
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

### Pattern 4: supabase.functions.invoke() from within an Edge Function
**What:** Call another Edge Function from within a Supabase Edge Function
**Verified:** NOT currently used in this codebase. The pattern IS supported by `@supabase/supabase-js` v2 — the client exposes `supabase.functions.invoke(functionName, { body })`.
**How to construct the client for this:** The webhook function already creates `supabase` with the service role key. That same client can call `supabase.functions.invoke()`.
**Gotcha:** `supabase.functions.invoke()` uses the Supabase `SUPABASE_URL` environment variable which is the project URL — on Cloud Supabase this is the standard `https://{ref}.supabase.co` URL. On self-hosted (Coolify), this is `SUPABASE_URL` env var (`https://portal.db.kamanin.at`). The URL is already in all Edge Functions as `Deno.env.get("SUPABASE_URL")`.
**Alternative:** Direct `fetch()` to the function URL is equally valid and more transparent. Either pattern works.

### Pattern 5: Deno.readTextFile for shared skill files
**What:** Read a sibling `_shared/` file from within an Edge Function
**Confirmed pattern:**
```typescript
// Read _shared/skills/triage_agent.md from within triage-agent/index.ts:
const skillPrompt = await Deno.readTextFile(
  new URL('../_shared/skills/triage_agent.md', import.meta.url).pathname
);
```
**Why this works:** `import.meta.url` gives the current module's URL as a file:// URL. `new URL('../_shared/skills/...', import.meta.url)` resolves the relative path correctly. `.pathname` extracts the filesystem path for `Deno.readTextFile`. This is the standard Deno ESM pattern for sibling file reads.

### Pattern 6: AbortSignal.timeout() in Deno
**What:** Simpler timeout syntax available in modern Deno (replaces AbortController+setTimeout)
**Verified:** `AbortSignal.timeout(ms)` is available in Deno 1.28+ and the Web API standard. The `wp-audit.ts` PRD uses it. Existing Edge Functions use `AbortController + setTimeout` instead (the older pattern). Both are valid in Deno Edge Functions.
**Example (from PRD):**
```typescript
const res = await fetch(endpoint, {
  method: "POST",
  headers,
  body: JSON.stringify({ ability, ...(args ? { args } : {}) }),
  signal: AbortSignal.timeout(8000),
});
```

### Pattern 7: Service Role Client in Edge Functions
**What:** Supabase client using service role key for operations not bound to a user
**When to use:** triage-agent never receives a user auth token — it's invoked server-to-server
**Example:**
```typescript
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, serviceKey);
```

### Anti-Patterns to Avoid
- **Using `Bearer` prefix with ClickUp personal token:** `Authorization: Bearer pk_xxx` is WRONG. Use `Authorization: pk_xxx` directly.
- **Importing from `_shared/` using relative TypeScript paths without `.ts` extension:** Deno requires explicit `.ts` extensions in imports — `import { createLogger } from "../_shared/logger.ts"` not `"../_shared/logger"`.
- **Leaving `agent_jobs` status as `running` on failure:** The PRD specifies: "always update `agent_jobs` even on failure. Never leave status as `running`." Use try/finally pattern.
- **Throwing errors from `wp-audit.ts`:** The helper must never throw — failure returns `null`.
- **Calling `supabase.functions.invoke()` with the user-facing anon client:** triage-agent invocation must use the service role client (or direct fetch) — never the anon client.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured logging | Custom console.log | `createLogger` from `_shared/logger.ts` | Already has PII sanitization, structured JSON, log levels |
| CORS headers | Inline CORS strings | `getCorsHeaders()` from `_shared/cors.ts` | Centralized allowed origins list, Vercel preview pattern |
| Timeout wrapper | Custom Promise race | `fetchWithTimeout` (local copy) | Established pattern with proper `finally` cleanup |
| JSON strip markdown | Custom regex | `text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim()` | Exact pattern from `fetch-project-tasks` line 224 — covers LLM code block wrapping |

---

## Common Pitfalls

### Pitfall 1: HITL detection silently dropped by existing comment filters
**What goes wrong:** The `taskCommentPosted` handler has two early-return guards that could swallow developer HITL replies:
1. `isPortalOriginatedComment(commentText)` at line ~1615 — checks for `(via Client Portal)` in text. Bot `[Triage]` comment does NOT have this prefix, so triage bot's own comment won't trigger this. But a developer's plain `[approve]` reply also won't trigger it — safe.
2. Thread context check at line ~1640 — `resolveClientFacingCommentEvent` returns `shouldNotify: false` for replies to non-`@client:` threads. A developer `[approve]` reply to a `[Triage]` thread is NOT a `@client:` thread, so `shouldNotify` will be `false` and the handler returns early at line ~1644 before reaching the HITL detection if placed at the end.

**Why it happens:** The existing logic is designed to filter internal ClickUp comments. HITL replies are internal — they're from the developer, not the client — and look exactly like "ignore me" comments to the existing filter.

**How to avoid:** Place `await handleTriageHitl(payload, supabase, correlationId)` BEFORE the thread context check, ideally right after the `isPortalOriginatedComment` guard (since `[approve]`/`[reject]` won't have portal prefix). The HITL function does its own pattern matching and returns early if no match — it's safe to call unconditionally early in the handler.

**Specific insertion point:** After the `if (isPortalOriginatedComment(commentText)) { return... }` block and before the `checkCommentThreadContext` call.

### Pitfall 2: ClickUp API token format
**What goes wrong:** Using `Authorization: Bearer {token}` for ClickUp personal API token results in 401.
**Why it happens:** ClickUp personal tokens (`pk_xxx`) use `Authorization: {token}` directly, NO `Bearer` prefix. Only OAuth tokens use `Bearer`. This is confirmed in the ClickUp API skill.
**How to avoid:** The existing `fetchTaskForVisibilityCheck` at line 319 uses `Authorization: clickupApiToken` without `Bearer` — follow that pattern exactly.

### Pitfall 3: taskCreated payload missing task details
**What goes wrong:** Trying to read `payload.task_name` or `payload.description` from the `taskCreated` webhook payload.
**Why it happens:** The ClickUp webhook payload interface (confirmed in `endpoints-webhooks.md`) shows `task_id` as the only reliable task-related field in the top-level payload. `history_items` for `taskCreated` may have partial data but it's not structured consistently.
**How to avoid:** Always call `GET /api/v2/task/{task_id}` with `fetchWithTimeout(10s)` after receiving `taskCreated`. If the fetch fails, log warn and skip triage (don't create `agent_jobs` row). The task detail response confirms fields: `task.name`, `task.description`, `task.list.id`, `task.list.name`.

### Pitfall 4: `agent_jobs` status stuck as `running` on unhandled error
**What goes wrong:** An unhandled exception in `triage-agent/index.ts` leaves the `agent_jobs` row with `status: 'running'` permanently.
**Why it happens:** If the `agent_jobs` row is inserted with `status: 'running'` at step 2 of the flow, any uncaught error before the final status update leaves it stuck.
**How to avoid:** Use a try/finally pattern:
```typescript
const { data: job } = await supabase.from("agent_jobs").insert({ status: "running", ... }).select().single();
try {
  // ... all the work ...
} catch (err) {
  await supabase.from("agent_jobs").update({ status: "failed", error_message: String(err) }).eq("id", job.id);
  throw err;
} finally {
  // ensure status is set
}
```
The PRD says: "always update `agent_jobs` even on failure. Never leave status as `running`."

### Pitfall 5: `supabase.functions.invoke()` behavior on self-hosted vs Cloud
**What goes wrong:** `supabase.functions.invoke("triage-agent", ...)` might behave differently between production (self-hosted Coolify) and staging (Cloud Supabase).
**Why it happens:** On Cloud Supabase, function URLs are `https://{ref}.supabase.co/functions/v1/{name}`. On self-hosted (Coolify), the URL is the custom domain `https://portal.db.kamanin.at/functions/v1/{name}`. The `supabase-js` client builds the function URL from `SUPABASE_URL` — as long as `SUPABASE_URL` is correctly set (it always is in Edge Functions via automatic injection), this works on both.
**How to avoid:** Use `supabase.functions.invoke()` as-is. The client handles URL construction correctly. No special config needed.

### Pitfall 6: `set_updated_at` trigger function already exists
**What goes wrong:** Migration fails if `set_updated_at` already exists from another table.
**Why it happens:** The trigger function `public.set_updated_at()` is generic and might be created by other migrations. In this project, checking all 4 existing migration files confirms the function does NOT currently exist in any migration. However, it may already be live on the production DB from external provisioning.
**How to avoid:** PRD already uses `CREATE OR REPLACE FUNCTION public.set_updated_at()` — this is idempotent. Do not use `CREATE FUNCTION` (without `OR REPLACE`).

### Pitfall 7: Deno `import.meta.url` pathname on Windows vs Linux
**What goes wrong:** `new URL('../_shared/skills/triage_agent.md', import.meta.url).pathname` returns a path with drive letter on Windows (`/C:/...`) but a clean path on Linux.
**Why it happens:** Supabase Edge Functions run on Linux (Deno). This is not a problem in production. It only matters if someone attempts to test the function locally on Windows. Production deployment is unaffected.
**How to avoid:** No action needed for production. Local Windows testing is not the target environment.

---

## Code Examples

Verified patterns from official sources and codebase:

### Reading skill prompt file at Edge Function startup
```typescript
// Source: CONTEXT.md decision + standard Deno ESM pattern
const skillPrompt = await Deno.readTextFile(
  new URL('../_shared/skills/triage_agent.md', import.meta.url).pathname
);
```

### Constructing the triage-agent input message
```typescript
// Source: triage-agent.md PRD Step 4
const auditSection = audit ? `\n\n${formatAuditForPrompt(audit)}` : "";
const userMessage = `Task: ${taskName}\nDescription: ${description || "No description provided"}\nList: ${listName}${auditSection}`;
```

### Token cost tracking
```typescript
// Source: triage-agent.md PRD Step 4
const INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;   // Haiku input pricing
const OUTPUT_COST_PER_TOKEN = 4.0 / 1_000_000;  // Haiku output pricing
const inputTokens = data.usage?.prompt_tokens ?? 0;
const outputTokens = data.usage?.completion_tokens ?? 0;
const cost_usd = inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;
```

### JSON retry pattern
```typescript
// Source: CONTEXT.md specifics section
let parsed: TriageOutput | null = null;
try { parsed = JSON.parse(text); } catch { /* will retry */ }
if (!parsed) {
  // Second attempt with explicit JSON-only instruction
  const retryResponse = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { /* same headers */ },
    body: JSON.stringify({
      model: "anthropic/claude-haiku-4-5",
      max_tokens: 512,
      temperature: 0,
      messages: [
        { role: "system", content: skillPrompt },
        { role: "user", content: userMessage },
        { role: "assistant", content: text },  // include what it returned
        { role: "user", content: "Return ONLY valid JSON, no text outside the JSON object." },
      ],
    }),
  }, 30000);
  // parse again...
}
```

### HITL regex patterns
```typescript
// Source: CONTEXT.md specifics section (confirmed exact patterns)
const approveSimple = /^\[approve\]$/i;
const approveWithCorrections = /^\[approve:\s*(\d+(?:\.\d+)?)h\s+(\d+(?:\.\d+)?)cr\]$/i;
const reject = /^\[reject:\s*(.+)\]$/i;

const commentTrimmed = commentText.trim();
const approveMatch = approveWithCorrections.exec(commentTrimmed);
const rejectMatch = reject.exec(commentTrimmed);
const isSimpleApprove = approveSimple.test(commentTrimmed);
```

### ClickUp GET task response shape (confirmed fields)
```typescript
// Source: fetchTaskForVisibilityCheck (line 331+) + clickup-api SKILL.md
// GET https://api.clickup.com/api/v2/task/{task_id}
interface ClickUpTaskDetail {
  id: string;
  name: string;
  description: string;         // plain text, may be empty string
  status: { status: string; color: string };
  list: { id: string; name: string; access: boolean };
  folder: { id: string; name: string; hidden: boolean; access: boolean };
  space: { id: string };
  custom_fields: Array<{ id: string; value?: unknown; type_config?: unknown }>;
  tags: Array<{ name: string }>;
  assignees: Array<{ id: number; username: string; email: string; profilePicture: string | null }>;
  creator: { id: number; username: string; email: string };
  date_created: string;        // Unix ms as string
  date_updated: string;        // Unix ms as string
}
```

### handleTaskCreated structure in clickup-webhook
```typescript
// Placement: called AFTER the existing project-routing block exits (line ~1020+)
// BEFORE the taskStatusUpdated handler
async function handleTaskCreated(
  payload: ClickUpWebhookPayload,
  supabase: ReturnType<typeof createClient>,
  correlationId: string,
  log: ReturnType<typeof createLogger>
): Promise<void> {
  const taskId = payload.task_id;
  if (!taskId || !isValidTaskId(taskId)) return;

  const enabledListIds = (Deno.env.get("TRIAGE_ENABLED_LIST_IDS") || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (enabledListIds.length === 0) {
    log.debug("TRIAGE_ENABLED_LIST_IDS not configured — skipping triage");
    return;
  }

  // Fetch task detail to get list_id (not reliably in payload)
  const clickupApiToken = Deno.env.get("CLICKUP_API_TOKEN");
  if (!clickupApiToken) { log.warn("No CLICKUP_API_TOKEN — cannot triage"); return; }

  const taskRes = await fetchWithTimeout(
    `https://api.clickup.com/api/v2/task/${taskId}`,
    { headers: { Authorization: clickupApiToken, "Content-Type": "application/json" } },
    10000
  );
  if (!taskRes.ok) { log.warn("Failed to fetch task for triage", { taskId }); return; }
  const taskData = await taskRes.json();
  const listId = taskData.list?.id;
  if (!listId || !enabledListIds.includes(listId)) {
    log.debug("List not in TRIAGE_ENABLED_LIST_IDS — skipping", { listId });
    return;
  }

  // Profile lookup (best effort — used for wp_mcp_url)
  const { data: cacheEntry } = await supabase
    .from("task_cache")
    .select("profile_id")
    .eq("clickup_id", taskId)
    .maybeSingle();
  const profileId = cacheEntry?.profile_id ?? null;

  // Insert agent_jobs row
  const { data: jobRow, error: jobError } = await supabase
    .from("agent_jobs")
    .insert({
      clickup_task_id: taskId,
      clickup_task_name: taskData.name,
      profile_id: profileId,
      job_type: "triage",
      status: "pending",
      input: {
        task_name: taskData.name,
        description: taskData.description || "",
        list_id: listId,
        list_name: taskData.list?.name || "",
      },
    })
    .select("id")
    .single();

  if (jobError) { log.error("Failed to insert agent_jobs", { error: jobError.message }); return; }

  // Invoke triage-agent (fire and forget — webhook must return 200 quickly)
  const { error: invokeError } = await supabase.functions.invoke("triage-agent", {
    body: {
      clickup_task_id: taskId,
      clickup_task_name: taskData.name,
      description: taskData.description || "",
      list_id: listId,
      list_name: taskData.list?.name || "",
      profile_id: profileId,
      job_id: jobRow.id,
    },
  });
  if (invokeError) {
    log.error("triage-agent invocation failed", { error: String(invokeError) });
    await supabase.from("agent_jobs").update({ status: "failed", error_message: String(invokeError) }).eq("id", jobRow.id);
  }
}
```

---

## Runtime State Inventory

> Not a rename/refactor phase — this section is not applicable.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Direct Anthropic API | OpenRouter proxy | Decided in CONTEXT.md | One API key for all models, easier model switching |
| `AbortController + setTimeout` | `AbortSignal.timeout()` | Deno 1.28+ | Simpler syntax; both are valid in this runtime |
| `CREATE FUNCTION` | `CREATE OR REPLACE FUNCTION` | Idempotent SQL practice | Migration re-runs safely |

---

## Open Questions

1. **Webhook re-registration timing**
   - What we know: Current webhook only subscribes to `taskStatusUpdated` and `taskCommentPosted`. `taskCreated` must be added.
   - What's unclear: Whether the re-registration needs to happen before or after deployment. The Edge Function will silently ignore unregistered events regardless.
   - Recommendation: Document in setup doc. The Edge Function deploy can happen first; webhook re-registration is a separate manual step via ClickUp API (documented in PRD Step 7). Operator MUST perform re-registration for the feature to work.

2. **supabase.functions.invoke() vs direct fetch for triage-agent call**
   - What we know: `supabase.functions.invoke()` is the cleaner pattern. Direct fetch also works. Neither is used currently.
   - What's unclear: `supabase.functions.invoke()` will wait for the invoked function to complete (synchronous invocation). If triage-agent takes 15+ seconds, this blocks the webhook handler, potentially timing out the ClickUp webhook response.
   - Recommendation: Use `supabase.functions.invoke()` with `headers: { Prefer: 'return=minimal' }` does NOT make it async in Supabase Edge Functions. The alternative is a "fire and forget" pattern using `fetch()` without `await` on the response, or structuring the webhook to return 200 before the invoke completes using `Promise` without await. The PRD implies the webhook should return quickly. **Use `supabase.functions.invoke()` but do NOT await it** — create the `agent_jobs` row (so it's inserted before the webhook returns), then kick off triage without waiting. See Pitfall #8.

3. **HITL placement (confirmed risk)**
   - What we know: Placing HITL at the end of `taskCommentPosted` risks it being swallowed by the thread-context filter (line ~1640). The fix is to move it earlier.
   - Recommendation: INSERT `handleTriageHitl` call immediately after the `isPortalOriginatedComment` guard (approximately line 1620), before the `checkCommentThreadContext` call.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | Migration deployment | ✓ | 2.75.0 | — |
| Node.js / tsx | Scripts | ✓ | tsx v4.21.0 | — |
| Deno | Edge Functions runtime | ✗ locally | — | Functions run on Supabase Edge Runtime (not local Deno) |
| `OPENROUTER_API_KEY` | OpenRouter calls | ✓ (in production) | — | Already in allow-list in `sync-staging-secrets.ts` |
| `ANTHROPIC_API_KEY` | Listed in secrets sync | ✓ (in production) | — | In sync allow-list (used by ANTHROPIC_API_KEY entry) |
| `TRIAGE_ENABLED_LIST_IDS` | Triage list filtering | ✗ (new) | — | Feature silently disabled if env var missing |
| `WP_MCP_USER` | WordPress audit | ✗ (new) | — | Audit skipped — triage continues without site context |
| `WP_MCP_APP_PASS` | WordPress audit | ✗ (new) | — | Audit skipped — triage continues without site context |

**Missing dependencies with no fallback:**
- `TRIAGE_ENABLED_LIST_IDS` — must be configured or triage never fires. Setup doc must make this clear.

**Missing dependencies with fallback:**
- `WP_MCP_USER` / `WP_MCP_APP_PASS` — WordPress audit is optional. Missing = `audit_fetched: false`, triage continues.
- Deno locally — not needed; Edge Functions deploy to Supabase infrastructure.

**Secrets sync update required:**
`sync-staging-secrets.ts` allow-list (`EDGE_FUNCTION_VARS`) currently includes `OPENROUTER_API_KEY` (copy) and `ANTHROPIC_API_KEY` (copy). The three new secrets (`TRIAGE_ENABLED_LIST_IDS`, `WP_MCP_USER`, `WP_MCP_APP_PASS`) are NOT in the allow-list. They must be added to `sync-staging-secrets.ts` for staging parity. This is in scope for TRIAGE-06.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (version from package.json — currently installed) |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test:coverage` |
| Test include pattern | `src/**/*.{test,spec}.{ts,tsx}` |

**Note:** Vitest is configured for frontend `src/` only — it does NOT run Deno Edge Function code. Edge Functions require manual testing or Supabase local dev. The existing test `src/__tests__/clickup-contract.test.ts` imports from `supabase/functions/_shared/clickup-contract` — this works because it's a TypeScript file importable by Vitest via the alias.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TRIAGE-01 | DB migration creates `agent_jobs` with correct schema | manual-only | SQL inspection via Supabase dashboard | n/a — not testable via Vitest |
| TRIAGE-02 | OpenRouter call + JSON parse + ClickUp comment POST | manual-only (integration) | `supabase functions serve triage-agent` locally | ❌ Wave 0 |
| TRIAGE-03 | `handleTaskCreated` — list filter, agent_jobs insert, invoke | unit (HITL patterns) | `npm run test -- src/__tests__/triage-webhook.test.ts` | ❌ Wave 0 |
| TRIAGE-04 | `fetchWpSiteAudit` — returns null on error, correct structure | unit | `npm run test -- src/__tests__/wp-audit.test.ts` | ❌ Wave 0 |
| TRIAGE-05 | HITL regex patterns — approve/approve:corrections/reject | unit | `npm run test -- src/__tests__/triage-hitl.test.ts` | ❌ Wave 0 |
| TRIAGE-06 | `.env.example` contains new secrets | manual-only | File inspection | n/a |

**Manual-only justifications:**
- TRIAGE-01: SQL schema validation requires live DB connection. Not testable in jsdom.
- TRIAGE-02: Full E2E requires OpenRouter API key + live ClickUp task. Excluded from unit tests.
- TRIAGE-06: File content verification, no code logic.

**What CAN be unit tested:**
- HITL regex patterns (TRIAGE-05) — pure string matching, no external deps
- `fetchWpSiteAudit` null-on-error behavior (TRIAGE-04) — can mock fetch
- List ID filtering logic in `handleTaskCreated` (TRIAGE-03) — can extract and test pure filtering logic

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test:coverage`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/__tests__/triage-hitl.test.ts` — HITL regex pattern tests for TRIAGE-05
- [ ] `src/__tests__/triage-webhook.test.ts` — list filter + taskCreated routing logic for TRIAGE-03
- [ ] (Optional) `src/__tests__/wp-audit.test.ts` — null-return behavior tests for TRIAGE-04

*(Existing `src/test/setup.ts` and `src/__tests__/clickup-contract.test.ts` are sufficient infrastructure — no new conftest/setup needed)*

---

## Project Constraints (from CLAUDE.md)

| Directive | Impact on Phase 6 |
|-----------|-------------------|
| No new dependencies | Confirmed: only `fetch()` + existing `@supabase/supabase-js@2.47.10`. No LangChain, no AI SDK. |
| All UI text in German | N/A — triage agent posts English comments to ClickUp (internal tool, not client-facing). Confirmed in PRD: "All ClickUp comment text must be in English." |
| Components < 150 lines | Applies to frontend only. Edge Functions have no such limit. |
| `OPENROUTER_API_KEY` already exists | Yes — confirmed in `fetch-project-tasks/index.ts` (line 181) and in `sync-staging-secrets.ts` allow-list. |
| Architecture: Edge Functions proxy ALL ClickUp calls | Satisfied — `triage-agent` calls ClickUp from the server side only. |
| RLS enforced on ALL tables | Satisfied — `agent_jobs` migration enables RLS with service-role-only policy. |
| Use ClickUp API skill | Consulted — `.claude/skills/clickup-api/SKILL.md` and `endpoints-webhooks.md` read. |
| Docs update protocol | After phase: update CHANGELOG.md, DATABASE_SCHEMA.md, CLAUDE.md if needed. |

---

## Sources

### Primary (HIGH confidence)
- `supabase/functions/clickup-webhook/index.ts` — webhook structure, existing handlers, payload interface, line numbers
- `supabase/functions/fetch-project-tasks/index.ts` — OpenRouter call pattern (lines 200–214)
- `supabase/functions/post-task-comment/index.ts` — ClickUp comment POST pattern (lines 428–438), fetchWithTimeout definition
- `supabase/functions/_shared/logger.ts` — logger interface
- `supabase/functions/_shared/cors.ts` — CORS headers
- `.claude/skills/clickup-api/SKILL.md` + `endpoints-webhooks.md` — webhook payload structure, ClickUp token format
- `docs/ideas/triage-agent.md` — complete PRD with all implementation details
- `.planning/phases/06-triage-agent/06-CONTEXT.md` — locked decisions
- `scripts/sync-staging-secrets.ts` — confirmed `OPENROUTER_API_KEY` is in allow-list; `WP_MCP_USER`, `WP_MCP_APP_PASS`, `TRIAGE_ENABLED_LIST_IDS` are NOT

### Secondary (MEDIUM confidence)
- `supabase/migrations/` (all 4 files) — confirmed `set_updated_at` function does not exist in any current migration
- `docs/system-context/DATABASE_SCHEMA.md` — confirmed `wp_mcp_url` is not documented (column does not yet exist in schema docs)
- `vitest.config.ts` — test framework configuration
- Deno Web API documentation — `AbortSignal.timeout()` availability in Deno 1.28+

### Tertiary (LOW confidence)
- `supabase.functions.invoke()` async behavior — not confirmed with live test. The Supabase JS SDK documentation describes it as a standard `fetch` under the hood, so the invoked function runs synchronously from the invoker's perspective. The "fire and forget" recommendation is based on architectural reasoning, not empirical test.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all patterns verified against existing codebase files
- Architecture Patterns: HIGH — verified line-by-line against actual webhook code
- Pitfalls: HIGH (Pitfalls 1–6) / MEDIUM (Pitfall about invoke async) — most confirmed by direct code reading
- HITL placement: HIGH — code path traced to confirm thread-context filter would swallow HITL comments if placed at end

**Research date:** 2026-04-06
**Valid until:** 2026-05-06 (30 days — stable stack)
