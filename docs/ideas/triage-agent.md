# kmn Triage Agent v1 — Claude Code Implementation Prompt

## Context

You are implementing **Triage Agent v1** for the KAMANIN Client Portal (kmn).
This is a production system. Do not experiment. Follow the existing architecture exactly.

### Existing stack (do not change)

- **Backend:** Supabase Edge Functions (Deno runtime)
- **DB:** PostgreSQL via Supabase, RLS on all tables
- **Shared utilities:** `supabase/functions/_shared/` — CORS, logging, fetchWithRetry, fetchWithTimeout
- **Response contract:** always `{ ok, code, message, correlationId }`
- **ClickUp webhook endpoint:** already exists at `clickup-webhook` Edge Function
- **Subscribed webhook events:** currently `taskStatusUpdated`, `taskCommentPosted`
- **ClickUp API token:** env var `CLICKUP_API_TOKEN`
- **Anthropic API key:** env var `ANTHROPIC_API_KEY`
- **Supabase client:** `@supabase/supabase-js@2.47.10`
- **Project ID:** `ngkk4c4gsc0kw8wccw0cc04s`

### What already exists (do not rewrite)

- `clickup-webhook/index.ts` — handles `taskStatusUpdated`, `taskCommentPosted`
- `post-task-comment/index.ts` — posts comments to ClickUp with `[Portal]` prefix
- `_shared/cors.ts`, `_shared/logger.ts`, `_shared/fetchWithRetry.ts`
- Tables: `task_cache`, `comment_cache`, `notifications`, `profiles`, `read_receipts`
- `profiles` table has a `wp_mcp_url` column (text, nullable) — WordPress site URL per client

---

## What to build

### Overview

When a new task is created in ClickUp (either by a client via the portal or manually
by a developer), the Triage Agent automatically:

1. Receives the `taskCreated` webhook event
2. Creates an `agent_jobs` record with status `running`
3. **Fetches WordPress site audit** via Maxi AI Core REST API (if `wp_mcp_url` configured)
4. Calls Claude Haiku API with task description + site audit context + skill prompt
5. Gets structured JSON: task type, complexity, hours estimate, credits, reasoning
6. Posts a formatted English comment to the ClickUp task with `[Triage]` prefix
7. Updates `agent_jobs` to `awaiting_hitl`

The developer sees the comment in ClickUp, reviews it, and replies with
`[approve]`, `[approve: 3h 3cr]` (with corrections), or `[reject: reason]`.
The webhook catches this reply and updates `agent_jobs` accordingly.

---

## Step 1 — Database migration

Create file: `supabase/migrations/[timestamp]_create_agent_jobs.sql`

```sql
create table public.agent_jobs (
  id                uuid primary key default gen_random_uuid(),
  clickup_task_id   text not null,
  clickup_task_name text,
  profile_id        uuid references public.profiles(id) on delete set null,
  job_type          text not null default 'triage',

  -- Status flow: pending → running → awaiting_hitl → approved | rejected | failed
  status            text not null default 'pending'
    check (status in ('pending','running','awaiting_hitl','approved','rejected','failed')),

  -- Input snapshot — what the agent received
  -- Shape:
  -- {
  --   task_name: string,
  --   description: string,
  --   list_id: string,
  --   list_name: string,
  --   site_audit: {
  --     wp_version: string,
  --     site_url: string,
  --     site_name: string,
  --     active_plugins: { slug: string, name: string, version: string }[],
  --     post_types: string[],
  --     product_count: number | null,
  --     fetched_at: string
  --   } | null   ← null if wp_mcp_url not configured or audit failed
  -- }
  input             jsonb not null default '{}',

  -- Output from Claude
  -- Shape:
  -- {
  --   task_type: string,
  --   complexity: 'simple'|'medium'|'complex',
  --   hours_estimate: number,
  --   credits: number,
  --   confidence: 'high'|'medium'|'low',
  --   reasoning: string,
  --   questions: string[]
  -- }
  output            jsonb,

  -- HITL fields — filled when developer responds in ClickUp
  hitl_action       text check (hitl_action in ('approved','rejected')),
  hitl_hours        numeric(5,1),
  hitl_credits      numeric(5,1),
  hitl_comment      text,
  hitl_at           timestamptz,

  -- Observability
  model_used        text default 'claude-haiku-4-5-20251001',
  cost_usd          numeric(10,6),
  duration_ms       integer,
  error_message     text,
  clickup_comment_id text,
  audit_fetched     boolean not null default false,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.agent_jobs enable row level security;

create policy "Service role full access"
  on public.agent_jobs
  using (true)
  with check (true);

create index agent_jobs_clickup_task_id_idx on public.agent_jobs(clickup_task_id);
create index agent_jobs_status_idx on public.agent_jobs(status);
create index agent_jobs_created_at_idx on public.agent_jobs(created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger agent_jobs_updated_at
  before update on public.agent_jobs
  for each row execute function public.set_updated_at();

-- Add wp_mcp_url to profiles if not already present
alter table public.profiles
  add column if not exists wp_mcp_url text;

comment on column public.profiles.wp_mcp_url is
  'Base URL of the WordPress site with Maxi AI Core installed (no trailing slash).
   Example: https://staging.client-site.com
   NULL = site audit disabled for this client.';
```

