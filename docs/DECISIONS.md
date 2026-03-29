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

## ADR-014: Nextcloud as file storage source of truth (not ClickUp attachments)
**Date:** 2026-03-22
**Status:** Accepted

**Context:** ClickUp supports file attachments but they are locked to task context, have no folder structure, and cannot be organized by project phase. Clients need a browsable file space that mirrors how KAMANIN organizes deliverables internally.

**Decision:** Nextcloud (self-hosted) is the sole file storage. The portal accesses it exclusively via `nextcloud-files` Edge Function (WebDAV). ClickUp attachments are not shown in the portal. Four rules (F1-F4) govern file access:
- F1: `_intern/` folders are never exposed to the client browser
- F2: `team/` folders are accessible to KAMANIN team members only
- F3: `portal/` folders are the client-visible layer
- F4: Path safety enforcement — no `..` traversal, no control characters

**Consequences:** All file operations (list, upload, download, mkdir) flow through one Edge Function. WebDAV path in `project_config.nextcloud_root_path` and `profiles.nextcloud_client_root` are the integration anchors. Nextcloud folder structure can evolve independently of the portal schema.

## ADR-015: Three-level Nextcloud access model (_intern / team / portal)
**Date:** 2026-03-22
**Status:** Accepted

**Context:** KAMANIN stores files that must never reach clients (internal notes, raw assets), files for team coordination, and files ready for client review — all in the same Nextcloud folder hierarchy.

**Decision:** Enforce three folder tiers by naming convention: `_intern/` (never exposed), `team/` (internal team, not clients), `portal/` (client-visible). The `nextcloud-files` Edge Function strips `_intern/` entries from PROPFIND responses before returning them to the browser.

**Consequences:** Simple, convention-based access control that doesn't require Nextcloud user permissions to change. KAMANIN can add internal files alongside deliverables without fear of exposure. The portal client sees only what lives in `portal/` subtrees.

## ADR-016: Client folder structure (clients/{slug}/...)
**Date:** 2026-03-22
**Status:** Accepted

**Context:** As the number of clients grows, Nextcloud needs a predictable folder structure so that `profiles.nextcloud_client_root` can be set systematically and file browsing works without manual path configuration per feature.

**Decision:** All client files live under `clients/{slug}/` where `{slug}` is generated by `slugify()` (umlaut-normalizing, kebab-case, max 60 chars). Each client root contains project subfolders. The `slugify()` utility lives in `supabase/functions/_shared/slugify.ts` and is shared across Edge Functions.

**Consequences:** Predictable paths. New clients can be onboarded by creating the folder and setting `nextcloud_client_root` in the DB. Chapter folders use `{sort_order:02}_{title_slug}` format (e.g., `01_konzept`).

## ADR-017: Credit system — transaction ledger model
**Date:** 2026-03-23
**Status:** Accepted

**Context:** Clients purchase monthly support/maintenance packages measured in credits. Tasks consume credits (set via ClickUp custom field). The portal needs to show a live balance. Options: denormalized `balance` column on profiles, or append-only ledger.

**Decision:** Append-only ledger in `credit_transactions`. Balance is always computed as `SUM(amount)` across all transactions for a user. Three transaction types: `monthly_topup` (positive, from pg_cron job), `task_deduction` (negative, from webhook when credit custom field changes), `manual_adjustment` (positive/negative, for corrections). No denormalized balance column.

**Consequences:** Full audit trail. Balance can be recomputed from scratch at any time. Realtime subscription on `credit_transactions` gives instant balance updates. `credit_packages` table defines the monthly allocation — the cron job reads active packages to generate topups. CreditBalance UI component hidden for users with no configured package.

## ADR-018: Credit custom field sync via ClickUp webhook (not manual entry)
**Date:** 2026-03-23
**Status:** Accepted

**Context:** Task credit costs need to flow from ClickUp (where KAMANIN sets them) to the portal. The alternatives were: (a) manual entry in the portal, (b) polling, (c) webhook-driven sync.

**Decision:** The `clickup-webhook` Edge Function handles `taskUpdated` events that include a credit custom field change. It reads the new numeric value, diffs against `task_cache.credits`, and inserts a `task_deduction` transaction for the delta. `task_cache.credits` is updated as a top-level column (not buried in `raw_data`).

**Consequences:** Credits appear in the portal within seconds of being set in ClickUp. Guards against NULL/non-numeric values prevent spurious transactions. The webhook handler is the single writer for task credit deductions.

## ADR-019: Realtime publication — explicit table enrollment (no polling)
**Date:** 2026-03-22
**Status:** Accepted

**Context:** Early implementation had some tables missing from the Supabase Realtime publication, causing UI to appear stale until page reload. Polling was used as a workaround, adding unnecessary load and complexity.

**Decision:** All cache and notification tables must be explicitly added to the `supabase_realtime` publication with `REPLICA IDENTITY FULL`. Polling intervals are removed from all hooks. React Query `staleTime` acts as the sole fallback (30s), ensuring Realtime failure degrades gracefully without active polling loops.

