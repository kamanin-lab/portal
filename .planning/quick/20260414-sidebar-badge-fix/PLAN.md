---
id: 260414-u8j
slug: sidebar-badge-fix
date: 2026-04-14
title: Fix sidebar Meine Aufgaben badge not updating on new task
status: in-progress
---

# Fix sidebar badge not showing for new tasks

## Problem
The "Meine Aufgaben" sidebar badge (attention count) does not appear when a new task is created. The `useNeedsAttentionCount` query is never invalidated when `task_cache` changes via realtime subscription.

## Root cause
In `useClickUpTasks.ts`, the realtime channel handler (line 160) and the 30s polling interval (line 177) only invalidate `['clickup-tasks']`, not `['needs-attention-count', profileId]`. So when a new task enters `task_cache`, the badge count stays stale.

## Fix

### File: `src/modules/tickets/hooks/useClickUpTasks.ts`

1. **Realtime handler** (line ~160): Add invalidation of `needs-attention-count`
2. **30s polling** (line ~177): Add invalidation of `needs-attention-count`

```typescript
// Realtime handler (line 159-161):
queryClient.refetchQueries({ queryKey: ['clickup-tasks'] });
queryClient.invalidateQueries({ queryKey: ['needs-attention-count'] }); // ADD THIS

// 30s poll (line 177):
queryClient.invalidateQueries({ queryKey: ['clickup-tasks'] });
queryClient.invalidateQueries({ queryKey: ['needs-attention-count'] }); // ADD THIS
```

Note: No profileId needed in the query key — `invalidateQueries` with partial key `['needs-attention-count']` will match all variants including `['needs-attention-count', profileId]`.

## Scope
- **In scope:** `src/modules/tickets/hooks/useClickUpTasks.ts` only
- **Out of scope:** No changes to `useNeedsAttentionCount.ts`, Sidebar, or any other file

## Expected result
Badge appears/updates within 300ms of realtime event (debounce) when tasks change status or new tasks are created.
