# Phase 11: org-frontend-auth - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 9 (2 new, 7 modified)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/shared/hooks/useOrg.ts` | provider + hook | request-response | `src/shared/hooks/useAuth.ts` | exact |
| `src/App.tsx` | config | request-response | `src/App.tsx` (self — insertion only) | exact |
| `src/shared/hooks/useWorkspaces.ts` | hook | CRUD | `src/shared/hooks/useWorkspaces.ts` (self — query update) | exact |
| `src/modules/tickets/hooks/useCredits.ts` | hook | CRUD + event-driven | `src/modules/tickets/hooks/useCredits.ts` (self — query update) | exact |
| `src/modules/tickets/components/TaskActions.tsx` | component | request-response | `src/modules/tickets/components/CreditApproval.tsx` | role-match |
| `src/modules/tickets/components/CreditApproval.tsx` | component | request-response | `src/modules/tickets/components/TaskActions.tsx` | role-match |
| `src/modules/tickets/pages/TicketsPage.tsx` | component (page) | request-response | `src/modules/tickets/pages/TicketsPage.tsx` (self — guard insertion) | exact |
| `supabase/migrations/YYYYMMDDHHMMSS_org_rls_and_credit_rpc.sql` | migration | batch | `supabase/migrations/20260414200000_org_foundation.sql` | exact |
| `src/shared/__tests__/useOrg.test.ts` | test | — | `src/shared/__tests__/password-validation.test.ts` + `src/modules/tickets/__tests__/support-chat.test.tsx` | role-match |

---

## Pattern Assignments

### `src/shared/hooks/useOrg.ts` (provider + hook, request-response)

**Analog:** `src/shared/hooks/useAuth.ts`

**Imports pattern** (lines 1-6 of analog):
```typescript
import { createContext, useContext, useState, useEffect, type ReactNode, createElement } from 'react'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
```

**Context + guard hook pattern** (analog lines 40-60):
```typescript
// Interface shape
interface OrgContextValue {
  organization: Organization | null
  orgRole: 'admin' | 'member' | 'viewer'
  isAdmin: boolean
  isMember: boolean
  isViewer: boolean
  isLoading: boolean
}

const OrgContext = createContext<OrgContextValue | null>(null)

// Guard hook — throws German error when called outside provider
// Mirrors: src/shared/hooks/useAuth.ts lines 56-60
export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg muss innerhalb von OrgProvider verwendet werden')
  return ctx
}
```

**Provider component + useEffect trigger pattern** (analog lines 72-128):
```typescript
// Mirrors AuthProvider exactly: useState initial state, useEffect on dependency,
// mounted guard for async cleanup, createElement for provider return.
// src/shared/hooks/useAuth.ts lines 72-128

export function OrgProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [orgData, setOrgData] = useState<OrgContextValue>({
    organization: null,
    orgRole: 'member',
    isAdmin: false,
    isMember: true,   // permissive default per D-04
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

**Supabase fetch helper pattern** (analog: `fetchProfile` at lines 62-70):
```typescript
// Analog uses .maybeSingle() + null return on error
// src/shared/hooks/useAuth.ts lines 62-70
async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) return null
  return data as Profile | null
}

