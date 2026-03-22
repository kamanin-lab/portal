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

## ADR-012: Nextcloud file storage as folder tree, not step-bound uploads
**Date:** 2026-03-22
**Status:** Accepted

**Context:** `UploadSheet.tsx` previously required a step binding — the user had to select a project step before uploading a file. This field had no real effect on where the file was stored in Nextcloud; it was non-functional stub code left over from an earlier design that assumed files would be tagged to steps. The semantics were unclear and the form field confused the upload flow.

**Decision:** Remove step binding entirely from `UploadSheet`. File storage location is determined solely by the folder the user is currently browsing in `FolderView`. Uploads go to `nextcloud_root_path/{current_sub_path}/`. Users can create subfolders inline. `UploadSheet` now only asks for the file itself, with the destination path derived from the active folder context.

**Consequences:**
- `ChapterFiles.tsx` deleted; replaced by `FolderView.tsx` (generic, path-driven).
- `UploadSheet.tsx` fully rewritten — no step selector, receives `subPath` from caller.
- `FilesPage.tsx` navigation state changes from `selectedChapter` to `pathSegments[]`.
- Three new hooks: `useNextcloudFilesByPath`, `useUploadFileByPath`, `useCreateFolder`.
- Edge Function `nextcloud-files` gains `sub_path` (list/upload) and `mkdir` action.
- Semantically cleaner: Nextcloud IS the file system; the portal navigates it directly.

## ADR-013: shadcn/ui adopted selectively (not full library)
**Date:** 2026-03-22
**Status:** Accepted

**Context:** The portal needed standardized UI primitives (buttons, inputs, tabs, skeletons, dialogs) that were previously hand-rolled with inconsistent styling and accessibility. Installing the full shadcn/ui library upfront would add unnecessary components and complicate the token customization surface.

**Decision:** Install shadcn/ui components selectively — only the 8 components actively needed: Button, Badge, Input, Textarea, Tabs, Skeleton, Avatar, AlertDialog. All component styling is driven by portal CSS tokens defined in `tokens.css`. Shadcn component source is not modified directly; customization goes through CSS custom properties only.

**Consequences:**
- Consistent accessible primitives across all new UI surfaces without dependency bloat.
- Adding a new shadcn component in future requires a deliberate install step — prevents accidental full-library pulls.
- Portal token system (`tokens.css`) becomes the single customization layer for both shadcn components and custom components.
- `UserAvatar` created as a thin shadcn Avatar wrapper with initials fallback, establishing the pattern for future wrapper components.

## ADR-011: Meine Aufgaben as dedicated page (not redirect)
**Date:** 2026-03-13
**Status:** Accepted

**Context:** "Meine Aufgaben" was a `<Navigate>` redirect to `/tickets?filter=needs_attention`. This felt broken — user clicks a sidebar item and lands on a different page with a filter applied. No focused experience.

**Decision:** Build a dedicated page with tasks grouped by workspace (`list_name`). Shows only `client review` tasks. Reuses existing TaskCard + TaskDetailSheet. No filters/search — the page IS the filter.

**Consequences:** Focused inbox-like experience for pending tasks. Grouped by workspace gives context. Sidebar badge + page count always aligned.
