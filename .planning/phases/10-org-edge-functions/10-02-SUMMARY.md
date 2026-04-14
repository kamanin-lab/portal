---
phase: 10-org-edge-functions
plan: 02
subsystem: edge-functions
tags: [org, clickup, permissions, viewer-guard, dual-read]
dependency_graph:
  requires: [10-01]
  provides: [org-scoped-task-fetch, org-scoped-task-create, viewer-403-guards]
  affects: [fetch-clickup-tasks, fetch-single-task, create-clickup-task, post-task-comment, update-task-status]
tech_stack:
  added: []
  patterns:
    - dual-read fallback (org?.field ?? profile?.field ?? default)
    - viewer role 403 guard before body parse / mutation
    - service role admin client reuse across org lookup + cache write
key_files:
  created: []
  modified:
    - supabase/functions/fetch-clickup-tasks/index.ts
    - supabase/functions/fetch-single-task/index.ts
    - supabase/functions/create-clickup-task/index.ts
    - supabase/functions/post-task-comment/index.ts
    - supabase/functions/update-task-status/index.ts
decisions:
  - "Reuse single supabaseAdmin client for both org lookup and cache writes — avoids duplicate createClient calls"
  - "In fetch-clickup-tasks: replace conditional if(supabaseServiceKey) block with unconditional admin client since key is now required earlier"
  - "In create-clickup-task: rename second fullName variable to chatDisplayName to avoid block-scope redeclaration conflict"
  - "Legacy users (null from getUserOrgRole) are treated permissively — no guard applied"
metrics:
  duration_minutes: 25
  completed_at: "2026-04-14T22:31:56Z"
  tasks_completed: 3
  files_modified: 5
  commit: bf9697a
---

# Phase 10 Plan 02: Org-Scoped Edge Functions — Task Functions Summary

**One-liner:** Dual-read org config (org ?? profile fallback) added to 3 task functions; viewer 403 guard added to 3 mutating functions via `getUserOrgRole` from `_shared/org.ts`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Update fetch-clickup-tasks and fetch-single-task (read-only, no guards) | bf9697a | fetch-clickup-tasks/index.ts, fetch-single-task/index.ts |
| 2 | Update create-clickup-task (dual-read + viewer guard) | bf9697a | create-clickup-task/index.ts |
| 3 | Add viewer guard to post-task-comment and update-task-status | bf9697a | post-task-comment/index.ts, update-task-status/index.ts |

## What Was Done

### Task 1: fetch-clickup-tasks + fetch-single-task

Both functions now:
- Import `getOrgForUser` from `../_shared/org.ts`
- Construct a `supabaseAdmin` (service role client) before the profile query
- Call `getOrgForUser(supabaseAdmin, user.id)` to resolve org config
- Use dual-read: `const listIds: string[] = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? []`
- Reuse the same `supabaseAdmin` for the downstream `task_cache` upsert (no duplicate client)

In `fetch-clickup-tasks`: the old `if (supabaseServiceKey) { const supabaseService = createClient(...) }` block was replaced with a direct reference to the already-constructed `supabaseAdmin` (wrapped in a plain `{}` block for scope isolation).

In `fetch-single-task`: the old service client creation at line ~330 was replaced with direct use of `supabaseAdmin` constructed earlier.

### Task 2: create-clickup-task

- Imports both `getOrgForUser` and `getUserOrgRole` from `../_shared/org.ts`
- Role guard inserted immediately after user verification (401 block), BEFORE `req.text()` body parse
- `supabaseAdmin` constructed once for role guard, then reused for org lookup and cache writes
- Dual-read for `clickup_list_ids`: `org?.clickup_list_ids ?? profile?.clickup_list_ids ?? []`
- Dual-read for `clickup_chat_channel_id`: `org?.clickup_chat_channel_id ?? profile?.clickup_chat_channel_id ?? null`
- `full_name` remains read from profiles only (no org fallback needed)
- Old duplicate `const supabaseAdmin = createClient(supabaseUrl, ...)` at cache-write block removed

### Task 3: post-task-comment + update-task-status

Both functions now:
- Import `getUserOrgRole` from `../_shared/org.ts`
- Role guard inserted after user verification, before body/comment validation
- Guard uses conditional pattern `if (supabaseServiceKey) { ... }` (fail-open for misconfig)
- Profile reads for `full_name` left completely unchanged

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Variable redeclaration conflict in create-clickup-task**
- **Found during:** Task 2
- **Issue:** The chat notification block (inside `if (chatChannelId)`) had `const fullName = profile.full_name || "Client"` which would conflict with `const fullName = (fullNameFromProfile || '').trim()` declared in the same outer scope
- **Fix:** Renamed inner variable to `chatDisplayName` to avoid TypeScript block-scope redeclaration error
- **Files modified:** supabase/functions/create-clickup-task/index.ts
- **Commit:** bf9697a

**2. [Rule 1 - Bug] Conditional admin client in fetch-clickup-tasks was unnecessary**
- **Found during:** Task 1
- **Issue:** The original code wrapped the cache-write client in `if (supabaseServiceKey) { const supabaseService = createClient(...) }`. Since we now hard-fail if `SUPABASE_SERVICE_ROLE_KEY` is missing (earlier in the function), the conditional is redundant
- **Fix:** Replaced with plain `{ const supabaseService = supabaseAdmin; }` block, reusing already-constructed admin client
- **Files modified:** supabase/functions/fetch-clickup-tasks/index.ts
- **Commit:** bf9697a

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| fetch-clickup-tasks contains `getOrgForUser` | PASS |
| fetch-single-task contains `getOrgForUser` | PASS |
| fetch-clickup-tasks dual-read expression present | PASS |
| fetch-single-task dual-read expression present | PASS |
| create-clickup-task has `getUserOrgRole` + `getOrgForUser` | PASS |
| create-clickup-task viewer guard returns 403 | PASS |
| create-clickup-task dual-read for list_ids | PASS |
| create-clickup-task dual-read for chat_channel_id | PASS |
| post-task-comment has `getUserOrgRole` | PASS |
| post-task-comment returns "Insufficient permissions" | PASS |
| update-task-status has `getUserOrgRole` | PASS |
| update-task-status returns "Insufficient permissions" | PASS |
| No `profile?.clickup_list_ids \|\| []` patterns remaining | PASS |
| All files have at most 2 createClient calls (anon + admin) | PASS |
| Brace balance in all 5 files (diff = 0) | PASS |

## Known Stubs

None — all org lookups wire to real `_shared/org.ts` helpers against live `org_members` table.

## Threat Flags

No new security surface introduced. All changes are guard additions and config-read path updates within existing trust boundaries (browser → Edge Function JWT, Edge Function → Postgres service role).

## Self-Check: PASSED

- Commit `bf9697a` exists: verified via `git rev-parse --short HEAD`
- All 5 files modified: verified via `git diff --name-only HEAD~1 HEAD`
- All acceptance criteria: PASS (grep checks run above)
- Brace balance: 0 diff in all 5 files