---

## Step 2 — Skill file

Create file: `supabase/functions/_shared/skills/triage_agent.md`

```markdown
<background>
You are the Triage Agent for KAMANIN IT Solutions, a WordPress agency based in Austria.
Your job is to analyze incoming client tasks and produce accurate time and cost estimates.
You are fast and precise. You never guess — when information is missing, say so clearly.

When site audit data is provided inside <site_audit> tags, use it to improve accuracy:

- Avoid recommending plugins that are already installed
- Increase complexity if the task involves custom KAMANIN plugins (slug prefix: kamanin- or sf-)
- Increase complexity if the site has 200+ products and the task touches WooCommerce
- Increase complexity if a page builder is active (greenshift, elementor, divi, beaver-builder)
  and the task touches layout or design
  </background>

<task_types>
Classify into exactly one type:

- wordpress_plugin: installing, configuring, or developing WordPress plugins
- wordpress_theme: theme modifications, child themes, visual customization
- wordpress_core: WP updates, server config, performance, security hardening
- content_update: text, images, pages — no code changes required
- design_change: layout, colors, fonts, UI elements requiring CSS or code
- bug_fix: something is broken and needs to be fixed
- new_feature: new functionality that does not exist yet
- consultation: analysis, audit, advice, research — no implementation
- other: does not fit any category above
  </task_types>

<complexity_guide>
simple (multiplier 1.5×) — 0.5–3 hours:
Clear requirements, standard approach, no dependencies.
Examples: install a contact form plugin, update page text,
change button color, fix a broken image link.

medium (multiplier 2.0×) — 3–8 hours:
Requires analysis or has dependencies, some risk.
Examples: WooCommerce shipping config, custom post type setup,
third-party API integration, cross-browser layout fix.

complex (multiplier 2.5×) — 8+ hours:
Custom development, unclear requirements, or high risk.
Examples: custom plugin development, full page redesign,
payment gateway integration, site migration.
</complexity_guide>

<credit_formula>
credits = round(hours_estimate × multiplier, 1)
Minimum: 0.5 credits. 1 credit = €100.

Multipliers: simple 1.5× | medium 2.0× | complex 2.5×
</credit_formula>

<output_format>
Respond ONLY with valid JSON. No markdown. No text outside the JSON.

{
"task_type": "<one of the types above>",
"complexity": "simple|medium|complex",
"hours_estimate": <number>,
"credits": <number>,
"confidence": "high|medium|low",
"reasoning": "<2-3 sentences. If site audit was used, mention one specific finding.>",
"questions": []
}

Set confidence "low" and populate questions[] when the description is vague
or missing critical details. questions[] must be [] when confidence is high or medium.
</output_format>
```

---

## Step 3 — Site Audit helper

Create file: `supabase/functions/_shared/wp-audit.ts`

