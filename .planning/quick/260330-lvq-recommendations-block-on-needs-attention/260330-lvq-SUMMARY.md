---
phase: quick-260330-lvq
plan: 01
subsystem: tickets
tags: [recommendations, ux, tickets, edge-function]
dependency_graph:
  requires: []
  provides: [recommendations-block-ui, accept-decline-recommendation-flow]
  affects: [TicketsPage, update-task-status, task_cache]
tech_stack:
  added: []
  patterns: [ref-forwarding-for-modal-triggers, useRef-before-early-return]
key_files:
  created:
    - src/modules/tickets/hooks/useRecommendations.ts
    - src/modules/tickets/components/RecommendationCard.tsx
    - src/modules/tickets/components/RecommendationActions.tsx
    - src/modules/tickets/components/RecommendationsBlock.tsx
  modified:
    - supabase/functions/_shared/clickup-contract.ts
    - supabase/functions/update-task-status/index.ts
    - src/modules/tickets/types/tasks.ts
    - src/modules/tickets/lib/dictionary.ts
    - src/modules/tickets/hooks/useTaskActions.ts
    - src/modules/tickets/pages/TicketsPage.tsx
decisions:
  - useRef pattern for modal trigger forwarding in RecommendationsBlock avoids prop drilling and keeps RecommendationActions self-contained
  - accept_recommendation tag ops (remove recommendation, add ticket) are best-effort — status change is the critical operation
  - dueDate validation at Edge Function entry guard prevents silent failures
metrics:
  duration: ~18 minutes
  completed_date: "2026-03-30"
  tasks_completed: 3
  files_changed: 10
---

# Quick Task 260330-lvq: Recommendations Block on Needs Attention Summary

**One-liner:** Agency-to-client recommendations workflow — TO DO tasks tagged `recommendation` surface in a distinct block below the Needs Attention task list, with Accept (datepicker → READY + tag swap) and Decline (optional comment → CANCELED) flows via Edge Function extension.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Extend Edge Function + types for accept/decline recommendation | `2d7b73e` | Done |
| 2 | Build useRecommendations hook + RecommendationCard + RecommendationActions + RecommendationsBlock | `f8371b8` | Done |
| 3 | Wire RecommendationsBlock into TicketsPage Needs Attention tab | `0463ac5` | Done |
| - | Fix useRef hooks before early return (Rule 1 - lint) | `97d2022` | Done |

## What Was Built

### Edge Function Extension (`update-task-status/index.ts`)
- Added `accept_recommendation` and `decline_recommendation` to `VALID_ACTIONS`
- `accept_recommendation` flow: validates `dueDate` (required), changes status to READY, sets `due_date` on ClickUp task, removes `recommendation` tag, adds `ticket` tag (tag ops are best-effort), updates `task_cache.due_date`
- `decline_recommendation` flow: changes status to CANCELED, posts optional comment via existing comment block
- `clickup-contract.ts`: added STATUS_ALIASES entries for both new actions

### Frontend Types and Dictionary
- `TaskAction` union extended with `accept_recommendation | decline_recommendation`
- `dictionary.ts`: added labels.recommendations, labels.recommendationsSubtitle, actions.accept, actions.decline, 4 new toasts, 6 new dialog strings
- `useTaskActions.ts`: ACTION_TOASTS entries, `acceptRecommendation` and `declineRecommendation` named helpers, `dueDate` param in `UpdateTaskStatusParams` and `updateTaskStatus` body

### React Components
- **useRecommendations**: filters `tasks` by `recommendation` tag + `TO DO` status — no Supabase call, purely derived
- **RecommendationCard**: 152px fixed height matching TaskCard, amber left border (`--phase-3`), lightbulb icon, title+description, CreditBadge, Accept/Decline buttons in right panel
- **RecommendationActions**: AlertDialog-based Accept modal (native date input, default +14 days) and Decline modal (optional Textarea)
- **RecommendationsBlock**: divider + header + count badge + grid with motion entrance animations; renders null when empty
- **TicketsPage**: `useRecommendations(tasks)` + `<RecommendationsBlock>` conditionally rendered only when `filter === 'attention'`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint] Fixed useRef hooks called after early return**
- **Found during:** Lint check after Task 2
- **Issue:** `RecommendationsBlock` had `useRef` calls after `if (recommendations.length === 0) return null` — violates react-hooks/rules-of-hooks
- **Fix:** Moved both `useRef` calls before the early return guard
- **Files modified:** `src/modules/tickets/components/RecommendationsBlock.tsx`
- **Commit:** `97d2022`

**Pre-existing lint errors (out of scope):** `TicketsPage.tsx` has 2 pre-existing `react-hooks/set-state-in-effect` errors (lines 45, 53) that existed before this task and are not caused by these changes. Logged to deferred scope.

## Known Stubs

None — all data flows from real `useClickUpTasks` data, recommendation filtering is live, and Edge Function actions target real ClickUp tasks.

## Verification

- `npm run build` — passes (zero TypeScript errors) across all 3 tasks
- `npx eslint` on new files — passes (0 errors after lint fix)
- Manual verification required (per plan): navigate to TicketsPage → Needs Attention tab with recommendation-tagged TO DO tasks present

## Self-Check: PASSED

Files created/modified verified present:
- `src/modules/tickets/hooks/useRecommendations.ts` — exists
- `src/modules/tickets/components/RecommendationCard.tsx` — exists
- `src/modules/tickets/components/RecommendationActions.tsx` — exists
- `src/modules/tickets/components/RecommendationsBlock.tsx` — exists
- All commits present: `2d7b73e`, `f8371b8`, `0463ac5`, `97d2022`
