---
plan: 12-02
phase: 12-org-admin-page
status: complete
completed_at: 2026-04-15
subsystem: org-admin
tags: [routing, auth-guard, sidebar, hooks, organisation]
dependency_graph:
  requires: [12-01]
  provides: [organisation-route, useOrgMembers, admin-sidebar-link, password-recovery-fix]
  affects: [src/shared/hooks/useAuth.ts, src/app/routes.tsx, src/shared/components/layout/SidebarUtilities.tsx]
tech_stack:
  added: []
  patterns: [admin-guard-with-navigate, lazy-route-import, useQuery-org-scoped, conditional-sidebar-link]
key_files:
  created:
    - src/modules/organisation/hooks/useOrgMembers.ts
    - src/modules/organisation/pages/OrganisationPage.tsx
  modified:
    - src/shared/hooks/useAuth.ts
    - src/app/routes.tsx
    - src/shared/components/layout/SidebarUtilities.tsx
decisions:
  - Building05Icon confirmed present in @hugeicons/core-free-icons (no fallback needed)
  - PASSWORD_RECOVERY redirect fixed in onAuthStateChange only — resetPassword() at line 179 retains /konto?action=change-password for voluntary resets
  - /organisation route placed after /konto, no WorkspaceGuard (org-level not workspace-scoped)
  - Sidebar link inserted between /hilfe and /konto in Utilities zone
metrics:
  duration_seconds: 168
  completed_date: "2026-04-15"
  tasks_completed: 2
  files_changed: 5
---

# Phase 12 Plan 02: Foundation — useAuth fix, useOrgMembers, OrganisationPage shell

**One-liner:** Fixed PASSWORD_RECOVERY redirect to /passwort-setzen, created typed useOrgMembers hook, wired admin-only /organisation route with guard and sidebar link.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix useAuth PASSWORD_RECOVERY + create useOrgMembers | `1647034` | useAuth.ts, useOrgMembers.ts |
| 2 | OrganisationPage shell + route + sidebar link | `8509db3` | OrganisationPage.tsx, routes.tsx, SidebarUtilities.tsx |

## What Was Built

### Task 1 — useAuth fix + useOrgMembers hook

**useAuth.ts** (line 110-113): `PASSWORD_RECOVERY` event now redirects to `/passwort-setzen` instead of `/konto?action=change-password`. The `resetPassword()` function at line 179 is unchanged — voluntary password resets via /konto still embed the old redirectTo in the GoTrue link.

**useOrgMembers.ts** (`src/modules/organisation/hooks/useOrgMembers.ts`):
- React Query hook keyed on `['org-members', organization?.id]`
- Fetches `org_members` with embedded `profile:profiles(id, email, full_name)` join
- Filters by `organization_id`, orders by `created_at ASC`
- Disabled when `organization?.id` is falsy — returns `[]`
- Silent error handling: Supabase error returns `[]` (no throw)
- `staleTime: 2 * 60 * 1000` (2 minutes)
- Exports `OrgMember` interface with `profile` nullable sub-object

### Task 2 — OrganisationPage + route + sidebar

**OrganisationPage.tsx** (`src/modules/organisation/pages/OrganisationPage.tsx`):
- `ContentContainer width="narrow"` per CLAUDE.md rule 11
- Admin guard: `if (isLoading) return null` → `if (!isAdmin && !isLoading) return <Navigate to="/tickets" replace />`
- Stub section shows member count from `useOrgMembers` — will be replaced in Plan 12-03
- 30 lines (well within 150-line limit)

**routes.tsx** (`src/app/routes.tsx`):
- Lazy import of `OrganisationPage` added after `KontoPage`
- `<Route path="/organisation" element={withRouteLoading(<OrganisationPage />)} />` inside ProtectedRoute/AppShell — no WorkspaceGuard

**SidebarUtilities.tsx** (`src/shared/components/layout/SidebarUtilities.tsx`):
- Added `Building05Icon` import from `@hugeicons/core-free-icons` (confirmed present)
- Added `useOrg` import
- `const { isAdmin } = useOrg()` at component top
- Admin-conditional NavLink `to="/organisation"` inserted between /hilfe and /konto
- Text: "Ihre Organisation" (German, per D-20)
- Same styling pattern as existing Utilities NavLinks

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| Member count section | OrganisationPage.tsx | 24-28 | Placeholder for TeamSection (Plan 12-03); shows fetched member count from live useOrgMembers data — not purely fake, but not the final UI |

The stub renders live data (`members.length`) from `useOrgMembers`, so it is functional. It will be replaced by `OrgInfoSection` + `TeamSection` in Plan 12-03.

## Self-Check: PASSED

Files confirmed:
- `src/shared/hooks/useAuth.ts` — contains `/passwort-setzen` at line 112
- `src/modules/organisation/hooks/useOrgMembers.ts` — exists, contains required literals
- `src/modules/organisation/pages/OrganisationPage.tsx` — exists, admin guard present
- `src/app/routes.tsx` — contains `path="/organisation"` and lazy import
- `src/shared/components/layout/SidebarUtilities.tsx` — contains `Ihre Organisation` and `{isAdmin && (`

Commits confirmed:
- `1647034` — Task 1
- `8509db3` — Task 2

Build: `npm run build` passed (OrganisationPage-3fqGEMvC.js in output, 10.08s)
