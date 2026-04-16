---
phase: 13-org-onboarding-cleanup
plan: "01"
subsystem: frontend-cleanup
tags: [profile-cleanup, org-context, useUnreadCounts, layout]
dependency_graph:
  requires: []
  provides: [clean-profile-type, supportTaskId-via-org]
  affects: [Sidebar, MobileSidebarOverlay, BottomNav, InboxPage, useSupportTaskChat, useUnreadCounts]
tech_stack:
  added: []
  patterns: [useOrg-for-org-config, supportTaskId-as-param]
key_files:
  created:
    - src/modules/tickets/__tests__/useUnreadCounts.test.ts
  modified:
    - src/shared/types/common.ts
    - src/shared/hooks/useAuth.ts
    - src/modules/tickets/hooks/useUnreadCounts.ts
    - src/modules/tickets/hooks/useSupportTaskChat.ts
    - src/shared/pages/InboxPage.tsx
    - src/shared/components/layout/Sidebar.tsx
    - src/shared/components/layout/MobileSidebarOverlay.tsx
    - src/shared/components/layout/BottomNav.tsx
decisions:
  - "useUnreadCounts second param is supportTaskId (string | null = null) — backward compat, queryKey includes it for per-org cache"
  - "useSupportTaskChat keeps useAuth for profile.full_name / user — only support_task_id migrated to useOrg"
  - "Pre-existing 6 test failures (MeineAufgabenPage, OrgInfoSection, task-list-utils) confirmed out-of-scope — same failures present before plan execution"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-15"
  tasks_completed: 2
  files_changed: 8
---

# Phase 13 Plan 01: Profile Cleanup — Remove Org-Config Fields Summary

Frontend no longer reads `profile.support_task_id`, `profile.clickup_list_ids`, or `profile.clickup_chat_channel_id` from any component or hook; all callers now read `support_task_id` from `useOrg()` and pass it explicitly to `useUnreadCounts`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Clean Profile type and update useUnreadCounts | `d49f6ac` | common.ts, useUnreadCounts.ts, useUnreadCounts.test.ts |
| 2 | Update useSupportTaskChat and all layout/page callers | `05803e1` | useSupportTaskChat.ts, InboxPage.tsx, Sidebar.tsx, MobileSidebarOverlay.tsx, BottomNav.tsx, useAuth.ts |

TDD RED commit: `3324558` (4 failing tests)
TDD GREEN commit: `d49f6ac` (4 passing tests)

## Changes Made

### src/shared/types/common.ts
Removed three fields from `Profile` interface:
- `clickup_list_ids: string[] | null`
- `support_task_id: string | null`
- `clickup_chat_channel_id: string | null`

Profile now has exactly: `id`, `email`, `full_name`, `company_name`, `email_notifications`, `notification_preferences`, `avatar_url`.

### src/modules/tickets/hooks/useUnreadCounts.ts
- `fetchUnreadCounts(userId, supportTaskId)` — no longer queries `profiles` table
- `useUnreadCounts(userId, supportTaskId = null)` — second param replaces internal fetch
- `queryKey: ['unread-counts', userId, supportTaskId]` — cache keyed per org config
- Optimistic update `queryKey` variable extracted for consistency

### src/modules/tickets/hooks/useSupportTaskChat.ts
- Added `useOrg` import
- `supportTaskId = organization?.support_task_id ?? null` (was `profile?.support_task_id ?? null`)
- `useAuth` retained for `profile.full_name` and `user.email`

### Layout components (Sidebar, MobileSidebarOverlay, BottomNav)
All three:
- Added `useOrg` import and `const { organization } = useOrg()`
- `useUnreadCounts(profile?.id, organization?.support_task_id ?? null)`
- Notification filter: `organization?.support_task_id` replaces `profile?.support_task_id`

### src/shared/pages/InboxPage.tsx
- Added `useOrg` import and `const { organization } = useOrg()`
- Inbox filter: `organization?.support_task_id` replaces `profile?.support_task_id`

### src/shared/hooks/useAuth.ts
- `STAGING_BYPASS_PROFILE` object cleaned: removed `clickup_list_ids: null`, `support_task_id: null`, `clickup_chat_channel_id: null` (no longer on Profile type)

## Verification Results

```
grep -r "profile\?\.support_task_id|profile\.support_task_id|..." src/
→ no output (exit 1) — CLEAN

npm run build
→ ✓ built in 11.13s — zero TypeScript errors

npm run test
→ 380 passed, 6 pre-existing failures (out of scope)
```

## Deviations from Plan

None — plan executed exactly as written.

## Deferred Issues (pre-existing, out of scope)

These 6 failures existed before Plan 13-01 execution and are unchanged:

| File | Test | Status |
|------|------|--------|
| `src/modules/tickets/__tests__/task-list-utils.test.ts` | filter "attention" returns German message | Pre-existing |
| `src/modules/organisation/__tests__/OrgInfoSection.test.tsx` | renders org slug | Pre-existing |
| `src/shared/pages/__tests__/MeineAufgabenPage.test.tsx` | 4 tests (tab chips, recommendation) | Pre-existing |

## TDD Gate Compliance

- RED gate commit: `3324558` — `test(13-01): add failing tests for useUnreadCounts supportTaskId param`
- GREEN gate commit: `d49f6ac` — `feat(13-01): clean Profile type and update useUnreadCounts to accept supportTaskId param`
- REFACTOR: not needed

## Known Stubs

None — all data flows are wired to live org context.

## Self-Check: PASSED

Files created/modified verified:
- `src/shared/types/common.ts` — Profile has 7 fields, no org-config fields
- `src/modules/tickets/hooks/useUnreadCounts.ts` — second param present, no profiles query
- `src/modules/tickets/hooks/useSupportTaskChat.ts` — reads from useOrg()
- `src/shared/pages/InboxPage.tsx` — uses organization.support_task_id
- `src/shared/components/layout/Sidebar.tsx` — uses organization.support_task_id
- `src/shared/components/layout/MobileSidebarOverlay.tsx` — uses organization.support_task_id
- `src/shared/components/layout/BottomNav.tsx` — uses organization.support_task_id
- `src/shared/hooks/useAuth.ts` — STAGING_BYPASS_PROFILE cleaned
- `src/modules/tickets/__tests__/useUnreadCounts.test.ts` — 4 tests, all passing

Commits verified:
- `3324558` — RED test commit
- `d49f6ac` — Task 1 GREEN commit
- `05803e1` — Task 2 commit
