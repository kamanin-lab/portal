# ClickUp API v2 — Custom Fields, Tags & Checklists

Source: clickup-api-v2-reference.json (Custom Fields 6, Tags 6, Task Checklists 6 = 18 endpoints verified)

Base URL: `https://api.clickup.com/api/v2`
Auth: `Authorization: pk_xxxxx`

---

## CUSTOM FIELDS (6 endpoints)

### GET /v2/list/{list_id}/field — Get List Custom Fields

```typescript
async function getListCustomFields(listId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}/field`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.fields ?? [];
}
// Response: { fields: [{ id, name, type, type_config, date_created, hide_from_guests, value, required }] }
```

---

### GET /v2/folder/{folder_id}/field — Get Folder Custom Fields

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/folder/${folderId}/field`, {
  headers: { Authorization: token },
});
```

---

### GET /v2/space/{space_id}/field — Get Space Custom Fields

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/field`, {
  headers: { Authorization: token },
});
```

---

### GET /v2/team/{team_id}/field — Get Workspace Custom Fields

```typescript
const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/field`, {
  headers: { Authorization: token },
});
```

---

### POST /v2/task/{task_id}/field/{field_id} — Set Custom Field Value

**Query Parameters:**

| name | type | required | description |
|------|------|----------|-------------|
| custom_task_ids | boolean | no | Use custom task ID |
| team_id | number | no | Required when `custom_task_ids=true` |

**Request Body:**

```typescript
// Body is { value: <format depends on field type — see table below> }
body: JSON.stringify({ value: fieldValue })
```

```typescript
async function setCustomFieldValue(
  taskId: string,
  fieldId: string,
  token: string,
  value: unknown
): Promise<void> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/field/${fieldId}`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Set field failed: ${err.err} (${err.ECODE})`);
  }
}

// Examples:
await setCustomFieldValue(taskId, fieldId, token, 'https://example.com');   // url type
await setCustomFieldValue(taskId, fieldId, token, 'uuid-of-option');         // drop_down
await setCustomFieldValue(taskId, fieldId, token, true);                      // checkbox
await setCustomFieldValue(taskId, fieldId, token, 42);                        // number/currency
await setCustomFieldValue(taskId, fieldId, token, { add: [1234], rem: [] }); // people
```

---

### DELETE /v2/task/{task_id}/field/{field_id} — Remove Custom Field Value

Clears the field value (resets to empty/unset).

```typescript
async function clearCustomFieldValue(taskId: string, fieldId: string, token: string): Promise<void> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/field/${fieldId}`, {
    method: 'DELETE',
    headers: { Authorization: token },
  });
  if (!res.ok) throw new Error(`Clear field failed: ${res.status}`);
}
```

---

## Custom Field Value Formats

The `value` in POST /v2/task/{task_id}/field/{field_id} depends on the field `type`:

| type | value format | example |
|------|-------------|---------|
| `url` | string (valid URL) | `"https://clickup.com"` |
| `email` | string (valid email) | `"user@company.com"` |
| `phone` | string | `"+1 123 456 7890"` |
| `text` / `textarea` | string | `"any text"` |
| `number` | number | `-28` |
| `currency` | number (amount only; currency set in UI) | `8000` |
| `date` | integer (Unix ms) | `1711843200000` |
| `checkbox` / `button` | boolean | `true` |
| `drop_down` | string — **UUID of the option** (not label!) | `"uuid1234-abcd-..."` |
| `labels` | array of option UUIDs | `["uuid1234", "uuid9876"]` |
| `emoji` (rating) | integer ≥ 0 and ≤ field's `count` | `4` |
| `progress_manual` | `{ current: number }` | `{ current: 50 }` |
| `people` | `{ add: number[], rem: number[] }` | `{ add: [1234], rem: [] }` |
| `task` | `{ add: string[], rem: string[] }` | `{ add: ["taskId"], rem: [] }` |
| `location` | `{ location: { lat, lng }, formatted_address: string }` | `{ location: { lat: 48.2, lng: 16.4 }, formatted_address: "Vienna" }` |

**Key gotcha for `drop_down`:** Send the option's `id` (UUID), NOT the option's `name`. Get option IDs from the field's `type_config.options` array.

```typescript
// Get dropdown option ID by name:
const field = fields.find(f => f.name === 'Status Override');
const option = field.type_config.options.find((o: any) => o.name === 'In Review');
await setCustomFieldValue(taskId, field.id, token, option.id);  // send UUID, not name
```

---

## TAGS (6 endpoints)

### GET /v2/space/{space_id}/tag — Get Space Tags

```typescript
async function getSpaceTags(spaceId: string, token: string): Promise<any[]> {
  const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/tag`, {
    headers: { Authorization: token },
  });
  const data = await res.json();
  return data.tags ?? [];
}
// Response: { tags: [{ name, tag_fg, tag_bg }] }
```

---

### POST /v2/space/{space_id}/tag — Create Space Tag

**Request Body:** `{ tag: { name: string, tag_fg: string, tag_bg: string } }`

```typescript
async function createSpaceTag(spaceId: string, token: string, name: string): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/tag`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag: { name, tag_fg: '#ffffff', tag_bg: '#2563EB' },
    }),
  });
  return res.json();
}
```

---

### PUT /v2/space/{space_id}/tag/{tag_name} — Edit Space Tag

**Request Body:** `{ tag: { name?: string, tag_fg?: string, tag_bg?: string } }`

```typescript
await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/tag/${encodeURIComponent(tagName)}`, {
  method: 'PUT',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag: { tag_bg: '#16A34A' } }),
});
```

