---
phase: 11-org-frontend-auth
plan: "02"
subsystem: shared/hooks
tags: [org, context, provider, hook, tdd, auth]
dependency_graph:
  requires: [11-01]
  provides: [OrgProvider, useOrg, Organization type]
  affects: [src/App.tsx, plans 11-03, 11-04]
tech_stack:
  added: []
  patterns: [React Context + Provider, createElement return, mounted guard async, legacy fallback]
key_files:
  created:
    - src/shared/types/organization.ts
    - src/shared/hooks/useOrg.ts
    - src/shared/__tests__/useOrg.test.tsx
  modified:
    - src/App.tsx
decisions:
  - "OrgProvider wraps only AppRoutes, not Toaster — Toaster is a sibling inside AuthProvider (per Pitfall 5 in 11-RESEARCH.md)"
  - "Legacy fallback isMember=true, isAdmin=false, isViewer=false ensures existing users without org_members row are not locked out"
  - "isMember = role === 'admin' || role === 'member' — admins are also members"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-15"
  tasks_completed: 3
  files_created: 3
  files_modified: 1
---

# Phase 11 Plan 02: OrgProvider + useOrg Hook Summary

OrgContext provider and hook with role booleans, legacy fallback for users without org_members row, and OrgProvider insertion into App.tsx provider tree.

## Files Created / Modified

| File | Lines | Status |
|------|-------|--------|
| `src/shared/types/organization.ts` | 11 | Created |
| `src/shared/hooks/useOrg.ts` | 84 | Created |
| `src/shared/__tests__/useOrg.test.tsx` | 116 | Created |
| `src/App.tsx` | 31 | Modified (+3 lines) |

## Test Results

All 6 tests pass GREEN:

```
Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  4.55s
```

Tests cover:
1. useOrg throws German error outside OrgProvider
2. Legacy fallback when org_members returns null (isMember=true, isAdmin=false, isViewer=false)
3. role=admin → isAdmin=true, isMember=true, isViewer=false
4. role=member → isAdmin=false, isMember=true, isViewer=false
5. role=viewer → isAdmin=false, isMember=false, isViewer=true
6. isLoading transitions to false after fetch settles

## Build Verification

`npm run build` passed without errors or TypeScript warnings. Output: `✓ built in 9.98s`

## Provider Tree (src/App.tsx)

```tsx
<QueryClientProvider>
  <BrowserRouter>
    <AuthProvider>
      <OrgProvider>        ← inserted, wraps only AppRoutes
        <AppRoutes />
      </OrgProvider>
      <Toaster ... />      ← sibling, NOT wrapped by OrgProvider
    </AuthProvider>
  </BrowserRouter>
</QueryClientProvider>
```

## useOrg.ts Key Facts

- 84 lines (CLAUDE.md ≤ 150 rule satisfied)
- `export function useOrg()` — throws `'useOrg muss innerhalb von OrgProvider verwendet werden'` outside provider
- `export function OrgProvider` — fetches `org_members` join `organizations` via `supabase.from('org_members').select(...).eq('profile_id', userId).maybeSingle()`
- `isMember = role === 'admin' || role === 'member'` (admins are also members)
- `isViewer = role === 'viewer'`
- Legacy fallback: `{ organization: null, orgRole: 'member', isAdmin: false, isMember: true, isViewer: false }` (per D-04)
- Mounted guard prevents setState after unmount
- `createElement(OrgContext.Provider, { value: state }, children)` — mirrors useAuth.ts pattern exactly

## Deviations from Plan

None — plan executed exactly as written. The verbatim code from 11-02-PLAN.md was used for all three files. PATTERNS.md analog match quality: exact.

## Self-Check

- [x] `src/shared/types/organization.ts` exists
- [x] `src/shared/hooks/useOrg.ts` exists (84 lines ≤ 150)
- [x] `src/shared/__tests__/useOrg.test.tsx` exists
- [x] `src/App.tsx` contains `<OrgProvider>` wrapping only `<AppRoutes />`
- [x] Commit `55c9391` exists
- [x] All 6 tests pass
- [x] Build passes

## Self-Check: PASSED
