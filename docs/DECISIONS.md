# Architecture Decision Records

## ADR-001: New codebase instead of extending Lovable
**Date:** 2026-03-10
**Status:** Accepted

**Context:** Existing Lovable project (tasks/) has working Tasks/Support module but no Project Experience module. The new portal needs a different layout (collapsing sidebar vs. top header) and a new module structure.

**Decision:** Build fresh Vite + React project. Reuse all hooks, Edge Functions, and Supabase schema from Lovable project.

**Consequences:** Clean architecture, proper module separation. Hooks copied and adapted. No existing UI debt.

## ADR-002: Self-hosted Supabase as staging
**Date:** 2026-03-10
**Status:** Accepted

**Context:** Moving from Supabase cloud (yuezkvaasmfakxoqldmh) to self-hosted instance at portal.db.kamanin.at for cost control and data sovereignty.

**Decision:** Deploy schema to self-hosted PostgreSQL 15.8 instance. Use same Edge Function code.

**Consequences:** Need to redeploy Edge Functions to new instance. Schema bugs fixed during migration (handle_profile_list_change type error, missing on_auth_user_created trigger).

## ADR-003: Workspace Registry via `client_workspaces` table
**Date:** 2026-03-11
**Status:** Accepted

**Context:** Sidebar needs to know which modules are active per client. Hardcoding nav items doesn't scale to multi-client setup.

**Decision:** Create `client_workspaces` table (profile_id, module_key, display_name, icon, sort_order, is_active) with RLS. `useWorkspaces()` hook fetches active modules. `WorkspaceGuard` component protects routes.

**Consequences:** Dynamic sidebar. Module visibility configurable per client from DB. Requires seed data per user.

## ADR-004: Linear-style 3-zone sidebar
**Date:** 2026-03-11
**Status:** Accepted

**Context:** Flat nav list doesn't distinguish between global (cross-module) and workspace-specific (per-client) navigation items.

**Decision:** Three zones — Global (Inbox, Meine Aufgaben) / Workspaces (dynamic from client_workspaces) / Utilities (Hilfe). Zone headers with 10px uppercase labels. Icons-only at 56px, hover-expand to 260px.

**Consequences:** Clear separation of navigation intent. Workspaces zone scales to multiple module types.

## ADR-005: Task detail as Sheet (slide-over), not separate page
**Date:** 2026-03-11
**Status:** Accepted

**Context:** Lovable portal used a sheet pattern. Phase 3 accidentally introduced a separate `/tickets/:id` page which breaks context (loses filter state, requires navigation).

**Decision:** `TaskDetailSheet` uses `@radix-ui/react-dialog` in slide-over mode. State managed via URL search param `?taskId=xxx`. Sheet is rendered inside `TicketsPage` so filter/search state is preserved.

**Consequences:** Removed `/tickets/:id` route and `TicketDetailPage`. URL still deep-linkable.

## ADR-006: `mapStatus()` as single gateway for ClickUp status → portal status
**Date:** 2026-03-11
**Status:** Accepted

**Context:** `task_cache.status` stores raw ClickUp status strings ("client review", "to do"). Previous components compared raw strings against portal status keys — producing silent filter/badge failures.

**Decision:** All filter logic, status badge rendering, and action decisions go through `mapStatus(task.status)` from `status-mapping.ts`. Never compare `task.status` directly against portal keys. Added `status-dictionary.ts` with `mapClickUpStatus()`, `STATUS_LABELS`, `PRIORITY_LABELS`.

**Consequences:** Fixed silent bugs in TaskList filter and TaskActions needsAttention check. Single source of truth.

## ADR-007: Monorepo structure (app at root)
**Date:** 2026-03-12
**Status:** Accepted

**Context:** Project had nested structure: `kamanin-portal/` (React app) and `tickets/` (old Lovable codebase with Edge Functions). Pushing to GitHub required deciding on repo layout.

**Decision:** Flatten to monorepo — React app files at repo root, Edge Functions at `supabase/functions/`. Old directories (`kamanin-portal/`, `tickets/`) gitignored as local reference.

**Consequences:** Clean GitHub repo (`kamanin-lab/portal`). `npm install` and `npm run dev` work from root. Edge Functions path matches Supabase convention.

## ADR-008: Edge Functions deployed via volume mount (not Supabase CLI)
**Date:** 2026-03-12
**Status:** Accepted

**Context:** Supabase CLI always calls `api.supabase.com` — ignores any env var overrides. Cannot deploy to self-hosted instance. Edge-runtime container has no git/curl/wget.

**Decision:** Deploy Edge Functions by writing files to Coolify volume mount path (`/data/coolify/services/.../volumes/functions`). `main/index.ts` must be the official Supabase router (uses `EdgeRuntime.userWorkers.create()`), not a placeholder.

**Consequences:** No CI/CD for functions yet — manual deploy via Server Terminal or git clone on host. GitHub Actions workflows need updating for self-hosted target.

## ADR-009: Task creation from project context (reuse NewTicketDialog)
**Date:** 2026-03-13
**Status:** Accepted

**Context:** Users need to create ClickUp tasks directly from project pages (hero CTA, quick actions) without navigating to /tickets. Project tasks require chapter/phase assignment and go to a different ClickUp list than support tickets.

**Decision:** Reuse `NewTicketDialog` with a `mode` prop (`ticket` | `project`). In project mode, dialog receives `listId`, `chapters`, `phaseFieldId` from project config. Edge Function `create-clickup-task` routes to `project_task_cache` (project mode) or `task_cache` (ticket mode) and auto-sets chapter custom field.

**Consequences:** Single dialog component for both flows. Edge Function handles dual routing. Project tasks appear in project view after query invalidation.

## ADR-010: Volume-bar priority icons
**Date:** 2026-03-13
**Status:** Accepted

**Context:** Original priority icons used 3 equal-height bars with different fill — not intuitive. Users couldn't distinguish priority levels at a glance.

**Decision:** Ascending bars like a volume indicator: Low=1 bar, Normal=2 bars, High=3 bars (heights: 35%, 65%, 100%). Urgent uses AlertCircle icon. Inactive/ghost bars rendered at 0.15 opacity for visual context.

**Consequences:** Clearer visual hierarchy. Volume metaphor is universally understood. Ghost bars show "capacity" remaining.
