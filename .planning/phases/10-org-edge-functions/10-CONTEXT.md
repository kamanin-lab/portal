# Phase 10: org-edge-functions — Context

**Created:** 2026-04-14
**Phase goal:** All Edge Functions resolve their client-scoped configuration from `organizations` instead of `profiles`, with dual-read fallback ensuring zero downtime, and a new `invite-member` function handles the full invite flow.

---

## Prior Decisions (carried from Phase 9 / requirements)

- Staging DB only — all work targets Cloud Supabase (`ahlthosftngdcryltapu`), NOT production
- GoTrue SMTP broken on self-hosted — `invite-member` must use `createUser` + `generateLink({ type: 'recovery', redirectTo: '/passwort-setzen' })` — never `inviteUserByEmail`
- `project_access` rows copied from org admin to new member at invite time
- `notifications_type_check` already extended in Phase 9 — `member_invited` and `member_removed` types ready to use
- `invite` email copy already exists in `supabase/functions/_shared/emailCopy.ts`
- Dual-read fallback pattern is locked: if org lookup returns nothing, fall back to `profiles` field — zero downtime

---

## Decisions Made in This Discussion

### 1. Org Data Lookup Pattern (affects all 5 updated functions)

**Decision: org_members join**

All 5 functions (`fetch-clickup-tasks`, `fetch-single-task`, `nextcloud-files`, `create-clickup-task`, `send-reminders`) replace their `profiles` lookup with:

```sql
SELECT o.clickup_list_ids, o.nextcloud_client_root, o.support_task_id, o.clickup_chat_channel_id
FROM organizations o
JOIN org_members om ON om.organization_id = o.id
WHERE om.profile_id = auth.uid()
LIMIT 1
```

**Dual-read fallback pattern** (applied consistently in all 5 functions):
```ts
const org = await getOrgForUser(supabase, user.id) // org_members join
const listIds = org?.clickup_list_ids ?? profile?.clickup_list_ids ?? []
// same pattern for nextcloud_client_root, support_task_id, clickup_chat_channel_id
```

If `org` is null (lookup fails or no org_members row), fall back to `profiles` field. This ensures zero breakage before Phase 13 cleanup removes the fallbacks.

### 2. clickup-webhook Fan-out Strategy

**Decision: org-first resolution, keep task_cache fallback**

`findProfilesForTask(taskId, listId)` is updated to:

1. **Primary (new):** Find the org whose `clickup_list_ids` contains `listId`. Get all `profile_id`s from `org_members` for that org. Return them.
2. **Fallback (existing):** If no org found, fall back to old logic — check `task_cache` for profile_ids, then fall back to `profiles.clickup_list_ids`.

All downstream consumers of `findProfilesForTask` (bell notifications, task_cache upserts) automatically fan out to all org members.

**Support chat fan-out:**

When a new comment arrives on `support_task_id`:
- Find org via `organizations.support_task_id = task_id`
- Get all `profile_id`s from `org_members` for that org
- Insert N `comment_cache` rows (one per member)
- Dedup key: `(task_id, comment_id, profile_id)` — prevents duplicates on replays

### 3. invite-member Function

**Decision: roll back everything on email failure**

Sequence:
1. Auth guard: check caller is org admin via `user_org_role(organizationId)` → 403 if not admin
2. Duplicate check: if email already in `auth.users` AND already in `org_members` for this org → 409
3. Create auth user: `auth.admin.createUser({ email, email_confirm: true })`
4. Generate recovery link: `auth.admin.generateLink({ type: 'recovery', email, redirectTo: '/passwort-setzen' })`
5. Send invite email: `send-mailjet-email` with `invite` copy, passing recovery link as CTA URL
6. **If email send fails:** delete the created auth user → return 500. No org_members row inserted. Admin must retry.
7. If email send succeeds: insert `org_members` row + copy `project_access` rows from org admin → return 200

**Decision: pending invite state — no extra column**

"Pending" is derived from `auth.users.last_sign_in_at = null`. A user created by `invite-member` (email_confirm: true, but never logged in) has `last_sign_in_at = null`. Frontend Phase 12 queries `auth.users` (via admin client in Edge Function or via a view) to determine pending status. No schema change needed in Phase 10.

### 4. Role Enforcement (viewer 403)

**Decision: check role before any mutating operation**

`create-clickup-task`, `post-task-comment`, `update-task-status` each add a role guard at the top of their handler:

```ts
const role = await getUserOrgRole(supabase, user.id)
if (role === 'viewer') {
  return new Response(JSON.stringify({ error: 'Insufficient permissions' }), { status: 403 })
}
```

`getUserOrgRole` queries `org_members` via the `user_org_role(org_id)` SQL function or direct query. If the user has no org_members row (legacy user during transition), treat as `member` (permissive fallback).

### 5. send-reminders Org Scope

**Decision: admin-only emails, grouped by organization**

`sendTicketReminders` and `sendProjectReminders` in `send-reminders` are updated to:
- Query `org_members` to find the admin for each org
- Send reminder emails to org admin only (not all members)
- Group by `organization_id` (not `profile_id`) to prevent duplicate emails when an org has multiple members

---

## Implementation Notes for Researcher / Planner

- The `getOrgForUser(supabase, userId)` helper will be needed in multiple functions — consider extracting to `_shared/org.ts`
- `nextcloud-files` has the org lookup repeated in 4+ places (list, upload, mkdir, delete actions) — a shared helper at the top of the handler avoids duplication
- The `findProfilesForTask` function in `clickup-webhook` already has a clean return type `{ profileIds: string[], source: string }` — the org-based lookup should fit the same shape with `source: "org_members"`
- `invite-member` is a NEW function file added to the router — it does NOT exist yet
- The `auth.admin` methods require the Supabase service role key — already available as `SUPABASE_SERVICE_ROLE_KEY` env var in all Edge Functions
- `send-reminders` currently loops over `profiles` — the org-based rewrite loops over `organizations` and resolves the admin profile_id from `org_members`

---

## Canonical Refs

- `supabase/functions/fetch-clickup-tasks/index.ts` — primary function to update (clickup_list_ids lookup)
- `supabase/functions/fetch-single-task/index.ts` — access validation via org clickup_list_ids
- `supabase/functions/nextcloud-files/index.ts` — nextcloud_client_root lookup (repeated 4+ times)
- `supabase/functions/create-clickup-task/index.ts` — clickup_list_ids + clickup_chat_channel_id + role guard
- `supabase/functions/clickup-webhook/index.ts` — findProfilesForTask + support chat fan-out
- `supabase/functions/send-reminders/index.ts` — admin-only, org-grouped reminders
- `supabase/functions/post-task-comment/index.ts` — role guard (viewer 403)
- `supabase/functions/update-task-status/index.ts` — role guard (viewer 403)
- `supabase/functions/_shared/emailCopy.ts` — `invite` email copy already present
- `supabase/functions/main/index.ts` — router where `invite-member` must be registered
- `.planning/REQUIREMENTS.md` → ORG-BE-01 through ORG-BE-11

---

## Out of Scope for Phase 10

- OrgContext / useOrg hook (Phase 11)
- /organisation admin page (Phase 12)
- Dropping legacy profile_id fallbacks (Phase 13)
- onboard-client.ts rewrite (Phase 13)
- Frontend role-based UI guards (Phase 11)
