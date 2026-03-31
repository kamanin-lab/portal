# Organizations Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce multi-user organizations — each client company becomes one org with shared credits, tasks, and workspaces, with admin/member/viewer roles controlling what each person can do.

**Architecture:** Four sequential phases: (1) additive DB migration creating organizations + org_members tables, (2) Edge Function updates for org-level routing, (3) Frontend updates for useOrganization hook and /organisation page, (4) invite flow completion and dual-write cleanup. Zero-downtime via additive Phase 1 and dual-write during Phase 2.

**Tech Stack:** PostgreSQL + RLS (Supabase), Deno Edge Functions, React 19 + TypeScript, React Query, shadcn/ui, Tailwind CSS v4

---

## File Map

### New files
| File | Purpose |
|------|---------|
| `supabase/migrations/20260331000001_organizations_tables.sql` | Create organizations + org_members + index |
| `supabase/migrations/20260331000002_organizations_additive_columns.sql` | Add nullable org columns to existing tables |
| `supabase/migrations/20260331000003_organizations_data_migration.sql` | Migrate existing profiles → orgs |
| `supabase/migrations/20260331000004_organizations_rls.sql` | RLS helpers + org-level policies |
| `supabase/migrations/20260331_rls_tests.sql` | Manual RLS test suite (run before each phase, not applied as migration) |
| `supabase/migrations/20260331000010_drop_dual_write.sql` | Phase 4: make org columns NOT NULL, drop old constraints |
| `supabase/functions/accept-org-invite/index.ts` | Activates pending org invite after user auth |
| `supabase/functions/invite-org-member/index.ts` | Creates auth user + pending org_members row + sends Mailjet invite |
| `supabase/functions/clickup-webhook/handlers/handleStatusChange.ts` | Status change handler extracted from monolith |
| `supabase/functions/clickup-webhook/handlers/handleComment.ts` | Comment handler extracted from monolith |
| `supabase/functions/clickup-webhook/handlers/resolveRecipients.ts` | Org resolver (replaces findProfilesForTask) |
| `supabase/functions/clickup-webhook/handlers/routeNotifications.ts` | Role-based notification routing |
| `src/shared/hooks/useOrganization.ts` | React Query hook for org context |
| `src/modules/organisation/pages/OrganisationPage.tsx` | Admin-only /organisation page |
| `src/modules/organisation/components/OrgInfoSection.tsx` | Org info display (name, slug, credits) |
| `src/modules/organisation/components/TeamSection.tsx` | Members table with role/remove actions |
| `src/modules/organisation/components/InviteMemberDialog.tsx` | Invite modal (email + role) |
| `src/modules/organisation/components/ProjectAccessSection.tsx` | Member × project access grid |

### Modified files
| File | Change |
|------|--------|
| `scripts/onboard-client.ts` | Create org + org_members in Phase 1 order |
| `src/shared/types/common.ts` | Add Organization, OrgMember, OrgRole types |
| `src/modules/tickets/hooks/useClickUpTasks.ts` | Filter by organization_id |
| `src/modules/tickets/hooks/useSingleTask.ts` | Filter by organization_id |
| `src/shared/hooks/useWorkspaces.ts` | Query client_workspaces by org |
| `src/modules/tickets/components/TaskActions.tsx` | Role-gate Akzeptieren/Freigeben buttons |
| `src/modules/tickets/pages/TicketsPage.tsx` | Pass orgId to NewTaskButton check |
| `src/shared/components/layout/SidebarUtilities.tsx` | Admin-only "Meine Organisation" link |
| `src/shared/components/layout/Sidebar.tsx` | needsAttentionCount by org |
| `src/app/routes.tsx` | Add /organisation route |
| `supabase/functions/clickup-webhook/index.ts` | Becomes thin router (~80 lines) |
| `supabase/functions/fetch-clickup-tasks/index.ts` | Read list_ids from org |
| `supabase/functions/create-clickup-task/index.ts` | Read list_id + role check from org |
| `supabase/functions/nextcloud-files/index.ts` | Read nextcloud_client_root from org |
| `supabase/functions/update-task-status/index.ts` | Role check for credit approval |
| `supabase/functions/send-support-message/index.ts` | Read support_task_id from org |

---

## Phase 1 — Database

### Task 1: Create organizations + org_members tables

**Files:**
- Create: `supabase/migrations/20260331000001_organizations_tables.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- supabase/migrations/20260331000001_organizations_tables.sql

CREATE TABLE organizations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  slug                    text NOT NULL UNIQUE,
  clickup_list_ids        jsonb DEFAULT '[]',
  nextcloud_client_root   text,
  support_task_id         text,
  clickup_chat_channel_id text,
  agency_id               uuid,  -- NULL now; FK to agencies when SaaS layer arrives
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);

CREATE TABLE org_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- NULL while invite is pending (accepted_at IS NULL)
  profile_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,
  role            text NOT NULL DEFAULT 'member'
                  CHECK (role IN ('admin', 'member', 'viewer')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('active', 'pending', 'suspended')),
  invited_by      uuid REFERENCES profiles(id),
  invited_at      timestamptz DEFAULT now(),
  -- NULL = invite not yet accepted. Activates UNIQUE(org, profile) constraint.
  -- PostgreSQL treats NULL != NULL, so pending rows with profile_id=NULL don't conflict here.
  accepted_at     timestamptz,
  -- Duplicate pending invites to same email are caught by the second UNIQUE below
  invite_email    text,
  created_at      timestamptz DEFAULT now(),
  UNIQUE(organization_id, profile_id),
  UNIQUE(organization_id, invite_email)
);

-- Critical: without this index, user_org_ids() RLS subquery is a sequential scan per row
CREATE INDEX idx_org_members_profile_status ON org_members(profile_id, status);
```

- [ ] **Step 2: Apply migration via Supabase SQL Editor**

Copy the SQL above and run it in Supabase Studio → SQL Editor.
Expected: no errors, tables visible in Table Editor.

- [ ] **Step 3: Verify tables exist**

Run in SQL Editor:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('organizations', 'org_members');
```
Expected: 2 rows returned.

- [ ] **Step 4: Commit migration file**

```bash
git add supabase/migrations/20260331000001_organizations_tables.sql
git commit -m "feat(db): create organizations + org_members tables with invite flow"
```

---

### Task 2: Add nullable organization_id to existing tables

**Files:**
- Create: `supabase/migrations/20260331000002_organizations_additive_columns.sql`

- [ ] **Step 1: Write migration**

```sql
-- supabase/migrations/20260331000002_organizations_additive_columns.sql
-- All columns nullable — populated in data migration (Task 3)
-- Old columns remain: dual-write safety during Phase 2

ALTER TABLE task_cache         ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE credit_packages    ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE credit_transactions ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE client_workspaces  ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE support_messages   ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE profiles           ADD COLUMN organization_id uuid REFERENCES organizations(id);
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Expected: no errors.

- [ ] **Step 3: Verify columns**

```sql
SELECT column_name, table_name
FROM information_schema.columns
WHERE column_name = 'organization_id'
  AND table_schema = 'public'
ORDER BY table_name;
```
Expected: 6 rows (task_cache, credit_packages, credit_transactions, client_workspaces, support_messages, profiles).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260331000002_organizations_additive_columns.sql
git commit -m "feat(db): add nullable organization_id to 6 tables (additive, dual-write safe)"
```

---

### Task 3: Data migration — seed orgs from existing profiles

**Files:**
- Create: `supabase/migrations/20260331000003_organizations_data_migration.sql`

- [ ] **Step 1: Write data migration**

```sql
-- supabase/migrations/20260331000003_organizations_data_migration.sql
-- One org per existing profile. Slug = slugified company_name.
-- Migrate org fields (clickup_list_ids etc.) from profiles to organizations.

