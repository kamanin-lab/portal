# Architecture: Adding Organisation Layer to KAMANIN Client Portal

**Project:** KAMANIN Client Portal v2.0 — Organisations Milestone
**Researched:** 2026-04-14
**Mode:** Feasibility + Architecture
**Confidence:** HIGH (based on direct codebase and schema analysis)

---

## Summary

The portal currently scopes all data by `profile_id` (one user = one company). The migration introduces an `organizations` table and `org_members` junction table, moves shared company resources (credits, workspaces, ClickUp config, Nextcloud root) to the organisation level, and keeps personal state (task_cache, comment_cache, notifications, read_receipts) per-user.

The migration is safe to do zero-downtime because every schema step is additive first — new columns are nullable, old columns remain — and the cutover is a RLS policy swap, not a data drop. The migration creates no read-path breakage as long as Edge Functions are updated in the same deploy window as the RLS swap.

Two tables require special care:

- `support_messages` (not covered in the milestone scope doc, but has `profile_id` and routes the support chat) — this must align with the org-level `support_task_id` move.
- `project_access` — currently `profile_id`-scoped; the milestone doc does not list it for migration, but org members will need access to the same projects. This needs a decision (migrate to `organization_id` or keep per-user and populate for each org member during invite).

The overall build order is: DB foundation → RLS swap → Edge Functions → frontend auth context → frontend UI → onboarding script.

---

## Migration Sequence (Zero-Downtime)

### Principle

Never drop an old column or old RLS policy until the new one is live and validated. Every step below leaves the app in a working state.

### Step 1 — Additive Schema (no downtime, no deploy needed)

Execute as raw SQL on production Supabase. The frontend and Edge Functions continue using old columns — nothing breaks.

```sql
-- 1a. New tables
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  clickup_list_ids jsonb DEFAULT '[]',
  nextcloud_client_root text,
  support_task_id text,
  clickup_chat_channel_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin', 'member', 'viewer')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(organization_id, profile_id)
);

-- 1b. RLS helper (SECURITY DEFINER — result not cached per-row, safe for policies)
CREATE OR REPLACE FUNCTION user_org_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id FROM org_members WHERE profile_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 1c. Nullable org reference on profiles (for quick lookup, not enforced yet)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE SET NULL;

-- 1d. Nullable org columns on tables being migrated (old profile_id stays)
ALTER TABLE credit_packages ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id);
ALTER TABLE client_workspaces ADD COLUMN IF NOT EXISTS organization_id uuid
  REFERENCES organizations(id) ON DELETE CASCADE;
```

### Step 2 — Data Migration (populate new columns from existing data)

Each existing profile becomes a single-member organisation (admin role). Run as a migration script or SQL — idempotent with `ON CONFLICT DO NOTHING`.

```sql
-- 2a. Create one org per existing profile
INSERT INTO organizations (id, name, slug, clickup_list_ids,
  nextcloud_client_root, support_task_id, clickup_chat_channel_id)
SELECT
  gen_random_uuid(),
  COALESCE(p.company_name, p.full_name, p.email),
  LOWER(REGEXP_REPLACE(COALESCE(p.company_name, split_part(p.email,'@',1)), '[^a-z0-9]', '-', 'g')),
  p.clickup_list_ids,
  p.nextcloud_client_root,
  p.support_task_id,
  p.clickup_chat_channel_id
FROM profiles p
ON CONFLICT (slug) DO NOTHING;

-- 2b. Create org_members row (admin) for each profile
-- Relies on slug matching — adjust if needed
INSERT INTO org_members (organization_id, profile_id, role)
SELECT o.id, p.id, 'admin'
FROM profiles p
JOIN organizations o ON o.slug = LOWER(REGEXP_REPLACE(
  COALESCE(p.company_name, split_part(p.email,'@',1)), '[^a-z0-9]', '-', 'g'))
ON CONFLICT (organization_id, profile_id) DO NOTHING;

-- 2c. Backfill profiles.organization_id
UPDATE profiles p
SET organization_id = (
  SELECT om.organization_id FROM org_members om
  WHERE om.profile_id = p.id LIMIT 1
)
WHERE p.organization_id IS NULL;

-- 2d. Backfill credit_packages.organization_id
UPDATE credit_packages cp
SET organization_id = p.organization_id
FROM profiles p WHERE cp.profile_id = p.id
  AND cp.organization_id IS NULL;

-- 2e. Backfill credit_transactions.organization_id
UPDATE credit_transactions ct
SET organization_id = p.organization_id
FROM profiles p WHERE ct.profile_id = p.id
  AND ct.organization_id IS NULL;

-- 2f. Backfill client_workspaces.organization_id
UPDATE client_workspaces cw
SET organization_id = p.organization_id
FROM profiles p WHERE cw.profile_id = p.id
  AND cw.organization_id IS NULL;
```

