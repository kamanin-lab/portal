# ClickUp API v2 — Webhook Endpoints & Event Payloads

Source: clickup-api-v2-reference.json (4 endpoints) + developer.clickup.com/docs/webhooks

Base URL: `https://api.clickup.com/api/v2`
Auth: `Authorization: pk_xxxxx`

---

## GET /v2/team/{team_id}/webhook — Get Webhooks

```typescript
async function getWebhooks(teamId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.webhooks ?? [];
}
// Response: { webhooks: [{ id, userid, team_id, endpoint, client_id, events, task_id, list_id, folder_id, space_id, health, secret }] }
```

---

## POST /v2/team/{team_id}/webhook — Create Webhook

**Required:** `endpoint` (string), `events` (array of event types or `["*"]`)

**Optional scope filters** (webhook receives events only for this scope):

| field | type | description |
|-------|------|-------------|
| space_id | integer | Limit to a Space |
| folder_id | integer | Limit to a Folder |
| list_id | integer | Limit to a List |
| task_id | string | Limit to a single Task |

```typescript
async function createWebhook(teamId: string, token: string, data: {
  endpoint: string;
  events: string[];   // see list below, or use ["*"] for all
  space_id?: number;
  folder_id?: number;
  list_id?: number;
  task_id?: string;
}): Promise<{ id: string; secret: string }> {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/webhook`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await res.json();
  // IMPORTANT: result.secret is shown ONLY once on creation — store it!
  return { id: result.id, secret: result.webhook.secret };
}

// Subscribe to task + comment events for a specific list:
const { id, secret } = await createWebhook(teamId, token, {
  endpoint: 'https://yourproject.supabase.co/functions/v1/clickup-webhook',
  events: [
    'taskCreated', 'taskUpdated', 'taskDeleted',
    'taskStatusUpdated', 'taskCommentPosted', 'taskCommentUpdated',
    'taskAssigneeUpdated', 'taskPriorityUpdated', 'taskDueDateUpdated',
    'taskTagUpdated', 'taskMoved',
  ],
  list_id: 123456789,
});
// Store id and secret in Supabase secrets / Edge Function env
```

---

## PUT /v2/webhook/{webhook_id} — Update Webhook

```typescript
async function updateWebhook(webhookId: string, token: string, data: {
  endpoint?: string;
  events?: string[];
  status?: 'active' | 'suspended';
}): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/webhook/${webhookId}`, {
    method: 'PUT',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
```

---

## DELETE /v2/webhook/{webhook_id} — Delete Webhook

```typescript
async function deleteWebhook(webhookId: string, token: string): Promise<void> {
  const res = await fetch(`https://api.clickup.com/api/v2/webhook/${webhookId}`, {
    method: 'DELETE',
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}
```

---

## All 28 Event Types

From official ClickUp webhook documentation:

### Task Events (13)
| Event | Triggers when |
|-------|--------------|
| `taskCreated` | A task is created |
| `taskUpdated` | Any field on a task changes (broad — check history_items.type) |
| `taskDeleted` | A task is deleted |
| `taskStatusUpdated` | Task status changes |
| `taskPriorityUpdated` | Task priority changes |
| `taskAssigneeUpdated` | Task assignees change |
| `taskDueDateUpdated` | Task due date changes |
| `taskTagUpdated` | Task tags change |
| `taskMoved` | Task moved to different List |
| `taskCommentPosted` | Comment added to task |
| `taskCommentUpdated` | Comment edited |
| `taskTimeEstimateUpdated` | Time estimate changes |
| `taskTimeTrackedUpdated` | Time tracking entry added/changed |

### List Events (3)
| Event | Triggers when |
|-------|--------------|
| `listCreated` | List is created |
| `listUpdated` | List updated |
| `listDeleted` | List deleted |

### Folder Events (3)
| Event | Triggers when |
|-------|--------------|
| `folderCreated` | Folder created |
| `folderUpdated` | Folder updated |
| `folderDeleted` | Folder deleted |

### Space Events (3)
| Event | Triggers when |
|-------|--------------|
| `spaceCreated` | Space created |
| `spaceUpdated` | Space updated |
| `spaceDeleted` | Space deleted |

### Goal / Key Result Events (6)
| Event | Triggers when |
|-------|--------------|
| `goalCreated` | Goal created |
| `goalUpdated` | Goal updated |
| `goalDeleted` | Goal deleted |
| `keyResultCreated` | Key result created |
| `keyResultUpdated` | Key result updated |
| `keyResultDeleted` | Key result deleted |

---

## Incoming Webhook Payload Structure

ClickUp POSTs this JSON to your endpoint:

```typescript
interface ClickUpWebhookPayload {
  event: string;           // e.g. "taskStatusUpdated"
  webhook_id: string;      // your webhook's ID
  task_id?: string;        // present for task events (e.g. "9hz")
  list_id?: number;        // present for task + list events
  folder_id?: number;      // present for task + folder events
  space_id?: number;       // present for task + space events
  history_items: Array<{
    id: string;            // unique history item ID
    type: number;          // change type code
    date: string;          // Unix ms as string (e.g. "1698765432000")
    source: string | null;
    user: {
      id: number;
      username: string;
      email?: string;
      color?: string;
      profilePicture?: string;
    };
    before: unknown;       // previous value — shape depends on event type
    after: unknown;        // new value — shape depends on event type
  }>;
}
```

### taskStatusUpdated — before/after shape

```typescript
// history_items[0].before / .after:
{
  status: string;          // e.g. "to do"
  color: string;           // hex color e.g. "#d3d3d3"
  type: string;            // "open" | "custom" | "closed"
  orderindex?: number;
}
```

### taskCommentPosted — payload

```typescript
// payload.task_id = task that received the comment
// history_items[0].after contains the comment data:
{
  id: string;
  comment: Array<{ text: string }>;  // comment body blocks
  comment_text: string;              // plain text version
  user: { id: number; username: string };
  resolved: boolean;
  date: string;           // Unix ms as string
}
```

### taskAssigneeUpdated — before/after shape

```typescript
// history_items[0].before / .after:
{
  assignees_added?: Array<{ id: number; username: string }>;
  assignees_removed?: Array<{ id: number; username: string }>;
}
```

### taskPriorityUpdated — before/after shape

```typescript
// history_items[0].before / .after:
{
  priority: {
    color: string;    // hex
    id: string;       // "1"|"2"|"3"|"4"
    orderindex: string;
    priority: string; // "urgent"|"high"|"normal"|"low"
  } | null
}
```

---

## Signature Verification

ClickUp signs each webhook with a shared secret (returned once on creation).

**Header:** `X-Signature` (HMAC-SHA256 hex of raw request body)

```typescript
// Deno Edge Function (SubtleCrypto):
async function verifyClickUpSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  const expected = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  return expected === signature;
}

