# Research Summary: v2.0 Organisations Milestone

**Project:** KAMANIN Client Portal — v2.0 Organisations
**Domain:** B2B multi-tenant org layer retrofit onto single-user Supabase app
**Researched:** 2026-04-14
**Confidence:** HIGH

---

## Executive Summary

This milestone retrofits a multi-user organisation layer onto a running production portal where all data is currently `profile_id`-scoped. The approach is additive-first and zero-downtime: new tables (`organizations`, `org_members`) are created alongside existing ones, data is migrated, RLS policies are swapped, and old columns are dropped only after production validation. The existing stack handles everything — no new npm packages, no new auth provider, no schema overhaul beyond what the `organizations.md` idea doc already specifies.

The single most important constraint is GoTrue SMTP being broken on this self-hosted instance. `inviteUserByEmail()` is NOT viable. The correct invite flow is: `auth.admin.createUser({ email_confirm: true })` + `auth.admin.generateLink({ type: 'recovery' })` + Mailjet delivery via the existing `send-mailjet-email` Edge Function. The `auth-email` hook already has an `"invite"` case waiting to be used.

The main execution risk is migration ordering. Six Edge Functions all read org-level config from `profiles` today. If any function is updated before the data migration runs, it reads NULL and fails silently. Every Edge Function update must include a dual-read fallback and be deployed one at a time (volume-mount deploy model: one bad file takes down all functions).

---

## Stack Additions

No new npm packages or external services required.

| Addition | Purpose | Notes |
|----------|---------|-------|
| `invite-member` Edge Function (new) | Creates auth user + generates recovery link + sends Mailjet invite | Service role; `auth-email` hook already has `"invite"` case |
| `auth.admin.createUser()` | Creates confirmed user without GoTrue SMTP | Already in `@supabase/supabase-js` |
| `auth.admin.generateLink({ type: 'recovery' })` | Generates set-password URL without GoTrue SMTP | Verify `redirect_to` behavior on Coolify GoTrue version |
| `OrgContext` / `useOrg` hook | Exposes `organization`, `orgRole`, `isAdmin`, `isMember` | New frontend context; one extra query at login |
| `user_org_ids()` SQL function | SECURITY DEFINER STABLE RLS helper | Must use `(SELECT user_org_ids())` wrapper in policies |
| `user_org_role(org_id)` SQL function | Admin-gating in RLS policies | Companion to `user_org_ids()` |
| `/passwort-setzen` route | Invite landing page — reads session from URL hash | Minimal page; `onAuthStateChange` + `updateUser({ password })` |
| `/organisation` route | Team management page; admin-only | New module `src/modules/organisation/` |

---

## Feature Table Stakes

| Feature | Complexity | Notes |
|---------|-----------|-------|
| Team list on /organisation (name, email, role, joined date) | Low | — |
| Invite member by email → set-password flow | Medium | `createUser` + `generateLink`, NOT `inviteUserByEmail` |
| Role assignment at invite (admin / member / viewer) | Low | Dropdown in InviteMemberDialog |
| Role change after invite | Low | Cannot demote self; last-admin guard required |
| Remove member from org | Low | Confirmation dialog; last-admin guard |
| Role-based UI hiding (viewer cannot create/approve) | Medium | Frontend guards + RLS + Edge Function checks — both layers |
| Org-scoped shared credits (one pool per org) | High | DB migration: `credit_packages.organization_id` |
| Org-scoped workspaces (all members see same sidebar) | Medium | `client_workspaces.organization_id` |
| Org-scoped ClickUp config (list_ids, chat_channel, nextcloud root) | Medium | Move from `profiles` to `organizations`; update 5 Edge Functions |
| Sidebar "Organisation" link (admin-only, Utilities zone) | Low | Hugeicons building icon |

**Defer to v2+:** Audit logs, granular permission editor, multi-org membership, SSO, org creation UI, per-module role overrides.

---

## Architecture: Build Order

