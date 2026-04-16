---
name: clickup-api
description: >
  Complete ClickUp API v2 reference. Use when writing or modifying code that
  interacts with ClickUp — webhooks, tasks, comments, statuses, custom fields,
  lists, folders, spaces. Covers all 135 endpoints, authentication, rate limits,
  and webhook payloads. Includes KAMANIN Portal-specific integration patterns.
  Source: official OpenAPI spec v2.0 (470KB, 135 endpoints verified).
---

# ClickUp API v2 — Coding Reference

## Quick Reference

```
Base URL:     https://api.clickup.com/api/v2
Personal Token: Authorization: pk_xxxxx          ← NO "Bearer" prefix!
OAuth Token:  Authorization: Bearer {access_token}
Dates:        Unix milliseconds (int64) — NOT seconds
Rate limit:   ~100 req/min, headers: X-RateLimit-Limit / X-RateLimit-Remaining / X-RateLimit-Reset
```

## Hierarchy

```
Workspace (team_id)
  └── Space (space_id)
        └── Folder (folder_id)   ← "project" in v1, "folder" in v2
              └── List (list_id)
                    └── Task (task_id)    e.g. "9hz"
                          └── Subtask    (task with parent field)
```

**Legacy naming gotcha:** `team` = Workspace, `project` = Folder. The API uses "team" throughout for Workspace.

---

## Most-Used Endpoints

### Get Tasks from a List

```typescript
const BASE = 'https://api.clickup.com/api/v2';
const TOKEN = Deno.env.get('CLICKUP_API_TOKEN'); // Edge Function only

async function getTasks(listId: string, page = 0): Promise<any[]> {
  const params = new URLSearchParams({
    page: page.toString(),
    include_closed: 'true',   // include COMPLETE + CANCELED
    subtasks: 'true',         // include subtasks
  });
  const res = await fetch(`${BASE}/list/${listId}/task?${params}`, {
    headers: { Authorization: TOKEN }
  });
  const data = await res.json();
  return data.tasks ?? [];
}

// Paginate until empty page
async function getAllTasks(listId: string) {
  const all = [];
  let page = 0;
  while (true) {
    const tasks = await getTasks(listId, page);
    all.push(...tasks);
    if (tasks.length < 100) break; // last page
    page++;
  }
  return all;
}
```

### Get Single Task

```typescript
async function getTask(taskId: string): Promise<any> {
  const res = await fetch(`${BASE}/task/${taskId}?include_subtasks=true`, {
    headers: { Authorization: TOKEN }
  });
  return res.json();
}
```

### Update Task Status

```typescript
async function updateTaskStatus(taskId: string, status: string): Promise<void> {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    method: 'PUT',
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })  // raw ClickUp status string e.g. "client review"
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}
```

### Create Task

```typescript
async function createTask(listId: string, data: {
  name: string;
  description?: string;
  status?: string;
  priority?: 1|2|3|4|null;  // 1=urgent, 2=high, 3=normal, 4=low
  due_date?: number;          // Unix ms
  assignees?: number[];       // user IDs
  parent?: string;            // task_id → creates subtask
  custom_fields?: Array<{ id: string; value: unknown }>;
}): Promise<any> {
  const res = await fetch(`${BASE}/list/${listId}/task`, {
    method: 'POST',
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  return res.json();
}
```

### Get Task Comments

```typescript
async function getTaskComments(taskId: string): Promise<any[]> {
  const res = await fetch(`${BASE}/task/${taskId}/comment`, {
    headers: { Authorization: TOKEN }
  });
  const data = await res.json();
  return data.comments ?? [];
}
```

### Create Task Comment

```typescript
async function createComment(taskId: string, text: string, notifyAll = false): Promise<any> {
  const res = await fetch(`${BASE}/task/${taskId}/comment`, {
    method: 'POST',
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment_text: text, notify_all: notifyAll })
  });
  return res.json();
}
```

### Set Custom Field Value

```typescript
async function setCustomField(taskId: string, fieldId: string, value: unknown): Promise<void> {
  const res = await fetch(`${BASE}/task/${taskId}/field/${fieldId}`, {
    method: 'POST',
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value })  // format depends on field type — see endpoints-fields.md
  });
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
}
```

### Create Webhook

```typescript
async function createWebhook(teamId: string, endpoint: string): Promise<string> {
  const res = await fetch(`${BASE}/team/${teamId}/webhook`, {
    method: 'POST',
    headers: { Authorization: TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      events: ['taskCreated','taskUpdated','taskDeleted','taskStatusUpdated',
               'taskCommentPosted','taskCommentUpdated','taskAssigneeUpdated',
               'taskPriorityUpdated','taskDueDateUpdated','taskTagUpdated','taskMoved'],
    })
  });
  const data = await res.json();
  return data.id; // webhook_id — store this!
}
```

