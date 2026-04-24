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
- [x] **Phase 11: org-frontend-auth** — OrgContext + useOrg hook, update useWorkspaces + useCredits, role-based UI guards for viewer role (completed 2026-04-15)
- [x] **Phase 12: org-admin-page** — /organisation admin page, InviteMemberDialog, role management, member removal, /passwort-setzen route, sidebar link (completed 2026-04-15)
- [x] **Phase 13: org-onboarding-cleanup** — Rewrite onboard-client.ts, drop legacy RLS policies and FK columns, remove dual-read fallbacks (completed 2026-04-15)

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
**Plans**: 4 plans

**Plans**: 4 plans
Plans:
- [x] 13-01-PLAN.md — Frontend cleanup: remove profile org-config reads (Wave 1)
- [x] 13-02-PLAN.md — Edge Function dual-read removal (Wave 1)
- [x] 13-03-PLAN.md — DB migration: drop legacy RLS policies and columns (Wave 2)
- [x] 13-04-PLAN.md — Onboarding script org-first rewrite (Wave 1)

### Phase 14: role-based-guards — Hide Freigeben/approval actions for viewer role in projects module; filter task_review, step_ready, and reminder emails to admin/member only (exclude viewer from action-required notifications)

**Goal:** Close viewer-role gaps left after Phase 11 — hide StepActionBar action buttons from viewers in the projects module, and filter step_ready/task_review emails to admin/member roles only (bell notifications unchanged).
**Requirements**: VIEWER-GUARD-FE-01, VIEWER-GUARD-BE-01
**Depends on:** Phase 13
**Plans:** 2/2 plans complete

Plans:
- [x] 14-01-PLAN.md — Frontend viewer guard on StepActionBar (Wave 1, TDD)
- [x] 14-02-PLAN.md — Backend email filtering for step_ready + task_review (Wave 1)

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
| 13. org-onboarding-cleanup | 4/4 | Complete   | 2026-04-15 |
| 14. role-based-guards | 2/2 | Complete   | 2026-04-15 |

---

# Milestone v3.0: MCP Apps Platform

