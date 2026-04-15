# KAMANIN Portal — Roadmap

## Milestone 1: Production Portal

### Phase 1: Portal Frontend
- **Goal:** Full client portal with tickets, projects, support, account management
- **Status:** Complete
- **Directory:** phases/01-portal-frontend/

---

## Milestone 2: Projects Module v2

### Phases

- [x] **Phase 2: Critical Fixes** — Restore four permanently broken data pipelines so the Projects module shows real data (completed 2026-03-29)
- [x] **Phase 3: AI Enrichment** — Fix write-once enrichment lifecycle and surface AI content where clients can see it (completed 2026-03-29)
- [x] **Phase 4: PhaseTimeline Redesign** — Replace static dots with animated, informative, mobile-responsive timeline
- [x] **Phase 5: Data Unification & Polish** — Integrate ProjectContext, clarify FilesTab, add page transitions, enforce code standards (completed 2026-03-29)

---

## Phase Details

### Phase 2: Critical Fixes
**Goal**: The Projects module displays real data from the database instead of permanently empty views
**Depends on**: Phase 1
**Requirements**: CRIT-01, CRIT-02, CRIT-03, CRIT-04
**Success Criteria** (what must be TRUE):
  1. A client opening the Tasks tab of a project sees their actual project tasks — not a blank list
  2. A client opening the Messages tab sees live comment data — not a stale or empty feed
  3. The ContextStrip ETA field either shows a valid date or is absent — never renders a blank chip
  4. A step with failed or empty AI enrichment shows no expandable section — blank expand areas never appear
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Remove dead TasksPage pipeline + guard empty enrichment sections
- [x] 02-02-PLAN.md — Fix MessagesPage live data + remove broken ETA display

### Phase 3: AI Enrichment
**Goal**: AI enrichment stays current with task changes and its content reaches clients on the overview page
**Depends on**: Phase 2
**Requirements**: ENRICH-01, ENRICH-03, ENRICH-04
**Success Criteria** (what must be TRUE):
  1. When a task name or description changes in ClickUp, the next sync generates fresh enrichment for that step (not the stale version)
  2. The DynamicHero card shows the AI-generated "why it matters" text when enrichment exists — not an empty ClickUp description
  3. Steps within a chapter appear in the order defined by milestone_order in ClickUp — not alphabetically
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md — DB migration + Edge Function overhaul (hash detection, OpenRouter swap, sort_order) + DynamicHero enrichment display

### Phase 4: PhaseTimeline Redesign
**Goal**: The phase timeline communicates project progress clearly on all screen sizes with fluid animation
**Depends on**: Phase 3
**Requirements**: TIMELINE-01, TIMELINE-02, TIMELINE-03, TIMELINE-04, TIMELINE-05
**Success Criteria** (what must be TRUE):
  1. Phase nodes are visually distinct — completed, active, and future states are immediately readable without guessing
  2. Connector lines between phases fill proportionally to show how many steps in that phase are done
  3. Switching between phases or completing a step animates smoothly with Motion spring transitions — no instant jumps
  4. On a phone (< 768px), the timeline shows one phase at a time with prev/next navigation — no horizontal scroll or overflow
  5. Hovering a phase node shows a tooltip with the chapter's narrative description text
**Plans**: 3 plans

Plans:
- [x] 04-00-PLAN.md — Wave 0 test scaffold (PhaseTimeline.test.tsx with failing stubs for TIMELINE-01 through TIMELINE-05)
- [x] 04-01-PLAN.md — Tooltip primitive + PhaseConnector + PhaseNode rewrite (phase colors, Motion animations, tooltip)
- [x] 04-02-PLAN.md — PhaseTimeline desktop/mobile rewrite + unit tests + visual verification

### Phase 5: Data Unification & Polish
**Goal**: Project files show real Nextcloud data, tab transitions animate smoothly, and the PhaseTimeline has a proper loading skeleton
**Depends on**: Phase 4
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. A client on the OverviewPage can read the project context section — and an operator can manage its entries without database access
  2. The FilesTab clearly states its data source and links point to the correct destination — no ambiguity about where files comes from
  3. Navigating between project tabs fades and slides in — no jarring instantaneous content swaps
  4. While project data is loading, the PhaseTimeline shows a skeleton placeholder — never a blank space or broken layout
  5. ProjectContextAdminPanel is under 150 lines with MemoryEntryForm extracted as a separate component
**Plans**: 4 plans

