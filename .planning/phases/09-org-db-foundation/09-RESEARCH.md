# Phase 9: org-db-foundation - Research

**Researched:** 2026-04-14
**Domain:** PostgreSQL schema migration, Supabase RLS, SECURITY DEFINER functions, dual-mode policy transition
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration Strategy:**
- Single file: `supabase/migrations/20260414200000_org_foundation.sql`
- Order within file: tables → SQL functions → data migration → NOT NULL constraints → RLS policies → gate check DO block
- Atomic: if any step fails, the entire transaction rolls back
- Matching `supabase/migrations/20260414200000_org_foundation_rollback.sql` with DROP statements for manual use

**Dual-Mode RLS Design:**
- New org-scoped policies on `credit_packages` and `client_workspaces` use `PERMISSIVE` (default)
- Old `profile_id = auth.uid()` policies remain PERMISSIVE and active in parallel
- Postgres ORs all PERMISSIVE policies — a row is visible if ANY policy matches
- No duplicate rows: if a row matches both profile_id AND org_id, Postgres returns it once

**notifications_type_check constraint extended in Phase 9 migration:**
- Add `member_invited` and `member_removed` to the allowed types in the same migration

**SQL Function Security:**
- `user_org_ids()`: returns empty set (not exception) when `auth.uid()` is NULL
- Gate check is a DO block inside the migration — RAISE EXCEPTION rolls back entire transaction

### Claude's Discretion
None — all implementation decisions are locked.

### Deferred Ideas (OUT OF SCOPE)
- Edge Function updates (Phase 10)
- Frontend OrgContext / useOrg (Phase 11)
- /organisation admin page (Phase 12)
- Dropping legacy columns / policies (Phase 13)
- onboard-client.ts rewrite (Phase 13)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORG-DB-01 | `organizations` table: id, name, slug (unique), clickup_list_ids (jsonb), nextcloud_client_root, support_task_id, clickup_chat_channel_id, created_at, updated_at | Table DDL pattern from existing migrations; columns confirmed via profiles schema |
| ORG-DB-02 | `org_members` table: id, organization_id FK, profile_id FK, role (check: admin/member/viewer), created_at; unique on (organization_id, profile_id) | Composite unique constraint pattern confirmed in existing tables |
| ORG-DB-03 | `user_org_ids()` SECURITY DEFINER STABLE SET search_path='' returns SETOF uuid | SECURITY DEFINER + empty search_path pattern verified via Supabase docs; initPlan caching pattern verified |
| ORG-DB-04 | `user_org_role(org_id uuid)` SECURITY DEFINER STABLE returns role text | Same security pattern as ORG-DB-03 |
| ORG-DB-05 | Nullable organization_id FK on credit_packages, client_workspaces, profiles, credit_transactions | ALTER TABLE ADD COLUMN IF NOT EXISTS pattern from existing migrations |
| ORG-DB-06 | Data migration: one org per profile, slug from email domain, admin row in org_members, org fields from profile | DO block + INSERT ... SELECT pattern; slug derivation via SQL regex confirmed |
| ORG-DB-07 | NOT NULL constraints on credit_packages.organization_id and client_workspaces.organization_id after migration | ALTER TABLE SET NOT NULL — safe post-migration since all rows populated |
| ORG-DB-08 | Org-scoped PERMISSIVE RLS policies on credit_packages and client_workspaces using (SELECT user_org_ids()) | PERMISSIVE multi-policy OR semantics confirmed via PostgreSQL docs |
| ORG-DB-09 | Migration gate: count(org_members) = count(profiles), no null clickup_list_ids | DO block + RAISE EXCEPTION pattern verified from agent_jobs migration |
| ORG-DB-10 | notifications_type_check constraint extended with member_invited, member_removed | ALTER TABLE DROP CONSTRAINT + ADD CONSTRAINT pattern confirmed |
</phase_requirements>

---

## Summary

Phase 9 is a pure database migration phase. There are no frontend or Edge Function changes. The entire deliverable is a single atomic SQL migration file that: (1) creates two new tables, (2) installs two SECURITY DEFINER helper functions, (3) migrates existing profile data into the org structure, (4) enforces NOT NULL on the tables that are now fully populated, (5) adds parallel org-scoped RLS policies without removing existing ones, and (6) extends the notifications constraint.

