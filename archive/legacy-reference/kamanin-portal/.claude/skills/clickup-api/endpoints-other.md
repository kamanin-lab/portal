# ClickUp API v2 — Goals, Views, Time Tracking, Members, Attachments, Guests, Users

Source: clickup-api-v2-reference.json (Goals 8, Views 12, Time Tracking 13+4, Members 2, Attachments 1, Guests 10, Users 4, User Groups 4, Roles 1 = 59 endpoints verified)

Base URL: `https://api.clickup.com/api/v2`
Auth: `Authorization: pk_xxxxx`

---

## GOALS (8 endpoints)

### GET /v2/team/{team_id}/goal — Get Goals

**Query Parameters:** `include_completed` (boolean)

```typescript
async function getGoals(teamId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/goal`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.goals ?? [];
}
// Response: { goals: [{ id, name, team_id, date_created, start_date, due_date, description, multiple_owners, owners, color, deleted, pretty_id, percent_completed, members, key_results, editors }] }
```

---

### POST /v2/team/{team_id}/goal — Create Goal

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | **yes** | Goal name |
| due_date | integer | **yes** | Unix ms |
| description | string | **yes** | Goal description |
| multiple_owners | boolean | **yes** | Allow multiple owners |
| owners | number[] | **yes** | Array of user IDs |
| color | string | **yes** | Hex color (e.g. `"#32a852"`) |

```typescript
async function createGoal(teamId: string, token: string, data: {
  name: string;
  due_date: number;
  description: string;
  owners: number[];
  color?: string;
}): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/goal`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ multiple_owners: data.owners.length > 1, color: '#32a852', ...data }),
  });
  return res.json();
}
```

---

### GET /v2/goal/{goal_id} — Get Goal

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/goal/${goalId}`, {
  headers: { Authorization: token },
});
// Returns full goal object with key_results
```

---

### PUT /v2/goal/{goal_id} — Update Goal

Same fields as Create Goal (all optional for update).

---

### DELETE /v2/goal/{goal_id} — Delete Goal

```typescript
await fetch(`https://api.clickup.com/api/v2/goal/${goalId}`, {
  method: 'DELETE',
  headers: { Authorization: token },
});
```

---

### POST /v2/goal/{goal_id}/key_result — Create Key Result

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | **yes** | Key result name |
| owners | number[] | **yes** | Array of user IDs |
| type | string | **yes** | `"number"`, `"boolean"`, `"currency"`, `"percentage"`, `"automatic"` |
| steps_start | number | **yes** | Starting value |
| steps_end | number | **yes** | Target value |
| unit | string | **yes** | Unit label (e.g. `"km"`, `"%"`, `"$"`) |
| task_ids | string[] | no | Link task IDs (for `"automatic"` type) |
| list_ids | string[] | no | Link list IDs (for `"automatic"` type) |

```typescript
await fetch(`https://api.clickup.com/api/v2/goal/${goalId}/key_result`, {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'Complete 10 features',
    owners: [userId],
    type: 'number',
    steps_start: 0,
    steps_end: 10,
    unit: 'features',
  }),
});
```

---

### PUT /v2/key_result/{key_result_id} — Update Key Result

| field | type | description |
|-------|------|-------------|
| steps_current | number | Update current progress value |
| note | string | Progress note |

```typescript
await fetch(`https://api.clickup.com/api/v2/key_result/${keyResultId}`, {
  method: 'PUT',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ steps_current: 5, note: 'Halfway done' }),
});
```

---

### DELETE /v2/key_result/{key_result_id} — Delete Key Result

```typescript
await fetch(`https://api.clickup.com/api/v2/key_result/${keyResultId}`, {
  method: 'DELETE',
  headers: { Authorization: token },
});
```

---

## VIEWS (12 endpoints)

Views can be created at Workspace, Space, Folder, or List level.

### GET Views

```typescript
// GET /v2/team/{team_id}/view   — Workspace views
// GET /v2/space/{space_id}/view — Space views
// GET /v2/folder/{folder_id}/view — Folder views
// GET /v2/list/{list_id}/view   — List views

