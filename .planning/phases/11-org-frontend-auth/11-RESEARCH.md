# Phase 11: org-frontend-auth — Research

**Researched:** 2026-04-15
**Domain:** React Context + React Query — org-scoped frontend auth layer
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `<OrgProvider>` wraps `AppRoutes`, placed inside `AuthProvider` in `src/App.tsx`
  ```
  QueryClientProvider > BrowserRouter > AuthProvider > OrgProvider > AppRoutes
  ```
- **D-02:** `useOrg()` is a standalone hook backed by `OrgContext` — separate from `useAuth()`. Components import `useOrg`, not `useAuth` for org data.
- **D-03:** `OrgProvider` fetches org data when `user` becomes available (reacts to `useAuth()` user state). Fetches `org_members` row for the current user, joins `organizations` to get org details.
- **D-04:** Legacy fallback when `org_members` returns no row: `{ organization: null, orgRole: 'member', isAdmin: false, isMember: true, isViewer: false }`. All UI visible. Edge Functions gate mutation at 403.
- **D-05:** Inline `useOrg()` in each of the three components — no shared abstraction. `NewTicketDialog` button on `TicketsPage`, `CreditApproval`, `TaskActions` — each gets `const { isViewer } = useOrg(); if (isViewer) return null`.
- **D-06:** No `useCanMutate()` hook or `<CanDo>` wrapper in this phase. Phase 12 can add admin checks the same way.
- **D-07:** New `get_org_credit_balance(p_org_id uuid)` SQL function via migration in `supabase/migrations/`. Sums `credit_transactions` for all packages belonging to the org.
- **D-08:** `useCredits` updated: (1) get `organization.id` from `useOrg()`, (2) query `credit_packages` by `organization_id`, (3) call `get_org_credit_balance(organization.id)` RPC, (4) cache keys change to `['credit-package', organization?.id]` and `['credit-balance', organization?.id]`.
- **D-09:** Old `get_credit_balance(p_profile_id)` RPC is NOT dropped in this phase. Cleanup is Phase 13.

### Claude's Discretion

