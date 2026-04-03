---
phase: quick
plan: 260403-euc
subsystem: projects-module
tags: [optimistic-update, realtime, ux, projects]
dependency_graph:
  requires: []
  provides: [optimistic-project-cache-patch, step-open-button-hero]
  affects: [DynamicHero, StepActionBar]
tech_stack:
  added: []
  patterns: [queryClient.setQueryData optimistic patch before invalidateQueries]
key_files:
  created: []
  modified:
    - src/modules/projects/components/steps/StepActionBar.tsx
    - src/modules/projects/components/overview/DynamicHero.tsx
decisions:
  - "Optimistic patch reads activeAction before resetting it — closure captures current value correctly"
  - "StepStatus imported to type the conditional status assignment (avoids `as const` on conditional)"
  - "ghostCta added only to priority 3 — priority 4 (all done) has nothing to open"
metrics:
  duration: ~8min
  completed: 2026-04-03
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260403-euc: Fix Projects Module — Realtime Optimistic Update + Hero Öffnen Button

**One-liner:** Optimistic `queryClient.setQueryData` patch in StepActionBar makes DynamicHero update instantly after Freigeben/Änderungen, plus a "Aufgabe öffnen" ghost button for priority 3 hero state.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Optimistic project cache update after Freigeben/Änderungen | `26a1600` | StepActionBar.tsx |
| 2 | Add Öffnen button to DynamicHero priority 3 | `22e29ad` | DynamicHero.tsx |

## What Changed

### Task 1 — StepActionBar.tsx

The root cause of the stale CTA card: `onSuccess` called `invalidateQueries` immediately, but the `project_task_cache` row hadn't been updated yet (webhook arrives 1–3s later). The refetch returned the same data.

Fix: Before invalidating, apply an optimistic patch via `queryClient.setQueryData`:
- Finds the step by `clickupTaskId === taskId`
- Sets `rawStatus` to `'approved'` or `'in progress'` based on `activeAction`
- Sets `status` to `'committed'` or `'upcoming_locked'` as `StepStatus`
- Sets `isClientReview: false`
- Recalculates `tasksSummary.needsAttention` from the patched chapters

The `invalidateQueries` call is kept after the patch so real DB data syncs once the webhook arrives.

### Task 2 — DynamicHero.tsx

Added `ghostCta` to the priority 3 (IN VORBEREITUNG) content block:
```typescript
ghostCta: {
  label: 'Aufgabe öffnen',
  onClick: () => onOpenStep?.(upcomingStep.step.id),
},
```
The ghost button uses the existing `ghostCta` rendering path already present in the component. No new rendering code needed. `upcomingStep.step.id` is the ClickUp ID which `openStep()` in OverviewPage expects.

## Verification

- `npm run build` passes cleanly (16.42s, no TypeScript errors)
- Priority 1 (CLIENT REVIEW): "Öffnen & prüfen →" — unchanged
- Priority 2 (needsAttention > 0): "Aufgabe erstellen" — unchanged
- Priority 3 (upcoming_locked): "Aufgabe öffnen" ghost button — NEW
- Priority 4 (all done): no CTA — unchanged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript error: `as const` on conditional expression**
- **Found during:** Task 1 build verification
- **Issue:** `(isApprove ? 'committed' : 'upcoming_locked') as const` — TypeScript TS1355 error; `as const` cannot be applied to conditional expressions
- **Fix:** Imported `StepStatus` type and used `as StepStatus` instead
- **Files modified:** StepActionBar.tsx
- **Commit:** `26a1600` (included in same commit)

## Known Stubs

None.

## Self-Check: PASSED

- `src/modules/projects/components/steps/StepActionBar.tsx` — FOUND
- `src/modules/projects/components/overview/DynamicHero.tsx` — FOUND
- Commit `26a1600` — FOUND
- Commit `22e29ad` — FOUND
