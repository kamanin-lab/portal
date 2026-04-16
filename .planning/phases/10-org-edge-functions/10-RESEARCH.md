# Phase 10: org-edge-functions — Research

**Researched:** 2026-04-14
**Domain:** Supabase Edge Functions (Deno), multi-tenant org migration, invite flow
**Confidence:** HIGH — all findings sourced directly from codebase inspection

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Staging DB only — all work targets Cloud Supabase (`ahlthosftngdcryltapu`), NOT production
- GoTrue SMTP broken on self-hosted — `invite-member` must use `createUser` + `generateLink({ type: 'recovery', redirectTo: '/passwort-setzen' })` — never `inviteUserByEmail`
- `project_access` rows copied from org admin to new member at invite time
- `notifications_type_check` already extended in Phase 9 — `member_invited` and `member_removed` types ready to use
- `invite` email copy already exists in `supabase/functions/_shared/emailCopy.ts`
- Dual-read fallback pattern is locked: if org lookup returns nothing, fall back to `profiles` field — zero downtime
- Org data lookup: org_members JOIN pattern for all 5 functions
- clickup-webhook: org-first resolution, keep task_cache fallback
- invite-member: roll back everything on email failure (delete created auth user, return 500)
- Pending invite state: derived from `auth.users.last_sign_in_at = null` — no schema change
- Role enforcement: check role before any mutating operation; legacy users (no org_members row) treated as `member`
- send-reminders: admin-only emails, grouped by organization

### Claude's Discretion
- Wave/task ordering within Phase 10
- Implementation details of `getOrgForUser` and `getUserOrgRole` helpers

### Deferred Ideas (OUT OF SCOPE)
- OrgContext / useOrg hook (Phase 11)
- /organisation admin page (Phase 12)
- Dropping legacy profile_id fallbacks (Phase 13)
- onboard-client.ts rewrite (Phase 13)
- Frontend role-based UI guards (Phase 11)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ORG-BE-01 | `fetch-clickup-tasks` reads `clickup_list_ids` from `organizations` via `org_members`; dual-read fallback | Section 1 + Section 2 |
| ORG-BE-02 | `fetch-single-task` validates task access via org's `clickup_list_ids`; dual-read fallback | Section 1 + Section 2 |
| ORG-BE-03 | `nextcloud-files` reads `nextcloud_client_root` from `organizations`; dual-read fallback | Section 1 + Section 2 |
| ORG-BE-04 | `create-clickup-task` reads `clickup_list_ids` and `clickup_chat_channel_id` from org; dual-read fallback | Section 1 + Section 2 |
| ORG-BE-05 | `clickup-webhook` `findProfilesForTask()` resolves profiles via `org_members` (all members); fan-out to all org members | Section 4 |
| ORG-BE-06 | `clickup-webhook` support chat fan-out: N `comment_cache` rows per org member | Section 4 |
| ORG-BE-07 | `send-reminders` sends to org admin only; groups by `organization_id` | Section 5 |
| ORG-BE-08 | New `invite-member` Edge Function: createUser + generateLink + invite email + org_members insert + project_access copy | Section 3 |
| ORG-BE-09 | `invite-member` enforces admin-only guard; non-admin → 403 | Section 3 + Section 6 |
| ORG-BE-10 | `invite-member` duplicate check: user already in org → 409 | Section 3 |
| ORG-BE-11 | `create-clickup-task`, `post-task-comment`, `update-task-status` check org role; viewer → 403 | Section 6 |
</phase_requirements>

---

## Summary

Phase 10 migrates 8 Supabase Edge Functions from profile-scoped data reads to organisation-scoped reads, with a dual-read fallback pattern for zero-downtime transition. The work divides into three categories: (1) 5 functions that replace a `profiles` read with an `org_members` JOIN (`fetch-clickup-tasks`, `fetch-single-task`, `nextcloud-files`, `create-clickup-task`, `send-reminders`), (2) 1 function that receives a fan-out upgrade (`clickup-webhook`), and (3) 3 functions that gain a role-enforcement guard (`create-clickup-task`, `post-task-comment`, `update-task-status`). A new `invite-member` function is also created from scratch.

The Phase 9 database migration (`20260414200000_org_foundation.sql`) has been written and the migration SQL file exists in the repo. It creates `organizations`, `org_members`, and two SQL helper functions (`user_org_ids()`, `user_org_role()`). All Edge Functions in Phase 10 use the **service role key** (already available as `SUPABASE_SERVICE_ROLE_KEY` in all functions) to bypass RLS when querying `org_members` and `organizations` — these tables have no client-facing read policies yet (Phase 9 CONTEXT note: "Phase 9 defines no client-facing read policies on organizations or org_members").

A shared helper file `_shared/org.ts` should be created to avoid repeating the org_members JOIN in every function. The `invite-member` function must be registered in the main router (`supabase/functions/main/index.ts`) — the router uses a folder-name dispatch pattern (`/home/deno/functions/${service_name}`) so registering means creating the folder, not editing the router code.