```typescript
import { createLogger } from "./logger.ts";

export interface WpSiteAudit {
  wp_version: string;
  site_url: string;
  site_name: string;
  active_plugins: { slug: string; name: string; version: string }[];
  post_types: string[];
  product_count: number | null;
  fetched_at: string;
}

/**
 * Fetch a minimal WordPress site audit via Maxi AI Core REST API.
 *
 * Auth: WordPress Application Password as Basic Auth.
 * Env vars required: WP_MCP_USER, WP_MCP_APP_PASS
 *
 * Returns null (never throws) if:
 *   - wp_mcp_url is null/empty
 *   - credentials missing
 *   - site unreachable or plugin not installed
 *
 * Callers must treat null as "audit unavailable" and continue without it.
 */
export async function fetchWpSiteAudit(
  wpMcpUrl: string | null | undefined,
  logger: ReturnType<typeof createLogger>,
): Promise<WpSiteAudit | null> {
  if (!wpMcpUrl) return null;

  const user = Deno.env.get("WP_MCP_USER");
  const pass = Deno.env.get("WP_MCP_APP_PASS");
  if (!user || !pass) {
    logger.warn(
      "WP_MCP_USER or WP_MCP_APP_PASS not configured — skipping site audit",
    );
    return null;
  }

  const base = wpMcpUrl.replace(/\/$/, "");
  const auth = `Basic ${btoa(`${user}:${pass}`)}`;
  const headers = { Authorization: auth, "Content-Type": "application/json" };
  const endpoint = `${base}/wp-json/maxi-ai/v1/run-ability`;

  const call = async (ability: string, args?: Record<string, unknown>) => {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ ability, ...(args ? { args } : {}) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json?.success ? json.data : null;
  };

  try {
    // 1. Site info
    const siteData = await call("maxi/get-site-info");
    if (!siteData) {
      logger.warn(`maxi/get-site-info failed for ${base}`);
      return null;
    }

    // 2. Active plugins via WP-CLI
    let activePlugins: { slug: string; name: string; version: string }[] = [];
    const pluginData = await call("maxi/run-wp-cli", {
      command: "wp plugin list --status=active --format=json",
    });
    if (pluginData?.output) {
      try {
        const raw = JSON.parse(pluginData.output) as Record<string, string>[];
        activePlugins = raw.map((p) => ({
          slug: p.name ?? "",
          name: p.title ?? p.name ?? "",
          version: p.version ?? "",
        }));
      } catch {
        /* ignore */
      }
    }

    // 3. Post types
    let postTypes: string[] = [];
    const ptData = await call("maxi/get-post-types");
    if (Array.isArray(ptData)) {
      postTypes = ptData.map(
        (pt: Record<string, string>) => pt.name ?? pt.slug ?? "",
      );
    }

    // 4. Product count (only if WooCommerce active)
    let productCount: number | null = null;
    const hasWoo = activePlugins.some((p) => p.slug === "woocommerce");
    if (hasWoo) {
      const prodData = await call("maxi/list-content", {
        post_type: "product",
        per_page: 1,
      });
      if (typeof prodData?.total === "number") productCount = prodData.total;
    }

    return {
      wp_version: siteData.wp_version ?? "unknown",
      site_url: siteData.url ?? base,
      site_name: siteData.name ?? "",
      active_plugins: activePlugins,
      post_types: postTypes,
      product_count: productCount,
      fetched_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.warn(`Site audit failed for ${base}: ${String(err)}`);
    return null;
  }
}

/**
 * Format audit as compact text for Claude prompt.
 * Keeps token count low — only signals relevant for estimation.
 */
export function formatAuditForPrompt(audit: WpSiteAudit): string {
  const plugins = audit.active_plugins
    .map((p) => `  - ${p.name} (${p.slug}) v${p.version}`)
    .join("\n");

  const productLine =
    audit.product_count !== null
      ? `Products: ${audit.product_count}`
      : "WooCommerce: not installed";

  return `<site_audit>
Site: ${audit.site_name} (${audit.site_url})
WordPress: ${audit.wp_version}
${productLine}
Post types: ${audit.post_types.join(", ")}
Active plugins (${audit.active_plugins.length}):
${plugins}
</site_audit>`;
}
```

---

## Step 4 — Triage Agent Edge Function

Create file: `supabase/functions/triage-agent/index.ts`

### Input interface

```typescript
interface TriageInput {
  clickup_task_id: string;
  clickup_task_name: string;
  description: string;
  list_id: string;
  list_name: string;
  profile_id: string | null; // used to look up wp_mcp_url
}
```

### Execution flow

