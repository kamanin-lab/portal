# Org-Layer Retrofit Pitfalls

**Project:** KAMANIN Client Portal — v2.0 Organisations milestone
**Research date:** 2026-04-14
**Scope:** Adding multi-tenant org layer to an existing single-user Supabase app where all data is `profile_id`-scoped

---

## Summary

Retrofitting an org layer onto a running production app is fundamentally different from building multi-tenancy from scratch. The three classes of risk are:

1. **Data integrity during the transition window** — the period where old `profile_id`-scoped rows coexist with new `organization_id`-scoped rows. If any Edge Function is updated before data is migrated, or vice versa, production users see empty data or duplicated access.

2. **RLS correctness** — Postgres permissive policies are OR-ed together. Two coexisting SELECT policies (`profile_id = auth.uid()` plus `organization_id IN (SELECT user_org_ids())`) mean a row passes if EITHER condition is true. This is the intended dual-policy pattern, but it also means a misconfigured policy silently over-exposes data rather than rejecting it.

3. **GoTrue invite mechanics** — `inviteUserByEmail` sends a one-time magic-link token regardless of whether magic-link login is disabled in the UI. The token expires in 24 hours, is consumed by mobile link-preview crawlers, and requires the recipient to follow a specific flow to set a password. SMTP must be routed through the existing Send Email Hook (Mailjet), not GoTrue's internal mailer, or the invite email will never be delivered.

The pitfalls below are drawn from the specific codebase structure (volume-mounted Edge Functions, self-hosted GoTrue on Coolify, two live clients MBM and Summerfield, `notifications_type_check` constraint, `(clickup_id, profile_id)` unique constraint on `task_cache`).

---

## RLS Migration Pitfalls

### Pitfall R1: Dual permissive policies silently over-expose data during the transition window

**What goes wrong:** When you add the new org-scoped SELECT policy alongside the existing `profile_id = auth.uid()` policy, Postgres OR-es them. Any row where the old condition is true passes regardless of whether the org-scoped condition would exclude it. This is correct behavior — you want both policies active during the transition. The danger is forgetting to DROP the old policy after migration. If left in permanently, a user who is removed from an org can still read data via the old `profile_id` path (assuming their `profile_id` row still exists on the table).

**Why it happens:** Postgres permissive policies accumulate as OR. There is no warning when you have "too many" policies on a table.

**Consequences:** Unauthorized data access after org removal. A viewer-role user retains full access via the old path. Hard to detect because the data "looks right" from the admin's perspective.

**Prevention:** Track policy state explicitly. Before the transition, document which tables have old-style policies. After migration verification, DROP old policies table by table — not all at once. Use a migration checklist, not "clean up later."

**Detection:** Run `SELECT schemaname, tablename, policyname FROM pg_policies WHERE tablename IN ('credit_packages', 'client_workspaces', 'credit_transactions') ORDER BY tablename, policyname;` after each table's migration to confirm old policies were removed.

---

### Pitfall R2: `user_org_ids()` called per-row without the SELECT wrapper — catastrophic query performance

**What goes wrong:** The planned RLS helper `user_org_ids()` is a `SECURITY DEFINER STABLE` function. If used directly as `organization_id IN (SELECT user_org_ids())` without wrapping `auth.uid()` in the SELECT-subquery pattern, the optimizer may call the function once per row instead of caching it. On `task_cache` with thousands of rows per user this degrades from ~15ms to hundreds of milliseconds.

**Why it happens:** Postgres does not honor STABLE optimization for RLS policy expressions unless the function is wrapped in a subquery that forces an initPlan. A bare `user_org_ids()` call in a policy USING clause is re-evaluated per candidate row. This is a confirmed Postgres behavior, not a Supabase bug.

**Consequences:** Portal loads become noticeably slow as task_cache grows. The issue is invisible in development with 10-row datasets.

**Prevention:** Write the policy as:
```sql
USING (organization_id IN (SELECT user_org_ids()))
```
NOT as:
```sql
USING (organization_id = ANY(user_org_ids()))
```
The `(SELECT ...)` wrapper signals to Postgres to run the function as an initPlan once per query. Add an index on every `organization_id` column used in policy conditions.

**Detection:** Run `EXPLAIN ANALYZE` on a `SELECT * FROM credit_packages` query as a regular user. If you see `Function Scan on user_org_ids` per-row instead of a single InitPlan node, the optimization is missing.

---