The technical risk is low because all decisions are locked, all PostgreSQL patterns are confirmed from official sources, and the atomic migration design means a failed gate check rolls everything back cleanly. The only wrinkle is the correct syntax for extending a named CHECK constraint in PostgreSQL — this requires DROP + re-ADD because PostgreSQL does not support `ALTER CONSTRAINT` for CHECK constraints.

**Primary recommendation:** Write the migration as a single SQL file following the project's established pattern (lowercase snake_case, `public.` schema prefix, `IF NOT EXISTS` guards on tables, `CREATE OR REPLACE` on functions). The rollback.sql is a companion file of DROP statements for manual emergency use only — it is not transactional and should not be auto-applied.

---

## Standard Stack

### Core (this phase is SQL-only — no JS/TS packages)

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| PostgreSQL | 15.x (self-hosted Supabase on Coolify) | Database engine | Cloud Supabase staging runs 15.x [ASSUMED — Cloud Supabase free tier is typically PG 15] |
| Supabase CLI | installed | `supabase db push` to apply migration to staging | Already set up per project docs |
| psql | system | Manual verification of functions and row counts | Available via staging connection string |

**Installation:** No new packages. Migration is applied via:
```bash
supabase link --project-ref ahlthosftngdcryltapu
supabase db push
```

---

## Architecture Patterns

### Recommended Migration File Structure

Following the project's existing migration style (confirmed by reading all 7 existing migrations):

```sql
-- Migration: [description]
-- Phase 9: org-db-foundation

-- ==================================================
-- SECTION 1: NEW TABLES
-- ==================================================

CREATE TABLE IF NOT EXISTS public.organizations ( ... );
CREATE TABLE IF NOT EXISTS public.org_members ( ... );

-- ==================================================
-- SECTION 2: SQL HELPER FUNCTIONS
-- ==================================================

CREATE OR REPLACE FUNCTION public.user_org_ids() ...
CREATE OR REPLACE FUNCTION public.user_org_role(org_id uuid) ...

-- ==================================================
-- SECTION 3: FK COLUMNS (nullable, added before data migration)
-- ==================================================

ALTER TABLE public.credit_packages ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.client_workspaces ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.credit_transactions ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- ==================================================
-- SECTION 4: DATA MIGRATION
-- ==================================================

DO $$ ... INSERT INTO organizations ... INSERT INTO org_members ... UPDATE credit_packages ... $$;

-- ==================================================
-- SECTION 5: NOT NULL CONSTRAINTS
-- ==================================================

ALTER TABLE public.credit_packages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.client_workspaces ALTER COLUMN organization_id SET NOT NULL;

-- ==================================================
-- SECTION 6: RLS POLICIES (new, parallel to existing)
-- ==================================================

CREATE POLICY "..." ON public.credit_packages FOR SELECT USING (...);
CREATE POLICY "..." ON public.client_workspaces FOR SELECT USING (...);

-- ==================================================
-- SECTION 7: EXTEND notifications_type_check
-- ==================================================

ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('team_reply', 'status_change', 'step_ready', 'project_reply',
                  'project_update', 'new_recommendation', 'member_invited', 'member_removed'));

-- ==================================================
-- SECTION 8: MIGRATION GATE
-- ==================================================

DO $$ ... RAISE EXCEPTION if counts don't match ... $$;
```

---

### Pattern 1: SECURITY DEFINER Function with Empty search_path

**What:** Creates a function that runs with definer privileges, immune to search_path hijacking, with initPlan caching when called as `(SELECT user_org_ids())` in RLS policies.

**Why the `(SELECT ...)` wrapper matters:** Without it, the function is called once per row evaluated. With the wrapper, Postgres treats it as an initPlan — evaluating it once per statement and caching the result. Supabase docs benchmark shows up to 99.94% improvement for custom functions. [CITED: supabase.com/docs/guides/database/postgres/row-level-security]

**Example:**
```sql
-- Source: Supabase docs pattern + project CONTEXT.md requirement
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT om.organization_id
  FROM public.org_members om
  WHERE om.profile_id = auth.uid()
    AND auth.uid() IS NOT NULL;
$$;
```

