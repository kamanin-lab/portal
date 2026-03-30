---
phase: quick
plan: 260330-gzi
subsystem: database
tags: [data-fix, profile_id, comment_cache, supabase]
dependency_graph:
  requires: []
  provides: [correct-author-email-attribution-nadin.bonin]
  affects: [comment_cache, task_cache, profiles]
tech_stack:
  added: []
  patterns: [supabase-service-role-sql, direct-pg-query-api]
key_files:
  created: []
  modified:
    - "comment_cache (database table — 21 rows updated)"
decisions:
  - "UUID mismatch did not exist — profile_id was already correct in task_cache. Only author_email was missing on portal comments."
  - "All 21 portal-originated comment rows had author_email = '' (empty string) — fixed by direct UPDATE within transaction."
metrics:
  duration: "~8 minutes"
  completed_date: "2026-03-30"
  tasks_completed: 1
  files_modified: 0
---

# Quick Task 260330-gzi: Fix Missing profile_id / Author Email for nadin.bonin

**One-liner:** Fixed 21 portal-originated comments with missing author_email for nadin.bonin@mbm-moebel.de; no UUID mismatch found — profile, auth.users, and task_cache were already consistent.

## Objective

Investigate and fix missing/wrong profile_id in task_cache and missing author_email in comment_cache for nadin.bonin@mbm-moebel.de, who reportedly could not see her tasks or had incorrect author attribution.

## Diagnostic Results

### auth.users
- `id`: `f304b042-d408-4d39-874c-d53b7aa7adaf`
- `email`: `nadin.bonin@mbm-moebel.de`
- `created_at`: `2026-03-24 23:59:32 UTC`

### profiles
- `id`: `f304b042-d408-4d39-874c-d53b7aa7adaf` — MATCHES auth.users
- `email`: `nadin.bonin@mbm-moebel.de`
- `full_name`: `Nadin Bonin`
- `company_name`: `MBM Münchener Boulevard Möbel GmbH`
- `clickup_list_ids`: `["901519301126"]`
- No orphaned profile row found

### task_cache
- **106 total rows** with `profile_id = f304b042...` (correct)
- No rows with mismatched UUID
- **Scenario A (UUID mismatch) did NOT apply**

### comment_cache
- **47 total rows** for this profile_id
- **21 rows** had `is_from_portal = true` AND `author_email = ''` (empty string)
- These were all real portal-originated comments by Nadin Bonin (text prefixed with "Nadin Bonin (via Client Portal):")
- Root cause: early portal deployments did not populate `author_email` on comment insert

### Other tables
- `client_workspaces`: 2 rows (`tickets`, `support`) — correct
- `project_access`: 0 rows — no project access configured yet
- `read_receipts`: confirmed table name; not modified (no rows with wrong UUID)
- `notifications`, `support_messages`, `credit_packages`, `credit_transactions`: not modified (no mismatch found)

## Fix Applied

```sql
BEGIN;
UPDATE comment_cache
SET author_email = 'nadin.bonin@mbm-moebel.de'
WHERE profile_id = 'f304b042-d408-4d39-874c-d53b7aa7adaf'
  AND is_from_portal = true
  AND (author_email IS NULL OR author_email = '');
COMMIT;
```

**Rows updated:** 21

## Verification Results

| Check | Expected | Actual | Status |
|-------|----------|--------|--------|
| `SELECT COUNT(*) FROM task_cache WHERE profile_id = (auth UUID)` | > 0 | 106 | PASS |
| `SELECT COUNT(*) FROM comment_cache WHERE profile_id = (auth UUID) AND is_from_portal = true AND (author_email IS NULL OR author_email = '')` | 0 | 0 | PASS |
| Profile row exists with correct UUID | 1 row | 1 row | PASS |
| No orphaned old profile | 0 orphans | 0 orphans | PASS |
| Sample fixed comments show `author_email = 'nadin.bonin@mbm-moebel.de'` | populated | populated | PASS |

## Deviations from Plan

### Finding: No UUID mismatch existed

**Found during:** Task 1 Step 1 diagnosis
**Issue:** The plan assumed Scenario A (UUID mismatch between old and new auth user). Diagnostics showed only one auth user, one profile row, and task_cache rows all already using the correct UUID `f304b042...`.
**Fix:** Skipped UUID migration steps 1, 4-11 from the plan (nothing to migrate). Only executed step 3 (author_email fix).
**Impact:** Narrower fix but still correct — the actual problem was missing `author_email` on portal comments, which was fixed.

## Known Stubs

None — this was a pure data fix with no code changes.

## What Remains

- **Task 2 (checkpoint:human-verify):** Yuri or Nadin should log into portal.kamanin.at as `nadin.bonin@mbm-moebel.de` and verify:
  1. All tasks are visible (should see 106 tasks)
  2. Comments show `nadin.bonin@mbm-moebel.de` as author on portal-originated comments
  3. New comment posts work with correct author attribution
  - If tasks are still not visible: may need to trigger `fetch-clickup-tasks` for a fresh sync (data is correct in DB but frontend may need a sync)

## Self-Check

- [x] SQL executed successfully (empty array response = success from pg/query endpoint)
- [x] Verification SQL confirms 0 missing author_email rows
- [x] Verification SQL confirms 106 task_cache rows visible
- [x] Profile row intact with correct UUID

## Self-Check: PASSED
