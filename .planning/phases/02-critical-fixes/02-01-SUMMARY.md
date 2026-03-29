---
phase: 02-critical-fixes
plan: "01"
subsystem: projects-module
tags: [dead-code-removal, type-cleanup, ui-guard, crit-01, crit-04]
dependency_graph:
  requires: []
  provides: [clean-project-type, empty-section-guard]
  affects: [StepOverviewTab, transforms-project, project-types, helpers]
tech_stack:
  added: []
  patterns: [early-return-null-guard, type-surface-reduction]
key_files:
  created: []
  modified:
    - src/modules/projects/types/project.ts
    - src/modules/projects/lib/transforms-project.ts
    - src/modules/projects/lib/helpers.ts
    - src/modules/projects/components/steps/StepOverviewTab.tsx
    - src/modules/projects/components/steps/StepDetail.tsx
    - src/modules/projects/lib/mock-data.ts
    - src/modules/projects/__tests__/memory-store.test.ts
  deleted:
    - src/modules/projects/components/tasks/TasksPage.tsx
key_decisions:
  - "TasksPage and its entire pipeline (ProjectTask, TaskStatus, getTasksForStep, taskStatusLabel) removed — confirmed never routed in routes.tsx"
  - "ExpandableSection returns null when body is empty/whitespace — prevents blank expandable sections in StepOverviewTab"
  - "StepOverviewTab now takes projectId string instead of full Project object — minimal dependency"
metrics:
  duration_seconds: 284
  completed_date: "2026-03-29"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 7
  files_deleted: 1
---

# Phase 02 Plan 01: Dead Code Removal and Empty Section Guard Summary

**One-liner:** Removed 5-part TasksPage dead pipeline (types, transform, helpers, component) and added early-return null guard to ExpandableSection to prevent blank UI sections from rendering.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Remove dead TasksPage pipeline (CRIT-01) | a6fa919 | types/project.ts, transforms-project.ts, helpers.ts, TasksPage.tsx (deleted) |
| 2 | Guard empty enrichment sections in StepOverviewTab (CRIT-04) | 6bba98d | StepOverviewTab.tsx, StepDetail.tsx, mock-data.ts, memory-store.test.ts |

## What Was Built

**Task 1 — CRIT-01: Dead TasksPage pipeline removal**

The `TasksPage` component was never routed in `routes.tsx` and `project.tasks` was always `[]`. The pipeline was:
- `type TaskStatus` and `interface ProjectTask` in `types/project.ts` — removed
- `tasks: ProjectTask[]` on the `Project` interface — removed
- `tasks: [] as ProjectTask[]` in `transformToProject()` — removed
- `getTasksForStep()` and `taskStatusLabel()` in `helpers.ts` — removed
- `TasksPage.tsx` component file — deleted entirely

**Task 2 — CRIT-04: Empty enrichment section guard**

`ExpandableSection` now returns `null` when `body` is empty or whitespace-only. This prevents blank expand-collapse sections from rendering in `StepOverviewTab` when AI enrichment fields (`whyItMatters`, `whatBecomesFixed`, `description`) are empty strings.

Additionally, `StepOverviewTab` no longer depends on the full `Project` type — it now receives `projectId: string` instead, reducing its type footprint. The entire linked-tasks section (dead since `project.tasks` was always `[]`) was removed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed tasks field in mock-data.ts**
- **Found during:** Task 2 build verification
- **Issue:** `src/modules/projects/lib/mock-data.ts` still had `tasks: [...]` array which TypeScript rejected after removing the field from `Project`
- **Fix:** Removed the `tasks` array from `mockProject` literal
- **Files modified:** `src/modules/projects/lib/mock-data.ts`
- **Commit:** 6bba98d

**2. [Rule 1 - Bug] Fixed tasks field in memory-store.test.ts**
- **Found during:** Task 2 build verification
- **Issue:** `src/modules/projects/__tests__/memory-store.test.ts` had `tasks: []` in the `Project` test fixture
- **Fix:** Removed the field from the test fixture
- **Files modified:** `src/modules/projects/__tests__/memory-store.test.ts`
- **Commit:** 6bba98d

## Verification Results

- `npm run build` — passed, zero TypeScript errors, 757 modules transformed
- `npx vitest run src/modules/projects/` — 20/20 tests passing across 4 test files
- `grep -r "ProjectTask\|TaskStatus\|getTasksForStep\|taskStatusLabel" src/modules/projects/` — CLEAN (no matches excluding `ProjectTaskCacheRow` and `tasksSummary`)
- `grep "body.trim()" StepOverviewTab.tsx` — guard present at line 63

## Known Stubs

None — this plan removes dead code and adds a guard. No stubs introduced.

## Self-Check: PASSED

Files exist:
- FOUND: src/modules/projects/types/project.ts
- FOUND: src/modules/projects/lib/transforms-project.ts
- FOUND: src/modules/projects/lib/helpers.ts
- FOUND: src/modules/projects/components/steps/StepOverviewTab.tsx
- FOUND: src/modules/projects/components/steps/StepDetail.tsx
- NOT FOUND (deleted): src/modules/projects/components/tasks/TasksPage.tsx (correct)

Commits verified:
- FOUND: a6fa919 feat(02-01): remove dead TasksPage data pipeline (CRIT-01)
- FOUND: 6bba98d fix(02-01): guard empty enrichment sections in StepOverviewTab (CRIT-04)
