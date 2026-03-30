---
phase: quick-260330-mp6
plan: 01
subsystem: tickets/recommendations
tags: [recommendations, notifications, webhook, ui-polish]
dependency_graph:
  requires: [quick-260330-lvq]
  provides: [recommendation-card-polish, recommendation-detail-actions, new_recommendation-notification]
  affects: [tickets-module, konto-notifications, clickup-webhook]
tech_stack:
  added: []
  patterns: [CreditApproval-pattern, TaskCard-layout, AnimatePresence-mode-switch]
key_files:
  created:
    - src/modules/tickets/components/RecommendationApproval.tsx
  modified:
    - src/modules/tickets/components/RecommendationCard.tsx
    - src/modules/tickets/components/RecommendationsBlock.tsx
    - src/modules/tickets/components/TaskDetail.tsx
    - src/shared/types/common.ts
    - src/shared/components/konto/NotificationSection.tsx
    - supabase/functions/_shared/emailCopy.ts
    - supabase/functions/clickup-webhook/index.ts
    - src/shared/hooks/useAuth.ts
  deleted:
    - src/modules/tickets/components/RecommendationActions.tsx
decisions:
  - RecommendationCard now uses task.tags (top-level on ClickUpTask) for recommendation detection, not raw_data.tags
  - Accept/decline actions moved from card into TaskDetailSheet via RecommendationApproval component — consistent with CreditApproval UX pattern
  - Webhook tag handler returns early for non-recommendation tags — explicit ignore response instead of falling through
metrics:
  duration: ~20 minutes
  completed_date: "2026-03-30"
  tasks_completed: 3
  files_changed: 8
---

# Quick Task 260330-mp6: Recommendations Polish — Standard Card + Sheet Actions Summary

**One-liner:** Rewrote RecommendationCard to match TaskCard layout, moved accept/decline into TaskDetailSheet via new RecommendationApproval component, and wired new_recommendation notification preference end-to-end (toggle, email copy, webhook tag handler).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite RecommendationCard + simplify RecommendationsBlock + delete RecommendationActions | `79f1a47` | RecommendationCard.tsx, RecommendationsBlock.tsx, RecommendationActions.tsx (deleted) |
| 2 | Add RecommendationApproval to TaskDetail + notification preference + email copy | `f02db68` | TaskDetail.tsx, RecommendationApproval.tsx (new), common.ts, NotificationSection.tsx, emailCopy.ts |
| 3 | Add recommendation tag detection to clickup-webhook | `7c690af` | clickup-webhook/index.ts |

## What Was Built

### RecommendationCard (rewrite)
- Removed accept/decline buttons and amber fixed color scheme entirely
- Now matches TaskCard exactly: dynamic status left border via `STATUS_BORDER_COLORS`, `StatusBadge`, `PriorityIcon`, `CreditBadge`, due date with calendar icon, created_by_name
- Subtle `Idea01Icon` (13px, amber) inline after task name — not dominant
- Props: `{ task, unreadCount?, onTaskClick }` — no accept/decline

### RecommendationsBlock (simplified)
- Removed `useRef` modal wiring and `RecommendationActions` import
- Now simply maps tasks to `RecommendationCard` with `onTaskClick`

### RecommendationActions.tsx (deleted)
- Replaced entirely by `RecommendationApproval.tsx` in TaskDetailSheet

### RecommendationApproval (new component)
- Pattern: amber border block, AnimatePresence mode switching (buttons → accepting → declining)
- Accept mode: date picker (default +14 days), calls `acceptRecommendation(taskId, dueDateMs)`
- Decline mode: optional textarea comment, calls `declineRecommendation(taskId, comment?)`
- Shows credits if present (with FlashIcon)

### TaskDetail.tsx
- Detects recommendation tag via `task.tags?.some(t => t.name === 'recommendation')`
- Shows `<RecommendationApproval>` instead of `<TaskActions>` for recommendation tasks
- `CreditApproval` unchanged (still shows for `awaiting_approval` status)

### Notification preference (new_recommendation)
- `NotificationPreferences` interface: added `new_recommendation: boolean`
- `DEFAULT_NOTIFICATION_PREFERENCES`: `new_recommendation: true`
- `NotificationSection`: 6th toggle "Neue Empfehlung"
- `emailCopy.ts`: `EmailType` union expanded, full `new_recommendation` entry (de + en)

### Webhook (clickup-webhook)
- `EMAIL_TYPE_TO_PREF_KEY`: added `new_recommendation: "new_recommendation"`
- New `tag` field handler: detects `recommendation` tag addition, fetches visibility, creates bell notifications, sends email via `shouldSendEmail` gate
- Non-recommendation tag changes return early with ignore response
- Fallthrough message updated to "not tag or credits field"

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed raw_data.tags access — ClickUpTask has top-level tags**
- **Found during:** npm run build (post-Task 2)
- **Issue:** TaskDetail used `task.raw_data?.tags` but `ClickUpTask` interface has `tags` as a top-level field, not nested in `raw_data`
- **Fix:** Changed to `task.tags?.some(t => t.name === 'recommendation')`
- **Files modified:** `src/modules/tickets/components/TaskDetail.tsx`
- **Commit:** `7bc70fc`

**2. [Rule 2 - Missing critical functionality] Add new_recommendation to staging bypass profile**
- **Found during:** npm run build (post-Task 2)
- **Issue:** `STAGING_BYPASS_PROFILE` in `useAuth.ts` had a hardcoded notification_preferences literal missing `new_recommendation`, causing TypeScript error
- **Fix:** Added `new_recommendation: true` to the literal
- **Files modified:** `src/shared/hooks/useAuth.ts`
- **Commit:** `7bc70fc`

## Known Stubs

None. All recommendation flows are fully wired.

## Self-Check: PASSED

- `src/modules/tickets/components/RecommendationApproval.tsx` — created
- `src/modules/tickets/components/RecommendationCard.tsx` — modified (Task 1)
- `src/modules/tickets/components/RecommendationsBlock.tsx` — modified (Task 1)
- `src/modules/tickets/components/RecommendationActions.tsx` — deleted
- `src/modules/tickets/components/TaskDetail.tsx` — modified (Tasks 2 + fix)
- `src/shared/types/common.ts` — modified (Task 2)
- `src/shared/components/konto/NotificationSection.tsx` — modified (Task 2)
- `supabase/functions/_shared/emailCopy.ts` — modified (Task 2)
- `supabase/functions/clickup-webhook/index.ts` — modified (Task 3)
- `src/shared/hooks/useAuth.ts` — modified (fix)
- Production build: clean (`✓ built in 11.07s`)
- Commits: 79f1a47, f02db68, 7c690af, 7bc70fc — all verified in git log