### Pitfall R3: UPDATE policy requires a corresponding SELECT policy or updates silently fail

**What goes wrong:** RLS evaluates the SELECT policy before applying an UPDATE. If you add a new UPDATE policy for org-scoped rows but the SELECT policy has not been updated (or has been dropped prematurely), UPDATE statements return "0 rows affected" with no error.

**Consequences:** Edge Functions calling `.update()` on `credit_packages` or `client_workspaces` appear to succeed (no error thrown) but data does not change. Debugging is extremely difficult because the Supabase client returns `{ data: null, error: null, count: 0 }` — not an error.

**Prevention:** For every table being migrated, update SELECT and UPDATE policies in the same migration step. Never drop the SELECT policy before the UPDATE policy is in place.

---

### Pitfall R4: `notifications_type_check` constraint blocks new notification types for org events

**What goes wrong:** The `notifications` table has a hard CHECK constraint (`notifications_type_check`) that allows only: `team_reply`, `status_change`, `step_ready`, `project_reply`, `project_update`, `new_recommendation`. Any org-related notification (e.g., `member_invited`, `member_role_changed`) would be rejected at the DB level with a constraint violation.

**Why it matters for the org migration:** The `clickup-webhook` fan-out now needs to create notifications for multiple members of an org. If the notification payload for any new event type is not in the constraint, the entire webhook handler throws, and all members miss their notification.

**Prevention:** Before writing any Edge Function code that creates notifications, run an ALTER TABLE to add new types to the constraint. Do this as a dedicated migration step. Alternatively, map org events to existing types — for example, map `member_invited` → surface it only via email (no bell notification), avoiding the constraint issue entirely.

---

### Pitfall R5: SECURITY DEFINER functions in exposed schema are callable via RPC

**What goes wrong:** `user_org_ids()` defined in the `public` schema is callable by any authenticated user via `supabase.rpc('user_org_ids')`. While the function only returns the calling user's own org IDs (by design), it exposes the existence of the function and its return type. More critically, if a future helper takes an input parameter (e.g., `is_org_member(org_id uuid)`), a malicious or curious user could enumerate org membership.

**Prevention:** Define RLS helper functions in an unexposed schema (e.g., create a `rls` schema and set `search_path` appropriately), or ensure all helper functions take zero parameters and only operate on `auth.uid()` internally. The `user_org_ids()` function as planned is safe (no parameters), but document this constraint explicitly so future helpers follow the same pattern.

---

### Pitfall R6: Table owner bypasses RLS — applies to Edge Function service role client

**What goes wrong:** In Postgres, RLS is enforced for all roles except the table owner by default. The service role key used in Edge Functions runs as a Postgres superuser role that bypasses RLS entirely. This is intended for admin operations but means every Edge Function that uses the service role client can read/write any row from any org with no restriction.

**Why this matters for the org migration:** Currently Edge Functions use the service role for all writes (webhook processing, task sync, notification delivery). This is correct. The risk is if a new Edge Function is accidentally written to use the service role for user-facing reads, it will return cross-org data with no RLS filtering — no error, just wrong data.

**Prevention:** Enforce the convention: service role client = admin writes only (webhooks, sync, notification delivery). Any Edge Function that returns data to a specific user must either use the user's JWT (anon key + Bearer token) for the Supabase client, or apply explicit `eq('profile_id', userId)` / `eq('organization_id', orgId)` filters even when using the service role.

---

## Data Migration Pitfalls

### Pitfall D1: `(clickup_id, profile_id)` unique constraint on `task_cache` — the org migration does NOT change this

**What goes wrong:** `task_cache` stays per-user by design (one row per task per member). The migration plan correctly leaves it alone. The pitfall is a future developer assuming `task_cache` should be migrated to `(clickup_id, organization_id)` because all other tables moved. This would collapse all member rows into one row per task, breaking individual read-state, last_activity_at per-user, and notification targeting.

**Prevention:** Add a comment to the `task_cache` table: `COMMENT ON TABLE task_cache IS 'Intentionally per-user, not per-org. See decisions.md DECISION-008.';` Document this explicitly in DECISIONS.md when the migration is executed.

---

### Pitfall D2: Migrating existing profiles to org-admins — the "lonely org" problem

