---
id: 260414-u8j
slug: sidebar-badge-fix
date: 2026-04-14
status: complete
---

# Sidebar badge fix — complete

## What was done
Added `queryClient.invalidateQueries({ queryKey: ['needs-attention-count'] })` in two places in `useClickUpTasks.ts`:
1. Realtime channel handler (debounced 300ms) — fires on any `task_cache` INSERT/UPDATE/DELETE
2. 30s polling fallback interval

## Root cause
`useNeedsAttentionCount` query key `['needs-attention-count', profileId]` was never invalidated when tasks changed. Only `['clickup-tasks']` was being refetched. Badge stayed stale at 0 (or old value).

## Files changed
- `src/modules/tickets/hooks/useClickUpTasks.ts` (+2 lines)

## Commit
212caa5 — fix(sidebar): invalidate needs-attention-count on task_cache realtime + polling