**Primary recommendation:** Create `_shared/org.ts` in Wave 0, then update functions in dependency order (Wave 1: 5 data-read functions + role guards; Wave 2: webhook fan-out; Wave 3: send-reminders rewrite; Wave 4: invite-member new function).

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Org data resolution (clickup_list_ids etc.) | Edge Function (API) | — | Data never exposed to browser; service role reads org_members |
| Role enforcement (viewer 403) | Edge Function (API) | — | Must be server-side; browser can be bypassed |
| Invite flow (createUser + generateLink) | Edge Function (API) | — | Requires service role / admin auth client; not available client-side |
| comment_cache fan-out (N rows per member) | Edge Function (API) via webhook | — | Webhook is server-to-server; fan-out is triggered by ClickUp events |
| send-reminders org grouping | Edge Function (API) via cron | — | Cron-triggered; no user context |
| Shared org helper | `_shared/org.ts` | — | Imported by multiple Edge Functions |

---

## Summary

### Section 1: Current Function Inventory — Exact Profile Read Locations

#### `fetch-clickup-tasks/index.ts`
**Profile read location:** Lines 358–373
```typescript
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids")
  .eq("id", user.id)
  .single();
const listIds = profile?.clickup_list_ids || [];
```
**Fields read:** `clickup_list_ids`
**Client used:** anon client (user JWT) — RLS enforces `id = auth.uid()`
**Post-read use:** iterates `listIds` to fetch tasks from ClickUp API; upserts `task_cache` with `profile_id: user.id`

#### `fetch-single-task/index.ts`
**Profile read location:** Lines 207–222
```typescript
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids")
  .eq("id", user.id)
  .single();
const userListIds = profile?.clickup_list_ids || [];
```
**Fields read:** `clickup_list_ids`
**Post-read use:** `userListIds.includes(taskListId)` access check before returning task

#### `nextcloud-files/index.ts`
**Profile read locations:** 7 separate occurrences at lines 804–805, 929–930, 1006–1007, 1123–1124, 1220–1221, 1344–1345, 1506–1507
Each reads:
```typescript
.from("profiles")
.select("nextcloud_client_root")
```
**Fields read:** `nextcloud_client_root`
**Actions affected:** `browse-client`, `download-client-file`, `upload-client-file`, `mkdir-client`, `upload-task-file`
**Critical note:** This is the highest-duplication function — 7 separate profile reads. Using a shared helper at the top of the handler (before action routing) will reduce to 1 read.

#### `create-clickup-task/index.ts`
**Profile read location:** Lines 280–288
```typescript
const { data: profile, error: profileError } = await supabase
  .from("profiles")
  .select("clickup_list_ids, full_name, clickup_chat_channel_id")
  .eq("id", user.id)
  .single();
```
**Fields read:** `clickup_list_ids`, `full_name`, `clickup_chat_channel_id`
**Post-read use:**
- `clickup_list_ids` → fallback list ID when `body.listId` not provided (ticket mode)
- `clickup_chat_channel_id` → send ClickUp chat notification after task creation (lines 508–556)
- `full_name` → creator name for cache upsert and chat message
**Note:** `full_name` is still read from `profiles` — org does NOT own `full_name`. Only `clickup_list_ids` and `clickup_chat_channel_id` move to org.

#### `post-task-comment/index.ts`
**Profile read location:** Lines 374–379
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('full_name')
  .eq('id', userId)
  .maybeSingle();
```
**Fields read:** `full_name` only
**No org migration needed for the profile read** — `full_name` stays in profiles.
**What's needed:** Role guard at the top (ORG-BE-11) — separate `org_members` query, not a profiles change.

#### `update-task-status/index.ts`
**Profile read locations:** Multiple reads of `profiles.full_name` at lines 404, 518, 580, 661 (various action branches)
**Fields read:** `full_name` only — stays in profiles
**No org migration needed for profile reads** — `full_name` stays in profiles.
**What's needed:** Role guard at the top (ORG-BE-11).

#### `clickup-webhook/index.ts`
**findProfilesForTask — current logic (lines 357–402):**
```typescript
// Step 1: try task_cache
const { data: cacheEntries } = await supabase
  .from("task_cache").select("profile_id").eq("clickup_id", taskId);

// Step 2: fallback — profiles.clickup_list_ids contains listId
const { data: profiles } = await supabase
  .from("profiles").select("id").contains("clickup_list_ids", [listId]);
// Only returns if exactly 1 profile matches (ambiguous_fallback if >1)
```
**support_task_id lookup (lines 1820–1823):**
```typescript
.from("profiles")
.select("id, email, full_name, email_notifications, notification_preferences")
.eq("support_task_id", normalizedTaskId)
```
Returns only `supportProfiles[0]` — single profile. Phase 10 changes this to fan out to all org members.

#### `send-reminders/index.ts`
**Ticket reminders (lines 516–651):** Queries `task_cache` joined to `profiles!inner`, groups by `profile_id`, loops over profileMap. The RPC `get_pending_reminder_tasks` (if it exists) or direct query — both keyed by `profile_id`.
**Project reminders (lines 659–785):** Queries `project_task_cache`, then `project_access` by `project_config_id`, then `profiles` for those profile_ids. Loops by `profile_id`.
**Unread digest (lines 170–321):** Queries `profiles` directly.
**Recommendation reminders (lines 323–435):** Queries `profiles` directly.

**Phase 10 scope:** Only `sendTicketReminders` (lines 514–652) and `sendProjectReminders` (lines 655–784) are in scope. Unread digest and recommendation reminders are NOT in scope — they remain profile-based.

---

### Section 2: `_shared/org.ts` — Proposed Interface

**File to create:** `supabase/functions/_shared/org.ts`

**Client requirement:** Must use service role client — `org_members` and `organizations` have no client-facing RLS policies yet. All calling functions already have `SUPABASE_SERVICE_ROLE_KEY`.

```typescript
// [VERIFIED: codebase inspection — org_members + organizations schema from migration SQL]

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