```
1. Parse and validate input
2. Read skill: Deno.readTextFile('../_shared/skills/triage_agent.md')
3. If profile_id:
     SELECT wp_mcp_url FROM profiles WHERE id = profile_id
     audit = await fetchWpSiteAudit(wp_mcp_url, logger)
   else:
     audit = null
4. Build user message:
     "Task: {task_name}\nDescription: {description}\nList: {list_name}"
     + (audit ? "\n\n" + formatAuditForPrompt(audit) : "")
5. POST to Anthropic API (claude-haiku-4-5-20251001, temp=0, max_tokens=512)
6. Parse JSON from response (retry once if invalid)
7. Format and POST ClickUp comment (English, format below)
8. UPDATE agent_jobs: output, status='awaiting_hitl', cost_usd, duration_ms,
   audit_fetched, clickup_comment_id
9. Return { ok: true, code: 'TRIAGE_COMPLETE', job_id, comment_id }
```

### ClickUp comment format (English)

```
[Triage] 🤖 Automated Task Assessment

📋 Type: {task_type}
⚡ Complexity: {complexity}
⏱ Estimated time: {hours_estimate}h
💳 Client cost: {credits} credit(s) (~€{credits * 100})
🎯 Confidence: {confidence}

💭 Reasoning:
{reasoning}

{if questions.length > 0}
❓ Open questions:
• {question_1}
• {question_2}
{endif}

{if audit_fetched}
🔍 Site context: {site_name} — WP {wp_version}, {plugin_count} plugins{product_count ? ", " + product_count + " products" : ""}
{endif}

---
Reply with:
✅ [approve] — accept estimate
✅ [approve: Xh Ycr] — accept with corrections (e.g. [approve: 3h 5cr])
❌ [reject: reason] — reject and explain
```

### Error handling rules

- Audit fails for any reason → `audit_fetched = false`, continue without it, log warning
- Claude returns invalid JSON → retry once with added instruction "Return ONLY valid JSON"
- Second Claude failure → `status = 'failed'`, save `error_message`, do not post comment
- ClickUp POST fails → `status = 'failed'`, log error, do not throw
- **Rule: always update `agent_jobs` even on failure. Never leave status as `running`.**

### Cost tracking

```typescript
// Haiku pricing (as of 2025)
const INPUT_COST_PER_TOKEN = 0.8 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 4.0 / 1_000_000;
const cost_usd =
  inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN;
```

---

## Step 5 — Extend clickup-webhook Edge Function

**Do not rewrite the existing file. Only add to it.**

### 5a. Add taskCreated handler

Add to the event router switch statement:

```typescript
case 'taskCreated': {
  await handleTaskCreated(payload, supabase, correlationId)
  break
}
```

`handleTaskCreated` implementation:

- Extract `task_id`, `task_name`, `description`, `list_id`, `list_name` from payload
- Read `TRIAGE_ENABLED_LIST_IDS` env var, split by comma
- If `list_id` not in the list → log debug, return
- Look up `profile_id`:
  ```typescript
  const { data } = await supabase
    .from("task_cache")
    .select("profile_id")
    .eq("clickup_id", task_id)
    .maybeSingle();
  const profile_id = data?.profile_id ?? null;
  ```
- Insert `agent_jobs` row with `status: 'pending'`
- Invoke triage-agent:
  ```typescript
  const { error } = await supabase.functions.invoke("triage-agent", {
    body: {
      clickup_task_id: task_id,
      clickup_task_name: task_name,
      description,
      list_id,
      list_name,
      profile_id,
    },
  });
  if (error) logger.error("triage-agent invocation failed", { error });
  ```

### 5b. Add HITL detection to taskCommentPosted

After all existing `taskCommentPosted` logic, append:

```typescript
await handleTriageHitl(payload, supabase, correlationId);
```

`handleTriageHitl` implementation:

- Get `comment_text` from payload, trim
- Match patterns (in order):
  ```
  /^\[approve\]$/i
  /^\[approve:\s*(\d+(?:\.\d+)?)h\s+(\d+(?:\.\d+)?)cr\]$/i
  /^\[reject:\s*(.+)\]$/i
  ```
- No match → return early
- Find most recent `agent_jobs` where:
  `clickup_task_id = task_id AND status = 'awaiting_hitl'`
  ordered by `created_at DESC`, limit 1