Plans:
- [x] 05-00-PLAN.md — Wave 0 test scaffolds (FilesTab, StepFilesTab, OverviewTabs, PhaseTimeline skeleton stubs)
- [x] 05-01-PLAN.md — FilesTab + StepFilesTab Nextcloud rewrite with slugify utility
- [x] 05-02-PLAN.md — Motion tab transitions + PhaseTimeline loading skeleton
- [x] 05-03-PLAN.md — Webhook auto-mkdir on taskCreated + env var verification

### Phase 6: Triage Agent
**Goal**: New ClickUp tasks in monitored lists are automatically assessed by an AI agent and get a structured cost/time estimate comment within 15 seconds of creation
**Depends on**: Phase 5
**Requirements**: TRIAGE-01, TRIAGE-02, TRIAGE-03, TRIAGE-04, TRIAGE-05, TRIAGE-06
**Success Criteria** (what must be TRUE):
  1. A task created in a monitored ClickUp list receives a `[Triage]` comment with type, complexity, hours, credits, confidence, and reasoning within 15 seconds
  2. A client creating a task via the portal gets the same triage result as a manually created task
  3. When `wp_mcp_url` is configured for the task's client, the triage comment includes a "Site context" line with real WordPress data
  4. When `wp_mcp_url` is null or Maxi AI Core is unreachable, triage completes successfully without site context (`audit_fetched = false`)
  5. A developer replying `[approve]`, `[approve: Xh Ycr]`, or `[reject: reason]` updates the `agent_jobs` row status correctly
  6. Tasks in non-monitored lists are silently ignored — no `agent_jobs` row created
**Plans**: 4 plans

Plans:
- [x] 06-01-PLAN.md — DB migration (agent_jobs + wp_mcp_url) + skill file + wp-audit.ts helper
- [x] 06-02-PLAN.md — triage-agent Edge Function (OpenRouter + ClickUp comment + cost tracking)
- [x] 06-03-PLAN.md — clickup-webhook extension (taskCreated handler + HITL detection) + sync-staging-secrets update
- [x] 06-04-PLAN.md — .env.example + setup documentation

### Phase 7: Empfehlungen in Reminders and Meine Aufgaben with decision workflow
**Goal**: Clients receive reminder emails and a dedicated Meine Aufgaben surface for pending recommendations with an inline Ja/Nein/Später decision workflow
**Depends on**: Phase 6
**Requirements**: REMIND-01, REMIND-02, REMIND-03, UI-01, UI-02, UI-03, EMAIL-01
**Success Criteria** (what must be TRUE):
  1. The profiles table has a last_recommendation_reminder_sent_at column applied to both prod and staging
  2. send-reminders Edge Function runs a sendRecommendationReminders job on every cron tick with 5-day cooldown and 3-day minimum task age
  3. A client with pending recommendations older than 3 days receives a German recommendation_reminder email linking to /meine-aufgaben
  4. MeineAufgabenPage shows a RecommendationsBlock below the attention-task list when recommendations exist
  5. Clicking a recommendation opens TaskDetailSheet with the existing RecommendationApproval (Ja/Nein) UI
  6. A Später button on each recommendation card hides it for the current session without any backend write
  7. The empty state shows only when both attention tasks and visible recommendations are zero
**Plans**: 3 plans

Plans:
- [ ] 07-01-PLAN.md — DB migration + schema push + Wave 0 RED tests for MeineAufgabenPage and emailCopy
- [ ] 07-02-PLAN.md — Backend: recommendation_reminder emailCopy entry + sendRecommendationReminders job in send-reminders Edge Function
- [ ] 07-03-PLAN.md — Frontend: MeineAufgabenPage RecommendationsBlock + session-only Später snooze + human verify checkpoint

### Phase 8: Meine Aufgaben Redesign — 4-Tab Filter System
**Goal**: Replace MeineAufgabenPage flat list with a 4-tab filter system (Nachrichten, Kostenfreigabe, Warten auf Freigabe, Empfehlungen); remove recommendations from TicketsPage; 2-column task grid
**Depends on**: Phase 7
**Requirements**: UX-01, UX-02, UX-03, UX-04, UX-05
**Success Criteria** (what must be TRUE):
  1. MeineAufgabenPage shows 4 tab chips with count bubbles (Nachrichten, Kostenfreigabe, Warten auf Freigabe, Empfehlungen)
  2. Clicking each tab filters the 2-column task grid to that category only
  3. Default active tab is the first tab with count > 0
  4. RecommendationsBlock is removed from TicketsPage (belongs on MeineAufgaben only)
  5. All existing tests pass; MeineAufgabenPage and MeineAufgabenFilters each stay under 150 lines
**Plans**: 1 plan

Plans:
- [x] 08-01-PLAN.md — MeineAufgabenFilters component + MeineAufgabenPage rewrite + TicketsPage cleanup