// Usage in Edge Function:
serve(async (req) => {
  const body = await req.text();
  const signature = req.headers.get('x-signature') ?? '';
  const secret = Deno.env.get('CLICKUP_WEBHOOK_SECRET') ?? '';

  if (!(await verifyClickUpSignature(body, signature, secret))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const payload = JSON.parse(body);
  // process payload.event ...
});
```

---

## Idempotency

Webhooks may deliver duplicate events. Use the idempotency key from official docs:

```
{webhook_id}:{history_item_id}
```

Store processed keys (e.g. in a Redis set or Supabase table) and skip if already seen.

---

## Webhook Lifecycle & Suspension

- ClickUp **automatically suspends** a webhook after repeated delivery failures (non-2xx responses)
- No automated recovery — must be manually re-created
- Recovery: `DELETE /webhook/{id}` → `POST /team/{team_id}/webhook` → store new `id` + `secret`
- Check webhook health: `GET /team/{team_id}/webhook` → `health.status` field

```typescript
async function recreateWebhook(oldWebhookId: string, teamId: string, token: string, endpoint: string) {
  // 1. Delete suspended webhook
  await deleteWebhook(oldWebhookId, token);

  // 2. Create new webhook
  const { id, secret } = await createWebhook(teamId, token, {
    endpoint,
    events: ['*'],
  });

  // 3. Update stored webhook_id and secret in your config
  // e.g. update Supabase row / Deno env
  return { id, secret };
}
```

---

## Portal-Specific: Webhook Edge Function Pattern

```typescript
// supabase/functions/clickup-webhook/index.ts (Deno)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const body = await req.text();
  const signature = req.headers.get('x-signature') ?? '';

  // Verify
  const secret = Deno.env.get('CLICKUP_WEBHOOK_SECRET') ?? '';
  if (!(await verifyClickUpSignature(body, signature, secret))) {
    return new Response(JSON.stringify({ ok: false, code: 'INVALID_SIGNATURE' }), {
      status: 401, headers: { 'Content-Type': 'application/json' }
    });
  }

  const payload: ClickUpWebhookPayload = JSON.parse(body);
  const correlationId = crypto.randomUUID();

  try {
    await routeWebhookEvent(payload, correlationId);
    return new Response(JSON.stringify({ ok: true, correlationId }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error({ correlationId, error: err.message, event: payload.event });
    return new Response(JSON.stringify({ ok: false, code: 'INTERNAL_ERROR', correlationId }), {
      status: 500, headers: { 'Content-Type': 'application/json' }
    });
  }
});
```