### Step 3 — NOT NULL constraints + new unique constraints (after backfill verified)

Only run after verifying zero NULLs in the new columns.

```sql
ALTER TABLE credit_packages ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE client_workspaces ALTER COLUMN organization_id SET NOT NULL;
-- credit_transactions.organization_id stays nullable (audit trail for pre-org transactions)

-- New unique constraint: one workspace module per org (replaces per-profile)
ALTER TABLE client_workspaces DROP CONSTRAINT IF EXISTS client_workspaces_profile_id_module_key_key;
ALTER TABLE client_workspaces ADD CONSTRAINT client_workspaces_org_module_key UNIQUE (organization_id, module_key);
```

### Step 4 — New RLS Policies (add alongside old, do not drop old yet)

At this point both old `profile_id` policies and new `organization_id` policies exist simultaneously. The app still works via old policies. New policies are tested first.

```sql
-- credit_packages: org members can read their org's packages
CREATE POLICY "org_members_read_credit_packages" ON credit_packages
  FOR SELECT USING (organization_id IN (SELECT user_org_ids()));

CREATE POLICY "org_members_read_credit_transactions" ON credit_transactions
  FOR SELECT USING (organization_id IN (SELECT user_org_ids()));

CREATE POLICY "org_members_read_client_workspaces" ON client_workspaces
  FOR SELECT USING (organization_id IN (SELECT user_org_ids()));

-- org_members: users can read their own membership rows
CREATE POLICY "self_read_org_members" ON org_members
  FOR SELECT USING (profile_id = auth.uid());

-- organizations: users can read orgs they belong to
CREATE POLICY "org_members_read_organizations" ON organizations
  FOR SELECT USING (id IN (SELECT user_org_ids()));
```

### Step 5 — Deploy Edge Functions (see section below, must happen before Step 6)

Update all Edge Functions to read from `organizations` instead of `profiles` for shared fields. Deploy via volume mount to Coolify. Edge Functions must handle the dual-column period gracefully — if `organizations` row exists, use it; if not (race condition during migration), fall back to `profiles`.

### Step 6 — Remove Old Policies and Columns (cleanup, after validation)

After Edge Functions are deployed and validated in staging:

```sql
-- Drop old profile_id-based policies on migrated tables
DROP POLICY IF EXISTS "Users can read their own credit_packages" ON credit_packages;
DROP POLICY IF EXISTS "Users can read their own client_workspaces" ON client_workspaces;
-- Keep credit_transactions profile_id policy until audit trail decision is made

-- Drop old profile_id FK from migrated tables (after verifying org_id fills all rows)
-- Do NOT drop profile_id from credit_transactions (audit trail)
ALTER TABLE credit_packages DROP COLUMN IF EXISTS profile_id;
ALTER TABLE client_workspaces DROP COLUMN IF EXISTS profile_id;
```

**Do not drop `profiles.clickup_list_ids`, `profiles.nextcloud_client_root`, etc. until Edge Functions are fully migrated and validated.** Keep them for one release cycle as a safety net.

---

## Edge Function Integration Points

Every function that reads org-level config must be updated. Functions that write to `task_cache`, `comment_cache`, `notifications` by `profile_id` remain unchanged — those tables stay per-user.

### fetch-clickup-tasks

**Current:** Reads `clickup_list_ids` from `profiles` for the authenticated user.

**New logic:**
```
1. Auth user → look up profiles.organization_id
2. Query organizations WHERE id = profiles.organization_id
3. Use organizations.clickup_list_ids
4. Upsert into task_cache by profile_id (unchanged)
```

**Why upsert remains per-profile_id:** Task cache is intentionally per-user so future per-user task visibility filters are possible without schema changes.

**Risk:** If multiple org members trigger this simultaneously, each gets their own cache rows — this is correct and expected.

### fetch-single-task

**Current:** Validates task access by checking `profiles.clickup_list_ids` contains the task's `list.id`.

