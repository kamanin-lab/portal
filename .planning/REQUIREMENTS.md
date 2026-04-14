# Milestone v2.0: Organisations — Requirements

**Created:** 2026-04-14
**Branch:** `feature-organisation`
**Staging DB only:** all development against Cloud Supabase (`ahlthosftngdcryltapu`), NOT production

---

## v2.0 Requirements

### DB Foundation (ORG-DB)

- [x] **ORG-DB-01**: `organizations` table created with columns: `id`, `name`, `slug` (unique), `clickup_list_ids` (jsonb), `nextcloud_client_root` (text), `support_task_id` (text), `clickup_chat_channel_id` (text), `created_at`, `updated_at`
- [x] **ORG-DB-02**: `org_members` table created with columns: `id`, `organization_id` (FK → organizations), `profile_id` (FK → profiles), `role` (check: admin/member/viewer), `created_at`; unique constraint on (organization_id, profile_id)
- [x] **ORG-DB-03**: `user_org_ids()` SQL function created — `SECURITY DEFINER STABLE`, `SET search_path = ''`, returns `SETOF uuid` of org IDs for `auth.uid()`
- [x] **ORG-DB-04**: `user_org_role(org_id uuid)` SQL function created — `SECURITY DEFINER STABLE`, returns role text for current user in given org
- [x] **ORG-DB-05**: Nullable `organization_id` FK column added to `credit_packages`, `client_workspaces`, `profiles`; nullable `organization_id` added to `credit_transactions` (kept alongside `profile_id` for audit trail)
- [x] **ORG-DB-06**: Data migration executed: one org created per existing profile (name from profile, slug from email domain), profile inserted as admin in `org_members`, org fields populated from profile's `clickup_list_ids`/`nextcloud_client_root`/`support_task_id`/`clickup_chat_channel_id`
- [x] **ORG-DB-07**: After migration, NOT NULL constraints added on `organization_id` in `credit_packages` and `client_workspaces`; `profiles.organization_id` stays nullable for backward safety
- [x] **ORG-DB-08**: New org-scoped RLS policies added on `credit_packages` and `client_workspaces` using `(SELECT user_org_ids())` wrapper; old `profile_id = auth.uid()` policies kept in parallel during transition
- [x] **ORG-DB-09**: Migration verification gate: `count(org_members) = count(profiles)` passes; no org rows have NULL `clickup_list_ids`
- [x] **ORG-DB-10**: `notifications_type_check` constraint extended to include `member_invited` and `member_removed` event types

### Backend / Edge Functions (ORG-BE)

- [x] **ORG-BE-01**: `fetch-clickup-tasks` reads `clickup_list_ids` from `organizations` via `org_members`; dual-read fallback to `profiles` during transition
- [x] **ORG-BE-02**: `fetch-single-task` validates task access via org's `clickup_list_ids`; dual-read fallback
- [x] **ORG-BE-03**: `nextcloud-files` reads `nextcloud_client_root` from `organizations`; dual-read fallback
- [x] **ORG-BE-04**: `create-clickup-task` reads `clickup_list_ids` and `clickup_chat_channel_id` from org; dual-read fallback
- [x] **ORG-BE-05**: `clickup-webhook` `findProfilesForTask()` resolves profiles via `org_members` (all members of the org that owns the list); notifications fanned out to all org members; dedup prevents duplicate bell entries per profile per event
- [x] **ORG-BE-06**: `clickup-webhook` support chat fan-out: when new comment on `support_task_id`, inserts N rows in `comment_cache` — one per org member (consistent with `task_cache` pattern)
- [x] **ORG-BE-07**: `send-reminders` sends reminder emails to org admin only (v1); groups by `organization_id`
- [ ] **ORG-BE-08**: New `invite-member` Edge Function added to main router: accepts `{ organizationId, email, role }`, calls `auth.admin.createUser({ email_confirm: true })`, calls `auth.admin.generateLink({ type: 'recovery', email, redirectTo: '/passwort-setzen' })`, sends invite email via `send-mailjet-email` using existing `auth-email` `"invite"` email copy, inserts row in `org_members`, copies `project_access` rows from org admin to new member
- [ ] **ORG-BE-09**: `invite-member` enforces role-based guard: only org admin can invite; non-admin request returns 403
- [ ] **ORG-BE-10**: `invite-member` handles duplicate invite gracefully (user already in org → return 409 with descriptive error)
- [x] **ORG-BE-11**: Edge Function role enforcement: `create-clickup-task`, `post-task-comment`, `update-task-status` check caller's `org_members.role`; viewer role returns 403 on mutating operations

