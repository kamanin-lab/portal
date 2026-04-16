# KAMANIN Portal — ClickUp Integration Patterns

Source: KAMANIN Portal codebase (kamanin-portal/)

---

## Architecture

- ALL ClickUp API calls go through Supabase Edge Functions (Deno) — never directly from the browser
- API token is a server-side secret: `Deno.env.get("CLICKUP_API_TOKEN")`
- UI reads ONLY from cache tables (`task_cache`, `comment_cache`) — never from ClickUp directly
- Webhook events update the cache; UI reacts via Supabase Realtime subscriptions

```
Browser → Supabase Edge Function → ClickUp API
Browser ← Supabase Realtime ← task_cache / comment_cache ← Webhook → Edge Function
```

---

## Webhook Routing

Incoming webhooks are routed by `list_id` to determine project vs. ticket context:

```typescript
// supabase/functions/clickup-webhook/index.ts
async function routeWebhookEvent(payload: ClickUpWebhookPayload, correlationId: string) {
  const { event, task_id, list_id } = payload;

  // Determine context from list_id
  const { data: mapping } = await supabase
    .from('clickup_list_mappings')
    .select('context_type, context_id')
    .eq('list_id', list_id)
    .single();

  if (!mapping) {
    console.warn({ correlationId, msg: 'Unknown list_id', list_id });
    return; // ignore — not a Portal-tracked list
  }

  if (event === 'taskStatusUpdated') {
    await handleStatusUpdate(payload, mapping, correlationId);
  } else if (event === 'taskCommentPosted') {
    await handleCommentPosted(payload, mapping, correlationId);
  } else if (event === 'taskCreated' || event === 'taskUpdated') {
    await syncTaskToCache(task_id!, mapping, correlationId);
  }
  // Other events: log and ignore
}
```

---

## Comment Filtering

Portal comments sent to ClickUp are prefixed with `[Portal]` to prevent webhook echo loops:

```typescript
// When portal user posts a comment → send to ClickUp via Edge Function:
const commentBody = `[Portal] ${userText}`;

// Webhook handler — filter out portal-originated comments:
if (event === 'taskCommentPosted') {
  const commentText: string = payload.history_items[0]?.after?.comment_text ?? '';
  if (commentText.startsWith('[Portal]')) {
    return; // skip — this is our own comment echoed back
  }
  // Only store ClickUp-native comments in comment_cache
  await storeComment(payload);
}
```

---

## Thread Context Check

Before syncing a comment, verify it belongs to a task that is visible in the portal:

```typescript
async function storeComment(payload: ClickUpWebhookPayload) {
  const { task_id } = payload;

  // Only cache comments for tasks that exist in task_cache
  const { data: task } = await supabase
    .from('task_cache')
    .select('id, profile_id')
    .eq('clickup_task_id', task_id)
    .single();

  if (!task) return; // task not visible in portal — skip

  await supabase.from('comment_cache').upsert({
    clickup_task_id: task_id,
    profile_id: task.profile_id,
    // ...
  });
}
```

---

## Visibility Gate

Only tasks with the ClickUp custom field "Visible in client portal" set to `true` are synced to `task_cache`:

```typescript
const VISIBILITY_FIELD_NAME = 'Visible in client portal';

function isVisibleInPortal(task: ClickUpTask): boolean {
  const field = task.custom_fields?.find(f => f.name === VISIBILITY_FIELD_NAME);
  return field?.value === true || field?.value === 1;
}

// Usage in sync function:
if (!isVisibleInPortal(clickupTask)) {
  // Remove from cache if previously visible
  await supabase.from('task_cache').delete().eq('clickup_task_id', clickupTask.id);
  return;
}
// Upsert into cache
await upsertTaskToCache(clickupTask);
```

---

## Status Mapping

ClickUp raw status string → Portal status key. Always run through `mapStatus()` before comparing or displaying.

```typescript
// src/modules/tickets/lib/status-mapping.ts
export type PortalStatus =
  | 'open'
  | 'in_progress'
  | 'needs_attention'
  | 'approved'
  | 'done'
  | 'on_hold'
  | 'cancelled';

export function mapStatus(raw: string): PortalStatus {
  const s = raw.toLowerCase().trim();
  if (s === 'to do') return 'open';
  if (['in progress', 'internal review', 'rework'].includes(s)) return 'in_progress';
  if (s === 'client review') return 'needs_attention';
  if (s === 'approved') return 'approved';
  if (s === 'complete') return 'done';
  if (s === 'on hold') return 'on_hold';
  if (s === 'canceled' || s === 'cancelled') return 'cancelled';
  return 'open'; // fallback
}
```

