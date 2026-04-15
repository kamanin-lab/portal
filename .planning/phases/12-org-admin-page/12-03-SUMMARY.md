---
plan: 12-03
phase: 12-org-admin-page
status: complete
completed_at: 2026-04-15
subsystem: org-admin
tags: [organisation, team, invite, components, tdd]
dependency_graph:
  requires: [12-02]
  provides: [OrgInfoSection, TeamSection, InviteMemberDialog, OrganisationPage-wired]
  affects:
    - src/modules/organisation/components/OrgInfoSection.tsx
    - src/modules/organisation/components/TeamSection.tsx
    - src/modules/organisation/components/InviteMemberDialog.tsx
    - src/modules/organisation/pages/OrganisationPage.tsx
tech_stack:
  added: []
  patterns: [tdd-red-green, radix-dialog, supabase-functions-invoke, useQueryClient-invalidate]
key_files:
  created:
    - src/modules/organisation/components/OrgInfoSection.tsx
    - src/modules/organisation/components/TeamSection.tsx
    - src/modules/organisation/components/InviteMemberDialog.tsx
    - src/modules/organisation/__tests__/OrgInfoSection.test.tsx
    - src/modules/organisation/__tests__/TeamSection.test.tsx
    - src/modules/organisation/__tests__/InviteMemberDialog.test.tsx
  modified:
    - src/modules/organisation/pages/OrganisationPage.tsx
decisions:
  - Dialog.Title from Radix renders with role=heading — getByRole('heading') needed in TeamSection test to avoid ambiguity with button text
  - useCredits() returns { balance, packageName, creditsPerMonth, isLoading, pkg } — mock aligned to full shape
  - TeamSection test mocks useOrg + supabase + sonner to isolate from InviteMemberDialog dependencies
metrics:
  duration_seconds: 324
  completed_date: "2026-04-15"
  tasks_completed: 3
  files_changed: 7
---

# Phase 12 Plan 03: OrganisationPage UI Components Summary

**One-liner:** Built OrgInfoSection (read-only info card), TeamSection (member table + invite button), and InviteMemberDialog (Edge Function submit), wired into OrganisationPage replacing the Plan 12-02 stub.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | OrgInfoSection component + test | `f9bddef` | OrgInfoSection.tsx, OrgInfoSection.test.tsx |
| 2 | InviteMemberDialog component + test | `62b9e43` | InviteMemberDialog.tsx, InviteMemberDialog.test.tsx |
| 3 | TeamSection + wire OrganisationPage | `da3505f` | TeamSection.tsx, TeamSection.test.tsx, OrganisationPage.tsx |

## What Was Built

### OrgInfoSection (38 lines)

- Read-only card: org name, slug, credit balance from `useOrg()` + `useCredits()`
- Card shell: `bg-surface rounded-[14px] border border-border p-5` (matches D-03)
- Returns null when `organization` is null
- 3 tests: renders name, slug, credit balance

### InviteMemberDialog (93 lines)

- Radix `@radix-ui/react-dialog` shell (raw, no shadcn wrapper)
- Email input + role select (Mitglied/Betrachter)
- Submit calls `supabase.functions.invoke('invite-member', { body: { organizationId, email, role } })`
- Success: `toast.success` + `queryClient.invalidateQueries(['org-members'])` + `onClose()`
- Error: `toast.error` with Edge Function error message, dialog stays open
- 3 tests: renders input, correct payload, error toast

### TeamSection (70 lines)

- Member table: Name / E-Mail / Rolle / Hinzugefügt am columns (4-column grid)
- Loading state: "Lädt..."
- Empty state: "Noch keine Mitglieder vorhanden."
- Pending invite detection: `profile.full_name === null` → italic "Einladung ausstehend"
- "Mitglied einladen" button opens InviteMemberDialog via internal `useState`
- 5 tests: loading, empty, rows, pending invite, dialog open

### OrganisationPage (28 lines)

- Stub section removed, replaced with `<OrgInfoSection />` and `<TeamSection />`
- `useOrgMembers` import removed (now inside TeamSection)
- Admin guard unchanged

## Component Sizes

| Component | Lines | Limit |
|-----------|-------|-------|
| OrgInfoSection.tsx | 38 | 150 |
| InviteMemberDialog.tsx | 93 | 150 |
| TeamSection.tsx | 70 | 150 |
| OrganisationPage.tsx | 28 | 150 |

All within CLAUDE.md 150-line limit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TeamSection test assertion ambiguity after dialog open**
- **Found during:** Task 3 — GREEN phase
- **Issue:** After clicking "Mitglied einladen" button, `screen.getByText(/Mitglied einladen/)` found two elements: the button text and the Dialog.Title. Testing library threw `getMultipleElementsFoundError`.
- **Fix:** Changed assertion to `screen.getByRole('heading', { name: /Mitglied einladen/i })` — Dialog.Title renders with `role="heading"` in Radix, uniquely identifying the dialog title vs the button.
- **Files modified:** `src/modules/organisation/__tests__/TeamSection.test.tsx`
- **Commit:** included in `da3505f`

## Known Stubs

None — all components read live data from hooks. No hardcoded values or placeholder text flow to UI.

## TDD Gate Compliance

All three tasks followed RED → GREEN cycle:
- Task 1: Test written first (import error = RED) → OrgInfoSection implemented → 3 tests GREEN
- Task 2: Test written first (import error = RED) → InviteMemberDialog implemented → 3 tests GREEN
- Task 3: Test written first (import error = RED) → TeamSection implemented → 5 tests GREEN

## Manual QA Suggestion

1. Log in as admin user at `/organisation`
2. Verify OrgInfoSection shows org name, slug, and credit balance
3. Verify TeamSection shows member table with all columns
4. Click "Mitglied einladen" — dialog should open with email input and role select
5. Enter a new email and submit — should see success toast and new row appear (pending invite style)
6. Enter an existing member's email — should see error toast, dialog stays open

## Self-Check: PASSED

Files confirmed:
- `src/modules/organisation/components/OrgInfoSection.tsx` — exists, contains `bg-surface rounded-[14px] border border-border p-5`, `useOrg()`, `useCredits`
- `src/modules/organisation/components/TeamSection.tsx` — exists, contains `Mitglied einladen`, `Einladung ausstehend`, `Noch keine Mitglieder`
- `src/modules/organisation/components/InviteMemberDialog.tsx` — exists, contains `supabase.functions.invoke('invite-member'`, `queryClient.invalidateQueries({ queryKey: ['org-members'] })`, `organizationId: organization.id`
- `src/modules/organisation/pages/OrganisationPage.tsx` — imports and renders `<OrgInfoSection />` and `<TeamSection />`, no stub text
- All 3 test files exist

Commits confirmed:
- `f9bddef` — Task 1
- `62b9e43` — Task 2
- `da3505f` — Task 3

Build: `npm run build` passed (OrganisationPage-DuUtYMnE.js, 10.15s)
Tests: 11 new tests pass (3 + 3 + 5)
