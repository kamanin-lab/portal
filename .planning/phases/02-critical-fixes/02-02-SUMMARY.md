---
phase: 02-critical-fixes
plan: "02"
subsystem: projects-module
tags: [messages-page, live-data, eta-removal, crit-02, crit-03]
dependency_graph:
  requires: [02-01]
  provides: [live-messages-page, clean-team-status-strip]
  affects: [MessagesPage, NachrichtenPage, ContextStrip, transforms-project, project-types]
tech_stack:
  added: []
  patterns: [hook-at-page-level, conditional-rendering, data-prop-drilling]
key_files:
  created: []
  modified:
    - src/modules/projects/components/messages/MessagesPage.tsx
    - src/modules/projects/pages/NachrichtenPage.tsx
    - src/modules/projects/components/overview/ContextStrip.tsx
    - src/modules/projects/lib/transforms-project.ts
    - src/modules/projects/types/project.ts
    - src/modules/projects/lib/mock-data.ts
    - src/modules/projects/__tests__/memory-store.test.ts
key_decisions:
  - "MessagesPage now receives ProjectComment[] + isLoading props — hook called at NachrichtenPage level where project is available"
  - "eta field removed from TeamWorkingOn entirely — always-empty field replaced with conditional lastUpdate display"
  - "ContextStrip team status line hidden when teamWorkingOn.task is empty — no phantom status bars"
metrics:
  duration_seconds: 225
  completed_date: "2026-03-29"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 7
  files_deleted: 0
---

# Phase 02 Plan 02: MessagesPage Live Data and ETA Removal Summary

**One-liner:** Rewired /nachrichten page to use live useProjectComments hook (comment_cache) and removed the always-empty ETA field from ContextStrip team status display.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rewrite MessagesPage to use live useProjectComments data (CRIT-02) | 57fe253 | MessagesPage.tsx, NachrichtenPage.tsx |
| 2 | Remove broken ETA display from ContextStrip (CRIT-03) | ce5b883 | ContextStrip.tsx, transforms-project.ts, project.ts, mock-data.ts, memory-store.test.ts |

## What Was Built

**Task 1 — CRIT-02: MessagesPage live data**

The `/nachrichten` page previously read `step.messages[]` which was always `[]` — comments were never populated from that source. The fix:

- `NachrichtenPage.tsx` now calls `useProjectComments(project)` directly (the hook requires the `project` object, which is available at page level)
- `MessagesPage.tsx` completely rewritten: accepts `comments: ProjectComment[]` + `isLoading: boolean` props instead of `project: Project`
- Old dead pipeline (`project.chapters.flatMap → step.messages`) removed entirely
- Comments grouped by `taskId` with a `chapterTitle · stepTitle` section header above each group
- `CommentItem` renders avatar initial, author name, relative time (German: "gerade eben", "vor N Min.", "vor N Std.", "vor N Tagen"), and linkified comment text
- Loading skeleton shown during fetch; `EmptyState` shown when no comments exist
- All user-facing text in German (CLAUDE.md rule honored)

**Task 2 — CRIT-03: ETA removal**

The `teamWorkingOn.eta` field was always `''` — never populated anywhere. The fix:

- `TeamWorkingOn` interface: `eta: string` field removed from `project.ts`
- `transformToProject()`: `eta: ''` line removed from the `teamWorkingOn` return object
- `ContextStrip.tsx`: team status line now wrapped in `{teamWorkingOn.task && (...)}`; renders "Team arbeitet an **{task}** · Zuletzt aktiv: {date}" — no ETA segment; entire line hidden when no task is active

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale eta field in mock-data.ts**
- **Found during:** Task 2 build verification
- **Issue:** `src/modules/projects/lib/mock-data.ts` still had `eta: 'Donnerstag'` in the `teamWorkingOn` literal, causing TypeScript error after field removal
- **Fix:** Removed `eta` line from `mockProject.teamWorkingOn`
- **Files modified:** `src/modules/projects/lib/mock-data.ts`
- **Commit:** ce5b883

**2. [Rule 1 - Bug] Stale eta field in memory-store.test.ts**
- **Found during:** Task 2 build verification
- **Issue:** `src/modules/projects/__tests__/memory-store.test.ts` had `eta: ''` in the `Project` test fixture's `teamWorkingOn` object
- **Fix:** Removed `eta` from the test fixture
- **Files modified:** `src/modules/projects/__tests__/memory-store.test.ts`
- **Commit:** ce5b883

## Verification Results

- `npm run build` — passed, zero TypeScript errors, 757 modules transformed
- `npx vitest run src/modules/projects/` — 20/20 tests passing across 4 test files
- `grep "useProjectComments" NachrichtenPage.tsx` — match found (hook wired at page level)
- `grep "step.messages\|flatMap" MessagesPage.tsx` — no matches (dead pipeline gone)
- `grep "ProjectComment" MessagesPage.tsx` — match found (new type used)
- `grep "eta" project.ts` — no matches (field removed from type)
- `grep "eta" transforms-project.ts` — no matches (field removed from transform)
- `grep "ETA" ContextStrip.tsx` — no matches (display removed)
- `grep "Zuletzt aktiv" ContextStrip.tsx` — match found at line 36
- `grep "teamWorkingOn.task &&" ContextStrip.tsx` — match found at line 24

## Known Stubs

None — this plan wires live data and removes dead display code. No stubs introduced.

## Self-Check: PASSED

Files exist:
- FOUND: src/modules/projects/components/messages/MessagesPage.tsx
- FOUND: src/modules/projects/pages/NachrichtenPage.tsx
- FOUND: src/modules/projects/components/overview/ContextStrip.tsx
- FOUND: src/modules/projects/lib/transforms-project.ts
- FOUND: src/modules/projects/types/project.ts

Commits verified:
- FOUND: 57fe253 feat(02-02): rewrite MessagesPage to use live useProjectComments data (CRIT-02)
- FOUND: ce5b883 fix(02-02): remove broken ETA display from ContextStrip (CRIT-03)