export interface OrgConfig {
  organization_id: string;
  clickup_list_ids: string[];
  nextcloud_client_root: string | null;
  support_task_id: string | null;
  clickup_chat_channel_id: string | null;
}

/**
 * Resolves org configuration for a given user via org_members JOIN.
 * Uses service role client to bypass RLS (org_members has no client policies yet).
 * Returns null if user has no org_members row — caller falls back to profiles.
 */
export async function getOrgForUser(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string
): Promise<OrgConfig | null> {
  const { data, error } = await supabaseAdmin
    .from("org_members")
    .select(`
      organization_id,
      organizations!inner (
        clickup_list_ids,
        nextcloud_client_root,
        support_task_id,
        clickup_chat_channel_id
      )
    `)
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const org = data.organizations as {
    clickup_list_ids: string[];
    nextcloud_client_root: string | null;
    support_task_id: string | null;
    clickup_chat_channel_id: string | null;
  };

  return {
    organization_id: data.organization_id,
    clickup_list_ids: org.clickup_list_ids ?? [],
    nextcloud_client_root: org.nextcloud_client_root ?? null,
    support_task_id: org.support_task_id ?? null,
    clickup_chat_channel_id: org.clickup_chat_channel_id ?? null,
  };
}

/**
 * Returns all profile_ids in the same org as the given user.
 * Used by clickup-webhook for fan-out to all org members.
 */
export async function getOrgMemberIds(
  supabaseAdmin: ReturnType<typeof createClient>,
  organizationId: string
): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("org_members")
    .select("profile_id")
    .eq("organization_id", organizationId);

  return (data ?? []).map((row: { profile_id: string }) => row.profile_id);
}

/**
 * Returns the org role for the given user, or null if no org_members row.
 * Uses service role to bypass RLS.
 * Returns null for legacy users with no org_members row — callers treat as 'member'.
 */
export async function getUserOrgRole(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string
): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("org_members")
    .select("role")
    .eq("profile_id", userId)
    .limit(1)
    .maybeSingle();

  return data?.role ?? null;
}

/**
 * Finds the org whose clickup_list_ids contains the given listId.
 * Returns { organizationId, profileIds } or null if no org found.
 * Used by clickup-webhook findProfilesForTask.
 */
export async function findOrgByListId(
  supabaseAdmin: ReturnType<typeof createClient>,
  listId: string
): Promise<{ organizationId: string; profileIds: string[] } | null> {
  const { data: orgs } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .contains("clickup_list_ids", [listId]);

  if (!orgs || orgs.length === 0) return null;
  if (orgs.length > 1) return null; // Ambiguous — multiple orgs own this list

  const organizationId = (orgs[0] as { id: string }).id;
  const profileIds = await getOrgMemberIds(supabaseAdmin, organizationId);
  return { organizationId, profileIds };
}

/**
 * Finds the org that owns the given support_task_id.
 * Returns { organizationId, profileIds } or null.
 * Used by clickup-webhook support chat fan-out.
 */
export async function findOrgBySupportTaskId(
  supabaseAdmin: ReturnType<typeof createClient>,
  taskId: string
): Promise<{ organizationId: string; profileIds: string[] } | null> {
  const { data } = await supabaseAdmin
    .from("organizations")
    .select("id")
    .eq("support_task_id", taskId)
    .maybeSingle();

  if (!data) return null;

  const organizationId = (data as { id: string }).id;
  const profileIds = await getOrgMemberIds(supabaseAdmin, organizationId);
  return { organizationId, profileIds };
}
```

**Why service role in `_shared/org.ts`:** The helper receives a pre-created admin client from the caller. Each calling function already constructs `createClient(supabaseUrl, supabaseServiceKey)` for other admin operations — they pass this client to `getOrgForUser` rather than constructing a new one.

**Dual-read pattern (used in all 5 data-read functions):**
```typescript
// [VERIFIED: codebase — CONTEXT.md locked decision]
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const org = await getOrgForUser(supabaseAdmin, user.id);
const profile = /* existing profile query (unchanged) */;

const listIds = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
const nextcloudRoot = org?.nextcloud_client_root ?? profile?.nextcloud_client_root ?? null;
const supportTaskId = org?.support_task_id ?? profile?.support_task_id ?? null;
const chatChannelId = org?.clickup_chat_channel_id ?? profile?.clickup_chat_channel_id ?? null;
```

---

### Section 3: `invite-member` — Admin API Pattern

**Function does not exist yet.** New file: `supabase/functions/invite-member/index.ts`
Router dispatch: automatic — main router uses `service_name` from URL path. Creating the folder registers the function with no router change needed. [VERIFIED: `supabase/functions/main/index.ts` lines 65–66]

**Admin API availability:** `SUPABASE_SERVICE_ROLE_KEY` is available in all Edge Functions as `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`. Admin methods (`auth.admin.*`) are accessible on a client created with the service role key. [VERIFIED: codebase — multiple functions use this pattern, e.g., `fetch-clickup-tasks` lines 518–519, `create-clickup-task` line 357]

**Invite email copy:** Already present in `_shared/emailCopy.ts` — `EmailType = "invite"`, German subject "Einladung zum KAMANIN Portal", CTA "Einladung annehmen". [VERIFIED: `supabase/functions/_shared/emailCopy.ts` lines 429–452]

**Full sequence (locked in CONTEXT.md):**

```typescript
// [VERIFIED: supabase-js admin API — known from existing patterns in codebase]