**Started:** 2026-04-23
**Target:** 2 focused working days per `docs/ideas/REVENUE_INTELLIGENCE_V2_PLAN.md` §8
**Goal:** Reusable MCP Apps infrastructure (build pipeline + token bridge + WordPress companion plugin pattern) with Revenue Intelligence v2 as the first production-grade application on that platform
**Branch:** `staging` (merge to `main` after Phase 20 + Yuri's qualitative "wow" verdict)
**First target client:** Summerfield on local DDEV only. MBM production rollout = separate future milestone.

## Success Criteria for v3.0

1. Dashboard at 09:00, 11:00, 14:00, 17:00 never shows universally negative pace — the today-vs-yesterday −85% bug is not reproducible
2. All 4 blocks render end-to-end under 2s on Summerfield DDEV
3. 4 consecutive test Monday briefing emails arrive at 08:00 ±5 min Europe/Berlin with zero duplicates
4. Platform reusability — a second hypothetical MCP App can be built on the same pipeline + token bridge + companion plugin pattern without re-designing infrastructure (paper-review test)
5. Yuri's qualitative "wow / not-wow" verdict on Block 2 (heatmap) on seeded Summerfield data within 1 week of widget completion
6. Zero regression on the portal — `RevenueIntelligencePage.tsx` shows zero TypeScript diff; v1 `daily_briefing` path continues working during transition
7. Code quality gates — all SQL parameterised, composer deps pinned, WP 6.9+ guard active, Application Password rotation runbook in `docs/DECISIONS.md`
8. Ready for MBM rollout — seeded Summerfield analytics mathematically comparable to MBM's known data shape

## Phases

- [x] **Phase 15: Local Dev + Synthetic Seeder** — DDEV Summerfield clone up with plugins active and seeder producing 1260 realistic furniture orders; blocks everything downstream (completed 2026-04-24)
- [ ] **Phase 16: kmn-revenue-abilities WP Plugin** — WordPress companion plugin with 5 abilities exposed via MCP Adapter `/wp-json/mcp/kmn-revenue`
- [ ] **Phase 17: kamanda-mcp Server Expansion** — 5 new MCP tools wrapping WP abilities, `daily_briefing` refactored to Promise.allSettled fan-out, proxy whitelist updated
- [ ] **Phase 18: MCP UI Resource Build Pipeline** — Vite single-file widget build + 12-token postMessage bridge; reusable platform layer
- [ ] **Phase 19: Revenue Intelligence Widget v2** — 4-block dashboard (run-rate, heatmap, repeat, basket/AOV) replaces v1 widget, zero portal TypeScript diff
- [ ] **Phase 20: Monday Briefing Email** — Edge Function scheduled Mondays 08:00 Berlin, pulls `weekly_briefing_data`, sends HTML briefing via Mailjet

## Phase Details

### Phase 15: Local Dev + Synthetic Seeder
**Goal**: A working Summerfield DDEV environment with both WP plugins active, Application Password issued, and 1260 realistic furniture orders seeded — so every downstream ability can be developed and validated against data that mirrors MBM's shape
**Depends on**: None (milestone start)
**Blocks**: Phase 16, Phase 17, Phase 19, Phase 20
**Requirements**: DEV-01, DEV-02, DEV-03, DEV-04, DEV-05, DEV-06, DEV-07, DEV-08, DEV-09, SEED-01, SEED-02, SEED-03, SEED-04, SEED-05, SEED-06, SEED-07, SEED-08, SEED-09
**Deliverable** (concrete acceptance test):
  1. `curl -sk https://summerfield.ddev.site/wp-json/` returns 200 with mkcert-trusted TLS — no cert warnings in browser
  2. `ddev wp plugin list --status=active` lists both `kmn-revenue-abilities` and `maxi-ai`
  3. `ddev wp kmn seed --weeks=12 --daily-avg=15` completes in ≤ 5 minutes and produces `count(wp_wc_order_stats) ≈ 1100` paid orders with Thursday as highest DOW and hour peak inside {10, 11, 19, 20, 21}
  4. `ddev wp kmn seed reset` deletes exactly the `_kmn_test_order = 1` rows and nothing else (idempotent)
  5. `mcp-poc` process can reach `https://summerfield.ddev.site` with Basic Auth using the generated Application Password (verified via `curl` probe from Node with `NODE_EXTRA_CA_CERTS`)
**Notes**: No parallelization possible before this phase — all downstream abilities, tools, and widgets require real seeded data on a reachable DDEV endpoint. Environment guard in seeder (SEED-07) prevents accidental execution outside `*.ddev.site`.

### Phase 16: kmn-revenue-abilities WP Plugin
**Goal**: A WordPress companion plugin registering 5 MCP abilities that return schema-correct, cached, parameterised SQL results for Summerfield's seeded data — establishing the reusable MCPAPP-WP pattern for future client-data bridges
**Depends on**: Phase 15
**Blocks**: Phase 17, Phase 20
**Requirements**: MCPAPP-WP-01, MCPAPP-WP-02, MCPAPP-WP-03, ABIL-SCAF-01, ABIL-SCAF-02, ABIL-SCAF-03, ABIL-SCAF-04, ABIL-SCAF-05, ABIL-DEF-01, ABIL-DEF-02, ABIL-DEF-03, ABIL-DEF-04, ABIL-DEF-05, ABIL-DEF-06, ABIL-DEF-07, ABIL-QA-01, ABIL-QA-02, ABIL-QA-03, ABIL-QA-04, ABIL-QA-05
**Deliverable** (concrete acceptance test):
  1. `curl -u admin:APP_PASS -X POST https://summerfield.ddev.site/wp-json/mcp/kmn-revenue -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'` returns exactly 5 tools: `revenue-run-rate`, `weekly-heatmap`, `repeat-metrics`, `market-basket`, `weekly-briefing-data`
  2. Each `tools/call` on those 5 tools returns a response whose shape validates against the ability's output JSON Schema (verified by `scripts/verify-wp-bridge.sh`)
  3. `revenue-run-rate` on seeded data returns `confidence: "medium"` or `"high"` with a numeric `projected_revenue` field — no raw SQL errors, no null-ref crashes
  4. `market-basket` returns `mode: "market_basket_product"` on seeded data (≥100 multi-item orders exist per SEED-04) with at least one non-empty `basket_pairs` entry containing Boxspringbett→Lattenrost
  5. Running both `kmn-revenue-abilities` and `maxi-ai` plugins simultaneously, `tools/list` on each endpoint returns only that plugin's own tools (no cross-contamination, ABIL-QA-05)
  6. 401 response for wrong Application Password; 403 response for authenticated user without `manage_woocommerce` (ABIL-QA-02)
  7. Every ability response completes within 2s budget (`SET SESSION MAX_EXECUTION_TIME=2000` active, ABIL-QA-03)
**Notes**: Can run in parallel with Phase 17 once Phase 15 is complete — this is PHP, Phase 17 is TypeScript, no code overlap. MCPAPP-WP-01..03 documentation deliverables embedded here: plugin pattern reference in `docs/ideas/WP_BRIDGE_ARCHITECTURE.md`, Adapter integration documented, App Password rotation runbook appended to `docs/DECISIONS.md`.

**Plans:** 1/3 plans executed

Plans:
- [x] 16-01-PLAN.md — Plugin bootstrap + MCP server registration + shared infra (autonomous)
- [ ] 16-02-PLAN.md — 4 read abilities: weekly-heatmap, repeat-metrics, revenue-run-rate, market-basket (autonomous)
- [ ] 16-03-PLAN.md — weekly-briefing-data orchestrator + verify scripts + Maxi coexistence test (human-verify checkpoint)

### Phase 17: kamanda-mcp Server Expansion
**Goal**: The MCP server at `G:/01_OPUS/Projects/mcp-poc` exposes 5 new tools that proxy the WP abilities, refactors `daily_briefing` to resilient fan-out, and aligns the portal's MCP proxy whitelist with the new tool surface
**Depends on**: Phase 15 (DDEV reachable with Application Password)
**Blocks**: Phase 19 (widget needs `daily_briefing` v2 fan-out), Phase 20 (email needs `weekly_briefing_data` tool exposed)
**Requirements**: MCPS-01, MCPS-02, MCPS-03, MCPS-04, MCPS-05, MCPS-06, MCPS-07, PORT-01
**Deliverable** (concrete acceptance test):
  1. `mcp-poc` process started locally, MCP Inspector connects, `tools/list` returns: 5 new tools (`revenue_run_rate`, `weekly_heatmap`, `repeat_metrics`, `market_basket_or_aov`, `weekly_briefing_data`) + retained legacy tools (`revenue_today`, `payment_attention_orders`) + removed tools (`stuck_orders`, `low_stock_products`, `incomplete_orders` no longer present)
  2. `tools/call daily_briefing {}` triggers exactly 4 parallel calls via `Promise.allSettled` to WP bridge (run-rate, heatmap, repeat, basket); if any one is manually sabotaged with a 500, the response still returns 3 successful blocks + one `{ status: "error" }` block — whole tool does NOT fail
  3. `daily_briefing` response includes `_meta["openai/outputTemplate"]` pointing at `ui://widgets/daily-briefing.html`
  4. New env vars `WOOCOMMERCE_WP_USER`, `WOOCOMMERCE_WP_APP_PASS`, `KMN_BRIDGE_URL` documented in `mcp-poc/.env.example`; distinct from pre-existing `WP_MCP_USER`/`WP_MCP_APP_PASS` (MCPS-07 no-coupling assertion)
  5. `supabase/functions/mcp-proxy/index.ts` ALLOWED_TOOLS list updated: contains the 5 new tool names, does NOT contain `incomplete_orders`; deployed to staging Cloud Supabase via CI
**Notes**: Can run in parallel with Phase 16 (different language stacks, different repos). PORT-01 mcp-proxy whitelist update lands here because it's coupled to the tool renames and is a trivial single-file diff. PORT-02..05 deliberately defer to Phase 19 where they are part of widget integration.

### Phase 18: MCP UI Resource Build Pipeline
**Goal**: A reusable Vite single-file build pipeline for React+Tailwind+Motion widgets plus a bidirectional postMessage token bridge — this is the platform layer that makes Revenue Intelligence v2 possible and future MCP Apps trivial
**Depends on**: Phase 15 (local dev environment for standalone widget dev)
**Blocks**: Phase 19 (widget uses this pipeline + bridge)
**Requirements**: MCPAPP-BUILD-01, MCPAPP-BUILD-02, MCPAPP-BUILD-03, MCPAPP-BUILD-04, MCPAPP-BUILD-05, MCPAPP-BUILD-06, MCPAPP-BUILD-07, MCPAPP-TOKEN-01, MCPAPP-TOKEN-02, MCPAPP-TOKEN-03, MCPAPP-TOKEN-04, MCPAPP-TOKEN-05, MCPAPP-TOKEN-06, MCPAPP-TOKEN-07, MCPAPP-TOKEN-08
**Deliverable** (concrete acceptance test):
  1. `cd mcp-poc && npm run build` succeeds and produces exactly one self-contained `dist/index.html` file per widget directory; opening that file offline in a browser shows a rendered React component with working Tailwind styles (CSS inlined, not linked)
  2. Single-file artifact gzipped size measured via `gzip -c dist/index.html | wc -c` reports ≤ 300 KB (MCPAPP-BUILD-04 budget)
  3. `npm run dev` on a widget serves at `http://localhost:5174/` with HMR working and a mock-host harness that posts fake tokens; widget applies tokens to `documentElement` CSS vars visibly (hot-reload styling works standalone) (MCPAPP-BUILD-06)
  4. In portal + sandbox-proxy smoke test: widget posts `kmn/theme/request`, sandbox-proxy relays to parent window, portal responds with `kmn/theme/set` carrying 12 tokens (bg, surface, fg, muted, subtle, accent, success, danger, warning, border, radius-md, radius-lg), widget applies them via `document.documentElement.style.setProperty(k, v)` — verified by Chrome DevTools inspecting computed styles after load
  5. Widget falls back to bundled defaults when no theme reply arrives within 300ms — tested by opening `dist/index.html` standalone (no parent frame)
  6. `src/shared/styles/widget-tokens.ts` exists and exports a typed constant covering exactly the 12-token subset of `tokens.css` (MCPAPP-TOKEN-07)
  7. Protocol-version mismatch handling: widget receiving `kmn/theme/set` with `protocolVersion: 2` logs a console warning and stays on bundled defaults (MCPAPP-TOKEN-08)
**Notes**: This phase can start in parallel with Phase 19 design/spec work, but Phase 19's final integrated widget cannot build without this pipeline. Preact/compat fallback (MCPAPP-BUILD-05) documented here but only exercised if React bundle busts the 300 KB budget.

### Phase 19: Revenue Intelligence Widget v2
**Goal**: The production-grade 4-block dashboard replaces the v1 `daily_briefing` widget — eliminating the today-vs-yesterday −85% methodology bug — via a zero-diff drop-in at the same `ui://widgets/daily-briefing.html` URI
**Depends on**: Phase 17 (`daily_briefing` fan-out available), Phase 18 (build pipeline + token bridge working)
**Blocks**: None (final v3.0 portal-facing deliverable)
**Requirements**: WIDG-STRUCT-01, WIDG-STRUCT-02, WIDG-STRUCT-03, WIDG-STRUCT-04, WIDG-STRUCT-05, WIDG-BLOCK-01, WIDG-BLOCK-02, WIDG-BLOCK-03, WIDG-BLOCK-04, WIDG-BLOCK-05, WIDG-QA-01, WIDG-QA-02, WIDG-QA-03, WIDG-QA-04, WIDG-QA-05, PORT-02, PORT-03, PORT-04, PORT-05
**Deliverable** (concrete acceptance test):
  1. Loading the Umsatz-Intelligenz page in the portal renders 4 distinct blocks in order: HeuteBlock (run-rate), HeatmapBlock (7×24), RepeatBlock, BasketOrAovBlock — verified against Summerfield DDEV seeded data
  2. `PerformanceObserver` measurement from `daily_briefing` tool call start to widget `onSizeChanged` fire: ≤ 2s (WIDG-QA-01)
  3. Dashboard loaded at four clock times (09:00, 11:00, 14:00, 17:00 on the same seeded day): none of the four renders shows universally negative pace indicator (WIDG-QA-02 — the bug fix verification)
  4. With one ability manually sabotaged (service returns 500), the widget renders 3 healthy blocks plus a "Daten nicht verfügbar" skeleton for the failed block — no blank widget, no full error screen (WIDG-QA-03)
  5. BasketOrAovBlock conditional render verified: with full seeded data renders `market_basket_product` mode (shows support/confidence/lift); with fixture `?mock=basket-aov` forced to <30 multi-item renders `aov_bands` mode with share-of-count + share-of-revenue bars
  6. `git diff src/modules/revenue-intelligence/components/RevenueIntelligencePage.tsx` after v2 deployment: empty diff — zero TypeScript changes in portal (PORT-04)
  7. `public/sandbox-proxy.html` includes the `kmn/theme/*` bidirectional relay block (PORT-02); portal theme publisher survives multiple widget mounts (PORT-03 — mount, unmount, remount still propagates tokens)
  8. `McpErrorBoundary` wrapping AppRenderer catches a forced throw and renders a German error with reload button (PORT-05)
  9. All user-facing text in German (WIDG-QA-04); single-file dist ≤ 300 KB gz (WIDG-QA-05)
**UI hint**: yes
**Notes**: Design/spec work (block layouts, formatters, mock-host variants) can start while Phase 18 pipeline stabilises. PORT-02..05 live here because they are coupled to widget embedding behaviour; PORT-01 already landed in Phase 17.

### Phase 20: Monday Briefing Email
**Goal**: An automated Monday 08:00 Europe/Berlin HTML email lands in Yuri's inbox with last-week revenue summary, best slot, repeat metrics, and top 3 products — validating the full Edge Function → MCP server → WP ability → email chain before MBM rollout
**Depends on**: Phase 16 (`kmn/weekly-briefing-data` ability exists), Phase 17 (`weekly_briefing_data` MCP tool exposed)
**Blocks**: None
**Requirements**: EMAIL-01, EMAIL-02, EMAIL-03, EMAIL-04, EMAIL-05, EMAIL-06
**Deliverable** (concrete acceptance test):
  1. `supabase/functions/send-weekly-revenue-briefing/index.ts` deployed; manual invoke via `curl` produces a German HTML email arriving at Yuri's inbox within 30s — subject line, revenue summary section, best hour slot callout, repeat rate with benchmark, top-3 products list, portal CTA link all rendered correctly per `REVENUE_INTELLIGENCE_V2_PLAN.md` §4 wireframe (EMAIL-04, EMAIL-06)
  2. pg_cron schedule configured for Mondays 06:00 UTC; Berlin timezone guard inside the function confirms via logged `Intl.DateTimeFormat('de-DE', {timeZone: 'Europe/Berlin'})` that execution only proceeds within target window — verified by 4 consecutive Mondays of real cron execution producing delivery at 08:00 ±5 min Berlin with zero duplicates (EMAIL-02)
  3. Function performs a single MCP tool call to `weekly_briefing_data` via MCP proxy (single round-trip, not per-block fan-out from caller side) (EMAIL-03)
  4. Delivery goes via existing `send-mailjet-email` infrastructure — no new SMTP integration; initial milestone sends only to Yuri (EMAIL-05)
  5. Function isolation: the existing `send-reminders` Edge Function is NOT modified — `git diff supabase/functions/send-reminders/` is empty (EMAIL-01 regression-risk mitigation)
**Notes**: Can run in parallel with Phase 18 and Phase 19 once Phase 16 + Phase 17 are complete. Production delivery to Nadine (MBM owner) is explicitly deferred to the MBM-rollout milestone; this milestone proves the plumbing with Yuri as the only recipient.

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 15. Local Dev + Synthetic Seeder | 2/2 | Complete   | 2026-04-24 |
| 16. kmn-revenue-abilities WP Plugin | 1/3 | In Progress|  |
| 17. kamanda-mcp Server Expansion | 0/? | Not started | — |
| 18. MCP UI Resource Build Pipeline | 0/? | Not started | — |
| 19. Revenue Intelligence Widget v2 | 0/? | Not started | — |
| 20. Monday Briefing Email | 0/? | Not started | — |