Note: `auth.uid()` is in the `auth` schema. With `SET search_path = ''`, all references must be fully qualified — `public.org_members`, `auth.uid()`. The `auth` schema is always accessible regardless of search_path because it is a built-in Supabase schema. [VERIFIED: Supabase docs state "you must explicitly state the schema for every relation"]

**user_org_role variant:**
```sql
CREATE OR REPLACE FUNCTION public.user_org_role(org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT om.role
  FROM public.org_members om
  WHERE om.organization_id = org_id
    AND om.profile_id = auth.uid()
  LIMIT 1;
$$;
```

Returns NULL (not exception) when the user is not a member of the org. [ASSUMED — NULL return is the natural SQL behavior when no row is found; consistent with CONTEXT.md intent]

---

### Pattern 2: Dual PERMISSIVE RLS Policies (parallel transition)

**What:** Adding new org-scoped policies alongside existing profile-scoped policies. PostgreSQL combines all PERMISSIVE policies on a table with OR — a row is visible if ANY policy returns true.

**No duplicate rows:** OR logic determines row visibility at the filter layer; each row appears at most once in the result set regardless of how many policies match it. [VERIFIED: postgresql.org/docs/current/ddl-rowsecurity.html — "combined together using the Boolean 'OR' operator"]

**Example for credit_packages:**
```sql
-- Existing policy (keep as-is — do NOT drop or modify):
-- CREATE POLICY "Users see own packages" ON credit_packages
--   FOR SELECT USING (profile_id = auth.uid());

-- New org-scoped policy (add in Phase 9 migration):
CREATE POLICY "Users see org packages" ON public.credit_packages
  FOR SELECT
  USING (
    organization_id IN (SELECT public.user_org_ids())
  );
```

**Key detail:** The `(SELECT public.user_org_ids())` wrapper is what triggers initPlan caching. Writing `public.user_org_ids()` directly would call the function once per row. [CITED: supabase.com/docs/guides/database/postgres/row-level-security]

**Example for client_workspaces:**
```sql
CREATE POLICY "Users see org workspaces" ON public.client_workspaces
  FOR SELECT
  USING (
    organization_id IN (SELECT public.user_org_ids())
  );
```

---

### Pattern 3: Data Migration with Slug Derivation in Pure SQL

**What:** For each profile, create one org row and one org_members admin row, deriving the slug from the email domain.

**Slug derivation logic:** `nadin@mbm-moebel.de` → domain `mbm-moebel.de` → slug `mbm-moebel`. Strip the TLD using `split_part(split_part(email, '@', 2), '.', 1)` for simple domains. For multi-part domains (e.g., `sub.client.de`), a more robust approach extracts the second-to-last label.

**Recommended SQL approach for slug:**
```sql
-- For email 'nadin@mbm-moebel.de':
-- split_part(email, '@', 2) → 'mbm-moebel.de'
-- Then strip last segment: regexp_replace(domain, '\.[^.]+$', '')
-- → 'mbm-moebel'
regexp_replace(split_part(email, '@', 2), '\.[^.]+$', '') AS slug
```

This handles `mbm-moebel.de` → `mbm-moebel` and `client.example.com` → `client.example`. [ASSUMED — standard SQL regex approach; no library available in pure SQL for complex TLD parsing]

