# Phase 11: org-frontend-auth — Context

**Gathered:** 2026-04-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire every frontend component to know the current user's organisation and role. Deliverables:
1. `OrgContext` / `OrgProvider` — provides `organization`, `orgRole`, `isAdmin`, `isMember`, `isViewer` to all components; data fetched once at login, served from React Query cache
2. `useWorkspaces` updated — queries `client_workspaces` by `organization_id` (via `OrgContext`) instead of `profile_id`
3. `useCredits` updated — fetches credit balance summed by `organization_id` using a new org-scoped RPC
4. Three UI elements hidden for viewer role: `NewTicketDialog`, `CreditApproval`, `TaskActions`

Organisation admin page (`/organisation`), member invite flow, and password-set route are Phase 12. Legacy column cleanup is Phase 13.

</domain>

<decisions>
## Implementation Decisions

### OrgContext Provider Placement

- **D-01:** A separate `<OrgProvider>` component wraps `AppRoutes`, placed inside `AuthProvider` in `src/App.tsx`:
  ```
  QueryClientProvider
    BrowserRouter
      AuthProvider
        OrgProvider    ← new
          AppRoutes
  ```
- **D-02:** `useOrg()` is a standalone hook backed by `OrgContext` — separate from `useAuth()`. Components that need org data import `useOrg`, not `useAuth`.
- **D-03:** `OrgProvider` fetches org data when `user` becomes available (reacts to `useAuth()` user state). Fetches `org_members` row for the current user, joins `organizations` to get org details.

### Legacy User Fallback (no org_members row)

- **D-04:** When `org_members` returns no row for the current user, `OrgContext` provides:
  ```ts
  {
    organization: null,
    orgRole: 'member',
    isAdmin: false,
    isMember: true,
    isViewer: false,
  }
  ```
  All UI is visible. This mirrors the Phase 10 Edge Function permissive fallback. If a legacy user tries to mutate, the Edge Function returns 403 — the frontend doesn't need to predict this.

### Viewer Role Guard Pattern

- **D-05:** Inline `useOrg()` in each of the three components — no shared abstraction:
  - `NewTicketDialog` (or the button that opens it on `TicketsPage`) — `const { isViewer } = useOrg(); if (isViewer) return null`
  - `CreditApproval` — same inline check
  - `TaskActions` — same inline check
- **D-06:** No `useCanMutate()` hook or `<CanDo>` wrapper component in this phase. Phase 12 can add its own admin checks the same way.

### Credits Query Scope

- **D-07:** Add a new Supabase SQL function `get_org_credit_balance(p_org_id uuid)` via a migration file in `supabase/migrations/`. It sums `credit_transactions` for all packages belonging to the org (joining through `credit_packages.organization_id`).
- **D-08:** `useCredits` is updated to:
  1. Get `organization.id` from `useOrg()` (not `user.id` from `useAuth()`)
  2. Query `credit_packages` by `organization_id` for the package name/credits-per-month
  3. Call `get_org_credit_balance(organization.id)` RPC for the balance
  4. React Query cache keys change from `['credit-package', user?.id]` to `['credit-package', organization?.id]` (and same for balance)
- **D-09:** The old `get_credit_balance(p_profile_id)` RPC is NOT dropped in this phase — only unused by the updated hook. Cleanup is Phase 13.

### Claude's Discretion

