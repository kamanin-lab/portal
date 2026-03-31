# Organizations Feature — Design Spec

> Date: 2026-03-31
> Status: Design Approved — Ready for Implementation Planning
> Supersedes: `docs/ideas/organizations.md` (archived, keep for historical reference)
> Target: Phase 5
> Review: Post-reviewer-architect update — 12 issues addressed (2026-03-31)

---

## Problem Statement

Every user is currently an independent entity. Credits, workspaces, and tasks are tied to `profile_id`. When a client has 2–3 employees, each needs their own package and credits — wrong. A company is one organization with a shared budget and shared context.

Additionally, different members of a client org have different needs: the main admin approves costs and sees everything; a specialist (e.g. SEO agency) only creates occasional tasks and shouldn't be spammed with all notifications.

---

## Core Decisions

### Task Visibility: All members see all tasks (MVP)
All org members see the same task list. Differentiation is through **permissions** (who can do what), not **visibility** (who sees what). Tag-based filtering can be added in Phase 6 for clients who explicitly need it. This avoids complex filtering logic, ClickUp structure dependencies, and scales without manual tagging discipline.

### task_cache: Per-org, not per-user
`task_cache.profile_id` → `task_cache.organization_id`. One row per (task, org). Webhook does 1 upsert instead of N. RLS becomes simpler. Migration is trivial now (1 user = 1 org today).

### Credit approval: AWAITING APPROVAL status already exists
`Kostenfreigabe` (portal name for ClickUp `AWAITING APPROVAL`) is an existing status. No new statuses needed. The only change: the "Akzeptieren" button is restricted to `role = 'admin'` only.

### Notifications: Table stays per-user, routing becomes role-aware
The `notifications` table pattern (per-user rows) is industry standard — used by GitHub, Linear, Notion. No architecture change. The only change: `clickup-webhook`'s routing logic uses org membership + roles to decide who gets which notification.

### project_access: Admin assigns per member
Admin manually assigns which org members have access to which projects from the `/organisation` admin page. This uses the existing `project_access` table, just managed through new UI.

### Per-resource permissions: Not in Phase 5
No per-project roles or fine-grained ACLs for now. Role (admin/member/viewer) applies uniformly across the org. Add per-resource permissions only when a concrete client requirement arrives.

---

## Roles

| Action | admin | member | viewer |
|--------|-------|--------|--------|
| View all tasks | ✅ | ✅ | ✅ |
| Create tasks | ✅ | ✅ | ❌ |
| Approve credits (Kostenfreigabe) | ✅ | ❌ | ❌ |
| Approve deliverables (Client Review) | ✅ | ❌ | ❌ |
| Comment on tasks | ✅ | ✅ | ✅ |
| Manage credit package | ✅ | ❌ | ❌ |
| Invite / manage members | ✅ | ❌ | ❌ |
| View/upload files | ✅ | ✅ | ✅ |
| View projects | ✅ | if assigned | if assigned |
| Access /organisation page | ✅ | ❌ | ❌ |

---

## Database Schema

### New tables

```sql
CREATE TABLE organizations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,                     -- "MBM GmbH"
  slug                  text NOT NULL UNIQUE,              -- "mbm"
  clickup_list_ids      jsonb DEFAULT '[]',
  nextcloud_client_root text,                              -- "/clients/mbm/"
  support_task_id       text,
  clickup_chat_channel_id text,
  agency_id             uuid,                              -- NULL now; FK to agencies when SaaS layer arrives
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

CREATE TABLE org_members (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id      uuid REFERENCES profiles(id) ON DELETE SET NULL,  -- NULL while invite is pending
  role            text NOT NULL DEFAULT 'member'
                  CHECK (role IN ('admin', 'member', 'viewer')),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('active', 'pending', 'suspended')),
  invited_by      uuid REFERENCES profiles(id),
  invited_at      timestamptz DEFAULT now(),
  accepted_at     timestamptz,    -- NULL = invite not yet accepted
  invite_email    text,           -- target email before profile exists
  created_at      timestamptz DEFAULT now(),
  -- profile_id uniqueness activates only after invite is accepted (when profile_id is populated).
  -- While status = 'pending', profile_id is NULL — PostgreSQL treats NULL ≠ NULL in unique
  -- constraints, so two pending rows with profile_id = NULL do NOT conflict here.
  -- Duplicate pending invites to the same email are prevented by the separate email constraint below.
  UNIQUE(organization_id, profile_id),
  UNIQUE(organization_id, invite_email)
);

-- Performance: composite index for RLS helper function (mandatory)
CREATE INDEX idx_org_members_profile_status ON org_members(profile_id, status);
```