**Full migration DO block structure:**
```sql
DO $$
DECLARE
  p RECORD;
  new_org_id uuid;
  org_slug text;
BEGIN
  FOR p IN SELECT id, email, company_name, clickup_list_ids,
                  nextcloud_client_root, support_task_id,
                  clickup_chat_channel_id
           FROM public.profiles LOOP

    -- Derive slug from email domain, lowercased
    org_slug := lower(regexp_replace(split_part(p.email, '@', 2), '\.[^.]+$', ''));

    -- Create org
    INSERT INTO public.organizations (name, slug, clickup_list_ids,
                                      nextcloud_client_root, support_task_id,
                                      clickup_chat_channel_id)
    VALUES (
      COALESCE(p.company_name, split_part(p.email, '@', 1)),
      org_slug,
      COALESCE(p.clickup_list_ids, '[]'::jsonb),
      p.nextcloud_client_root,
      p.support_task_id,
      p.clickup_chat_channel_id
    )
    RETURNING id INTO new_org_id;

    -- Link profile as admin
    INSERT INTO public.org_members (organization_id, profile_id, role)
    VALUES (new_org_id, p.id, 'admin');

    -- Back-fill FK on profile
    UPDATE public.profiles SET organization_id = new_org_id WHERE id = p.id;

    -- Back-fill FK on credit_packages
    UPDATE public.credit_packages SET organization_id = new_org_id WHERE profile_id = p.id;

    -- Back-fill FK on client_workspaces
    UPDATE public.client_workspaces SET organization_id = new_org_id WHERE profile_id = p.id;

    -- Back-fill FK on credit_transactions
    UPDATE public.credit_transactions SET organization_id = new_org_id WHERE profile_id = p.id;

  END LOOP;
END;
$$;
```

