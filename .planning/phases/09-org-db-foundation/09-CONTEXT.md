# Phase 9: org-db-foundation — Context

**Created:** 2026-04-14
**Phase goal:** The database carries the full organisation schema — tables, helper functions, migrated data, and dual-mode RLS — while existing portal functionality continues working without any code changes.

---

## Prior Decisions (from previous phases / requirements)

- Staging DB only throughout Milestone v2.0 — all Phase 9 work targets Cloud Supabase (`ahlthosftngdcryltapu`), NOT production
- GoTrue SMTP is broken on self-hosted; no magic links — this affects invite flow (Phase 10) but not Phase 9
- `comment_cache` fan-out pattern: N rows per member (not shared) — consistent with `task_cache` pattern
- `(SELECT user_org_ids())` wrapper in RLS is required for Postgres initPlan caching — prevents per-row function calls
- Dual-read fallback in Edge Functions handles zero-downtime transition (Phase 10 concern, not Phase 9)
- `credit_transactions.profile_id` is kept for audit trail even after cleanup (Phase 13)
- `inviteUserByEmail` NOT used — `createUser` + `generateLink({ type: 'recovery' })` instead (Phase 10/12 concern)
- `project_access` copied from admin at invite time (Phase 10 concern)

---

## Decisions Made in This Discussion

### Migration Strategy

**Decision: 1 atomic migration file**
- Single file: `supabase/migrations/20260414200000_org_foundation.sql`
- Order within the file: tables → SQL functions → data migration → NOT NULL constraints → RLS policies → gate check DO block
- Atomic: if any step fails, the entire transaction rolls back — no partial state
- Alongside it: a matching `supabase/migrations/20260414200000_org_foundation_rollback.sql` with DROP statements for manual use if needed

### Dual-Mode RLS Design

**Decision: PERMISSIVE policies, both old and new**
- New org-scoped policies on `credit_packages` and `client_workspaces` use `PERMISSIVE` (default)
- Old `profile_id = auth.uid()` policies remain PERMISSIVE and active in parallel
- Postgres ORs all PERMISSIVE policies — a row is visible if ANY policy matches
- No duplicate rows: if a row matches both profile_id AND org_id, Postgres returns it once
- Zero breakage risk: old policy continues to work throughout the transition period

**Decision: notifications_type_check constraint extended in Phase 9 migration**
- Add `member_invited` and `member_removed` to the allowed types in the same migration
- Phase 10 (invite-member function) just uses the constraint — no separate migration needed
- DB stays consistent with what Edge Functions will expect

### SQL Function Security

**Decision: user_org_ids() returns empty set for unauthenticated callers**
- If `auth.uid()` is NULL, function returns no rows (not an exception)
- RLS policy evaluates to false → no data exposed
- Safe, silent, and compatible with Supabase anon policy evaluation

**Decision: migration gate check is a DO block inside the migration**
- After data migration, a `DO $$ BEGIN ... END $$` block asserts:
  - `count(org_members) = count(profiles)`
  - No org row has NULL `clickup_list_ids`
- If assertion fails: `RAISE EXCEPTION` → entire transaction rolls back automatically
- Prevents partial/invalid migration state from persisting

---

## Implementation Notes for Researcher / Planner

- The `user_org_ids()` function must use `SET search_path = ''` and fully-qualified names (`public.org_members`, `auth.uid()`)
- The `user_org_role(org_id uuid)` function follows the same SECURITY DEFINER + empty search_path pattern
- Data migration slug: derive from the profile's email domain (e.g., `nadin@mbm-moebel.de` → slug `mbm-moebel`)
- `profiles.organization_id` stays nullable after migration (backward safety) — only `credit_packages.organization_id` and `client_workspaces.organization_id` get NOT NULL after migration
- The gate check runs AFTER NOT NULL constraints are applied — if the migration reaches that point, the constraint already enforced non-null; the gate check is a logical assertion (counts match)
- No frontend changes in this phase — success is verified via psql/SQL queries only

---

## Out of Scope for Phase 9

- Edge Function updates (Phase 10)
- Frontend OrgContext / useOrg (Phase 11)
- /organisation admin page (Phase 12)
- Dropping legacy columns / policies (Phase 13)
- onboard-client.ts rewrite (Phase 13)
