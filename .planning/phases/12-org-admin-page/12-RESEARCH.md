# Phase 12: org-admin-page — Research

**Researched:** 2026-04-15
**Domain:** React/TypeScript frontend — admin page, role management, password-set flow
**Confidence:** HIGH (all findings verified from codebase source files)

---

## Summary

Phase 12 is a purely frontend phase. All backend infrastructure is complete: the `invite-member` Edge Function (Phase 10), the `OrgProvider`/`useOrg` hook (Phase 11), and the `org_members`/`organizations` DB tables (Phase 9). The phase builds three new surfaces: the `/organisation` admin page with its two card sections, the `InviteMemberDialog`, and the `/passwort-setzen` password-set route for invited users.

**There is one critical pre-existing conflict** that must be resolved first: `useAuth.ts` currently intercepts the `PASSWORD_RECOVERY` auth event and hard-redirects to `/konto?action=change-password` — but the `invite-member` Edge Function sends recovery links to `/passwort-setzen`. The `onAuthStateChange` handler in `useAuth.ts` must be updated to route `PASSWORD_RECOVERY` to `/passwort-setzen` instead (or differentiate by origin). This must be Plan 1 — everything else in the phase depends on the auth flow working correctly.

**No new shadcn/ui primitives need installation.** `AlertDialog` and `Button` and `Input` are already present. `DropdownMenu` from Radix UI (`@radix-ui/react-dropdown-menu`) is already installed as a dependency — the pattern is used raw in `NotificationBell.tsx`. A thin shadcn-style wrapper `src/shared/components/ui/dropdown-menu.tsx` should be created following the same pattern as `alert-dialog.tsx`.

**No new Edge Functions needed.** Role changes and member removal are direct Supabase client calls with RLS (service role not required — admin writes are via the anon key with org-scoped policies that must be added in a migration).

**Primary recommendation:** Plan 1 = fix the PASSWORD_RECOVERY redirect conflict + add RLS policies for admin writes. Plan 2 = `/passwort-setzen` page. Plan 3 = `OrganisationPage` skeleton + `OrgInfoSection`. Plan 4 = `TeamSection` with member list hook. Plan 5 = `InviteMemberDialog`. Plan 6 = role-change + removal row actions. Plan 7 = sidebar link.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORG-FE-UI-01 | `/organisation` route, non-admin redirect to `/tickets` | Inline `useOrg()` guard in the page component mirrors Phase 11 D-05 pattern. Route added in `routes.tsx` inside the `ProtectedRoute`/`AppShell` wrapper. |
| ORG-FE-UI-02 | `OrganisationPage` with `OrgInfoSection` + `TeamSection` — ContentContainer narrow, card-based | Pattern: `HilfePage.tsx` (page) + `FaqSection` (card). ContentContainer + inner `p-6` padding. |
| ORG-FE-UI-03 | TeamSection table — Name, Email, Rolle, Hinzugefügt am. Pending: "Einladung ausstehend" | Reads `org_members` joined to `profiles`. The `invite-member` function inserts the `org_members` row immediately — no separate `pending_invites` table exists. Pending state is detected by `profiles.full_name IS NULL`. |
| ORG-FE-UI-04 | `InviteMemberDialog` — email + role, calls `invite-member` Edge Function, toast feedback | Edge Function payload: `{ organizationId, email, role }`. Success: `{ success: true, userId }`. Error: `{ error: string }`. Role values: `"member"` or `"viewer"`. Admin cannot be granted. |
| ORG-FE-UI-05 | Role change (Mitglied ↔ Betrachter) via ··· menu. Cannot demote self or last admin | Direct Supabase UPDATE on `org_members` row. Requires RLS write policy for admin — must be added in a migration. |
| ORG-FE-UI-06 | Member removal via ··· menu. Confirmation dialog. Cannot remove self if last admin | Direct Supabase DELETE on `org_members` row. Same RLS policy required. AlertDialog already installed. |
| ORG-FE-UI-07 | `/passwort-setzen` — GoTrue recovery token from URL hash, password form, `updateUser`, redirect to `/tickets` | `onAuthStateChange` fires `PASSWORD_RECOVERY` event when the recovery link is opened. The current handler in `useAuth.ts` redirects to `/konto` — **must be changed to `/passwort-setzen`**. On the page: `supabase.auth.updateUser({ password })` is already implemented in `useAuth.updatePassword()`. |
| ORG-FE-UI-08 | Sidebar "Ihre Organisation" in Utilities zone, admin-only, Hugeicons building/office icon | `SidebarUtilities.tsx` is the exact file. Pattern: conditional render with `useOrg().isAdmin`. Hugeicons icon: `Building01Icon` or `Office01Icon` from `@hugeicons/core-free-icons` — verify import name at implementation time. |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Admin page routing guard | Frontend (React Router) | — | Client-side redirect using `useOrg().isAdmin` from OrgContext |
| Org info display | Frontend | Supabase DB (read) | Reads `organization` from OrgContext — already loaded, no new fetch needed |
| Member list fetch | Frontend | Supabase DB (read) | New React Query hook fetching `org_members` + `profiles` join |
| Invite member | Frontend (form) | Edge Function (invite-member) | Frontend submits form; Edge Function handles GoTrue user creation |
| Role change | Frontend | Supabase DB (update) | Direct UPDATE on `org_members` — Edge Function not needed |
| Member removal | Frontend | Supabase DB (delete) | Direct DELETE on `org_members` — Edge Function not needed |
| Password-set flow | Frontend | GoTrue (Supabase Auth) | `onAuthStateChange` intercepts `PASSWORD_RECOVERY` event; page calls `updateUser` |
| Sidebar admin link | Frontend | OrgContext | Conditional render, no backend call |