async function getViews(level: 'team'|'space'|'folder'|'list', id: string, token: string): Promise<any[]> {
  const levelMap = { team: 'team', space: 'space', folder: 'folder', list: 'list' };
  const res = await fetch(`https://api.clickup.com/api/v2/${levelMap[level]}/${id}/view`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.views ?? [];
}
// Response: { views: [{ id, name, type, parent, creator, grouping, filters, columns, settings, date_created, creator }] }
```

---

### POST Views — Create View

**Required fields:** `name` (string), `type` (string)

View types: `list`, `board`, `calendar`, `table`, `timeline`, `workload`, `activity`, `map`, `chat`, `gantt`

```typescript
async function createView(level: 'team'|'space'|'folder'|'list', id: string, token: string, name: string, type = 'list'): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/${level}/${id}/view`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, type }),
  });
  return res.json();
}
```

---

### GET /v2/view/{view_id} — Get View

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/view/${viewId}`, {
  headers: { Authorization: token },
});
```

---

### PUT /v2/view/{view_id} — Update View

---

### DELETE /v2/view/{view_id} — Delete View

---

### GET /v2/view/{view_id}/task — Get View Tasks

Returns tasks visible in a View (respects the view's filters and grouping).

```typescript
async function getViewTasks(viewId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/view/${viewId}/task`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.tasks ?? [];
}
```

---

## TIME TRACKING (13 endpoints)

### GET /v2/team/{team_Id}/time_entries — Get Time Entries

**Query Parameters:** `start_date` (integer, Unix ms), `end_date` (integer, Unix ms), `assignee` (integer), `include_task_tags` (boolean), `include_location_names` (boolean), `space_id` (integer), `folder_id` (integer), `list_id` (integer), `task_id` (string), `custom_task_ids` (boolean), `team_id` (integer)

```typescript
async function getTimeEntries(teamId: string, token: string, filters?: {
  start_date?: number;
  end_date?: number;
  assignee?: number;
}): Promise<any[]> {
  const params = new URLSearchParams();
  if (filters?.start_date) params.set('start_date', filters.start_date.toString());
  if (filters?.end_date) params.set('end_date', filters.end_date.toString());
  if (filters?.assignee) params.set('assignee', filters.assignee.toString());
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/time_entries?${params}`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.data ?? [];
}
// Response: { data: [{ id, task, wid, user, billable, start, end, duration, description, tags, source }] }
```

---

### POST /v2/team/{team_Id}/time_entries — Create Time Entry

| field | type | required | description |
|-------|------|----------|-------------|
| start | integer | **yes** | Unix ms start time |
| duration | integer | **yes** | Duration in milliseconds |
| description | string | no | Time entry note |
| tid | string | no | Task ID to associate |
| billable | boolean | no | Mark as billable |
| tags | string[] | no | Tag names |

```typescript
async function createTimeEntry(teamId: string, token: string, data: {
  start: number;
  duration: number;
  tid?: string;
  description?: string;
  billable?: boolean;
}): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/time_entries`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}
```

---

### GET /v2/team/{team_id}/time_entries/{timer_id} — Get Single Time Entry

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/time_entries/${timerId}`, {
  headers: { Authorization: token },
});
```

---

### PUT /v2/team/{team_id}/time_entries/{timer_id} — Update Time Entry

---

### DELETE /v2/team/{team_id}/time_entries/{timer_id} — Delete Time Entry

---

### GET /v2/team/{team_id}/time_entries/current — Get Running Timer

Returns the currently running timer for the authenticated user.

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/time_entries/current`, {
  headers: { Authorization: token },
});
const data = await res.json();
// data.data = null if no timer running, otherwise timer object with start, duration (negative = running)
```

---

### POST /v2/team/{team_Id}/time_entries/start — Start Timer

```typescript
await fetch(`https://api.clickup.com/api/v2/team/${teamId}/time_entries/start`, {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tid: taskId, description: 'Working on task' }),
});
```

---

### POST /v2/team/{team_id}/time_entries/stop — Stop Timer

```typescript
await fetch(`https://api.clickup.com/api/v2/team/${teamId}/time_entries/stop`, {
  method: 'POST',
  headers: { Authorization: token },
});
```

---

### Time Entry Tags (4 endpoints)

```typescript
// GET /v2/team/{team_id}/time_entries/tags    — Get time entry tags
// POST /v2/team/{team_id}/time_entries/tags   — Add tags to time entries
// PUT /v2/team/{team_id}/time_entries/tags    — Edit time entry tag
// DELETE /v2/team/{team_id}/time_entries/tags — Remove tags from time entries
```

---

## TIME TRACKING LEGACY (4 endpoints)

Older per-task time tracking endpoints (still functional).

```typescript
// GET /v2/task/{task_id}/time          — Get tracked time for task
// POST /v2/task/{task_id}/time         — Track time on task
// PUT /v2/task/{task_id}/time/{interval_id}  — Update interval
// DELETE /v2/task/{task_id}/time/{interval_id} — Delete interval

