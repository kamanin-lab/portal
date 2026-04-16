# Phase 6: Triage Agent — Context

**Gathered:** 2026-04-06
**Status:** Ready for planning
**Source:** PRD at `docs/ideas/triage-agent.md` + codebase analysis

<domain>
## Phase Boundary

Build the KAMANDA Triage Agent: an automated AI agent that receives `taskCreated` webhook events from ClickUp, fetches optional WordPress site context, calls Claude Haiku via OpenRouter, and posts a structured cost/time estimate comment to the ClickUp task. Includes HITL loop: developer replies `[approve]`/`[reject]` in ClickUp, webhook updates `agent_jobs` status.

**In scope:**
- DB migration: `agent_jobs` table + `wp_mcp_url` on `profiles`
- `_shared/wp-audit.ts` — WordPress site audit helper (Maxi AI Core REST API)
- `_shared/skills/triage_agent.md` — Claude skill prompt
- `supabase/functions/triage-agent/index.ts` — main Edge Function
- `supabase/functions/clickup-webhook/index.ts` — add `taskCreated` handler + HITL detection
- `supabase/functions/.env.example` — add new secrets
- `docs/agent-setup/triage-agent-setup.md` — setup documentation

**Out of scope:**
- Frontend UI for triage results
- Admin dashboard for `agent_jobs`
- Automatic credit deduction on approval
- Slack/Telegram notifications on approval

</domain>

<decisions>
## Implementation Decisions

### AI Provider: OpenRouter (not direct Anthropic API)
- Use `OPENROUTER_API_KEY` env var (already exists for AI enrichment in `fetch-project-tasks`)
- Endpoint: `https://openrouter.ai/api/v1/chat/completions`
- Model: `anthropic/claude-haiku-4-5` (OpenRouter model ID — NOT `claude-haiku-4-5-20251001`)
- Headers: `Authorization: Bearer ${key}`, `HTTP-Referer: https://portal.kamanin.at`, `X-Title: KAMANIN Triage Agent`
- Cost tracking: use Anthropic direct pricing as approximation (`0.8/1M` input, `4.0/1M` output)
- `model_used` column stores `anthropic/claude-haiku-4-5` (the OpenRouter ID)

### fetchWithTimeout: define locally in triage-agent
- `_shared/` does NOT have `fetchWithRetry.ts` or `fetchWithTimeout.ts` as shared files
- `fetchWithTimeout` is defined inline in `clickup-webhook/index.ts` and `fetch-project-tasks/index.ts`
- Define it locally in `triage-agent/index.ts` — same pattern (AbortController + setTimeout)
- Do NOT create a new shared file for this phase

### taskCreated payload: fetch task details via ClickUp API
- ClickUp `taskCreated` webhook payload only guarantees `task_id` in `payload.task_id`
- `task_name` and `description` are NOT reliably present in the webhook payload body
- Must call `GET /api/v2/task/{task_id}` with `CLICKUP_API_TOKEN` to get name + description + list info
- Use `fetchWithTimeout` (10s) for this call
- If fetch fails → log warn, skip triage (don't create `agent_jobs` row)

### Existing taskCreated handling in clickup-webhook (MUST NOT break)
- Lines 953–990 already handle `taskCreated` for **project tasks** (upsert to `project_task_cache`, create Nextcloud folder)
- The existing handler checks `projectConfigId` to route — project tasks go one path, regular tickets go another
- New triage logic applies to the **ticket path only** (tasks NOT in a project config)
- Or: triage runs on ALL monitored lists regardless of project/ticket distinction — controlled by `TRIAGE_ENABLED_LIST_IDS`
- **Decision: `TRIAGE_ENABLED_LIST_IDS` filter is the gate** — if list_id not in the list, skip silently. This is independent of project/ticket routing.
- Add `handleTaskCreated` as a separate function called after the existing routing, not inside the project branch

### HITL detection placement
- Add `await handleTriageHitl(payload, supabase, correlationId)` at the END of the `taskCommentPosted` handler (line ~1590+)
- Must not interfere with existing comment handling (portal notifications, project messages)
- HITL only fires when comment matches `[approve]`/`[approve: Xh Ycr]`/`[reject: reason]` patterns

### agent_jobs RLS policy
- Service role full access only (no client-facing access)
- `alter table public.agent_jobs enable row level security` + policy for service role
- No anon/authenticated policy — triage is internal tooling

### set_updated_at trigger
- Migration checks if function already exists: `create or replace function public.set_updated_at()`
- Safe to re-create

### Skill file path in Deno
- `Deno.readTextFile(new URL('../_shared/skills/triage_agent.md', import.meta.url).pathname)`
- This is the correct Deno ESM-relative path pattern for Edge Functions

### wp_mcp_url migration
- `alter table public.profiles add column if not exists wp_mcp_url text;` — idempotent, already in CLAUDE.md as existing column
- Migration still runs it with `if not exists` — safe

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Edge Function patterns
- `supabase/functions/fetch-project-tasks/index.ts` — OpenRouter call pattern (lines 181–214): exact headers, fetchWithTimeout, error handling
- `supabase/functions/clickup-webhook/index.ts` — existing taskCreated handler (lines 953–990), taskCommentPosted handler (lines 1590+), route structure
- `supabase/functions/post-task-comment/index.ts` — ClickUp comment POST pattern
- `supabase/functions/_shared/logger.ts` — logger interface
- `supabase/functions/_shared/cors.ts` — CORS headers

### Database schema
- `docs/system-context/DATABASE_SCHEMA.md` — profiles table, task_cache table structure
- Latest migration: `supabase/migrations/20260329_step_enrichment_change_detection.sql` — for timestamp format reference

### Architecture constraints
- `docs/system-context/SYSTEM_CONSTRAINTS.md` — RLS rules, Edge Function patterns
- `CLAUDE.md` — stack overview, no new dependencies rule, Deno runtime rules

### PRD / source document
- `docs/ideas/triage-agent.md` — full original prompt (reference for deliverables checklist and success criteria)

</canonical_refs>

<specifics>
## Specific Implementation Notes

### OpenRouter call pattern (from fetch-project-tasks/index.ts)
```typescript
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
```

### New env vars required
- `OPENROUTER_API_KEY` — already exists in production (used by fetch-project-tasks)
- `TRIAGE_ENABLED_LIST_IDS` — comma-separated ClickUp list IDs (new)
- `WP_MCP_USER` — WordPress username for Maxi AI Core auth (new)
- `WP_MCP_APP_PASS` — WordPress Application Password (new)
- `ANTHROPIC_API_KEY` — NOT needed (using OpenRouter)

### ClickUp comment POST endpoint
- `POST https://api.clickup.com/api/v2/task/{task_id}/comment`
- Body: `{ "comment_text": "...", "notify_all": false }`
- Auth: `Authorization: {CLICKUP_API_TOKEN}`

### JSON retry pattern
```typescript
// Parse JSON — retry once if invalid
let parsed: TriageOutput | null = null;
try { parsed = JSON.parse(text); } catch { /* retry */ }
if (!parsed) {
  // Call again with "Return ONLY valid JSON, no text outside the JSON object"
}
```

</specifics>

<deferred>
## Deferred

- Frontend `agent_jobs` viewer (admin dashboard)
- Automatic credit deduction on `[approve]`
- Telegram/Slack notification to developer when triage completes
- Confidence-based routing (low confidence → flag for human review differently)
- Multi-list configuration via Supabase table (instead of env var)

</deferred>

---

*Phase: 06-triage-agent*
*Context gathered: 2026-04-06 via PRD analysis + codebase validation*
