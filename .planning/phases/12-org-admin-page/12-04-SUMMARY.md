---
plan: 12-04
phase: 12-org-admin-page
status: complete
completed_at: 2026-04-15
subsystem: org-admin
tags: [organisation, team, member-actions, tdd, radix-dropdown, confirm-dialog]
dependency_graph:
  requires: [12-03]
  provides: [MemberRowActions, useMemberActions]
  affects:
    - src/modules/organisation/hooks/useMemberActions.ts
    - src/modules/organisation/components/MemberRowActions.tsx
    - src/modules/organisation/components/TeamSection.tsx
tech_stack:
  added: []
  patterns: [tdd-red-green, radix-dropdown-menu, supabase-direct-write, useQueryClient-invalidate]
key_files:
  created:
    - src/modules/organisation/hooks/useMemberActions.ts
    - src/modules/organisation/components/MemberRowActions.tsx
    - src/modules/organisation/__tests__/useMemberActions.test.ts
    - src/modules/organisation/__tests__/MemberRowActions.test.tsx
  modified:
    - src/modules/organisation/components/TeamSection.tsx
    - src/modules/organisation/__tests__/TeamSection.test.tsx
decisions:
  - MemberRowActions returns null for self-row (profile_id === user.id) and admin rows — UI-level guard, hooks enforce server-level guards
  - MoreHorizontalIcon from @hugeicons/core-free-icons used for ··· trigger button
  - Radix DropdownMenu in jsdom requires fireEvent.pointerDown + fireEvent.click sequence to open — added openDropdown() helper in test
  - TeamSection test needed useAuth + useMemberActions mocks after MemberRowActions was added as child
metrics:
  duration_seconds: 450
  completed_date: "2026-04-15"
  tasks_completed: 2
  files_changed: 6
---

# Phase 12 Plan 04: Member Row Actions Summary

**One-liner:** Added ··· action menu to each TeamSection row with Rolle ändern (member↔viewer toggle) and Entfernen (ConfirmDialog), guarded by last-admin and self-as-last-admin checks via direct Supabase writes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | useMemberActions hook + tests (TDD) | `2b8aa45` | useMemberActions.ts, useMemberActions.test.ts |
| 2 | MemberRowActions component + TeamSection integration + tests (TDD) | `dfe95c7` | MemberRowActions.tsx, MemberRowActions.test.tsx, TeamSection.tsx, TeamSection.test.tsx |

## What Was Built

### useMemberActions hook (55 lines)

- `changeRole({ memberId, nextRole })`: direct `supabase.from('org_members').update({ role }).eq('id', memberId)`
- `removeMember({ memberId })`: direct `supabase.from('org_members').delete().eq('id', memberId)`
- Guards:
  - `changeRole`: rejects if target is admin and adminCount ≤ 1 (last admin protection)
  - `removeMember`: rejects if self is admin and adminCount ≤ 1 (self-as-last-admin protection)
- Both mutations: toast.success/error + `queryClient.invalidateQueries({ queryKey: ['org-members'] })`
- 4 tests pass (RED → GREEN)

### MemberRowActions component (76 lines)

- Raw Radix `@radix-ui/react-dropdown-menu` (same pattern as NotificationBell.tsx)
- Trigger: `MoreHorizontalIcon` (··· horizontal dots), `aria-label="Aktionen"`
- Menu items:
  - "Rolle ändern (zu Betrachter/zu Mitglied)": calls `changeRole` with toggled role
  - "Entfernen": opens `ConfirmDialog` (destructive=true) → calls `removeMember` on confirm
- UI-level guards:
  - Returns null for current user's own row (`profile_id === user.id`)
  - Returns null for admin rows (role change on admins not supported via this menu)
- 4 tests pass (RED → GREEN)

### TeamSection updates

- Grid extended: `grid-cols-[1fr_1fr_120px_100px]` → `grid-cols-[1fr_1fr_120px_100px_40px]` (header + all rows)
- Empty 5th header cell `<span></span>` for alignment
- `<MemberRowActions member={m} members={members} />` rendered in 5th cell of each row
- Import added: `import { MemberRowActions } from './MemberRowActions'`

## Component Sizes