async function getTaskTime(taskId: string, token: string): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/time`, {
    headers: { Authorization: token },
  });
  return res.json();
}
```

---

## MEMBERS (2 endpoints)

### GET /v2/task/{task_id}/member — Get Task Members

```typescript
async function getTaskMembers(taskId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/member`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.members ?? [];
}
```

---

### GET /v2/list/{list_id}/member — Get List Members

```typescript
async function getListMembers(listId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/member`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.members ?? [];
}
// Response: { members: [{ id, username, email, color, profilePicture, initials, role, custom_role, last_active, date_joined, date_invited }] }
```

---

## ATTACHMENTS (1 endpoint)

### POST /v2/task/{task_id}/attachment — Create Task Attachment

**Content-Type:** `multipart/form-data` (NOT application/json)

```typescript
async function uploadAttachment(taskId: string, token: string, file: File): Promise<any> {
  const formData = new FormData();
  formData.append('attachment', file);

  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/attachment`, {
    method: 'POST',
    headers: { Authorization: token },  // DO NOT set Content-Type — browser sets multipart boundary automatically
    body: formData,
  });
  return res.json();
}
// Response: { id, version, date, title, extension, thumbnail_small, thumbnail_large, url }
```

**Note:** Do NOT set `Content-Type` header manually — the browser must set it to include the multipart boundary.

---

## GUESTS (10 endpoints)

Guests are external users with limited access.

```typescript
// Workspace-level guest management:
// POST   /v2/team/{team_id}/guest                         — Invite Guest To Workspace
// GET    /v2/team/{team_id}/guest/{guest_id}              — Get Guest
// PUT    /v2/team/{team_id}/guest/{guest_id}              — Edit Guest
// DELETE /v2/team/{team_id}/guest/{guest_id}              — Remove Guest From Workspace

// Resource-level access:
// POST   /v2/task/{task_id}/guest/{guest_id}              — Add Guest To Task
// DELETE /v2/task/{task_id}/guest/{guest_id}              — Remove Guest From Task
// POST   /v2/list/{list_id}/guest/{guest_id}              — Add Guest To List
// DELETE /v2/list/{list_id}/guest/{guest_id}              — Remove Guest From List
// POST   /v2/folder/{folder_id}/guest/{guest_id}          — Add Guest To Folder
// DELETE /v2/folder/{folder_id}/guest/{guest_id}          — Remove Guest From Folder
```

```typescript
async function inviteGuestToWorkspace(teamId: string, token: string, email: string, canEditTags = false): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/guest`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, can_edit_tags: canEditTags }),
  });
  return res.json();
}

async function addGuestToTask(taskId: string, guestId: number, token: string, permissionLevel: 'read'|'comment'|'edit'|'create' = 'read'): Promise<void> {
  await fetch(`https://api.clickup.com/api/v2/task/${taskId}/guest/${guestId}`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ permission_level: permissionLevel }),
  });
}
```

---

## USERS (4 endpoints)

Manage Workspace members (full users, not guests).

```typescript
// POST   /v2/team/{team_id}/user                    — Invite User To Workspace
// GET    /v2/team/{team_id}/user/{user_id}           — Get User
// PUT    /v2/team/{team_id}/user/{user_id}           — Update User
// DELETE /v2/team/{team_id}/user/{user_id}           — Remove User From Workspace
```

```typescript
async function inviteUser(teamId: string, token: string, email: string, admin = false): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/user`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, admin }),
  });
  return res.json();
}
```

---

## USER GROUPS (4 endpoints)

Manage Teams (Groups) within a Workspace.

```typescript
// POST   /v2/team/{team_id}/group     — Create User Group
// GET    /v2/group                    — Get User Groups (workspace-wide)
// PUT    /v2/group/{group_id}         — Update User Group
// DELETE /v2/group/{group_id}         — Delete User Group
```

```typescript
async function getUserGroups(token: string): Promise<any[]> {
  const res = await fetch('https://api.clickup.com/api/v2/group', {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.groups ?? [];
}
// Response: { groups: [{ id, team_id, userid, name, handle, date_created, members }] }
```

---

## ROLES (1 endpoint)

### GET /v2/team/{team_id}/customroles — Get Custom Roles

```typescript
async function getCustomRoles(teamId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/customroles`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.roles ?? [];
}
```
