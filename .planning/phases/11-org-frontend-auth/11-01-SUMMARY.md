---
phase: 11-org-frontend-auth
plan: "01"
subsystem: org-backend
tags: [migration, rls, rpc, staging, supabase]
dependency_graph:
  requires: [Phase 9 — org_foundation tables exist]
  provides: [RLS client-read on org_members, RLS client-read on organizations, get_org_credit_balance RPC]
  affects: [OrgProvider fetch (Plan 02), useCredits balance RPC (Plan 03)]
tech_stack:
  added: []
  patterns: [SECURITY DEFINER, set search_path='', revoke/grant, idempotent drop if exists]
key_files:
  created:
    - supabase/migrations/20260415120000_org_rls_and_credit_rpc.sql
  modified: []
decisions:
  - "Used Management API fallback (supabase db push failed — prior migrations already applied, no CLI migration tracking on staging)"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-15T08:59:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 1
  files_modified: 0
---

# Phase 11 Plan 01: org RLS + get_org_credit_balance RPC Summary

**One-liner:** RLS policies enabling client-side org reads on `org_members`/`organizations` + `get_org_credit_balance(p_org_id uuid)` SECURITY DEFINER RPC applied to staging.

## Migration File

**Filename:** `supabase/migrations/20260415120000_org_rls_and_credit_rpc.sql`
**Applied to:** Cloud Supabase staging (`ahlthosftngdcryltapu`, eu-central-1)
**Commit:** `fd4bfc4`

## Artifacts Created

### RLS Policy 1 — org_members

```sql
create policy "members can read own membership"
  on public.org_members for select
  to authenticated
  using (profile_id = auth.uid());
```

- Table: `public.org_members`
- Guard: `profile_id = auth.uid()` (direct column comparison)
- Idempotent: `drop policy if exists` before create

### RLS Policy 2 — organizations

```sql
create policy "members can read own organization"
  on public.organizations for select
  to authenticated
  using (
    id in (
      select organization_id
      from public.org_members
      where profile_id = auth.uid()
    )
  );
```

- Table: `public.organizations`
- Guard: subquery join through `org_members`
- Idempotent: `drop policy if exists` before create

### Function — get_org_credit_balance

```sql
create or replace function public.get_org_credit_balance(p_org_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
```

- Returns: `numeric` (coalesced sum of `credit_transactions.amount` for the org)
- Security: `SECURITY DEFINER` + `set search_path = ''` (injection hardening)
- Grants: `authenticated, anon, service_role` (public revoked)
- Mirrors: `user_org_ids()` pattern from Phase 9 migration

## Staging Apply Method

**Method used:** Supabase Management API (`POST /v1/projects/ahlthosftngdcryltapu/database/query`)

**Why not `supabase db push`:** The CLI attempted to replay all unapplied migrations starting from `20260320_project_memory_entries.sql`. Earlier migrations were already applied on staging but not tracked in `supabase_migrations` table, causing the CLI to fail on already-existing policies. The Management API applies SQL directly without migration tracking — correct approach for this pattern (established in Phase 09-01).

**Verification queries confirmed:**

| Check | Result |
|-------|--------|
| `SELECT proname FROM pg_proc WHERE proname = 'get_org_credit_balance'` | 1 row |
| `SELECT policyname FROM pg_policies WHERE policyname = 'members can read own membership'` | 1 row (tablename: org_members) |
| `SELECT policyname FROM pg_policies WHERE policyname = 'members can read own organization'` | 1 row (tablename: organizations) |

## Deviations from Plan

### [Rule 3 - Blocking Issue] supabase db push failed — fallback to Management API

- **Found during:** Task 2
- **Issue:** `supabase db push` attempted to replay all un-tracked migrations from the start. Earliest migration (`20260320_project_memory_entries.sql`) failed with `policy already exists` because it was already applied to staging outside CLI tracking context.
- **Fix:** Applied new migration directly via `POST https://api.supabase.com/v1/projects/ahlthosftngdcryltapu/database/query` using Node.js (no jq available). Returns HTTP 201 + `[]` on success.
- **Note:** This is the established fallback pattern (documented in Phase 09-01 STATE.md reference and plan Task 2 instructions).
- **Production impact:** None — production (self-hosted Coolify) was not touched.

### Minor: jq not available in bash environment

- **Found during:** Task 2 (first Management API attempt)
- **Fix:** Used `node -e` with `JSON.stringify` instead of `jq -Rs '{query: .}'`

## Known Stubs

None — this plan is a pure SQL migration with no UI stubs.

## Threat Flags

None — migration adds read-only RLS policies and a SECURITY DEFINER stable function. No new network endpoints, write paths, or trust boundary crossings introduced.

## Self-Check: PASSED

- [x] `supabase/migrations/20260415120000_org_rls_and_credit_rpc.sql` exists on disk
- [x] Commit `fd4bfc4` exists in git log
- [x] `get_org_credit_balance` confirmed in `pg_proc` on staging
- [x] `"members can read own membership"` confirmed in `pg_policies` on staging
- [x] `"members can read own organization"` confirmed in `pg_policies` on staging
- [x] Production (self-hosted Coolify) not touched
