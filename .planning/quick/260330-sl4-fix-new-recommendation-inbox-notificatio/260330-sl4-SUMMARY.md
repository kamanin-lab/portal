---
id: 260330-sl4
phase: quick
plan: 260330-sl4
subsystem: notifications
tags: [notifications, db-migration, typescript, inbox]
dependency_graph:
  requires: [260330-nsg, 260330-mp6]
  provides: [new_recommendation-inbox-display]
  affects: [notifications-table, TypeBadge, Notification-interface]
tech_stack:
  added: []
  patterns: [db-constraint-migration, ts-union-extension, conditional-badge-styling]
key_files:
  created: []
  modified:
    - src/modules/tickets/types/tasks.ts
    - src/shared/components/inbox/TypeBadge.tsx
    - docs/system-context/DATABASE_SCHEMA.md
decisions:
  - TypeBadge uses amber-500/10 + amber-600 for new_recommendation — consistent with RecommendationApproval amber-400/40 palette
metrics:
  duration: 8m
  completed: "2026-03-30"
  tasks: 2
  files: 3
---

# Quick Task 260330-sl4: Fix new_recommendation inbox notifications — Summary

**One-liner:** Extended notifications DB constraint, Notification TypeScript union, and TypeBadge component to fully support new_recommendation type with amber "Empfehlung" badge.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | DB migration + frontend code fixes | `e9d528b` | tasks.ts, TypeBadge.tsx |
| 2 | Update DATABASE_SCHEMA.md documentation | `5c6e415` | DATABASE_SCHEMA.md |

## What Was Done

### Task 1: DB migration + frontend code fixes

**DB migration (live production):**
- Dropped old `notifications_type_check` constraint (which only covered `team_reply` and `status_change` — already outdated)
- Added updated constraint: `CHECK (type = ANY (ARRAY['team_reply','status_change','step_ready','project_reply','project_update','new_recommendation']))`
- Verified via SQL query — constraint definition confirmed to include `new_recommendation`

**Frontend type (`src/modules/tickets/types/tasks.ts` line 147):**
- Added `| 'new_recommendation'` to the `Notification.type` union

**TypeBadge (`src/shared/components/inbox/TypeBadge.tsx`):**
- Added `isRecommendation` boolean check
- Added amber color branch: `bg-amber-500/10 text-amber-600`
- Added German label: `'Empfehlung'` for `new_recommendation` type

### Task 2: DATABASE_SCHEMA.md documentation

- Updated type column constraint note from outdated "(team_reply or status_change)" to "(see constraint below)"
- Updated Type Check Constraint note to list all six allowed values accurately

## Verification

- `npx tsc --noEmit` — clean, no errors
- `npm run build` — clean production build (11.03s)
- DB constraint query confirmed `new_recommendation` in ARRAY
- grep confirmed `new_recommendation` in tasks.ts
- grep confirmed `Empfehlung` in TypeBadge.tsx
- grep confirmed `new_recommendation` in DATABASE_SCHEMA.md

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

Files confirmed:
- `src/modules/tickets/types/tasks.ts` — FOUND, contains new_recommendation
- `src/shared/components/inbox/TypeBadge.tsx` — FOUND, contains Empfehlung
- `docs/system-context/DATABASE_SCHEMA.md` — FOUND, contains new_recommendation

Commits confirmed:
- `e9d528b` — FOUND
- `5c6e415` — FOUND
