---
plan: 12-01
phase: 12-org-admin-page
status: complete
completed_at: 2026-04-15
---

# Plan 12-01 Summary — Admin RLS policies for org_members

## What was built

Migration file `supabase/migrations/20260416120000_org_admin_write_rls.sql` with three RLS policies enabling admin CRUD on `org_members`.

## Migration file

`supabase/migrations/20260416120000_org_admin_write_rls.sql`

Three policies added:
- `admins can read all org members` (SELECT) — USING `user_org_role(organization_id) = 'admin'`
- `admins can update org members` (UPDATE) — USING + WITH CHECK `user_org_role(organization_id) = 'admin'`
- `admins can delete org members` (DELETE) — USING `user_org_role(organization_id) = 'admin'`

All policies use `drop policy if exists` for idempotency.

## Staging verification

Applied to staging Cloud Supabase (`ahlthosftngdcryltapu`) via Management API on 2026-04-15.

`pg_policies` result after apply:

| policyname | cmd |
|---|---|
| admins can delete org members | DELETE |
| admins can read all org members | SELECT |
| admins can update org members | UPDATE |
| members can read own membership | SELECT |

All 4 policies confirmed present. Admin SELECT on `org_members` now returns all rows in the organization (not just own row).

## Production status

**Production NOT touched.** Staging-only until Phase 13 merge gate.

## Commits

- `e0af90b` — feat(org): add admin RLS policies for org_members (Phase 12-01)
