# ClickUp API v2 — Task & Subtask Endpoints

Source: clickup-api-v2-reference.json (verified, 10 task endpoints + 4 relationship endpoints)

Base URL: `https://api.clickup.com/api/v2`
Auth: `Authorization: pk_xxxxx`

---

## GET /v2/list/{list_id}/task — Get Tasks

Returns tasks in a List. Paginated, page size 100.

**Query Parameters:**

| name | type | required | description |
|------|------|----------|-------------|
| page | integer | no | Page to fetch, starts at 0 |
| order_by | string | no | `id`, `created`, `updated`, `due_date` (default: `created`) |
| reverse | boolean | no | Reverse order |
| subtasks | boolean | no | Include subtasks (default: false) |
| statuses | array | no | Filter by status strings, e.g. `?statuses[]=to+do&statuses[]=in+progress` |
| include_closed | boolean | no | Include COMPLETE + CANCELED tasks (default: false) |
| include_timl | boolean | no | Include Tasks in Multiple Lists |
| assignees | array | no | Filter by user IDs `?assignees[]=1234` |
| watchers | array | no | Filter by watcher user IDs |
| tags | array | no | Filter by tag names `?tags[]=tag1` |
| due_date_gt | integer | no | Filter: due date > Unix ms |
| due_date_lt | integer | no | Filter: due date < Unix ms |
| date_created_gt | integer | no | Filter: created > Unix ms |
| date_created_lt | integer | no | Filter: created < Unix ms |
| date_updated_gt | integer | no | Filter: updated > Unix ms |
| date_updated_lt | integer | no | Filter: updated < Unix ms |
| date_done_gt | integer | no | Filter: done > Unix ms |
| date_done_lt | integer | no | Filter: done < Unix ms |
| custom_fields | array | no | Filter by multiple custom field values |
| custom_field | array | no | Filter by single custom field value |
| custom_items | array | no | Filter by custom task type IDs |
| include_markdown_description | boolean | no | Return description in Markdown |
| archived | boolean | no | Include archived tasks |

```typescript
// Fetch all tasks with pagination
async function getAllTasksInList(listId: string, token: string): Promise<any[]> {
  const BASE = 'https://api.clickup.com/api/v2';
  const all: any[] = [];
  let page = 0;

  while (true) {
    const params = new URLSearchParams({
      page: page.toString(),
      include_closed: 'true',
      subtasks: 'true',
    });
    const res = await fetch(`${BASE}/list/${listId}/task?${params}`, {
      headers: { Authorization: token },
    });
    const data = await res.json();
    const tasks: any[] = data.tasks ?? [];
    all.push(...tasks);
    if (tasks.length < 100) break;
    page++;
  }
  return all;
}
```

**Response:** `{ tasks: Task[] }`

---

## GET /v2/task/{task_id} — Get Task

**Path params:** `task_id` (string, e.g. `"9hz"`)

**Query Parameters:**

| name | type | required | description |
|------|------|----------|-------------|
| custom_task_ids | boolean | no | Use custom task ID instead of task_id |
| team_id | number | no | Required when custom_task_ids=true |
| include_subtasks | boolean | no | Include subtasks in response |
| include_markdown_description | boolean | no | Description as Markdown |
| custom_fields | array | no | Filter by custom field values |

```typescript
async function getTask(taskId: string, token: string): Promise<any> {
  const res = await fetch(
    `https://api.clickup.com/api/v2/task/${taskId}?include_subtasks=true`,
    { headers: { Authorization: token } }
  );
  return res.json();
}
```

**Key Response Fields:**

```typescript
interface ClickUpTask {
  id: string;                 // e.g. "9hz"
  name: string;
  description: string;
  status: { status: string; color: string; type: string };
  priority: { id: string; priority: string; color: string } | null;
  due_date: string | null;    // Unix ms as string
  start_date: string | null;
  date_created: string;       // Unix ms as string
  date_updated: string;
  creator: { id: number; username: string; email: string };
  assignees: Array<{ id: number; username: string; email: string }>;
  tags: Array<{ name: string; tag_fg: string; tag_bg: string }>;
  parent: string | null;      // parent task_id if subtask
  list: { id: string; name: string };
  folder: { id: string; name: string };
  space: { id: string };
  url: string;
  custom_fields: Array<{ id: string; name: string; type: string; value: unknown }>;
}
```

---

## POST /v2/list/{list_id}/task — Create Task

**Request Body:**

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | **yes** | Task name |
| description | string | no | Plain text description |
| markdown_content | string | no | Markdown description (takes precedence over description) |
| assignees | number[] | no | Array of user IDs |
| group_assignees | string[] | no | Array of group IDs |
| tags | string[] | no | Tag names |
| status | string | no | Status string (must match list's statuses) |
| priority | number\|null | no | 1=urgent, 2=high, 3=normal, 4=low, null=none |
| due_date | integer | no | Unix milliseconds |
| due_date_time | boolean | no | Include time in due date display |
| start_date | integer | no | Unix milliseconds |
| start_date_time | boolean | no | Include time in start date display |
| time_estimate | integer | no | Time estimate in milliseconds |
| points | number | no | Sprint Points |
| notify_all | boolean | no | Send notifications to everyone |
| parent | string\|null | no | Parent task ID → creates subtask (must be in same List) |
| links_to | string\|null | no | Task ID to link as dependency |
| check_required_custom_fields | boolean | no | Enforce required custom fields (default: false) |
| custom_fields | array | no | Custom field values (see endpoints-fields.md for format) |
| custom_item_id | number | no | Custom task type ID (null = standard Task) |

```typescript
async function createTask(listId: string, token: string, data: {
  name: string;
  description?: string;
  status?: string;
  priority?: 1|2|3|4|null;
  due_date?: number;
  assignees?: number[];
  parent?: string;    // creates subtask
}): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/task`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

// Create subtask example:
// createTask(listId, token, { name: 'Sub', parent: 'abc123' })
```

