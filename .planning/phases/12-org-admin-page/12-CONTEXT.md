---
phase: 12
slug: org-admin-page
status: ready
created: 2026-04-15
---

# Phase 12: org-admin-page — Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the `/organisation` admin page and the `/passwort-setzen` invite-landing route.
Deliverables:
1. **DB migration** — RLS write policies for `org_members` (admin-read-all, admin-update-role, admin-delete-member) + admin-read for `organizations`
2. **`OrganisationPage`** at `/organisation` — admin-only, redirects non-admins to `/tickets`
   - `OrgInfoSection` — read-only card: org name, slug, credit package + balance
   - `TeamSection` — member table (Name, Email, Rolle, Hinzugefügt am) + "Mitglied einladen" button
3. **`InviteMemberDialog`** — email + role (Mitglied / Betrachter), posts to `invite-member` Edge Function
4. **Row action menu (···)** per member row — "Rolle ändern" and "Entfernen" actions
   - Role change: Mitglied ↔ Betrachter; cannot demote self or last admin
   - Removal: confirmation dialog required; cannot remove self if last admin
5. **`/passwort-setzen`** route — outside ProtectedRoute; reads GoTrue recovery token from URL hash; shows password form; redirects to `/tickets` on success
6. **Sidebar "Ihre Organisation" link** in Utilities zone — admin-only, Hugeicons building icon
7. **Fix `useAuth.ts` PASSWORD_RECOVERY redirect** — change from `/konto?action=change-password` to `/passwort-setzen`

Phase 11 (OrgProvider, useOrg, viewer guards) is complete and live.
Phase 13 (cleanup, script rewrite, drop legacy columns) comes after.

</domain>

<decisions>
## Implementation Decisions

### Layout & Visual Design (user-confirmed)
- **D-01:** `ContentContainer width="narrow"` on OrganisationPage — consistent with KontoPage, TicketsPage
- **D-02:** Two card sections — `OrgInfoSection` (read-only) above `TeamSection` (table)
- **D-03:** Section card pattern: `<section className="bg-surface rounded-[14px] border border-border p-5">` — mirror ProfileSection in KontoPage
- **D-04:** Row action menu (···) per member — Radix `DropdownMenu` (raw, not shadcn wrapper). Pattern: NotificationBell.tsx already uses raw Radix dropdown.
- **D-05:** Confirmation dialog for member removal — reuse/mirror existing `ConfirmDialog` component

### Routing & Guards
- **D-06:** `/organisation` is inside `AppShell` (protected). Admin guard: `const { isAdmin } = useOrg()` at top of OrganisationPage; if `!isAdmin && !isLoading` → `<Navigate to="/tickets" replace />`
- **D-07:** `/passwort-setzen` is OUTSIDE ProtectedRoute — placed at the same level as `/login` in routes.tsx; reuses LoginPage visual shell (centered card + KAMANIN logo)
- **D-08:** Fix `useAuth.ts` line ~110 `PASSWORD_RECOVERY` case — change redirect target from `/konto?action=change-password` to `/passwort-setzen`. Voluntary password reset via `/konto` is unaffected (those links embed `redirectTo` in the GoTrue link itself).

### Data & API
- **D-09:** `OrgInfoSection` reads from `useOrg().organization` (Phase 11) + `useCredits()` (Phase 11) — zero new data fetching needed
- **D-10:** `useOrgMembers` hook — `useQuery` keyed `['org-members', organization?.id]`, fetches `org_members` joined with `profiles` (id, full_name, email) and `auth.users` email fallback. Pending invite detection: `profiles.full_name IS NULL` → show "Einladung ausstehend" in Rolle column
- **D-11:** Role change: `supabase.from('org_members').update({ role }).eq('id', memberId)` — requires admin UPDATE policy (migration)
- **D-12:** Member removal: `supabase.from('org_members').delete().eq('id', memberId)` — requires admin DELETE policy (migration)
- **D-13:** Invite: POST to `invite-member` Edge Function with `{ email, role, org_id }` payload