**What goes wrong:** The migration script creates one org per existing profile (MBM → org, Summerfield → org) and assigns the existing user as admin. If the migration runs twice (e.g., script error, retry), it creates duplicate orgs for the same profile. There is no natural unique constraint preventing `organizations` from having two rows with the same slug if the slug generation has a bug, or two `org_members` rows pointing the same `profile_id` as admin if the script is idempotent-unaware.

**Consequences:** The user sees duplicated workspaces, their credits appear doubled (two org rows both mapped from the same credit_packages), or the `user_org_ids()` function returns two org IDs causing unexpected data visibility.

**Prevention:** Make the onboard migration script fully idempotent using `INSERT ... ON CONFLICT DO NOTHING` with the `slug` unique constraint. Verify: `SELECT p.email, count(o.id) as org_count FROM profiles p JOIN org_members om ON om.profile_id = p.id JOIN organizations o ON o.id = om.organization_id GROUP BY p.email HAVING count(o.id) > 1;` returns zero rows after each migration run.

---

### Pitfall D3: Fields migrated from `profiles` to `organizations` — Edge Functions reading stale profile fields during the transition

**What goes wrong:** `clickup_list_ids`, `nextcloud_client_root`, `support_task_id`, and `clickup_chat_channel_id` are moving from `profiles` to `organizations`. During Phase 1 (additive only), both locations exist. Phase 2 updates Edge Functions to read from `organizations`. If any Edge Function is updated to read from `organizations` before the data migration from `profiles` has run, it reads NULL values and fails silently (tasks don't sync, Nextcloud returns 403, support chat breaks).

**Why this is acute:** Edge Functions on this project are deployed by copying files to a volume mount and restarting the container. There is no atomic deploy-and-migrate step. The function update and the data migration are two separate operations that can drift.

**Prevention:** Strict phase ordering enforced in the plan: data migration MUST be verified (spot-check via SQL) before any Edge Function is updated. Implement a fallback in each updated Edge Function: if `organizations.clickup_list_ids` is null or empty, fall back to `profiles.clickup_list_ids` for this specific profile. This dual-read pattern makes the transition safe regardless of ordering.

```typescript
// Safe transition pattern in fetch-clickup-tasks
const listIds = org?.clickup_list_ids?.length
  ? org.clickup_list_ids
  : profile?.clickup_list_ids ?? [];
```

Remove the fallback only after all profiles have been confirmed migrated and `profiles.clickup_list_ids` has been deprecated.

---

### Pitfall D4: `credit_packages` has a `profile_id` FK — existing approved Kostenfreigabe tasks reference it

**What goes wrong:** `credit_transactions` records reference the current `credit_packages.id`. If `credit_packages` is migrated to use `organization_id` instead of `profile_id` and the old `profile_id` column is dropped, any query that joins `credit_transactions → credit_packages` via the old FK path breaks. If credit approval history is lost, MBM and Summerfield clients lose their audit trail.

**Prevention:** Keep `profile_id` on `credit_transactions` permanently as an audit trail column (as already noted in the idea doc). Do NOT drop it. For `credit_packages`, add `organization_id` column, populate it, then mark `profile_id` as deprecated (not dropped) until Phase 4 is confirmed stable. The `credit_packages` RLS policy switches to org-based; the `profile_id` column stays for historical reference only.

---

## Edge Function Pitfalls

### Pitfall E1: Volume-mount deploy has no atomic rollback — a bad function file breaks ALL functions

**What goes wrong:** The main Edge Function router (`supabase/functions/main/index.ts`) dynamically loads worker functions via `EdgeRuntime.userWorkers.create()`. A syntax error or import failure in any individual function file (e.g., `fetch-clickup-tasks`) causes the entire router to fail to restart, taking down all Edge Functions including unrelated ones (`nextcloud-files`, `send-feedback`).

**Why this matters during the org migration:** Multiple Edge Functions are being modified simultaneously (fetch-clickup-tasks, clickup-webhook, nextcloud-files, credit-topup, send-reminders). If any file has an error, the full suite goes down — and the only recovery is to fix the file and restart the container manually via Coolify SSH.

**Prevention:** Update and verify each Edge Function in isolation. Use the staging environment to test syntax before touching production. Keep a known-good backup of each function file before editing. After each deploy, immediately test the affected function AND one unrelated function (nextcloud-files) to confirm the router is healthy.

---

### Pitfall E2: `clickup-webhook` fan-out to org members creates N+1 Supabase queries

**What goes wrong:** Currently `findProfilesForTask()` resolves one user per task. After the org migration, it must resolve all `org_members` for the task's org — potentially 3-5 users. If the implementation does this as a loop (`for member of orgMembers { await supabase.from('notifications').insert(...) }`), each insert is a separate round-trip. With 5 members and a webhook burst of 10 events, that's 50 sequential queries in a single webhook invocation.

**Consequences:** Webhook timeouts (ClickUp has a 10-second delivery window before marking it as failed). When ClickUp marks a webhook as failed repeatedly, it suspends the webhook, requiring manual recreation.

**Prevention:** Batch insert all notifications in a single `.insert([...])` call. Similarly, batch upsert `task_cache` rows for all org members in a single operation using the `ON CONFLICT (clickup_id, profile_id) DO UPDATE` upsert pattern.

```typescript
// Batch insert — one round-trip for all org members
const notificationRows = orgMembers.map(member => ({
  profile_id: member.profile_id,
  type: 'status_change',
  title: notificationTitle,
  message: notificationBody,
  task_id: taskId,
}));
await supabase.from('notifications').insert(notificationRows);
```

---

### Pitfall E3: Notification deduplication breaks with org fan-out

**What goes wrong:** The current `clickup-webhook` deduplicates notifications by checking for an existing row before inserting (documented in DATABASE_SCHEMA.md). After fan-out, the dedup check must be per-member, not per-task. If the dedup query checks `WHERE task_id = $1` without also filtering by `profile_id`, it will find the first member's notification row and skip inserting for all subsequent members.

**Prevention:** The dedup query must be `WHERE task_id = $1 AND profile_id = $2`. Verify this in code review when updating `clickup-webhook`.

---

### Pitfall E4: `send-reminders` sends one email per org-member — potential spam if org has 3+ members

**What goes wrong:** Currently send-reminders sends one email per profile for tasks stuck in `client review`. After the org migration, if the function loops over `org_members` and sends to each one, a 3-person org gets 3 reminder emails about the same task. This is the "notification spam (N users × N events)" risk from the idea doc.

**Prevention:** Two strategies, choose one:

**Option A — Digest per org:** Group by `organization_id`, collect all reminder-eligible tasks, send ONE digest email to all admin/member roles within the org. Skip viewers.

**Option B — Admin-only reminders:** Send only to the org admin (single recipient per org). Members can enable if they want via `notification_preferences`.

Option A is more complex but correct for multi-user workflows. Option B is simpler and safe for the initial implementation, migratable to A later. The `profiles.last_project_reminder_sent_at` cooldown field is currently per-user — with Option B it stays per-user on the admin. With Option A it needs to become per-org (add `last_reminder_sent_at` on `organizations`).

---

### Pitfall E5: `create-clickup-task` reads `list_id` from `profiles.clickup_list_ids[0]` — must switch atomically with data migration

**What goes wrong:** After the org migration, `create-clickup-task` reads `clickup_list_ids` from `organizations`. If a user creates a task while the data migration is partially complete (their org exists but `organizations.clickup_list_ids` is still NULL because the copy from `profiles` hasn't run for their org), the task creation fails with an unhelpful "no list_id" error.

**Prevention:** Apply the dual-read fallback pattern (Pitfall D3). Additionally, the `org_members` table insert and the `organizations.clickup_list_ids` population should be in the SAME transaction, not separate steps. If they are separate migrations, the window of inconsistency exists.

---

## Invite Flow Pitfalls

### Pitfall I1: `inviteUserByEmail` uses a magic-link token regardless of whether magic-link login is UI-disabled

**What goes wrong:** `auth.admin.inviteUserByEmail()` sends an invite token via email. The token is a one-time magic link. Even if magic-link auth is disabled for regular sign-in (as it is on this project due to SMTP issues), the admin invite flow still uses the same token mechanism. The invited user must click the link to establish a session, then set their password.

**Important:** This is NOT the same as the "magic link login" feature. The invite token is a separate GoTrue flow (`invite` type OTP). Disabling magic-link login does NOT disable invite tokens.

**Consequence if misunderstood:** If the invite UI is built assuming users can set a password directly without clicking an email link, the flow breaks. The link click is mandatory for the first-time session.

**Correct flow:**
1. Admin calls `supabase.auth.admin.inviteUserByEmail(email)` — requires service role key in Edge Function
2. GoTrue sends an invite email containing a token hash
3. User clicks link → lands on portal with token in URL hash
4. Frontend calls `supabase.auth.verifyOtp({ token_hash, type: 'invite' })` to establish session
5. User is now authenticated; frontend immediately shows a set-password form
6. Frontend calls `supabase.auth.updateUser({ password: newPassword })`

**Prevention:** Build the `/auth/accept-invite` page to handle this exact flow. Do not skip the `verifyOtp` step.

---

### Pitfall I2: Invite email goes through GoTrue's internal SMTP — will fail on this self-hosted instance

**What goes wrong:** GoTrue's internal SMTP is not working on this project (documented in CLAUDE.md: "Magic link disabled — GoTrue SMTP not working"). The same broken SMTP path is used for invite emails by default. If `inviteUserByEmail` is called without routing through the Send Email Hook, the invite email is silently dropped (GoTrue logs an SMTP error but the API call returns 200).

**Prevention:** The existing GoTrue Send Email Hook (`auth-email` Edge Function) must handle the `invite` event type. Verify the hook's `switch` statement includes `case 'invite':` mapping. The hook already handles `magic_link`, `signup`, `recovery` — extend it to handle `invite` with an appropriate Mailjet template (German language, consistent with portal design).

**Detection:** After implementing, test by calling `inviteUserByEmail` from the Edge Function, then check Mailjet delivery logs (not GoTrue logs) to confirm the email was dispatched.

---

### Pitfall I3: Invite token expiry is 24 hours — mobile link-preview crawlers consume it

**What goes wrong:** GoTrue invite tokens expire after 24 hours by default (configurable via `GOTRUE_MAILER_OTP_EXP`). More critically, WhatsApp, iMessage, and some email clients send a background HTTP request to "preview" the link before the user clicks it. This GET request to the invite URL can consume the one-time token, leaving the user with an "invalid token" error when they actually click.

**Consequences:** Invited member clicks the invite link and sees "Link is invalid or has expired" — a confusing first experience. If the admin must re-invite them, the `inviteUserByEmail` call for an already-invited (but unconfirmed) GoTrue user may fail or send a new token without warning.

**Prevention:**
1. Use PKCE flow: set `redirectTo` to a deep link that extracts `token_hash` from the URL and calls `verifyOtp` — the `token_hash` parameter survives link previews because it is in the query string, not consumed by a GET.
2. Increase OTP expiry to 72 hours via `GOTRUE_MAILER_OTP_EXP=259200` in the Coolify environment.
3. Show clear German error messaging: "Ihr Einladungslink ist abgelaufen. Bitten Sie den Administrator, die Einladung erneut zu senden." and provide a "Resend invite" button in the org admin page.

---

### Pitfall I4: Re-inviting an already-invited user — GoTrue behavior is not obvious

**What goes wrong:** If an invited user has not confirmed their account (i.e., they exist in `auth.users` with `invited_at` set but `confirmed_at` NULL), calling `inviteUserByEmail` again with the same email does NOT return an error. GoTrue creates a new invite token and sends a new email, invalidating the previous token. However, the `org_members` row may already exist from the first invite call, causing a unique constraint violation on the second `INSERT INTO org_members`.

**Prevention:** The invite Edge Function should:
1. Check if `email` already exists in `auth.users` AND has `confirmed_at IS NULL` before calling `inviteUserByEmail` — if so, call it again (resend) but skip the `org_members` insert.
2. Check if `email` already exists with `confirmed_at IS NOT NULL` — if so, skip `inviteUserByEmail` entirely, just create the `org_members` row.
3. Log all three states clearly for debugging.

---

### Pitfall I5: Invite creates a GoTrue user before the portal `profiles` row exists

**What goes wrong:** When `inviteUserByEmail` creates a user in `auth.users`, the `profiles` table is populated by a Postgres trigger (`handle_new_user` on `auth.users INSERT`). If this trigger does not exist or fires but fails silently (e.g., `profiles.clickup_list_ids` has a NOT NULL constraint that isn't met), the invited user has a GoTrue account but no `profiles` row. The portal's `useAuth` hook then fails to load profile data, leaving the user stuck on a blank page.

**Prevention:** Verify the `handle_new_user` trigger exists and handles the case where `raw_user_meta_data` is empty (which it is for invited users). The trigger must create a minimal valid `profiles` row. After the invite flow is implemented, write a test invite → verify `profiles` row exists.

---

## Prevention Strategies

### Strategy 1: Staged migration with explicit verification gates

Never proceed to the next phase without running verification SQL that confirms the previous phase is complete. Suggested gates:

- After Phase 1 (DB foundation): `SELECT count(*) FROM org_members;` must equal `SELECT count(*) FROM profiles;` (one admin per profile migrated)
- After data copy: `SELECT count(*) FROM organizations WHERE clickup_list_ids IS NULL OR clickup_list_ids = '[]';` must be 0
- After old policy removal: `SELECT count(*) FROM pg_policies WHERE policyname LIKE '%profile_id%' AND tablename IN ('credit_packages', 'client_workspaces');` must be 0

### Strategy 2: Dual-read fallback in every migrated Edge Function

During the transition window, every Edge Function that reads org-level fields should fall back to the profile-level field if the org field is NULL. This makes the migration order-independent and production-safe. Document the fallback clearly so it is removed in the cleanup phase.

### Strategy 3: Test with a disposable third user, not MBM or Summerfield

Create a test org (`test-gmbh`) with a test user before touching MBM or Summerfield data. Run the full invite flow, RLS verification, and Edge Function behavior against the test org. Only promote to production clients after the test org confirms correct behavior.

### Strategy 4: One Edge Function update per deploy, with health check

Due to the volume-mount deploy model (all functions go down if one file has an error), update one Edge Function at a time, restart, verify health, then proceed. Keep the git diff per function isolated. Never deploy half-updated functions to production.

### Strategy 5: Preserve `profiles` data as read-only columns during the transition

Do NOT drop `clickup_list_ids`, `nextcloud_client_root`, `support_task_id`, or `clickup_chat_channel_id` from `profiles` during Phase 1 or Phase 2. Mark them deprecated in a comment. Drop them only in Phase 4 after the onboarding script is rewritten and tested. The cost of keeping redundant columns is negligible; the cost of a production data loss is not.

### Strategy 6: Invite flow — use the Send Email Hook, test delivery before building the UI

Before building the `/organisation` invite dialog UI, verify the full invite email flow works end-to-end: call `inviteUserByEmail` from a test Edge Function → confirm email arrives via Mailjet → click the link → confirm GoTrue session is established. Only build the UI after the email delivery is confirmed working.

---

## Phase-Specific Warnings

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|------------|
| 1 — DB Foundation | `organizations` + `org_members` creation | Duplicate org per profile if script is non-idempotent | `INSERT ... ON CONFLICT DO NOTHING` on slug |
| 1 — DB Foundation | `user_org_ids()` function | Called per-row in RLS, killing query performance | Use `(SELECT user_org_ids())` wrapper in all policies |
| 1 — DB Foundation | `notifications_type_check` constraint | New org notification types rejected at DB level | Add new types to constraint in Phase 1 migration |
| 2 — Edge Functions | `fetch-clickup-tasks` | Reads NULL `clickup_list_ids` from org before data copy | Dual-read fallback pattern |
| 2 — Edge Functions | `clickup-webhook` | N+1 insert loop for org members triggers ClickUp webhook timeout | Batch insert all member notifications |
| 2 — Edge Functions | `send-reminders` | Sends N emails per org member for same task | Digest per org or admin-only for v1 |
| 2 — Edge Functions | Volume mount deploy | One bad file takes down all functions | Deploy one function at a time, health-check after each |
| 3 — Frontend | Invite flow UI | Missing `verifyOtp` step → "invalid session" on password set | Build `/auth/accept-invite` page with correct flow |
| 3 — Frontend | Invite email | GoTrue SMTP not configured → invite email never arrives | Route through Send Email Hook (`auth-email` Edge Function) |
| 3 — Frontend | Link preview consumes token | User clicks link, gets "expired" error | Use PKCE flow with `token_hash` in query string |
| 3 — Frontend | Role enforcement | Viewer bypasses via direct URL navigation | RLS is the hard enforcement; frontend guards are UX only |
| 4 — Cleanup | Dropping old `profiles` columns | Remaining Edge Function still reads from `profiles` | Audit all Edge Functions before dropping; use grep |
| 4 — Cleanup | Dropping old RLS policies | Old policy not yet removed on one table | Verify `pg_policies` query shows only org-scoped policies |

---

*Sources: Supabase RLS Performance docs, Postgres RLS Footguns (Bytebase), Makerkit RLS Best Practices, GitHub discussions #9311 (STABLE function optimization), #20333 (invite flow), Supabase Send Email Hook docs, inviteUserByEmail API reference.*
