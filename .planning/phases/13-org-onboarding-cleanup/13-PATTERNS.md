# Phase 13: org-onboarding-cleanup — Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 7 (4 Edge Functions + 1 script + 1 migration + 1 shared helper)
**Analogs found:** 7 / 7

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `scripts/onboard-client.ts` (rewrite) | utility/script | CRUD (sequential multi-table) | itself (current version) | self-rewrite |
| `supabase/functions/fetch-clickup-tasks/index.ts` (patch) | service | request-response | `supabase/functions/_shared/org.ts` (getOrgForUser) | exact |
| `supabase/functions/fetch-single-task/index.ts` (patch) | service | request-response | `supabase/functions/_shared/org.ts` (getOrgForUser) | exact |
| `supabase/functions/create-clickup-task/index.ts` (patch) | service | request-response | `supabase/functions/_shared/org.ts` (getOrgForUser) | exact |
| `supabase/functions/nextcloud-files/index.ts` (patch) | service | file-I/O | `supabase/functions/_shared/org.ts` (getOrgForUser) | exact |
| `supabase/migrations/YYYYMMDD_remove_legacy_rls.sql` (new) | migration | CRUD | `supabase/migrations/20260416120000_org_admin_write_rls.sql` | role-match |

---

## Pattern Assignments

### `scripts/onboard-client.ts` — org-first rewrite

**Analog:** current `scripts/onboard-client.ts` (self-rewrite)

**Current creation order** (lines 178–331):
```
Step 1: supabase.auth.admin.createUser()           → returns userId
Step 2: profiles.upsert({ id: userId, ... })
Step 3: client_workspaces.insert({ profile_id: userId, ... })
Step 4: credit_packages.insert({ profile_id: userId, ... })
        credit_transactions.insert({ profile_id: userId, ... })
Step 5: project_access.insert({ profile_id: userId, ... })
Step 6: sign-in as user → POST /main/fetch-clickup-tasks
```

**All `profile_id`-based inserts** that must become org-scoped:
- `client_workspaces` row: `profile_id: userId` (line 222) — needs `organization_id` too
- `credit_packages` row: `profile_id: userId` (line 243) — needs `organization_id` too
- `credit_transactions` row: `profile_id: userId` (line 262) — needs `organization_id` too

**Current config interface** (lines 44–62) — must grow `orgName?: string` or derive from `company`:
```typescript
interface ClientConfig {
  email: string;
  password?: string;
  fullName: string;
  company: string;           // becomes org name
  clickupListIds: string[];  // move to organizations row
  supportTaskId?: string;    // move to organizations row
  clickupChatChannelId?: string; // move to organizations row
  nextcloudRoot?: string;    // move to organizations row
  modules: string[];
  creditPackage?: CreditConfig;
  projectIds?: string[];
}
```

**Target org-first creation order** (replace current steps 1–5):
```
Step 1: supabase.auth.admin.createUser()       → userId
Step 2: organizations.insert({                 → orgId
           name: config.company,
           slug: deriveSlug(config.email),
           clickup_list_ids: config.clickupListIds,
           nextcloud_client_root: config.nextcloudRoot,
           support_task_id: config.supportTaskId,
           clickup_chat_channel_id: config.clickupChatChannelId,
         })
Step 3: profiles.upsert({                      (keep profile_id = userId)
           id: userId,
           email, full_name, company_name,
           organization_id: orgId,             ← NEW FK
           email_notifications: true,
           -- DO NOT copy clickup_list_ids here (now in org)
         })
Step 4: org_members.insert({
           organization_id: orgId,
           profile_id: userId,
           role: 'admin',
         })
Step 5: client_workspaces.insert({
           profile_id: userId,
           organization_id: orgId,             ← NEW FK (required, NOT NULL)
           module_key, display_name, icon, sort_order, is_active,
         })
Step 6: credit_packages.insert({
           profile_id: userId,
           organization_id: orgId,             ← NEW FK (required, NOT NULL)
           package_name, credits_per_month, is_active,
         })
Step 7: credit_transactions.insert({
           profile_id: userId,
           organization_id: orgId,             ← FK (nullable per Phase 9 migration)
           amount, type, description,
         })
Step 8: project_access.insert (unchanged)
Step 9: sign-in + trigger fetch-clickup-tasks (unchanged)
```

**Slug derivation** — copy the exact logic from `20260414200000_org_foundation.sql` lines 125–126, translated to TypeScript:
```typescript
// SQL: lower(regexp_replace(split_part(email, '@', 2), '\.[^.]+$', ''))
function deriveOrgSlug(email: string): string {
  const domain = email.split('@')[1] ?? email;
  return domain.replace(/\.[^.]+$/, '').toLowerCase();
}
```