// 1. Auth guard: caller must be org admin
const role = await getUserOrgRole(supabaseAdmin, user.id);
// Also verify caller is admin of the SPECIFIC org they're inviting to:
// query org_members WHERE profile_id = user.id AND organization_id = organizationId
if (role !== 'admin') {
  return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 });
}

// 2. Duplicate check
const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
// OR: check profiles table for email, then check org_members
// Safer approach: check org_members via email lookup in auth.users
// If email in auth.users AND profile has org_members row for this org → 409

// 3. Create auth user
const { data: { user: newUser }, error: createError } =
  await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    // No password — user sets it via recovery link
  });

// 4. Generate recovery link
const { data: { properties }, error: linkError } =
  await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: '/passwort-setzen' }
  });
const recoveryUrl = properties.action_link;

// 5. Send invite email via send-mailjet-email (internal call or direct Mailjet)
// Use emailCopy "invite" template with recoveryUrl as CTA href

// 6. If email send fails: delete auth user, return 500
if (!emailSent) {
  await supabaseAdmin.auth.admin.deleteUser(newUser.id);
  return new Response(JSON.stringify({ error: 'Email send failed' }), { status: 500 });
}

// 7. Insert org_members row
await supabaseAdmin.from('org_members').insert({
  organization_id: organizationId,
  profile_id: newUser.id, // NOTE: auth user created but no profiles row yet
  role,
});

// 8. Copy project_access rows from org admin
const { data: adminProfile } = await supabaseAdmin
  .from('org_members')
  .select('profile_id')
  .eq('organization_id', organizationId)
  .eq('role', 'admin')
  .limit(1)
  .maybeSingle();

const { data: adminAccess } = await supabaseAdmin
  .from('project_access')
  .select('project_config_id')
  .eq('profile_id', adminProfile.profile_id);

for (const row of adminAccess) {
  await supabaseAdmin.from('project_access').insert({
    profile_id: newUser.id,
    project_config_id: row.project_config_id,
  });
}
```

**Critical implementation detail — profiles row:** When `auth.admin.createUser()` is called, Supabase GoTrue creates a row in `auth.users` but does NOT automatically create a `profiles` row (that would require a database trigger on `auth.users`). Check if the project has such a trigger.

**Check:** Look for a trigger `on_auth_user_created` or similar that inserts into `profiles`.

**Email sending approach:** Two options:
- Direct Mailjet call (same pattern as `send-reminders` — avoids internal function-to-function call overhead)
- Call `send-mailjet-email` via `fetch` (more indirection)
Direct Mailjet is simpler and consistent with `send-reminders`'s own pattern.

**Request shape:** `{ organizationId: string, email: string, role: 'member' | 'viewer' }`

**Admin role verification — CRITICAL nuance:** `getUserOrgRole` returns the caller's role across ALL orgs (first match). For invite-member, we need the caller's role specifically in `organizationId`. The guard query must be:
```typescript
const { data } = await supabaseAdmin
  .from('org_members')
  .select('role')
  .eq('profile_id', user.id)
  .eq('organization_id', organizationId)
  .maybeSingle();
if (data?.role !== 'admin') → 403
```

---

### Section 4: `clickup-webhook` — `findProfilesForTask` Changes

**Current function signature and return type (lines 345–402):**
```typescript
type ProfileResolutionSource = "task_cache" | "list_fallback" | "none" | "ambiguous_fallback";
interface ProfileResolutionResult {
  profileIds: string[];
  source: ProfileResolutionSource;
}
async function findProfilesForTask(
  supabase: ReturnType<typeof createClient>,
  taskId: string,
  listId: string | null,
  log: ReturnType<typeof createLogger>
): Promise<ProfileResolutionResult>
```

**New resolution order (3 steps):**

1. **Primary (new — org_members):** Find org via `organizations.clickup_list_ids @> [listId]`. Get all `profile_id`s from `org_members`. Return `source: "org_members"`.
2. **Secondary (existing — task_cache):** If no org found, check `task_cache` for `clickup_id = taskId`. Return `source: "task_cache"`.
3. **Tertiary (existing — profiles list_fallback):** If task_cache empty, check `profiles.clickup_list_ids @> [listId]`. Return single match or ambiguous_fallback.

**Type signature change:** Add `"org_members"` to `ProfileResolutionSource` union:
```typescript
type ProfileResolutionSource = "org_members" | "task_cache" | "list_fallback" | "none" | "ambiguous_fallback";
```

**Support chat fan-out change (current lines 1820–1823):**

Current: queries `profiles.support_task_id = normalizedTaskId` → returns single profile (uses `supportProfiles[0]`)

New behavior:
1. Primary: query `organizations.support_task_id = normalizedTaskId` → get org → get all `org_members.profile_id`s
2. Fallback: if no org found, query `profiles.support_task_id = normalizedTaskId` (existing logic)
3. Insert N `comment_cache` rows (one per profileId) with dedup key `(clickup_comment_id, profile_id)`

**Current comment_cache upsert (lines 1839–1857):** Uses `onConflict: "clickup_comment_id,profile_id"` — already correct for multi-row dedup. No change needed to the upsert call, only needs to loop over profileIds.

**Current notification insert (lines 1870–1882):** Also single-profile. Fan-out means loop N times.

**Client used in webhook:** The function creates a service role client from `SUPABASE_SERVICE_ROLE_KEY` for write operations. [VERIFIED: lines 518–519 pattern used across codebase]

---

### Section 5: `send-reminders` — Org Grouping Restructure

**Current ticket reminders structure:**
- Query: `task_cache` joined to `profiles!inner` (or RPC)
- Group by `profile_id`
- Loop over `profileMap: Map<profileId, { email, tasks, lastReminder }>`
- Cooldown tracked on `profiles.last_reminder_sent_at`

**New structure (sendTicketReminders):**
1. Query `organizations` with their admin:
```sql
SELECT o.id, o.name,
       om.profile_id as admin_profile_id,
       p.email, p.full_name, p.email_notifications,
       p.notification_preferences, p.last_reminder_sent_at
