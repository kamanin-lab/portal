---
phase: "14"
plan: "02"
subsystem: backend
tags: [edge-functions, email, org-roles, viewer-guard]
dependency_graph:
  requires: []
  provides: [getNonViewerProfileIds, step_ready-email-filter, task_review-email-filter]
  affects: [clickup-webhook, org-shared-helpers]
tech_stack:
  added: []
  patterns: [permissive-fallback, role-batch-lookup]
key_files:
  created: []
  modified:
    - supabase/functions/_shared/org.ts
    - supabase/functions/clickup-webhook/index.ts
decisions:
  - "getNonViewerProfileIds uses permissive fallback on query error — email delivery is preferred over silent drop"
  - "Legacy users with no org_members row are treated as non-viewer (included) — avoids false exclusion of pre-org clients"
  - "Unused broad profiles prefetch removed from task_review block — email query now serves double duty as role-filtered fetch"
metrics:
  duration_minutes: 12
  completed_date: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 14 Plan 02: Viewer Email Filter Summary

Backend filter for `task_review` and `step_ready` emails: org members with `role='viewer'` are now excluded from action-required email notifications. Bell notifications are untouched.

## What Was Built

New `getNonViewerProfileIds` helper in `_shared/org.ts` batch-queries `org_members.role` and filters a list of profile IDs down to admin/member only. Both email send loops in `clickup-webhook/index.ts` call this helper before querying the `profiles` table for email recipients.

## Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add getNonViewerProfileIds helper to _shared/org.ts | `b284ad0` | supabase/functions/_shared/org.ts |
| 2 | Filter step_ready and task_review email loops | `622490c` | supabase/functions/clickup-webhook/index.ts |

## Verification Results

All checks passed:

```
# Helper exported
grep -n "export.*getNonViewerProfileIds" _shared/org.ts
→ 145: export async function getNonViewerProfileIds(

# Both email sites patched (9 matches: import + 2 const + 2 log blocks + 2 .in())
grep -n "nonViewerProfileIds" clickup-webhook/index.ts
→ line 19 (import), 867, 868, 871, 877 (step_ready), 1294, 1295, 1298, 1304 (task_review)

# All bell notification .map() calls still use profileIds (12 matches, none reference nonViewer)
→ confirmed

# npm run build
→ ✓ built in 23.02s — no TypeScript errors
```

## Decisions Made

- **Permissive fallback on error:** `getNonViewerProfileIds` returns original `profileIds` on Supabase query failure, logging a `console.warn`. Ensures email delivery is never silently dropped due to infra hiccup. Threat T-14-04 accepted.
- **Legacy users included:** Profiles with no `org_members` row (no entry in roleMap) pass the filter as non-viewers. Prevents false exclusion of pre-org onboarded clients.
- **Removed unused prefetch:** The `task_review` block originally fetched all profiles (including viewer) before the bell insert, then used them for email. Since email now needs a separate filtered query, the broad prefetch was removed — one fewer DB round-trip.

## Deviations from Plan

None — plan executed exactly as written. One minor cleanup added: removed the now-unused `const { data: profiles }` prefetch that preceded the bell notification block in the `task_review` section (it was fetching all profiles but no longer used after the role-filtered `emailProfiles` query was introduced).

## Known Stubs

None.

## Threat Flags

None beyond what the plan's threat model already covers (T-14-03, T-14-04, T-14-05 all addressed).

## Self-Check: PASSED

- `supabase/functions/_shared/org.ts` — modified, committed `b284ad0`
- `supabase/functions/clickup-webhook/index.ts` — modified, committed `622490c`
- Both commits present in `git log --oneline`
- `getNonViewerProfileIds` exported and importable
- `nonViewerProfileIds` used at both email sites
- Bell notification arrays unchanged
- `npm run build` clean
