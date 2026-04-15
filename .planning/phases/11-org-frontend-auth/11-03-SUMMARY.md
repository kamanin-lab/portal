---
phase: 11-org-frontend-auth
plan: "03"
subsystem: frontend-hooks
tags: [org-scoped, react-query, realtime, tdd]
dependency_graph:
  requires: [11-01, 11-02]
  provides: [ORG-FE-AUTH-02, ORG-FE-AUTH-03]
  affects: [useWorkspaces, useCredits, SidebarWorkspaces]
tech_stack:
  added: []
  patterns: [org-scoped-query, realtime-channel-org-filter, tdd-vertical-slice]
key_files:
  modified:
    - src/shared/hooks/useWorkspaces.ts
    - src/modules/tickets/hooks/useCredits.ts
    - src/shared/components/layout/SidebarWorkspaces.tsx
  created:
    - src/shared/__tests__/useWorkspaces.test.ts
    - src/modules/tickets/__tests__/useCredits.test.ts
decisions:
  - "Added pkg to UseCreditsResult return shape to support test assertions and future consumers"
  - "Kept ClientWorkspace export from useWorkspaces.ts (SidebarWorkspaces imports it) but updated profile_id -> organization_id field"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-15"
  tasks_completed: 2
  files_changed: 5
---

# Phase 11 Plan 03: Migrate useWorkspaces and useCredits to org-scoped queries — Summary

**One-liner:** Replaced `useAuth`/`profile_id` with `useOrg`/`organization_id` in both hooks; switched credit balance RPC from `get_credit_balance(p_profile_id)` to `get_org_credit_balance(p_org_id)`; org-scoped realtime filter.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Migrate useWorkspaces to organization_id | 0e19838 | useWorkspaces.ts, useWorkspaces.test.ts, SidebarWorkspaces.tsx |
| 2 | Migrate useCredits to organization_id (package + RPC + realtime) | 0e19838 | useCredits.ts, useCredits.test.ts |

## Exact Diff Applied

### useWorkspaces.ts
- Removed: `import { useAuth } from '@/shared/hooks/useAuth'`
- Added: `import { useOrg } from '@/shared/hooks/useOrg'`
- Removed: `const { user } = useAuth()`
- Added: `const { organization } = useOrg()`
- `queryKey: ['workspaces', user?.id]` → `queryKey: ['workspaces', organization?.id]`
- `.eq('profile_id', user.id)` → `.eq('organization_id', organization.id)`
- `enabled: !!user?.id` → `enabled: !!organization?.id`
- `ClientWorkspace.profile_id` field renamed to `organization_id` (type interface update)

### useCredits.ts
- Removed: `import { useAuth } from '@/shared/hooks/useAuth'`
- Added: `import { useOrg } from '@/shared/hooks/useOrg'`
- Removed: `const { user } = useAuth()`
- Added: `const { organization } = useOrg()`
- Package query: `['credit-package', user?.id]` → `['credit-package', organization?.id]`
- Package query: `.eq('profile_id', user!.id)` → `.eq('organization_id', organization!.id)`
- Balance query: `['credit-balance', user?.id]` → `['credit-balance', organization?.id]`
- Balance RPC: `.rpc('get_credit_balance', { p_profile_id: user!.id })` → `.rpc('get_org_credit_balance', { p_org_id: organization!.id })`
- Console warn: updated message to reference `get_org_credit_balance`
- All `enabled: !!user?.id` → `enabled: !!organization?.id`
- Realtime channel: `credit-transactions-${user.id}` → `credit-transactions-org-${organization.id}`
- Realtime filter: `profile_id=eq.${user.id}` → `organization_id=eq.${organization.id}`
- Refetch key: `['credit-balance', user.id]` → `['credit-balance', organization.id]`
- Effect dep: `[user?.id, queryClient]` → `[organization?.id, queryClient]`
- Added `pkg` field to `UseCreditsResult` return type (needed for test + future consumers)

### SidebarWorkspaces.tsx (Rule 1 auto-fix)
- `DEFAULT_WORKSPACES` mock literals: `profile_id: ''` → `organization_id: ''` (3 entries)
- Required because `ClientWorkspace` interface field was renamed from `profile_id` to `organization_id`

## Test Results

```
src/shared/__tests__/useWorkspaces.test.ts   2 tests  PASS
src/modules/tickets/__tests__/useCredits.test.ts  2 tests  PASS
Total: 4 tests, 0 failed
```

## Line Counts

- `src/shared/hooks/useWorkspaces.ts`: 35 lines
- `src/modules/tickets/hooks/useCredits.ts`: 92 lines (limit: 150)

## Build Verification

`npm run build` exits 0 — 772 modules transformed, no TypeScript errors.

## Verification

- `grep -r "get_credit_balance" src/modules/tickets/hooks/useCredits.ts` → nothing (confirmed)
- `grep -n "useAuth\|profile_id" src/shared/hooks/useWorkspaces.ts` → nothing (confirmed)
- `grep -n "get_credit_balance\|p_profile_id\|profile_id\|useAuth" src/modules/tickets/hooks/useCredits.ts` → nothing (confirmed)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SidebarWorkspaces DEFAULT_WORKSPACES used renamed field**
- **Found during:** Task 1 build verification
- **Issue:** `ClientWorkspace` interface changed `profile_id` to `organization_id`, but `SidebarWorkspaces.tsx` had 3 mock literal objects still specifying `profile_id: ''`, causing TS2353 errors
- **Fix:** Updated all 3 mock objects to use `organization_id: ''`
- **Files modified:** `src/shared/components/layout/SidebarWorkspaces.tsx`
- **Commit:** 0e19838

**2. [Rule 2 - Missing return field] Added `pkg` to UseCreditsResult**
- **Found during:** Task 2 — test expected `result.current.pkg`
- **Issue:** Plan's test assertions used `result.current.pkg` but the existing `UseCreditsResult` interface did not expose `pkg` directly (only `packageName` and `creditsPerMonth`)
- **Fix:** Added `pkg: CreditPackage | null | undefined` to `UseCreditsResult` and return value; existing consumers (`balance`, `packageName`, `creditsPerMonth`, `isLoading`) remain fully backward compatible
- **Files modified:** `src/modules/tickets/hooks/useCredits.ts`
- **Commit:** 0e19838

## Known Stubs

None — both hooks are fully wired to live Supabase queries; no hardcoded placeholder values in data paths.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. Existing RLS on `client_workspaces` and `credit_packages` tables handles access control; `get_org_credit_balance` RPC was secured in Phase 10.

## Self-Check: PASSED

- `src/shared/hooks/useWorkspaces.ts` — exists, contains `import { useOrg }`, `organization_id`, `['workspaces', organization?.id]`, `enabled: !!organization?.id`
- `src/modules/tickets/hooks/useCredits.ts` — exists, contains `import { useOrg }`, `get_org_credit_balance`, `p_org_id`, `organization_id=eq.`, 92 lines
- `src/shared/__tests__/useWorkspaces.test.ts` — exists, 2 tests
- `src/modules/tickets/__tests__/useCredits.test.ts` — exists, 2 tests
- Commit `0e19838` — verified in git log
