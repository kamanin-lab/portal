---
id: 260330-rq4
title: "Audit and fix recommendations decline mechanism"
type: quick-full
phase: quick
plan: 260330-rq4
subsystem: recommendations
tags: [recommendations, edge-functions, task-detail, clickup, comment-cache]
dependency_graph:
  requires: [260330-nsg]
  provides: [decline-auto-comment, cancelled-status-hide, tag-cache-clear]
  affects: [TaskDetail.tsx, update-task-status]
tech_stack:
  added: []
  patterns: [auto-comment-on-action, tag-cleanup-on-action, generic-handler-guard]
key_files:
  modified:
    - src/modules/tickets/components/TaskDetail.tsx
    - supabase/functions/update-task-status/index.ts
decisions:
  - "declined recommendations are represented as 'cancelled' portalStatus — exclusion array now covers this terminal state"
  - "decline auto-comment embeds user reasoning inline; generic handler guards against double-post via action !== 'decline_recommendation'"
  - "tag cleanup applied to both accept and decline for symmetry — covers race condition before webhook fires"
metrics:
  duration: "~8 minutes"
  completed: "2026-03-30"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260330-rq4: Audit and Fix Recommendations Decline Mechanism Summary

**One-liner:** Decline recommendation now posts "Empfehlung abgelehnt" auto-comment to ClickUp, clears tag from task_cache immediately, and hides the approval block for cancelled status.

## What Was Done

Fixed three gaps in the recommendations decline flow that were left after the 260330-nsg quick task:

1. **Frontend hide-on-cancelled** (`TaskDetail.tsx`): The `portalStatus === 'cancelled'` state (set by ClickUp when a recommendation is declined) was not in the exclusion array for the RecommendationApproval block. Even with the `isRecommendation` tag gone, if a refetch happened before the webhook cleared the tag, the block would reappear. Added `'cancelled'` to the exclusion array as primary defense.

2. **Decline auto-comment** (`update-task-status/index.ts`): The `decline_recommendation` action had no auto-comment logic, unlike `accept_recommendation`. Added a mirror of the accept pattern: fetches the user's `full_name`, builds display text (`"Empfehlung abgelehnt."` or with `"Begründung: ..."` if a comment was provided), resolves the active ClickUp thread, POSTs to ClickUp, and upserts into `comment_cache` for instant UI display.

3. **Generic handler guard** (`update-task-status/index.ts`): The generic comment handler at line 625 fires for any action with a non-empty `comment` field. Since the decline auto-comment already embeds the user's reasoning, added `&& action !== 'decline_recommendation'` to prevent double-posting.

4. **Task 2 — Tag cleanup from task_cache** (`update-task-status/index.ts`): After the status cache update, added logic to fetch `task_cache.tags`, filter out the `"recommendation"` tag, and write the filtered tags back. Applies to both accept and decline. This is a belt-and-suspenders fix so that React Query refetch after `invalidateQueries` sees `isRecommendation = false` even if the webhook hasn't fired yet.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Hide block for cancelled + decline auto-comment + generic handler guard | `646008c` | TaskDetail.tsx, update-task-status/index.ts |
| 2 | Clear recommendation tag from task_cache on accept/decline | `d0e0c32` | update-task-status/index.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `src/modules/tickets/components/TaskDetail.tsx` — 'cancelled' present in exclusion array (line 93)
- `supabase/functions/update-task-status/index.ts` — "Empfehlung abgelehnt" present (lines 490-491)
- `supabase/functions/update-task-status/index.ts` — `action !== 'decline_recommendation'` guard present (line 625)
- Commits `646008c` and `d0e0c32` exist in git log
- `npm run build` passes without errors (both after Task 1 and Task 2)