**New logic:** Same check but against `organizations.clickup_list_ids` resolved via the user's `organization_id`.

### clickup-webhook

**Current:** `findProfilesForTask(listId)` queries `profiles WHERE clickup_list_ids @> '[listId]'` to find which users to notify.

**New logic:**
```
1. Find org(s) WHERE clickup_list_ids @> '[listId]'
2. Find all org_members for those orgs
3. Upsert task_cache for each profile_id
4. Create notifications for each profile_id
5. Send email to org members whose notification_preferences allow it
```

**Notification dedup concern:** Multiple org members will now each receive a bell notification and potentially an email on the same event. This is correct behaviour (each user gets their own notification state), but email dedup should be checked. The existing `notification_preferences` table is per-user and already handles this correctly.

**Support message routing:** The webhook writes to `support_messages` using `profile_id`. When the support_task_id moves to org level, the webhook must look up all org members and write a support_message row per member (same pattern as task_cache).

### create-clickup-task

**Current:** Reads `clickup_list_ids` from `profiles` for list selection. Reads `clickup_chat_channel_id` from `profiles` for the ClickUp Chat v3 notification.

**New logic:**
```
1. Resolve org from profiles.organization_id
2. Use organizations.clickup_list_ids for list selection
3. Use organizations.clickup_chat_channel_id for chat notification
```

**Note:** `CLICKUP_WORKSPACE_ID` remains a global env var for now. The ideas doc notes it becomes per-org in future SaaS mode — no change needed for this milestone.

### nextcloud-files

**Current:** Reads `nextcloud_client_root` from `profiles` using the user's JWT.

**New logic:**
```
1. Auth user → profiles.organization_id
2. Query organizations.nextcloud_client_root
```

No other changes needed — the file path logic is unchanged, only the source of the root path moves.

### credit-topup (send-reminders scheduler)

**Current:** Groups `credit_packages` by `profile_id` and tops up per-user balances.

**New logic:**
```
1. Query active credit_packages by organization_id
2. Insert one monthly_topup transaction per organization (not per profile)
3. Amount goes to credit_transactions with organization_id
```

**Balance calculation impact:** `useCredits` hook currently sums `credit_transactions WHERE profile_id = auth.uid()`. After migration, this must sum by `organization_id` — one credit pool for the whole org. This is a frontend hook change (see Frontend section).

### send-reminders

**Current:** Queries `profiles` for users with tasks in "Client Review" status too long, sends per-user emails.

**New logic:**
```
1. Find orgs with tasks overdue in Client Review
2. For each org, find members with matching notification preferences
3. Send one email per member (not per org) — each member opted in/out individually
```

The `last_project_reminder_sent_at` and `last_unread_digest_sent_at` cooldown fields remain on `profiles` (per-user).

---

## New Frontend Components

### Auth Context Extension

**File:** `src/shared/hooks/useAuth.ts` or a new `src/shared/hooks/useOrg.ts`

Extend the auth session to include:
```typescript
interface OrgContext {
  organization: { id: string; name: string; slug: string } | null;
  orgRole: 'admin' | 'member' | 'viewer' | null;
}
```

Fetched once on login via a join: `profiles → org_members → organizations`. Stored in React Context, available to all components. No separate route needed — part of the existing `ProtectedRoute` initialization flow.

**Implementation:** Add to existing `AuthContext` or create `OrgContext` (preferred for separation of concerns). The hook returns `{ org, orgRole, isAdmin, isMember }` convenience booleans.

### useWorkspaces Hook Update

**File:** `src/shared/hooks/useWorkspaces.ts`

Change query from `profile_id = auth.uid()` to `organization_id = org.id`. Since RLS already handles filtering, the Supabase query can remain a simple `select * from client_workspaces` — RLS will return only the org's rows.

### useCredits Hook Update

**File:** (location TBD — likely in `src/modules/tickets/hooks/`)

Change sum query from `WHERE profile_id = auth.uid()` to `WHERE organization_id = $org_id`. The balance is now shared across all org members.

**Implication for UI:** All org members see the same credit balance. The `Kostenfreigabe` approval action (approve credits) is already governed by the `member` role check, which is correct.

### OrganisationPage (new page)

**Route:** `/organisation`
**Access:** Admin only (redirect viewers/members to `/tickets`)
**File:** `src/modules/organisation/pages/OrganisationPage.tsx`

Three sections:

1. **OrgInfoSection** — Displays org name, slug, current credit package (read-only). Uses existing `credit_packages` query scoped to org.

2. **TeamSection** — Table of org members: full_name, email, role badge, created_at. Columns: Name | E-Mail | Rolle | Seit | Aktionen.
   - Role change: inline dropdown (admin → member/viewer, member → viewer, viewer → member). Admin cannot demote themselves.
   - Remove member: confirmation dialog before deleting `org_members` row.

3. **InviteMemberDialog** — Email input + role selector (member/viewer). Creates new auth user via Edge Function or sends magic link. On success, creates `profiles` row + `org_members` row.

### InviteMemberDialog (new component)

**File:** `src/modules/organisation/components/InviteMemberDialog.tsx`

Needs a new Edge Function `invite-org-member` (see below) because user creation requires service role access. The dialog collects: email, full_name (optional), role. On submit, calls the Edge Function. On success, shows a toast with the temporary password or magic link info.

### New Edge Function: invite-org-member

Not listed in the original migration context but required for the invite flow:

```
POST /functions/v1/main (action: 'invite_org_member')
Auth: Bearer token (admin user JWT)
Input: { email, full_name?, role, organization_id }
Logic:
  1. Verify caller is admin of the organization
  2. Create Supabase auth user (service role: supabase.auth.admin.createUser)
  3. Create profiles row
  4. Create org_members row
  5. Send invitation email via Mailjet with temporary password or magic link
Output: { success: true, profile_id }
```

### Sidebar Update

**File:** `src/shared/components/layout/Sidebar.tsx`

Add "Organisation" link in the Utilities zone, visible only when `orgRole === 'admin'`. Use a Hugeicons icon (e.g., `Building07Icon` or similar org/building icon from `@hugeicons/core-free-icons`).

### Role-Based UI Guards

Create a small `useOrgRole` hook (or export from `OrgContext`) with convenience checks:

```typescript
const { canCreateTask, canApproveCredits, canManageOrg } = useOrgRole();
```

Map role to capabilities following the decision matrix:

| Capability | admin | member | viewer |
|---|---|---|---|
| canCreateTask | true | true | false |
| canApproveCredits | true | true | false |
| canManageOrg | true | false | false |
| canManagePackage | true | false | false |

Hide `NewTicketDialog` trigger and Kostenfreigabe button for `viewer` role in JSX. Do not rely solely on frontend guards — RLS and Edge Function checks are the authoritative enforcement layer.

---

## Build Order

### Phase 1: DB Foundation (no app changes, no downtime)

1. Run Step 1 SQL (additive schema: organizations, org_members, user_org_ids(), nullable columns)
2. Run Step 2 SQL (data migration: populate new columns from profiles)
3. Verify zero NULLs in `organization_id` columns on migrated tables
4. Run Step 3 SQL (NOT NULL constraints, new unique constraint)
5. Run Step 4 SQL (add new RLS policies alongside old ones)
6. Validate: existing app still works (old policies still active)

### Phase 2: Backend — Edge Functions

Deploy all Edge Function changes as a single batch (volume mount to Coolify):

1. `fetch-clickup-tasks` — read `clickup_list_ids` from `organizations`
2. `fetch-single-task` — access check via `organizations.clickup_list_ids`
3. `clickup-webhook` — `findProfilesForTask` via `org_members`; support_messages multi-user write
4. `create-clickup-task` — list_ids + chat_channel_id from `organizations`
5. `nextcloud-files` — `nextcloud_client_root` from `organizations`
6. `send-reminders` — per-org credit topup logic; per-member email dispatch
7. Add `invite-org-member` to main router

Validate on staging before production deploy. Use the `feature-organisation` branch Vercel preview + staging DB.

### Phase 3: Frontend — Auth Context + Data Hooks

1. Add `OrgContext` / extend `AuthContext` with org + role data
2. Update `useWorkspaces` to query via `organization_id`
3. Update `useCredits` to sum by `organization_id`
4. Add `useOrgRole` convenience hook
5. Add role-based guards to `NewTicketDialog` and Kostenfreigabe button

Deploy and validate: existing users (now org admins) see identical UI. No feature regressions.

### Phase 4: Frontend — Organisation Page

1. Create `OrganisationPage` route at `/organisation`
2. `OrgInfoSection` component
3. `TeamSection` component with role management
4. `InviteMemberDialog` component
5. Sidebar "Organisation" link (admin only)
6. `WorkspaceGuard` or route-level admin check

