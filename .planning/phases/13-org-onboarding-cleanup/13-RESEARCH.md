# Phase 13: org-onboarding-cleanup — Research

**Researched:** 2026-04-15
**Domain:** PostgreSQL schema migration (column/policy drops), Supabase Edge Functions cleanup, Node.js onboarding script rewrite, frontend profile type migration
**Confidence:** HIGH — all findings sourced directly from codebase inspection

---

## Summary

Phase 13 is the final cleanup phase of the v2.0 Organisation milestone. Phases 9–12 built the dual-read infrastructure (new `organizations` table, `org_members`, RLS policies, Edge Functions with `org ?? profile` fallbacks, frontend OrgContext). Phase 13 removes the scaffolding: drops legacy RLS policies and FK columns, removes dual-read code from Edge Functions, and rewrites the onboarding script to be org-first.

The work divides into five areas: (1) `onboard-client.ts` rewrite (pure TypeScript, no DB migration), (2) RLS policy drops on two tables (SQL migration), (3) `profile_id` FK column drops on two tables (SQL migration, depends on #2 completing first), (4) dual-read fallback removal from 4 Edge Functions (TypeScript), and (5) legacy column drops from `profiles` (SQL migration, depends on frontend reads being removed first).

**The critical sequencing constraint:** The 4 Edge Functions currently read `profiles.clickup_list_ids`, `profiles.nextcloud_client_root`, and `profiles.clickup_chat_channel_id` as fallbacks. The frontend reads `profile.support_task_id` directly (not via OrgContext) in 5 places. These frontend reads must be updated BEFORE the column is dropped — dropping `profiles.support_task_id` while frontend still queries it produces a Supabase select error (unknown column). The DB column drops are the last tasks in the phase.

**Primary recommendation:** Execute in three waves: Wave 1 = script rewrite + Edge Function cleanup (no DB changes, fully reversible), Wave 2 = RLS policy drops + profile_id FK column drops (DB changes on already-migrated data), Wave 3 = frontend profile type cleanup + profiles column drops (requires Wave 1 deployed and validated).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Org creation (onboarding) | Script (Node.js) | — | Admin operation; no user JWT available at onboarding time |
| Auth user creation | Script (admin client) | — | Requires service role; not Edge Function (no HTTP endpoint needed) |
| Workspace/credit setup | Script (admin client) | — | Row inserts for new org; script is source of truth |
| RLS policy management | Database (SQL migration) | — | Postgres DDL; cannot be done from application code |
| Column drops | Database (SQL migration) | — | DDL; must be last step after all readers are removed |
| Dual-read removal | Edge Functions (Deno) | — | Code cleanup in existing 4 functions |
| Profile type cleanup | Frontend (TypeScript) | — | `Profile` interface fields no longer exist after column drop |

---

## Standard Stack

Phase 13 uses no new libraries. All work uses existing project stack.

| Tool | Purpose | Notes |
|------|---------|-------|
| `@supabase/supabase-js` (already in scripts) | Admin client for onboard-client.ts | Already imported in current script |
| Supabase CLI (`supabase db push`) | Apply SQL migrations to staging | Already set up |
| TypeScript / `tsx` | Script execution | `npx tsx scripts/onboard-client.ts` |

---

## Architecture Patterns

### Recommended Execution Order

```
Wave 0: Create phase 13 DB migration file (SQL stubs for review)
Wave 1: Rewrite onboard-client.ts (org-first flow)
Wave 2: Remove dual-read fallbacks from 4 Edge Functions
Wave 3: SQL migration — drop legacy RLS policies + profile_id FK columns
Wave 4: Update frontend Profile type + callers of profile.support_task_id
Wave 5: SQL migration — drop profiles legacy columns
```

### Safe Migration Order (Critical Dependency Chain)

The constraint graph:

```
DB state (current)
  credit_packages: profile_id NOT NULL, organization_id NOT NULL
  client_workspaces: profile_id NOT NULL, organization_id NOT NULL
  Both tables have BOTH: old "profile_id = auth.uid()" policy AND new "org" policy

Required sequence:
  1. Drop old RLS policies (credit_packages, client_workspaces)
     → Safe because org policy already covers all rows (org_id NOT NULL enforced in Phase 9)
     → Frontend reads these via org_id policy (useWorkspaces + useCredits already updated in Phase 11)
  2. Drop profile_id FK column (credit_packages, client_workspaces)
     → Safe AFTER policy drop (no policy references profile_id anymore)
     → Safe because onboard-client.ts is already updated (Wave 1 done)
     → credit_transactions.profile_id is KEPT (audit trail requirement, per ORG-CLEANUP-03)
  3. Frontend: replace profile.support_task_id reads with org.support_task_id
     → 5 files read this from profile (Sidebar, MobileSidebarOverlay, BottomNav, InboxPage, useSupportTaskChat, useUnreadCounts)
     → Must happen BEFORE profiles column drop
  4. Drop profiles legacy columns (clickup_list_ids, nextcloud_client_root, support_task_id, clickup_chat_channel_id)
     → Safe AFTER Edge Functions no longer fallback to them (Wave 2 done)
     → Safe AFTER frontend no longer reads them (step 3 done)
```

---

## Area 1: onboard-client.ts Rewrite (ORG-CLEANUP-01)

### Current State (verified by reading scripts/onboard-client.ts)

Current flow:
1. Create auth user
2. Create profile row — sets `clickup_list_ids`, `support_task_id`, `clickup_chat_channel_id`, `nextcloud_client_root` on `profiles`
3. Create `client_workspaces` rows with `profile_id`
4. Create `credit_packages` row with `profile_id`
5. Insert `project_access` rows with `profile_id`
6. Trigger task sync

Current `ClientConfig` interface fields set on `profiles` that will be dropped:
- `clickupListIds` → currently written to `profiles.clickup_list_ids`
- `supportTaskId` → currently written to `profiles.support_task_id`
- `clickupChatChannelId` → currently written to `profiles.clickup_chat_channel_id`
- `nextcloudRoot` → currently written to `profiles.nextcloud_client_root`

### New Flow (org-first)

```
1. Create organization row (name, slug, clickup_list_ids, nextcloud_client_root, support_task_id, clickup_chat_channel_id)
2. Create auth user (email/password, pre-confirmed)
3. Create profile row (email, full_name, company_name, email_notifications — no legacy org fields)
4. Create org_members row (organization_id, profile_id, role: 'admin')
5. Create client_workspaces rows (organization_id, module_key, display_name, icon, sort_order, is_active)
6. Create credit_packages row (organization_id, package_name, credits_per_month, is_active)
7. Create credit_transactions row for initial top-up (profile_id, amount — profile_id KEPT for audit trail)
8. Create project_access rows (profile_id, project_config_id)
9. If members[] provided: for each member → create auth user → create profile → create org_members row
10. Trigger initial task sync
```

### New ClientConfig Interface

```typescript
interface MemberConfig {
  email: string;
  password?: string;
  fullName: string;
  role: 'member' | 'viewer';  // default: 'member'
}

interface ClientConfig {
  // Org-level (goes to organizations table)
  orgName: string;           // e.g. "Muster GmbH" — used for organizations.name
  orgSlug?: string;          // auto-derived from email domain if omitted
  clickupListIds: string[];
  supportTaskId?: string;
  clickupChatChannelId?: string;
  nextcloudRoot?: string;

  // Admin user (first member)
  email: string;
  password?: string;
  fullName: string;

  // Optional additional members
  members?: MemberConfig[];

  // Module / resource setup
  modules: string[];
  creditPackage?: CreditConfig;
  projectIds?: string[];
}
```

**Slug derivation:** Extract domain from email, strip TLD, take up to 30 chars. Example: `max@muster.at` → `muster`. If slug already exists in `organizations`, append `-2`, `-3`, etc. (query before inserting).

### Rollback on Failure

Current script does partial rollback (deletes auth user on profile failure). New script must handle more steps:

```
Rollback ladder (clean up in reverse creation order):
- On any failure after step 2 (auth user created): delete auth user
- On any failure after step 1 (org created): delete org (cascades to org_members)
- On extra member failures: log warning, don't fail entire onboarding
```

---

## Area 2: RLS Policy Drops (ORG-CLEANUP-02)

### Current State (verified via REQUIREMENTS.md ORG-DB-08 and Phase 9 research)

Phase 9 added org-scoped PERMISSIVE policies alongside existing profile_id policies. Both are active. PostgreSQL ORs PERMISSIVE policies — a row is accessible if ANY policy matches. Current state on `credit_packages` and `client_workspaces`:

**credit_packages:**
- Old policy: `profile_id = auth.uid()` (SELECT/INSERT/UPDATE/DELETE or equivalent)
- New policy: `organization_id = ANY(SELECT user_org_ids())` (SELECT)

**client_workspaces:**
- Old policy: `profile_id = auth.uid()` (SELECT/INSERT/UPDATE/DELETE or equivalent)
- New policy: `organization_id = ANY(SELECT user_org_ids())` (SELECT)

### Migration SQL Pattern

```sql
-- 1. Drop old profile_id-based policies
-- (policy names must be verified against actual DB — check pg_policies)
ALTER TABLE public.credit_packages DROP POLICY IF EXISTS "credit_packages_profile_id_policy";
ALTER TABLE public.client_workspaces DROP POLICY IF EXISTS "client_workspaces_profile_id_policy";

-- 2. Verify org policies still present before continuing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'credit_packages'
      AND policyname LIKE '%org%'
  ) THEN
    RAISE EXCEPTION 'Org policy missing from credit_packages — aborting';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'client_workspaces'
      AND policyname LIKE '%org%'
  ) THEN
    RAISE EXCEPTION 'Org policy missing from client_workspaces — aborting';
  END IF;
END $$;
```

**IMPORTANT:** The actual policy names must be inspected from the production DB before writing the migration. The migration file should include a comment with the expected names and a `IF EXISTS` guard so it doesn't fail silently if names differ.

---

## Area 3: profile_id Column Drops (ORG-CLEANUP-03)

### Dependency Check (verified by reading database schema)

**credit_packages:**
- `profile_id uuid NOT NULL, FK -> profiles(id) ON DELETE CASCADE` [VERIFIED: DATABASE_SCHEMA.md line 232]
- Also has: `organization_id uuid NOT NULL` (added Phase 9)
- `credit_transactions.profile_id` — SEPARATE column, KEPT per requirements

**client_workspaces:**
- `profile_id uuid NOT NULL, FK -> profiles(id) ON DELETE CASCADE` [VERIFIED: DATABASE_SCHEMA.md line 269]
- Also has: `organization_id uuid NOT NULL` (added Phase 9)

### Foreign Key Constraint Issue

Dropping `profile_id` from `credit_packages` and `client_workspaces` requires first dropping the FK constraint that references `profiles(id)`. PostgreSQL requires the constraint to be dropped explicitly before the column if you want to preserve the column name approach, OR you can use `DROP COLUMN CASCADE` which drops dependent constraints automatically.

```sql
-- Safe pattern: DROP COLUMN CASCADE drops the FK constraint automatically
ALTER TABLE public.credit_packages DROP COLUMN IF EXISTS profile_id CASCADE;
ALTER TABLE public.client_workspaces DROP COLUMN IF EXISTS profile_id CASCADE;
```

**Warning:** `CASCADE` here only cascades to the FK constraint itself, not to other tables. There are no other tables with FK references to `credit_packages.profile_id` or `client_workspaces.profile_id` — these FK columns point TO `profiles`, not referenced FROM elsewhere. [VERIFIED: grep of DATABASE_SCHEMA.md — no tables reference credit_packages or client_workspaces by profile_id]

### What Must NOT Be Dropped (ORG-CLEANUP-03 explicit exception)

`credit_transactions.profile_id` — retained for audit trail. [VERIFIED: REQUIREMENTS.md ORG-CLEANUP-03 explicitly says "retained in credit_transactions for audit trail"]

---

## Area 4: Dual-Read Fallback Removal (ORG-CLEANUP-04)

### Current State in Each Edge Function (verified by reading source)

#### fetch-clickup-tasks/index.ts

Dual-read at lines 372–386:
```typescript
// CURRENT (dual-read)
const { data: profile } = await supabase.from("profiles").select("clickup_list_ids").eq("id", user.id).single();
const listIds: string[] = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
```

**Clean version:**
```typescript
// CLEAN (org-only)
if (!org) {
  log.error("No org found for user");
  return new Response(JSON.stringify({ error: "Organisation nicht konfiguriert" }), { status: 500, ... });
}
const listIds: string[] = org.clickup_list_ids;
```

Also remove the `if (profileError)` block that follows.

#### fetch-single-task/index.ts

Dual-read at lines 221–235:
```typescript
// CURRENT (dual-read)
const { data: profile } = await supabase.from("profiles").select("clickup_list_ids").eq("id", user.id).single();
const userListIds: string[] = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
```

**Clean version:**
```typescript
// CLEAN (org-only)
if (!org) {
  log.error("No org found for user");
  return new Response(JSON.stringify({ error: "Organisation nicht konfiguriert" }), { status: 500, ... });
}
const userListIds: string[] = org.clickup_list_ids;
```

#### create-clickup-task/index.ts

Dual-read at lines 304–320:
```typescript
// CURRENT (dual-read) — reads clickup_list_ids, full_name, clickup_chat_channel_id
const { data: profile } = await supabase.from("profiles").select("clickup_list_ids, full_name, clickup_chat_channel_id").eq("id", user.id).single();
const listIds: string[] = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
const chatChannelId: string | null = org?.clickup_chat_channel_id ?? profile?.clickup_chat_channel_id ?? null;
const fullNameFromProfile: string | null = profile?.full_name ?? null;
```

**IMPORTANT:** `full_name` stays on `profiles` — it is NOT in `organizations`. The profile query must be narrowed to `full_name` only (not dropped entirely):

```typescript
// CLEAN (org-only for list/chat, profile for full_name only)
if (!org) {
  log.error("No org found for user");
  return new Response(JSON.stringify({ error: "Organisation nicht konfiguriert" }), { status: 500, ... });
}
const listIds: string[] = org.clickup_list_ids;
const chatChannelId: string | null = org.clickup_chat_channel_id;

// full_name stays in profiles — still query but only for full_name
const { data: profileName } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
const fullNameFromProfile: string | null = profileName?.full_name ?? null;
```

#### nextcloud-files/index.ts

Dual-read at lines 341–351:
```typescript
// CURRENT (dual-read)
const org = await getOrgForUser(supabaseService, user.id);
const { data: profileRow } = await supabase.from("profiles").select("nextcloud_client_root").eq("id", user.id).maybeSingle();
const clientRoot: string | null = org?.nextcloud_client_root ?? profileRow?.nextcloud_client_root ?? null;
```

**Clean version:**
```typescript
// CLEAN (org-only)
const org = await getOrgForUser(supabaseService, user.id);
const clientRoot: string | null = org?.nextcloud_client_root ?? null;
// Note: null clientRoot is handled downstream (NEXTCLOUD_NOT_CONFIGURED)
```

Note: `nextcloud-files` already handles `null` clientRoot gracefully (returns `NEXTCLOUD_NOT_CONFIGURED` code). The fallback-less version is safe — if org has no `nextcloud_client_root`, the existing null-check handles it.

### Error Handling Strategy

When `org` is null (no org_members row) after fallback removal:
- `fetch-clickup-tasks`: return `{ tasks: [], message: "No ClickUp lists configured" }` (same as current empty-list path) — or 500 "Organisation nicht konfiguriert"
- `fetch-single-task`: return `{ task: null, message: "You don't have access to this task" }` — or 500
- `create-clickup-task`: return 400 `"No list configured. Please contact your administrator."` (already exists)
- `nextcloud-files`: clientRoot = null → existing NEXTCLOUD_NOT_CONFIGURED path handles it

Recommended: for `fetch-clickup-tasks` and `fetch-single-task`, treat no-org the same as empty list ids (return empty/null gracefully, not 500). For `create-clickup-task`, return the existing 400 error.

---

## Area 5: profiles Column Drops (ORG-CLEANUP-05)

### Columns to Drop (verified via DATABASE_SCHEMA.md)

From `profiles` table:
- `clickup_list_ids jsonb DEFAULT '[]'`
- `nextcloud_client_root text`
- `support_task_id text`
- `clickup_chat_channel_id text`

### Frontend Reads to Remove First (CRITICAL)

These must be updated BEFORE the SQL column drop migration runs:

| File | Current usage | Fix |
|------|--------------|-----|
| `src/shared/types/common.ts` | `Profile.clickup_list_ids`, `Profile.support_task_id`, `Profile.clickup_chat_channel_id` defined on interface | Remove from `Profile` interface |
| `src/shared/hooks/useAuth.ts` | `STAGING_BYPASS_PROFILE` has `clickup_list_ids`, `support_task_id`, `clickup_chat_channel_id` | Remove from bypass profile |
| `src/modules/tickets/hooks/useUnreadCounts.ts` | Queries `profiles.support_task_id` → uses `org.support_task_id` instead | Replace with `useOrg()` |
| `src/modules/tickets/hooks/useSupportTaskChat.ts` | Reads `profile?.support_task_id` → use `org.support_task_id` | Replace with `useOrg()` |
| `src/shared/pages/InboxPage.tsx` | Filters by `profile?.support_task_id` | Replace with org |
| `src/shared/components/layout/Sidebar.tsx` | Filters by `profile?.support_task_id` | Replace with org |
| `src/shared/components/layout/MobileSidebarOverlay.tsx` | Filters by `profile?.support_task_id` | Replace with org |
| `src/shared/components/layout/BottomNav.tsx` | Filters by `profile?.support_task_id` | Replace with org |

**Pattern for replacing profile.support_task_id reads:**

```typescript
// BEFORE (reads from profile)
const { profile } = useAuth()
const supportTaskId = profile?.support_task_id ?? null

// AFTER (reads from org)
const { organization } = useOrg()
const supportTaskId = organization?.support_task_id ?? null
```

For `useUnreadCounts.ts` — this hook currently queries `profiles.support_task_id` directly from Supabase (not via React context). After column drop, this query would return an error. The fix: pass `supportTaskId` as a parameter or fetch it from OrgContext at the call site and pass down.

### SQL Migration

```sql
-- Drop legacy org-config columns from profiles
-- These were moved to organizations in Phase 9 (ORG-DB-06 data migration)
-- All Edge Functions removed fallback reads in Wave 2
-- All frontend reads replaced in Wave 4

ALTER TABLE public.profiles DROP COLUMN IF EXISTS clickup_list_ids;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS nextcloud_client_root;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS support_task_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS clickup_chat_channel_id;
```

No FK constraints reference these columns from other tables, so no CASCADE needed. [ASSUMED — based on schema review; verify with `\d profiles` before running]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Slug uniqueness | Custom uniqueness loop | Query `organizations` by slug, append counter if collision |
| Profile FK cascade on column drop | Manual cascade logic | `DROP COLUMN IF EXISTS ... CASCADE` handles FK constraint automatically |
| RLS policy name discovery | Hardcoded assumptions | Check `pg_policies` system catalog before writing migration |

---

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `profiles` rows still have `clickup_list_ids`, `support_task_id`, etc. populated from Phase 9 migration | No migration needed — data was already copied to `organizations` in Phase 9 (ORG-DB-06). Phase 13 just drops the now-redundant columns |
| Stored data | `credit_packages` rows have both `profile_id` and `organization_id` populated | No migration needed — Phase 9 (ORG-DB-06) already backfilled `organization_id`. Phase 13 just drops `profile_id` column |
| Stored data | `client_workspaces` rows have both `profile_id` and `organization_id` populated | Same as above |
| Live service config | Staging Cloud Supabase RLS policies — currently have BOTH old and new policies | SQL migration drops old policies |
| OS-registered state | None — no OS-level state references these columns | None |
| Secrets/env vars | `SUPABASE_SERVICE_ROLE_KEY` used by onboard-client.ts — unchanged | None |
| Build artifacts | None — TypeScript types regenerate from code, no compiled artifacts reference these columns | None |

---

## Common Pitfalls

### Pitfall 1: Dropping Column Before Removing All Readers
**What goes wrong:** `profiles.support_task_id` is read by 5+ frontend files and the `useUnreadCounts` hook queries it directly. Dropping the column before updating these causes a Supabase query error (`column "support_task_id" does not exist`) at runtime.
**Why it happens:** Column drops are instant and irreversible; frontend code still in production references the old schema.
**How to avoid:** Wave ordering is strict — Wave 4 (frontend update + deploy) MUST complete before Wave 5 (profiles column drop SQL).
**Warning signs:** Frontend tests fail on `support_task_id` select queries; staging Supabase logs show column-not-found errors.

### Pitfall 2: Edge Function Fallback Removal Without org_members Row Guarantee
**What goes wrong:** Removing `org ?? profile` fallback assumes all users have an `org_members` row. If any production user was created before Phase 9 migration AND wasn't included in the migration DO block, `getOrgForUser` returns null → function throws/errors.
**Why it happens:** Phase 9 migration used `count(org_members) = count(profiles)` as a gate check. If that passed, all users have rows. But verify this on production before deploying Wave 2.
**How to avoid:** Before deploying Edge Function cleanup to production, run: `SELECT count(*) FROM profiles p LEFT JOIN org_members om ON om.profile_id = p.id WHERE om.id IS NULL;` — should return 0.
**Warning signs:** Edge Functions return 500 with "No org found" log entries after deployment.

### Pitfall 3: RLS Policy Name Assumptions
**What goes wrong:** Hardcoding policy names in the DROP POLICY migration without verifying actual names in the DB. If names differ, the IF NOT EXISTS guard silently skips the drop and old policies remain active.
**Why it happens:** Policy names are set when policies are created (Phase 9). The exact names must be verified from `pg_policies`.
**How to avoid:** Before writing the migration, query: `SELECT policyname, tablename FROM pg_policies WHERE tablename IN ('credit_packages', 'client_workspaces');`
**Warning signs:** After migration, `profile_id = auth.uid()` policy still visible in Supabase dashboard.

### Pitfall 4: credit_transactions.profile_id Accidentally Dropped
**What goes wrong:** Developer follows a pattern of "drop all profile_id columns" and includes `credit_transactions`.
**Why it happens:** ORG-CLEANUP-03 says to keep `credit_transactions.profile_id`. Easy to miss in a batch migration.
**How to avoid:** Migration SQL explicitly lists only `credit_packages` and `client_workspaces`. Never use `DO $$ FOREACH table IN ARRAY[...] $$` pattern that could accidentally include transactions.

### Pitfall 5: onboard-client.ts Slug Collision
**What goes wrong:** Two orgs get the same slug if two clients have the same email domain (e.g., both `max@muster.at` and `anna@muster.at` exist).
**Why it happens:** slug is derived from email domain; `organizations.slug` has a UNIQUE constraint.
**How to avoid:** Query `organizations` for the target slug before insert; if exists, try `slug-2`, `slug-3`, etc. Cap at 5 attempts then throw a descriptive error.

---

## Code Examples

### Clean getOrgForUser Usage (no fallback)

```typescript
// Source: supabase/functions/_shared/org.ts (existing, Phase 10)
// After cleanup: callers assert org is non-null instead of falling back to profile

const org = await getOrgForUser(supabaseAdmin, user.id);
if (!org) {
  log.error("No org_members row for user — user not in any organisation");
  return new Response(
    JSON.stringify({ error: "Organisation nicht konfiguriert" }),
    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
// Now safe to use org.clickup_list_ids, org.nextcloud_client_root, etc.
```

### New onboard-client.ts Org Creation Step

```typescript
// Step 1: Create org
const slug = await deriveUniqueSlug(supabase, config.orgSlug ?? config.email);
const { data: orgData, error: orgError } = await supabase
  .from("organizations")
  .insert({
    name: config.orgName,
    slug,
    clickup_list_ids: config.clickupListIds,
    support_task_id: config.supportTaskId || null,
    clickup_chat_channel_id: config.clickupChatChannelId || null,
    nextcloud_client_root: config.nextcloudRoot || null,
  })
  .select("id")
  .single();

if (orgError || !orgData) {
  console.error("FAILED to create org:", orgError?.message);
  process.exit(1);
}
const orgId = orgData.id;

// Step 2: Create auth user
const { data: authData, error: authError } = await supabase.auth.admin.createUser({
  email: config.email,
  password,
  email_confirm: true,
});

// Step 3: Create profile (NO legacy org fields)
await supabase.from("profiles").upsert({
  id: userId,
  email: config.email,
  full_name: config.fullName,
  company_name: config.orgName,
  email_notifications: true,
});

// Step 4: Create org_members row
await supabase.from("org_members").insert({
  organization_id: orgId,
  profile_id: userId,
  role: "admin",
});

// Step 5: Create workspaces (org-scoped)
const workspaceRows = config.modules.map((mod, i) => ({
  organization_id: orgId,
  module_key: mod,
  display_name: MODULE_DEFAULTS[mod]?.display || mod,
  icon: MODULE_DEFAULTS[mod]?.icon || "box",
  sort_order: i + 1,
  is_active: true,
}));
await supabase.from("client_workspaces").insert(workspaceRows);
```

### Frontend: support_task_id from Org

```typescript
// Source: Pattern needed by useSupportTaskChat.ts, Sidebar.tsx, etc.
// BEFORE
const { profile } = useAuth()
const supportTaskId = profile?.support_task_id ?? null

// AFTER
const { organization } = useOrg()
const supportTaskId = organization?.support_task_id ?? null
```

### useUnreadCounts: Remove Direct Profile Query

```typescript
// BEFORE — queries profiles.support_task_id directly from Supabase
async function fetchUnreadCounts(userId: string): Promise<UnreadCounts> {
  const { data: profile } = await supabase.from('profiles').select('support_task_id').eq('id', userId).maybeSingle();
  const supportTaskId = profile?.support_task_id ?? null;
  // ...
}

// AFTER — supportTaskId passed as parameter (caller gets it from OrgContext)
async function fetchUnreadCounts(userId: string, supportTaskId: string | null): Promise<UnreadCounts> {
  // no profile query needed
  // ...
}

// Call site (useUnreadCounts hook):
export function useUnreadCounts(userId: string | undefined) {
  const { organization } = useOrg()
  const supportTaskId = organization?.support_task_id ?? null
  const query = useQuery({
    queryKey: ['unread-counts', userId, supportTaskId],
    queryFn: () => fetchUnreadCounts(userId!, supportTaskId),
    enabled: !!userId,
    // ...
  })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| profile_id-only RLS on credit_packages/client_workspaces | Dual PERMISSIVE policies (profile_id + org_id) | Phase 9 | Both policies active; Phase 13 drops the old one |
| Profile columns for ClickUp/Nextcloud config | Org-level columns in organizations table | Phase 9 data migration | Source of truth moved; profiles columns become stale copies |
| Single-user onboarding (1 user per onboard) | Org-first onboarding (org → admin → optional members[]) | Phase 13 | Enables multi-member orgs from day 1 |
| Dual-read in Edge Functions | Org-only reads | Phase 13 | Simpler code, no dead fallback paths |

---

## Open Questions

1. **Exact RLS policy names on production**
   - What we know: Phase 9 added org-scoped policies; old policies renamed or original names unknown
   - What's unclear: exact `policyname` values in production `pg_policies`
   - Recommendation: Run `SELECT policyname, tablename, cmd FROM pg_policies WHERE tablename IN ('credit_packages', 'client_workspaces') ORDER BY tablename, policyname;` against staging before writing migration

2. **useUnreadCounts signature change impact**
   - What we know: `useUnreadCounts(userId)` is called with one arg today
   - What's unclear: how many call sites exist; whether passing supportTaskId via OrgContext introduces a render-order dependency
   - Recommendation: Check all call sites; alternatively, read `supportTaskId` from OrgContext inside the hook directly (both approaches work; inside-hook is simpler)

3. **credit_packages RLS: INSERT/UPDATE/DELETE policies**
   - What we know: org-scoped SELECT policy exists; script uses service role (bypasses RLS)
   - What's unclear: whether INSERT/UPDATE/DELETE policies on credit_packages/client_workspaces also need cleanup (they may reference profile_id)
   - Recommendation: Inspect all 4 policy types (SELECT, INSERT, UPDATE, DELETE) on both tables in `pg_policies` before writing the migration

---

## Environment Availability

Phase 13 is code and SQL migration only. No new external dependencies.

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Supabase CLI | SQL migration deployment | Yes | Already configured (staging: `ahlthosftngdcryltapu`) |
| tsx | onboard-client.ts execution | Yes | `npx tsx` available |
| Staging Cloud Supabase | Migration testing | Yes | Project `ahlthosftngdcryltapu` |

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test -- --reporter=verbose` |
| Full suite command | `npm run test:coverage` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ORG-CLEANUP-01 | onboard-client.ts creates org → user → org_members | manual (script) | `npx tsx scripts/onboard-client.ts --config test-client.json` | ❌ Wave 0 |
| ORG-CLEANUP-02 | Legacy RLS policies absent after migration | manual (SQL verify) | `SELECT * FROM pg_policies WHERE tablename IN ('credit_packages', 'client_workspaces');` | — |
| ORG-CLEANUP-03 | credit_packages/client_workspaces have no profile_id column | manual (SQL verify) | `\d credit_packages` | — |
| ORG-CLEANUP-04 | Edge Functions work without profile fallback | integration | Deploy to staging + run fetch-clickup-tasks | ❌ Wave 0 |
| ORG-CLEANUP-05 | profiles table has no legacy config columns | manual (SQL verify) | `\d profiles` | — |

### Sampling Rate
- Per task commit: `npm run test`
- Per wave merge: `npm run test:coverage`
- Phase gate: Full suite green + staging manual verification before promoting to production

### Wave 0 Gaps
- [ ] No new test files required — these are cleanup tasks
- [ ] Manual verification checklist for DBA steps (see Open Questions)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No — not changing auth flow | — |
| V3 Session Management | No | — |
| V4 Access Control | Yes — dropping RLS policies | Verify org-scoped policy covers all rows before dropping old policy |
| V5 Input Validation | Yes — onboard-client.ts slug input | Sanitize slug: alphanumeric + hyphens only, max 30 chars |
| V6 Cryptography | No | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| RLS policy gap during migration | Elevation of Privilege | Drop old policy AFTER verifying new org policy is active and covers all rows |
| Orphaned auth user on script failure | Information Disclosure | Rollback ladder in onboard-client.ts deletes auth user if org/profile creation fails |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No other tables have FKs that reference `credit_packages.profile_id` or `client_workspaces.profile_id` (i.e. nothing foreign-keys INTO these columns) | Area 3 | `DROP COLUMN CASCADE` might unexpectedly drop dependent objects |
| A2 | `profiles.support_task_id`, `clickup_list_ids`, `nextcloud_client_root`, `clickup_chat_channel_id` are not referenced by any FK in other tables | Area 5 | Column drop would require explicit FK cleanup first |
| A3 | Phase 9 migration gate (`count(org_members) = count(profiles)`) passed on staging, meaning every user has an `org_members` row | Area 4 | Removing fallback would cause null-org errors for users without rows |

---

## Sources

### Primary (HIGH confidence — direct codebase inspection)
- `scripts/onboard-client.ts` — current onboarding flow, all column references
- `supabase/functions/_shared/org.ts` — `getOrgForUser` helper (already org-only reads)
- `supabase/functions/fetch-clickup-tasks/index.ts` — dual-read at lines 372–386
- `supabase/functions/fetch-single-task/index.ts` — dual-read at lines 221–235
- `supabase/functions/create-clickup-task/index.ts` — dual-read at lines 304–320, full_name still on profiles
- `supabase/functions/nextcloud-files/index.ts` — dual-read at lines 341–351
- `docs/system-context/DATABASE_SCHEMA.md` — column definitions for all affected tables
- `.planning/REQUIREMENTS.md` — ORG-CLEANUP-01 through ORG-CLEANUP-05 requirements
- `.planning/phases/09-org-db-foundation/09-RESEARCH.md` — Phase 9 migration design
- `.planning/phases/10-org-edge-functions/10-RESEARCH.md` — Phase 10 dual-read pattern
- `src/shared/types/common.ts` — Profile interface (columns to remove)
- `src/modules/tickets/hooks/useUnreadCounts.ts` — direct profile.support_task_id Supabase query
- `src/modules/tickets/hooks/useSupportTaskChat.ts` — profile?.support_task_id read
- `src/shared/pages/InboxPage.tsx`, `Sidebar.tsx`, `MobileSidebarOverlay.tsx`, `BottomNav.tsx` — profile?.support_task_id filter
- `src/shared/hooks/useOrg.ts` — OrgContext already has support_task_id from organizations

### Secondary (MEDIUM confidence)
- [VERIFIED: DATABASE_SCHEMA.md] credit_packages and client_workspaces `profile_id` FK constraints are `ON DELETE CASCADE` from profiles — verified column-level behavior

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries
- Migration order: HIGH — dependency chain derived from actual code reads
- Edge Function cleanup: HIGH — exact dual-read lines identified in source
- Frontend impact: HIGH — all 5 files using `profile.support_task_id` identified
- Pitfalls: HIGH — all derived from direct code inspection

**Research date:** 2026-04-15
**Valid until:** Until Phase 13 planning begins (schema doesn't change between now and then)