| ClickUp raw | Portal key | German label |
|-------------|------------|--------------|
| `TO DO` | `open` | Offen |
| `IN PROGRESS`, `INTERNAL REVIEW`, `REWORK` | `in_progress` | In Bearbeitung |
| `CLIENT REVIEW` | `needs_attention` | Ihre Rückmeldung |
| `APPROVED` | `approved` | Freigegeben |
| `COMPLETE` | `done` | Abgeschlossen |
| `ON HOLD` | `on_hold` | Pausiert |
| `CANCELED` | `cancelled` | Abgebrochen |

---

## task_cache Pattern

`task_cache` stores raw ClickUp data in `raw_data` JSONB, with top-level columns that override stale fields after status/priority updates:

```typescript
// src/modules/tickets/lib/transforms.ts
export function transformCachedTask(row: CachedTask): ClickUpTask {
  const raw = row.raw_data as ClickUpTask;
  return {
    ...raw,
    // Top-level columns override raw_data (set by webhook updates)
    status: row.status ?? raw.status,         // top-level wins
    priority: row.priority ?? raw.priority,
    due_date: row.due_date ?? raw.due_date,
    assignees: row.assignees ?? raw.assignees,
  };
}
```

**Why this matters:** When a `taskStatusUpdated` webhook fires, the Edge Function updates `task_cache.status` directly. The `raw_data.status` is NOT updated (only a full re-sync updates it). The top-level column override ensures UI always shows the current status without re-fetching ClickUp.

---

## Webhook Suspension Recovery

ClickUp auto-suspends webhooks after repeated delivery failures (non-2xx responses). Recovery:

```typescript
// Check health (run periodically or on first request)
async function checkAndHealWebhook(teamId: string, token: string) {
  const webhooks = await getWebhooks(teamId, token);
  const portal = webhooks.find(w => w.endpoint.includes('clickup-webhook'));

  if (!portal || portal.health?.status === 'suspended') {
    console.error('Portal webhook is suspended — recreating');

    // 1. Delete old (if exists)
    if (portal) await deleteWebhook(portal.id, token);

    // 2. Create new
    const { id, secret } = await createWebhook(teamId, token, {
      endpoint: Deno.env.get('PORTAL_WEBHOOK_URL')!,
      events: ['taskCreated', 'taskUpdated', 'taskDeleted', 'taskStatusUpdated',
               'taskCommentPosted', 'taskCommentUpdated', 'taskAssigneeUpdated',
               'taskPriorityUpdated', 'taskDueDateUpdated', 'taskTagUpdated', 'taskMoved'],
    });

    // 3. Store new id + secret in Supabase config table
    await supabase.from('app_config').upsert([
      { key: 'CLICKUP_WEBHOOK_ID', value: id },
      { key: 'CLICKUP_WEBHOOK_SECRET', value: secret },
    ]);
  }
}
```

---

## Edge Function Patterns

### Standard structure for ClickUp proxy functions

```typescript
// supabase/functions/[function-name]/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const correlationId = crypto.randomUUID();

  try {
    // Auth: verify caller is authenticated portal user
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ ok: false, code: 'UNAUTHORIZED' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ClickUp call
    const token = Deno.env.get('CLICKUP_API_TOKEN')!;
    const res = await fetch(`${CLICKUP_BASE}/task/${taskId}`, {
      headers: { Authorization: token }  // NO "Bearer" prefix for personal token!
    });

    // Handle 202XX relay errors (transient — retry once)
    if (res.status >= 20200 && res.status <= 20299) {
      await new Promise(r => setTimeout(r, 1000));
      // retry once...
    }

    const data = await res.json();
    return new Response(JSON.stringify({ ok: true, data, correlationId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error({ correlationId, error: err.message });
    return new Response(JSON.stringify({ ok: false, code: 'INTERNAL_ERROR', correlationId }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
```

### Key Edge Function rules

| Rule | Detail |
|------|--------|
| Token | `Deno.env.get("CLICKUP_API_TOKEN")` — personal token, no "Bearer" prefix |
| Auth check | Always verify Supabase user before proxying ClickUp requests |
| 202XX errors | Transient relay error — retry once after 1s, then return 500 |
| correlationId | `crypto.randomUUID()` in every function — log it, return it in response |
| PII | Never log email, full names, or task content — only IDs and status codes |
| Webhook secret | `Deno.env.get("CLICKUP_WEBHOOK_SECRET")` — stored as Supabase secret |
| CORS | Always include `corsHeaders` from `../_shared/cors.ts` |
| Content-Type | Include `'Content-Type': 'application/json'` on all POST/PUT to ClickUp |
