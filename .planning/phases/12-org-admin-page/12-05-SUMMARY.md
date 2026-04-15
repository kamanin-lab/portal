---
phase: 12
plan: 05
subsystem: shared/auth
tags: [auth, invite-flow, password-set, routing]
dependency_graph:
  requires: [12-02, 12-03]
  provides: [passwort-setzen-page, invite-loop-complete]
  affects: [src/app/routes.tsx, src/shared/pages/PasswortSetzenPage.tsx]
tech_stack:
  added: []
  patterns: [TDD-red-green, outside-ProtectedRoute, GoTrue-session-hydration]
key_files:
  created:
    - src/shared/pages/PasswortSetzenPage.tsx
    - src/shared/__tests__/PasswortSetzenPage.test.tsx
  modified:
    - src/app/routes.tsx
decisions:
  - Logo asset path confirmed as @/assets/KAMANIN-icon-colour.svg (matches LoginPage exactly)
  - /passwort-setzen placed as sibling of /login, before ProtectedRoute block (line 40 vs line 42)
  - Submit button disabled when passwords don't match OR < 8 chars (client-side guard)
  - isLoading guard renders empty div to prevent flash of expired-link state during GoTrue hydration
metrics:
  duration: "~8 minutes"
  completed: "2026-04-15T10:58:47Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 12 Plan 05: PasswortSetzenPage — Invite Recovery Landing Page Summary

**One-liner:** `/passwort-setzen` public route with password-set form + expired-link fallback, closing the invite loop started in Plans 12-02 and 12-03.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | PasswortSetzenPage component + test (TDD) | `7ce7f8d` | PasswortSetzenPage.tsx, PasswortSetzenPage.test.tsx |
| 2 | Register /passwort-setzen route outside ProtectedRoute | `fd9575f` | routes.tsx |

## What Was Built

**PasswortSetzenPage** (`src/shared/pages/PasswortSetzenPage.tsx`, 112 lines — under 150-line limit):

- Reads `session`, `isLoading`, `updatePassword` from `useAuth()`
- `isLoading` guard: renders empty shell to avoid flash of expired-link state during GoTrue hash hydration
- No session + not loading: shows "Link abgelaufen" card with link to `/login`
- Session present: renders two password fields (`Neues Passwort`, `Passwort bestätigen`) with submit
- Client-side validation: submit disabled when passwords don't match OR < 8 chars
- On success: calls `updatePassword(password)` then `navigate('/tickets', { replace: true })`
- On error: shows "Passwort konnte nicht gesetzt werden. Bitte erneut versuchen."
- Uses identical shell layout and logo path as LoginPage

**Route registration** (`src/app/routes.tsx`):
- Lazy import added after LoginPage lazy import
- `<Route path="/passwort-setzen" ... />` placed at line 40, before `<ProtectedRoute>` block at line 42
- Accessible without authentication — correct for invite recovery flow

## Logo Asset Path

Logo imported as: `import logo from '@/assets/KAMANIN-icon-colour.svg'`

This matches LoginPage exactly (confirmed by reading the file before implementing).

## GoTrue Session Hydration

The page relies on Supabase's automatic URL hash processing:
- `invite-member` Edge Function generates recovery link with `redirectTo: ${SITE_URL}/passwort-setzen`
- GoTrue redirects with `#access_token=...&type=recovery` in URL fragment
- `@supabase/supabase-js` v2 auto-processes the fragment on client init, creating a session
- `onAuthStateChange` fires `PASSWORD_RECOVERY` → `useAuth.ts` (Plan 12-02) routes to `/passwort-setzen`
- By the time `PasswortSetzenPage` mounts, `useAuth().session` is already populated
- No manual token parsing needed

The `isLoading` guard is critical: on first mount, `isLoading` is `true` while Supabase resolves the session. Without the guard, the component would briefly render "Link abgelaufen" before the session resolves — a flash visible to users.

## Test Results

```
Test Files  1 passed (1)
Tests       5 passed (5)
```

All 5 tests pass:
1. Shows expired link message when no session
2. Renders password form when session is present
3. Disables submit when passwords do not match
4. Calls updatePassword and navigates to /tickets on success
5. Shows error on failed updatePassword

Build: `npm run build` passes cleanly.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The page is fully wired: `updatePassword` calls `supabase.auth.updateUser({ password })` in `useAuth.ts`, navigation goes to `/tickets` on success.

## Deferred Items (pre-existing, out of scope)

Two test files have pre-existing failures unrelated to Plan 12-05:
- `src/modules/tickets/__tests__/task-list-utils.test.ts` — 1 failing test (getEmptyMessage filter "attention")
- `src/shared/pages/__tests__/MeineAufgabenPage.test.tsx` — 4 failing tests (4-tab filter)

These were failing before this plan's changes and are not caused by anything in this plan.

## Self-Check: PASSED

- src/shared/pages/PasswortSetzenPage.tsx — FOUND
- src/shared/__tests__/PasswortSetzenPage.test.tsx — FOUND
- src/app/routes.tsx — FOUND
- Commit 7ce7f8d — FOUND
- Commit fd9575f — FOUND
