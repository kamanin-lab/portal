# ClickUp API v2 — Workspace Hierarchy Endpoints

Source: clickup-api-v2-reference.json (Workspaces 3, Spaces 5, Folders 6, Lists 11 = 25 endpoints verified)

Base URL: `https://api.clickup.com/api/v2`
Auth: `Authorization: pk_xxxxx`

**Hierarchy:**
```
Workspace (team_id)
  └── Space (space_id)
        └── Folder (folder_id)   ← "project" in v1
              └── List (list_id)
                    └── Task (task_id)
```

**Note:** `team` in all endpoint paths = Workspace (legacy v1 naming).

---

## WORKSPACES (3 endpoints)

### GET /v2/team — Get Authorized Workspaces

Returns all Workspaces the authenticated user has access to.

```typescript
async function getWorkspaces(token: string): Promise<any[]> {
  const res = await fetch('https://api.clickup.com/api/v2/team', {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.teams ?? [];
  // teams[0].id = your team_id (workspace ID) for all other endpoints
}
// Response: { teams: [{ id, name, color, avatar, members: [...] }] }
```

---

### GET /v2/team/{team_id}/seats — Get Workspace Seats

Returns seat information (used/available) for the Workspace.

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/seats`, {
  headers: { Authorization: token },
});
// Response: { members: { used, total }, guests: { used, total } }
```

---

### GET /v2/team/{team_id}/plan — Get Workspace Plan

Returns the current plan details for the Workspace.

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/plan`, {
  headers: { Authorization: token },
});
// Response: { plan: { id, name } }
```

---

## SPACES (5 endpoints)

### GET /v2/team/{team_id}/space — Get Spaces

**Query Parameters:**

| name | type | required | description |
|------|------|----------|-------------|
| archived | boolean | no | Include archived spaces (default: false) |

```typescript
async function getSpaces(teamId: string, token: string, archived = false): Promise<any[]> {
  const params = new URLSearchParams({ archived: archived.toString() });
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?${params}`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.spaces ?? [];
}
// Response: { spaces: [{ id, name, private, statuses, multiple_assignees, features, archived }] }
```

---

### POST /v2/team/{team_id}/space — Create Space

**Request Body:**

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | **yes** | Space name |
| multiple_assignees | boolean | **yes** | Allow multiple assignees on tasks |
| features | object | **yes** | Feature toggles (see below) |

```typescript
async function createSpace(teamId: string, token: string, name: string): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      multiple_assignees: true,
      features: {
        due_dates: { enabled: true, start_date: false, remap_due_dates: false, remap_closed_due_date: false },
        time_tracking: { enabled: false },
        tags: { enabled: true },
        time_estimates: { enabled: true },
        checklists: { enabled: true },
        custom_fields: { enabled: true },
        remap_dependencies: { enabled: false },
        dependency_warning: { enabled: false },
        portfolios: { enabled: false },
      },
    }),
  });
  return res.json();
}
```

---

### GET /v2/space/{space_id} — Get Space

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}`, {
  headers: { Authorization: token },
});
// Returns full space object including statuses, features, members
```

---

### PUT /v2/space/{space_id} — Update Space

**Request Body:** Same fields as Create Space (name, color, private, admin_can_manage, multiple_assignees, features).

```typescript
async function updateSpace(spaceId: string, token: string, updates: {
  name?: string;
  color?: string;
  private?: boolean;
  multiple_assignees?: boolean;
}): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}`, {
    method: 'PUT',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}
```

---

### DELETE /v2/space/{space_id} — Delete Space