- Not found → log warn, return
- Update the row with parsed values

---

## Step 6 — Environment variables

New secrets to add in Coolify → Edge Functions → Environment Variables:

```
ANTHROPIC_API_KEY=sk-ant-...
TRIAGE_ENABLED_LIST_IDS=901305442177        # comma-separated ClickUp list IDs
WP_MCP_USER=kamanin-agent                  # WP username for Maxi AI auth
WP_MCP_APP_PASS=xxxx xxxx xxxx xxxx xxxx   # WP Application Password
```

Update `supabase/functions/.env.example` with all four variables plus comments.

---

## Step 7 — Setup documentation

Create `docs/agent-setup/triage-agent-setup.md` with:

1. Prerequisites checklist (Maxi AI Core v3 installed, Application Password created)
2. SQL snippet to set `wp_mcp_url` for a client:
   ```sql
   UPDATE profiles SET wp_mcp_url = 'https://staging.client-site.com'
   WHERE email = 'client@example.com';
   ```
3. How to create WordPress Application Password (step-by-step)
4. How to re-register ClickUp webhook to add `taskCreated`:

   ```bash
   # Step 1: find existing webhook ID
   curl https://api.clickup.com/api/v2/team/{TEAM_ID}/webhook \
     -H "Authorization: {CLICKUP_API_TOKEN}"

   # Step 2: delete it
   curl -X DELETE https://api.clickup.com/api/v2/webhook/{WEBHOOK_ID} \
     -H "Authorization: {CLICKUP_API_TOKEN}"

   # Step 3: re-create with taskCreated added
   curl -X POST https://api.clickup.com/api/v2/team/{TEAM_ID}/webhook \
     -H "Authorization: {CLICKUP_API_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{
       "endpoint": "https://portal.db.kamanin.at/functions/v1/clickup-webhook",
       "events": ["taskCreated", "taskStatusUpdated", "taskCommentPosted"]
     }'
   ```

5. How to find ClickUp List IDs (from URL: app.clickup.com/t/{LIST_ID}/...)
6. How to verify it works:
   - Create test task in monitored list
   - Check `agent_jobs` table in Supabase
   - Expect `[Triage]` comment in ClickUp within 15 seconds

---

## Constraints — strictly follow

1. **No new dependencies** — only fetch() for Anthropic, existing Supabase client
2. **No frameworks** — no LangChain, no AI SDK wrappers
3. **Deno runtime** — `Deno.readTextFile`, `AbortSignal.timeout`, not Node APIs
4. **Service role only** — `triage-agent` never uses anon key
5. **Do not modify** existing `taskStatusUpdated` and `taskCommentPosted` handlers
6. **Do not touch** frontend
7. **Response contract** — `{ ok, code, message, correlationId }` on all responses
8. **Shared utilities** — use existing CORS, logger from `_shared/`
9. **Audit is always optional** — failure must never block triage
10. **All ClickUp comment text must be in English**

---

## Deliverables checklist

- [ ] `supabase/migrations/[timestamp]_create_agent_jobs.sql`
- [ ] `supabase/functions/_shared/skills/triage_agent.md`
- [ ] `supabase/functions/_shared/wp-audit.ts`
- [ ] `supabase/functions/triage-agent/index.ts`
- [ ] `supabase/functions/clickup-webhook/index.ts` — taskCreated added, existing untouched
- [ ] `supabase/functions/clickup-webhook/index.ts` — HITL detection added
- [ ] `supabase/functions/.env.example` — updated
- [ ] `docs/agent-setup/triage-agent-setup.md`

---

## Success criteria

1. Task created in monitored list → `[Triage]` comment within 15 seconds
2. Client creates task via portal → same result
3. `wp_mcp_url` set → comment includes "Site context" line with real data
4. `wp_mcp_url` null → comment appears without site context line
5. Maxi AI unreachable → triage still completes, `audit_fetched = false`
6. `[approve]` → `status = 'approved'`
7. `[approve: 4h 6cr]` → `status = 'approved'`, `hitl_hours = 4`, `hitl_credits = 6`
8. `[reject: need more details]` → `status = 'rejected'`, `hitl_comment` set
9. Non-monitored list → silently ignored, no row in `agent_jobs`
10. Claude returns invalid JSON → retried once, then `status = 'failed'`