---

## Milestone 3: Organisations

### Phases

- [ ] **Phase 9: org-db-foundation** — Create organizations + org_members tables, SQL helper functions, data migration to org-scoped schema, RLS transition
- [ ] **Phase 10: org-edge-functions** — Update 5 existing Edge Functions to read from organizations; add invite-member function; role enforcement on mutating ops
- [x] **Phase 11: org-frontend-auth** — OrgContext + useOrg hook, update useWorkspaces + useCredits, role-based UI guards for viewer role (completed 2026-04-15)
- [x] **Phase 12: org-admin-page** — /organisation admin page, InviteMemberDialog, role management, member removal, /passwort-setzen route, sidebar link (completed 2026-04-15)
- [ ] **Phase 13: org-onboarding-cleanup** — Rewrite onboard-client.ts, drop legacy RLS policies and FK columns, remove dual-read fallbacks

---

### Phase 9: org-db-foundation
**Goal**: The database carries the full organisation schema — tables, helper functions, migrated data, and dual-mode RLS — while existing portal functionality continues working without any code changes
**Depends on**: Phase 8
**Requirements**: ORG-DB-01, ORG-DB-02, ORG-DB-03, ORG-DB-04, ORG-DB-05, ORG-DB-06, ORG-DB-07, ORG-DB-08, ORG-DB-09, ORG-DB-10
**Success Criteria** (what must be TRUE):
  1. The `organizations` and `org_members` tables exist in staging and every existing profile has exactly one matching org and one admin row in `org_members`
  2. `SELECT user_org_ids()` and `SELECT user_org_role(org_id)` return correct results for any authenticated user in a psql session
  3. `credit_packages` and `client_workspaces` carry a non-null `organization_id` FK on every row; `profiles.organization_id` is populated for all existing profiles
  4. Both old `profile_id` RLS policies and new `organization_id` RLS policies are active in parallel — data is accessible via either path during transition
  5. The migration gate passes: `count(org_members) = count(profiles)` and no org row has a null `clickup_list_ids`
**Plans**: TBD

### Phase 10: org-edge-functions
**Goal**: All Edge Functions resolve their client-scoped configuration from `organizations` instead of `profiles`, with dual-read fallback ensuring zero downtime, and a new `invite-member` function handles the full invite flow
**Depends on**: Phase 9
**Requirements**: ORG-BE-01, ORG-BE-02, ORG-BE-03, ORG-BE-04, ORG-BE-05, ORG-BE-06, ORG-BE-07, ORG-BE-08, ORG-BE-09, ORG-BE-10, ORG-BE-11
**Success Criteria** (what must be TRUE):
  1. A task sync triggered for any existing client returns the correct task list — reading from org `clickup_list_ids` with no regressions versus the profile-based behaviour
  2. A new comment on the org's `support_task_id` triggers a `comment_cache` row for every org member — not just one profile
  3. The `invite-member` function accepts `{ organizationId, email, role }` from an admin caller and creates an auth user, generates a set-password link, and sends the invite email — returning 403 for non-admin callers and 409 for duplicate invites
  4. A viewer-role user calling `create-clickup-task`, `post-task-comment`, or `update-task-status` receives a 403 response
  5. `send-reminders` emails go only to the org admin (not all members) and group reminders by organisation
**Plans**: 6 plans
**UI hint**: no

Plans:
- [x] 10-01-PLAN.md — Create _shared/org.ts helper (Wave 0 prerequisite for all other plans)
- [x] 10-02-PLAN.md — Org dual-read + viewer guards: fetch-clickup-tasks, fetch-single-task, create-clickup-task, post-task-comment, update-task-status
- [x] 10-03-PLAN.md — nextcloud-files hoisted org lookup (7 profile reads → 1)
- [ ] 10-04-PLAN.md — clickup-webhook org-first findProfilesForTask + support chat N-member fan-out
- [ ] 10-05-PLAN.md — send-reminders org-grouped admin-only ticket and project reminders
- [ ] 10-06-PLAN.md — New invite-member Edge Function (admin guard, duplicate check, atomic rollback)

### Phase 11: org-frontend-auth
**Goal**: Every component in the portal knows the current user's organisation and role, shared data (workspaces, credits) is fetched at org scope, and viewer-role users cannot trigger mutating actions
**Depends on**: Phase 10
**Requirements**: ORG-FE-AUTH-01, ORG-FE-AUTH-02, ORG-FE-AUTH-03, ORG-FE-AUTH-04, ORG-FE-AUTH-05, ORG-FE-AUTH-06
**Success Criteria** (what must be TRUE):
  1. Any component using `useOrg()` receives `organization`, `orgRole`, `isAdmin`, `isMember`, and `isViewer` without an additional network call (data served from OrgContext cache)
  2. The sidebar workspaces section shows the same list for all members of the same org — not per-user data
  3. The credit balance displayed in the UI reflects the shared org pool, not an individual profile balance
  4. A user logged in with a viewer role sees no "Neue Aufgabe" button, no Kostenfreigabe approval button, and no task status action buttons (Freigeben / Änderungen anfordern)