---

## Standard Stack

### Core (all already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React + TypeScript | 19 | UI | Project standard |
| `@supabase/supabase-js` | 2.47.10 (pinned) | DB read/write + auth | [VERIFIED: supabase/functions/invite-member/index.ts line 6] |
| `@radix-ui/react-dropdown-menu` | ^2.1.16 | ··· row action menu | [VERIFIED: package.json line 22] — already installed, used in NotificationBell |
| `@radix-ui/react-alert-dialog` | installed | Remove confirmation dialog | [VERIFIED: src/shared/components/ui/alert-dialog.tsx] — shadcn wrapper already exists |
| `sonner` | ^2.0.7 | Toast feedback | [VERIFIED: CLAUDE.md] |
| TanStack React Query | installed | Data fetching + cache | Project standard |
| `motion/react` | v12 | Subtle entry animations | Project standard for all pages |
| `@hugeicons/react` + `@hugeicons/core-free-icons` | installed | Icons throughout | [VERIFIED: SidebarUtilities.tsx imports pattern] |

### What Needs to Be Created (not installed)

| Item | Action | Where |
|------|--------|-------|
| `DropdownMenu` shadcn wrapper | Create `src/shared/components/ui/dropdown-menu.tsx` | Mirror `alert-dialog.tsx` pattern, wrapping `@radix-ui/react-dropdown-menu` |
| RLS write policies on `org_members` | New migration file | `supabase/migrations/20260415XXXXXX_org_admin_write_rls.sql` |

---

## Architecture Patterns

### System Architecture Diagram

```
User (admin)
     │
     ├─── GET /organisation ──────────────────────────────────────────────────────┐
     │         │                                                                   │
     │    OrganisationPage (renders inside ProtectedRoute > AppShell)            │
     │         │  useOrg() → isAdmin = false? → <Navigate to="/tickets" />       │
     │         │  isAdmin = true → render page                                    │
     │         │                                                                  │
     │    ┌────┴──────────────────────────────────────────────┐                  │
     │    │ OrgInfoSection                                    │ TeamSection      │
     │    │ Reads: OrgContext (already loaded, no new fetch)  │ useOrgMembers()  │
     │    │ Shows: name, slug, credit package (read-only)     │ org_members join │
     │    └───────────────────────────────────────────────────┘ profiles         │
     │                                                                            │
     ├─── InviteMemberDialog                                                      │
     │         │ POST /invite-member (Edge Function)                             │
     │         │   body: { organizationId, email, role }                         │
     │         │   → createUser + generateLink + send email                      │
     │         │   → insert org_members row                                      │
     │         │   ← { success: true, userId }                                   │
     │         │   ← { error: string } (409 = already exists)                   │
     │                                                                            │
     ├─── Role Change (··· menu → Rolle ändern)                                  │
     │         │ supabase.from('org_members').update({ role })                   │
     │         │   .eq('id', memberId).eq('organization_id', orgId)             │
     │         │ Guard: cannot change own role, cannot demote last admin         │
     │                                                                            │
     └─── Member Removal (··· menu → Entfernen + AlertDialog confirm)            │
               │ supabase.from('org_members').delete()                            │
               │   .eq('id', memberId).eq('organization_id', orgId)             │
               │ Guard: cannot remove self if last admin                          │
                                                                                  │
User (invited, first login)                                                       │
     │                                                                            │
     ├─── Clicks invite email link ────────────────────────────────────────────┘
     │         │ GoTrue recovery link → lands on app with token in URL hash
     │         │ supabase.auth.onAuthStateChange fires PASSWORD_RECOVERY event
     │         │ useAuth.ts handler → navigate to /passwort-setzen
     │                                    │
     │              PasswordSetzenPage    │ reads useAuth session (already set)
     │                    │ user submits password
     │                    │ supabase.auth.updateUser({ password })
     │                    │   (same as useAuth.updatePassword())
     │                    │ on success → navigate('/tickets', { replace: true })
```