### Phase 1: DB Foundation (no deploy, no downtime)
1. Create `organizations` + `org_members` tables
2. Create `user_org_ids()` + `user_org_role()` SECURITY DEFINER helpers (`SET search_path = ''`)
3. Add nullable `organization_id` FK to `credit_packages`, `credit_transactions`, `client_workspaces`, `profiles`
4. Data migration: one org per existing profile → admin in `org_members` → backfill FKs
5. Verify zero NULLs → add NOT NULL constraints
6. Add new org-scoped RLS policies alongside old ones (do NOT drop old yet)
7. Gate: `count(org_members) = count(profiles)` and no orgs with null `clickup_list_ids`

### Phase 2: Edge Functions (one at a time, health-check after each)
- `fetch-clickup-tasks` → read from `org.clickup_list_ids` (dual-read fallback to `profiles`)
- `fetch-single-task` → access check via org
- `nextcloud-files` → `org.nextcloud_client_root`
- `create-clickup-task` → org list_ids + chat_channel_id
- `clickup-webhook` → fan-out to `org_members` (batch, not N+1); dedup notifications
- `send-reminders` → admin-only digest per org
- Add `invite-member` function to main router

### Phase 3: Frontend — Auth Context + Hooks
- `OrgContext` with `organization`, `orgRole`, `isAdmin`, `isMember`
- `useWorkspaces` → query by `organization_id`
- `useCredits` → sum by `organization_id`
- Role-based guards on NewTicketDialog, Kostenfreigabe button

### Phase 4: Frontend — Organisation Page + Invite Flow
- `OrganisationPage` at `/organisation` (admin-only redirect)
- `OrgInfoSection`, `TeamSection`, `InviteMemberDialog`
- `/passwort-setzen` page — URL hash session + `updateUser({ password })`
- Sidebar link in Utilities zone

### Phase 5: Onboarding + Cleanup
- Rewrite `onboard-client.ts`: org → admin user → `org_members` → optional members
- Drop old `profile_id`-based RLS policies on `credit_packages`, `client_workspaces`
- Drop `profile_id` FK from `credit_packages`, `client_workspaces`
- Remove dual-read fallbacks from Edge Functions

---

## Top Pitfalls to Watch

**1. Invite email never arrives (GoTrue SMTP dead)**
Use `createUser({ email_confirm: true })` + `generateLink({ type: 'recovery' })`. Route email through `auth-email` hook → Mailjet. Never call `inviteUserByEmail`.

**2. Edge Function deploy takes down everything (volume mount)**
One syntax error in any file crashes the main router. Deploy one function at a time. Health-check after each.

**3. Edge Functions read NULL before data migration completes**
Every updated Edge Function must have dual-read fallback to `profiles`. Remove fallbacks only after verifying all org fields populated.

**4. Old RLS policies left active after migration (silent data leak)**
Permissive policies OR: removed member still reads data via old `profile_id` policy. Explicitly DROP old policies after validation. Verify with `SELECT policyname FROM pg_policies WHERE tablename IN ('credit_packages', 'client_workspaces') AND policyname LIKE '%profile_id%'`.

**5. `user_org_ids()` called per-row (query perf collapse)**
Use `USING (organization_id IN (SELECT user_org_ids()))` — the `SELECT` wrapper forces initPlan caching. Without it: function called per candidate row, ~15ms → 300ms+.

---

## Open Questions

Resolve before planning the affected phase.

| Question | Impact | Recommended Default |
|----------|--------|-------------------|
| `project_access` migration — new org members won't see existing projects | High | Copy `project_access` rows from org admin to new member at invite time |
| `support_messages` fan-out — N rows per member vs shared org table | High | N rows per member (consistent with `task_cache`) — decide before touching `clickup-webhook` |
| `send-reminders` strategy — one digest per org vs admin-only for v1 | Medium | Admin-only for v1; document upgrade path |
| `generateLink` `redirect_to` on this GoTrue version — test on staging first | Medium | Test before building invite UI |
| `notifications_type_check` constraint — extend for org events or email-only | Low-Medium | Extend constraint in Phase 1, OR route invite events email-only |

---

*Research completed: 2026-04-14*
*Ready for requirements: yes — resolve Open Questions before Phase 2 planning*