**Why invite flow in org_members (not a separate table):** Linear and Vercel both track invite state in the membership row. Pending invite = row with `accepted_at IS NULL`. Avoids extra join path and keeps invite management in one place.

### RLS helper

```sql
-- STABLE is mandatory — without it PostgreSQL re-executes per row (O(n) scan)
CREATE OR REPLACE FUNCTION user_org_ids()
RETURNS SETOF uuid AS $$
  SELECT organization_id FROM org_members
  WHERE profile_id = auth.uid() AND status = 'active'
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- For role checks
CREATE OR REPLACE FUNCTION user_org_role(org_id uuid)
RETURNS text AS $$
  SELECT role FROM org_members
  WHERE profile_id = auth.uid() AND organization_id = org_id AND status = 'active'
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

**RLS pitfall — circular reference:** `org_members` RLS cannot call `user_org_ids()` (it queries `org_members` itself). Solution:

```sql
-- org_members: users see only their own rows (simple, no helper)
CREATE POLICY "members_see_own_row" ON org_members
  FOR SELECT USING (profile_id = auth.uid());

-- All other tables use the helper
CREATE POLICY "task_cache_org" ON task_cache
  FOR SELECT USING (organization_id = ANY(user_org_ids()));
```

**Performance note:** RLS is defence-in-depth, not primary filter. Every application-level query must also include `.eq('organization_id', org.id)` (see Frontend Changes). This gives the query planner an explicit index hint and avoids relying solely on the RLS subquery path.

### Modified tables

| Table | Change | Strategy |
|-------|--------|----------|
| `task_cache` | `profile_id` → `organization_id`. Unique constraint: `(clickup_id, organization_id)`. | Breaking change. Migrate: each profile's tasks → their org. |
| `credit_packages` | `profile_id` → `organization_id` | One active package per org. |
| `credit_transactions` | Add `organization_id`, keep `profile_id` | `organization_id` for balance queries; `profile_id` = audit trail (who clicked Akzeptieren). |
| `client_workspaces` | `profile_id` → `organization_id` | Shared across all org members. |
| `support_messages` | `profile_id` → `organization_id` | One shared support chat per org. |
| `profiles` | Add `organization_id uuid` (nullable) | Fast lookup, avoids join for common queries. |

### Unchanged tables (per-user by design)

| Table | Reason |
|-------|--------|
| `notifications` | Per-user: each person's bell state is personal |
| `comment_cache` | Per-user: read state is personal. **Important:** webhook batch-inserts one row per active org member (not just task creator) using a single DB round-trip (not sequential upserts). All members see all comments on org tasks. |
| `read_receipts` | Per-user: who read what is personal |
| `notification_preferences` | Per-user: each person configures their own |
| `project_access` | Per-user: admin assigns per member |

### Fields migrating from profiles → organizations

| Field | From | To |
|-------|------|----|
| `clickup_list_ids` | `profiles` | `organizations` |
| `nextcloud_client_root` | `profiles` | `organizations` |
| `support_task_id` | `profiles` | `organizations` |
| `clickup_chat_channel_id` | `profiles` | `organizations` |

---

## Invite Flow: pending → active

The invite state machine is explicit and fully testable. No implicit triggers.

```
Admin clicks "Einladen"
  → Edge Function calls auth.admin.createUser() — creates Supabase Auth user without sending GoTrue email
  → Generates custom invite token (signed JWT or random UUID stored in org_members.invite_token)
  → Creates org_members row: { status: 'pending', invite_email, invited_by, invited_at }
  → Sends Mailjet email with custom invite link: /accept-invite?token=<invite_token>

User clicks invite link
  → App reads ?token=<invite_token>
  → App calls Edge Function: accept-org-invite (token)
  → Edge Function validates token, calls auth.admin.generateLink() to get a one-time login link
  → User sets password / completes auth
  → Edge Function updates org_members:
      SET status = 'active', accepted_at = now(), profile_id = auth.uid()
  → User now sees org data (RLS: status = 'active')
