---
phase: 13-org-onboarding-cleanup
plan: "02"
subsystem: edge-functions
tags: [org, cleanup, edge-functions, dual-read-removal]
dependency_graph:
  requires: []
  provides: [profiles-column-drop-unblocked]
  affects:
    - supabase/functions/fetch-clickup-tasks/index.ts
    - supabase/functions/fetch-single-task/index.ts
    - supabase/functions/create-clickup-task/index.ts
    - supabase/functions/nextcloud-files/index.ts
tech_stack:
  added: []
  patterns: [org-single-source-of-truth]
key_files:
  created: []
  modified:
    - supabase/functions/fetch-clickup-tasks/index.ts
    - supabase/functions/fetch-single-task/index.ts
    - supabase/functions/create-clickup-task/index.ts
    - supabase/functions/nextcloud-files/index.ts
decisions:
  - "org is the single source of truth for clickup_list_ids, clickup_chat_channel_id, nextcloud_client_root in all Edge Functions"
  - "fetch-clickup-tasks returns 200 empty list (not 500) when org is null — consistent with existing empty-list behavior"
  - "fetch-single-task and create-clickup-task return 400 when org is null"
  - "create-clickup-task retains a narrow profiles.full_name read — full_name is a person attribute not stored in organizations"
  - "nextcloud-files header JSDoc updated to reference organizations.nextcloud_client_root"
metrics:
  duration_minutes: 15
  completed_date: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
---

# Phase 13 Plan 02: Remove Dual-Read Fallback from Edge Functions — Summary

**One-liner:** Removed `org?.field ?? profile?.field` dual-read pattern from 4 Edge Functions; org is now single source of truth for list IDs, chat channel, and Nextcloud root.

## What Was Done

Both tasks executed exactly as planned. All four Edge Functions now read org config exclusively from `organizations` via `getOrgForUser()`, eliminating the dead-code fallback to deprecated `profiles` columns introduced during Phase 9 migration.

### Task 1: fetch-clickup-tasks + fetch-single-task (commit `fdbdce3`)

- **fetch-clickup-tasks:** Removed `profiles.select("clickup_list_ids")` query and its `profileError` guard. When `org` is null, returns `{ tasks: [], message: "Organisation nicht konfiguriert" }` with status 200 (consistent with existing empty-list behavior). Uses `org.clickup_list_ids` directly.
- **fetch-single-task:** Removed `profiles.select("clickup_list_ids")` query and its `profileError` guard. When `org` is null, returns `{ error: "Organisation nicht konfiguriert" }` with status 400. Uses `org.clickup_list_ids` directly.

### Task 2: create-clickup-task + nextcloud-files (commit `b1c6fac`)

- **create-clickup-task:** Removed wide `profiles.select("clickup_list_ids, full_name, clickup_chat_channel_id")` query. Replaced with narrow `profiles.select("full_name")` (maybeSingle) to retain `fullNameFromProfile`. `listIds` and `chatChannelId` now come directly from `org`. When `org` is null, returns 400. Stale comment about "dual-read" removed.
- **nextcloud-files:** Removed `profiles.select("nextcloud_client_root")` query entirely. `clientRoot` now assigned as `org?.nextcloud_client_root ?? null` in one line. JSDoc header updated from "use profiles.nextcloud_client_root" to "use organizations.nextcloud_client_root via org_members".

## Success Criteria — All Met

| Criterion | Result |
|-----------|--------|
| Zero `?? profile?.` in all 4 functions | PASS |
| fetch-clickup-tasks: zero profiles reads | PASS |
| fetch-single-task: zero profiles reads | PASS |
| create-clickup-task: exactly one profiles read (full_name) | PASS |
| nextcloud-files: zero profiles reads | PASS |
| fetch-clickup-tasks returns empty list (not 500) when org null | PASS |
| fetch-single-task returns 400 when org null | PASS |
| create-clickup-task returns 400 when org null | PASS |
| nextcloud-files falls through to NEXTCLOUD_NOT_CONFIGURED when no clientRoot | PASS (unchanged logic) |

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed stale JSDoc comment in nextcloud-files**
- **Found during:** Task 2
- **Issue:** Line 10 of the file header still read "use profiles.nextcloud_client_root" — a misleading comment that would confuse future readers and triggered the grep check
- **Fix:** Updated comment to "use organizations.nextcloud_client_root via org_members"
- **Files modified:** `supabase/functions/nextcloud-files/index.ts`
- **Commit:** `b1c6fac`

**2. [Rule 1 - Bug] Removed stale inline comment in create-clickup-task**
- **Found during:** Task 2
- **Issue:** Comment `// chatChannelId already resolved via dual-read (org ?? profile) above` was left over from old pattern
- **Fix:** Updated to `// chatChannelId resolved from org above`
- **Files modified:** `supabase/functions/create-clickup-task/index.ts`
- **Commit:** `b1c6fac`

## Threat Surface Scan

No new network endpoints, auth paths, or trust boundaries introduced. Threat mitigations from plan applied:

- **T-13-02-01** (Information Disclosure — fetch-clickup-tasks org null path): Accepted. Returns 200 empty list, no data exposed.
- **T-13-02-02** (Elevation of Privilege — profile query in create-clickup-task): Mitigated. Query narrowed to `full_name` only — cannot be used to read list IDs or chat channel ID from profiles.

## Unblocks

Plan 13-03 (profiles column drop) can now safely remove the following columns from `profiles`:
- `clickup_list_ids`
- `clickup_chat_channel_id`
- `nextcloud_client_root`

No Edge Function reads these columns anymore.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | `fdbdce3` | refactor(13-02): remove dual-read fallback from fetch-clickup-tasks and fetch-single-task |
| Task 2 | `b1c6fac` | refactor(13-02): remove dual-read fallback from create-clickup-task and nextcloud-files |

## Self-Check: PASSED

- `fdbdce3` confirmed in git log
- `b1c6fac` confirmed in git log
- All 4 modified files exist and contain correct org-only patterns
- grep verification: zero `?? profile?.` occurrences in all 4 functions