### Frontend — Auth & Data Layer (ORG-FE-AUTH)

- [ ] **ORG-FE-AUTH-01**: `OrgContext` created — provides `organization`, `orgRole`, `isAdmin`, `isMember`, `isViewer` to all components; fetched once at login and cached in React Query
- [ ] **ORG-FE-AUTH-02**: `useWorkspaces` hook updated to query `client_workspaces` by `organization_id` (via org from `OrgContext`)
- [ ] **ORG-FE-AUTH-03**: `useCredits` hook updated to fetch credit balance summed by `organization_id`
- [ ] **ORG-FE-AUTH-04**: `NewTicketDialog` hidden for viewer role (cannot create tasks)
- [ ] **ORG-FE-AUTH-05**: Kostenfreigabe (credit approval) button hidden for viewer role
- [ ] **ORG-FE-AUTH-06**: Task status action buttons (Freigeben, Änderungen anfordern) hidden for viewer role

### Frontend — Organisation Admin Page (ORG-FE-UI)

- [ ] **ORG-FE-UI-01**: `/organisation` route added; non-admin users are redirected to `/tickets` on access
- [ ] **ORG-FE-UI-02**: `OrganisationPage` renders `OrgInfoSection` (org name, slug, credit package info — read-only) and `TeamSection` (member table)
- [ ] **ORG-FE-UI-03**: `TeamSection` shows a table with columns: Name, Email, Rolle, Hinzugefügt am; pending invites show "Einladung ausstehend" in the Rolle column
- [ ] **ORG-FE-UI-04**: `InviteMemberDialog` (admin-only) accepts email + role (Mitglied / Betrachter); submits to `invite-member` Edge Function; shows success/error toast
- [ ] **ORG-FE-UI-05**: Admin can change a member's role (Mitglied ↔ Betrachter) from the team table; cannot demote themselves; cannot demote last admin
- [ ] **ORG-FE-UI-06**: Admin can remove a member from the org; cannot remove themselves if last admin; confirmation dialog required
- [ ] **ORG-FE-UI-07**: `/passwort-setzen` route created — reads GoTrue session from URL hash on mount, shows password-set form, calls `supabase.auth.updateUser({ password })`, redirects to `/tickets` on success
- [ ] **ORG-FE-UI-08**: Sidebar "Ihre Organisation" link added to Utilities zone (visible to admin only); Hugeicons building/office icon

### Onboarding + Cleanup (ORG-CLEANUP)

- [ ] **ORG-CLEANUP-01**: `onboard-client.ts` script rewritten to create org first, then admin user, then `org_members` row; accepts optional `members[]` array for initial team setup
- [ ] **ORG-CLEANUP-02**: Old `profile_id = auth.uid()` RLS policies dropped from `credit_packages` and `client_workspaces` after production validation
- [ ] **ORG-CLEANUP-03**: `profile_id` FK column dropped from `credit_packages` and `client_workspaces` (retained in `credit_transactions` for audit trail)
- [ ] **ORG-CLEANUP-04**: Dual-read fallbacks (`org?.field ?? profile?.field`) removed from all 4 updated Edge Functions
- [ ] **ORG-CLEANUP-05**: `profiles` columns `clickup_list_ids`, `nextcloud_client_root`, `support_task_id`, `clickup_chat_channel_id` dropped (moved to `organizations`)

---

## Architecture Decisions (captured during requirements)

