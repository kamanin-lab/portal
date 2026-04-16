# Quick Plan: Nachrichten needs-reply logic
**ID:** 260414-uwc  
**Date:** 2026-04-14

## Objective

Tasks stay visible in "Meine Aufgaben → Nachrichten" tab (and count toward sidebar/header badge) as long as the team has left a comment that the client has not yet replied to — even if the unread bubble was dismissed.

Logic: `needs_reply[task_id] = last_team_comment_at > last_client_reply_at` (computed from `comment_cache`, no DB migration).

---

## Step 1 — Extend `UnreadCounts` type

**File:** `src/modules/tickets/types/tasks.ts`

Add `needsReply` field to the `UnreadCounts` interface (lines 157–161).

```typescript
// BEFORE
export interface UnreadCounts {
  support: number;
  tasks: Record<string, number>;
}

// AFTER
export interface UnreadCounts {
  support: number;
  tasks: Record<string, number>;
  needsReply: Record<string, boolean>;
}
```

---

## Step 2 — Compute `needsReply` in `fetchUnreadCounts`

**File:** `src/modules/tickets/hooks/useUnreadCounts.ts`

### 2a — Extend the comment_cache SELECT to include `is_from_portal`

The current query at line 57 already fetches `task_id, clickup_created_at` with filter `is_from_portal = false` (team comments only). We need ALL comments (both directions) to compare timestamps. Replace the single query with two queries, or broaden the existing fetch.

Replace the existing query block (lines 55–71) and the return statement (line 73):

```typescript
// BEFORE (lines 55–73)
  // 4. Per-task unread counts
  const { data: comments, error: commentsError } = await supabase
    .from('comment_cache')
    .select('task_id, clickup_created_at')
    .eq('profile_id', userId)
    .eq('is_from_portal', false);

  if (commentsError) console.warn('Failed to fetch task comments', { error: commentsError.message });

  const taskCounts: Record<string, number> = {};
  comments?.forEach((c: { task_id: string; clickup_created_at: string }) => {
    if (supportTaskId && c.task_id === supportTaskId) return;
    const lastRead = receiptsMap[`task:${c.task_id}`];
    if (!lastRead || new Date(c.clickup_created_at) > new Date(lastRead)) {
      taskCounts[c.task_id] = (taskCounts[c.task_id] ?? 0) + 1;
    }
  });

  return { support: supportCount, tasks: taskCounts };


// AFTER — fetch all comments (both directions) once, then derive both metrics
  // 4. All comments for this profile (both team and client), excluding support task
  const { data: allComments, error: commentsError } = await supabase
    .from('comment_cache')
    .select('task_id, clickup_created_at, is_from_portal')
    .eq('profile_id', userId);

  if (commentsError) console.warn('Failed to fetch task comments', { error: commentsError.message });

  const taskCounts: Record<string, number> = {};
  // Track latest timestamp per direction per task
  const lastTeamAt: Record<string, string> = {};   // is_from_portal = false
  const lastClientAt: Record<string, string> = {}; // is_from_portal = true

  allComments?.forEach((c: { task_id: string; clickup_created_at: string; is_from_portal: boolean | null }) => {
    if (supportTaskId && c.task_id === supportTaskId) return;

    const isTeam = c.is_from_portal === false;
    const isClient = c.is_from_portal === true;

    // Unread count: team comments only
    if (isTeam) {
      const lastRead = receiptsMap[`task:${c.task_id}`];
      if (!lastRead || new Date(c.clickup_created_at) > new Date(lastRead)) {
        taskCounts[c.task_id] = (taskCounts[c.task_id] ?? 0) + 1;
      }
    }

    // Track latest per direction for needs_reply
    if (isTeam) {
      if (!lastTeamAt[c.task_id] || c.clickup_created_at > lastTeamAt[c.task_id]) {
        lastTeamAt[c.task_id] = c.clickup_created_at;
      }
    }
    if (isClient) {
      if (!lastClientAt[c.task_id] || c.clickup_created_at > lastClientAt[c.task_id]) {
        lastClientAt[c.task_id] = c.clickup_created_at;
      }
    }
  });

  // needs_reply: team commented after last client reply (or client never replied)
  const needsReply: Record<string, boolean> = {};
  for (const taskId of Object.keys(lastTeamAt)) {
    const teamTs = lastTeamAt[taskId];
    const clientTs = lastClientAt[taskId] ?? '0';
    needsReply[taskId] = teamTs > clientTs;
  }

  return { support: supportCount, tasks: taskCounts, needsReply };
```