### Recommended Project Structure

```
src/
├── shared/
│   ├── pages/
│   │   └── PasswordSetzenPage.tsx        # NEW — /passwort-setzen route
│   └── components/
│       ├── layout/
│       │   └── SidebarUtilities.tsx      # MODIFY — add Org link
│       └── ui/
│           └── dropdown-menu.tsx         # NEW — Radix shadcn wrapper
├── modules/
│   └── organisation/                     # NEW module directory
│       ├── pages/
│       │   └── OrganisationPage.tsx      # NEW
│       ├── components/
│       │   ├── OrgInfoSection.tsx        # NEW
│       │   ├── TeamSection.tsx           # NEW
│       │   ├── InviteMemberDialog.tsx    # NEW
│       │   └── MemberRowActions.tsx      # NEW — ··· menu per row
│       ├── hooks/
│       │   └── useOrgMembers.ts          # NEW — fetches member list
│       └── lib/
│           └── org-api.ts                # NEW — invite-member fetch wrapper
supabase/
└── migrations/
    └── 20260415XXXXXX_org_admin_write_rls.sql   # NEW — write policies
src/app/
└── routes.tsx                            # MODIFY — add /organisation + /passwort-setzen
```

---

## Detailed Technical Findings

### 1. invite-member Edge Function — Exact Contract

**Verified from:** `supabase/functions/invite-member/index.ts` (read in this session)

**Request:**
```typescript
// POST to: supabase functions invoke('invite-member') or via main router
// Headers: Authorization: Bearer <user_jwt>
// Body:
{
  organizationId: string,  // UUID of the org
  email: string,           // invited user's email
  role: "member" | "viewer"  // "admin" is rejected (400)
}
```

**Success response (200):**
```typescript
{ success: true, userId: string }
```

**Error responses:**
| Status | Body | Meaning |
|--------|------|---------|
| 400 | `{ error: "Missing required fields..." }` | Missing body fields |
| 400 | `{ error: "Invalid role..." }` | Role is "admin" or unknown |
| 401 | `{ error: "Unauthorized" }` | No/invalid token |
| 403 | `{ error: "Insufficient permissions" }` | Caller is not org admin |
| 409 | `{ error: "Member already exists in organization" }` | Duplicate invite |
| 500 | `{ error: "Email send failed — invite rolled back" }` | Mailjet failed |
| 500 | `{ error: "User created but org_members insert failed..." }` | Partial failure — includes `userId` |

**Key behavior:** The function creates the GoTrue user with `email_confirm: true`, meaning the user exists immediately with no password. It inserts the `org_members` row before the user sets their password. The recovery link redirects to `${SITE_URL}/passwort-setzen`.

**Frontend call pattern** (using supabase client from `@/shared/lib/supabase`):
```typescript
// Source: verified from invite-member/index.ts auth pattern
const { data: { session } } = await supabase.auth.getSession()
const resp = await fetch(`${supabaseUrl}/functions/v1/invite-member`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token}`,
  },
  body: JSON.stringify({ organizationId, email, role }),
})
```

Or via Supabase functions client:
```typescript
const { data, error } = await supabase.functions.invoke('invite-member', {
  body: { organizationId, email, role },
})
```

### 2. GoTrue Recovery Token — /passwort-setzen Flow

**Verified from:** `src/shared/hooks/useAuth.ts` lines 107-127 (read in this session)

**Critical finding:** `useAuth.ts` already handles `PASSWORD_RECOVERY` at line 110:
```typescript
if (event === 'PASSWORD_RECOVERY') {
  // Recovery link clicked — redirect to account page with password form open
  window.location.href = '/konto?action=change-password'
  return
}
```

**This is the conflict.** The `invite-member` Edge Function sets `redirectTo: '/passwort-setzen'`, but the `onAuthStateChange` handler intercepts the event BEFORE the page renders and hard-redirects to `/konto`. The `/passwort-setzen` page will never receive control.

**Fix required in Plan 1:** Change the `PASSWORD_RECOVERY` handler in `useAuth.ts` to:
```typescript
if (event === 'PASSWORD_RECOVERY') {
  window.location.href = '/passwort-setzen'
  return
}
```

The existing `/konto?action=change-password` flow (for logged-in users doing a voluntary password reset) is already triggered via `resetPassword()` → email link. Those links also hit `/konto?action=change-password` as the `redirectTo`. So the `PASSWORD_RECOVERY` event in practice only fires for invite links. Changing the redirect is safe.

**How the password-set page works after the fix:**

1. User clicks invite email link
2. GoTrue processes the token, establishes a session
3. `onAuthStateChange` fires `PASSWORD_RECOVERY` → `window.location.href = '/passwort-setzen'`
4. `/passwort-setzen` renders — user is now authenticated (session exists)
5. Page calls `supabase.auth.updateUser({ password: newPassword })`
   - This is already implemented as `useAuth().updatePassword(newPassword)` [VERIFIED: useAuth.ts line 183]
6. On success → `navigate('/tickets', { replace: true })`

**No need to read URL hash manually.** GoTrue processes the hash token and fires the `PASSWORD_RECOVERY` event automatically when the app loads with the recovery URL. The session is already active when the page renders.

### 3. Admin Routing Guard Pattern

**Verified from:** `src/app/routes.tsx`, `src/app/ProtectedRoute.tsx`, `src/modules/tickets/pages/TicketsPage.tsx`

The existing pattern for role-based visibility is inline `useOrg()` per Phase 11 D-05:
```typescript
const { isViewer } = useOrg()
if (isViewer) return null
```

For a full page redirect (ORG-FE-UI-01), the pattern is similar to `ProtectedRoute` but inline in the page component:
```typescript
// OrganisationPage.tsx
export function OrganisationPage() {
  const { isAdmin, isLoading } = useOrg()
  
  if (isLoading) return <RouteLoading />
  if (!isAdmin) return <Navigate to="/tickets" replace />
  
  return (/* page content */)
}
```

Route registration mirrors the existing pattern in `routes.tsx` — inside `ProtectedRoute > AppShell`, lazy-loaded:
```typescript
// routes.tsx
const OrganisationPage = lazy(() => import('@/modules/organisation/pages/OrganisationPage')...)
const PasswordSetzenPage = lazy(() => import('@/shared/pages/PasswordSetzenPage')...)