**Rollback pattern** (lines 186–191, extend for org rows):
```typescript
// Current rollback: only deletes auth user
await supabase.auth.admin.deleteUser(userId);
// New rollback must also delete organizations row (cascade deletes org_members):
await supabase.from('organizations').delete().eq('id', orgId);
await supabase.auth.admin.deleteUser(userId);
```

---

### Dual-read removal — 4 Edge Functions

All four functions share the same dual-read pattern. The patch is identical in structure for each.

**Current dual-read pattern** (present in all 4 functions):

`fetch-clickup-tasks/index.ts` lines 369–386:
```typescript
const org = await getOrgForUser(supabaseAdmin, user.id);

// Get user's ClickUp list IDs from profile (fallback)
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids")
  .eq("id", user.id)
  .single();

if (profileError) { /* return 500 */ }

const listIds: string[] = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
```

`fetch-single-task/index.ts` lines 218–235:
```typescript
const org = await getOrgForUser(supabaseAdmin, user.id);

const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids")
  .eq("id", user.id)
  .single();

if (profileError) { /* return 500 */ }

const userListIds: string[] = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
```

`create-clickup-task/index.ts` lines 301–322:
```typescript
const org = await getOrgForUser(supabaseAdmin, user.id);

const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids, full_name, clickup_chat_channel_id")
  .eq("id", user.id)
  .single();

if (profileError) { /* return 500 */ }

// Dual-read fallback: org first, then profile
const listIds: string[] = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
const chatChannelId: string | null = org?.clickup_chat_channel_id ?? profile?.clickup_chat_channel_id ?? null;
const fullNameFromProfile: string | null = profile?.full_name ?? null;
```

`nextcloud-files/index.ts` lines 341–351:
```typescript
const org = await getOrgForUser(supabaseService, user.id);
const { data: profileRow } = await supabase
  .from("profiles")
  .select("nextcloud_client_root")
  .eq("id", user.id)
  .maybeSingle();
const clientRoot: string | null =
  org?.nextcloud_client_root ?? (profileRow as { nextcloud_client_root: string | null } | null)?.nextcloud_client_root ?? null;
```

**Target clean pattern** (org-only, no profile fallback):

`fetch-clickup-tasks` — replace lines 369–386 with:
```typescript
const org = await getOrgForUser(supabaseAdmin, user.id);
if (!org) {
  log.error("No org found for user");
  return new Response(
    JSON.stringify({ tasks: [], message: "No ClickUp lists configured" }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
const listIds: string[] = org.clickup_list_ids;
```

`fetch-single-task` — replace lines 218–235 with:
```typescript
const org = await getOrgForUser(supabaseAdmin, user.id);
if (!org) {
  log.error("No org found for user");
  return new Response(
    JSON.stringify({ error: "No list configured" }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
const userListIds: string[] = org.clickup_list_ids;
```

`create-clickup-task` — replace lines 301–322 with:
```typescript
const org = await getOrgForUser(supabaseAdmin, user.id);
if (!org) {
  return new Response(
    JSON.stringify({ error: "No list configured. Please contact your administrator." }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
const listIds: string[] = org.clickup_list_ids;
const chatChannelId: string | null = org.clickup_chat_channel_id ?? null;
// full_name stays in profiles — still needs a separate profiles read
const { data: profileForName } = await supabase
  .from("profiles")
  .select("full_name")
  .eq("id", user.id)
  .maybeSingle();
const fullNameFromProfile: string | null = (profileForName as { full_name: string | null } | null)?.full_name ?? null;
```

`nextcloud-files` — replace lines 341–351 with:
```typescript
const org = await getOrgForUser(supabaseService, user.id);
const clientRoot: string | null = org?.nextcloud_client_root ?? null;
```

**Note on `create-clickup-task`:** `full_name` is NOT in `organizations` — it is a person attribute that stays on `profiles`. This function must keep a narrow `profiles` read for `full_name` only, even after removing the fallback.

---

### `supabase/migrations/YYYYMMDD_remove_legacy_rls.sql` (new migration)

**Analog:** `supabase/migrations/20260416120000_org_admin_write_rls.sql`

**Migration file conventions** (from all existing migrations):
- Filename: `YYYYMMDDHHMMSS_<slug>.sql` — timestamp must be after `20260416120000`
- Header comment block naming phase and purpose
- No explicit `BEGIN`/`COMMIT` — Supabase CLI wraps in its own transaction
- `DROP POLICY IF EXISTS` before `CREATE POLICY` (idempotent)
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` only if table doesn't already have it
- Sections separated by `=====` dividers with labels

**Policies to drop** (sourced from migration history):

From `20260323000000_credit_system.sql` lines 33–40:
```sql
-- Drop legacy profile_id-based policies
DROP POLICY IF EXISTS "Users see own packages" ON public.credit_packages;
DROP POLICY IF EXISTS "Users see own transactions" ON public.credit_transactions;
```

From `20260414200000_org_foundation.sql` lines 192–200 (the org-foundation also added org policies — keep those):
```sql
-- Keep: "Users see org credit_packages" (organization_id in user_org_ids())
-- Keep: "Users see org client_workspaces" (organization_id in user_org_ids())
-- These are the replacement policies; they were added in Phase 9.
```

**Profile columns to drop** (after confirming no Edge Function reads them):
```sql
-- Drop columns from profiles that are now owned by organizations
ALTER TABLE public.profiles DROP COLUMN IF EXISTS clickup_list_ids;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS nextcloud_client_root;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS support_task_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS clickup_chat_channel_id;
```

**Migration gate pattern** (from `20260414200000_org_foundation.sql` lines 228–249):
```sql
DO $$
DECLARE
  orphan_count integer;