**Slug uniqueness concern:** If two profiles share the same email domain (e.g., two employees of the same company), the slug insert would fail the unique constraint. In the current data model, each profile represents one client company — slug collision implies a data issue. The migration will RAISE an exception on duplicate slug, making the problem visible rather than silently creating broken state. [ASSUMED — based on project's one-profile-per-company model described in CONTEXT.md]

---

### Pattern 4: Extending a Named CHECK Constraint

**What:** PostgreSQL does not support `ALTER CONSTRAINT` for CHECK constraints. The only way to add new allowed values is to DROP the constraint and re-ADD it with the expanded value list.

**Critical:** The DROP + ADD happens inside the same atomic migration transaction, so there is no window where the constraint is absent. [VERIFIED: postgresql.org/docs/current/sql-altertable.html]

**Exact pattern:**
```sql
-- Extend notifications_type_check to add member_invited and member_removed
ALTER TABLE public.notifications
  DROP CONSTRAINT notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'team_reply',
    'status_change',
    'step_ready',
    'project_reply',
    'project_update',
    'new_recommendation',
    'member_invited',
    'member_removed'
  ));
```

**Risk:** The constraint name `notifications_type_check` must match exactly what is in the database. If the constraint was created with a different name (e.g., auto-generated), the DROP will fail. The constraint name is documented in DATABASE_SCHEMA.md as `notifications_type_check` — confirmed. [VERIFIED: DATABASE_SCHEMA.md line 120]

---

### Pattern 5: Migration Gate as DO Block

**What:** After all data migration and NOT NULL constraints, a DO block asserts data integrity. If the assertion fails, `RAISE EXCEPTION` rolls back the entire transaction.

```sql
DO $$
DECLARE
  org_member_count integer;
  profile_count integer;
  null_list_count integer;
BEGIN
  SELECT COUNT(*) INTO org_member_count FROM public.org_members;
  SELECT COUNT(*) INTO profile_count FROM public.profiles;
  SELECT COUNT(*) INTO null_list_count
    FROM public.organizations
    WHERE clickup_list_ids IS NULL;

  IF org_member_count != profile_count THEN
    RAISE EXCEPTION 'Migration gate failed: org_members count (%) != profiles count (%)',
      org_member_count, profile_count;
  END IF;

  IF null_list_count > 0 THEN
    RAISE EXCEPTION 'Migration gate failed: % organizations have NULL clickup_list_ids',
      null_list_count;
  END IF;
END;
$$;
```

**Why this works:** The gate runs inside the same transaction as the migration. `RAISE EXCEPTION` in a PL/pgSQL block causes the current transaction to abort, rolling back all preceding DDL and DML. [VERIFIED: PostgreSQL docs state DO blocks run inside the current transaction context]

---

### Pattern 6: Rollback File (companion, manual-only)

The rollback file is NOT a migration — it is a reference script for manual emergency use. It should DROP everything added by the forward migration in reverse dependency order:

```sql
-- ROLLBACK: 20260414200000_org_foundation
-- WARNING: Manual use only. This will destroy all org data.

-- 1. Drop gate (nothing to drop)
-- 2. Revert RLS policies
DROP POLICY IF EXISTS "Users see org packages" ON public.credit_packages;
DROP POLICY IF EXISTS "Users see org workspaces" ON public.client_workspaces;

-- 3. Revert notifications constraint
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('team_reply','status_change','step_ready','project_reply',
                  'project_update','new_recommendation'));

-- 4. Drop NOT NULL constraints
ALTER TABLE public.credit_packages ALTER COLUMN organization_id DROP NOT NULL;
ALTER TABLE public.client_workspaces ALTER COLUMN organization_id DROP NOT NULL;

-- 5. Drop FK columns
ALTER TABLE public.profiles DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.credit_packages DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.client_workspaces DROP COLUMN IF EXISTS organization_id;
ALTER TABLE public.credit_transactions DROP COLUMN IF EXISTS organization_id;

-- 6. Drop functions
DROP FUNCTION IF EXISTS public.user_org_ids();
DROP FUNCTION IF EXISTS public.user_org_role(uuid);

-- 7. Drop tables (CASCADE drops FK constraints automatically)
DROP TABLE IF EXISTS public.org_members CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;
```

---

### Anti-Patterns to Avoid

- **Calling `user_org_ids()` directly in RLS without the `(SELECT ...)` wrapper:** Will be called once per evaluated row, killing query performance. Always use `organization_id IN (SELECT public.user_org_ids())`.
- **Using `SET search_path = public` instead of `SET search_path = ''`:** Supabase Security Advisor flags `search_path = public` as mutable; empty string is the hardened pattern. [CITED: supabase.com/docs/guides/database/database-advisors]
- **Applying NOT NULL before data migration:** Will fail immediately since the new column starts NULL. The migration order (FK column → data migration → NOT NULL) is mandated in CONTEXT.md.
- **Dropping the old `profile_id = auth.uid()` RLS policies in this phase:** These must stay active through Phase 13. Removing them now would break existing Edge Functions and frontend code that have no org-scoped data access yet.
- **Running the rollback.sql as a Supabase migration:** It is a manual script. If applied via `supabase db push`, it would be tracked in the migration history and could cause inconsistent state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Org membership check in RLS | Custom inline subquery per policy | `public.user_org_ids()` SECURITY DEFINER function | Reusable, cached via initPlan, secure against search_path attacks |
| Slug uniqueness enforcement | Application-level check | `UNIQUE` constraint on `organizations.slug` | DB-level guarantee; insert fails immediately |
| Migration data integrity | Manual post-migration checks | Gate check DO block inside the transaction | Atomic — failure rolls back; no partial state possible |
| Constraint extension | Boolean flags / separate table | DROP + ADD CONSTRAINT in same transaction | No window of missing constraint; no data model complexity |

---

## Common Pitfalls

### Pitfall 1: Slug Collision on Duplicate Email Domains
**What goes wrong:** Two profiles with the same email domain (e.g., both `@client.de`) cause a unique constraint violation on `organizations.slug` during the data migration DO block.
**Why it happens:** The current schema has one profile per company, but if test data or edge cases exist with shared domains, the migration aborts.
**How to avoid:** Before running the migration on staging, query: `SELECT split_part(email, '@', 2), COUNT(*) FROM profiles GROUP BY 1 HAVING COUNT(*) > 1;` — if any rows exist, handle them manually before running the migration.
**Warning signs:** Migration fails with `ERROR: duplicate key value violates unique constraint "organizations_slug_key"`.

### Pitfall 2: Constraint Name Mismatch on notifications_type_check
**What goes wrong:** `ALTER TABLE notifications DROP CONSTRAINT notifications_type_check` fails because the actual constraint has a different name.
**Why it happens:** The constraint was documented in DATABASE_SCHEMA.md but was potentially created with a different naming convention on the actual staging database.
**How to avoid:** Before writing the migration, verify the exact constraint name: `SELECT conname FROM pg_constraint WHERE conrelid = 'public.notifications'::regclass AND contype = 'c';`
**Warning signs:** Migration fails with `ERROR: constraint "notifications_type_check" of relation "notifications" does not exist`.

### Pitfall 3: `auth.uid()` Not Accessible Inside `SET search_path = ''`
**What goes wrong:** `auth.uid()` is not found when `search_path` is empty because `auth` is not in the path.
**Why it happens:** With empty search_path, PostgreSQL only resolves fully-qualified names — `auth.uid()` is already fully qualified (schema `auth`, function `uid`), so it DOES work. But `uid()` alone would fail.
**How to avoid:** Always write `auth.uid()` (already qualified). Never write unqualified names in SECURITY DEFINER functions with empty search_path.
**Warning signs:** `ERROR: function uid() does not exist` — means the `auth.` prefix was accidentally dropped.

### Pitfall 4: Missing `REPLICA IDENTITY FULL` on New Tables
**What goes wrong:** Supabase Realtime subscriptions on `org_members` or `organizations` return incomplete change events — only new values, not old values, causing issues in delete/update handlers.
**Why it happens:** New tables created by migrations do not automatically get `REPLICA IDENTITY FULL`. However, Phase 9 has no Realtime requirements — these tables are not subscribed to in Phase 9.
**How to avoid:** Not needed in Phase 9. Flag for Phase 10/11 if Realtime on org tables is required.
**Warning signs:** Only relevant if Phase 11 attempts Realtime on these tables without the setting.

### Pitfall 5: Supabase CLI Applies Migrations Transactionally Per File — Confirm Behavior
**What goes wrong:** Some Supabase CLI versions wrap each migration file in an implicit transaction; others do not for DDL-heavy files. If the implicit transaction is NOT applied, a mid-migration failure could leave partial state.
**Why it happens:** Supabase CLI uses `psql` under the hood. By default each SQL file is sent as a batch. Explicit `BEGIN/COMMIT` blocks inside the file can conflict with the implicit transaction.
**How to avoid:** The migration file should NOT contain explicit `BEGIN`/`COMMIT` statements — the DO blocks use their own PL/pgSQL context. The Supabase CLI wraps the file in a transaction automatically. [ASSUMED — Supabase CLI transaction behavior; verify with `supabase db push --dry-run` on staging before actual apply]
**Warning signs:** Only relevant if you see partial migration state after a failure. Mitigation: test on staging first.

---

## Code Examples

### Complete `user_org_ids()` Function

```sql
-- Source: Supabase docs SECURITY DEFINER pattern + project CONTEXT.md
CREATE OR REPLACE FUNCTION public.user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT om.organization_id
  FROM public.org_members om
  WHERE om.profile_id = auth.uid()
    AND auth.uid() IS NOT NULL;
$$;
```

### Complete `user_org_role()` Function

```sql
-- Source: mirrors user_org_ids() pattern
CREATE OR REPLACE FUNCTION public.user_org_role(org_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT om.role
  FROM public.org_members om
  WHERE om.organization_id = org_id
    AND om.profile_id = auth.uid()
  LIMIT 1;
$$;
```

### Verification Queries (for post-migration psql check)

```sql
-- Verify function returns correct results for a known user
-- (run as authenticated user via service role impersonation or direct psql test)
SELECT public.user_org_ids();

-- Verify all profiles have an org
SELECT COUNT(*) FROM profiles WHERE organization_id IS NULL;
-- Expected: 0

-- Verify gate conditions manually
SELECT COUNT(*) FROM org_members;    -- must equal:
SELECT COUNT(*) FROM profiles;

SELECT COUNT(*) FROM organizations WHERE clickup_list_ids IS NULL;
-- Expected: 0

-- Verify dual policies are both active
SELECT schemaname, tablename, policyname, permissive
FROM pg_policies
WHERE tablename IN ('credit_packages', 'client_workspaces')
ORDER BY tablename, policyname;
-- Expected: 2 rows per table, both permissive = 'PERMISSIVE' (or 'YES')
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `auth.uid()` direct in RLS | `(SELECT auth.uid())` wrapper | Supabase RLS perf docs | 94% query improvement on large tables |
| `SET search_path = public` | `SET search_path = ''` | Supabase Security Advisor | Hardened against schema injection |
| Dropping old policies during transition | Dual PERMISSIVE policies in parallel | Phase 9 design | Zero-downtime transition without code freezes |

---

## Runtime State Inventory

This phase does not involve a rename or rebrand. However, it does migrate existing rows in live tables. The inventory below covers categories relevant to this data migration:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `profiles` table: N rows (one per client); `credit_packages`, `client_workspaces`, `credit_transactions` rows with `profile_id` FK | Data migration in DO block — back-fill `organization_id` on all rows |
| Live service config | Edge Functions still read `profiles.clickup_list_ids` etc. — they must continue working post-migration | No action in Phase 9; dual-read fallback added in Phase 10 |
| OS-registered state | None | None |
| Secrets/env vars | No env var changes in Phase 9 | None |
| Build artifacts | None | None |

**Profile data that gets copied to organizations:**
- `clickup_list_ids` (jsonb) → `organizations.clickup_list_ids`
- `nextcloud_client_root` (text) → `organizations.nextcloud_client_root`
- `support_task_id` (text) → `organizations.support_task_id`
- `clickup_chat_channel_id` (text) → `organizations.clickup_chat_channel_id`

These columns are NOT dropped from `profiles` in Phase 9 — that is Phase 13 scope.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI | `supabase db push` to staging | Confirmed in docs | Installed | — |
| Cloud Supabase staging | All Phase 9 work | Confirmed | `ahlthosftngdcryltapu` | — |
| psql | Post-migration verification queries | [ASSUMED: available on dev machine] | — | Supabase SQL editor in dashboard |
| Production DB | Phase 9 scope | NOT targeted | — | Phase 13+ only |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (project standard) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test:coverage` |

### Phase Requirements → Test Map

Phase 9 is **pure SQL / database migration** — all 10 requirements are verified via psql queries, not unit tests. The project's test framework covers React/TypeScript code. SQL migration correctness is validated through:

1. The migration gate DO block (automated, runs as part of migration)
2. Manual psql verification queries (listed in Code Examples section above)
3. Supabase SQL Editor checks on staging

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| ORG-DB-01 | organizations table exists with correct columns | Manual SQL | `\d public.organizations` in psql | Post-migration verify |
| ORG-DB-02 | org_members table with unique constraint | Manual SQL | `\d public.org_members` | Post-migration verify |
| ORG-DB-03 | user_org_ids() returns correct UUIDs | Manual SQL | `SELECT public.user_org_ids()` as authenticated user | Requires auth context |
| ORG-DB-04 | user_org_role() returns correct role text | Manual SQL | `SELECT public.user_org_role('<org_id>')` | Requires auth context |
| ORG-DB-05 | organization_id FK on all 4 tables | Manual SQL | `SELECT column_name FROM information_schema.columns WHERE table_name = 'credit_packages'` | |
| ORG-DB-06 | Every profile has matching org + org_members row | Gate check (automated) | Inside migration DO block (gate check) | RAISE EXCEPTION if fails |
| ORG-DB-07 | NOT NULL enforced on credit_packages + client_workspaces | Manual SQL | `SELECT COUNT(*) FROM credit_packages WHERE organization_id IS NULL` | Expected: 0 |
| ORG-DB-08 | Both RLS policies active in parallel | Manual SQL | `SELECT * FROM pg_policies WHERE tablename = 'credit_packages'` | Expect 2 rows |
| ORG-DB-09 | Gate check passes | Gate check (automated) | Inside migration DO block | RAISE EXCEPTION if fails |
| ORG-DB-10 | notifications_type_check includes new types | Manual SQL | `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'notifications_type_check'` | |

### Wave 0 Gaps

No new test files needed for Phase 9 — SQL migrations are not covered by the project's Vitest test suite. The gate check DO block serves as the automated verification. Manual psql steps will be documented in the VALIDATION.md for this phase.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Not applicable (DB migration only) |
| V3 Session Management | no | Not applicable |
| V4 Access Control | yes | RLS policies with SECURITY DEFINER helper functions |
| V5 Input Validation | no | No user input in this phase |
| V6 Cryptography | no | No cryptographic operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Search path injection into SECURITY DEFINER function | Elevation of Privilege | `SET search_path = ''` + fully qualified names |
| RLS bypass via unindexed org lookup | Denial of Service (slow queries) | `(SELECT user_org_ids())` initPlan caching + index on org_members(profile_id) |
| Data exposure during transition (no-policy window) | Information Disclosure | Atomic transaction: old + new policies both exist before commit; no window |
| Partial migration state (gate check failure) | Tampering | `RAISE EXCEPTION` in DO block rolls back entire transaction |

**RLS index recommendation:** Add an index on `public.org_members(profile_id)` to make `user_org_ids()` fast. Without it, every authenticated query scans all org_members rows.

```sql
CREATE INDEX IF NOT EXISTS org_members_profile_id_idx ON public.org_members(profile_id);
CREATE INDEX IF NOT EXISTS org_members_org_id_idx ON public.org_members(organization_id);
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Staging Cloud Supabase runs PostgreSQL 15.x | Standard Stack | Low — SQL syntax used is compatible with PG 14+ |
| A2 | psql is available on dev machine for verification | Environment Availability | Low — Supabase SQL Editor in dashboard is a valid fallback |
| A3 | `user_org_role()` returning NULL (not exception) when user is not a member is the intended behavior | Pattern 1 | Low — consistent with CONTEXT.md "returns empty set for unauthenticated callers" intent |
| A4 | Supabase CLI wraps each migration file in an implicit transaction | Pitfall 5 | Medium — if false, a mid-migration failure leaves partial state; mitigation: test on staging first |
| A5 | No two profiles in staging share the same email domain | Pitfall 1 | Medium — if false, migration aborts; pre-migration query recommended |
| A6 | `auth.uid()` is accessible inside a function with `SET search_path = ''` because `auth.uid()` is already fully qualified | Pattern 1 | Low — confirmed by Supabase documentation stating "must explicitly state the schema for every relation" |

---

## Open Questions (RESOLVED)

1. **Slug collision on existing staging data** — RESOLVED: Task 1 Step 2 runs the pre-migration duplicate-domain query; migration halts if any collision is found.

2. **`updated_at` trigger for organizations table** — RESOLVED: Plan instructs executor to reuse `public.set_updated_at()` (already installed from Phase 6 migration `20260406000000_create_agent_jobs.sql`); do NOT redefine it.

3. **Exact notifications_type_check constraint name on staging** — RESOLVED: Task 1 Step 3 verifies the exact constraint name via `pg_constraint` query before migration proceeds; halts if name differs.

---

## Sources

### Primary (HIGH confidence)
- [Supabase RLS Docs](https://supabase.com/docs/guides/database/postgres/row-level-security) — initPlan caching pattern, `(SELECT fn())` wrapper, SECURITY DEFINER
- [Supabase Database Functions Docs](https://supabase.com/docs/guides/database/functions) — `SET search_path = ''` pattern, SETOF return type
- [PostgreSQL Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — PERMISSIVE policy OR semantics, no duplicate rows
- [PostgreSQL ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — CHECK constraint DROP/ADD pattern
- Project migrations `20260406000000_create_agent_jobs.sql` — DO block pattern, `set_updated_at()` function, RAISE EXCEPTION style [VERIFIED: read directly]
- Project migrations `20260323000000_credit_system.sql` — existing RLS policy names for credit_packages and client_workspaces [VERIFIED: read directly]
- `docs/system-context/DATABASE_SCHEMA.md` — existing table columns, constraint names, existing policy names [VERIFIED: read directly]
- `.planning/phases/09-org-db-foundation/09-CONTEXT.md` — all locked decisions [VERIFIED: read directly]

### Secondary (MEDIUM confidence)
- [Supabase Security Advisors](https://supabase.com/docs/guides/database/database-advisors) — `SET search_path = ''` vs `= public` hardening guidance

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Table DDL: HIGH — straightforward CREATE TABLE following existing project patterns
- SECURITY DEFINER functions: HIGH — verified against Supabase official docs
- Dual PERMISSIVE RLS: HIGH — verified against PostgreSQL official docs
- CHECK constraint extension: HIGH — verified against PostgreSQL ALTER TABLE docs
- Data migration slug logic: MEDIUM — SQL regex approach is standard; edge cases (multi-part domains) are ASSUMED
- Gate check DO block: HIGH — pattern directly derived from existing agent_jobs migration
- Rollback file: HIGH — DROP statements are straightforward; file is manual-use only

**Research date:** 2026-04-14
**Valid until:** 2026-07-14 (stable PostgreSQL/Supabase APIs — 90 days)