FROM organizations o
JOIN org_members om ON om.organization_id = o.id AND om.role = 'admin'
JOIN profiles p ON p.id = om.profile_id
WHERE p.email_notifications = true
```
2. For each org: query `task_cache` where `profile_id IN (SELECT profile_id FROM org_members WHERE organization_id = org.id)`
   — or: query task_cache using `organizations` table by finding all list_ids, then matching tasks
   — simpler approach: query `task_cache` grouped by `list_id`, match to org's `clickup_list_ids`
3. Filter tasks with status in `["client review", "awaiting approval"]`, `is_visible = true`
4. Apply 5-day cooldown against `profiles.last_reminder_sent_at` (org admin's timestamp)
5. Send email to org admin only

**Alternative simpler approach:** Keep querying task_cache as before but deduplicate at org level:
- Query task_cache + profiles join (existing pattern)
- For each profile, look up their org admin
- If caller IS the admin → send normally
- If caller is NOT the admin → skip (admin will be contacted instead when their turn comes)
This approach has a problem: the admin may not have a task_cache row for tasks visible to other org members.

**Recommended approach:** Org-first loop (as above). Fetch all tasks for an org by matching `task_cache.list_id` against `organizations.clickup_list_ids`.

**Cooldown field:** `profiles.last_reminder_sent_at` is on the **admin's** profile row. Phase 10 does not add new columns (staying within existing schema).

**Project reminders:** Same restructuring pattern — instead of looping by `project_access.profile_id`, loop by `organizations`, find org admin, send to admin only if any project tasks are pending for the org's projects.

---

### Section 6: Role Enforcement Pattern

**SQL function available (Phase 9):**
```sql
public.user_org_role(org_id uuid) → text  -- returns 'admin'|'member'|'viewer'|null
```

**From Deno Edge Function — two approaches:**

Option A: `supabase.rpc()` with user JWT (RLS context):
```typescript
const { data: role } = await supabase.rpc('user_org_role', { org_id: organizationId });
```
Problem: requires knowing the `org_id` up-front. These functions don't receive `organizationId` in their request body.

Option B: Direct `org_members` query with service role (no org_id needed):
```typescript
const { data } = await supabaseAdmin
  .from('org_members')
  .select('role')
  .eq('profile_id', user.id)
  .limit(1)
  .maybeSingle();
