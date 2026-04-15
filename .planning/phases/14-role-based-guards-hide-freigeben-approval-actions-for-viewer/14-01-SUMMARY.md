---
phase: 14-role-based-guards
plan: 01
subsystem: projects/steps
tags: [viewer-guard, tdd, role-based-access, StepActionBar]
dependency_graph:
  requires: []
  provides: [viewer-guard-StepActionBar]
  affects: [src/modules/projects/components/steps/StepActionBar.tsx]
tech_stack:
  added: []
  patterns: [useOrg-isViewer-guard, early-return-null-after-hooks]
key_files:
  created:
    - src/modules/projects/components/steps/__tests__/StepActionBar.test.tsx
  modified:
    - src/modules/projects/components/steps/StepActionBar.tsx
decisions:
  - "Guard placed after all hooks (useState, useQueryClient, useOrg, useTaskActions) per React rules of hooks — no conditional hook calls"
  - "Used isViewer early return pattern identical to TaskActions.tsx in tickets module for consistency"
metrics:
  duration: "4 minutes"
  completed: "2026-04-15T13:47:06Z"
  tasks_completed: 2
  files_modified: 2
requirements:
  - VIEWER-GUARD-FE-01
---

# Phase 14 Plan 01: StepActionBar Viewer Guard Summary

**One-liner:** Viewer-role guard added to StepActionBar via `useOrg().isViewer` early return, matching the existing TaskActions.tsx pattern.

## What Was Built

Added a role-based guard to `StepActionBar` in the projects module. Viewers (org role = "viewer") now see an empty DOM where the "Bereit für Ihre Prüfung" heading and Freigeben / Änderungen anfragen buttons would otherwise appear.

This closes a parity gap between the projects module (where the guard was missing) and the tickets module (where `TaskActions.tsx` already had the identical guard since Phase 11).

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED  | `b495905` `test(14-01): add failing viewer guard tests for StepActionBar` | PASSED — 1 test failed, 1 passed as expected |
| GREEN | `00c7df2` `feat(14-01): add viewer guard to StepActionBar` | PASSED — 2/2 tests pass |
| REFACTOR | — | Skipped — no structural refactor needed, pattern is identical to TaskActions |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `b495905` | test | RED phase — failing viewer guard tests for StepActionBar |
| `00c7df2` | feat | GREEN phase — viewer guard implementation |

## Implementation Details

**Changes to `StepActionBar.tsx`** (4 lines added):
1. Import: `import { useOrg } from '@/shared/hooks/useOrg'`
2. Hook call (after `useQueryClient`): `const { isViewer } = useOrg()`
3. Guard (after all hooks, before `handleSubmit`): `if (isViewer) return null`

**Test coverage (`StepActionBar.test.tsx`):**
- `renders nothing when isViewer is true` — verifies `container` is empty DOM element
- `renders action bar when isViewer is false` — verifies `container` is not empty

## Verification Results

```
StepActionBar viewer guard
  ✓ renders nothing when isViewer is true
  ✓ renders action bar when isViewer is false

Test Files  1 passed (1)
Tests       2 passed (2)
```

Full suite: 6 pre-existing failures (MeineAufgabenPage, OrgInfoSection, task-list-utils) — confirmed present before this plan's changes, out of scope.

Build: `✓ built in 10.84s` — TypeScript clean, no errors.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None — no new network endpoints or auth paths introduced. Guard is defense-in-depth UI layer; server-side RLS on `update-task-status` Edge Function remains the authoritative enforcement point (T-14-01 mitigated as planned).

## Self-Check: PASSED

- [x] `src/modules/projects/components/steps/__tests__/StepActionBar.test.tsx` — exists
- [x] `src/modules/projects/components/steps/StepActionBar.tsx` — contains `if (isViewer) return null`
- [x] Commit `b495905` exists (RED)
- [x] Commit `00c7df2` exists (GREEN)
- [x] 2 tests pass
- [x] Build succeeds
