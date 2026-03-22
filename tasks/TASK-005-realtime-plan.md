# TASK-005: Reliable Real-Time Updates — Implementation Plan

## Context
User reports: projects don't update at all (requires page reload), tasks update inconsistently. The portal should auto-update whenever ClickUp data changes — no manual refresh buttons needed.

## Root Cause Analysis (from audit)
The frontend subscription code is largely correct. The gaps are:
1. Database-level Realtime configuration may be missing
2. Supabase client has no Realtime options (no reconnect, no logging)
3. Tasks subscribe to UPDATE only (miss new tasks)
4. One-shot background sync means data goes stale in long sessions
5. Projects have no polling fallback and no manual refresh

---

## Implementation Plan — 6 Changes

### Change 1: Verify & Fix Supabase Realtime Publication (DB level)

**What:** Ensure all cache tables are in the Realtime publication with correct replica identity.

**How:** Run SQL via `POST /pg/query` endpoint:
```sql
-- Check current publication
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

-- Add missing tables if needed
ALTER PUBLICATION supabase_realtime ADD TABLE task_cache;
ALTER PUBLICATION supabase_realtime ADD TABLE project_task_cache;
ALTER PUBLICATION supabase_realtime ADD TABLE comment_cache;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE project_file_cache;

-- Set replica identity for Realtime to work
ALTER TABLE task_cache REPLICA IDENTITY FULL;
ALTER TABLE project_task_cache REPLICA IDENTITY FULL;
ALTER TABLE comment_cache REPLICA IDENTITY FULL;
ALTER TABLE notifications REPLICA IDENTITY FULL;
ALTER TABLE project_file_cache REPLICA IDENTITY FULL;
```

**Acceptance:** All 5 tables visible in `pg_publication_tables` with `REPLICA IDENTITY FULL`.

---

### Change 2: Add Realtime Config to Supabase Client

**File:** `src/shared/lib/supabase.ts`

**Current (line 10-16):**
```typescript
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
})
```

**Change to:**
```typescript
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})
```

**Also add** connection state logging (dev only):
```typescript
if (import.meta.env.DEV) {
  supabase.realtime.onOpen(() => console.log('[Realtime] Connected'));
  supabase.realtime.onClose(() => console.warn('[Realtime] Disconnected'));
  supabase.realtime.onError((err: Error) => console.error('[Realtime] Error:', err.message));
}
```

**Acceptance:** In browser console, see `[Realtime] Connected` on page load. No errors.

---

### Change 3: Fix Task Subscription — UPDATE → * (all events)

**File:** `src/modules/tickets/hooks/useClickUpTasks.ts`

**Current (line 148-149):**
```typescript
.on('postgres_changes', {
  event: 'UPDATE',
```

**Change to:**
```typescript
.on('postgres_changes', {
  event: '*',
```

**Why:** New tasks inserted by `fetch-clickup-tasks` or webhook don't trigger UPDATE — they're INSERTs. Deleted tasks also need to propagate.

**Acceptance:** New task created in ClickUp → appears in portal within seconds without manual refresh.

---

### Change 4: Add Periodic Background Polling (replace one-shot)

**File:** `src/modules/projects/hooks/useProject.ts`

**Current (lines 148-161):** One-shot `hasRefreshedRef` pattern — fires once per session, never again.

**Replace with:** Periodic refresh every 60 seconds using `setInterval`:
```typescript
useEffect(() => {
  if (!query.data || query.isError || !user || !projectId) return;

  // Initial refresh
  const doRefresh = () => {
    supabase.functions
      .invoke('fetch-project-tasks')
      .then(() => queryClient.invalidateQueries({ queryKey: ['project', projectId] }))
      .catch(() => {});
  };

  // First refresh immediately
  if (!hasRefreshedRef.current) {
    hasRefreshedRef.current = true;
    doRefresh();
  }

  // Then every 60 seconds as fallback
  const interval = setInterval(doRefresh, 60_000);
  return () => clearInterval(interval);
}, [query.data, query.isError, user, projectId, queryClient]);
```

**Also reduce staleTime** from 15 minutes to 30 seconds:
```typescript
staleTime: 30_000, // 30 seconds — Realtime handles freshness, this is fallback
```

**Same pattern for `src/modules/tickets/hooks/useClickUpTasks.ts`:**
- Replace one-shot `hasRefreshedRef` with periodic 60s interval
- Reduce staleTime from 5 minutes to 30 seconds

**Acceptance:**
- Change status in ClickUp → portal updates within 1-3 seconds (via Realtime)
- If Realtime fails → portal updates within 60 seconds (via polling)
- `refetchOnWindowFocus` set to `true` so tab switch also triggers refresh

---

### Change 5: Add profile_id Filter to Project Comments Subscription

**File:** `src/modules/projects/hooks/useProjectComments.ts`

**Current (lines 93-99):** No filter — subscribes to ALL `comment_cache` INSERTs globally.

**Change to:** Add `filter` with profile_id:
```typescript
.on('postgres_changes', {
  event: 'INSERT',
  schema: 'public',
  table: 'comment_cache',
  filter: `profile_id=eq.${userId}`,
}, (payload) => {
  // Keep existing taskIds check as secondary guard
```

**Requires:** Get `userId` from auth — add `const { data: { user } } = await supabase.auth.getUser()` or pass it as parameter.

**Acceptance:** Only comments for the current user's profile trigger invalidation. No firehose of all users' comments.

---

### Change 6: Make fetch-single-task Write to Cache

**File:** `supabase/functions/fetch-single-task/index.ts`

**Current:** Fetches task from ClickUp API, returns to browser, does NOT write to `task_cache`.

**Add:** After successful fetch, upsert into `task_cache` using service role client:
```typescript
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
await supabaseAdmin.from('task_cache').upsert({
  clickup_id: task.id,
  profile_id: profileId,
  name: task.name,
  status: task.status.status,
  // ... other fields
}, { onConflict: 'clickup_id,profile_id' });
```

**Acceptance:** Deep-linked task that wasn't in cache → after viewing, appears in task list (cache populated).

---

## What We're NOT Doing (out of scope)
- Nextcloud file real-time (no Nextcloud webhook exists — by design)
- Webhook refactoring (webhook code works correctly, issue is DB config + frontend)
- New UI for sync status indicator (existing refresh pattern sufficient)

---

## Commit Structure

| Commit | Content |
|--------|---------|
| 1 | DB config: Realtime publication + replica identity (SQL only) |
| 2 | Supabase client Realtime config + connection logging |
| 3 | Task subscription `*` + periodic polling + reduced staleTime |
| 4 | Project periodic polling + reduced staleTime + refetchOnWindowFocus |
| 5 | Project comments profile_id filter |
| 6 | fetch-single-task cache write |

---

## Verification

After all changes:
1. Open portal in browser → console shows `[Realtime] Connected`
2. Change task status in ClickUp → portal task list updates within 3 seconds
3. Change project task status in ClickUp → project overview updates within 3 seconds
4. Add comment in ClickUp → comment appears in portal within 3 seconds
5. Close laptop lid, reopen → portal refreshes on window focus
6. Leave portal open 5 minutes without touching → data still fresh (60s polling)
7. `npm run build` passes
8. All tests pass