// OrgProvider equivalent uses join syntax:
async function fetchOrgForUser(userId: string): Promise<Omit<OrgContextValue, 'isLoading'>> {
  const { data, error } = await supabase
    .from('org_members')
    .select('role, organizations(id, name, slug, clickup_list_ids, nextcloud_client_root, support_task_id, clickup_chat_channel_id)')
    .eq('profile_id', userId)
    .maybeSingle()

  if (error || !data) {
    // Legacy fallback per D-04 — mirrors permissive default
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

**Organization TypeScript interface** (from RESEARCH.md Code Examples):
```typescript
export interface Organization {
  id: string
  name: string
  slug: string
  clickup_list_ids: string[]
  nextcloud_client_root: string | null
  support_task_id: string | null
  clickup_chat_channel_id: string | null
  created_at: string
  updated_at: string
}
```

---

### `src/App.tsx` (config, request-response)

**Analog:** `src/App.tsx` (self — minimal insertion)

**Current provider tree** (lines 16-29):
```tsx
// src/App.tsx lines 16-29 — current state
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
```

**Target provider tree after D-01** (insert OrgProvider between AuthProvider and AppRoutes):
```tsx
// OrgProvider wraps ONLY AppRoutes — NOT Toaster (per Pitfall 5 in RESEARCH.md)
<AuthProvider>
  <OrgProvider>
    <AppRoutes />
  </OrgProvider>
  <Toaster position="top-right" richColors />
</AuthProvider>
```

**Import to add:**
```typescript
import { OrgProvider } from '@/shared/hooks/useOrg'
```

---

### `src/shared/hooks/useWorkspaces.ts` (hook, CRUD)

**Analog:** `src/shared/hooks/useWorkspaces.ts` (self — query change)

**Current pattern** (lines 1-35 — full file):
```typescript
// src/shared/hooks/useWorkspaces.ts — current (profile_id scoped)
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'

export function useWorkspaces() {
  const { user } = useAuth()

  return useQuery<ClientWorkspace[]>({
    queryKey: ['workspaces', user?.id],
    queryFn: async () => {
      if (!user?.id) return []
      const { data, error } = await supabase
        .from('client_workspaces')
        .select('*')
        .eq('profile_id', user.id)   // ← change to organization_id
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) return []
      return data ?? []
    },
    enabled: !!user?.id,             // ← change to !!organization?.id
    staleTime: 5 * 60 * 1000,
  })
}
```

**Required changes (per D-08, ORG-FE-AUTH-02):**
- Replace `useAuth` import with `useOrg`; extract `organization` not `user`
- `queryKey`: `['workspaces', organization?.id]`
- `queryFn` guard: `if (!organization?.id) return []`
- `.eq('profile_id', user.id)` → `.eq('organization_id', organization.id)`
- `enabled`: `!!organization?.id`

---

### `src/modules/tickets/hooks/useCredits.ts` (hook, CRUD + event-driven)

**Analog:** `src/modules/tickets/hooks/useCredits.ts` (self — query update)

**Current imports block** (lines 1-4):
```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/shared/lib/supabase';
import { useAuth } from '@/shared/hooks/useAuth';
```

**Current package query** (lines 26-41):
```typescript
const { data: pkg, isLoading: pkgLoading } = useQuery({
  queryKey: ['credit-package', user?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .from('credit_packages')
      .select('id, package_name, credits_per_month, is_active')
      .eq('profile_id', user!.id)    // ← change to organization_id
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data as CreditPackage | null;
  },
  enabled: !!user?.id,               // ← change to !!organization?.id
  staleTime: 1000 * 60 * 10,
});
```

**Current balance RPC query** (lines 44-57):
```typescript
const { data: balance = 0, isLoading: balanceLoading } = useQuery({
  queryKey: ['credit-balance', user?.id],
  queryFn: async () => {
    const { data, error } = await supabase
      .rpc('get_credit_balance', { p_profile_id: user!.id });  // ← change RPC name + param
    if (error) {
      console.warn('[Credits] get_credit_balance RPC error:', error.message);
      return 0;
    }
    return Number(data) || 0;
  },
  enabled: !!user?.id,               // ← change to !!organization?.id
  staleTime: 1000 * 60 * 2,
});
```

**Current realtime subscription** (lines 60-82):
```typescript
useEffect(() => {
  if (!user?.id) return;

  const channel = supabase
    .channel(`credit-transactions-${user.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'credit_transactions',
      filter: `profile_id=eq.${user.id}`,   // ← change to organization_id=eq.${organization.id}
    }, () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = setTimeout(() => {
        queryClient.refetchQueries({ queryKey: ['credit-balance', user.id] });  // ← update key
      }, 300);
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
  };
}, [user?.id, queryClient]);  // ← update dependency
```

**Required changes summary (per D-08, ORG-FE-AUTH-03):**
- Import `useOrg` instead of (or in addition to) `useAuth`; extract `organization`
- `queryKey` for package: `['credit-package', organization?.id]`
- Package query: `.eq('organization_id', organization.id)` (drop `.eq('profile_id', ...)`)
- Balance RPC: `.rpc('get_org_credit_balance', { p_org_id: organization!.id })`
- `queryKey` for balance: `['credit-balance', organization?.id]`
- All `enabled` guards: `!!organization?.id`
- Realtime channel name: `credit-transactions-org-${organization.id}`
- Realtime filter: `organization_id=eq.${organization.id}`
- Realtime refetch key: `['credit-balance', organization.id]`
- Realtime effect dependency: `[organization?.id, queryClient]`

---

### `src/modules/tickets/components/TaskActions.tsx` (component, request-response)

**Analog:** `src/modules/tickets/components/TaskActions.tsx` (self — guard insertion)

**Current component opening** (lines 14-18):
```typescript
export function TaskActions({ taskId, status }: TaskActionsProps) {
  const { approveTask, requestChanges, putOnHold, resumeTask, cancelTask, isLoading } = useTaskActions();
  const [confirm, setConfirm] = useState<TaskAction | null>(null);

  if (isTerminal(status as import('../types/tasks').TaskStatus)) return null;
```

**Guard to insert after existing early return** (per D-05, ORG-FE-AUTH-06):
```typescript
export function TaskActions({ taskId, status }: TaskActionsProps) {
  const { approveTask, requestChanges, putOnHold, resumeTask, cancelTask, isLoading } = useTaskActions();
  const { isViewer } = useOrg()                                  // ADD
  const [confirm, setConfirm] = useState<TaskAction | null>(null);

  if (isTerminal(status as import('../types/tasks').TaskStatus)) return null;
  if (isViewer) return null                                       // ADD — after terminal check
```

**Import to add:**
```typescript
import { useOrg } from '@/shared/hooks/useOrg'
```

---

### `src/modules/tickets/components/CreditApproval.tsx` (component, request-response)

**Analog:** `src/modules/tickets/components/TaskActions.tsx` (same guard pattern)

**Current component opening** (lines 17-18):
```typescript
export function CreditApproval({ taskId, credits, taskName: _taskName }: Props) {
  const [mode, setMode] = useState<'buttons' | 'declining'>('buttons');
```

**Guard to insert** (per D-05, ORG-FE-AUTH-05):
```typescript
export function CreditApproval({ taskId, credits, taskName: _taskName }: Props) {
  const { isViewer } = useOrg()                                  // ADD
  const [mode, setMode] = useState<'buttons' | 'declining'>('buttons');
  // ...
  if (isViewer) return null                                       // ADD — before main render
```

**Import to add:**
```typescript
import { useOrg } from '@/shared/hooks/useOrg'
```

---

### `src/modules/tickets/pages/TicketsPage.tsx` (component/page, request-response)

**Analog:** `src/modules/tickets/pages/TicketsPage.tsx` (self — guard on NewTaskButton render)

**Current NewTaskButton render** (line 54):
```tsx
// src/modules/tickets/pages/TicketsPage.tsx line 54
<NewTaskButton onClick={() => setDialogOpen(true)} />
```

**Guard to apply** (per D-05, ORG-FE-AUTH-04 — guard on button, NOT inside dialog):
```tsx
// Add useOrg import and destructure isViewer in function body
const { isViewer } = useOrg()

// Replace unconditional render:
{!isViewer && <NewTaskButton onClick={() => setDialogOpen(true)} />}
```

**Import to add:**
```typescript
import { useOrg } from '@/shared/hooks/useOrg'
```

---

### `supabase/migrations/YYYYMMDDHHMMSS_org_rls_and_credit_rpc.sql` (migration, batch)

**Analog:** `supabase/migrations/20260414200000_org_foundation.sql`

**SQL function pattern** (analog lines 52-66 — `user_org_ids()` function structure):
```sql
-- Mirrors user_org_ids() pattern: SECURITY DEFINER, stable, set search_path = '',
-- revoke from public, grant to authenticated+anon+service_role
-- supabase/migrations/20260414200000_org_foundation.sql lines 52-66

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

**RLS policy pattern** (analog lines 192-198 — org-scoped select policy):
```sql
-- Mirrors: supabase/migrations/20260414200000_org_foundation.sql lines 192-198
-- These two policies are the Wave 0 hard blocker (Pitfall 1 in RESEARCH.md):

create policy "members can read own membership"
  on public.org_members for select
  to authenticated
  using (profile_id = auth.uid());

create policy "members can read own organization"
  on public.organizations for select
  to authenticated
  using (id in (select organization_id from public.org_members where profile_id = auth.uid()));
```

---

### Test files (new, unit)

**Analog:** `src/shared/__tests__/password-validation.test.ts` (pure unit) + `src/modules/tickets/__tests__/support-chat.test.tsx` (component with mocked hooks)

**Pure unit test structure** (analog lines 1-10):
```typescript
import { beforeEach, describe, expect, test, vi } from 'vitest'
// ... imports from module under test

describe('feature name', () => {
  test('specific behavior', () => {
    expect(actual).toBe(expected)
  })
})
```

**Mocked hook pattern for component tests** (analog lines 1-12 of support-chat.test.tsx):
```typescript
const mocks = vi.hoisted(() => ({
  orgHook: vi.fn(),
}))

vi.mock('@/shared/hooks/useOrg', () => ({
  useOrg: () => mocks.orgHook(),
}))
```

**OrgProvider mock for viewer-role component tests** (from RESEARCH.md Validation section):
```typescript
// Use in CreditApproval.test.tsx, TaskActions.test.tsx, TicketsPage.viewer.test.tsx
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

**QueryClientProvider wrapper** (from CLAUDE.md testing section):
```typescript
// Wrap any component that uses React Query
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)
```

---

## Shared Patterns

### Context Guard Hook (throw outside provider)
**Source:** `src/shared/hooks/useAuth.ts` lines 56-59
**Apply to:** `useOrg.ts`
```typescript
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden')
  return ctx
}
```

### Mounted Guard for Async Effects
**Source:** `src/shared/hooks/useAuth.ts` lines 92-106
**Apply to:** `useOrg.ts` OrgProvider useEffect
```typescript
let mounted = true
// async operation...then(result => {
//   if (!mounted) return
//   setState(result)
// })
return () => { mounted = false }
```

### React Query enabled Guard
**Source:** `src/shared/hooks/useWorkspaces.ts` line 24 + `src/modules/tickets/hooks/useCredits.ts` lines 39, 55
**Apply to:** All org-scoped queries in `useWorkspaces.ts` and `useCredits.ts`
```typescript
enabled: !!organization?.id,  // replaces !!user?.id
```

### Realtime Debounce Pattern
**Source:** `src/modules/tickets/hooks/useCredits.ts` lines 60-82
**Apply to:** `useCredits.ts` org-scoped realtime subscription (same structure, change filter column)
```typescript
const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// ...
if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
realtimeDebounceRef.current = setTimeout(() => {
  queryClient.refetchQueries({ queryKey: ['credit-balance', organization.id] });
}, 300);
```

### SQL Function Security Pattern
**Source:** `supabase/migrations/20260414200000_org_foundation.sql` lines 52-66
**Apply to:** `get_org_credit_balance` in migration
```sql
security definer
set search_path = ''
-- ...
revoke execute on function public.fn_name(...) from public;
grant execute on function public.fn_name(...) to authenticated, anon, service_role;
```

### Viewer Guard (inline, no abstraction)
**Source:** D-05 decision (CONTEXT.md) + RESEARCH.md Pattern 3
**Apply to:** `TaskActions.tsx`, `CreditApproval.tsx`, `TicketsPage.tsx`
```typescript
const { isViewer } = useOrg()
if (isViewer) return null  // for components
// or
{!isViewer && <Button />}  // for conditional render in JSX
```

---

## No Analog Found

All files in this phase have direct analogs in the codebase. No files require falling back to RESEARCH.md patterns exclusively.

---

## Wave 0 Prerequisite (Hard Blocker)

The migration file must be applied **before** any frontend code that calls `supabase.from('org_members')` is deployed. Without the RLS policies on `org_members` and `organizations`, the `OrgProvider` fetch returns empty data and every user gets the legacy fallback — making the entire phase a no-op.

**Order of operations:**
1. Create and apply migration (RLS policies + `get_org_credit_balance` RPC)
2. Deploy `useOrg.ts` + `App.tsx` update
3. Deploy `useWorkspaces.ts` + `useCredits.ts` updates
4. Deploy viewer guard component changes

---

## Metadata

**Analog search scope:** `src/shared/hooks/`, `src/modules/tickets/hooks/`, `src/modules/tickets/components/`, `src/modules/tickets/pages/`, `supabase/migrations/`, `src/shared/__tests__/`, `src/modules/tickets/__tests__/`
**Files scanned:** 14
**Pattern extraction date:** 2026-04-15
