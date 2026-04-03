---
phase: quick
plan: 260403-fnr
subsystem: projects
tags: [react-query, optimistic-updates, project-module, step-actions]
dependency_graph:
  requires: []
  provides: [flicker-free-step-approval]
  affects: [StepActionBar, useProject, useTaskComments]
tech_stack:
  added: []
  patterns: [cancelQueries-before-setQueryData, targeted-comment-invalidation]
key_files:
  modified:
    - src/modules/projects/components/steps/StepActionBar.tsx
decisions:
  - cancelQueries awaited before setQueryData to block in-flight refetch overwrite
  - invalidateQueries target changed from ['project', projectId] to ['task-comments', taskId]
metrics:
  duration: ~5 min
  completed: 2026-04-03
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260403-fnr: Fix Optimistic Update Flicker in Project Steps Summary

**One-liner:** Await `cancelQueries` before `setQueryData` and retarget `invalidateQueries` to `['task-comments']` so the hero CTA persists until webhook sync and comments appear immediately after approve/request_changes.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix onSuccess callback in StepActionBar | `4e2ca26` | `StepActionBar.tsx` |

## What Was Done

### Root Cause

Two bugs in `StepActionBar.tsx` `onSuccess`:

1. **Flicker:** `invalidateQueries(['project', projectId])` fired immediately after `setQueryData`, triggering a background refetch from `project_task_cache`. That table is only updated by the ClickUp webhook (~15-20s later), so the refetch returned the old status and overwrote the optimistic patch.

2. **Comments delay:** `invalidateQueries` targeted `['project', projectId]` instead of `['task-comments', taskId]`. The comments query was never invalidated, so newly-posted comments didn't appear until the 10-second polling interval.

### Fix Applied

Three changes to `StepActionBar.tsx` `onSuccess`:

1. Made the callback `async`
2. Added `await queryClient.cancelQueries({ queryKey: ['project', projectId] })` before `setQueryData` — cancels any in-flight refetch so it cannot overwrite the optimistic state
3. Replaced `queryClient.invalidateQueries({ queryKey: ['project', projectId] })` with `queryClient.invalidateQueries({ queryKey: ['task-comments', taskId] })` — triggers immediate refetch of `comment_cache` (written synchronously by `update-task-status`), while leaving eventual project sync to the realtime subscription in `useProject.ts`

## Deviations from Plan

None — plan executed exactly as written. The research document's recommendation to always invalidate comments (not conditionally on `commentText.trim()`) was already the plan's stated approach and confirmed correct.

## Self-Check: PASSED

- `src/modules/projects/components/steps/StepActionBar.tsx` — FOUND, modified
- Commit `4e2ca26` — FOUND
- `npm run build` — passed (built in 11.59s, no errors)
- `onSuccess` is async — confirmed in file line 20
- `cancelQueries` awaited before `setQueryData` — confirmed line 24
- `invalidateQueries` targets `['task-comments', taskId]` — confirmed line 63
