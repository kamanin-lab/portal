# ClickUp API v2 — Comment Endpoints

Source: clickup-api-v2-reference.json (10 endpoints verified)

Base URL: `https://api.clickup.com/api/v2`
Auth: `Authorization: pk_xxxxx`

---

## GET /v2/task/{task_id}/comment — Get Task Comments

**Query Parameters:**

| name | type | required | description |
|------|------|----------|-------------|
| custom_task_ids | boolean | no | Use custom task ID instead of default task ID |
| team_id | number | no | Required when `custom_task_ids=true` |
| start | integer | no | Unix ms of reference comment — required for pagination |
| start_id | string | no | Comment ID of reference comment — required for pagination |

```typescript
async function getTaskComments(taskId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/comment`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.comments ?? [];
}
// Response: { comments: [{ id, comment, comment_text, user, resolved, date }] }
```

**Pagination:** Comments are returned newest-first (default 25). Use `start` + `start_id` from the last returned comment to fetch the next page.

```typescript
// Fetch all comments (paginated):
async function getAllTaskComments(taskId: string, token: string): Promise<any[]> {
  const all: any[] = [];
  let start: number | undefined;
  let start_id: string | undefined;

  while (true) {
    const params = new URLSearchParams();
    if (start) params.set('start', start.toString());
    if (start_id) params.set('start_id', start_id);
    const url = `https://api.clickup.com/api/v2/task/${taskId}/comment${params.size ? '?' + params : ''}`;
    const res = await fetch(url, { headers: { Authorization: token } });
    const data = await res.json();
    const comments: any[] = data.comments ?? [];
    all.push(...comments);
    if (comments.length < 25) break;
    const last = comments[comments.length - 1];
    start = parseInt(last.date);
    start_id = last.id;
  }
  return all;
}
```

---

## POST /v2/task/{task_id}/comment — Create Task Comment

**Request Body:**

| field | type | required | description |
|-------|------|----------|-------------|
| comment_text | string | **yes** | Comment content (plain text) |
| assignee | integer | no | User ID to assign the comment to |
| group_assignee | string | no | Group ID to assign the comment to |
| notify_all | boolean | **yes** | If true, notify all task members |

```typescript
async function createTaskComment(
  taskId: string,
  token: string,
  text: string,
  notifyAll = false
): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/comment`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment_text: text, notify_all: notifyAll }),
  });
  return res.json();
}
// Response: { id, hist_id, date }
```

**Portal pattern:** Prefix portal-originated comments with `[Portal]` to prevent webhook echo loops. See `portal-patterns.md`.

---

## GET /v2/view/{view_id}/comment — Get Chat View Comments

Returns comments from a Chat-type View.

**Query Parameters:**

| name | type | required | description |
|------|------|----------|-------------|
| start | integer | no | Unix ms of reference comment |
| start_id | string | no | Comment ID of reference comment |

```typescript
async function getChatViewComments(viewId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/view/${viewId}/comment`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.comments ?? [];
}
```

---

## POST /v2/view/{view_id}/comment — Create Chat View Comment

**Request Body:**

| field | type | required | description |
|-------|------|----------|-------------|
| comment_text | string | **yes** | Comment content |
| notify_all | boolean | **yes** | Notify all members of the view |

```typescript
async function createChatViewComment(viewId: string, token: string, text: string): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/view/${viewId}/comment`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment_text: text, notify_all: false }),
  });
  return res.json();
}
```

---

## GET /v2/list/{list_id}/comment — Get List Comments

Returns comments added to the List info panel.

**Query Parameters:**

| name | type | required | description |
|------|------|----------|-------------|
| start | integer | no | Unix ms of reference comment |
| start_id | string | no | Comment ID of reference comment |

```typescript
async function getListComments(listId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/comment`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.comments ?? [];
}
```

---

## POST /v2/list/{list_id}/comment — Create List Comment

**Request Body:**

| field | type | required | description |
|-------|------|----------|-------------|
| comment_text | string | **yes** | Comment content |
| assignee | integer | **yes** | User ID to assign the comment to |
| notify_all | boolean | **yes** | Notify all list members |

```typescript
async function createListComment(
  listId: string,
  token: string,
  text: string,
  assigneeId: number
): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/comment`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment_text: text, assignee: assigneeId, notify_all: false }),
  });
  return res.json();
}
```

---

## PUT /v2/comment/{comment_id} — Update Comment

**Request Body:**

| field | type | required | description |
|-------|------|----------|-------------|
| comment_text | string | **yes** | Updated comment text |
| assignee | integer | **yes** | User ID assigned to the comment |
| group_assignee | integer | no | Group ID |
| resolved | boolean | **yes** | Mark comment as resolved/unresolved |

```typescript
async function updateComment(
  commentId: string,
  token: string,
  updates: { comment_text?: string; resolved?: boolean; assignee?: number }
): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/comment/${commentId}`, {
    method: 'PUT',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}

// Resolve a comment:
await updateComment(commentId, token, { resolved: true, comment_text: existingText, assignee: 0 });
```

---

## DELETE /v2/comment/{comment_id} — Delete Comment

```typescript
async function deleteComment(commentId: string, token: string): Promise<void> {
  const res = await fetch(`https://api.clickup.com/api/v2/comment/${commentId}`, {
    method: 'DELETE',
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
```

---

## GET /v2/comment/{comment_id}/reply — Get Threaded Comments

Returns replies to a parent comment (threaded comments).

```typescript
async function getThreadedComments(commentId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/comment/${commentId}/reply`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.comments ?? [];
}
```

---

## POST /v2/comment/{comment_id}/reply — Create Threaded Comment

Creates a reply to an existing comment.

```typescript
async function replyToComment(commentId: string, token: string, text: string): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/comment/${commentId}/reply`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment_text: text, notify_all: false }),
  });
  return res.json();
}
```

---

## Comment Response Shape

```typescript
interface ClickUpComment {
  id: string;
  comment: Array<{ text: string }>;  // rich content blocks
  comment_text: string;               // plain text version (use this)
  user: {
    id: number;
    username: string;
    color: string;
    email: string;
    profilePicture: string | null;
    initials: string;
  };
  resolved: boolean;
  assignee: { id: number; username: string } | null;
  assigned_by: { id: number; username: string } | null;
  reactions: any[];
  date: string;  // Unix ms as string
  parent?: string;  // parent comment ID if threaded
}
```