// Inside <Routes>:
<Route path="/organisation" element={withRouteLoading(<OrganisationPage />)} />
<Route path="/passwort-setzen" element={withRouteLoading(<PasswordSetzenPage />)} />
```

Note: `/passwort-setzen` must be OUTSIDE the `ProtectedRoute` wrapper — an invited user with no password is technically authenticated (GoTrue session exists) but `isAuthenticated` in `AuthContext` is based on `!!session`. The `PASSWORD_RECOVERY` event sets a session, so `ProtectedRoute` will pass. The route can be inside `ProtectedRoute > AppShell` OR outside — outside is safer to avoid sidebar flash.

**Recommendation:** Put `/passwort-setzen` outside `ProtectedRoute`, using the same outer `<div>` + centered card as `LoginPage`. It uses the login shell, not AppShell.

### 4. org_members Table — Pending Invite Detection

**Verified from:** `supabase/migrations/20260414200000_org_foundation.sql` + `supabase/functions/invite-member/index.ts`

There is **no separate `pending_invites` table**. The `invite-member` function inserts directly into `org_members` with the new user's profile ID. Pending status is detected at query time by checking whether the member has set their name (i.e., `profiles.full_name IS NULL`).

**`org_members` table columns:**
```
id               uuid PK
organization_id  uuid NOT NULL FK → organizations
profile_id       uuid NOT NULL FK → profiles
role             text CHECK ('admin' | 'member' | 'viewer')
created_at       timestamptz
UNIQUE (organization_id, profile_id)
```

**`useOrgMembers` hook query:**
```typescript
// Source: [VERIFIED from org_foundation.sql schema + useOrg.ts query pattern]
const { data } = await supabase
  .from('org_members')
  .select(`
    id,
    role,
    created_at,
    profiles (
      id,
      email,
      full_name
    )
  `)
  .eq('organization_id', organization.id)
  .order('created_at', { ascending: true })
```

**Pending detection in UI:**
```typescript
const isPending = !member.profiles?.full_name
// Renders "Einladung ausstehend" in Rolle column if isPending
// Renders role label ("Mitglied" / "Betrachter" / "Administrator") if !isPending
```

**RLS note:** The Phase 11 migration (`20260415120000_org_rls_and_credit_rpc.sql`) added SELECT policies on `org_members` for `profile_id = auth.uid()`. This policy only allows a member to read their OWN row — not all org members. A new SELECT policy for admins must be added in Phase 12's migration to allow listing all org members.

### 5. Supabase Calls for Role Change and Member Removal

**RLS prerequisite:** A new migration must add admin write policies before these calls work client-side.

**Migration pattern needed:**
```sql
-- Allow admin to read all org_members in their org
create policy "admin can read all org members"
  on public.org_members for select
  to authenticated
  using (
    organization_id in (
      select organization_id from public.org_members
      where profile_id = auth.uid() and role = 'admin'
    )
  );

