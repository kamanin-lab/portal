# Quick Task: Fix Optimistic Update Flicker in Projects Module - Research

**Researched:** 2026-04-03
**Domain:** React Query optimistic updates, project task cache sync
**Confidence:** HIGH

---

## Root Cause Analysis

### Issue 1: The Flicker (Hero Reverts After Optimistic Patch)

The current sequence in `StepActionBar.tsx` `onSuccess`:

```
1. queryClient.setQueryData(['project', projectId], optimisticData)   ← correct
2. queryClient.invalidateQueries({ queryKey: ['project', projectId] }) ← THE BUG
```

`invalidateQueries` immediately marks the query as stale AND triggers a background refetch. React Query fires that refetch synchronously within the same tick. The refetch hits Supabase, which reads `project_task_cache` — but `update-task-status` only updates `task_cache` (the tickets cache), NOT `project_task_cache`. That table is only updated when the ClickUp webhook fires and `fetch-project-tasks` runs (~15-20s later). So the refetch returns the old status and overwrites the optimistic state.

**Confirmed from `update-task-status/index.ts` line 732–744:** The Edge Function updates `task_cache` (for the tickets module). It does NOT write to `project_task_cache`. That write only happens via `fetch-project-tasks` triggered by the webhook.

**Confirmed from `useProject.ts`:** The realtime subscription on `project_task_cache` calls `refetchQueries` (not `setQueryData`) when it fires. This is the correct eventual sync path — but only after the webhook arrives.

### Issue 2: Comment Not Appearing in StepDetail Message History

`StepDetail.tsx` renders `<TaskComments taskId={step.clickupTaskId} />` which uses `useTaskComments`.

`useTaskComments` reads from query key `['task-comments', taskId]` and fetches from `comment_cache`.

The `update-task-status` Edge Function DOES write the comment to `comment_cache` (line 706–728) using the service role key. So the comment IS in the DB immediately after the Edge Function responds.

The problem: `StepActionBar.onSuccess` calls `queryClient.invalidateQueries({ queryKey: ['project', projectId] })` — NOT `['task-comments', taskId]`. The comments query is never invalidated after the action. So the UI shows the old comment list until the 10-second polling interval fires in `useTaskComments`.

**Confirmed from `useTaskComments.ts` line 141-147:** Comments poll every 10 seconds via `invalidateQueries`. There is no instant trigger after an action that posts a comment.

---

## The Fix Pattern

### Fix 1: Eliminate `invalidateQueries` from `StepActionBar.onSuccess`

The React Query canonical optimistic update pattern for long-latency external sources:

1. `await queryClient.cancelQueries({ queryKey })` — cancel any in-flight fetch so it can't overwrite
2. `queryClient.setQueryData(queryKey, newData)` — apply optimistic state
3. Do NOT call `invalidateQueries` on success — let the realtime subscription handle eventual sync
4. Call `invalidateQueries` only in the rollback path (on error), if a rollback is needed

For this codebase: the realtime subscription in `useProject.ts` already handles sync correctly when the webhook fires. The optimistic patch just needs to survive until then. Removing `invalidateQueries` is sufficient.

**The `cancelQueries` call is important.** Without it, if there is already an in-flight refetch (e.g. from `refetchOnWindowFocus` or the 30s interval), that fetch will complete and overwrite the optimistic state even without a new `invalidateQueries` call.

```typescript
// In StepActionBar.tsx onSuccess — CORRECT pattern
await queryClient.cancelQueries({ queryKey: ['project', projectId] });
queryClient.setQueryData(['project', projectId], (old: Project | null | undefined) => {
  // ... optimistic patch (unchanged)
});
// REMOVE: queryClient.invalidateQueries({ queryKey: ['project', projectId] });
```

### Fix 2: Invalidate Comments Query After Action

After `update-task-status` completes, the comment is already in `comment_cache`. We just need to tell React Query to refetch it:

```typescript
// In StepActionBar.tsx onSuccess, after setQueryData:
if (commentText.trim()) {
  queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
}
```

This triggers an immediate refetch from `comment_cache`, which now contains the new comment. The comment appears instantly.

### Fix 3: Preserve `refetchOnWindowFocus` Behavior

Concern: if we never call `invalidateQueries` on success, will `refetchOnWindowFocus` still work?

Yes. `refetchOnWindowFocus` is controlled by the `refetchOnWindowFocus: true` option in `useQuery` (confirmed in `useProject.ts` line 147). It fires independently of query staleness state. The query data will be slightly stale during the 15-20s webhook gap, but that is acceptable — the optimistic patch IS the correct data.