### 2b — Expose `needsReply` from the hook return value

The hook (lines 160–168) currently returns `taskUnread: counts.tasks`. Add `needsReply`:

```typescript
// BEFORE
  const counts = query.data ?? { support: 0, tasks: {} };

  return {
    supportUnread: counts.support,
    taskUnread: counts.tasks,
    isLoading: query.isLoading,
    markAsRead: useCallback((ctx: string) => markReadMutation.mutate(ctx), [markReadMutation]),
    refresh: useCallback(() => queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] }), [queryClient, userId]),
  };

// AFTER
  const counts = query.data ?? { support: 0, tasks: {}, needsReply: {} };

  return {
    supportUnread: counts.support,
    taskUnread: counts.tasks,
    needsReply: counts.needsReply,
    isLoading: query.isLoading,
    markAsRead: useCallback((ctx: string) => markReadMutation.mutate(ctx), [markReadMutation]),
    refresh: useCallback(() => queryClient.invalidateQueries({ queryKey: ['unread-counts', userId] }), [queryClient, userId]),
  };
```

### 2c — Fix optimistic update in `markReadMutation.onMutate` to preserve `needsReply`

The optimistic updater (lines 138–148) reconstructs the object and currently returns `{ support: 0, tasks: {} }` as the fallback. Update both the fallback and the spread to include `needsReply`:

```typescript
// BEFORE
        if (!old) return { support: 0, tasks: {} };
        if (contextType === 'support') return { ...old, support: 0 };
        if (contextType.startsWith('task:')) {
          const taskId = contextType.replace('task:', '');
          const newTasks = { ...old.tasks };
          delete newTasks[taskId];
          return { ...old, tasks: newTasks };
        }

// AFTER
        if (!old) return { support: 0, tasks: {}, needsReply: {} };
        if (contextType === 'support') return { ...old, support: 0 };
        if (contextType.startsWith('task:')) {
          const taskId = contextType.replace('task:', '');
          const newTasks = { ...old.tasks };
          delete newTasks[taskId];
          // Note: needsReply is NOT cleared on read — it stays until client actually replies
          return { ...old, tasks: newTasks };
        }
```

---

## Step 3 — Update `useMeineAufgaben` to accept and use `needsReply`

**File:** `src/shared/hooks/useMeineAufgaben.ts`

### 3a — Add `needsReply` parameter to the hook signature

```typescript
// BEFORE
export function useMeineAufgaben(
  tasks: ClickUpTask[],
  taskUnread: Record<string, number>,
  isLoading: boolean,
) {

// AFTER
export function useMeineAufgaben(
  tasks: ClickUpTask[],
  taskUnread: Record<string, number>,
  isLoading: boolean,
  needsReply: Record<string, boolean> = {},
) {
```

### 3b — Update `counts.unread` to include `needsReply` tasks

```typescript
// BEFORE (inside useMemo for counts)
    unread: tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0).length,

// AFTER
    unread: tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0 || needsReply[t.clickup_id]).length,
```

### 3c — Update `totalCount` to include `needsReply` task IDs

```typescript
// BEFORE (inside useMemo for totalCount)
    const ids = new Set<string>([
      ...tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0).map(t => t.clickup_id),
      ...tasks.filter(t => {
        const s = mapStatus(t.status)
        return s === 'needs_attention' || s === 'awaiting_approval'
      }).map(t => t.clickup_id),
      ...recommendations.map(t => t.clickup_id),
    ])

// AFTER
    const ids = new Set<string>([
      ...tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0 || needsReply[t.clickup_id]).map(t => t.clickup_id),
      ...tasks.filter(t => {
        const s = mapStatus(t.status)
        return s === 'needs_attention' || s === 'awaiting_approval'
      }).map(t => t.clickup_id),
      ...recommendations.map(t => t.clickup_id),
    ])
```

### 3d — Update `visibleTasks` for the 'unread' tab

```typescript
// BEFORE (inside useMemo for visibleTasks, switch case 'unread')
      case 'unread': return tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0)

// AFTER
      case 'unread': return tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0 || needsReply[t.clickup_id])
```

### 3e — Add `needsReply` to dependency arrays