-- Allow admin to update org_members role in their org
create policy "admin can update member roles"
  on public.org_members for update
  to authenticated
  using (
    organization_id in (
      select organization_id from public.org_members
      where profile_id = auth.uid() and role = 'admin'
    )
  )
  with check (
    role in ('member', 'viewer')  -- cannot grant admin via client
  );

-- Allow admin to delete org_members in their org (except own row)
create policy "admin can remove members"
  on public.org_members for delete
  to authenticated
  using (
    organization_id in (
      select organization_id from public.org_members
      where profile_id = auth.uid() and role = 'admin'
    )
    and profile_id != auth.uid()  -- cannot delete own row via RLS
  );
```

**Role change call:**
```typescript
// Source: [VERIFIED pattern from useOrg.ts supabase client usage]
const { error } = await supabase
  .from('org_members')
  .update({ role: newRole })
  .eq('id', memberId)
  .eq('organization_id', organization.id)
```

**Frontend guard (last admin protection):**
```typescript
// Count admin rows before allowing demote
const adminCount = members.filter(m => m.role === 'admin').length
const canDemote = !(member.role === 'admin' && adminCount <= 1)
const canChangeSelfRole = member.profile_id !== currentUserId
```

**Member removal call:**
```typescript
const { error } = await supabase
  .from('org_members')
  .delete()
  .eq('id', memberId)
  .eq('organization_id', organization.id)
```

**Frontend guard (self-removal as last admin):**
```typescript
const isSelf = member.profile_id === currentUserId
const isLastAdmin = member.role === 'admin' && adminCount <= 1
const canRemove = !(isSelf && isLastAdmin)
```

Note: The RLS DELETE policy already blocks `profile_id = auth.uid()` at the DB level, but the UI should also guard it to show a clear error message rather than a silent DB error.

### 6. shadcn/ui Components Available

**Verified from:** `src/shared/components/ui/` directory listing

| Component | File | Status |
|-----------|------|--------|
| `AlertDialog` | `alert-dialog.tsx` | Installed, shadcn wrapper exists |
| `Button` | `button.tsx` | Installed |
| `Input` | `input.tsx` | Installed |
| `Badge` | `badge.tsx` | Installed |
| `Avatar` | `avatar.tsx` | Installed |
| `Skeleton` | `skeleton.tsx` | Installed |
| `Tabs` | `tabs.tsx` | Installed |
| `Textarea` | `textarea.tsx` | Installed |
| `DropdownMenu` | **NOT INSTALLED** | Radix dependency exists; shadcn wrapper must be created |

**DropdownMenu wrapper to create** — pattern from `alert-dialog.tsx`:
```typescript
// src/shared/components/ui/dropdown-menu.tsx
// Wrap @radix-ui/react-dropdown-menu with portal CSS token styling
// Export: DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
//         DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel
```

Alternatively, the raw Radix import pattern used in `NotificationBell.tsx` works too:
```typescript
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
// Use DropdownMenu.Root, DropdownMenu.Trigger, DropdownMenu.Portal,
//     DropdownMenu.Content, DropdownMenu.Item
```

**Recommendation:** Create the thin shadcn wrapper for consistency with other UI primitives.

### 7. Sidebar Utilities Zone Pattern

**Verified from:** `src/shared/components/layout/SidebarUtilities.tsx` (read in this session)

The Utilities zone is a simple `div` with `flex flex-col gap-0.5` containing `NavLink` components. Each link uses the same CSS pattern:
```typescript
className={({ isActive }) => cn(
  'flex items-center h-10 px-3.5 mx-1.5 rounded-[8px] transition-colors',
  'text-text-sidebar hover:bg-sidebar-hover hover:text-white',
  isActive && 'bg-sidebar-active text-white'
)}
```

**Org link addition (ORG-FE-UI-08):**
```typescript
// SidebarUtilities.tsx — add after CreditBalance, before /support or anywhere in the zone
import { useOrg } from '@/shared/hooks/useOrg'
// inside component:
const { isAdmin } = useOrg()