- Error state when org fetch fails (network error) — show neutral loading state or silent fallback, implementation choice
- Exact Supabase query for `getOrgForUser` — whether to join in one query or two lookups
- React Query `staleTime` for org data — reasonable default (e.g., 10 minutes)
- TypeScript interface shape for `Organization` type (beyond what's in DATABASE_SCHEMA.md)

### Deferred Ideas (OUT OF SCOPE)

- `/organisation` admin page — Phase 12
- Member invite from frontend — Phase 12
- `/passwort-setzen` route — Phase 12
- Dropping `get_credit_balance` profile-scoped RPC — Phase 13 cleanup
- Dropping `profile_id` fallbacks in `useWorkspaces` / `useCredits` — Phase 13
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORG-FE-AUTH-01 | `OrgContext` created — provides `organization`, `orgRole`, `isAdmin`, `isMember`, `isViewer` to all components; fetched once at login and cached | Provider pattern mirrors `AuthProvider` in `useAuth.ts`; React Query cache with `enabled: !!user?.id` guard |
| ORG-FE-AUTH-02 | `useWorkspaces` updated to query `client_workspaces` by `organization_id` via `OrgContext` | Drop `eq('profile_id', user.id)`, replace with `eq('organization_id', organization.id)`; cache key changes to `['workspaces', organization?.id]` |
| ORG-FE-AUTH-03 | `useCredits` updated to fetch credit balance summed by `organization_id` | New `get_org_credit_balance` RPC migration; `credit_packages` queried by `organization_id`; realtime filter updates to org scope |
| ORG-FE-AUTH-04 | `NewTicketDialog` hidden for viewer role | Viewer guard on `NewTaskButton` in `TicketsPage` (inline `isViewer` check, return null or hide button) |
| ORG-FE-AUTH-05 | Kostenfreigabe (credit approval) hidden for viewer role | Inline `isViewer` in `CreditApproval.tsx` — if `isViewer` return null before render |
| ORG-FE-AUTH-06 | Task action buttons (Freigeben, Änderungen anfordern) hidden for viewer role | Inline `isViewer` in `TaskActions.tsx` — if `isViewer` return null before render |
</phase_requirements>

---

## Summary

Phase 11 wires the org/role layer that Phases 9-10 built into every frontend consumer. The work is almost entirely a **frontend plumbing phase** — no new server-side logic beyond one SQL function migration for the org-scoped credit balance RPC.

The primary deliverable is `src/shared/hooks/useOrg.ts` — a file that exports `OrgContext`, `OrgProvider`, and `useOrg()`. Its internal structure mirrors `AuthProvider` in `useAuth.ts` exactly: `useState` + `useEffect` triggered by `user` from `useAuth()`, providing context values downward, throwing a German error when called outside the provider. This pattern is already proven in the codebase and implementation agents can follow it directly.

The secondary deliverables are three hook updates (`useWorkspaces`, `useCredits`) and three viewer-guard additions (two-liner each in `NewTicketDialog`/button, `CreditApproval`, `TaskActions`). All six guard additions are mechanical changes — no architectural decisions required at implementation time.

**Primary recommendation:** Build `useOrg.ts` first (ORG-FE-AUTH-01), then update `useWorkspaces` and `useCredits` (ORG-FE-AUTH-02/03), then add viewer guards (ORG-FE-AUTH-04/05/06). The migration for `get_org_credit_balance` must precede or accompany ORG-FE-AUTH-03.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OrgContext / OrgProvider | Frontend (React Context) | — | Pure client state derived from Supabase query at login; no server rendering |
| Org data fetch (`org_members` + `organizations`) | Frontend (React Query) | Database (RLS) | Client fires authenticated RPC; RLS on `org_members` controls what's visible |
| `get_org_credit_balance` RPC | Database (Postgres function) | — | Aggregation logic belongs in DB, not in client JS |
| Viewer role guard (UI hide) | Frontend (React component) | — | Cosmetic guard only; enforced at API tier by Edge Function 403 (Phase 10 ORG-BE-11) |
| `useWorkspaces` org-scope | Frontend (React Query) | Database (RLS) | Column change only; RLS already supports org-scoped queries (Phase 9) |
| `useCredits` org-scope | Frontend (React Query) | Database (SQL function) | Cache key change + new RPC call; org-scoped RLS already in place |

---

## Standard Stack

### Core (already installed — no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React | 19.x | Context API, createContext, useContext, useState, useEffect | Project requirement |
| @tanstack/react-query | 5.x | Server state cache, `useQuery` with `enabled` guard | Project standard for all server state |
| @supabase/supabase-js | 2.x | `.from('org_members').select(...)`, `.rpc('get_org_credit_balance', ...)` | Project backend |

**No new npm packages required for this phase.** [VERIFIED: codebase grep]

### Migration (new SQL function)

The only new artifact outside frontend code is `supabase/migrations/YYYYMMDDHHMMSS_org_credit_balance.sql` defining `get_org_credit_balance(p_org_id uuid)`.

---

## Architecture Patterns

### System Architecture Diagram

```
User logs in
     |
     v
AuthProvider (useAuth.ts)
  user: User | null
     |
     v  [user becomes non-null]
OrgProvider (useOrg.ts)
  - queries org_members WHERE profile_id = user.id
  - joins organizations for org details
  - provides: organization, orgRole, isAdmin, isMember, isViewer
     |
     +---> useWorkspaces()          reads client_workspaces WHERE organization_id = org.id
     |
     +---> useCredits()             reads credit_packages WHERE organization_id = org.id
     |                              calls get_org_credit_balance(org.id) RPC
     |
     +---> TicketsPage              if isViewer → NewTaskButton hidden
     |
     +---> TaskActions              if isViewer → return null (entire component)
     |
     +---> CreditApproval           if isViewer → return null (entire component)
```

### Recommended Project Structure

```
src/shared/hooks/
├── useAuth.ts          (unchanged)
├── useOrg.ts           (NEW — OrgContext + OrgProvider + useOrg)
├── useWorkspaces.ts    (updated — org_id query)
src/modules/tickets/hooks/
├── useCredits.ts       (updated — org_id query + new RPC)
src/modules/tickets/components/
├── TaskActions.tsx     (updated — isViewer guard)
├── CreditApproval.tsx  (updated — isViewer guard)
src/modules/tickets/pages/
├── TicketsPage.tsx     (updated — isViewer guard on NewTaskButton)
supabase/migrations/
├── YYYYMMDDHHMMSS_org_credit_balance.sql  (NEW)
```

### Pattern 1: OrgProvider (mirrors AuthProvider exactly)

**What:** Context provider that fetches org membership once, provides derived booleans
**When to use:** Wrap AppRoutes in App.tsx so all descendants can call `useOrg()`

```typescript
// Source: mirrors src/shared/hooks/useAuth.ts (VERIFIED: read file)

interface OrgContextValue {
  organization: Organization | null
  orgRole: 'admin' | 'member' | 'viewer'
  isAdmin: boolean
  isMember: boolean
  isViewer: boolean
  isLoading: boolean
}

const OrgContext = createContext<OrgContextValue | null>(null)

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg muss innerhalb von OrgProvider verwendet werden')
  return ctx
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [orgData, setOrgData] = useState<OrgContextValue>({
    organization: null,
    orgRole: 'member',
    isAdmin: false,
    isMember: true,
    isViewer: false,
    isLoading: true,
  })

  useEffect(() => {
    if (!user?.id) {
      setOrgData({ organization: null, orgRole: 'member', isAdmin: false, isMember: true, isViewer: false, isLoading: false })
      return
    }
    let mounted = true
    fetchOrgForUser(user.id).then(result => {
      if (!mounted) return
      setOrgData({ ...result, isLoading: false })
    })
    return () => { mounted = false }
  }, [user?.id])

  return createElement(OrgContext.Provider, { value: orgData }, children)
}
```

### Pattern 2: Supabase join query for org fetch

**What:** Single query fetching `org_members` row + joined `organizations` row
**When to use:** Inside `fetchOrgForUser()` called by OrgProvider's useEffect
**Discretion area:** One query (join) or two lookups — both valid. One query is cleaner.

```typescript
// Source: Supabase JS v2 select with foreign key join (VERIFIED: supabase.js client docs)
async function fetchOrgForUser(userId: string): Promise<OrgFetchResult> {
  const { data, error } = await supabase
    .from('org_members')
    .select('role, organizations(id, name, slug, clickup_list_ids, nextcloud_client_root, support_task_id, clickup_chat_channel_id)')
    .eq('profile_id', userId)
    .maybeSingle()

  if (error || !data) {
    // Legacy fallback per D-04
    return { organization: null, orgRole: 'member', isAdmin: false, isMember: true, isViewer: false }
  }

  const role = data.role as 'admin' | 'member' | 'viewer'
  return {
    organization: data.organizations as Organization,
    orgRole: role,
    isAdmin: role === 'admin',
    isMember: role === 'admin' || role === 'member',
    isViewer: role === 'viewer',
  }
}
```

**Note on RLS:** `org_members` currently has no client-facing RLS policy (Phase 9 CONTEXT.md note: "Phase 9 defines no client-facing read policies on organizations or org_members. Edge Functions... use the service role key."). The OrgProvider query runs as the authenticated user — this means **a client RLS policy on `org_members` must exist for this query to work**. See Common Pitfalls section.

### Pattern 3: Viewer guard — inline (D-05)

**What:** Two-line inline check, no abstraction
**When to use:** `NewTicketDialog` trigger, `CreditApproval`, `TaskActions`

```typescript
// Source: D-05 decision (VERIFIED: CONTEXT.md)
export function CreditApproval({ taskId, credits, taskName }: Props) {
  const { isViewer } = useOrg()
  if (isViewer) return null
  // ... rest of component unchanged
}
```

For `TicketsPage`, the guard should be on the `NewTaskButton` render, not inside `NewTicketDialog`:

```typescript
// TicketsPage.tsx — guard the button that opens the dialog
const { isViewer } = useOrg()
// ...
{!isViewer && <NewTaskButton onClick={() => setDialogOpen(true)} />}
```

### Pattern 4: get_org_credit_balance migration

```sql
-- Source: mirrors get_credit_balance pattern (VERIFIED: codebase read)
create or replace function public.get_org_credit_balance(p_org_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(ct.amount), 0)
  from public.credit_transactions ct
  where ct.organization_id = p_org_id;
$$;

revoke execute on function public.get_org_credit_balance(uuid) from public;
grant execute on function public.get_org_credit_balance(uuid) to authenticated, anon, service_role;
```

**Note:** `credit_transactions.organization_id` was back-filled in Phase 9 migration for all existing rows. New transactions created by Edge Functions in Phase 10 should also set `organization_id`. Verify this assumption before relying on the RPC.

### Pattern 5: useWorkspaces org-scope update

```typescript
// Source: VERIFIED read of src/shared/hooks/useWorkspaces.ts
export function useWorkspaces() {
  const { organization } = useOrg()  // replaces useAuth()

  return useQuery<ClientWorkspace[]>({
    queryKey: ['workspaces', organization?.id],  // key changes
    queryFn: async () => {
      if (!organization?.id) return []
      const { data, error } = await supabase
        .from('client_workspaces')
        .select('*')
        .eq('organization_id', organization.id)  // changed from profile_id
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) return []
      return data ?? []
    },
    enabled: !!organization?.id,  // changed from !!user?.id
    staleTime: 5 * 60 * 1000,
  })
}
```

### Pattern 6: useCredits org-scope update

Current `useCredits` uses `user.id` for both queries. After update:
- `credit_packages` query: `eq('organization_id', organization.id)` (drop `eq('profile_id', ...)`)
- `credit-balance` RPC: call `get_org_credit_balance` with `organization.id`
- Realtime channel filter: `organization_id=eq.${organization.id}` — **requires org_id to be set on new credit_transactions**
- Cache keys: `['credit-package', organization?.id]`, `['credit-balance', organization?.id]`

### Anti-Patterns to Avoid

- **Putting OrgProvider outside AuthProvider:** OrgProvider depends on `useAuth()` — it must be a child of AuthProvider.
- **Using React Query for org context data (as a hook-level query):** CONTEXT.md specifies provider-level state (useState + useEffect), not a standalone `useQuery`. This is intentional — the org data must be available synchronously via context, not as a query with its own loading state per component.
- **Forgetting the RLS gap:** `org_members` has no client-facing RLS policy yet. If this is not addressed before Phase 11, the `fetchOrgForUser` query will return no data for authenticated users and everyone gets the legacy fallback. See Critical Pitfall #1.
- **Guarding inside `NewTicketDialog` itself:** The dialog already receives `open` state from TicketsPage. The guard should be on the button/trigger in `TicketsPage`, not inside the dialog, so the button disappears rather than the dialog silently refusing to open.
- **Using `isMember` as the only positive check:** `isAdmin` users are also members (`isMember = role === 'admin' || role === 'member'`). Components that should show for all non-viewers should check `!isViewer`, not `isMember`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Credit balance aggregation | Custom JS sum over transactions | `get_org_credit_balance` Postgres RPC | Server-side sum is atomic; client-side sum requires fetching all rows |
| Org membership validation | Frontend role checks for security | Edge Function 403 (Phase 10 ORG-BE-11) | Frontend guards are cosmetic; server enforces security |
| Provider pattern boilerplate | Custom pub/sub or event emitter | React Context + createElement pattern (mirrors useAuth.ts) | Already in codebase; proven pattern |

**Key insight:** Frontend role guards in this phase are cosmetic/UX only. All security enforcement is server-side (ORG-BE-11). The frontend can be spoofed — the database cannot.

---

## Critical Pitfall: RLS on org_members

### Pitfall 1: org_members has no client-facing RLS policy
**What goes wrong:** `OrgProvider` calls `supabase.from('org_members').select(...)` as the authenticated user. Phase 9 CONTEXT.md explicitly states: "Phase 9 defines no client-facing read policies on organizations or org_members. Edge Functions that read these tables in Phase 10 will use the service role key." This means the query will return zero rows and every user gets the legacy fallback (`organization: null`), making Phase 11 a no-op.

**Why it happens:** Phase 9 only added org-scoped policies on `credit_packages` and `client_workspaces`. `org_members` and `organizations` were intentionally left for Phase 10+ (Edge Functions use service role key, so they didn't need client-facing policies).

**How to avoid:** Phase 11 Wave 0 **must** add a migration with RLS policies on `org_members` and `organizations` before any other work:
```sql
-- Allow authenticated users to read their own org_members row
create policy "members can read own membership"
  on public.org_members for select
  to authenticated
  using (profile_id = auth.uid());

-- Allow authenticated users to read their own org
create policy "members can read own organization"
  on public.organizations for select
  to authenticated
  using (id in (select organization_id from public.org_members where profile_id = auth.uid()));
```

**Warning signs:** `fetchOrgForUser` returns `null` for all users; everyone sees all UI including viewer-guarded elements; `useWorkspaces` and `useCredits` return empty data.

### Pitfall 2: Stale cache keys after org-scope migration
**What goes wrong:** If a user was previously logged in with the profile-scoped cache (`['credit-package', user.id]`), React Query may serve stale data after the hook update until the cache TTL expires or the user reloads.
**How to avoid:** Cache key change from `user.id` to `organization.id` naturally busts the cache for all users on first load after deploy — this is intentional and correct behavior. No manual cache invalidation needed.

### Pitfall 3: credit_transactions organization_id backfill completeness
**What goes wrong:** `get_org_credit_balance` sums `credit_transactions.organization_id`. If any existing transactions have NULL `organization_id` (e.g., transactions created before Phase 9 migration), the balance will be understated.
**Why it happens:** Phase 9 data migration back-filled `organization_id` on existing rows, but the function in Phase 10 that creates new transactions (credit top-up, credit deduction) may not yet set `organization_id`.
**How to avoid:** Before deploying Phase 11, verify that `credit_transactions` rows post-Phase 9 have `organization_id` set. SQL: `SELECT COUNT(*) FROM credit_transactions WHERE organization_id IS NULL`. If any exist, they need back-fill or the sum function needs a fallback join through `profile_id`.

### Pitfall 4: useOrg() called in components that mount before OrgProvider loads
**What goes wrong:** If `isLoading: true` during OrgProvider fetch, components using `isViewer` may briefly show viewer-restricted UI before the role resolves.
**How to avoid:** OrgProvider initializes with `isLoading: true` and `isViewer: false`. This means all UI is visible during load (permissive default), which is correct — viewers see a brief flash of the button before it hides. This is acceptable; a loading spinner is not required for guards. If flash is unacceptable, check `isLoading` before rendering the guarded element.

### Pitfall 5: App.tsx Toaster placement after OrgProvider insert
**What goes wrong:** `<Toaster>` is currently a sibling of `<AppRoutes>` inside `AuthProvider`. If `OrgProvider` wraps only `AppRoutes`, `Toaster` stays outside it — no issue. But if the developer accidentally wraps both, `Toaster` would be inside `OrgProvider` which is fine but unnecessary.
**How to avoid:** Per D-01, `OrgProvider` wraps only `AppRoutes`, not `Toaster`. The correct tree:
```tsx
<AuthProvider>
  <OrgProvider>
    <AppRoutes />
  </OrgProvider>
  <Toaster position="top-right" richColors />
</AuthProvider>
```

---

## Code Examples

### App.tsx after OrgProvider insertion
```tsx
// Source: D-01 (VERIFIED: CONTEXT.md), mirrored from src/App.tsx (VERIFIED: read file)
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <OrgProvider>
            <AppRoutes />
          </OrgProvider>
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
```

### Organization TypeScript interface
```typescript
// Source: org_foundation.sql (VERIFIED: read migration) + CONTEXT.md discretion
export interface Organization {
  id: string
  name: string
  slug: string
  clickup_list_ids: string[]   // jsonb array in DB
  nextcloud_client_root: string | null
  support_task_id: string | null
  clickup_chat_channel_id: string | null
  created_at: string
  updated_at: string
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Profile-scoped credit balance (`get_credit_balance(p_profile_id)`) | Org-scoped balance (`get_org_credit_balance(p_org_id)`) | Phase 11 | Multi-member orgs share credit pool |
| `useWorkspaces` by `profile_id` | `useWorkspaces` by `organization_id` | Phase 11 | All org members see same workspaces |
| No role context in frontend | `useOrg()` exposes `isAdmin/isMember/isViewer` | Phase 11 | Enables viewer-role UI hiding |

---

## Runtime State Inventory

> Phase 11 is a code/schema-additive phase. No data rename or migration of existing production data.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | No stored strings being renamed | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None | None |
| Build artifacts | None | None |

**Note on migration:** The `get_org_credit_balance` SQL function is new — not a rename. It must be applied to staging Cloud Supabase before frontend code that calls it is deployed. The RLS policies for `org_members` and `organizations` also require a migration applied before Phase 11 frontend deploys.

---

## Environment Availability

| Dependency | Required By | Available | Fallback |
|------------|------------|-----------|----------|
| Cloud Supabase staging (`ahlthosftngdcryltapu`) | All Phase 11 work | Yes (project requirement) | — |
| Supabase CLI | Migration apply | [ASSUMED] installed — used in Phase 9/10 | Manual Management API apply |
| React 19 / React Query 5 | OrgProvider | Yes (package.json) | — |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + jsdom + @testing-library/react |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm run test -- --run src/shared/__tests__/useOrg.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORG-FE-AUTH-01 | `useOrg()` returns correct role booleans | unit | `npm run test -- --run src/shared/__tests__/useOrg.test.ts` | ❌ Wave 0 |
| ORG-FE-AUTH-01 | `useOrg()` throws outside OrgProvider | unit | same file | ❌ Wave 0 |
| ORG-FE-AUTH-01 | Legacy fallback when `org_members` returns no row | unit | same file | ❌ Wave 0 |
| ORG-FE-AUTH-02 | `useWorkspaces` uses `organization_id` in query key | unit | `npm run test -- --run src/shared/__tests__/useWorkspaces.test.ts` | ❌ Wave 0 |
| ORG-FE-AUTH-03 | `useCredits` cache keys use `organization.id` | unit | `npm run test -- --run src/modules/tickets/__tests__/useCredits.test.ts` | ❌ Wave 0 |
| ORG-FE-AUTH-04 | `NewTaskButton` not rendered for viewer | unit (component) | `npm run test -- --run src/modules/tickets/__tests__/TicketsPage.viewer.test.tsx` | ❌ Wave 0 |
| ORG-FE-AUTH-05 | `CreditApproval` returns null for viewer | unit (component) | `npm run test -- --run src/modules/tickets/__tests__/CreditApproval.test.tsx` | ❌ Wave 0 |
| ORG-FE-AUTH-06 | `TaskActions` returns null for viewer | unit (component) | `npm run test -- --run src/modules/tickets/__tests__/TaskActions.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- --run src/shared/__tests__/useOrg.test.ts`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/shared/__tests__/useOrg.test.ts` — covers ORG-FE-AUTH-01 (role booleans, provider guard, legacy fallback)
- [ ] `src/modules/tickets/__tests__/CreditApproval.test.tsx` — covers ORG-FE-AUTH-05 (viewer guard)
- [ ] `src/modules/tickets/__tests__/TaskActions.test.tsx` — covers ORG-FE-AUTH-06 (viewer guard)

**Note:** `useWorkspaces` and `useCredits` are React Query hooks calling Supabase directly — testing them requires mocking `supabase` client and `useOrg`. Pattern already established in codebase (`vi.mock('@/shared/lib/supabase', ...)`). Viewer guard component tests need a mock `OrgProvider` wrapper that injects `{ isViewer: true }`.

### OrgProvider Mock Pattern for Tests

```typescript
// Mock for viewer-role tests
vi.mock('@/shared/hooks/useOrg', () => ({
  useOrg: () => ({
    organization: null,
    orgRole: 'viewer',
    isAdmin: false,
    isMember: false,
    isViewer: true,
    isLoading: false,
  }),
}))
```

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | (handled by Phase 9/10 at DB layer) |
| V3 Session Management | No | (handled by AuthProvider) |
| V4 Access Control | Yes | Edge Function 403 (ORG-BE-11, Phase 10 — already complete) |
| V5 Input Validation | No | (no new form inputs in this phase) |
| V6 Cryptography | No | — |

**Key security note:** Frontend role guards (ORG-FE-AUTH-04/05/06) are cosmetic — the authoritative enforcement is ORG-BE-11 (Edge Functions return 403 to viewers on mutating operations). This was completed in Phase 10. Phase 11 frontend guards improve UX, not security.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `credit_transactions` rows created after Phase 9 have `organization_id` set by Edge Functions | Pitfall 3, Pattern 4 | `get_org_credit_balance` returns understated balance; credits UI shows wrong number |
| A2 | Supabase JS v2 supports foreign key join syntax (`organizations(id, ...)`) in `.select()` | Pattern 2 | Need to use two separate queries instead of join |
| A3 | `org_members` table on staging has data (Phase 9 data migration applied) | All patterns | OrgProvider returns legacy fallback for everyone; all guards are no-ops |

**Mitigations:**
- A1: Verify with `SELECT COUNT(*) FROM credit_transactions WHERE organization_id IS NULL` in staging before deploying useCredits changes. Include in Wave 0 checklist.
- A2: Supabase JS v2 select with embedded relationships is a documented feature [CITED: supabase.com/docs/reference/javascript/select]. Confirmed via project's supabase-context-hub.
- A3: Phase 9 is marked Complete in REQUIREMENTS.md traceability table. No risk.

---

## Open Questions

1. **Does `org_members` need client-facing RLS before Phase 11 deploys?**
   - What we know: Phase 9 explicitly did not add client-facing policies on `org_members` or `organizations`
   - What's unclear: Was this deferred to Phase 11 planning, or assumed to be a prerequisite handled separately?
   - Recommendation: **Treat as Wave 0 in Phase 11 — the first plan wave must add a migration with `org_members` + `organizations` RLS policies.** This is a hard blocker: without it, `OrgProvider` fetch returns empty and the entire phase is a no-op.

2. **Should `useWorkspaces` keep the `profile_id` path as fallback during transition?**
   - What we know: D-09 says old `get_credit_balance` RPC is not dropped; the spirit of the transition is dual-path
   - What's unclear: CONTEXT.md does not explicitly state whether `useWorkspaces` should dual-read or hard-cut
   - Recommendation: **Hard-cut** to `organization_id` only. The Phase 9 migration back-filled `organization_id` on all `client_workspaces` rows, so legacy users' data is accessible via org_id. Keeping `profile_id` fallback would complicate the code for no benefit (different from Edge Functions where dual-read was needed for in-flight requests).

---

## Sources

### Primary (HIGH confidence)
- `src/shared/hooks/useAuth.ts` — canonical OrgProvider pattern template (VERIFIED: read file)
- `src/App.tsx` — current provider tree, insertion point confirmed (VERIFIED: read file)
- `src/shared/hooks/useWorkspaces.ts` — current query using `profile_id` (VERIFIED: read file)
- `src/modules/tickets/hooks/useCredits.ts` — current profile-scoped queries (VERIFIED: read file)
- `src/modules/tickets/components/TaskActions.tsx` — guard insertion point confirmed (VERIFIED: read file)
- `src/modules/tickets/components/CreditApproval.tsx` — guard insertion point confirmed (VERIFIED: read file)
- `src/modules/tickets/pages/TicketsPage.tsx` — NewTaskButton location confirmed (VERIFIED: read file)
- `supabase/migrations/20260414200000_org_foundation.sql` — `org_members`, `organizations` schema, no client RLS (VERIFIED: read file)
- `.planning/REQUIREMENTS.md` — requirements ORG-FE-AUTH-01 through ORG-FE-AUTH-06 (VERIFIED: read file)
- `.planning/phases/11-org-frontend-auth/11-CONTEXT.md` — all implementation decisions D-01 through D-09 (VERIFIED: read file)
- `.planning/phases/09-org-db-foundation/09-CONTEXT.md` — confirms no client RLS on org_members (VERIFIED: read file)

### Secondary (MEDIUM confidence)
- Supabase JS v2 select with embedded relationships — standard feature [CITED: supabase.com/docs/reference/javascript/select]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries already installed and in active use
- Architecture: HIGH — provider tree is deterministic (D-01 through D-09 lock all decisions)
- Pitfalls: HIGH — RLS gap on `org_members` is verified from migration file; not speculative
- Test patterns: HIGH — mirrors established patterns in codebase

**Research date:** 2026-04-15
**Valid until:** 2026-05-15 (stable library versions; Supabase RLS model stable)