- Error state when org fetch fails (network error) — show neutral loading state or silent fallback, implementation choice
- Exact Supabase query for `getOrgForUser` — whether to join in one query or two lookups
- React Query `staleTime` for org data — reasonable default (e.g., 10 minutes)
- TypeScript interface shape for `Organization` type (beyond what's in DATABASE_SCHEMA.md)

</decisions>

<specifics>
## Specific Ideas

- The `OrgProvider` fetch pattern should mirror how `AuthProvider` fetches the profile: triggered by auth state change, stored in React state, provided via context. Not a standalone React Query query — it's provider-level state.
- `useOrg()` should throw if called outside `OrgProvider` (same guard pattern as `useAuth()`), with a German error message consistent with the codebase: e.g., `'useOrg muss innerhalb von OrgProvider verwendet werden'`

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Auth & Context Patterns
- `src/shared/hooks/useAuth.ts` — `AuthProvider` and `useAuth()` implementation; the exact pattern OrgProvider should mirror (state shape, effect trigger, guard throw)
- `src/App.tsx` — current provider tree; shows where `OrgProvider` is inserted

### Org Data Schema
- `.planning/REQUIREMENTS.md` §ORG-FE-AUTH-01 through ORG-FE-AUTH-06 — acceptance criteria for all 6 requirements
- `.planning/phases/09-org-db-foundation/09-CONTEXT.md` — org schema decisions (tables, SQL functions, dual-mode RLS)
- `.planning/phases/10-org-edge-functions/10-CONTEXT.md` — role decisions, permissive fallback for users without org_members row (D-04 source)

### Hooks to Update
- `src/shared/hooks/useWorkspaces.ts` — current `profile_id` query; replace with `organization_id` from OrgContext
- `src/modules/tickets/hooks/useCredits.ts` — current profile-scoped RPC; replace with org-scoped RPC
- `src/modules/tickets/components/CreditApproval.tsx` — where viewer guard goes (D-05)
- `src/modules/tickets/components/TaskActions.tsx` — where viewer guard goes (D-05)
- `src/modules/tickets/components/NewTicketDialog.tsx` — where viewer guard goes (D-05); check if guard belongs on the button in TicketsPage or inside the dialog itself
- `src/modules/tickets/pages/TicketsPage.tsx` — where the "Neue Aufgabe" button/trigger lives

### Database
- `docs/system-context/DATABASE_SCHEMA.md` — `org_members`, `organizations`, `credit_packages`, `credit_transactions` table definitions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useAuth()` hook in `src/shared/hooks/useAuth.ts` — exact pattern for OrgProvider (useState + useEffect on auth state, context + guard hook)
- `AuthProvider` in same file — shows provider-as-component pattern with internal state
- `useWorkspaces` in `src/shared/hooks/useWorkspaces.ts` — currently queries `client_workspaces.profile_id`; D-02 requires switching to `organization_id` via `useOrg()`
- `useCredits` in `src/modules/tickets/hooks/useCredits.ts` — two queries today: package by `profile_id`, balance via `get_credit_balance(p_profile_id)` RPC
- `get_credit_balance` RPC already exists — the new `get_org_credit_balance` should follow the same signature pattern

### Established Patterns
- All hooks use React Query with `enabled: !!user?.id` guard — org hooks use `enabled: !!organization?.id`
- `useAuth()` throws with German message if used outside provider — `useOrg()` must do the same
- Components < 150 lines (CLAUDE.md rule) — viewer guards are 2-3 lines per component, no risk

### Integration Points
- `src/App.tsx` — insert `<OrgProvider>` between `<AuthProvider>` and `<AppRoutes>`
- `src/shared/hooks/` — new `useOrg.ts` file (OrgContext + OrgProvider + useOrg hook)
- `supabase/migrations/` — new migration for `get_org_credit_balance` RPC
- `TaskDetail.tsx` renders both `CreditApproval` and `TaskActions` — both need viewer guards; `TaskDetail` itself does NOT need a guard (it shows task info, only hides action buttons)

</code_context>

<deferred>
## Deferred Ideas

- `/organisation` admin page — Phase 12
- Member invite from frontend — Phase 12
- `/passwort-setzen` route — Phase 12
- Dropping `get_credit_balance` profile-scoped RPC — Phase 13 cleanup
- Dropping `profile_id` fallbacks in `useWorkspaces` / `useCredits` — Phase 13

</deferred>

---

*Phase: 11-org-frontend-auth*
*Context gathered: 2026-04-15*
