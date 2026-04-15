---
phase: 11-org-frontend-auth
plan: "04"
subsystem: tickets-frontend
tags: [viewer-guard, rbac, org-frontend-auth]
dependency_graph:
  requires: [11-02]
  provides: [ORG-FE-AUTH-04, ORG-FE-AUTH-05, ORG-FE-AUTH-06]
  affects: [TaskActions, CreditApproval, TicketsPage]
tech_stack:
  added: []
  patterns: [inline-viewer-guard, useOrg-hook]
key_files:
  created:
    - src/modules/tickets/__tests__/TaskActions.test.tsx
    - src/modules/tickets/__tests__/CreditApproval.test.tsx
    - src/modules/tickets/__tests__/TicketsPage.viewer.test.tsx
  modified:
    - src/modules/tickets/components/TaskActions.tsx
    - src/modules/tickets/components/CreditApproval.tsx
    - src/modules/tickets/pages/TicketsPage.tsx
decisions:
  - "Guard placed after all hook calls in CreditApproval (Rules of Hooks compliance)"
  - "TicketsPage pre-existing 155-line count noted; file is 157 lines after changes (pre-existing violation, not introduced here)"
metrics:
  duration: "~15 min"
  completed: "2026-04-15"
  tasks_completed: 2
  tasks_pending: 1
  files_changed: 6
---

# Phase 11 Plan 04: Viewer-Role Guards Summary

One-liner: Inline `isViewer` guards added to TaskActions, CreditApproval, and TicketsPage — viewer-role users see none of the three action surfaces.

## Tasks Completed

### Task 1: Viewer guard on TaskActions and CreditApproval

**TaskActions.tsx diff:**
- Added `import { useOrg } from '@/shared/hooks/useOrg'`
- Added `const { isViewer } = useOrg()` after `useTaskActions()` destructure
- Added `if (isViewer) return null` after the existing `isTerminal` early return

**CreditApproval.tsx diff:**
- Added `import { useOrg } from '@/shared/hooks/useOrg'`
- Added `const { isViewer } = useOrg()` at top of function body
- Added `if (isViewer) return null` after all hook calls (useState, useTaskActions, usePostComment) — placed here to comply with React Rules of Hooks

**Tests created:** `TaskActions.test.tsx`, `CreditApproval.test.tsx` — 4 tests total, all passing.

### Task 2: Viewer guard on TicketsPage NewTaskButton

**TicketsPage.tsx diff:**
- Added `import { useOrg } from '@/shared/hooks/useOrg'`
- Added `const { isViewer } = useOrg()` alongside other hook calls
- Changed `<NewTaskButton onClick={...} />` to `{!isViewer && <NewTaskButton onClick={...} />}`

**Tests created:** `TicketsPage.viewer.test.tsx` — 2 tests, both passing.

## Test Results

```
Test Files  3 passed (3)
Tests       6 passed (6)
```

All 6 new tests pass. Build: clean (772 modules, 0 errors).

## Commit

`6723957` — feat(org): add viewer-role guards to TaskActions, CreditApproval, TicketsPage (Phase 11-04)

## Deviations from Plan

**1. [Rule 2 - Correctness] Guard moved after hook calls in CreditApproval**
- Found during: Task 1
- Issue: Plan spec showed `if (isViewer) return null` immediately after `const { isViewer } = useOrg()`, before `useState` calls. This violates React Rules of Hooks (conditional return before hook calls).
- Fix: Moved `if (isViewer) return null` to after all four hook calls (useOrg, useState x2, useTaskActions, usePostComment). Functionally identical — guard still returns null for viewers.
- Files modified: `src/modules/tickets/components/CreditApproval.tsx`
- Commit: `6723957`

**2. [Rule 1 - Pre-existing] TicketsPage line count**
- TicketsPage.tsx was already 155 lines before this plan (pre-existing CLAUDE.md violation). After the 2-line addition (import + hook call), it is 157 lines. This violation was not introduced by this plan. Tracked for future refactor.

## Task 3: Pending Human Verification

**Task 3 requires manual staging verification** — it is a `checkpoint:human-verify` gate and was NOT executed by this agent.

What needs to be done:
1. Push to staging: `git push origin staging`
2. On staging Cloud Supabase (`ahlthosftngdcryltapu`), set a test user to `role = 'viewer'` in `org_members`
3. Log in as viewer on https://staging.portal.kamanin.at — verify `/tickets` shows no "Neue Aufgabe" button, no TaskActions, no CreditApproval
4. Log in as admin/member — verify all three are visible
5. Restore original role and type "approved" to resume

See `.planning/phases/11-org-frontend-auth/11-04-PLAN.md` Task 3 for full checklist.

## Self-Check

- [x] TaskActions.tsx contains `import { useOrg }`, `const { isViewer } = useOrg()`, `if (isViewer) return null`
- [x] CreditApproval.tsx contains same three literals
- [x] TicketsPage.tsx contains `import { useOrg }`, `const { isViewer } = useOrg()`, `!isViewer && <NewTaskButton`
- [x] All 3 test files exist and pass
- [x] Build exits 0
- [x] Commit `6723957` exists