---

## PUT /v2/task/{task_id} — Update Task

**Request Body (all fields optional):**

| field | type | description |
|-------|------|-------------|
| name | string | New task name |
| description | string | Plain text. Send `" "` (space) to clear. |
| markdown_content | string | Markdown (takes precedence) |
| status | string | New status (raw ClickUp string, e.g. "client review") |
| priority | integer | 1=urgent, 2=high, 3=normal, 4=low |
| due_date | integer | Unix ms (null to clear) |
| due_date_time | boolean | |
| start_date | integer | Unix ms |
| start_date_time | boolean | |
| time_estimate | integer | Ms |
| points | number | Sprint Points |
| parent | string | Move subtask to new parent (must be in same List) |
| assignees | `{ add: number[]; rem: number[] }` | Add/remove assignees by user ID — NOT a replace! |
| group_assignees | `{ add: string[]; rem: string[] }` | Add/remove group assignees |
| watchers | `{ add: number[]; rem: number[] }` | Add/remove watchers |
| archived | boolean | Archive/unarchive |
| custom_item_id | number\|null | Change task type |

```typescript
// Update status
async function updateTaskStatus(taskId: string, token: string, status: string): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    method: 'PUT',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  return res.json();
}

// Add/remove assignees
async function updateAssignees(taskId: string, token: string, add: number[], rem: number[]): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    method: 'PUT',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ assignees: { add, rem } }),
  });
  return res.json();
}
```

---

## DELETE /v2/task/{task_id} — Delete Task

```typescript
async function deleteTask(taskId: string, token: string): Promise<void> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
```

---

## GET /v2/team/{team_Id}/task — Get Filtered Team Tasks

Filters tasks across entire Workspace. Note: `team_Id` uses capital I in the spec.

Supports all the same query params as Get Tasks plus additional filters.

```typescript
async function getTeamTasks(teamId: string, token: string, filters: {
  list_ids?: string[];
  statuses?: string[];
  assignees?: number[];
  page?: number;
}): Promise<any[]> {
  const params = new URLSearchParams({ include_closed: 'true' });
  filters.list_ids?.forEach(id => params.append('list_ids[]', id));
  filters.statuses?.forEach(s => params.append('statuses[]', s));
  filters.assignees?.forEach(a => params.append('assignees[]', a.toString()));
  if (filters.page) params.set('page', filters.page.toString());

  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/task?${params}`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.tasks ?? [];
}
```

---

## POST /v2/task/{task_id}/merge — Merge Tasks

Merges one or more tasks into a target task.

```typescript
async function mergeTasks(targetTaskId: string, token: string, mergeTaskIds: string[]): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${targetTaskId}/merge`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ tasks_to_merge: mergeTaskIds }),
  });
  return res.json();
}
```

---

## GET /v2/task/{task_id}/time_in_status — Task Time in Status

Returns time the task has spent in each status.

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/time_in_status`, {
  headers: { Authorization: token }
});
// Response: { current_status: { status, color, total_time: { by_minute, since } }, status_history: [...] }
```

---

## GET /v2/task/bulk_time_in_status/task_ids — Bulk Time in Status

```typescript
const params = new URLSearchParams();
taskIds.forEach(id => params.append('task_ids', id));
const res = await fetch(`https://api.clickup.com/api/v2/task/bulk_time_in_status/task_ids?${params}`, {
  headers: { Authorization: token }
});
```

---

## POST /v2/list/{list_id}/taskTemplate/{template_id} — Create Task From Template

```typescript
async function createFromTemplate(listId: string, templateId: string, token: string, name: string): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/taskTemplate/${templateId}`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}
```

---

## Task Relationships (Dependencies & Links)

### POST /v2/task/{task_id}/dependency — Add Dependency

```typescript
// Task A depends on Task B (A is blocked by B):
await fetch(`https://api.clickup.com/api/v2/task/${taskAId}/dependency`, {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    depends_on: taskBId,         // B must complete before A
    // OR:
    // dependency_of: taskCId,  // A must complete before C
  }),
});
```

### DELETE /v2/task/{task_id}/dependency — Delete Dependency

```typescript
const params = new URLSearchParams({ depends_on: taskBId });
await fetch(`https://api.clickup.com/api/v2/task/${taskAId}/dependency?${params}`, {
  method: 'DELETE',
  headers: { Authorization: token },
});
```

### POST /v2/task/{task_id}/link/{links_to} — Add Task Link

```typescript
await fetch(`https://api.clickup.com/api/v2/task/${taskId}/link/${linkedTaskId}`, {
  method: 'POST',
  headers: { Authorization: token },
});
```

### DELETE /v2/task/{task_id}/link/{links_to} — Delete Task Link

```typescript
await fetch(`https://api.clickup.com/api/v2/task/${taskId}/link/${linkedTaskId}`, {
  method: 'DELETE',
  headers: { Authorization: token },
});
```