```typescript
await fetch(`https://api.clickup.com/api/v2/space/${spaceId}`, {
  method: 'DELETE',
  headers: { Authorization: token },
});
```

---

## FOLDERS (6 endpoints)

### GET /v2/space/{space_id}/folder — Get Folders

**Query Parameters:**

| name | type | required | description |
|------|------|----------|-------------|
| archived | boolean | no | Include archived folders (default: false) |

```typescript
async function getFolders(spaceId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.folders ?? [];
}
// Response: { folders: [{ id, name, orderindex, override_statuses, hidden, space, task_count, lists }] }
```

---

### POST /v2/space/{space_id}/folder — Create Folder

**Request Body:**

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | **yes** | Folder name |

```typescript
async function createFolder(spaceId: string, token: string, name: string): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}
```

---

### GET /v2/folder/{folder_id} — Get Folder

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/folder/${folderId}`, {
  headers: { Authorization: token },
});
// Returns full folder object including lists
```

---

### PUT /v2/folder/{folder_id} — Update Folder

```typescript
await fetch(`https://api.clickup.com/api/v2/folder/${folderId}`, {
  method: 'PUT',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'New Folder Name' }),
});
```

---

### DELETE /v2/folder/{folder_id} — Delete Folder

```typescript
await fetch(`https://api.clickup.com/api/v2/folder/${folderId}`, {
  method: 'DELETE',
  headers: { Authorization: token },
});
```

---

### POST /v2/space/{space_id}/folder_template/{template_id} — Create Folder from Template

**Request Body:**

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | **yes** | Name of the new Folder |
| options | object | no | Template options |

```typescript
await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/folder_template/${templateId}`, {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'New Folder from Template' }),
});
```

---

## LISTS (11 endpoints)

### GET /v2/folder/{folder_id}/list — Get Lists

**Query Parameters:** `archived` (boolean, default false)

```typescript
async function getLists(folderId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/folder/${folderId}/list`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.lists ?? [];
}
// Response: { lists: [{ id, name, orderindex, content, status, priority, assignee, task_count, due_date, start_date, folder, space, archived, override_statuses, statuses, permission_level }] }
```

---

### POST /v2/folder/{folder_id}/list — Create List

**Request Body:**

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | **yes** | List name |
| content | string | no | List description (plain text) |
| markdown_content | string | no | List description (Markdown, takes precedence) |
| due_date | integer | no | Unix ms |
| due_date_time | boolean | no | Include time in due date |
| priority | integer | no | 1=urgent, 2=high, 3=normal, 4=low |
| assignee | integer | no | User ID (List owner) |
| status | string | no | List color (not task status) |

```typescript
async function createList(folderId: string, token: string, name: string): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/folder/${folderId}/list`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}
```

---

### GET /v2/space/{space_id}/list — Get Folderless Lists

Lists that live directly in a Space (not inside a Folder).

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/list`, {
  headers: { Authorization: token },
});
const data = await res.json();
return data.lists ?? [];
```

---

### POST /v2/space/{space_id}/list — Create Folderless List

Same body as Create List above.

```typescript
await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/list`, {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'My Folderless List' }),
});
```

---

### GET /v2/list/{list_id} — Get List

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
  headers: { Authorization: token },
});
// Returns full list object including statuses, members, folder, space
```

---

### PUT /v2/list/{list_id} — Update List

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | **yes** | List name |
| content | string | no | Description |
| markdown_content | string | no | Markdown description |
| due_date | integer | no | Unix ms |
| due_date_time | boolean | no | |
| priority | integer | no | 1-4 |
| assignee | string | no | User ID |
| status | string | no | List color string |
| unset_status | boolean | no | Set to `true` to remove List color |

---

### DELETE /v2/list/{list_id} — Delete List

```typescript
await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
  method: 'DELETE',
  headers: { Authorization: token },
});
```

---

### POST /v2/list/{list_id}/task/{task_id} — Add Task To List

Adds a task to an additional List (Tasks in Multiple Lists feature).

```typescript
await fetch(`https://api.clickup.com/api/v2/list/${listId}/task/${taskId}`, {
  method: 'POST',
  headers: { Authorization: token },
});
```

---

### DELETE /v2/list/{list_id}/task/{task_id} — Remove Task From List

Removes a task from an additional List (does NOT delete the task).

```typescript
await fetch(`https://api.clickup.com/api/v2/list/${listId}/task/${taskId}`, {
  method: 'DELETE',
  headers: { Authorization: token },
});
```

---

### POST /v2/folder/{folder_id}/list_template/{template_id} — Create List From Template in Folder

```typescript
await fetch(`https://api.clickup.com/api/v2/folder/${folderId}/list_template/${templateId}`, {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'New List from Template' }),
});
```

---

### POST /v2/space/{space_id}/list_template/{template_id} — Create List From Template in Space

```typescript
await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/list_template/${templateId}`, {
  method: 'POST',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'New List from Template' }),
});
```
