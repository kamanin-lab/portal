---
phase: 10-org-edge-functions
plan: "04"
subsystem: backend/edge-functions
tags: [org, webhook, fan-out, profile-resolution]
dependency_graph:
  requires: [10-01]
  provides: [ORG-BE-05, ORG-BE-06]
  affects: [clickup-webhook, comment_cache, notifications]
tech_stack:
  added: []
  patterns:
    - org-first 3-step profile resolution (org_members → task_cache → list_fallback)
    - N-member fan-out loop with idempotent upsert per (clickup_comment_id, profile_id)
    - per-iteration profile fetch to respect individual notification preferences
key_files:
  modified:
    - supabase/functions/clickup-webhook/index.ts
decisions:
  - task activity updated once per comment (not per org member) to avoid N redundant DB writes
  - activityUpdated boolean flag guards the single updateTaskActivity call inside the fan-out loop
  - memberProfile loaded per-iteration inside the loop so each recipient's email_notifications + notification_preferences are respected independently
metrics:
  duration_minutes: 25
  completed_date: "2026-04-14"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Phase 10 Plan 04: clickup-webhook Org-First Resolution and Support Fan-Out Summary

**One-liner:** Org-first 3-step profile resolution in findProfilesForTask + N-member support chat fan-out via idempotent comment_cache upserts per org member.

## Objective

Implement ORG-BE-05 and ORG-BE-06 in `clickup-webhook/index.ts`:
1. `findProfilesForTask` now tries `org_members` first (via `findOrgByListId`) before falling back to `task_cache` and `profiles.clickup_list_ids`.
2. Support chat comments fan out to ALL org members (N `comment_cache` rows + N notifications), falling back to the original `profiles.support_task_id` single-profile lookup when no org is found.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add org-first step to findProfilesForTask | 4e41910 | clickup-webhook/index.ts |
| 2 | Fan out support chat comments to all org members | 4e41910 | clickup-webhook/index.ts |

## Changes Made

### Task 1: Org-first profile resolution

**File:** `supabase/functions/clickup-webhook/index.ts`

- Added import: `import { findOrgByListId, findOrgBySupportTaskId } from "../_shared/org.ts";`
- Extended `ProfileResolutionSource` type to include `"org_members"` union member
- Prepended Step 1 to `findProfilesForTask`:
  - If `listId` present → call `findOrgByListId(supabase, listId)`
  - If org found with members → return `{ profileIds, source: "org_members" }`
  - If null or empty → fall through to existing Step 2 (`task_cache`) and Step 3 (`list_fallback`)
- `supabase` in webhook handler is a **service role client** (constructed at line 694 with `SUPABASE_SERVICE_ROLE_KEY`) — no call-site changes needed

### Task 2: N-member support chat fan-out

**File:** `supabase/functions/clickup-webhook/index.ts`

- Replaced single `profiles.support_task_id` lookup with `findOrgBySupportTaskId(supabase, normalizedTaskId)`
- Collects `supportProfileIds: string[]` (from org or from profiles fallback)
- Loop over each `profileId`:
  - Fetches `memberProfile` per-iteration (respects individual `email_notifications` + `notification_preferences`)
  - Upserts `comment_cache` row with `onConflict: "clickup_comment_id,profile_id"` (idempotent replay)
  - Inserts `notifications` row per member
  - Sends email if `shouldSendEmail(memberProfile, "support_response")`
- `updateTaskActivity` called **once** per comment (guarded by `activityUpdated` boolean) — not N times
- All paths return HTTP 200 — no new 500s added

## Decisions Made

1. **task activity updated once**: The `updateTaskActivity` call is guarded by `activityUpdated = false` flag set before the loop. Only the first successful `comment_cache` upsert triggers it. Prevents N redundant `task_cache.last_activity_at` writes for the same comment.

2. **per-iteration memberProfile fetch**: Each org member's notification preferences may differ. Rather than batch-fetching all profiles upfront and adding complexity, we query once per profileId inside the loop. Orgs are small (< 50 members per CONTEXT.md T-10-13 — accepted risk), so N individual queries are acceptable.

3. **supabase client in webhook is already service role**: Confirmed at line 694 — `const supabase = createClient(supabaseUrl, supabaseServiceKey)`. No signature changes to `findProfilesForTask` needed. Both `findOrgByListId` and `findOrgBySupportTaskId` receive the correct admin client.

## Deviations from Plan

None — plan executed exactly as written.

The plan mentioned checking whether `findProfilesForTask` receives anon or service role client. Confirmed it receives service role (line 694). No deviation required.

## Threat Model Coverage

| Threat ID | Mitigation | Status |
|-----------|-----------|--------|
| T-10-11 | `onConflict: "clickup_comment_id,profile_id"` on all comment_cache upserts | IMPLEMENTED |
| T-10-12 | `findOrgByListId` returns null on >1 org match — falls through to task_cache | IMPLEMENTED (in org.ts, Phase 10-01) |
| T-10-13 | Small org size accepted — no loop limit added | ACCEPTED |
| T-10-14 | Per-member upsert is idempotent — webhook replay heals missing rows | IMPLEMENTED |

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| Import findOrgByListId + findOrgBySupportTaskId | PASS |
| ProfileResolutionSource includes "org_members" | PASS |
| findOrgByListId called before task_cache select | PASS |
| source: "org_members" return present | PASS |
| task_cache fallback still present | PASS |
| profiles.clickup_list_ids fallback still present | PASS |
| findOrgBySupportTaskId call in support block | PASS |
| for loop over supportProfileIds | PASS |
| supportProfiles[0] is gone | PASS |
| comment_cache uses profile_id: profileId | PASS |
| onConflict: "clickup_comment_id,profile_id" | PASS |
| profiles.support_task_id fallback present | PASS |
| No status 500 inside fan-out loop | PASS |
| Total grep count >= 2 for org helper imports | PASS (4) |

## Known Stubs

None.

## Threat Flags

No new security-relevant surface introduced beyond what is described in the plan's threat model.

## Self-Check: PASSED

- File `supabase/functions/clickup-webhook/index.ts` — modified and committed
- Commit `4e41910` — verified in git log
- All 14 acceptance criteria checks passed