### Delete Task

```typescript
async function deleteTask(taskId: string): Promise<void> {
  const res = await fetch(`${BASE}/task/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: TOKEN }
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
```

---

## Webhook Overview

Incoming webhooks POST JSON to your endpoint. Verify signature before processing.

**28 Event Types** (from official docs):

| Category | Events |
|----------|--------|
| Task | `taskCreated`, `taskUpdated`, `taskDeleted`, `taskPriorityUpdated`, `taskStatusUpdated`, `taskAssigneeUpdated`, `taskDueDateUpdated`, `taskTagUpdated`, `taskMoved`, `taskCommentPosted`, `taskCommentUpdated`, `taskTimeEstimateUpdated`, `taskTimeTrackedUpdated` |
| List | `listCreated`, `listUpdated`, `listDeleted` |
| Folder | `folderCreated`, `folderUpdated`, `folderDeleted` |
| Space | `spaceCreated`, `spaceUpdated`, `spaceDeleted` |
| Goal | `goalCreated`, `goalUpdated`, `goalDeleted`, `keyResultCreated`, `keyResultUpdated`, `keyResultDeleted` |

**Payload structure:**

```typescript
interface ClickUpWebhookPayload {
  event: string;           // e.g. "taskStatusUpdated"
  webhook_id: string;
  task_id?: string;        // present for task events
  list_id?: number;
  folder_id?: number;
  space_id?: number;
  history_items: Array<{
    id: string;
    type: number;
    date: string;          // Unix ms as string!
    source: string | null;
    user: { id: number; username: string };
    before: unknown;       // previous value (shape varies by event)
    after: unknown;        // new value
  }>;
}
```

**Signature verification** (HMAC-SHA256):

```typescript
import { createHmac } from 'node:crypto'; // or SubtleCrypto in Deno

function verifySignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return expected === signature;
}
// header: X-Signature
// secret: returned when creating webhook (store securely)
```

**Idempotency key** (from official ClickUp docs): `{webhook_id}:{history_item_id}`

---

## Key Gotchas

| Issue | Detail |
|-------|--------|
| Task ID format | API: `"9hz"` — UI shows `#9hz`. Never send the `#`. |
| Personal token | `Authorization: pk_xxxxx` — **no** "Bearer" prefix |
| "team" = Workspace | Legacy naming throughout v2 API |
| "project" = Folder | v1 term; API uses "folder" in v2 |
| Date format | Always Unix **milliseconds** (int64), never seconds |
| Subtasks | POST task with `parent: "task_id"` — parent must be in same List |
| `custom_task_ids` | Requires `team_id` query param alongside it |
| Assignees update | `{ add: [userId], rem: [userId] }` — not a replace! |
| Closed tasks | Add `include_closed=true` to see COMPLETE + CANCELED |
| Priority values | 1=urgent, 2=high, 3=normal, 4=low, null=none |
| `*` events | Webhook `events: ["*"]` subscribes to all 28 event types |

---

## Portal Integration Patterns (Summary)

See full details in [portal-patterns.md](portal-patterns.md).

- All ClickUp calls go through Supabase Edge Functions — never from the browser
- API token is `Deno.env.get("CLICKUP_API_TOKEN")` in Edge Functions
- `task_cache.status` contains raw ClickUp string → call `mapStatus()` before comparing
- Visibility gate: custom field "Visible in client portal" checked on every webhook
- Comment loop prevention: portal comments prefixed `[Portal]`, webhook filters by prefix
- Status mapping: `taskStatusUpdated` → update `task_cache`, set top-level `status` column

---

## Reference Files

| File | Contents |
|------|---------|
| [endpoints-tasks.md](endpoints-tasks.md) | All 10 Task endpoints + 4 Task Relationship endpoints, full param tables |
| [endpoints-webhooks.md](endpoints-webhooks.md) | Webhook CRUD + all 28 event payloads + signature verification |
| [auth-and-limits.md](auth-and-limits.md) | OAuth2 flow, rate limits, pagination, date format details |
| [portal-patterns.md](portal-patterns.md) | KAMANIN Portal integration architecture and patterns |
| [endpoints-comments.md](endpoints-comments.md) | All 10 Comment endpoints *(Session 2)* |
| [endpoints-hierarchy.md](endpoints-hierarchy.md) | Workspaces, Spaces, Folders, Lists *(Session 2)* |
| [endpoints-fields.md](endpoints-fields.md) | Custom Fields, Tags, Checklists, value type table *(Session 2)* |
| [endpoints-other.md](endpoints-other.md) | Goals, Views, Time Tracking, Members, Attachments, Guests *(Session 2)* |