**Plans**: 4 plans
**UI hint**: yes

Plans:
- [x] 11-01-PLAN.md — Migration: RLS on org_members/organizations + get_org_credit_balance RPC + staging apply
- [x] 11-02-PLAN.md — useOrg.ts (OrgContext + OrgProvider + hook) + App.tsx provider insert + unit tests
- [x] 11-03-PLAN.md — useWorkspaces + useCredits org-scope migration (cache keys, RPC, realtime)
- [x] 11-04-PLAN.md — Viewer role guards on TaskActions, CreditApproval, TicketsPage NewTaskButton + human verify

### Phase 12: org-admin-page
**Goal**: Organisation admins can manage their team from a dedicated portal page — inviting new members, changing roles, and removing members — while invited users can set their password via the invite landing page
**Depends on**: Phase 11
**Requirements**: ORG-FE-UI-01, ORG-FE-UI-02, ORG-FE-UI-03, ORG-FE-UI-04, ORG-FE-UI-05, ORG-FE-UI-06, ORG-FE-UI-07, ORG-FE-UI-08
**Success Criteria** (what must be TRUE):
  1. Navigating to `/organisation` as an admin renders the org info section (name, slug, credit info) and the full team member table (name, email, role, joined date)
  2. Non-admin users are immediately redirected away from `/organisation` — the page is never rendered for them
  3. An admin submitting the invite dialog with a valid email and role triggers the invite flow; the new member appears in the team table as "Einladung ausstehend"; the admin sees a success toast
  4. An admin can change a member's role (Mitglied ↔ Betrachter) and cannot demote themselves or the last admin — guard errors shown as toasts
  5. An admin can remove a member after confirming the confirmation dialog; cannot remove themselves if last admin
  6. A newly invited user opening the invite link lands on `/passwort-setzen`, sets a password, and is redirected to `/tickets` on success
**Plans**: TBD
**UI hint**: yes

### Phase 13: org-onboarding-cleanup
**Goal**: The onboarding script creates orgs as first-class entities, all legacy `profile_id`-based policies and columns are removed, and Edge Functions read exclusively from `organizations` with no fallback debt
**Depends on**: Phase 12
**Requirements**: ORG-CLEANUP-01, ORG-CLEANUP-02, ORG-CLEANUP-03, ORG-CLEANUP-04, ORG-CLEANUP-05
**Success Criteria** (what must be TRUE):
  1. Running `onboard-client.ts` with a new config creates an org, an admin user, an `org_members` row, and optional initial members — no manual SQL needed
  2. The `pg_policies` view shows zero rows with `profile_id = auth.uid()` policy conditions on `credit_packages` and `client_workspaces`
  3. The `credit_packages` and `client_workspaces` tables have no `profile_id` column; `credit_transactions` still has `profile_id` for audit trail
  4. All four updated Edge Functions (`fetch-clickup-tasks`, `fetch-single-task`, `nextcloud-files`, `create-clickup-task`) contain no `?? profile?.field` dual-read fallback patterns
  5. The `profiles` table has no `clickup_list_ids`, `nextcloud_client_root`, `support_task_id`, or `clickup_chat_channel_id` columns
**Plans**: TBD

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 2. Critical Fixes | 2/2 | Complete   | 2026-03-29 |
| 3. AI Enrichment | 1/1 | Complete   | 2026-03-29 |
| 4. PhaseTimeline Redesign | 3/3 | Complete |  |
| 5. Data Unification & Polish | 4/4 | Complete   | 2026-03-29 |
| 6. Triage Agent | 4/4 | Complete | 2026-04-14 |
| 7. Empfehlungen Reminders + MeineAufgaben | 3/3 | Complete | 2026-04-14 |
| 8. Meine Aufgaben Redesign — 4-Tab Filter | 0/1 | Planned | — |
| 9. org-db-foundation | 0/? | Not started | — |
| 10. org-edge-functions | 3/6 | In Progress|  |
| 11. org-frontend-auth | 4/4 | Complete   | 2026-04-15 |
| 12. org-admin-page | 5/5 | Complete   | 2026-04-15 |
| 13. org-onboarding-cleanup | 0/? | Not started | — |