When the webhook fires → realtime subscription → `queryClient.refetchQueries` (line 129) → fresh data from `project_task_cache` which now has the updated status → hero shows the correct state from real data.

### Fix 4: `cancelQueries` must be `await`-ed

`cancelQueries` is async. If not awaited, the cancellation may not complete before `setQueryData` is called, allowing the in-flight fetch to still land.

```typescript
// Pattern:
await queryClient.cancelQueries({ queryKey: ['project', projectId] });
queryClient.setQueryData(/* ... */);
```

---

## Code Change Summary

**File:** `src/modules/projects/components/steps/StepActionBar.tsx`

`onSuccess` callback currently:
```typescript
onSuccess: () => {
  const currentAction = activeAction;
  queryClient.setQueryData(['project', projectId], (old) => { /* patch */ });
  queryClient.invalidateQueries({ queryKey: ['project', projectId] }); // REMOVE
  setActiveAction(null);
  setCommentText('');
  onSuccess?.();
}
```

Must become async and use `cancelQueries` first:
```typescript
onSuccess: async () => {
  const currentAction = activeAction;
  await queryClient.cancelQueries({ queryKey: ['project', projectId] });
  queryClient.setQueryData(['project', projectId], (old) => { /* patch — unchanged */ });
  // Invalidate comments so the newly-posted comment appears immediately
  queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] });
  setActiveAction(null);
  setCommentText('');
  onSuccess?.();
}
```

Note: `useTaskActions` `onSuccess` callback is not typed as async — check if `useTaskActions` options allow an async `onSuccess`. If not, wrap in a void IIFE or restructure slightly. The simplest approach: make `StepActionBar` pass its own `onSuccess` that contains the async logic, rather than putting async work in `useTaskActions.onSuccess`.

---

## Alternative Approaches Considered

| Approach | Why Not |
|----------|---------|
| Add delay before `invalidateQueries` | Hacky. Race condition not fixed, just widened. |
| Set `staleTime` to very high value | Prevents legitimate syncs on other paths. |
| Write optimistic status to `project_task_cache` directly from frontend | RLS violation. Client cannot write to that table. |
| Add `project_task_cache` write to `update-task-status` Edge Function | Architectural change, out of scope. The optimistic + realtime pattern is correct. |
| React Query `useMutation` with built-in `onMutate` optimistic | Would require refactoring to move mutation into `useProject` hook. More invasive. The current manual `setQueryData` in `onSuccess` is simpler for this case. |

---

## Secondary Investigation: Is `project_task_cache` Updated Before Webhook?

Confirmed NO. The `update-task-status` function only updates `task_cache` (line 732-744), not `project_task_cache`. There is no write to `project_task_cache` in the synchronous request path. The only write path for `project_task_cache` is:

1. Webhook fires from ClickUp → `clickup-webhook` Edge Function → triggers `fetch-project-tasks` → writes to `project_task_cache`
2. Manual trigger of `fetch-project-tasks` (e.g. the background refresh in `useProject.ts` on mount)

This confirms that calling `invalidateQueries` after the action will always return stale data for a 15-20s window.

---

## Execution Risks

- **`onSuccess` async signature:** `useTaskActions` accepts `onSuccess?: () => void`. Making it `async () => void` still satisfies that type (async function returns a Promise which is assignable to void in TS). No type change needed.
- **`cancelQueries` on cold start:** If the query hasn't loaded yet, `cancelQueries` is a no-op. Safe.
- **Comment invalidation when no comment was typed (Freigeben without text):** `invalidateQueries(['task-comments', taskId])` is harmless even if no comment was posted — it will just re-read `comment_cache` and return the same list. No need to condition it on `commentText.trim()`.

---

## Sources

- `src/modules/projects/components/steps/StepActionBar.tsx` — current optimistic patch implementation
- `src/modules/projects/hooks/useProject.ts` — `['project', projectId]` query key, realtime sub, `staleTime: 5min`, `refetchOnWindowFocus: true`
- `src/modules/tickets/hooks/useTaskComments.ts` — `['task-comments', taskId]` query key, 10s polling
- `src/modules/projects/components/steps/StepDetail.tsx` — `TaskComments` rendered with `step.clickupTaskId`
- `supabase/functions/update-task-status/index.ts` — writes `task_cache` status (line 732-744), writes `comment_cache` when comment present (line 706-728), does NOT write `project_task_cache`
- React Query docs (from training, HIGH confidence for `cancelQueries` + `setQueryData` pattern — stable API since v4)