```

**Why auth.admin.createUser() + Mailjet (not sendMagicLink):** GoTrue SMTP is not configured on this self-hosted instance. `sendMagicLink` relies on GoTrue's built-in email — unusable. All transactional email goes through Mailjet via Edge Functions. The invite flow follows the same pattern as `auth-email`: create user server-side, generate link, send via Mailjet.

**New Edge Function:** `accept-org-invite` — validates invite token, resolves `profile_id` from current auth session, transitions `org_members` row from `pending` → `active`.

**Why explicit Edge Function (not DB trigger or Auth webhook):** Explicit call is debuggable, testable, and auditable. Trigger-based approaches fail silently and are hard to reproduce in tests.

---

## Notification Routing Matrix

| Event | Admin | Member (creator) | Member (other) | Viewer |
|-------|-------|-----------------|----------------|--------|
| Member creates task | 🔔 Bell | — | — | — |
| → AWAITING APPROVAL (Kostenfreigabe) | 📧 Email + 🔔 | 🔔 Bell | — | — |
| Admin approves credits (→ TO DO) | — | 📧 Email + 🔔 | — | — |
| → CLIENT REVIEW (Ihre Rückmeldung) | 📧 Email + 🔔 | 🔔 Bell | — | — |
| → COMPLETE (Done) | 📧 Email + 🔔 | 📧 Email + 🔔 | — | — |
| Team reply (comment) | 🔔 Bell | 🔔 Bell | — | — |

**"Member (creator)"** = the specific user who created that task.
**"Member (other)"** = other org members — no notifications for tasks they didn't create.

**Implementation:** `clickup-webhook` receives event → resolves `organization_id` from `list_id` → queries `org_members` → routes by role. Admin always gets the primary notifications; the task creator gets secondary ones.

**Webhook processing overhead:** Org-level routing adds 2 DB queries + N conditional inserts per event. At current and projected load (10 events/min, 50 orgs × 5 members) this is acceptable. Monitor `webhook_processing_time_ms` per event; optimize if p95 exceeds 2s.

---

## Edge Functions — Changes

**Pre-condition:** Before adding org-logic to `clickup-webhook`, refactor it into internal modules (Phase 2 Step 0). The monolithic `index.ts` becomes a router; logic moves to handler modules. This is required so org-changes don't interleave with existing code and rollback remains possible.

```
clickup-webhook/
  index.ts              ← router only (~50 lines)
  handlers/
    handleStatusChange.ts
    handleComment.ts
    resolveRecipients.ts
    routeNotifications.ts
```

| Function | Change |
|----------|--------|
| `clickup-webhook` | **Biggest change.** Step 0: internal module split (see above). Then: `findProfilesForTask()` → `findOrgForTask()`. Upsert 1 row to `task_cache` (org-level). Batch-insert to `comment_cache` per active org member (single DB round-trip). Route notifications by role. Log `webhook_processing_time_ms` per event. |
| `fetch-clickup-tasks` | Read `clickup_list_ids` from `organizations` via `org_members`. |
| `fetch-project-tasks` | Read list config from org, not profile. |
| `create-clickup-task` | `list_id` from org. Include `created_by_user_id` for task creator tracking. |
| `nextcloud-files` | `nextcloud_client_root` from org. |
| `update-task-status` | Add role check: `AWAITING APPROVAL → TO DO` requires `role = 'admin'`. |
| `credit-topup` | GROUP BY `organization_id`. |
| `send-support-message` | Route via org, not profile. |
| `accept-org-invite` | **New.** Validates invite token, sets `org_members.status = 'active'`, `accepted_at = now()`, `profile_id = auth.uid()`. |

---

## Frontend Changes

### Auth context

```typescript
// useAuth remains auth-only: user session, profile
// Organization context is a separate hook
const { user, profile } = useAuth()

// New: useOrganization() — separate React Query hook
// Own staleTime, error state, retry logic
// NOT embedded in useAuth, NOT a full Provider
const { organization, orgRole, isAdmin, isLoading, error } = useOrganization()
```

**Why separate hook (not useAuth):** `useAuth` handles session. `useOrganization` handles org membership — different data, different error modes, different staleTime. Avoids auth→profile→org waterfall masking as a single loading state. Components consume only what they need.

**Loading/error states:** While `useOrganization` resolves, role-gated components render in disabled/hidden state. On error, show a non-blocking warning; the app remains functional for non-org-specific features.

No org switcher — one user belongs to one org in Phase 5.

### Role-gated components

```typescript
// Kostenfreigabe action buttons — admin only
{isAdmin && <Button>Akzeptieren</Button>}
{isAdmin && <Button variant="ghost">Ablehnen</Button>}