-- 1. Create orgs from profiles
INSERT INTO organizations (name, slug, clickup_list_ids, nextcloud_client_root, support_task_id, clickup_chat_channel_id)
SELECT
  COALESCE(company_name, full_name, email),
  lower(regexp_replace(
    COALESCE(company_name, full_name, email),
    '[^a-z0-9]+', '-', 'g'
  )),
  COALESCE(clickup_list_ids, '[]'::jsonb),
  nextcloud_client_root,
  support_task_id,
  clickup_chat_channel_id
FROM profiles;

-- 2. Create admin org_members for each profile
-- Match profile → org by slug (same slug generation as above)
INSERT INTO org_members (organization_id, profile_id, role, status, accepted_at, invite_email)
SELECT
  o.id,
  p.id,
  'admin',
  'active',
  now(),
  p.email
FROM profiles p
JOIN organizations o
  ON o.slug = lower(regexp_replace(
    COALESCE(p.company_name, p.full_name, p.email),
    '[^a-z0-9]+', '-', 'g'
  ));

-- 3. Fast-lookup: populate profiles.organization_id
UPDATE profiles p
SET organization_id = om.organization_id
FROM org_members om
WHERE om.profile_id = p.id AND om.status = 'active';

-- 4. Populate task_cache.organization_id
UPDATE task_cache tc
SET organization_id = p.organization_id
FROM profiles p
WHERE tc.profile_id = p.id;

-- 5. Populate credit_packages.organization_id
UPDATE credit_packages cp
SET organization_id = p.organization_id
FROM profiles p
WHERE cp.profile_id = p.id;

-- 6. Populate credit_transactions.organization_id
UPDATE credit_transactions ct
SET organization_id = p.organization_id
FROM profiles p
WHERE ct.profile_id = p.id;

-- 7. Populate client_workspaces.organization_id
UPDATE client_workspaces cw
SET organization_id = p.organization_id
FROM profiles p
WHERE cw.profile_id = p.id;

-- 8. Populate support_messages.organization_id
UPDATE support_messages sm
SET organization_id = p.organization_id
FROM profiles p
WHERE sm.profile_id = p.id;
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

Expected: no errors. Verify with:
```sql
SELECT count(*) FROM organizations;        -- should equal count of profiles
SELECT count(*) FROM org_members;          -- same count, all role='admin', status='active'
SELECT count(*) FROM task_cache WHERE organization_id IS NULL;  -- should be 0
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260331000003_organizations_data_migration.sql
git commit -m "feat(db): migrate existing profiles to organizations (1:1 admin mapping)"
```

---

### Task 4: RLS helpers + org-level policies

**Files:**
- Create: `supabase/migrations/20260331000004_organizations_rls.sql`

- [ ] **Step 1: Write RLS SQL**

```sql
-- supabase/migrations/20260331000004_organizations_rls.sql

-- Helper: returns org IDs where current user is an active member
-- STABLE is mandatory: without it PostgreSQL re-executes per row → O(n) scan
CREATE OR REPLACE FUNCTION user_org_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id FROM org_members
  WHERE profile_id = auth.uid() AND status = 'active'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: returns role of current user in a specific org
CREATE OR REPLACE FUNCTION user_org_role(org_id uuid)
RETURNS text AS $$
  SELECT role FROM org_members
  WHERE profile_id = auth.uid() AND organization_id = org_id AND status = 'active'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- org_members: simple policy (cannot use user_org_ids here — circular reference)
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members_see_own_row" ON org_members
  FOR SELECT USING (profile_id = auth.uid());

-- organizations: members can read their org
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_read" ON organizations
  FOR SELECT USING (id = ANY(user_org_ids()));

-- New org-level policies on existing tables (coexist with old profile_id policies during Phase 2)
-- Old policies removed in Task 16 after verification
CREATE POLICY "task_cache_org_read" ON task_cache
  FOR SELECT USING (organization_id = ANY(user_org_ids()));

CREATE POLICY "credit_packages_org_read" ON credit_packages
  FOR SELECT USING (organization_id = ANY(user_org_ids()));

CREATE POLICY "client_workspaces_org_read" ON client_workspaces
  FOR SELECT USING (organization_id = ANY(user_org_ids()));

CREATE POLICY "support_messages_org_read" ON support_messages
  FOR SELECT USING (organization_id = ANY(user_org_ids()));
```

- [ ] **Step 2: Apply in SQL Editor**

Expected: no errors. Functions visible in Database → Functions.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260331000004_organizations_rls.sql
git commit -m "feat(db): add user_org_ids/user_org_role helpers + org-level RLS policies"
```

---

### Task 5: RLS test suite (run manually before each phase transition)

**Files:**
- Create: `supabase/migrations/20260331_rls_tests.sql` (manual run only — NOT applied as migration)

- [ ] **Step 1: Write test file**

```sql
-- supabase/migrations/20260331_rls_tests.sql
-- MANUAL TEST ONLY — do not apply as a migration
-- Run in Supabase SQL Editor before each phase transition
-- Replace UUIDs with real values from your database

-- Setup: find test UUIDs
-- SELECT id, email FROM profiles LIMIT 5;
-- SELECT id, organization_id FROM org_members WHERE status = 'active' LIMIT 5;

-- ============================================================
-- Test 1: Cross-org isolation
-- User in org A cannot see org B task_cache rows
-- ============================================================
SET LOCAL role TO authenticated;
SET LOCAL "request.jwt.claims" TO '{"sub": "<replace-with-org-a-user-uuid>"}';

SELECT
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS "Test 1: cross-org isolation"
FROM task_cache
WHERE organization_id = '<replace-with-org-b-uuid>';

-- ============================================================
-- Test 2: Pending member sees no task_cache rows
-- ============================================================
-- First create a pending member in SQL Editor for testing:
-- INSERT INTO org_members (organization_id, status, invite_email)
-- VALUES ('<org-uuid>', 'pending', 'pending-test@example.com');
-- Then create auth user with that email and get their UUID.

SET LOCAL "request.jwt.claims" TO '{"sub": "<replace-with-pending-member-uuid>"}';

SELECT
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS "Test 2: pending sees nothing"
FROM task_cache;

-- ============================================================
-- Test 3: Suspended member sees no task_cache rows
-- ============================================================
SET LOCAL "request.jwt.claims" TO '{"sub": "<replace-with-suspended-member-uuid>"}';

SELECT
  CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS "Test 3: suspended sees nothing"
FROM task_cache;

-- ============================================================
-- Test 4: org_members circular reference — user sees only own row
-- ============================================================
SET LOCAL "request.jwt.claims" TO '{"sub": "<replace-with-active-member-uuid>"}';