---

### DELETE /v2/space/{space_id}/tag/{tag_name} — Delete Space Tag

**Request Body:** `{ tag: { name: string } }` (required even for DELETE)

```typescript
await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/tag/${encodeURIComponent(tagName)}`, {
  method: 'DELETE',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ tag: { name: tagName } }),
});
```

---

### POST /v2/task/{task_id}/tag/{tag_name} — Add Tag To Task

```typescript
async function addTagToTask(taskId: string, tagName: string, token: string): Promise<void> {
  const res = await fetch(
    `https://api.clickup.com/api/v2/task/${taskId}/tag/${encodeURIComponent(tagName)}`,
    { method: 'POST', headers: { Authorization: token } }
  );
  if (!res.ok) throw new Error(`Add tag failed: ${res.status}`);
}
```

---

### DELETE /v2/task/{task_id}/tag/{tag_name} — Remove Tag From Task

```typescript
async function removeTagFromTask(taskId: string, tagName: string, token: string): Promise<void> {
  const res = await fetch(
    `https://api.clickup.com/api/v2/task/${taskId}/tag/${encodeURIComponent(tagName)}`,
    { method: 'DELETE', headers: { Authorization: token } }
  );
  if (!res.ok) throw new Error(`Remove tag failed: ${res.status}`);
}
```

---

## TASK CHECKLISTS (6 endpoints)

### POST /v2/task/{task_id}/checklist — Create Checklist

**Request Body:** `{ name: string }`

**Query Parameters:** `custom_task_ids` (boolean), `team_id` (number)

```typescript
async function createChecklist(taskId: string, token: string, name: string): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/checklist`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}
// Response: { checklist: { id, task_id, name, orderindex, resolved, unresolved, items: [] } }
```

---

### PUT /v2/checklist/{checklist_id} — Edit Checklist

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | no | New checklist name |
| position | integer | no | Order of appearance (0-indexed). `0` = first position |

```typescript
async function editChecklist(checklistId: string, token: string, updates: {
  name?: string;
  position?: number;
}): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/checklist/${checklistId}`, {
    method: 'PUT',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return res.json();
}
```

---

### DELETE /v2/checklist/{checklist_id} — Delete Checklist

```typescript
await fetch(`https://api.clickup.com/api/v2/checklist/${checklistId}`, {
  method: 'DELETE',
  headers: { Authorization: token },
});
```

---

### POST /v2/checklist/{checklist_id}/checklist_item — Create Checklist Item

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | no | Item text |
| assignee | integer | no | User ID to assign the item |

```typescript
async function createChecklistItem(
  checklistId: string,
  token: string,
  name: string,
  assignee?: number
): Promise<any> {
  const res = await fetch(`https://api.clickup.com/api/v2/checklist/${checklistId}/checklist_item`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...(assignee ? { assignee } : {}) }),
  });
  return res.json();
}
```

---

### PUT /v2/checklist/{checklist_id}/checklist_item/{checklist_item_id} — Edit Checklist Item

| field | type | required | description |
|-------|------|----------|-------------|
| name | string | no | Updated item text |
| assignee | string\|null | no | User ID or null to unassign |
| resolved | boolean | no | Mark item as done/undone |
| parent | string\|null | no | Parent item ID — nests this item under another item |

```typescript
// Check off an item:
await fetch(`https://api.clickup.com/api/v2/checklist/${checklistId}/checklist_item/${itemId}`, {
  method: 'PUT',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ resolved: true }),
});

// Nest item B under item A:
await fetch(`https://api.clickup.com/api/v2/checklist/${checklistId}/checklist_item/${itemBId}`, {
  method: 'PUT',
  headers: { Authorization: token, 'Content-Type': 'application/json' },
  body: JSON.stringify({ parent: itemAId }),
});
```

---

### DELETE /v2/checklist/{checklist_id}/checklist_item/{checklist_item_id} — Delete Checklist Item

```typescript
await fetch(
  `https://api.clickup.com/api/v2/checklist/${checklistId}/checklist_item/${itemId}`,
  { method: 'DELETE', headers: { Authorization: token } }
);
```