// Client Review action buttons — admin only
{isAdmin && <Button>Freigeben</Button>}
{isAdmin && <Button variant="ghost">Änderungen anfordern</Button>}

// New task button — member+ (not viewer)
{orgRole !== 'viewer' && <NewTaskButton />}
```

### New page: `/organisation` (admin only)

Three sections, accessible only to `role = 'admin'`:

1. **OrgInfoSection** — org name, slug, active credit package (read-only)
2. **TeamSection** — table: name, email, role, status, joined date. Actions: change role (member ↔ viewer), remove member. Admin cannot demote their own admin role.
3. **InviteMemberDialog** — input email + select role → sends magic link → creates `org_members` row with `status = 'pending'`, `invite_email`, `invited_by`
4. **ProjectAccessSection** — per-member project assignment. List of members × list of projects, toggle access.

Sidebar link "Meine Organisation" in Utilities zone, visible only to admin.

### Modified hooks

| Hook | Change |
|------|--------|
| `useClickUpTasks` | Filter by `organization_id`, not `profile_id`. Always include `.eq('organization_id', org.id)` at application level (RLS is defence-in-depth, not primary filter). |
| `useSingleTask` | Same |
| `useWorkspaces` | Query `client_workspaces` by org |
| `useCredits` | Query `credit_packages` + `credit_transactions` by org |

### Realtime subscriptions

```typescript
// Before
.eq('profile_id', user.id)

// After — task_cache is now org-level
.eq('organization_id', org.id)

// Notifications remain per-user
.eq('profile_id', user.id)
```

**Realtime broadcast scope:** With org-level subscriptions, all org members receive the same Realtime events (task updates, status changes). This is correct by design — all members see all tasks. Broadcast volume scales with org size. At 50 orgs × 5 members = 250 concurrent connections, this is within comfortable self-hosted Realtime limits. Revisit if org size exceeds ~20 members.

---

## Testing Strategy

### RLS Isolation Tests (mandatory pre-flight before each migration phase)

Run via Supabase SQL Editor with `SET ROLE` to bypass service role:

```sql
-- Test 1: User in org_a cannot see org_b tasks
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "user-in-org-a-id"}';
SELECT count(*) FROM task_cache WHERE organization_id = 'org-b-id';
-- Expected: 0

-- Test 2: Pending member sees nothing
SET request.jwt.claims = '{"sub": "pending-member-id"}';
SELECT count(*) FROM task_cache;
-- Expected: 0

-- Test 3: Suspended member sees nothing
SET request.jwt.claims = '{"sub": "suspended-member-id"}';
SELECT count(*) FROM task_cache;
-- Expected: 0