Both `useMemo` for `counts` and `visibleTasks` reference `needsReply` — add it to their `deps` arrays:

```typescript
// counts useMemo deps:
// BEFORE
  }, [tasks, taskUnread, recommendations])

// AFTER
  }, [tasks, taskUnread, needsReply, recommendations])

// visibleTasks useMemo deps:
// BEFORE
  }, [activeTab, tasks, taskUnread, recommendations])

// AFTER
  }, [activeTab, tasks, taskUnread, needsReply, recommendations])
```

---

## Step 4 — Pass `needsReply` from `MeineAufgabenPage`

**File:** `src/shared/pages/MeineAufgabenPage.tsx`

```typescript
// BEFORE
  const { taskUnread } = useUnreadCounts(user?.id)
  const {
    counts,
    activeTab,
    setActiveTab,
    visibleTasks,
    totalCount,
    recommendations,
    snoozeRecommendation,
  } = useMeineAufgaben(tasks, taskUnread, isLoading)

// AFTER
  const { taskUnread, needsReply } = useUnreadCounts(user?.id)
  const {
    counts,
    activeTab,
    setActiveTab,
    visibleTasks,
    totalCount,
    recommendations,
    snoozeRecommendation,
  } = useMeineAufgaben(tasks, taskUnread, isLoading, needsReply)
```

---

## Step 5 — Update `useNeedsAttentionCount` to include `needsReply`

**File:** `src/shared/hooks/useNeedsAttentionCount.ts`

The sidebar badge must count tasks where `needsReply[id] = true` (tasks with unanswered team comments but dismissed unread bubble). `useUnreadCounts` already returns `needsReply` — destructure it here.

```typescript
// BEFORE
  const { taskUnread } = useUnreadCounts(userId)

// AFTER
  const { taskUnread, needsReply } = useUnreadCounts(userId)
```

Update the `ids` Set inside `useMemo`:

```typescript
// BEFORE
    const ids = new Set<string>([
      ...tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0).map(t => t.clickup_id),
      ...tasks.filter(t => {
        const s = mapStatus(t.status)
        return s === 'needs_attention' || s === 'awaiting_approval'
      }).map(t => t.clickup_id),
      ...recommendations.map(t => t.clickup_id),
    ])

// AFTER
    const ids = new Set<string>([
      ...tasks.filter(t => (taskUnread[t.clickup_id] ?? 0) > 0 || needsReply[t.clickup_id]).map(t => t.clickup_id),
      ...tasks.filter(t => {
        const s = mapStatus(t.status)
        return s === 'needs_attention' || s === 'awaiting_approval'
      }).map(t => t.clickup_id),
      ...recommendations.map(t => t.clickup_id),
    ])
```

Add `needsReply` to the `useMemo` dependency array:

```typescript
// BEFORE
  }, [userId, tasks, taskUnread, recommendations])

// AFTER
  }, [userId, tasks, taskUnread, needsReply, recommendations])
```

---

## Verification

After implementation:

1. **Type check passes:** `npm run build` — no TypeScript errors on `UnreadCounts` consumers.
2. **Existing tests pass:** `npm run test` — no regressions in ticket/unread count tests.
3. **Manual smoke test:**
   - Team posts a comment on a task → task appears in "Nachrichten" tab
   - Client opens the task (unread bubble clears) → task stays in "Nachrichten" tab
   - Client replies in the task → task leaves "Nachrichten" tab on next 15s poll
   - Sidebar badge reflects the above state transitions correctly
   - Support chat (`support_task_id`) is unaffected

---

## Change surface summary

| File | Change |
|---|---|
| `src/modules/tickets/types/tasks.ts` | Add `needsReply: Record<string, boolean>` to `UnreadCounts` |
| `src/modules/tickets/hooks/useUnreadCounts.ts` | Fetch all comments (both directions), compute `needsReply`, expose in hook return; fix optimistic update fallback |
| `src/shared/hooks/useMeineAufgaben.ts` | Accept `needsReply` param; apply to `counts.unread`, `totalCount`, `visibleTasks['unread']` |
| `src/shared/pages/MeineAufgabenPage.tsx` | Destructure `needsReply` from hook, pass to `useMeineAufgaben` |
| `src/shared/hooks/useNeedsAttentionCount.ts` | Destructure `needsReply`, include in `ids` Set |

No DB migration. No new queries (one existing query broadened). No changes to support-chat path.