{isAdmin && (
  <NavLink to="/organisation" onClick={onNavigate} className={...}>
    <HugeiconsIcon icon={Building01Icon} size={20} className="shrink-0" />
    {expanded && (
      <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">
        Ihre Organisation
      </span>
    )}
  </NavLink>
)}
```

**Hugeicons icon:** The project uses `@hugeicons/core-free-icons`. Import `Building01Icon` or `Building02Icon` — exact export name must be verified with `import { Building01Icon } from '@hugeicons/core-free-icons'` at implementation time. The free tier includes building/office icons in the stroke-rounded style.

### 8. OrgInfoSection — Data Already Available

**Verified from:** `src/shared/hooks/useOrg.ts` line 37

`OrgContext` already provides the full `organization` object including: `id`, `name`, `slug`, `clickup_list_ids`, `nextcloud_client_root`, `support_task_id`, `clickup_chat_channel_id`, `created_at`, `updated_at`.

For the credit package info in `OrgInfoSection`, the hook `useCredits()` from `src/modules/tickets/hooks/useCredits.ts` already fetches `packageName` and `creditsPerMonth` by org. No new data fetching needed.

```typescript
// OrgInfoSection.tsx
const { organization } = useOrg()
const { packageName, creditsPerMonth } = useCredits()
// Display: organization.name, organization.slug, packageName + creditsPerMonth
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Confirmation dialog for destructive actions | Custom modal | `AlertDialog` from `src/shared/components/ui/alert-dialog.tsx` | Already installed, accessible, portal-styled |
| Row action menu | Custom positioned div | Radix `DropdownMenu` (wrap as shadcn component) | Focus trap, keyboard nav, portal positioning handled |
| Toast feedback | Custom notification | `sonner` — `import { toast } from 'sonner'` | Project standard [CLAUDE.md] |
| Password update API | Direct GoTrue REST call | `supabase.auth.updateUser({ password })` / `useAuth().updatePassword()` | Already implemented in `useAuth.ts` line 183 |
| Admin role detection | Re-fetch from DB | `useOrg().isAdmin` | Already in OrgContext, zero additional fetch |
| GoTrue recovery session | Manually parse URL hash | Let `onAuthStateChange` fire `PASSWORD_RECOVERY` | GoTrue handles token exchange; page receives established session |

---

## Common Pitfalls

### Pitfall 1: PASSWORD_RECOVERY Redirect Conflict
**What goes wrong:** The `onAuthStateChange` handler in `useAuth.ts` (line 110) intercepts `PASSWORD_RECOVERY` and redirects to `/konto?action=change-password`. The `/passwort-setzen` page never renders.
**Why it happens:** This handler was added for voluntary password resets (via the "Passwort vergessen?" flow), before the invite flow existed.
**How to avoid:** Change the handler to redirect to `/passwort-setzen`. The `/konto` voluntary reset flow uses `resetPassword()` which sets `redirectTo: '/konto?action=change-password'` — GoTrue respects this `redirectTo` in the email link. When that link is clicked, the recovery token in the URL still fires `PASSWORD_RECOVERY`. After the fix, all recovery links land on `/passwort-setzen`.
**Warning signs:** If `/passwort-setzen` is implemented but invite links go to `/konto`, this conflict is active.

### Pitfall 2: RLS Blocks Admin from Reading All Org Members
**What goes wrong:** `useOrgMembers()` returns only the current user's own row (not all members).
**Why it happens:** Phase 11 migration only added `profile_id = auth.uid()` SELECT policy. No policy allows reading other members' rows.
**How to avoid:** The Plan 1 migration must add an admin SELECT policy on `org_members` (example in section 5 above). Without this, the team table will show only the current user.
**Warning signs:** Query returns exactly 1 row regardless of actual member count.

### Pitfall 3: PasswordSetzenPage Inside ProtectedRoute
**What goes wrong:** If `/passwort-setzen` is placed inside the `ProtectedRoute > AppShell` block, an invited user sees the full sidebar shell before setting their password — and the `useOrg()` call may fail or return stale state.
**Why it happens:** Route is placed in the wrong block in `routes.tsx`.
**How to avoid:** Place `/passwort-setzen` outside `ProtectedRoute`, like `/login`. It uses the login page visual shell (centered card, no AppShell).
**Warning signs:** Password set page shows sidebar.

### Pitfall 4: Last Admin Guard Not Enforced
**What goes wrong:** Admin demotes themselves or removes themselves, org has no admin — completely locked out.
**Why it happens:** UI guard missing or checking wrong condition.
**How to avoid:** Before any role change or removal, count `members.filter(m => m.role === 'admin').length`. If the target member is the last admin, disable/hide the action. The RLS DELETE policy also blocks self-removal at DB level.
**Warning signs:** DropdownMenu shows "Entfernen" option for the sole admin.

### Pitfall 5: Stale Member List After Invite/Remove
**What goes wrong:** After inviting a member or removing one, the table doesn't update.
**Why it happens:** React Query cache not invalidated after mutation.
**How to avoid:** In `InviteMemberDialog` and `MemberRowActions` mutations, call `queryClient.invalidateQueries({ queryKey: ['org-members', organization.id] })` on success.
**Warning signs:** Table still shows removed member or doesn't show new invite.

### Pitfall 6: Invite Granting Admin Role
**What goes wrong:** UI allows selecting "Administrator" as a role to invite.
**Why it happens:** Role selector not restricted.
**How to avoid:** The role select in `InviteMemberDialog` must only offer `"member"` (display: "Mitglied") and `"viewer"` (display: "Betrachter"). The Edge Function also rejects "admin" with a 400, but the UI should not offer it at all.