| Component | Lines | Limit |
|-----------|-------|-------|
| useMemberActions.ts | 55 | 150 |
| MemberRowActions.tsx | 76 | 150 |
| TeamSection.tsx | 72 | 150 |

All within CLAUDE.md 150-line limit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Radix DropdownMenu not opening in jsdom with fireEvent.click**
- **Found during:** Task 2 — GREEN phase (MemberRowActions tests 2-4 failing)
- **Issue:** Radix DropdownMenu.Trigger requires pointer events to open in jsdom. Plain `fireEvent.click` leaves `data-state="closed"`.
- **Fix:** Added `openDropdown()` helper in test using `fireEvent.pointerDown` + `fireEvent.click` sequence. Also wrapped in `act()` for React state flush.
- **Files modified:** `src/modules/organisation/__tests__/MemberRowActions.test.tsx`
- **Commit:** included in `dfe95c7`

**2. [Rule 2 - Missing mock] TeamSection tests failing after MemberRowActions child added**
- **Found during:** Task 2 — integration step (TeamSection test GREEN verification)
- **Issue:** MemberRowActions calls `useAuth()` which throws "muss innerhalb von AuthProvider" when not mocked. TeamSection test had no `useAuth` mock.
- **Fix:** Added `vi.mock('@/shared/hooks/useAuth', ...)` and `vi.mock('../hooks/useMemberActions', ...)` to TeamSection test — minimal mocks to isolate TeamSection from MemberRowActions internals.
- **Files modified:** `src/modules/organisation/__tests__/TeamSection.test.tsx`
- **Commit:** included in `dfe95c7`

## Known Stubs

None — MemberRowActions reads live data from `useMemberActions` hook which writes directly to Supabase. No hardcoded values or placeholder text.

## TDD Gate Compliance

Both tasks followed RED → GREEN cycle:
- Task 1: Test written first (import error = RED) → useMemberActions implemented → 4 tests GREEN
- Task 2: Test written first (import error = RED) → MemberRowActions implemented → 4 tests GREEN, then TeamSection mocks fixed

TDD gate commits:
1. `2b8aa45` — feat (Task 1 combined: test + impl in TDD sequence)
2. `dfe95c7` — feat (Task 2 combined: test + impl + integration)

## Staging QA Notes

Manual verification steps for admin at `/organisation`:
1. Log in as admin user
2. Navigate to `/organisation`
3. Verify non-self, non-admin rows show `···` button on right
4. Verify own row and admin rows have no `···` button
5. Click `···` on a member row → dropdown shows "Rolle ändern (zu Betrachter)" and "Entfernen"
6. Click "Rolle ändern" → role column updates, success toast appears
7. Click `···` → "Rolle ändern (zu Mitglied)" now shows (toggled)
8. Click "Entfernen" → ConfirmDialog opens with member name
9. Click "Abbrechen" → dialog closes, no change
10. Click "Entfernen" → confirm → row disappears, success toast

RLS policies (Plan 12-01) permit UPDATE/DELETE on `org_members` for admin role — verified in staging.

## Self-Check: PASSED

Files confirmed:
- `src/modules/organisation/hooks/useMemberActions.ts` — exists, contains `supabase.from('org_members').update({ role: nextRole }).eq('id', memberId)`, `supabase.from('org_members').delete().eq('id', memberId)`, `queryClient.invalidateQueries({ queryKey: ['org-members'] })`, `Cannot demote last admin`
- `src/modules/organisation/components/MemberRowActions.tsx` — exists (76 lines ≤ 150), contains `DropdownMenu.Root`, `Rolle ändern`, `Entfernen`, `if (member.profile_id === user?.id) return null`, `ConfirmDialog`
- `src/modules/organisation/components/TeamSection.tsx` — imports `MemberRowActions`, grid contains `_40px]`
- All test files exist

Commits confirmed:
- `2b8aa45` — Task 1 (useMemberActions hook + tests)
- `dfe95c7` — Task 2 (MemberRowActions + TeamSection)

Build: `npm run build` passed (OrganisationPage-y4wU1uwH.js, 10.72s)
Tests: 8 new tests pass; all 19 org tests green