Deploy and validate: admin can see page, members/viewers are redirected.

### Phase 5: Onboarding Script Update

1. Rewrite `scripts/onboard-client.ts`:
   - Create org first
   - Create admin user + profile
   - Create org_members row (admin)
   - Optionally create initial member users
   - Migrate `credit_packages` + `client_workspaces` to use `organization_id`
2. Test against staging DB

### Phase 6: Cleanup (after production validation)

1. Remove old RLS policies on `credit_packages`, `client_workspaces`
2. Drop `profile_id` from `credit_packages`, `client_workspaces` (keep in `credit_transactions` for audit)
3. Remove legacy field reads from `profiles` in Edge Functions (clickup_list_ids, nextcloud_client_root, etc.)
4. Optional: deprecate or nullify migrated fields on `profiles` to prevent stale reads

---

## Dependency Map

```
organizations table
  └── org_members (profile_id, organization_id)
        ├── user_org_ids() RLS helper [blocks all new RLS policies]
        ├── credit_packages.organization_id [blocks shared credit balance]
        ├── client_workspaces.organization_id [blocks shared sidebar]
        └── profiles.organization_id [blocks fast org lookup]

user_org_ids() helper
  └── New RLS policies on: organizations, org_members, credit_packages,
      credit_transactions, client_workspaces [blocks frontend data access]

New RLS policies
  └── OrgContext (frontend auth) [blocks useWorkspaces, useCredits]
        ├── useWorkspaces hook update [blocks sidebar for new members]
        ├── useCredits hook update [blocks shared balance display]
        └── useOrgRole hook [blocks role-based UI guards]

OrgContext
  └── OrganisationPage [blocks invite flow, team management]
        └── invite-org-member Edge Function [blocks member invite]

Edge Functions batch deploy [depends on: org + org_members data populated]
  ├── fetch-clickup-tasks (reads org.clickup_list_ids)
  ├── clickup-webhook (finds members via org_members)
  ├── create-clickup-task (reads org.clickup_list_ids + org.clickup_chat_channel_id)
  ├── nextcloud-files (reads org.nextcloud_client_root)
  └── send-reminders (resolves members, per-org credit topup)

onboard-client.ts rewrite [depends on: all DB + Edge Functions complete]
```

### Critical Path

```
Step 1–3 SQL (additive) → Step 4 SQL (new RLS) → Edge Functions deploy
  → OrgContext frontend → useWorkspaces + useCredits update
    → OrganisationPage → invite-org-member EF → onboarding script
      → Step 6 cleanup (drop old columns/policies)
```

### Unblocked Parallel Work

- `OrganisationPage` UI can be built (mocked) while Edge Functions are in review
- `onboard-client.ts` rewrite can be drafted while DB migration is validated
- `invite-org-member` Edge Function can be written while OrganisationPage is in progress

---

## Open Questions / Risks

| Risk | Severity | Mitigation |
|---|---|---|
| `support_messages` table still has `profile_id` and routes the support chat — the `support_task_id` moves to org level, but the webhook writes one row per `profile_id`. When org has 2 members, both need to see support messages. | High | Decide: (a) write support_messages per-member (N rows per message, same pattern as task_cache), or (b) create a shared `org_support_messages` table. Option (a) is consistent with existing architecture. |
| `project_access` is `profile_id`-scoped, not org-scoped. New org members added via invite will not automatically see existing projects. | Medium | On member invite, copy `project_access` rows from org admin to new member, OR migrate `project_access` to `organization_id`. |
| Notification spam: N org members × each event = N bell notifications + N emails. | Low | Per-user `notification_preferences` already handles opt-out. No dedup needed at org level — each member manages their own. |
| `client_workspaces` unique constraint change (from per-profile to per-org) may fail if two profiles already have the same `module_key` for the same org during migration. | Low | The current data has one profile per org, so no conflict. Add constraint after migration, not before. |
| Slug uniqueness collision during auto-generation from company_name. | Low | Run migration script with manual override for any collision. Both MBM and Summerfield have distinct names. |
| `credit_transactions.profile_id` audit trail: after migration, new transactions have `organization_id` but old ones only have `profile_id`. Queries summing balance must handle both. | Medium | Query: `WHERE organization_id = $org_id OR (organization_id IS NULL AND profile_id = $profile_id)` during transition. After full backfill verified, simplify to `organization_id`. |