-- Test 4: org_members circular reference — user sees only own row
SET request.jwt.claims = '{"sub": "active-member-id"}';
SELECT count(*) FROM org_members;
-- Expected: 1 (own row only, no infinite loop)
```

These 4 tests run in seconds and prevent silent data leakage. No exceptions.

### Webhook Payload Fixtures

`clickup-webhook` processes inbound events from ClickUp with many payload variants (missing fields, null values, event subtypes). To build a reliable regression suite:

1. In Phase 2, add temporary debug logging to `clickup-webhook`: save raw payloads to a `webhook_payloads_debug` table (auto-expire 7 days via `created_at` + cleanup job).
2. Collect 20–30 real payloads over one week from production.
3. Use as fixtures for handler unit tests (`handleStatusChange`, `handleComment`, etc.).

This gives real data without manually constructing mock payloads.

### Invite Flow Tests

Full state machine test (integration):
1. Admin calls invite endpoint → verify `org_members` row: `{ status: 'pending', accepted_at: null }`
2. Simulate magic link click → call `accept-org-invite` → verify: `{ status: 'active', accepted_at: not null, profile_id: correct }`
3. Verify user can now query `task_cache` (RLS passes for `status = 'active'`)
4. Verify user with `status = 'pending'` still gets 0 rows from `task_cache`

---

## Migration Strategy (Zero Downtime)

### Phase 1 — Additive DB (no breaking changes)

1. Create `organizations` + `org_members` tables
2. Create index: `idx_org_members_profile_status ON org_members(profile_id, status)`
3. Add nullable `organization_id` to `task_cache`, `credit_packages`, `credit_transactions`, `client_workspaces`, `support_messages`, `profiles`
4. Migrate data: each existing profile → create one org → create one `org_members` row (`role = 'admin'`, `status = 'active'`)
5. Populate `organization_id` on all affected rows
6. Create `user_org_ids()` + `user_org_role()` helpers (STABLE)
7. **Update `onboard-client.ts`** to write new fields to `organizations` table (not deferred to Phase 4 — writers must be updated in the same phase as table creation to prevent data inconsistency)
8. **Old columns still present** — frontend and Edge Functions unchanged

**Dual-write rule (Phase 1 → Phase 2 transition):** Edge Functions updated in Phase 2 must write to **both** `profile_id` and `organization_id` fields simultaneously until Phase 3 RLS switch is complete. This enables rollback without data loss.

### Phase 2 — Backend: Edge Functions + RLS

**Step 0 (prerequisite):** Refactor `clickup-webhook` into internal modules (`handleStatusChange`, `handleComment`, `resolveRecipients`, `routeNotifications`). Index.ts becomes a router only. This must happen before org-logic is added. Deploy and verify the refactored webhook behaves identically before proceeding.

1. Update `clickup-webhook`: org-level upsert + role-based notification routing + batch comment_cache inserts
2. Update `fetch-clickup-tasks`, `create-clickup-task`, `nextcloud-files`, `credit-topup`
3. Add role check to `update-task-status` for credit approval
4. Deploy `accept-org-invite` Edge Function
5. **All Edge Functions write to both profile_id and organization_id** (dual-write per Phase 1→2 rule)
6. Add new RLS policies via `user_org_ids()`, keep old ones during transition
7. **Run RLS test suite** — verify cross-org isolation, pending/suspended states
8. Remove old `profile_id`-based policies after verification

### Phase 3 — Frontend

1. `useOrganization()`: separate hook, own React Query cache, error state, retry logic
2. Update hooks to query by `organization_id` with application-level filter (`.eq('organization_id', org.id)`)
3. Update Realtime subscriptions
4. Role-gate action buttons (Akzeptieren, Freigeben, NewTaskButton)
5. New `/organisation` page with OrgInfoSection + TeamSection + InviteMemberDialog + ProjectAccessSection
6. Add sidebar link (admin only)
7. **Run RLS test suite** again after frontend switch

### Phase 4 — Invite Flow + Cleanup

1. Implement InviteMemberDialog full flow (email → pending row → magic link → accept-org-invite)
2. Member invite flow works via both script and UI `/organisation` page
3. Magic link → `accepted_at` populated → `status = 'active'`
4. Remove dual-write (drop old `profile_id` columns from modified tables)
5. Final RLS test suite run

---

## Implementation Risks

| Risk | Mitigation |
|------|------------|
| task_cache breaking change | Phase 1 additive only; dual-write in Phase 2; old profile_id column kept until Phase 4 |
| clickup-webhook is the most critical function | Module refactor (Step 0) before org-changes; webhook payload fixture collection in Phase 2 |
| RLS circular reference on org_members | Simple `profile_id = auth.uid()` policy on org_members itself |
| Missing STABLE on user_org_ids() | Enforced in schema definition — document prominently |
| Missing composite index on org_members | `idx_org_members_profile_status` created in Phase 1 |
| New admin joining org doesn't see old tasks | Backfill script: query all tasks for org's list_ids, upsert to task_cache |
| Notification spam deduplication | Per-org per-event dedup in webhook (existing dedup logic, extend to org scope) |
| Onboard script inconsistency window | `onboard-client.ts` updated in Phase 1 (same commit as table creation) |
| Invite flow broken (pending → active) | Explicit `accept-org-invite` Edge Function — testable, auditable, no implicit triggers |
| RLS policy conflict during Phase 2 transition | Run RLS test suite before removing old policies |

---

## Future Extensibility (Not Building Now)

- **Agency layer:** `organizations.agency_id` is NULL today. Create `agencies` table and populate FK when SaaS is needed. `org_members` schema unchanged.
- **JWT custom claims:** Store `organization_id` in JWT at login time; RLS uses `auth.jwt()->>'organization_id'` instead of subquery. O(1) per row. Activate when p95 webhook processing exceeds 2s.
- **Per-module roles:** extend `org_members.role` to JSONB `{"tickets": "member", "projects": "viewer"}` when a concrete requirement arrives.
- **Tag-based task filtering:** add `org_member_tag_subscriptions` table mapping members to ClickUp tags. Show only tagged tasks to that member. Add when a client explicitly requests it.
- **Per-resource permissions:** separate `org_member_project_access` table (Linear pattern) already covered by `project_access` — extend when needed.
