---
phase: 13-org-onboarding-cleanup
plan: "03"
subsystem: database-migration
tags: [rls-cleanup, schema-cleanup, profile-id-removal, org-cleanup]
dependency_graph:
  requires: [13-01-PLAN, 13-02-PLAN]
  provides: [clean-schema, no-profile-rls, no-legacy-columns]
  affects: [credit_packages, client_workspaces, profiles]
tech_stack:
  added: []
  patterns: [idempotent-migration, IF-EXISTS-guards, human-checkpoint]
key_files:
  created:
    - supabase/migrations/20260416130000_remove_legacy_profile_rls.sql
  modified: []
decisions:
  - "Added DROP TRIGGER IF EXISTS on_profile_list_change before dropping clickup_list_ids — trigger existed on staging but not in any migration file"
  - "Rollback file renamed to .bak to prevent supabase CLI conflict with duplicate timestamp"
  - "Migration history repaired via supabase migration repair --status applied for all prior migrations"
metrics:
  duration: "~20 minutes (including staging checkpoint)"
  completed: "2026-04-15"
  tasks_completed: 2
  files_changed: 1
---

# Phase 13 Plan 03: DB Migration — Remove Legacy profile_id RLS and Columns Summary

**One-liner:** Migration `20260416130000_remove_legacy_profile_rls.sql` applied to staging — drops legacy `profile_id = auth.uid()` policies, `profile_id` FK columns from `credit_packages`/`client_workspaces`, and 4 org-config columns from `profiles`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write migration SQL file | `003265d` | 20260416130000_remove_legacy_profile_rls.sql |
| 1b | Fix: add DROP TRIGGER before column drop | `ea142a4` | 20260416130000_remove_legacy_profile_rls.sql |
| 2 | Human staging checkpoint — verified and passed | — | — |

## What Was Applied

Migration `20260416130000_remove_legacy_profile_rls.sql`:

**Section 1:** Assert org policies exist (guard — aborts if Phase 9 not applied)

**Section 2:** Dropped legacy `profile_id = auth.uid()` policies:
- `"Users see own packages"` from `credit_packages`
- `"Users see own workspaces"` from `client_workspaces`

**Section 3:** Dropped `profile_id` FK columns:
- `credit_packages.profile_id CASCADE`
- `client_workspaces.profile_id CASCADE`

**Section 4:** Dropped trigger + org-config columns from `profiles`:
- `DROP TRIGGER IF EXISTS on_profile_list_change` (unexpected dependency — not in any migration)
- `clickup_list_ids`, `nextcloud_client_root`, `support_task_id`, `clickup_chat_channel_id`

**Section 5:** Verification gate (counts remaining `profile_id` policies — passes only if 0)

## Staging Verification (all passed)

| Check | Expected | Result |
|-------|----------|--------|
| profile_id policies on credit_packages/client_workspaces | 0 rows | ✅ 0 rows |
| profile_id column on credit_packages/client_workspaces | 0 rows | ✅ 0 rows |
| org-config columns on profiles | 0 rows | ✅ 0 rows |
| credit_transactions.profile_id | 1 row | ✅ 1 row |

## Gotcha: on_profile_list_change Trigger

A trigger `on_profile_list_change` existed on `profiles.clickup_list_ids` in staging but was not defined in any local migration file. It was dropped via `DROP TRIGGER IF EXISTS` added to Section 4 of the migration. This trigger was presumably created manually during Phase 9 development and never captured in a migration.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] DROP TRIGGER added before column drop**
- **Found during:** Task 1 (staging apply)
- **Issue:** `on_profile_list_change` trigger existed on `profiles.clickup_list_ids` in staging; column drop failed with dependency error
- **Fix:** Added `DROP TRIGGER IF EXISTS on_profile_list_change ON profiles;` to Section 4 before the column drops
- **Files modified:** `supabase/migrations/20260416130000_remove_legacy_profile_rls.sql`
- **Commit:** `ea142a4`

**2. [Rule 3 - Blocker] Rollback file renamed to .bak**
- **Found during:** Task 1 (migration apply)
- **Issue:** Supabase CLI detected two migration files with the same timestamp prefix; rollback `.sql` conflicted with forward migration
- **Fix:** Renamed rollback file to `.bak` extension to remove it from CLI tracking
- **Files modified:** rollback file (renamed)
- **Commit:** `ea142a4`

**3. [Rule 3 - Blocker] Migration history repair**
- **Found during:** Task 1 (supabase db push)
- **Issue:** Prior migrations not tracked in supabase_migrations table on staging; `db push` reported conflicts
- **Fix:** Ran `supabase migration repair --status applied` for all prior migrations to align CLI state with actual DB state
- **Files modified:** none (remote operation)

## Self-Check: PASSED

- Migration file exists at `supabase/migrations/20260416130000_remove_legacy_profile_rls.sql`
- Commits `003265d` and `ea142a4` exist in git log
- Staging verification queries all returned expected results