const role = data?.role ?? 'member'; // Legacy fallback: no row → treat as member
if (role === 'viewer') {
  return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 });
}
```

**Recommended: Option B.** No org_id needed, consistent with how other helpers work, uses `getUserOrgRole` from `_shared/org.ts`.

**Functions receiving role guards (ORG-BE-11):**
- `create-clickup-task/index.ts` — guard goes after user verification (~line 194), before body parse
- `post-task-comment/index.ts` — guard goes after user verification (~line 373), before comment validation
- `update-task-status/index.ts` — guard goes after user verification (~line 177), before action validation

**Legacy user fallback (locked in CONTEXT.md):** If `getUserOrgRole` returns `null` (no `org_members` row), treat as `'member'` — permissive fallback ensures no lockout during transition.

---

### Section 7: Wave Plan

**Wave 0 — Shared Helper (prerequisite for everything)**

| Task | File | Dependency |
|------|------|------------|
| Create `_shared/org.ts` | `supabase/functions/_shared/org.ts` | None |

Must be done first. All subsequent waves import from it.

**Wave 1 — Data-Read Functions + Role Guards (parallel-safe)**

All 5 are independent of each other — can be written in parallel or sequentially.

| Task | File | Change Type | ORG-BE |
|------|------|-------------|--------|
| Update `fetch-clickup-tasks` | `fetch-clickup-tasks/index.ts` | Replace profiles read with org + dual-read | BE-01 |
| Update `fetch-single-task` | `fetch-single-task/index.ts` | Replace profiles read with org + dual-read | BE-02 |
| Update `nextcloud-files` | `nextcloud-files/index.ts` | Extract shared org read to top of handler; 7 inline reads → 1 + dual-read | BE-03 |
| Update `create-clickup-task` | `create-clickup-task/index.ts` | Replace profiles read for list_ids + chat_channel; keep full_name read; add role guard | BE-04, BE-11 |
| Add role guard to `post-task-comment` | `post-task-comment/index.ts` | Insert role check after user verification | BE-11 |
| Add role guard to `update-task-status` | `update-task-status/index.ts` | Insert role check after user verification | BE-11 |

**Wave 2 — Webhook Fan-out**

| Task | File | Change Type | ORG-BE |
|------|------|-------------|--------|
| Update `findProfilesForTask` | `clickup-webhook/index.ts` | Add org_members as primary resolution path | BE-05 |
| Update support chat fan-out | `clickup-webhook/index.ts` | Replace single-profile with N-profile loop | BE-06 |

Wave 2 is self-contained within one file. The webhook is production-sensitive (handles live ClickUp events) so should be a separate wave for careful review.

**Wave 3 — Send-Reminders Org Grouping**

| Task | File | Change Type | ORG-BE |
|------|------|-------------|--------|
| Rewrite `sendTicketReminders` | `send-reminders/index.ts` | Loop by org → admin; org-grouped tasks | BE-07 |
| Rewrite project reminders to match | `send-reminders/index.ts` | Same pattern; admin-only | BE-07 |
| Leave unread digest + recommendation reminders unchanged | `send-reminders/index.ts` | Out of scope | — |

**Wave 4 — New `invite-member` Function**

| Task | File | Change Type | ORG-BE |
|------|------|-------------|--------|
| Create `invite-member/index.ts` | New file | Full new function | BE-08, BE-09, BE-10 |

Wave 4 is the only new file addition. No router change needed (auto-dispatch by folder name).

**Dependency graph:**
```
Wave 0: _shared/org.ts
    ↓ (imported by all)
Wave 1: fetch-clickup-tasks, fetch-single-task, nextcloud-files,
        create-clickup-task (+role), post-task-comment (role), update-task-status (role)
Wave 2: clickup-webhook (fan-out)
Wave 3: send-reminders (org grouping)
Wave 4: invite-member (new function)
```

Waves 1–4 can be planned as separate PLAN files. Wave 1 functions are independent within the wave.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Org resolution | Custom SQL in each function | `_shared/org.ts` helpers | DRY; consistent fallback logic |
| Auth user creation for invite | Custom JWT/password flow | `auth.admin.createUser()` | Supabase admin API handles auth.users correctly |
| Recovery link generation | Custom token generation | `auth.admin.generateLink({ type: 'recovery' })` | GoTrue handles token expiry, redirect, hashing |
| Email sending | New email sender | Direct Mailjet (same pattern as `send-reminders`) | Pattern already proven; consistent credentials handling |
| Role check | Custom JWT parsing | `org_members` query via service role | JWT does not contain org role; only DB has it |

---

## Common Pitfalls

### Pitfall 1: Using anon client for org_members queries
**What goes wrong:** `org_members` has no client-facing RLS read policy (Phase 9 explicitly deferred this). Queries with the anon/user JWT will return empty rows silently, causing the org lookup to always fail and the fallback to always trigger.
**Why it happens:** Developer assumes RLS is permissive; it defaults to deny.
**How to avoid:** All `_shared/org.ts` functions receive/create a `supabaseAdmin` client (service role key). Document this contract clearly in the helper file.
**Warning signs:** Org lookup always returns null; dual-read always falls back to profiles.

### Pitfall 2: `profiles` row may not exist for new invited users
**What goes wrong:** `auth.admin.createUser()` creates `auth.users` row. The `profiles` table may not have a matching row until a trigger fires or a separate insert is done.
**Why it happens:** The `profiles` row is created by a trigger `handle_new_user` on `auth.users INSERT` — check if this trigger exists in the migration history.
**How to avoid:** Check `supabase/migrations/` for a trigger on `auth.users` that inserts into `profiles`. If it exists, profiles row is automatic. If not, `invite-member` must manually insert a `profiles` row.
**Action required:** Search `supabase/migrations/` for `handle_new_user` or `on_auth_user_created` trigger. [ASSUMED — not verified in this session]

### Pitfall 3: `nextcloud-files` has 7 inline profile reads — forgetting the upload-task-file action
**What goes wrong:** Developer updates the 6 obvious `browse-client`/`download`/`upload`/`mkdir` actions but misses `upload-task-file` at line 1506.
**Why it happens:** `upload-task-file` is listed as a "Hybrid action" in the file header and treated differently.
**How to avoid:** Move the org/profile read to the top of the `Deno.serve` handler (before the action switch), before any action-specific branching. The `nextcloud_client_root` value is available for all actions.

### Pitfall 4: send-reminders org-grouped tasks — org may have members whose task_cache rows span multiple list_ids
**What goes wrong:** After migration, tasks in `task_cache` still have `profile_id` pointing to the profile who originally triggered the sync. A newly invited member will not have task_cache rows. Querying `task_cache` by org member profile_ids may miss tasks visible to the org admin.
**Why it happens:** `task_cache` is profile-scoped (unique on `clickup_id, profile_id`).
**How to avoid:** In the org-grouped send-reminders loop, query `task_cache` using the **admin's** profile_id (since the admin was the original sync target and will have the most complete task_cache). This matches the existing behavior and avoids missing tasks.

### Pitfall 5: comment_cache fan-out dedup key
**What goes wrong:** Inserting N rows for N org members could violate the unique constraint `(clickup_comment_id, profile_id)` on replay (ClickUp can re-deliver webhooks).
**Why it happens:** Idempotent upserts are needed, not inserts.
**How to avoid:** Use `upsert` with `onConflict: "clickup_comment_id,profile_id"` (same as existing single-profile pattern). The constraint already handles dedup correctly.

---

## Code Examples

### Dual-read pattern (used in 5 functions)
```typescript
// Source: codebase inspection — CONTEXT.md locked pattern
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
const org = await getOrgForUser(supabaseAdmin, user.id);