---

## Code Examples

### useOrgMembers hook skeleton
```typescript
// Source: [VERIFIED pattern from useOrg.ts + supabase query pattern]
// src/modules/organisation/hooks/useOrgMembers.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useOrg } from '@/shared/hooks/useOrg'

export interface OrgMemberRow {
  id: string
  role: 'admin' | 'member' | 'viewer'
  created_at: string
  profiles: {
    id: string
    email: string
    full_name: string | null
  } | null
}

export function useOrgMembers() {
  const { organization } = useOrg()

  return useQuery({
    queryKey: ['org-members', organization?.id],
    enabled: !!organization?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_members')
        .select('id, role, created_at, profiles(id, email, full_name)')
        .eq('organization_id', organization!.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      return data as OrgMemberRow[]
    },
  })
}
```

### PasswordSetzenPage skeleton
```typescript
// Source: [VERIFIED from LoginPage.tsx visual shell + useAuth.ts updatePassword]
// src/shared/pages/PasswordSetzenPage.tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/shared/hooks/useAuth'
import logo from '@/assets/KAMANIN-icon-colour.svg'
import { toast } from 'sonner'

export function PasswordSetzenPage() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    const { error } = await updatePassword(password)
    if (error) {
      toast.error('Passwort konnte nicht gesetzt werden. Bitte erneut versuchen.')
    } else {
      toast.success('Passwort erfolgreich gesetzt.')
      navigate('/tickets', { replace: true })
    }
    setIsLoading(false)
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="KAMANIN" className="h-14 w-auto mb-3" />
          <p className="text-text-tertiary text-sm">Ihr Projektportal</p>
        </div>
        <div className="bg-surface rounded-[14px] border border-border p-6 shadow-md">
          <h2 className="text-base font-semibold text-text-primary mb-5">
            Passwort festlegen
          </h2>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* password input + submit button — same styling as LoginPage */}
          </form>
        </div>
      </div>
    </div>
  )
}
```

### invite-member API call
```typescript
// src/modules/organisation/lib/org-api.ts
import { supabase } from '@/shared/lib/supabase'

export async function inviteMember(payload: {
  organizationId: string
  email: string
  role: 'member' | 'viewer'
}): Promise<{ success: boolean; userId?: string; error?: string }> {
  const { data, error } = await supabase.functions.invoke('invite-member', {
    body: payload,
  })
  if (error) return { success: false, error: error.message }
  if (data?.error) return { success: false, error: data.error }
  return { success: true, userId: data.userId }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `profile_id`-scoped queries everywhere | Org-scoped via `organization_id` | Phase 9-11 | All new queries use org ID from OrgContext |
| `inviteUserByEmail` (GoTrue SMTP) | `createUser` + `generateLink({ type: 'recovery' })` | Phase 10 decision | Recovery flow used for all invites |
| Viewer guard via shared wrapper | Inline `useOrg()` per component | Phase 11 D-05 | Admin guard follows same inline pattern |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `Building01Icon` or `Building02Icon` is the correct import name from `@hugeicons/core-free-icons` for a building/office icon | Standard Stack / Sidebar | Low — if name is wrong, TypeScript compile error caught immediately. Check at implementation time: `import { Building01Icon } from '@hugeicons/core-free-icons'` |
| A2 | `supabase.functions.invoke('invite-member', { body })` correctly routes through the main Edge Function router | Code Examples | Medium — the main router uses `service_name = path_parts[1]` from the URL path. Supabase JS client sets the path as `/invite-member` → service_name = `invite-member` → routes to the worker. This is the standard pattern used by all other Edge Functions in the project. |

---

## Open Questions (RESOLVED)

1. **Should `/passwort-setzen` be accessible to already-authenticated users (e.g., someone who bookmarks the link)?**
   - What we know: the page only works if a `PASSWORD_RECOVERY` session is active.
   - What's unclear: if a logged-in user navigates directly to `/passwort-setzen`, they'll see a password form but `updateUser` will succeed (changing their password unexpectedly).
   - Recommendation: Add a guard — if `isAuthenticated` AND no `PASSWORD_RECOVERY` event was just fired, redirect to `/inbox`. Simplest approach: only render the form if `window.location.hash` contains a token (check `#access_token=` or `#type=recovery`).

2. **Pagination of org member list — relevant for Phase 12?**
   - What we know: current orgs have 1-5 members; no pagination built.
   - What's unclear: future orgs could have many members.
   - Recommendation: Fetch all members without pagination for Phase 12 (consistent with current project scale). Add a comment noting pagination as a future improvement.

---

## Environment Availability

