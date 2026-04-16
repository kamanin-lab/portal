# ClickUp API v2 — Authentication, Rate Limits, Pagination & Gotchas

Source: clickup-api-v2-reference.json security schemes + official developer docs

---

## Authentication

### Personal API Token (most common)

```typescript
// Header format: NO "Bearer" prefix — just the token
const token = 'pk_12345678_ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const res = await fetch('https://api.clickup.com/api/v2/team', {
  headers: {
    Authorization: token,    // ← pk_xxx directly, no "Bearer"!
    'Content-Type': 'application/json',
  }
});
```

**Where to get:** ClickUp Settings → Apps → API Token

### OAuth2 Access Token

```typescript
// OAuth tokens DO use "Bearer" prefix
const accessToken = 'your_oauth_access_token';

const res = await fetch('https://api.clickup.com/api/v2/team', {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
});
```

### OAuth2 Flow

**Step 1 — Get Authorization URL:**
```
https://app.clickup.com/api?client_id={client_id}&redirect_uri={redirect_uri}
```

**Step 2 — Exchange code for token:**

```typescript
// POST /v2/oauth/token
const res = await fetch('https://api.clickup.com/api/v2/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    client_id: 'YOUR_CLIENT_ID',
    client_secret: 'YOUR_CLIENT_SECRET',
    code: 'AUTHORIZATION_CODE',  // from redirect ?code= param
  }),
});
const { access_token } = await res.json();
```

**Step 3 — Get authorized user:**

```typescript
// GET /v2/user
const res = await fetch('https://api.clickup.com/api/v2/user', {
  headers: { Authorization: `Bearer ${access_token}` }
});
const { user } = await res.json();
// user: { id, username, email, color, profilePicture, initials, week_start_day, ... }
```

---

## Rate Limits

ClickUp rate limits are per-token. The spec does not document specific values, but known limits from developer experience:

| Scope | Limit |
|-------|-------|
| API requests | ~100 per minute per token |
| Webhook deliveries | Configurable per plan |

**Response Headers on 429:**

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Max requests allowed in window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp when limit resets |
| `Retry-After` | Seconds to wait |

**Retry pattern:**

```typescript
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60');
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
    }

    // ClickUp sometimes returns 202XX relay errors (e.g. 20200)
    // These are transient routing issues — retry once automatically
    if (res.status >= 20200 && res.status <= 20299 && attempt < 1) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }

    return res;
  }
  throw new Error('Max retries exceeded');
}
```

---

## Pagination

Get Tasks returns max 100 tasks per page. Use `page` query param (zero-indexed).

```typescript
// Pattern: fetch until empty page
async function fetchAllPages<T>(
  buildUrl: (page: number) => string,
  token: string,
  responseKey: string
): Promise<T[]> {
  const all: T[] = [];
  let page = 0;

  while (true) {
    const res = await fetch(buildUrl(page), { headers: { Authorization: token } });
    const data = await res.json();
    const items: T[] = data[responseKey] ?? [];
    all.push(...items);

    if (items.length < 100) break; // last page has < 100 items
    page++;
  }
  return all;
}

// Usage:
const tasks = await fetchAllPages(
  (page) => `https://api.clickup.com/api/v2/list/${listId}/task?page=${page}&include_closed=true`,
  token,
  'tasks'
);
```

---

## Date & Time Format

**All dates are Unix milliseconds (int64) — NOT seconds.**

```typescript
// Current time as ClickUp date:
const now = Date.now();              // already in ms

// Convert to ClickUp date:
const dueDateMs = new Date('2026-03-31').getTime();  // ms

// Convert from ClickUp date:
const date = new Date(parseInt(task.due_date));      // due_date is a string in responses!

// Date fields in API responses are strings, not numbers:
// { due_date: "1711843200000", date_created: "1698765432000" }
const dueDateStr: string = task.due_date;       // "1711843200000"
const dueDate: Date = new Date(parseInt(dueDateStr));
```

---

## Key Gotchas

### Task ID Format

```typescript
// API returns: "9hz"
// UI shows: "#9hz" (with hash prefix)
// NEVER send the # to the API

const taskId = task.id;   // "9hz" ✓
// NOT: task.url.split('#')[1]  — don't parse from URL
```

### "team" = Workspace

Every endpoint using `team_id` refers to a Workspace, not a Team subgroup. This is v1 legacy naming that persists in v2.

```typescript
// GET your workspaces:
const res = await fetch('https://api.clickup.com/api/v2/team', {
  headers: { Authorization: token }
});
const { teams } = await res.json();
const workspaceId = teams[0].id;  // this is your team_id for all other endpoints
```

### "project" = Folder

In v1, Folders were called Projects. The v2 API uses "folder" consistently.
The UI occasionally still shows "project" in some contexts.

### Subtasks

Subtasks are standard tasks with a `parent` field set to the parent task ID.

```typescript
// Create subtask:
await createTask(listId, token, {
  name: 'Subtask title',
  parent: 'abc123',   // parent task_id — MUST be in the same List!
});

// Get subtasks:
// Option 1: include with parent task
await fetch(`/v2/task/${parentId}?include_subtasks=true`);
// Option 2: include in list query
await fetch(`/v2/list/${listId}/task?subtasks=true`);
```

### Assignees Are Not Replace Operations

```typescript
// WRONG — this replaces assignees in some APIs, but NOT in ClickUp:
// body: { assignees: [1234, 5678] }   ← this is for CREATE only

// CORRECT for UPDATE:
body: JSON.stringify({
  assignees: { add: [1234], rem: [5678] }   // explicitly add/remove
})
```

### include_closed for Full Task Lists

```typescript
// Without this flag, COMPLETE and CANCELED tasks are excluded:
const params = new URLSearchParams({
  include_closed: 'true',  // required to see done/cancelled tasks
});
```

### custom_task_ids Requires team_id

```typescript
// If using custom task IDs (not default ClickUp IDs):
const params = new URLSearchParams({
  custom_task_ids: 'true',
  team_id: workspaceId.toString(),  // REQUIRED when custom_task_ids=true
});
```

### Content-Type Required for POST/PUT

```typescript
headers: {
  Authorization: token,
  'Content-Type': 'application/json',  // REQUIRED for POST/PUT requests
}
```

### Priority Values

```typescript
// Priority is an integer, not a string:
// 1 = Urgent
// 2 = High
// 3 = Normal
// 4 = Low
// null = No priority

body: JSON.stringify({ priority: 1 })   // urgent
body: JSON.stringify({ priority: null }) // remove priority
```

### Clearing Description

```typescript
// To clear a task's description, send a space string — NOT empty string:
body: JSON.stringify({ description: ' ' })  // clears description
// NOT: { description: '' }  ← may not work
```

---

## Error Response Format

```typescript
interface ClickUpError {
  err: string;          // error message
  ECODE: string;        // error code e.g. "OAUTH_027"
}

// Common status codes:
// 400 — Bad request (check request body)
// 401 — Unauthorized (invalid or expired token)
// 403 — Forbidden (no access to this resource)
// 404 — Not found
// 429 — Rate limited
// 500 — ClickUp server error (retry)
// 202XX — Relay/routing error (transient, retry once)
```