**Consequences:** Instant UI updates on webhook-driven changes. Cleaner hook code. Tables requiring Realtime: `task_cache`, `comment_cache`, `notifications`, `project_task_cache`, `credit_transactions`. Any new cache table added to the schema must also be enrolled in the publication.

## ADR-020: Vercel for frontend hosting (no staging branch)
**Date:** 2026-03-25
**Status:** Accepted

**Context:** Frontend was run locally only. Production deployment needed. Options: self-hosted on Coolify alongside Supabase, or Vercel. Coolify would add operational complexity; Vercel offers zero-config React/Vite deploys with automatic preview environments per PR.

**Decision:** Deploy frontend to Vercel. `main` branch = production (portal.kamanin.at). Feature branches and PRs automatically get Vercel preview URLs — these serve as the staging environment, replacing the previously planned separate staging branch. `vercel.json` adds SPA rewrites and an `/auth/v1/*` proxy to the self-hosted Supabase auth endpoint (needed because GoTrue cookies require same-origin).

**Consequences:** Zero-config CI/CD. No staging branch to maintain. Every PR gets an isolated preview URL for QA. Auth proxy in `vercel.json` is critical — must be kept in sync if Supabase URL changes.

## ADR-021: Client onboarding script (`scripts/onboard-client.ts`)
**Date:** 2026-03-25
**Status:** Accepted

**Context:** Onboarding a new client required 6+ manual Supabase SQL steps (create user, profile row, workspace rows, credit package, project access, trigger sync). Error-prone and undocumented.

**Decision:** Create `scripts/onboard-client.ts` — a typed TypeScript script that accepts a JSON config file and executes all onboarding steps atomically. Steps: create Supabase Auth user, insert profile, insert client_workspaces rows, insert credit_packages row, insert project_access row, call fetch-clickup-tasks to prime the cache.

**Consequences:** Repeatable, auditable onboarding. Config file acts as a record of each client's setup. First run: MBM (Nadin Bonin). Run with: `npx tsx scripts/onboard-client.ts --config client.json`.

## ADR-022: Repo consolidation — PORTAL_staging → PORTAL (single repo)
**Date:** 2026-03-25
**Status:** Accepted

**Context:** The project ran as two copies: `PORTAL` (reference, untouched) and `PORTAL_staging` (working copy). This was originally meant to protect the reference but it created confusion about which copy was canonical and where to run commands.

**Decision:** Rename `PORTAL_staging` to `PORTAL`. Single repo, single working directory. The "staging" concept is now handled by Vercel preview URLs (per PR). The old CLAUDE.md note about staging copy is no longer accurate.

**Consequences:** CLAUDE.md header note about staging copy removed. All agent instructions now point to `G:/01_OPUS/Projects/PORTAL` as the sole working directory. Historical reference material remains under `archive/legacy-reference/` within the repo.

## ADR-023: Documentation restructuring — docs/ as single source of truth
**Date:** 2026-03-29
**Status:** Accepted

**Context:** Duplicate content existed between `docs/` and `.planning/codebase/` (ARCHITECTURE.md, STACK.md, CONVENTIONS.md, etc.). Stale files in `docs/` referenced PORTAL_staging as active (superseded by ADR-022). `docs/planning/` caused naming confusion with `.planning/` (GSD workflow directory).

**Decision:** Delete `.planning/codebase/` (7 files that duplicated docs/ content). Delete 5 stale docs (STATUS.md, WORKING_GUIDE.md, bootstrap-prompt.md, REPOSITORY_MAP.md — all superseded by CLAUDE.md). Delete `docs/superpowers/` (old task planning format, superseded by GSD). Rename `docs/planning/` → `docs/domain/` to clarify these are business/domain documents. Move `docs/TICKET_AUDIT_REPORT.md` → `docs/audits/ticket-audit-report.md`.

**Consequences:** Single source of truth in `docs/`. Clean separation: `docs/` = project documentation, `.planning/` = GSD workflow artifacts only. `docs/domain/` clearly signals business domain context. All `docs/planning/` references in CLAUDE.md, agent files, and README updated to `docs/domain/`.

## ADR-024: Icon library migration — Hugeicons primary, Phosphor secondary
**Date:** 2026-03-29
**Status:** Accepted

**Context:** CLAUDE.md listed "Lucide React" as the icon library but `@hugeicons/react` was already installed and used as the primary icon set (credit history implementation, 984a424). The documentation did not reflect the actual stack. Lucide React is not installed.

**Decision:** Hugeicons (`@hugeicons/react` + `@hugeicons/core-free-icons`) is the primary icon library — stroke rounded style, 5100+ icons. Phosphor Icons (`@phosphor-icons/react`) is secondary for weight variants and duotone styles. Lucide React is explicitly legacy-only: do not use for new code, do not refactor existing components that still reference it (it may still appear in older archive code).

**Consequences:** CLAUDE.md Stack section updated. All agent definitions updated. Designer agent's icon strategy section already reflected this (added during 984a424). New components use Hugeicons by default.