// Existing profile query stays unchanged for fallback
const { data: profile } = await supabase
  .from("profiles")
  .select("clickup_list_ids, nextcloud_client_root, support_task_id, clickup_chat_channel_id")
  .eq("id", user.id)
  .single();

const listIds: string[] = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? [];
const nextcloudRoot: string | null = org?.nextcloud_client_root ?? profile?.nextcloud_client_root ?? null;
const supportTaskId: string | null = org?.support_task_id ?? profile?.support_task_id ?? null;
const chatChannelId: string | null = org?.clickup_chat_channel_id ?? profile?.clickup_chat_channel_id ?? null;
```

### Role guard pattern (post-auth, pre-action)
```typescript
// Source: codebase inspection — CONTEXT.md locked pattern
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey!);
const orgRole = await getUserOrgRole(supabaseAdmin, user.id);
// null means legacy user (no org_members row) → treat as 'member' (permissive)
if (orgRole === 'viewer') {
  log.warn("Viewer role blocked from mutating operation");
  return new Response(
    JSON.stringify({ error: 'Insufficient permissions' }),
    { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### findProfilesForTask — new org-first step
```typescript
// Source: codebase inspection — extending existing ProfileResolutionResult shape
// Step 1: Org lookup (NEW)
if (listId) {
  const orgResult = await findOrgByListId(supabaseAdmin, listId);
  if (orgResult && orgResult.profileIds.length > 0) {
    log.info("Profiles resolved via org_members", { taskId, count: orgResult.profileIds.length });
    return { profileIds: orgResult.profileIds, source: "org_members" };
  }
}
// Step 2: Existing task_cache lookup (unchanged)
// Step 3: Existing profiles list_fallback (unchanged)
```

### Support chat fan-out (N rows per org member)
```typescript
// Source: codebase inspection — extending existing single-profile pattern
const orgResult = await findOrgBySupportTaskId(supabaseAdmin, normalizedTaskId);
const profileIds = orgResult?.profileIds ?? [];

// Fallback to existing single-profile lookup if no org found
if (profileIds.length === 0) {
  const { data: supportProfiles } = await supabase
    .from("profiles").select("id, ...").eq("support_task_id", normalizedTaskId);
  // ... existing logic
}

// Fan-out: one comment_cache row per profile
for (const profileId of profileIds) {
  await supabase.from("comment_cache").upsert({
    clickup_comment_id: commentId,
    task_id: taskId,
    profile_id: profileId,
    // ... same fields
  }, { onConflict: "clickup_comment_id,profile_id" });
}
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `profiles` row is automatically created by a DB trigger when `auth.admin.createUser()` is called (handle_new_user trigger on auth.users) | Section 3 (invite-member) | If no trigger exists, `org_members.profile_id` FK will fail; must add manual profiles insert to invite-member |
| A2 | `organizations.clickup_list_ids` was populated with the correct array from `profiles.clickup_list_ids` during Phase 9 data migration | Sections 1, 4 | If migration left null/empty arrays, org lookup always fails and all fallbacks activate |
| A3 | `send-reminders` RPC `get_pending_reminder_tasks()` may or may not exist in staging — code already has a fallback to direct query | Section 5 | Low risk — existing fallback already handles this |

---

## Open Questions

1. **Profiles trigger for new auth users**
   - What we know: `auth.admin.createUser()` creates `auth.users` row; `profiles` table has FK `id → auth.users.id`
   - What's unclear: Is there a `handle_new_user` trigger that automatically inserts a `profiles` row?
   - Recommendation: Grep `supabase/migrations/` for `handle_new_user` or `on_auth_user_created`. If found, profiles row is automatic. If not, invite-member must insert it manually (with `email`, `full_name` from invite payload).

2. **admin profile_id when copying project_access**
   - What we know: CONTEXT says "copy project_access rows from org admin to new member"
   - What's unclear: If the org has multiple admins, which admin's project_access to copy?
   - Recommendation: Copy from the first admin found (`LIMIT 1` on `org_members WHERE role='admin'`). Project_access is likely consistent across admins since they're all in the same org.

3. **supabase-js version compatibility for `auth.admin.generateLink`**
   - What we know: All functions use `https://esm.sh/@supabase/supabase-js@2.47.10`
   - What's unclear: Exact parameter shape for `generateLink({ type: 'recovery', email, options: { redirectTo } })` in v2.47.10
   - Recommendation: The options shape is `{ type, email, options: { redirectTo } }`. This is standard v2 supabase-js admin API and unlikely to differ at 2.47.10. [ASSUMED]

---

## Environment Availability

Step 2.6: SKIPPED — Phase 10 is Edge Function code changes only. No new external services beyond what's already in use (Supabase, ClickUp, Mailjet). All required env vars (`SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MAILJET_API_KEY`, `MAILJET_API_SECRET`) are already configured in all functions.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing, `vitest.config.ts` present) |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test:coverage` |

**Note:** Edge Functions run in Deno; the project's Vitest suite tests frontend TypeScript. Edge Function correctness is validated via integration/smoke tests against the staging Supabase instance, not Vitest unit tests.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| ORG-BE-01 | fetch-clickup-tasks returns correct list from org.clickup_list_ids | Integration (manual invoke against staging) | `curl -X POST ...` | Manual |
| ORG-BE-02 | fetch-single-task validates task access via org | Integration (manual) | Manual | Manual |
| ORG-BE-03 | nextcloud-files resolves client root from org | Integration (manual) | Manual | Manual |
| ORG-BE-04 | create-clickup-task uses org list + chat channel | Integration (manual) | Manual | Manual |
| ORG-BE-05 | webhook fan-out sends to all org members | Integration (manual webhook replay) | Manual | Manual |
| ORG-BE-06 | support comment_cache has N rows per org member | SQL check: `SELECT COUNT(*) FROM comment_cache WHERE task_id = '...'` | Manual | Manual |
| ORG-BE-07 | send-reminders emails only org admin | Manual run + check sent count | Manual | Manual |
| ORG-BE-08 | invite-member creates user + sends email | Integration: POST /invite-member with valid payload | Manual | Manual |
| ORG-BE-09 | invite-member returns 403 for non-admin caller | Integration: POST with member JWT | Manual | Manual |
| ORG-BE-10 | invite-member returns 409 for existing org member | Integration: POST with already-invited email | Manual | Manual |
| ORG-BE-11 | viewer role returns 403 on create/comment/update | Integration: POST with viewer JWT | Manual | Manual |

**Unit testable behavior (Vitest):**
- `_shared/org.ts` helper functions are pure async functions that can be tested with a mocked Supabase client.
- Recommend adding `supabase/functions/_shared/__tests__/org.test.ts` with mocked `supabase` client.
- Not strictly required by current test strategy (test files are in `src/modules/`), but would be good practice.

### Wave 0 Gaps
- No new test files required for frontend test suite
- Edge Function validation is integration-level, performed manually against staging after deployment

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | Yes — invite flow creates new auth users | `auth.admin.createUser()` + GoTrue recovery link; no plain-text passwords |
| V3 Session Management | No | Not applicable to this phase |
| V4 Access Control | Yes — role-based 403 on mutating operations | `org_members.role` check via service role client |
| V5 Input Validation | Yes — invite-member validates email + role | Validate email format, role in `['member', 'viewer']` |
| V6 Cryptography | No | No custom crypto; GoTrue handles token generation |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Viewer escalation (POST to create-clickup-task) | Elevation of Privilege | Role guard returns 403 before any ClickUp API call |
| Invite to arbitrary org (IDOR) | Elevation of Privilege | Auth guard checks caller's role IN the specific `organizationId` from request body |
| Replay of invite link | Spoofing | GoTrue recovery links expire (GoTrue default: 24h); not controllable from Edge Function |
| Email enumeration via invite-member (409 response) | Information Disclosure | 409 is acceptable here — org admin already knows their org members |
| Admin spoofing (sending `role: 'admin'` in request) | Elevation of Privilege | `invite-member` validates `role in ['member', 'viewer']` — rejects 'admin' |

---

## Sources

### Primary (HIGH confidence)
- `supabase/functions/fetch-clickup-tasks/index.ts` — exact line numbers for profile reads verified
- `supabase/functions/fetch-single-task/index.ts` — exact line numbers verified
- `supabase/functions/nextcloud-files/index.ts` — 7 occurrence locations verified via grep
- `supabase/functions/create-clickup-task/index.ts` — profile read fields verified
- `supabase/functions/post-task-comment/index.ts` — full file read
- `supabase/functions/update-task-status/index.ts` — full file read
- `supabase/functions/clickup-webhook/index.ts` — findProfilesForTask and support_task_id locations verified
- `supabase/functions/send-reminders/index.ts` — full file read
- `supabase/functions/_shared/emailCopy.ts` — "invite" email type confirmed present
- `supabase/functions/main/index.ts` — router dispatch pattern verified
- `supabase/migrations/20260414200000_org_foundation.sql` — exact table schemas, column names, SQL function signatures
- `.planning/phases/10-org-edge-functions/10-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)
- `supabase/functions/_shared/` file listing — `org.ts` does not exist yet (confirmed)

---

## Metadata

**Confidence breakdown:**
- Current function inventory: HIGH — read all source files
- `_shared/org.ts` interface: HIGH — derived directly from schema and locked CONTEXT decisions
- invite-member sequence: HIGH — locked in CONTEXT.md; admin API pattern consistent with existing codebase
- send-reminders restructure: MEDIUM — requires judgment on task_cache query strategy (org-first vs profile-first with dedup)
- profiles trigger for new users: LOW (A1) — not verified in migrations

**Research date:** 2026-04-14
**Valid until:** 2026-05-14 (stable domain — no fast-moving external APIs)