### DB Migration (Plan 1 blocker)
- **D-14:** Add to staging via Management API (same pattern as Phase 11 Plan 01):
  - `org_members`: SELECT policy for admins reading all org rows
  - `org_members`: UPDATE policy for admins changing roles  
  - `org_members`: DELETE policy for admins removing members
  - Guard: `user_org_role()` function (from Phase 9) returns 'admin' for current user in that org

### /passwort-setzen Implementation
- **D-15:** On mount, call `supabase.auth.getSession()` — if recovery token in URL hash, GoTrue auto-exchanges it for a session. Listen on `onAuthStateChange` for `PASSWORD_RECOVERY` event as fallback.
- **D-16:** Form: two fields (Neues Passwort, Passwort bestätigen), client-side match validation, calls `supabase.auth.updateUser({ password })`, then `navigate('/tickets')`
- **D-17:** Error states: token expired → show "Link abgelaufen" with link back to login

### Sidebar
- **D-18:** Add to Utilities zone in `Sidebar.tsx` — conditional on `isAdmin`. Icon: `Building05Icon` or closest Hugeicons building/office variant (verify import at build time).

### Component Size
- **D-19:** All components ≤ 150 lines (CLAUDE.md rule). Extract sub-components if needed: `MemberRow`, `RoleChangeMenuItem`, `RemoveMemberMenuItem`

### German UI
- **D-20:** All user-facing strings in German — "Ihre Organisation", "Mitglied einladen", "Rolle ändern", "Entfernen", "Einladung ausstehend", "Passwort festlegen", "Link abgelaufen"

### Claude's Discretion
- Exact Hugeicons icon name for building/office (verify at build time — use `Building05Icon` as primary attempt)
- `staleTime` for `useOrgMembers` — 2 minutes (members change infrequently)
- Toast messages for each action (success/error)
- Whether to optimistically update the member list after role change or full refetch

</decisions>

<specifics>
## Critical Pre-conditions

1. **DB migration must run first** (Plan 1) — without admin RLS policies, the team table query returns empty for admins
2. **useAuth.ts PASSWORD_RECOVERY fix must be in the same plan as /passwort-setzen** (Plan 2 or earlier) — otherwise invite links land on /konto

## Analog Files

| New file | Analog |
|----------|--------|
| OrganisationPage | src/modules/tickets/pages/TicketsPage.tsx |
| OrgInfoSection | src/shared/components/account/ProfileSection.tsx (read-only card) |
| TeamSection | src/modules/tickets/components/TaskList.tsx (list with header) |
| InviteMemberDialog | src/modules/tickets/components/NewTicketDialog.tsx |
| useOrgMembers | src/shared/hooks/useWorkspaces.ts |
| PasswortSetzenPage | src/shared/pages/LoginPage.tsx |
| Sidebar Utilities link | existing Utilities zone items in Sidebar.tsx |

## Edge Function Contract (invite-member)

Request:
```json
POST /invite-member
{ "email": "anna@acme.at", "role": "member", "org_id": "uuid" }
```

Response success (201):
```json
{ "success": true, "profile_id": "uuid" }
```

Response error (400/403/409):
```json
{ "error": "already_member" | "not_admin" | "invalid_role" | ... }
```

## RLS Policy Gap (research finding)

Phase 11 added only:
- `org_members` SELECT: `profile_id = auth.uid()` (own row only)
- `organizations` SELECT: via `user_org_ids()`

Missing (Plan 1 must add):
- `org_members` SELECT for admins: all rows where `organization_id IN (SELECT org WHERE role='admin')`
- `org_members` UPDATE for admins: same scope
- `org_members` DELETE for admins: same scope

Use `user_org_role()` function from Phase 9 (`SELECT public.user_org_role(organization_id) = 'admin'`).

</specifics>