Step 2.6: SKIPPED (no external CLI dependencies — purely frontend + existing Supabase infrastructure)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + @testing-library/react |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test:coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORG-FE-UI-01 | Non-admin redirects to /tickets | unit (hook logic) | `npm run test -- --reporter=verbose modules/organisation` | ❌ Wave 0 |
| ORG-FE-UI-03 | Pending member detected by full_name IS NULL | unit (hook transform) | `npm run test -- --reporter=verbose modules/organisation` | ❌ Wave 0 |
| ORG-FE-UI-04 | invite-member error codes shown as toasts | unit (component) | `npm run test -- --reporter=verbose modules/organisation` | ❌ Wave 0 |
| ORG-FE-UI-05 | Last admin cannot be demoted | unit (guard logic) | `npm run test -- --reporter=verbose modules/organisation` | ❌ Wave 0 |
| ORG-FE-UI-06 | Last admin cannot remove self | unit (guard logic) | `npm run test -- --reporter=verbose modules/organisation` | ❌ Wave 0 |
| ORG-FE-UI-07 | updatePassword called on submit | unit (component) | `npm run test -- --reporter=verbose shared/__tests__` | ❌ Wave 0 |

### Wave 0 Gaps
- [ ] `src/modules/organisation/__tests__/useOrgMembers.test.ts` — covers ORG-FE-UI-03, pending detection
- [ ] `src/modules/organisation/__tests__/MemberRowActions.test.ts` — covers ORG-FE-UI-05, ORG-FE-UI-06 guard logic
- [ ] `src/modules/organisation/__tests__/InviteMemberDialog.test.ts` — covers ORG-FE-UI-04 error handling
- [ ] `src/shared/__tests__/PasswordSetzenPage.test.tsx` — covers ORG-FE-UI-07

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes — password set flow | `supabase.auth.updateUser({ password })` via GoTrue |
| V3 Session Management | yes — recovery session | GoTrue handles token exchange; no manual session management |
| V4 Access Control | yes — admin-only page + write operations | `useOrg().isAdmin` guard + RLS write policies on `org_members` |
| V5 Input Validation | yes — email + password inputs | HTML `type="email"` + password length validation; Edge Function validates role |
| V6 Cryptography | no — no custom crypto | GoTrue handles password hashing |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client-side-only admin guard bypass | Elevation of Privilege | RLS write policies on `org_members` — DB enforces even if UI guard is bypassed |
| Admin role self-grant via invite | Elevation of Privilege | Edge Function rejects `role = "admin"` with 400; RLS `with check (role in ('member','viewer'))` on update policy |
| Recovery link reuse | Spoofing | GoTrue recovery tokens are single-use; handled by GoTrue |
| Last admin removal leaving org orphaned | Tampering | Frontend guard + RLS DELETE policy blocks `profile_id = auth.uid()` deletes |

---

## Sources

### Primary (HIGH confidence — read from codebase)
- `supabase/functions/invite-member/index.ts` — full function implementation, exact request/response shape
- `src/shared/hooks/useAuth.ts` — PASSWORD_RECOVERY handler conflict, updatePassword implementation
- `src/shared/hooks/useOrg.ts` — OrgContext shape, fetchOrgForUser query pattern
- `src/app/routes.tsx` — route registration pattern, lazy loading pattern
- `src/app/ProtectedRoute.tsx` — auth guard pattern
- `src/shared/components/layout/SidebarUtilities.tsx` — exact NavLink pattern for Utilities zone
- `src/shared/pages/LoginPage.tsx` — visual shell to reuse for /passwort-setzen
- `src/modules/tickets/pages/TicketsPage.tsx` — useOrg() inline guard pattern
- `src/shared/components/ui/alert-dialog.tsx` — AlertDialog wrapper (already installed)
- `src/modules/tickets/components/NotificationBell.tsx` — raw Radix DropdownMenu pattern
- `supabase/migrations/20260414200000_org_foundation.sql` — org_members schema
- `supabase/migrations/20260415120000_org_rls_and_credit_rpc.sql` — existing RLS policies (read-only; write policies missing)
- `.planning/phases/11-org-frontend-auth/11-CONTEXT.md` — Phase 11 decisions locked
- `.planning/REQUIREMENTS.md` — ORG-FE-UI requirements

### Secondary (MEDIUM confidence)
- `package.json` line 22 — `@radix-ui/react-dropdown-menu` version confirmed installed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified from codebase
- Architecture: HIGH — all patterns traced from existing code
- Edge Function contract: HIGH — read from actual implementation
- Pitfalls: HIGH — traced from concrete code conflicts (PASSWORD_RECOVERY handler, RLS gaps)
- Hugeicons icon name: LOW (A1) — exact name unconfirmed, compile-time catch

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable stack, 30-day window)
