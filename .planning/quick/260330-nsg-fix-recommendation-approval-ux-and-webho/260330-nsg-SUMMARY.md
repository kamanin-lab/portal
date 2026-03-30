---
phase: quick-260330-nsg
plan: 01
subsystem: tickets/recommendations
tags: [bug-fix, ux, edge-function, webhook, recommendation]
dependency_graph:
  requires: [260330-mp6]
  provides: [recommendation-approval-ux-complete, taskTagUpdated-webhook]
  affects: [TaskDetailSheet, update-task-status, clickup-webhook]
tech_stack:
  added: []
  patterns: [onSuccess-callback-for-close, auto-comment-cache-pattern, webhook-event-handler]
key_files:
  modified:
    - src/modules/tickets/components/RecommendationApproval.tsx
    - src/modules/tickets/components/TaskDetail.tsx
    - supabase/functions/update-task-status/index.ts
    - supabase/functions/clickup-webhook/index.ts
decisions:
  - RecommendationApproval onClose wired via useTaskActions onSuccess — same pattern as CreditApproval
  - taskTagUpdated add/remove detection via live ClickUp API tag presence check (not payload inference)
  - fetchTaskForVisibilityCheck extended with optional tags field — backward compatible, all callers unaffected
metrics:
  duration: ~10min
  completed: 2026-03-30
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 260330-nsg: Fix Recommendation Approval UX and Webhook Summary

**One-liner:** Four bug fixes completing the recommendation approval flow — sheet close on success, German date label, auto-comment to ClickUp, and taskTagUpdated webhook event handler.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix frontend — onClose prop, date label, tag-based visibility | `49df724` | RecommendationApproval.tsx, TaskDetail.tsx |
| 2 | Auto-comment for accept_recommendation + taskTagUpdated webhook | `fd0626b` | update-task-status/index.ts, clickup-webhook/index.ts |

## What Was Built

### Task 1 — Frontend Fixes

**RecommendationApproval.tsx:**
- Added `onClose?: () => void` prop to interface
- Passed `onSuccess: onClose` into `useTaskActions()` — sheet closes automatically after accept or decline success via the existing hook callback
- Added `<p className="text-xs text-text-tertiary">Bis wann soll das erledigt werden?</p>` label immediately above the date input in the accepting mode block

**TaskDetail.tsx:**
- Destructured `onClose` in component signature (was previously ignored despite being in Props interface)
- Passes `onClose` to `<RecommendationApproval>` via prop

### Task 2 — Edge Function Fixes

**update-task-status/index.ts:**
- Added auto-comment block after the accept_recommendation tag-swap logic
- Fetches `profile.full_name`, formats due date as DD.MM.YYYY (de-AT locale)
- Comment text: `"${fullName} (via Client Portal):\n\nEmpfehlung angenommen. Erledigen bis: ${dueDateFormatted}"`
- Resolves active public thread, posts as thread reply if available, top-level otherwise
- Upserts into `comment_cache` on `clickup_comment_id,profile_id` conflict — instant UI display
- Pattern mirrors approve_credits auto-comment exactly

**clickup-webhook/index.ts:**
- Added `tag_name?: string` to `ClickUpWebhookPayload` interface (line ~117)
- Extended `fetchTaskForVisibilityCheck` return type to include `tags?: Array<{ name: string }>` — populated from `task.tags || []` in the ClickUp API response
- Added `taskTagUpdated` event handler block before the final "Ignore other event types" fallback:
  - Checks `payload.tag_name === "recommendation"` — returns early for other tags
  - Fetches task via `fetchTaskForVisibilityCheck` to check both visibility and tag presence
  - Detects add vs remove by checking if `recommendation` tag is still present in the task's current tags array
  - If removed: returns gracefully with `recommendation_tag_removed` type
  - If added and visible: resolves profile IDs, inserts bell notifications (`new_recommendation`), sends email via `sendMailjetEmail` for profiles with `shouldSendEmail(p, "new_recommendation") === true`
  - Idempotent — notifications table has no dedup key, but this is belt-and-suspenders alongside the existing `taskUpdated` tag handler

## Decisions Made

- **onClose via onSuccess hook:** No `.then()` chaining needed — `useTaskActions` already calls `options.onSuccess()` after any successful mutation. Passing `onClose` as `onSuccess` is the cleanest integration.
- **Add/remove detection via API:** `taskTagUpdated` payload has `tag_name` but no indication of add vs remove. Checking live tag presence on the task is the reliable approach.
- **fetchTaskForVisibilityCheck extension:** Adding `tags` to the return type is backward compatible — all existing callers that don't use `tags` are unaffected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] fetchTaskForVisibilityCheck missing tags in return type**
- **Found during:** Task 2
- **Issue:** Plan's taskTagUpdated handler accesses `taskInfo.tags` but the function only returned `{ visible, name, listId }`. Tags would be `undefined`, breaking the add/remove detection.
- **Fix:** Extended `fetchTaskForVisibilityCheck` return type to include `tags?: Array<{ name: string }>`, populated from `task.tags || []` in the API response.
- **Files modified:** `supabase/functions/clickup-webhook/index.ts`
- **Commit:** `fd0626b`

## Known Stubs

None.

## Self-Check: PASSED

- `49df724` exists: FOUND
- `fd0626b` exists: FOUND
- `src/modules/tickets/components/RecommendationApproval.tsx` modified: FOUND
- `src/modules/tickets/components/TaskDetail.tsx` modified: FOUND
- `supabase/functions/update-task-status/index.ts` modified: FOUND
- `supabase/functions/clickup-webhook/index.ts` modified: FOUND
- TypeScript: clean (0 errors)