SELECT
  CASE WHEN count(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS "Test 4: org_members own row only"
FROM org_members;

-- Reset role
RESET role;
```

- [ ] **Step 2: Run tests against current data**

Open Supabase Studio → SQL Editor. Replace UUID placeholders with real values. Run. Expected: all 4 tests show PASS.

- [ ] **Step 3: Commit test file**

```bash
git add supabase/migrations/20260331_rls_tests.sql
git commit -m "test(db): RLS isolation test suite (manual, run before each phase)"
```

---

### Task 6: Update onboard-client.ts to write org fields in Phase 1

**Files:**
- Modify: `scripts/onboard-client.ts`

- [ ] **Step 1: Add orgSlug to ClientConfig interface and update main()**

Add `orgSlug?: string` to `ClientConfig`. Insert org creation step between auth user creation and profile creation:

```typescript
// After Step 1 (auth user created), add:

// Step 1b: Create organization
console.log("1b. Creating organization...");
const orgSlug = config.orgSlug ||
  (config.company || config.fullName || config.email)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const { data: orgData, error: orgError } = await supabase
  .from("organizations")
  .insert({
    name: config.company || config.fullName,
    slug: orgSlug,
    clickup_list_ids: config.clickupListIds || [],
    support_task_id: config.supportTaskId || null,
    clickup_chat_channel_id: config.clickupChatChannelId || null,
    nextcloud_client_root: config.nextcloudRoot || null,
  })
  .select("id")
  .single();

if (orgError) {
  console.error("   FAILED:", orgError.message);
  await supabase.auth.admin.deleteUser(userId);
  process.exit(1);
}
const orgId = orgData.id;
console.log(`   OK: org ${orgId} (slug: ${orgSlug})`);

// Step 1c: Create org_members row (admin)
console.log("1c. Creating org membership...");
const { error: memberError } = await supabase
  .from("org_members")
  .insert({
    organization_id: orgId,
    profile_id: userId,
    role: "admin",
    status: "active",
    accepted_at: new Date().toISOString(),
    invite_email: config.email,
  });

if (memberError) {
  console.error("   FAILED:", memberError.message);
  await supabase.auth.admin.deleteUser(userId);
  process.exit(1);
}
console.log("   OK");
```

Update profiles upsert (Step 2) to remove org fields (they're now in organizations), add `organization_id`:

```typescript
const { error: profileError } = await supabase.from("profiles").upsert({
  id: userId,
  email: config.email,
  full_name: config.fullName,
  company_name: config.company,
  organization_id: orgId,           // fast-lookup FK
  email_notifications: true,
  // clickup_list_ids REMOVED (now in organizations)
  // support_task_id REMOVED
  // clickup_chat_channel_id REMOVED
  // nextcloud_client_root REMOVED
});
```

- [ ] **Step 2: Test with dry-run**

```bash
npx tsx scripts/onboard-client.ts --config scripts/test-client.json
```

Create `scripts/test-client.json` with a test email. Expected: all steps print OK.

- [ ] **Step 3: Commit**

```bash
git add scripts/onboard-client.ts
git commit -m "feat(onboarding): create organization + org_members in Phase 1 (was Phase 4)"
```

---

## Phase 2 — Edge Functions

### Task 7: Refactor clickup-webhook into internal modules (Step 0)

This refactor must happen BEFORE org-logic is added. Deploy and verify before proceeding to Task 8.

**Files:**
- Create: `supabase/functions/clickup-webhook/handlers/resolveRecipients.ts`
- Create: `supabase/functions/clickup-webhook/handlers/handleStatusChange.ts`
- Create: `supabase/functions/clickup-webhook/handlers/handleComment.ts`
- Create: `supabase/functions/clickup-webhook/handlers/routeNotifications.ts`
- Modify: `supabase/functions/clickup-webhook/index.ts`

- [ ] **Step 1: Create resolveRecipients.ts with OrgContext type**

```typescript
// supabase/functions/clickup-webhook/handlers/resolveRecipients.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";

export interface OrgMemberRow {
  profileId: string;
  role: "admin" | "member" | "viewer";
  email: string;
  fullName: string | null;
  emailNotifications: boolean;
  notificationPreferences: Record<string, boolean> | null;
}

export interface OrgContext {
  organizationId: string;
  members: OrgMemberRow[];
}

export async function findOrgForTask(
  listId: string,
  supabase: SupabaseClient
): Promise<OrgContext | null> {
  // Find org by list_id inside clickup_list_ids jsonb array
  const { data: org, error } = await supabase
    .from("organizations")
    .select("id")
    .contains("clickup_list_ids", JSON.stringify([listId]))
    .maybeSingle();

  if (error || !org) return null;

  // Fetch all active members with their profile info
  const { data: members, error: membersError } = await supabase
    .from("org_members")
    .select(`
      role,
      profile_id,
      profiles!inner(email, full_name, email_notifications, notification_preferences)
    `)
    .eq("organization_id", org.id)
    .eq("status", "active");

  if (membersError || !members) return null;

  return {
    organizationId: org.id,
    members: members.map((m) => ({
      profileId: m.profile_id,
      role: m.role as "admin" | "member" | "viewer",
      email: (m.profiles as any).email,
      fullName: (m.profiles as any).full_name,
      emailNotifications: (m.profiles as any).email_notifications ?? true,
      notificationPreferences: (m.profiles as any).notification_preferences,
    })),
  };
}
```

- [ ] **Step 2: Create handler interface stubs (extract from existing index.ts)**

Extract the existing status-change logic from `clickup-webhook/index.ts` into `handleStatusChange.ts`. Extract comment handling into `handleComment.ts`. The handlers keep the same logic as before — this task is a pure refactor, no behavior change.

```typescript
// handlers/handleStatusChange.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import type { OrgContext } from "./resolveRecipients.ts";

export async function handleStatusChange(
  payload: any,
  orgCtx: OrgContext,
  supabase: SupabaseClient,
  log: any
): Promise<void> {
  // Move existing status-change logic from index.ts here
  // org-level upsert: organization_id instead of profile_id (Task 8 adds this)
  // For now: loop over orgCtx.members and upsert per member (old behavior, refactored location)
}

// handlers/handleComment.ts
export async function handleComment(
  payload: any,
  orgCtx: OrgContext,
  supabase: SupabaseClient,
  log: any
): Promise<void> {
  // Move existing comment logic from index.ts here
}
```

- [ ] **Step 3: Update index.ts to be a thin router**

```typescript
// The existing index.ts body (signature verify, rate limit, CORS) stays.
// Replace the main dispatch section with:

import { findOrgForTask } from "./handlers/resolveRecipients.ts";
import { handleStatusChange } from "./handlers/handleStatusChange.ts";
import { handleComment } from "./handlers/handleComment.ts";

// Inside Deno.serve, after signature verify + rate limit:
const listId = payload.task?.list?.id ?? payload.history_items?.[0]?.parent_id;
if (!listId) {
  log.warn("No list_id in payload, skipping");
  return new Response("ok", { status: 200 });
}

const orgCtx = await findOrgForTask(listId, supabase);
if (!orgCtx) {
  log.warn("No org found for list_id", { listId });
  return new Response("ok", { status: 200 });
}

if (payload.event === "taskCommentPosted") {
  await handleComment(payload, orgCtx, supabase, log);
} else {
  await handleStatusChange(payload, orgCtx, supabase, log);
}
```

- [ ] **Step 4: Deploy and verify**

Deploy via the volume mount method (restart Coolify service or trigger redeploy).
Test with a real ClickUp event (change a task status, post a comment).
Expected: same behavior as before — notifications arrive, task_cache updates.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/clickup-webhook/
git commit -m "refactor(webhook): extract internal modules before org-logic (step 0)"
```

---

### Task 8: Update handleStatusChange for org-level task_cache upsert

**Files:**
- Modify: `supabase/functions/clickup-webhook/handlers/handleStatusChange.ts`

- [ ] **Step 1: Replace per-profile upsert with org-level upsert**

```typescript
// Inside handleStatusChange, replace task_cache upsert:

// OLD (per-profile loop):
// for (const member of orgCtx.members) {
//   await supabase.from('task_cache').upsert({ profile_id: member.profileId, ... })
// }

// NEW (single org-level upsert + dual-write):
const startMs = Date.now();

await supabase.from("task_cache").upsert({
  clickup_id: taskId,
  organization_id: orgCtx.organizationId,          // org-level (new)
  profile_id: orgCtx.members[0]?.profileId ?? null, // dual-write: keep old col populated
  name: task.name,
  status: task.status?.status ?? "",
  status_color: task.status?.color ?? null,
  priority: task.priority?.priority ?? null,
  priority_color: task.priority?.color ?? null,
  due_date: task.due_date ? new Date(Number(task.due_date)).toISOString() : null,
  time_estimate: task.time_estimate ?? null,
  clickup_url: task.url ?? null,
  list_id: task.list?.id ?? null,
  list_name: task.list?.name ?? null,
  raw_data: task,
  is_visible: true,
  last_synced: new Date().toISOString(),
  last_activity_at: new Date().toISOString(),
}, { onConflict: "clickup_id,organization_id" });

log.info("webhook_processing_time_ms", {
  ms: Date.now() - startMs,
  event: payload.event,
  org: orgCtx.organizationId,
});
```

- [ ] **Step 2: Verify with real webhook event**

Change a ClickUp task status. Check Supabase → task_cache: row should have `organization_id` populated.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/clickup-webhook/handlers/handleStatusChange.ts
git commit -m "feat(webhook): org-level task_cache upsert with dual-write"
```

---

### Task 9: Update handleComment for batch comment_cache insert

**Files:**
- Modify: `supabase/functions/clickup-webhook/handlers/handleComment.ts`

- [ ] **Step 1: Replace sequential upserts with batch insert**

```typescript
// Inside handleComment, replace per-member upsert loop:

// Build batch of rows — one per active org member
const rows = orgCtx.members.map((member) => ({
  clickup_comment_id: commentId,
  task_id: taskId,
  profile_id: member.profileId,
  comment_text: rawCommentText,
  display_text: cleanCommentText,
  author_id: authorId,
  author_name: authorName,
  author_email: authorEmail,
  author_avatar: authorAvatar,
  clickup_created_at: createdAt,
  is_from_portal: false,
  last_synced: new Date().toISOString(),
}));

// Single round-trip instead of N sequential upserts
const { error: commentError } = await supabase
  .from("comment_cache")
  .upsert(rows, { onConflict: "clickup_comment_id,profile_id" });

if (commentError) {
  log.error("batch comment_cache upsert failed", { error: commentError.message });
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/clickup-webhook/handlers/handleComment.ts
git commit -m "perf(webhook): batch comment_cache insert (single round-trip per event)"
```

---

### Task 10: Implement role-based notification routing

**Files:**
- Create: `supabase/functions/clickup-webhook/handlers/routeNotifications.ts`

- [ ] **Step 1: Write routeNotifications with full matrix**

```typescript
// supabase/functions/clickup-webhook/handlers/routeNotifications.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import type { OrgContext, OrgMemberRow } from "./resolveRecipients.ts";

export type NotificationEventType =
  | "task_created"
  | "awaiting_approval"
  | "credits_approved"
  | "client_review"
  | "completed"
  | "team_comment";

export async function routeNotifications(
  eventType: NotificationEventType,
  taskId: string,
  taskName: string,
  taskCreatorProfileId: string | null,
  orgCtx: OrgContext,
  supabase: SupabaseClient,
  log: any
): Promise<void> {
  const admins = orgCtx.members.filter((m) => m.role === "admin");
  const creator = taskCreatorProfileId
    ? orgCtx.members.find((m) => m.profileId === taskCreatorProfileId) ?? null
    : null;

  // Notification matrix from spec:
  // task_created:       admins → bell
  // awaiting_approval:  admins → email+bell, creator → bell
  // credits_approved:   creator → email+bell
  // client_review:      admins → email+bell, creator → bell
  // completed:          admins → email+bell, creator → email+bell
  // team_comment:       admins → bell, creator → bell

  const bellRecipients: OrgMemberRow[] = [];
  const emailRecipients: OrgMemberRow[] = [];

  switch (eventType) {
    case "task_created":
      bellRecipients.push(...admins);
      break;
    case "awaiting_approval":
      emailRecipients.push(...admins);
      bellRecipients.push(...admins);
      if (creator) bellRecipients.push(creator);
      break;
    case "credits_approved":
      if (creator) { emailRecipients.push(creator); bellRecipients.push(creator); }
      break;
    case "client_review":
      emailRecipients.push(...admins);
      bellRecipients.push(...admins);
      if (creator) bellRecipients.push(creator);
      break;
    case "completed":
      emailRecipients.push(...admins);
      bellRecipients.push(...admins);
      if (creator) { emailRecipients.push(creator); bellRecipients.push(creator); }
      break;
    case "team_comment":
      bellRecipients.push(...admins);
      if (creator) bellRecipients.push(creator);
      break;
  }

  // Deduplicate by profileId
  const uniqueBell = [...new Map(bellRecipients.map((m) => [m.profileId, m])).values()];
  const uniqueEmail = [...new Map(emailRecipients.map((m) => [m.profileId, m])).values()];

  // Insert bell notifications
  if (uniqueBell.length > 0) {
    const notifRows = uniqueBell.map((m) => ({
      profile_id: m.profileId,
      type: "status_change",
      title: taskName,
      message: `Status: ${eventType}`,
      task_id: taskId,
    }));
    const { error } = await supabase.from("notifications").insert(notifRows);
    if (error) log.error("notification insert failed", { error: error.message });
  }

  // TODO Task 10b: trigger Mailjet emails for uniqueEmail recipients
  // (use existing email trigger pattern from current clickup-webhook)
}
```

- [ ] **Step 2: Wire routeNotifications into handleStatusChange**

In `handleStatusChange.ts`, after task_cache upsert, determine the event type from status transition and call `routeNotifications(...)`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/clickup-webhook/handlers/routeNotifications.ts
git add supabase/functions/clickup-webhook/handlers/handleStatusChange.ts
git commit -m "feat(webhook): role-based notification routing by org member role"
```

---

### Task 11: Create accept-org-invite Edge Function

**Files:**
- Create: `supabase/functions/accept-org-invite/index.ts`

- [ ] **Step 1: Write Edge Function**

```typescript
// supabase/functions/accept-org-invite/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Authenticate caller
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const { data: { user }, error: userError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (userError || !user) return new Response("Unauthorized", { status: 401 });

  // Find pending invite matching this user's email
  const { data: invite, error: inviteError } = await supabase
    .from("org_members")
    .select("id, organization_id")
    .eq("invite_email", user.email)
    .eq("status", "pending")
    .is("accepted_at", null)
    .maybeSingle();

  if (inviteError || !invite) {
    return new Response(
      JSON.stringify({ error: "Einladung nicht gefunden oder bereits akzeptiert" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  // Activate membership
  const { error: updateError } = await supabase
    .from("org_members")
    .update({
      status: "active",
      accepted_at: new Date().toISOString(),
      profile_id: user.id,
    })
    .eq("id", invite.id);

  if (updateError) {
    return new Response(
      JSON.stringify({ error: "Aktivierung fehlgeschlagen" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Update profiles.organization_id fast-lookup
  await supabase
    .from("profiles")
    .update({ organization_id: invite.organization_id })
    .eq("id", user.id);

  return new Response(
    JSON.stringify({ success: true, organization_id: invite.organization_id }),
    { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
  );
});
```

- [ ] **Step 2: Register in main router**

In `supabase/functions/main/index.ts`, add the route for `accept-org-invite` following the existing pattern (copy how other functions are registered).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/accept-org-invite/
git commit -m "feat(edge): accept-org-invite — activate pending membership after auth"
```

---

### Task 12: Update fetch-clickup-tasks

**Files:**
- Modify: `supabase/functions/fetch-clickup-tasks/index.ts`

- [ ] **Step 1: Replace profile-based list_ids lookup with org lookup**

Find where the function reads `clickup_list_ids` from profiles. Replace:

```typescript
// OLD
const { data: profile } = await supabase
  .from("profiles")
  .select("clickup_list_ids")
  .eq("id", userId)
  .single();
const listIds = profile?.clickup_list_ids ?? [];

// NEW
const { data: orgMember } = await supabase
  .from("org_members")
  .select("organization_id, organizations(clickup_list_ids)")
  .eq("profile_id", userId)
  .eq("status", "active")
  .maybeSingle();

const org = orgMember?.organizations as { clickup_list_ids: string[] } | null;
const listIds: string[] = org?.clickup_list_ids ?? [];
const organizationId: string | null = orgMember?.organization_id ?? null;
```

- [ ] **Step 2: Update task_cache upsert to use organization_id**

```typescript
// In task_cache upsert:
await supabase.from("task_cache").upsert({
  clickup_id: task.id,
  organization_id: organizationId,   // org-level
  profile_id: userId,                // dual-write
  // ...other fields
}, { onConflict: "clickup_id,organization_id" });
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/fetch-clickup-tasks/index.ts
git commit -m "feat(edge): fetch-clickup-tasks reads list_ids from organizations"
```

---

### Task 13: Update create-clickup-task + update-task-status + nextcloud-files + send-support-message

**Files:**
- Modify: `supabase/functions/create-clickup-task/index.ts`
- Modify: `supabase/functions/update-task-status/index.ts`
- Modify: `supabase/functions/nextcloud-files/index.ts`
- Modify: `supabase/functions/send-support-message/index.ts`

- [ ] **Step 1: create-clickup-task — read list_id + role check from org**

Find where `clickup_list_ids` is read from profile. Replace with org lookup. Add viewer role check:

```typescript
const { data: orgMember } = await supabase
  .from("org_members")
  .select("role, organization_id, organizations(clickup_list_ids, clickup_chat_channel_id)")
  .eq("profile_id", userId)
  .eq("status", "active")
  .maybeSingle();

if (orgMember?.role === "viewer") {
  return new Response(
    JSON.stringify({ error: "Viewer-Rolle kann keine Aufgaben erstellen" }),
    { status: 403 }
  );
}

const org = orgMember?.organizations as {
  clickup_list_ids: string[];
  clickup_chat_channel_id: string | null;
} | null;
const defaultListId = org?.clickup_list_ids?.[0];
```

- [ ] **Step 2: update-task-status — role check for credit approval**

After resolving the user, add:

```typescript
const { data: orgMember } = await supabase
  .from("org_members")
  .select("role")
  .eq("profile_id", userId)
  .eq("status", "active")
  .maybeSingle();

const userRole = orgMember?.role;

// AWAITING APPROVAL → TO DO requires admin role
if (newStatus === "to do" && currentStatus?.toLowerCase() === "awaiting approval") {
  if (userRole !== "admin") {
    return new Response(
      JSON.stringify({ error: "Nur Administratoren können Credits freigeben" }),
      { status: 403 }
    );
  }
}
```

- [ ] **Step 3: nextcloud-files — read nextcloud_client_root from org**

```typescript
const { data: orgMember } = await supabase
  .from("org_members")
  .select("organizations(nextcloud_client_root)")
  .eq("profile_id", userId)
  .eq("status", "active")
  .maybeSingle();

const clientRoot = (orgMember?.organizations as { nextcloud_client_root: string | null })?.nextcloud_client_root;
```

- [ ] **Step 4: send-support-message — read support_task_id from org**

```typescript
const { data: orgMember } = await supabase
  .from("org_members")
  .select("organizations(support_task_id)")
  .eq("profile_id", userId)
  .eq("status", "active")
  .maybeSingle();

const supportTaskId = (orgMember?.organizations as { support_task_id: string | null })?.support_task_id;
```

- [ ] **Step 5: Commit all 4 edge function updates**

```bash
git add supabase/functions/create-clickup-task/index.ts
git add supabase/functions/update-task-status/index.ts
git add supabase/functions/nextcloud-files/index.ts
git add supabase/functions/send-support-message/index.ts
git commit -m "feat(edge): all edge functions read from organizations (dual-write active)"
```

---

### Task 14: Run Phase 2 RLS test suite + remove old profile_id policies

**Files:**
- (no new files — run `supabase/migrations/20260331_rls_tests.sql`)

- [ ] **Step 1: Run RLS test suite in SQL Editor**

Open `supabase/migrations/20260331_rls_tests.sql`. Replace UUID placeholders. Run. All 4 tests must show PASS.

- [ ] **Step 2: If all PASS — remove old profile_id-based RLS policies**

```sql
-- Remove old profile_id policies now that org policies are active
DROP POLICY IF EXISTS "task_cache_profile_read" ON task_cache;
DROP POLICY IF EXISTS "credit_packages_profile_read" ON credit_packages;
DROP POLICY IF EXISTS "client_workspaces_profile_read" ON client_workspaces;
DROP POLICY IF EXISTS "support_messages_profile_read" ON support_messages;
-- Note: check actual policy names in Supabase → Authentication → Policies
```

- [ ] **Step 3: Commit policy cleanup**

```bash
git add supabase/migrations/20260331000005_remove_old_rls_policies.sql
git commit -m "feat(db): remove profile_id RLS policies, org-level policies now primary"
```

---

## Phase 3 — Frontend

### Task 15: Add Organization and OrgMember types

**Files:**
- Modify: `src/shared/types/common.ts`

- [ ] **Step 1: Add types**

```typescript
// Add to src/shared/types/common.ts

export interface Organization {
  id: string
  name: string
  slug: string
  clickup_list_ids: string[]
  nextcloud_client_root: string | null
  support_task_id: string | null
  clickup_chat_channel_id: string | null
  agency_id: string | null
  created_at: string
  updated_at: string
}

export interface OrgMember {
  id: string
  organization_id: string
  profile_id: string | null
  role: 'admin' | 'member' | 'viewer'
  status: 'active' | 'pending' | 'suspended'
  invited_by: string | null
  invited_at: string
  accepted_at: string | null
  invite_email: string | null
  created_at: string
}

export type OrgRole = 'admin' | 'member' | 'viewer'
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/types/common.ts
git commit -m "feat(types): add Organization, OrgMember, OrgRole types"
```

---

### Task 16: Create useOrganization hook

**Files:**
- Create: `src/shared/hooks/useOrganization.ts`

- [ ] **Step 1: Write hook**

```typescript
// src/shared/hooks/useOrganization.ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useAuth } from '@/shared/hooks/useAuth'
import type { Organization, OrgRole } from '@/shared/types/common'

interface OrgQueryResult {
  organization: Organization
  orgRole: OrgRole
}

async function fetchOrgContext(userId: string): Promise<OrgQueryResult | null> {
  const { data, error } = await supabase
    .from('org_members')
    .select('role, status, organizations(*)')
    .eq('profile_id', userId)
    .eq('status', 'active')
    .maybeSingle()

  if (error || !data) return null

  return {
    organization: data.organizations as unknown as Organization,
    orgRole: data.role as OrgRole,
  }
}

export interface OrgContext {
  organization: Organization | null
  orgRole: OrgRole | null
  orgId: string | null
  isAdmin: boolean
  isMember: boolean
  isViewer: boolean
  canCreateTasks: boolean
  isLoading: boolean
  error: Error | null
}

export function useOrganization(): OrgContext {
  const { user } = useAuth()

  const { data, isLoading, error } = useQuery<OrgQueryResult | null, Error>({
    queryKey: ['organization', user?.id],
    queryFn: () => fetchOrgContext(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    retry: 2,
  })

  const orgRole = data?.orgRole ?? null

  return {
    organization: data?.organization ?? null,
    orgRole,
    orgId: data?.organization?.id ?? null,
    isAdmin: orgRole === 'admin',
    isMember: orgRole === 'member',
    isViewer: orgRole === 'viewer',
    canCreateTasks: orgRole === 'admin' || orgRole === 'member',
    isLoading,
    error: error ?? null,
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/hooks/useOrganization.ts
git commit -m "feat(hooks): useOrganization — separate hook for org context and role"
```

---

### Task 17: Update useClickUpTasks + useSingleTask to filter by organization_id

**Files:**
- Modify: `src/modules/tickets/hooks/useClickUpTasks.ts`
- Modify: `src/modules/tickets/hooks/useSingleTask.ts`

- [ ] **Step 1: Update fetchCachedTasks in useClickUpTasks.ts**

```typescript
// Add orgId parameter
async function fetchCachedTasks(orgId: string): Promise<ClickUpTask[]> {
  const { data, error } = await supabase
    .from('task_cache')
    .select('*')
    .eq('organization_id', orgId)   // was: .eq('profile_id', user.id)
    .eq('is_visible', true)
    .order('last_activity_at', { ascending: false })

  if (error) {
    log.error('Failed to fetch cached tasks', { error: error.message })
    return []
  }

  return (data || []).map((row) => transformCachedTask(row as CachedTask))
}
```

Update the `useClickUpTasks` hook to call `useOrganization()` and pass `orgId`:
```typescript
export function useClickUpTasks() {
  const { orgId } = useOrganization()

  const cachedQuery = useQuery({
    queryKey: ['tasks', 'org', orgId],
    queryFn: () => fetchCachedTasks(orgId!),
    enabled: !!orgId,
    staleTime: 30_000,
  })
  // ...rest of hook
}
```

Update Realtime subscription:
```typescript
// was: .eq('profile_id', userId)
channel.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'task_cache',
  filter: `organization_id=eq.${orgId}`,
}, handleChange)
```

- [ ] **Step 2: Update useSingleTask.ts similarly**

```typescript
// Replace profile_id filter with organization_id
.eq('organization_id', orgId)
```

- [ ] **Step 3: Update Sidebar.tsx needsAttentionCount**

```typescript
// In useNeedsAttentionCount, replace profile_id with organization_id
.eq('organization_id', orgId)
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/tickets/hooks/useClickUpTasks.ts
git add src/modules/tickets/hooks/useSingleTask.ts
git add src/shared/components/layout/Sidebar.tsx
git commit -m "feat(hooks): filter task_cache + sidebar by organization_id"
```

---

### Task 18: Role-gate action buttons

**Files:**
- Modify: task action components (check `src/modules/tickets/components/TaskActions.tsx` or `TaskDetail.tsx`)

- [ ] **Step 1: Find where Akzeptieren/Freigeben buttons are rendered**

```bash
grep -r "Akzeptieren\|Freigeben\|awaiting_approval\|AWAITING" src/ --include="*.tsx" -l
```

- [ ] **Step 2: Add role gates**

In the component(s) found above, import `useOrganization` and add:

```typescript
import { useOrganization } from '@/shared/hooks/useOrganization'

// Inside component:
const { isAdmin, canCreateTasks } = useOrganization()

// Kostenfreigabe (AWAITING APPROVAL) actions — admin only
{isAdmin && (
  <Button onClick={handleAcceptCredits}>Akzeptieren</Button>
)}
{isAdmin && (
  <Button variant="ghost" onClick={handleRejectCredits}>Ablehnen</Button>
)}

// Client Review (CLIENT REVIEW) actions — admin only
{isAdmin && (
  <Button onClick={handleApproveDeliverable}>Freigeben</Button>
)}
{isAdmin && (
  <Button variant="ghost" onClick={handleRequestChanges}>Änderungen anfordern</Button>
)}
```

- [ ] **Step 3: Gate NewTaskButton**

Find where `NewTaskButton` is rendered (likely in `TicketsPage.tsx`):

```typescript
const { canCreateTasks } = useOrganization()

{canCreateTasks && <NewTaskButton />}
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/tickets/
git commit -m "feat(ui): role-gate Akzeptieren/Freigeben buttons + NewTaskButton"
```

---

### Task 19: Create /organisation page

**Files:**
- Create: `src/modules/organisation/pages/OrganisationPage.tsx`
- Create: `src/modules/organisation/components/OrgInfoSection.tsx`
- Create: `src/modules/organisation/components/TeamSection.tsx`

- [ ] **Step 1: OrgInfoSection**

```typescript
// src/modules/organisation/components/OrgInfoSection.tsx
import { useOrganization } from '@/shared/hooks/useOrganization'

export function OrgInfoSection() {
  const { organization } = useOrganization()
  if (!organization) return null

  return (
    <div className="mb-8 p-6 rounded-xl border border-border bg-card">
      <h2 className="text-lg font-semibold mb-4">Organisation</h2>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Name</span>
          <p className="font-medium">{organization.name}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Slug</span>
          <p className="font-medium font-mono">{organization.slug}</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TeamSection with member table**

```typescript
// src/modules/organisation/components/TeamSection.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useOrganization } from '@/shared/hooks/useOrganization'
import { useAuth } from '@/shared/hooks/useAuth'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import type { OrgMember } from '@/shared/types/common'

export function TeamSection() {
  const { orgId } = useOrganization()
  const { user } = useAuth()
  const qc = useQueryClient()

  const { data: members = [] } = useQuery({
    queryKey: ['org-members', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('org_members')
        .select('*, profiles(full_name, email, avatar_url)')
        .eq('organization_id', orgId!)
        .order('created_at')
      return (data ?? []) as (OrgMember & { profiles: { full_name: string | null; email: string; avatar_url: string | null } })[]
    },
    enabled: !!orgId,
  })

  const changeRole = useMutation({
    mutationFn: async ({ memberId, newRole }: { memberId: string; newRole: 'member' | 'viewer' }) => {
      const { error } = await supabase
        .from('org_members')
        .update({ role: newRole })
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] })
      toast.success('Rolle geändert')
    },
    onError: () => toast.error('Fehler beim Ändern der Rolle'),
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('org_members')
        .delete()
        .eq('id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] })
      toast.success('Mitglied entfernt')
    },
    onError: () => toast.error('Fehler beim Entfernen'),
  })

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-4">Team</h2>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Name</th>
              <th className="text-left p-3 font-medium">E-Mail</th>
              <th className="text-left p-3 font-medium">Rolle</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-3">{m.profiles?.full_name ?? '—'}</td>
                <td className="p-3 text-muted-foreground">{m.profiles?.email ?? m.invite_email}</td>
                <td className="p-3">
                  <Badge variant={m.role === 'admin' ? 'default' : 'secondary'}>{m.role}</Badge>
                </td>
                <td className="p-3">
                  <Badge variant={m.status === 'active' ? 'default' : 'outline'}>{m.status}</Badge>
                </td>
                <td className="p-3 text-right">
                  {m.profile_id !== user?.id && m.role !== 'admin' && (
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => changeRole.mutate({
                          memberId: m.id,
                          newRole: m.role === 'member' ? 'viewer' : 'member'
                        })}
                      >
                        {m.role === 'member' ? 'zu Viewer' : 'zu Member'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        onClick={() => removeMember.mutate(m.id)}
                      >
                        Entfernen
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: OrganisationPage**

```typescript
// src/modules/organisation/pages/OrganisationPage.tsx
import { Navigate } from 'react-router-dom'
import { ContentContainer } from '@/shared/components/layout/ContentContainer'
import { useOrganization } from '@/shared/hooks/useOrganization'
import { OrgInfoSection } from '../components/OrgInfoSection'
import { TeamSection } from '../components/TeamSection'

export function OrganisationPage() {
  const { isAdmin, isLoading } = useOrganization()

  if (isLoading) return null
  if (!isAdmin) return <Navigate to="/inbox" replace />

  return (
    <ContentContainer width="narrow">
      <h1 className="text-2xl font-semibold mb-6">Meine Organisation</h1>
      <OrgInfoSection />
      <TeamSection />
    </ContentContainer>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/organisation/
git commit -m "feat(ui): /organisation page with OrgInfoSection + TeamSection"
```

---

### Task 20: Add route + sidebar link

**Files:**
- Modify: `src/app/routes.tsx`
- Modify: `src/shared/components/layout/SidebarUtilities.tsx`

- [ ] **Step 1: Add lazy import and route**

In `src/app/routes.tsx`:

```typescript
// Add lazy import at top with other lazy imports:
const OrganisationPage = lazy(() =>
  import('@/modules/organisation/pages/OrganisationPage').then(m => ({ default: m.OrganisationPage }))
)

// Add route inside ProtectedRoute <Route>:
<Route path="/organisation" element={withRouteLoading(<OrganisationPage />)} />
```

- [ ] **Step 2: Add sidebar link (admin only)**

In `src/shared/components/layout/SidebarUtilities.tsx`:

```typescript
import { useOrganization } from '@/shared/hooks/useOrganization'
import { Building04Icon } from '@hugeicons/core-free-icons'

// Inside SidebarUtilities component (add props: expanded, onNavigate are already there)
const { isAdmin } = useOrganization()

// Add before the Hilfe link:
{isAdmin && (
  <NavLink
    to="/organisation"
    onClick={onNavigate}
    className={({ isActive }) => cn(
      'flex items-center h-10 px-3.5 mx-1.5 rounded-[8px] transition-colors',
      'text-text-sidebar hover:bg-sidebar-hover hover:text-white',
      isActive && 'bg-sidebar-active text-white'
    )}
  >
    <HugeiconsIcon icon={Building04Icon} size={20} className="shrink-0" />
    {expanded && (
      <span className="ml-3 text-sm font-medium whitespace-nowrap overflow-hidden">
        Meine Organisation
      </span>
    )}
  </NavLink>
)}
```

- [ ] **Step 3: Build check**

```bash
npm run build
```
Expected: no TypeScript errors, no import errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/routes.tsx src/shared/components/layout/SidebarUtilities.tsx
git commit -m "feat(routing): add /organisation route + admin-only sidebar link"
```

---

## Phase 4 — Invite Flow + Cleanup

### Task 21: Create invite-org-member Edge Function

**Files:**
- Create: `supabase/functions/invite-org-member/index.ts`

- [ ] **Step 1: Write Edge Function**

```typescript
// supabase/functions/invite-org-member/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.47.10";
import { getCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Verify caller is an admin of the org
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });

  const { data: { user }, error: userError } = await supabase.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (userError || !user) return new Response("Unauthorized", { status: 401 });

  const { email, role, organization_id } = await req.json();
  if (!email || !role || !organization_id) {
    return new Response(JSON.stringify({ error: "Missing fields" }), { status: 400 });
  }

  // Verify caller is admin of this org
  const { data: callerMember } = await supabase
    .from("org_members")
    .select("role")
    .eq("profile_id", user.id)
    .eq("organization_id", organization_id)
    .eq("status", "active")
    .maybeSingle();

  if (callerMember?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Nur Administratoren können einladen" }), { status: 403 });
  }

  // Create Supabase auth user (no email sent by GoTrue — we send via Mailjet)
  const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
    email,
    email_confirm: false, // confirm via invite flow
    user_metadata: { invited_to_org: organization_id },
  });

  if (createError && createError.message !== "User already registered") {
    return new Response(JSON.stringify({ error: createError.message }), { status: 500 });
  }

  // Create pending org_members row
  const { error: memberError } = await supabase.from("org_members").insert({
    organization_id,
    role,
    status: "pending",
    invite_email: email,
    invited_by: user.id,
    invited_at: new Date().toISOString(),
  });

  if (memberError) {
    return new Response(JSON.stringify({ error: memberError.message }), { status: 500 });
  }

  // Generate magic link for the invite
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${Deno.env.get("SITE_URL")}/accept-invite` },
  });

  if (linkError || !linkData.properties?.action_link) {
    return new Response(JSON.stringify({ error: "Link generation failed" }), { status: 500 });
  }

  // Send invite email via Mailjet
  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", organization_id)
    .single();

  await supabase.functions.invoke("send-mailjet-email", {
    body: {
      to: email,
      subject: `Einladung zu ${org?.name ?? "Portal"}`,
      htmlContent: `
        <p>Sie wurden eingeladen, dem Portal-Konto von <strong>${org?.name}</strong> beizutreten.</p>
        <p><a href="${linkData.properties.action_link}">Einladung annehmen</a></p>
      `,
    },
  });

  return new Response(
    JSON.stringify({ success: true }),
    { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
  );
});
```

- [ ] **Step 2: Register in main router**

Add `invite-org-member` route to `supabase/functions/main/index.ts` following existing pattern.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/invite-org-member/
git commit -m "feat(edge): invite-org-member — createUser + pending org_members + Mailjet"
```

---

### Task 22: InviteMemberDialog + ProjectAccessSection

**Files:**
- Create: `src/modules/organisation/components/InviteMemberDialog.tsx`
- Create: `src/modules/organisation/components/ProjectAccessSection.tsx`
- Modify: `src/modules/organisation/pages/OrganisationPage.tsx`

- [ ] **Step 1: InviteMemberDialog**

```typescript
// src/modules/organisation/components/InviteMemberDialog.tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useOrganization } from '@/shared/hooks/useOrganization'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'

export function InviteMemberDialog() {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'viewer'>('member')
  const { orgId } = useOrganization()
  const qc = useQueryClient()

  const invite = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('invite-org-member', {
        body: { email, role, organization_id: orgId },
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-members', orgId] })
      toast.success(`Einladung an ${email} gesendet`)
      setEmail('')
    },
    onError: () => toast.error('Einladung fehlgeschlagen. Bitte erneut versuchen.'),
  })

  return (
    <div className="p-6 rounded-xl border border-border bg-card mb-8">
      <h2 className="text-lg font-semibold mb-4">Mitglied einladen</h2>
      <div className="flex gap-3 items-end">
        <div className="flex-1">
          <label className="text-sm text-muted-foreground mb-1 block">E-Mail</label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@unternehmen.at"
          />
        </div>
        <div>
          <label className="text-sm text-muted-foreground mb-1 block">Rolle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as 'member' | 'viewer')}
            className="h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <Button
          onClick={() => invite.mutate()}
          disabled={!email || invite.isPending}
        >
          {invite.isPending ? 'Wird gesendet...' : 'Einladen'}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: ProjectAccessSection**

```typescript
// src/modules/organisation/components/ProjectAccessSection.tsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/shared/lib/supabase'
import { useOrganization } from '@/shared/hooks/useOrganization'
import { toast } from 'sonner'

export function ProjectAccessSection() {
  const { orgId } = useOrganization()
  const qc = useQueryClient()

  const { data: members = [] } = useQuery({
    queryKey: ['org-members-active', orgId],
    queryFn: async () => {
      const { data } = await supabase
        .from('org_members')
        .select('id, profile_id, role, profiles(full_name, email)')
        .eq('organization_id', orgId!)
        .eq('status', 'active')
      return data ?? []
    },
    enabled: !!orgId,
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['project-configs'],
    queryFn: async () => {
      const { data } = await supabase
        .from('project_config')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      return data ?? []
    },
  })

  const { data: access = [] } = useQuery({
    queryKey: ['project-access-org', orgId],
    queryFn: async () => {
      const profileIds = members.map(m => m.profile_id).filter(Boolean)
      if (!profileIds.length) return []
      const { data } = await supabase
        .from('project_access')
        .select('profile_id, project_config_id')
        .in('profile_id', profileIds)
      return data ?? []
    },
    enabled: members.length > 0,
  })

  const hasAccess = (profileId: string, projectId: string) =>
    access.some(a => a.profile_id === profileId && a.project_config_id === projectId)

  const toggleAccess = useMutation({
    mutationFn: async ({ profileId, projectId, grant }: { profileId: string; projectId: string; grant: boolean }) => {
      if (grant) {
        const { error } = await supabase.from('project_access').insert({ profile_id: profileId, project_config_id: projectId })
        if (error) throw error
      } else {
        const { error } = await supabase.from('project_access').delete()
          .eq('profile_id', profileId).eq('project_config_id', projectId)
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-access-org', orgId] }),
    onError: () => toast.error('Fehler beim Ändern des Zugriffs'),
  })

  if (!projects.length || !members.length) return null

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold mb-4">Projektzugang</h2>
      <div className="rounded-xl border border-border overflow-x-auto">
        <table className="text-sm w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Mitglied</th>
              {projects.map(p => (
                <th key={p.id} className="text-center p-3 font-medium">{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.filter(m => m.profile_id && m.role !== 'admin').map(m => (
              <tr key={m.id} className="border-t border-border">
                <td className="p-3">{(m.profiles as any)?.full_name ?? (m.profiles as any)?.email}</td>
                {projects.map(p => (
                  <td key={p.id} className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={hasAccess(m.profile_id!, p.id)}
                      onChange={(e) => toggleAccess.mutate({
                        profileId: m.profile_id!,
                        projectId: p.id,
                        grant: e.target.checked,
                      })}
                      className="h-4 w-4"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add both to OrganisationPage**

```typescript
// Update OrganisationPage.tsx to include all sections:
import { InviteMemberDialog } from '../components/InviteMemberDialog'
import { ProjectAccessSection } from '../components/ProjectAccessSection'

// In JSX after TeamSection:
<InviteMemberDialog />
<ProjectAccessSection />
```

- [ ] **Step 4: Build check + commit**

```bash
npm run build
git add src/modules/organisation/
git commit -m "feat(ui): InviteMemberDialog + ProjectAccessSection on /organisation page"
```

---

### Task 23: Drop dual-write — make organization_id NOT NULL

**Files:**
- Create: `supabase/migrations/20260331000010_drop_dual_write.sql`

Only run after Phase 3 is stable in production and verified with the RLS test suite.

- [ ] **Step 1: Run RLS test suite one final time**

Run `supabase/migrations/20260331_rls_tests.sql` in SQL Editor. All 4 tests must PASS.

- [ ] **Step 2: Write cleanup migration**

```sql
-- supabase/migrations/20260331000010_drop_dual_write.sql
-- ONLY run after Phase 3 is verified stable in production

-- 1. Drop old unique constraints
ALTER TABLE task_cache DROP CONSTRAINT IF EXISTS task_cache_clickup_id_profile_id_key;

-- 2. Add new org-level unique constraint on task_cache
ALTER TABLE task_cache ADD CONSTRAINT task_cache_clickup_id_org_key
  UNIQUE(clickup_id, organization_id);

-- 3. Make organization_id NOT NULL where data is complete
ALTER TABLE task_cache ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE credit_packages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE client_workspaces ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE support_messages ALTER COLUMN organization_id SET NOT NULL;

-- 4. Remove org-specific fields from profiles (now in organizations)
-- Do NOT remove profile_id from tables — kept as audit trail
ALTER TABLE profiles DROP COLUMN IF EXISTS clickup_list_ids;
ALTER TABLE profiles DROP COLUMN IF EXISTS nextcloud_client_root;
ALTER TABLE profiles DROP COLUMN IF EXISTS support_task_id;
ALTER TABLE profiles DROP COLUMN IF EXISTS clickup_chat_channel_id;
```

- [ ] **Step 3: Apply and verify**

Run in SQL Editor. Then verify:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name IN ('clickup_list_ids', 'nextcloud_client_root');
-- Expected: 0 rows
```

- [ ] **Step 4: Update Profile type in common.ts**

Remove the dropped fields from the `Profile` interface:

```typescript
export interface Profile {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  organization_id: string | null  // fast-lookup FK
  email_notifications: boolean
  notification_preferences: NotificationPreferences | null
  avatar_url: string | null
  // clickup_list_ids REMOVED
  // support_task_id REMOVED
  // clickup_chat_channel_id REMOVED
  // nextcloud_client_root REMOVED
}
```

- [ ] **Step 5: Final build check + commit**

```bash
npm run build
git add supabase/migrations/20260331000010_drop_dual_write.sql src/shared/types/common.ts
git commit -m "feat(db): drop dual-write — organization_id NOT NULL, remove migrated profile fields"
```

---

## Done

All 4 phases complete. Organizations feature is live:
- Every client company is an `organization` with shared credits, tasks, and workspaces
- Admin/member/viewer roles control what each person can do
- Invite flow: admin invites via email → magic link → `accept-org-invite` activates membership
- `/organisation` page: org info, team management, project access grid
- Sidebar: "Meine Organisation" link visible only to admins