| Decision | Rationale |
|----------|-----------|
| `inviteUserByEmail` NOT used | GoTrue SMTP broken on self-hosted; use `createUser` + `generateLink({ type: 'recovery' })` instead |
| `project_access` copied from admin at invite time | New members automatically see org projects; simpler than migrating FK to org_id |
| `comment_cache` fan-out (N rows per member) | Consistent with `task_cache` pattern; supports future per-user read-state |
| Dual-read fallback in Edge Functions | Zero-downtime: functions work before and after data migration; fallbacks removed in cleanup phase |
| `(SELECT user_org_ids())` wrapper in RLS | Forces Postgres initPlan caching — prevents per-row function calls and query performance collapse |
| Admin-only send-reminders for v1 | Simpler; upgrade path to per-member digest documented for v2.1 |
| Staging DB only throughout | feature-organisation branch targets Cloud Supabase staging; no production changes until full validation |

---

## Future Requirements (deferred)

- Per-member send-reminders digest (v2.1 — after admin-only v1 is validated)
- Granular per-module role overrides (e.g. `{ tickets: 'member', projects: 'viewer' }`)
- Org creation UI (admin creates their own org — no KAMANIN operator needed)
- Audit log for org membership changes
- Multi-org membership (one user in multiple orgs)
- SSO / SAML integration
- Billing admin role (separate from org admin)
- Agency/SaaS layer (`agency_id` on `organizations`) — architecture supports this without rewrite

## Out of Scope (v2.0)

- Multi-tenant SaaS (multiple agencies) — single KAMANIN operator only
- Org creation via UI — KAMANIN onboards clients via `onboard-client.ts`
- Per-module role overrides — flat admin/member/viewer for all modules
- Magic link login — GoTrue SMTP broken; password login only
- Native mobile app — PWA handles this need

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ORG-DB-01 | Phase 9 | Complete |
| ORG-DB-02 | Phase 9 | Complete |
| ORG-DB-03 | Phase 9 | Complete |
| ORG-DB-04 | Phase 9 | Complete |
| ORG-DB-05 | Phase 9 | Complete |
| ORG-DB-06 | Phase 9 | Complete |
| ORG-DB-07 | Phase 9 | Complete |
| ORG-DB-08 | Phase 9 | Complete |
| ORG-DB-09 | Phase 9 | Complete |
| ORG-DB-10 | Phase 9 | Complete |
| ORG-BE-01 | Phase 10 | Complete |
| ORG-BE-02 | Phase 10 | Complete |
| ORG-BE-03 | Phase 10 | Complete |
| ORG-BE-04 | Phase 10 | Complete |
| ORG-BE-05 | Phase 10 | Complete |
| ORG-BE-06 | Phase 10 | Complete |
| ORG-BE-07 | Phase 10 | Complete |
| ORG-BE-08 | Phase 10 | Pending |
| ORG-BE-09 | Phase 10 | Pending |
| ORG-BE-10 | Phase 10 | Pending |
| ORG-BE-11 | Phase 10 | Complete |
| ORG-FE-AUTH-01 | Phase 11 | Pending |
| ORG-FE-AUTH-02 | Phase 11 | Pending |
| ORG-FE-AUTH-03 | Phase 11 | Pending |
| ORG-FE-AUTH-04 | Phase 11 | Pending |
| ORG-FE-AUTH-05 | Phase 11 | Pending |
| ORG-FE-AUTH-06 | Phase 11 | Pending |
| ORG-FE-UI-01 | Phase 12 | Pending |
| ORG-FE-UI-02 | Phase 12 | Pending |
| ORG-FE-UI-03 | Phase 12 | Pending |
| ORG-FE-UI-04 | Phase 12 | Pending |
| ORG-FE-UI-05 | Phase 12 | Pending |
| ORG-FE-UI-06 | Phase 12 | Pending |
| ORG-FE-UI-07 | Phase 12 | Pending |
| ORG-FE-UI-08 | Phase 12 | Pending |
| ORG-CLEANUP-01 | Phase 13 | Pending |
| ORG-CLEANUP-02 | Phase 13 | Pending |
| ORG-CLEANUP-03 | Phase 13 | Pending |
| ORG-CLEANUP-04 | Phase 13 | Pending |
| ORG-CLEANUP-05 | Phase 13 | Pending |