BEGIN
  -- Assert no profiles exist without an org_members row
  SELECT count(*) INTO orphan_count
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.org_members om WHERE om.profile_id = p.id
  );
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Migration gate failed: % profiles have no org_members row', orphan_count;
  END IF;
END;
$$;
```

**Full target migration structure:**
```
Section 1: Drop legacy profile_id SELECT policies on credit_packages, credit_transactions
Section 2: Drop columns from profiles (clickup_list_ids, nextcloud_client_root, support_task_id, clickup_chat_channel_id)
Section 3: Migration gate (assert zero orphan profiles)
```

---

## Shared Patterns

### `getOrgForUser` — the clean read interface
**Source:** `supabase/functions/_shared/org.ts` lines 21–61
**Apply to:** All 4 Edge Function patches

The helper already returns `OrgConfig | null`. After Phase 13, callers must treat `null` as a hard error (no fallback), not a signal to try `profiles`. The function signature does not change — only call-site handling changes.

```typescript
export interface OrgConfig {
  organization_id: string;
  clickup_list_ids: string[];
  nextcloud_client_root: string | null;
  support_task_id: string | null;
  clickup_chat_channel_id: string | null;
}
```

### RLS helper functions — reuse in new migration
**Source:** `supabase/migrations/20260414200000_org_foundation.sql` lines 52–85
**Apply to:** New migration if any new policies are needed

Established RLS helpers already in DB:
- `public.user_org_ids()` — returns all org IDs for current user (use in USING clauses)
- `public.user_org_role(org_id)` — returns role string for current user in given org

Pattern for using them in policy `USING` clauses:
```sql
-- Efficient: triggers Postgres initPlan caching
using (organization_id in (select public.user_org_ids()))
-- Role-gated:
using (public.user_org_role(organization_id) = 'admin')
```

### Error response shape — Edge Functions
**Source:** `supabase/functions/fetch-clickup-tasks/index.ts` (consistent across all Edge Functions)
**Apply to:** All patched Edge Functions

```typescript
return new Response(
  JSON.stringify({ error: "message" }),
  { status: 4xx, headers: { ...corsHeaders, "Content-Type": "application/json" } }
);
```

### Supabase admin client construction — Edge Functions
**Source:** `supabase/functions/fetch-clickup-tasks/index.ts` lines 360–368
**Apply to:** All patched Edge Functions (already present — do not duplicate)

```typescript
const supabaseServiceKeyEarly = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseServiceKeyEarly) {
  log.error("SUPABASE_SERVICE_ROLE_KEY missing");
  return new Response(/* 500 */);
}
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKeyEarly);
const org = await getOrgForUser(supabaseAdmin, user.id);
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| — | — | — | All files have close analogs in the codebase |

---

## Migration File Inventory (for sequencing)

Existing migrations in timestamp order (all in `supabase/migrations/`):

| File | Phase | Key changes |
|---|---|---|
| `20260320_project_memory_entries.sql` | 3 | project_memory_entries table |
| `20260323000000_credit_system.sql` | credit | credit_packages + credit_transactions + **profile_id RLS policies** |
| `20260323100000_credit_deduction_unique_index.sql` | credit | dedup index |
| `20260329_step_enrichment_change_detection.sql` | 3.x | step_enrichment |
| `20260406000000_create_agent_jobs.sql` | 6 | agent_jobs, set_updated_at() |
| `20260414000000_add_unread_digest_timestamp.sql` | 7 | unread_digest_at |
| `20260414100000_recommendation_reminder_column.sql` | 7 | recommendation_reminder |
| `20260414200000_org_foundation.sql` | 9 | organizations, org_members, FKs, dual-mode RLS |
| `20260415120000_org_rls_and_credit_rpc.sql` | 11 | org_members/organizations client-read RLS, get_org_credit_balance() |
| `20260416120000_org_admin_write_rls.sql` | 12 | admin write RLS on org_members |

New Phase 13 migration must have timestamp **> 20260416120000**, e.g. `20260416130000_remove_legacy_profile_rls.sql`.

---

## Metadata

**Analog search scope:** `scripts/`, `supabase/functions/`, `supabase/migrations/`
**Files scanned:** 11
**Pattern extraction date:** 2026-04-15
