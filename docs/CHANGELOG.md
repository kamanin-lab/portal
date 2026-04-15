# Changelog

## Phase 14: role-based-guards — Viewer role gaps closed — 2026-04-15

### `src/modules/projects/components/steps/StepActionBar.tsx`
- Added `useOrg().isViewer` guard: returns `null` early when the current user is a viewer
- Viewer-role users no longer see "Freigeben" / "Änderungen anfordern" action bar when a project step is in CLIENT REVIEW

### `src/modules/projects/components/steps/__tests__/StepActionBar.test.tsx` (new file)
- 2 new tests: (1) renders action bar for admin/member users; (2) renders nothing for viewer-role users

### `supabase/functions/_shared/org.ts`
- Added `getNonViewerProfileIds(supabase, profileIds)` batch helper
- Queries `org_members` for all supplied profile IDs, returns only those with `role IN ('admin', 'member')`
- Permissive fallback: returns full input array on query error (safe degradation)

### `supabase/functions/clickup-webhook/index.ts`
- Applied `getNonViewerProfileIds` filter in both `task_review` and `step_ready` email dispatch blocks
- Viewer-role org members no longer receive action-required emails (task_review, step_ready)
- Bell (in-app) notifications remain unfiltered — viewers still see notification badges

**Verification:** 8/8 PASS. Build clean. 2 new tests pass. 382 existing tests pass.

---

## Triage Agent — Maxi AI Core v3.3.0 Support — 2026-04-14

### `supabase/functions/_shared/wp-audit.ts`
- Added `bootstrap-session` as the first ability call before any other Maxi AI Core requests (v3.3.0 requirement — other abilities are blocked until bootstrap succeeds)
- Graceful degradation: bootstrap failure does not block triage; audit proceeds without site context
- Added `WpOperatorNote` interface for the new operator-notes data shape
- Added `language` and `timezone` fields to `WpSiteAudit` (sourced from `get-site-info`)
- Added `operator_notes` field to `WpSiteAudit` — active, site-specific operator instructions fetched from WordPress
- Updated `formatAuditForPrompt` to include language, timezone, and an "Operator Instructions" section in the prompt sent to Claude
- Added `VALID_PRIORITIES` set for safe priority validation

### `supabase/functions/_shared/skills/triage_agent.md`
- Added "Site-Specific Operator Instructions" section instructing Claude to treat operator-notes as authoritative rules that override default estimation logic

### `src/__tests__/wp-audit.test.ts`
- Added 8 new tests covering: bootstrap call ordering, operator-notes formatting, priority sorting, and graceful degradation on bootstrap failure

---

## Staging Environment Setup — 2026-04-06

### Infrastructure
- **Git tag `v1.0-stable`** — rollback anchor created on `main` branch HEAD before staging work began
- **`staging` branch** — created from `main`; now the standard pre-production integration branch

### vercel.json (staging branch only)
- Removed `/auth/v1/*` proxy block — Cloud Supabase (supabase.co) handles CORS natively, proxy not needed for staging

### New GitHub Actions workflow
- **`.github/workflows/deploy-edge-functions-staging.yml`** — on push to `staging` branch: uses Supabase CLI to deploy all 17 Edge Functions to the staging Cloud Supabase project (`ahlthosftngdcryltapu`)

### New scripts
- **`scripts/sync-staging-secrets.ts`** — SSH to production Coolify server, reads Edge Function secrets, pushes all 15 to staging project via Supabase Management API
- **`scripts/sync-staging-schema.ts`** — `pg_dump` production public schema, apply to staging via Management API; supports `--dump-only` and `--apply-only` flags

### New reference doc
- **`docs/staging-env-reference.txt`** — staging environment variables, project refs, service role keys, site URL

### Cloud Supabase staging project (`ahlthosftngdcryltapu`)
- 17 tables created: profiles, task_cache, comment_cache, notifications, project_config, project_task_cache, step_enrichment, client_workspaces, credit_transactions, credit_packages, project_access, project_memory, project_chapters, project_steps, support_tasks, support_messages, channel_subscriptions
- All RLS policies applied; functions and triggers in place
- 15 Edge Function secrets configured
- Auth `site_url` set to `https://staging.portal.kamanin.at`
- 17 Edge Functions deployed

### Vercel staging
- Branch-specific env vars added: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` pointing to staging Cloud Supabase
- Custom domain `staging.portal.kamanin.at` mapped to `staging` branch

### GitHub Secrets
- Added `STAGING_PROJECT_REF` (ahlthosftngdcryltapu) and `SUPABASE_ACCESS_TOKEN` for CI workflow

---

## Bug Fixes Batch — 2026-04-04

### Task 1: Disable Aufgaben module for Thomas Oeben
- **DB only:** Set `client_workspaces.is_active = false` for thomas.oeben@helferportal.de's `tickets` workspace entry
- No code changes required — `useWorkspaces` already filters `is_active = true`, so the module disappears from sidebar automatically

### Task 2: Phase transition emails
- **Finding only:** Phase transition emails are already implemented in `supabase/functions/clickup-webhook/index.ts` (line 761) via chapter completion check
- No changes needed

### Task 3: Project task reminder emails (every 3 days)
- **`supabase/functions/_shared/emailCopy.ts`** — added `project_reminder` email type with German copy and CTA to `/projekte`
- **`supabase/functions/send-mailjet-email/index.ts`** — added `project_reminder` case
- **`supabase/functions/send-reminders/index.ts`** — new block queries `project_task_cache` for tasks in `client review` status idle 3+ days, resolves recipient profiles via `project_access` table, atomic claim pattern for concurrency safety; uses separate `profiles.last_project_reminder_sent_at` column (distinct from ticket reminder tracking)
- **DB migration:** `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_project_reminder_sent_at timestamptz`

### Task 4: Mobile sidebar Verlauf/credit history navigation bug
- **`src/shared/components/layout/CreditBalance.tsx`** — added optional `onNavigate?: () => void` prop; `Link to="/konto#guthaben"` now calls `onNavigate` on click to close the mobile sidebar before navigation
- **`src/shared/components/layout/SidebarUtilities.tsx`** — passes `onNavigate` callback to `CreditBalance`

### Task 5: Desktop sidebar UX overhaul (persistent expand/collapse)
- **`src/shared/components/layout/AppShell.tsx`** — sidebar expanded state lifted here from `Sidebar.tsx`; backed by `localStorage` key `portal-sidebar-expanded`, default `true` (expanded); passes `expanded` + `onToggle` props to `Sidebar`
- **`src/shared/components/layout/Sidebar.tsx`** — now accepts `expanded: boolean` + `onToggle: () => void` props; removed hover auto-expand behavior; added toggle button (`SidebarLeft01Icon` from Hugeicons) in logo area
- **Main content layout** — uses `md:ml-[260px]` when expanded, `md:ml-14` when collapsed, with `transition-[margin-left] duration-200` for smooth animation

### Task 6: Support Chat icon update
- **`src/shared/components/layout/SidebarUtilities.tsx`** — replaced `CustomerServiceIcon` (headset) with `BubbleChatIcon` (chat bubble)
- **`src/shared/components/layout/BottomNav.tsx`** — same icon replacement
- **`src/modules/projects/components/SidebarWorkspaces.tsx`** — same icon replacement (if applicable)

---

## Docs correction: Magic Link status — 2026-03-31

- **`docs/ARCHITECTURE.md`** — corrected line stating "Magic link disabled until GoTrue SMTP is configured"; Magic Link is enabled and working via Mailjet + `auth-email` Edge Function
- **`docs/system-context/TECH_CONTEXT.md`** — same correction applied
- **`docs/DECISIONS.md`** — added ADR-027 documenting that Magic Link auth is enabled and recording the delivery mechanism (`auth-email` Edge Function → Mailjet)

---

## Upload Progress Bars + Remove 50 MB Limit — 2026-03-31

- **`src/shared/lib/upload-with-progress.ts`** — new shared XHR-based upload utility; replaces `fetch()` for all file uploads to enable native `progress` event reporting
- **`src/modules/files/components/UploadProgressBar.tsx`** — new animated progress bar component; exports `UploadItem` interface for multi-file upload state tracking; auto-dismisses at 100% after 2.5s
- **`src/modules/files/hooks/useClientFiles.ts`** — removed `MAX_FILE_SIZE` limit; `uploadClientFile` now accepts optional `onProgress` callback
- **`src/modules/projects/hooks/useNextcloudFiles.ts`** — removed `MAX_FILE_SIZE`; `useUploadFile` and `useUploadFileByPath` mutation args changed from `File` to `{ file, onProgress? }`
- **`src/modules/files/components/ClientActionBar.tsx`** — multi-file upload with per-file progress bars rendered via `UploadProgressBar`
- **`src/modules/projects/components/files/FileUpload.tsx`** — same multi-file + progress pattern
- **`supabase/functions/nextcloud-files/index.ts`** — removed `MAX_UPLOAD_SIZE` check from `upload` and `upload-client-file` actions (retained for `upload-task-file`)

---

## File/Folder Deletion + Files Module Root Restrictions — 2026-03-31

- **`supabase/functions/nextcloud-files/index.ts`** — added `delete` (project) and `delete-client` (client files) WebDAV DELETE actions
- **`src/modules/files/hooks/useClientFiles.ts`** — added `useDeleteClientItem` hook
- **`src/modules/projects/hooks/useNextcloudFiles.ts`** — added `useDeleteItem` hook
- **`src/modules/files/components/ClientFolderView.tsx`** — root level is now read-only (upload/create buttons replaced with hint text); subfolder items show trash icon on group-hover with `ConfirmDialog` before deletion
- **`src/modules/files/components/ClientFileRow.tsx`** — optional `onDelete` prop + group-hover trash icon
- **`src/modules/projects/components/files/FolderView.tsx`** — folder items get trash icon; `FileRow` receives `onDelete`; `ConfirmDialog` guards deletion
- **`src/modules/projects/components/files/FileRow.tsx`** — optional `onDelete` prop + group-hover trash icon
- **Business rules:** Files module root = read-only (top-level folders are admin-controlled structure); Files module subfolders = full CRUD; Project chapter root folders = cannot be deleted; inside chapter folders = files and subfolders can be deleted

---

## Hilfe FAQ Page + GitHub Actions Cleanup — 2026-03-31

### Hilfe FAQ Page
- **`src/shared/lib/hilfe-faq-data.ts`** — new data file with `FaqItemData` / `FaqSectionData` types and `FAQ_SECTIONS` array (6 sections, 20 items, German Sie-form): Projekte, Tickets & Anfragen, Dateien, Kredite, Benachrichtigungen, Konto & Einstellungen
- **`src/shared/components/help/FaqItem.tsx`** — independent accordion item: AnimatePresence height animation, chevron rotation, `isLast` border separator
- **`src/shared/components/help/FaqSection.tsx`** — section card: Hugeicons icon + h2 + divider + FaqItem list
- **`src/shared/pages/HilfePage.tsx`** — replaced placeholder with full FAQ page; `ICON_MAP` resolves iconName strings to Hugeicons components; whileInView stagger animation on section cards
- Tests added for FaqItem, FaqSection, HilfePage; `IntersectionObserver` mock added to `src/test/setup.ts` for jsdom compatibility
- `tsconfig.app.json` updated to exclude test files from production build
- Fixed icon name inconsistency: `FolderOpenIcon` (not `FolderOpen01Icon`) in both data and ICON_MAP

### GitHub Actions Cleanup
- Deleted `.github/workflows/claude-code-review.yml` and `.github/workflows/claude.yml`
- Reason: Claude Code GitHub App not installed, `ANTHROPIC_API_KEY` not in GitHub Secrets — these workflows caused CI failures on every push

---

## Bidirectional Nextcloud File Activity Sync — 2026-03-31

- **`project_file_activity` extended** with `source`, `nextcloud_activity_id`, `actor_label` columns + partial unique index; new **`client_file_activity`** table (profile-scoped, RLS) for Files module
- **`nextcloud-files` Edge Function** gains `sync_activity` and `sync_activity_client` actions that call the Nextcloud OCS Activity API and upsert deduped records via `nextcloud_activity_id`
- **Projects module** auto-syncs activity on mount (`useSyncFileActivity`), renders folder path + actor in `FileActivityItem`, supports download on click; **Files module** gains "Letzte Aktivität" section reusing the same component and logs portal uploads/folder creates to `client_file_activity`

---

## Recommendations Decline Fix — 2026-03-30

- **Block clears after decline**: `TaskDetail.tsx` exclusion list now includes `'cancelled'` — block no longer reappears after re-opening a declined task
- **Auto-comment on decline**: `decline_recommendation` always posts "Empfehlung abgelehnt." to ClickUp (+ optional user reasoning); mirrors accept flow
- **No double-post**: Generic comment handler guarded with `action !== 'decline_recommendation'`
- **Tag cache cleanup**: `task_cache.tags` updated immediately on accept/decline to remove `recommendation` tag before webhook fires

---

## Projects Module Overhaul — 2026-03-30

### FilesTab → Full Nextcloud Folder Browser
- FilesTab in project overview now shows the full Nextcloud folder structure (dynamic from Nextcloud, not hardcoded chapters)
- Root level shows folder cards + root files; clicking opens FolderView with breadcrumbs, upload, create subfolder
- Extracted `FileBrowser` component reused by both overview tab and standalone DateienPage
- `useNextcloudFilesByPath` now supports empty subPath for root listing
- Deleted old 8-recent-files FilesTab implementation

### StepDetail Simplified
- Removed 3-tab layout (Übersicht, Dateien, Diskussion) → single scrollable view
- New layout: header → action bar (client review) → description + AI enrichment → divider → comments inline
- StepActionBar (Freigeben/Änderungen anfragen) kept for client review flow
- Deleted: StepFilesTab, StepDiscussionTab, StepOverviewTab (dead code)

### Quick Links Streamlined
- Reduced from 5 to 3 external-only quick links: Staging-Website, Content-Editor, Video-Anruf
- Removed "Nachricht senden" and "Dateien hochladen" (duplicated tabs on same page)
- Deleted MessageSheet and UploadSheet components
- Removed `general_message` and `files` destination kinds from quick actions pipeline
- Removed subtitle from all quick action cards
- DynamicHero: removed "Nachricht senden" ghost CTAs from priority 2/3 states

### PhaseTimeline Cleanup
- Removed tooltip on hover (showed stale AI narrative text)
- Removed narrative text line from ContextStrip
- Removed "Team arbeitet an..." status line from ContextStrip
- Removed border-bottom separator from ContextStrip
- Fixed chapter_config clickup_cf_option_id mapping in Supabase (was shifted by 1)

### DynamicHero CTA
- Removed "Nachricht senden" ghost button from client review CTA card (priority 1)

## Docs Restructuring — 2026-03-29 (260329-hjo)

- Deleted 5 stale docs (STATUS.md, WORKING_GUIDE.md, bootstrap-prompt.md, REPOSITORY_MAP.md, and superpowers/) — superseded by CLAUDE.md and GSD workflow
- Deleted .planning/codebase/ (7 files — ARCHITECTURE, STACK, CONVENTIONS, etc.) — duplicated docs/ content
- Renamed docs/planning/ → docs/domain/ (business/domain documents, not GSD planning artifacts)
- Moved docs/TICKET_AUDIT_REPORT.md → docs/audits/ticket-audit-report.md
- Updated all agent definitions: React 19, Hugeicons/Phosphor icon stack, removed PORTAL_staging/superpowers references
- Updated README: reflects single-repo reality, production status, current docs structure
- Added ADR-023 (docs restructuring) and ADR-024 (icon library migration)

## UI Audit Fixes + Typography Scale — 2026-03-29 (260329-gkb, commit 02b0ce6)

- Typography scale applied across all pages (spacing cleanup)
- German translation fixes for UI strings
- CORS security hardening: removed stale lovable.app origins, added Vercel preview URL pattern

## Projects Module Audit — 2026-03-29 (260329-fhb, commit 17050f4)

- 22 findings audited, 4 critical broken pipelines fixed
- AI enrichment pipeline, project memory flow, file browser, step discussion fixed

## Credit History + Hugeicons Migration — 2026-03-29 (commit 984a424)

- Credit history section added to Konto page (full transaction ledger visible to clients)
- Icon library migrated to Hugeicons as primary (@hugeicons/react + @hugeicons/core-free-icons)
- Phosphor Icons added as secondary (@phosphor-icons/react)
- Lucide React removed as primary icon source (existing references left in place)

## Mobile UX Polish Round 2 — 2026-03-27

### Bug Fixes
- **Fixed mobile keyboard covering input** — Added `interactive-widget=resizes-content` to viewport meta tag. Layout viewport now resizes when keyboard opens, keeping sticky inputs visible.
- **Fixed inbox accordion alignment** — Expanded content now uses `pl-9 pr-5` to align with title text (after unread dot). Removed duplicate TypeBadge/date from expanded section.
- **Fixed file-only sends failing** — Both `post-task-comment` and `send-support-message` Edge Functions now allow empty text when files are attached. `display_text` uses "📎 Dateianhang" placeholder.

### Features
- **Auto-scroll to latest message** — SupportChat and TaskComments now scroll to the most recent message on load and after sending. Also works in StepDiscussionTab (projects) via TaskComments.
- **Task filters horizontal scroll on mobile** — Filter chips now scroll horizontally instead of wrapping into 4 rows, using `overflow-x-auto` + `flex-nowrap` on mobile.
- **Sidebar swipe gesture** — New `useSwipeGesture` hook enables opening sidebar by swiping right from left edge (20px) and closing by swiping left. Vanilla touch events, passive listeners, vertical scroll guard.

### Files Changed
- `index.html` — viewport meta interactive-widget
- `src/modules/tickets/components/SupportChat.tsx` — auto-scroll
- `src/modules/tickets/components/TaskComments.tsx` — auto-scroll
- `src/modules/tickets/components/TaskFilters.tsx` — mobile horizontal scroll
- `src/shared/components/inbox/NotificationAccordionItem.tsx` — alignment fix
- `src/shared/components/layout/AppShell.tsx` — swipe gesture
- `src/shared/hooks/useSwipeGesture.ts` — new hook
- `supabase/functions/post-task-comment/index.ts` — file-only send
- `supabase/functions/send-support-message/index.ts` — file-only send

## Mobile UX + File Attachments + Inbox Improvements — 2026-03-26

### Bug Fixes
- **Fixed file attachments not sending to ClickUp** — Frontend FileData interface used `data` field but `post-task-comment` and `send-support-message` Edge Functions expected `base64`. Standardized all layers to `base64` + added `size` field. Files were silently dropped before this fix.
- **Fixed mobile chat input scrolling away** — Made CommentInput sticky at bottom in TaskDetailSheet and SupportPage. Fixed SupportPage container height to account for BottomNav (64px) using `dvh` units.
- **Fixed project timeline overflow on mobile** — Added `overflow-x-auto` to PhaseTimeline container with `shrink-0` on mobile nodes for horizontal scroll.
- **Hidden redundant Support button on mobile** — TicketsPage top bar Support button now `hidden md:flex` since BottomNav already provides Support access.
- **Reduced CommentInput size on mobile** — Uses `useBreakpoint` to set minRows=1/maxRows=4 on mobile (was 3/8), reducing textarea from 84-184px to 44-104px.

### Features
- **Inbox mobile accordion** — Tapping a notification on mobile now expands it inline with full title, full message (linkified), type badge, and date. Uses Motion for smooth animation.
- **"Zur Aufgabe" navigation link** — Both desktop detail panel and mobile accordion now show a "Zur Aufgabe" button for task-related notifications, navigating to `/tickets?taskId=...`.
- **Inbox component extraction** — `NotificationAccordionItem`, `NotificationDetailPanel`, `TypeBadge`, and `formatDate` utility extracted into `src/shared/components/inbox/`.

### Files Changed
- `src/modules/tickets/types/tasks.ts` — FileData: `data` → `base64`, added `size`
- `src/modules/tickets/components/CommentInput.tsx` — fileToBase64 fix + sticky + mobile sizing
- `src/modules/tickets/hooks/useCreateTask.ts` — fileToBase64 fix
- `supabase/functions/create-clickup-task/index.ts` — `file.data` → `file.base64`
- `src/modules/tickets/pages/TicketsPage.tsx` — Support button hidden on mobile
- `src/modules/tickets/pages/SupportPage.tsx` — dvh height fix
- `src/modules/projects/components/overview/PhaseTimeline.tsx` — overflow-x-auto
- `src/shared/pages/InboxPage.tsx` — mobile accordion + task link
- `src/shared/components/inbox/` — 4 new files (accordion, detail panel, badge, utils)

## Phase 0: Discovery — 2026-03-10
- Analyzed Lovable codebase at tasks/
- Generated Supabase types from cloud project
- Produced discovery report
- Identified reusable hooks: useClickUpTasks, useTaskComments, useTaskActions, useNotifications, useUnreadCounts, useSupportTaskChat
- Identified 11 Edge Functions to reuse
- Migrated schema to self-hosted Supabase (portal.db.kamanin.at)
- Fixed 3 bugs in schema: type error in handle_profile_list_change, column name error (context → context_type), added missing on_auth_user_created trigger

## Phase 1: Scaffold — 2026-03-10
- Created Vite + React 18 + TypeScript project
- Installed: Tailwind v4, TanStack React Query, React Router v6, Lucide React, Supabase JS
- Created tokens.css with all design tokens from SPEC.md
- Configured Tailwind v4 @theme inline mapping
- Created Supabase client (src/shared/lib/supabase.ts)
- Created AuthProvider + useAuth hook (email/password + magic link + reset)
- Created AppShell: Sidebar (56px collapsed → 260px expanded, 0.2s), MobileHeader (52px), MobileSidebarOverlay, BottomNav (64px)
- Created routing: /uebersicht, /aufgaben, /nachrichten, /dateien, /support, /hilfe, /login
- Created Login page: email/password + magic link + password reset, all German
- TypeScript strict mode: 0 errors

## Phase 2: Project Experience Module — 2026-03-10
- Created src/modules/projects/types/project.ts — TypeScript interfaces (Project, Chapter, Step, Update, FileItem, Message, ProjectTask)
- Created src/modules/projects/lib/phase-colors.ts — PHASE_COLORS map + getPhaseColor()
- Created src/modules/projects/lib/helpers.ts — all helper functions from SPEC.md Section 8
- Created src/modules/projects/lib/mock-data.ts — "Praxis Dr. Weber" mock project (exact from prototype)
- Created src/modules/projects/hooks/useProject.ts, useHeroPriority.ts, useChapterHelpers.ts
- Created PhaseNode + PhaseTimeline — horizontal 4-phase stepper, completed/current/upcoming states, pulse animation
- Created DynamicHero — priority cascade (awaiting_input → tasks → upcoming → all done), phase-tinted background, top accent line
- Created QuickActions — 3-column grid, counter pills, hover icon color swap
- Created UpdateItem + UpdatesFeed — type-icon rows (file/status/message)
- Created OverviewTabs — Updates / Dateien / Nachrichten with compact file/message lists
- Created ContextStrip — PhaseTimeline + narrative + team status line
- Created OverviewPage — assembles all 5 sections
- Created StepDetail — 3 tabs (Übersicht/Dateien/Diskussion), action bar for awaiting_input, expandable sections, drop zone, chat bubbles
- Created StepsPage — chapter accordion with step list
- Created TasksPage, FilesPage (phase folders + filters), MessagesPage (grouped by step), ProjectHelpPage (bridge pages)
- Updated UebersichtPage, NachrichtenPage, DateienPage to use real components
- Added /uebersicht/* nested routes + phase-pulse keyframe
- Build: 0 TypeScript errors


## Monorepo + Edge Functions Deployment — 2026-03-12

### Repo Restructure (ADR-007)
- Flattened project: React app at repo root, Edge Functions at `supabase/functions/`
- Pushed to GitHub: `kamanin-lab/portal` (initial commit `21b9330`)
- Old dirs (`kamanin-portal/`, `tickets/`) gitignored as local reference

### Edge Functions Deployment (ADR-008)
- Deployed 12 Edge Functions to self-hosted Supabase via Coolify volume mount
- Added `supabase/functions/main/index.ts` — official router using `EdgeRuntime.userWorkers.create()`
- Fixed: `index.ts` files created as directories instead of files (caused "Is a directory" boot error)
- Fixed: placeholder `main/index.ts` caught all requests instead of routing to workers
- All 12 functions responding: fetch-clickup-tasks, fetch-task-comments, fetch-single-task, post-task-comment, update-task-status, clickup-webhook, fetch-project-tasks, send-mailjet-email, create-clickup-task, auth-email, send-feedback, send-support-message
- Env vars (CLICKUP_API_TOKEN, MAILJET keys, ANTHROPIC_API_KEY) set via Coolify UI
- Copied `.claude/skills/clickup-api/` (9 files) and `.env.local` from old `kamanin-portal/` to project root
- Old directories (`kamanin-portal/`, `tickets/`) safe to delete — all content verified migrated

## Phase 3.5: AppShell Redesign + Ticket UI Restoration — 2026-03-11

### Step 1: Workspace Registry
- Created `client_workspaces` Supabase table with RLS (ADR-003)
- Created `src/shared/hooks/useWorkspaces.ts` — fetches active modules per user
- Created `src/shared/lib/workspace-routes.ts` — maps module_key → route + children

### Step 2: Linear-style Sidebar + InboxPage + WorkspaceGuard
- Rebuilt `Sidebar.tsx` with 3 zones (Global / Workspaces / Utilities) — ADR-004
- Extracted sub-components: SidebarGlobalNav, SidebarWorkspaces, SidebarUtilities, SidebarUserFooter
- Created `InboxPage.tsx` — two-panel notification inbox, support chat excluded, pagination
- Created `WorkspaceGuard.tsx` — redirects to /inbox if module not active
- Created `MeineAufgabenPage.tsx` — redirects to /tickets?filter=needs_attention
- Updated `BottomNav.tsx` → Inbox / Aufgaben / Support / Mehr
- Updated `MobileSidebarOverlay.tsx` → 3-zone mobile nav
- Updated `AppShell.tsx` → added /inbox PAGE_TITLE
- Updated `routes.tsx` → default redirect → /inbox, added /inbox + /meine-aufgaben, removed /tickets/:id, added WorkspaceGuard on /tickets + /support

### Step 3: Ticket UI Restoration (Lovable parity)
- CORS fix: added localhost:5173 + localhost:5174 to Edge Function allowed origins
- Created `status-dictionary.ts` — STATUS_LABELS, PRIORITY_LABELS, ACTION_LABELS, mapClickUpStatus()
- Fixed `dictionary.ts` labels: needs_attention → 'Ihre Rückmeldung', newTicket → 'Neue Aufgabe'
- Fixed `StatusBadge.tsx` label: needs_attention → 'Ihre Rückmeldung'
- Rebuilt `TaskCard.tsx` — rich cards (preview text, priority badge, assignee indicator, onTaskClick prop)
- Rebuilt `TaskFilters.tsx` — live status counts, "Mehr" dropdown for on_hold/cancelled
- Updated `TaskList.tsx` — uses mapStatus() for filtering (fixes silent bug), searchQuery prop, grid layout
- Created `TaskSearchBar.tsx` — search by task name
- Created `SyncIndicator.tsx` — sync timestamp + refresh trigger
- Created `NewTaskButton.tsx` — accent button with new task label
- Created `TaskDetailSheet.tsx` — Radix Dialog slide-over, URL-based state
- Updated `TaskDetail.tsx` — removed back button, added onClose prop, uses mapStatus() (fixes TaskActions bug)
- Rebuilt `TicketsPage.tsx` — full Lovable layout (search + filters + sync + grid + sheet)
- Deleted `TicketDetailPage.tsx` (replaced by TaskDetailSheet)
- Added CSS animations: fadeIn, slideInRight, slideOutRight
- Build: 0 TypeScript errors, production build clean

## Phase 3.6 — Project Task Creation, Priority Icons, AI Enrichment (2026-03-13)

### Project Task Creation
- **NewTicketDialog**: dual mode (`ticket` / `project`) — reused for both ticket and project task creation
  - Project mode: receives `listId`, `chapters`, `phaseFieldId` from project config
  - Priority selector: 4 buttons (Dringend/Hoch/Normal/Niedrig) with PriorityIcon
  - Chapter/phase dropdown (project mode only)
- **QuickActions**: "Aufgaben öffnen" → "Aufgabe erstellen" with Plus icon, `onCreateTask` prop
- **DynamicHero**: added "Aufgabe erstellen →" CTA in awaiting_input priority state
- **OverviewPage**: integrates NewTicketDialog in project mode, builds chapter options from project.chapters
- **create-clickup-task Edge Function**: dual mode — ticket (profile's ClickUp list) or project (explicit listId + chapter custom field)

### Priority Icons
- Redesigned to volume-bar style: Low=1 bar, Normal=2 ascending bars, High=3 ascending bars, Urgent=AlertCircle
- Ghost/inactive bars visible with opacity 0.15
- Ascending height ratios: [0.35, 0.65, 1.0]

### UpdatesFeed
- Added pagination: 10 items default, "Mehr anzeigen" button (+10 per click)

### AI Enrichment Fixes
- Fixed off-by-one: prompt task numbering starts from 0 (matching `task_index` in response)
- Fixed JSON parsing: strip markdown code block wrapper (`\`\`\`json ... \`\`\``) from Claude response
- Increased `max_tokens`: 2000 → 4000

### Type Changes
- `Project`: added `clickupListId`, `clickupPhaseFieldId`
- `Chapter`: added `clickupCfOptionId`
- `CreateTaskInput`: added `listId?`, `phaseFieldId?`, `phaseOptionId?`
- `transforms-project.ts`: passes through new ClickUp fields from config

### New: docs/ideas/
- Created `docs/ideas/` folder for future feature proposals
- `knowledge-base.md`: per-client AI knowledge base architecture (planned Phase 4+)

## Phase 3.7 — UX Polish: Links, Inbox, Meine Aufgaben, Sheet fixes (2026-03-13)

### Clickable Links in Chat & Inbox
- Created `src/shared/lib/linkify.tsx` — `linkifyText()` utility, detects URLs and renders as `<a>` tags
- Applied in `MessageBubble.tsx` — chat messages now have clickable links (accent color, underline, opens in new tab)
- Applied in `InboxPage.tsx` — notification messages also linkified

### Inbox Cleanup
- Removed redundant "Als gelesen markieren" button from detail panel — notifications are already auto-marked as read on selection via `handleSelect()`
- Simplified `DetailPanel` props (removed `onMarkRead`)

### Meine Aufgaben — Dedicated Page (ADR-011)
- Replaced `<Navigate>` redirect with full page component
- Shows only tasks with `client review` status (needs_attention)
- Grouped by workspace (`list_name`) with section dividers
- Sorted by priority (urgent first), then by date
- Click → TaskDetailSheet (URL-based `?taskId=xxx`)
- Empty state: "Keine offenen Aufgaben — alles erledigt!"
- Reuses existing TaskCard, TaskDetailSheet, useClickUpTasks

### NewTicketDialog → Sheet
- Converted from centered popup to right-side Sheet (matching TaskDetailSheet pattern)
- Added file attachment support: Paperclip button, attachment pills, max 5 files / 10MB
- Fixed z-index bug: overlay z-40, content z-50 (was z-50/z-[51])

### Sidebar Badge Fix
- `useTaskActions.ts`: now invalidates `['needs-attention-count']` query on status change
- Sidebar badge updates immediately when tasks are approved/actioned

### ClickUp Webhook
- Registered webhook for 11 events (taskCreated, taskUpdated, taskStatusUpdated, etc.)
- Webhook ID: `dce8756d-3a76-4e79-9d95-a21801d6ee8e`
- Inbox notifications now populated via realtime webhook events

## Phase 3.8 — Staging Hardening, Clarity, and Product Polish — 2026-03-20

### Staging workflow and repository clarity
- Created dedicated staging working copy: `PORTAL_staging`
- Replaced template root README with real project README for staging
- Added `docs/STATUS.md`, `docs/REPOSITORY_MAP.md`, and `docs/WORKING_GUIDE.md`
- Moved historical root planning docs out of the active root into `archive/legacy-reference/root-planning/`
- Archived legacy reference trees into `archive/legacy-reference/` to reduce root ambiguity
- Updated `.gitignore` behavior so archived legacy reference content can remain tracked inside staging

### Test and build contract hardening
- Added `test`, `test:watch`, and `test:coverage` scripts to `package.json`
- Added proper `vitest.config.ts` for the active staging app only
- Excluded archived legacy code from active test runs
- Added `@vitest/coverage-v8` so coverage is real, not just declared
- Added focused tests for `transformToProject()` in the projects module
- Confirmed active staging tests pass and build succeeds after each pass

### Performance and bundle improvements
- Added route-level lazy loading for major pages in `src/app/routes.tsx`
- Added route-level loading fallback with `LoadingSkeleton`
- Added Rollup `manualChunks` vendor splitting in `vite.config.ts`
- Reduced the main app entry chunk substantially and removed prior chunk-size warning pressure

### Product polish — tickets
- Improved ticket empty states so they reflect filter/search context instead of generic blanks
- Improved task detail flow to preserve non-task query params and close filter panel on open
- Refined sync indicator wording and sync empty state
- Improved task card preview fallback and due-date visibility
- Added support intro copy to make the support surface feel more product-complete

### Product polish — projects and shared flows
- Added loading and empty states to `UebersichtPage`, `NachrichtenPage`, and `DateienPage`
- Improved empty state handling in project files page
- Replaced blank `WorkspaceGuard` loading state with a proper loading shell
- Replaced imperative login redirect side-effect with declarative `<Navigate>`
- Improved Inbox and MeineAufgaben loading / empty states

## Phase 4.1: Nextcloud Folder Navigation — 2026-03-22

### Edge Function: nextcloud-files
- Added `mkdir` action: recursive WebDAV MKCOL — creates the full folder tree including intermediate directories
- Added `sub_path` parameter to `list` and `upload` actions for arbitrary path navigation within a project root
- Added `folder_path` parameter to `mkdir` for specifying the target folder path
- Hardened `isPathSafe`: now also rejects paths containing control characters

### New Components
- `FolderView.tsx` — generic folder browser with breadcrumbs, drill-down navigation, folder creation inline, and upload integration
- `CreateFolderInput.tsx` — inline folder name input with client-side validation

### Modified Components
- `FilesPage.tsx` — replaced `selectedChapter` state with `pathSegments[]` array for path-based navigation
- `FileUpload.tsx` — accepts `subPath` prop to route uploads to the active browsed path
- `UploadSheet.tsx` — rewritten: folder/subfolder selection replaces the prior step-binding UI (see ADR-012)

### Deleted Components
- `ChapterFiles.tsx` — replaced entirely by `FolderView.tsx`

### New Hooks
- `useNextcloudFilesByPath` — path-based file listing (replaces chapter-keyed listing)
- `useUploadFileByPath` — path-based upload mutation
- `useCreateFolder` — folder creation mutation (calls `mkdir` action)

---

## TASK-010: Credit System Phase 1 — 2026-03-23

### Database
- Created `credit_packages` table — monthly allocation per client (package_name, credits_per_month, is_active, started_at)
- Created `credit_transactions` table — full ledger (amount, type: monthly_topup/task_deduction/manual_adjustment, task_id, task_name, description)
- Added `credits` column to `task_cache` — synced via ClickUp webhook custom field handler
- Both tables: RLS + REPLICA IDENTITY FULL for Realtime subscriptions
- Seeded initial package for MBM (25 credits/month) and one monthly_topup transaction

### Edge Functions
- Added `credit-topup` Edge Function — monthly cron job (via pg_cron): reads active packages, inserts monthly_topup transactions, logs result
- Updated `clickup-webhook` — handles credit custom field changes: reads numeric value, diffs against task_cache.credits, inserts task_deduction transaction

### Frontend Components
- `CreditBalance.tsx` — badge showing current balance (SUM of credit_transactions), shown in Sidebar Utilities zone
- `CreditBadge.tsx` — inline credit cost indicator on TaskCard and TaskDetail
- `useCredits.ts` hook — fetches balance + transaction history via Supabase, Realtime-subscribed

### Post-Code Review Fixes (4 blocking)
- Credit balance now derived from transaction ledger SUM (not denormalized column)
- topup date format standardized (YYYY-MM)
- Webhook deduction guards against NULL/non-numeric credit values
- CreditBalance hidden when balance is zero or NULL (not shown to unconfigured clients)

---

## TASK-009: File Management — 2026-03-23

### New Functionality in DateienPage
- Upload files directly from DateienPage (not only from project-context UploadSheet)
- Create new folders inline from DateienPage
- Integrated with `useUploadFileByPath` and `useCreateFolder` hooks
- Breadcrumb-aware: upload/mkdir targets the currently browsed path

### Files Changed: 6

---

## TASK-008: shadcn/ui Migration — 2026-03-23

### shadcn/ui Components Installed
- Installed 8 base components selectively: Button, Badge, Input, Textarea, Tabs, Skeleton, Avatar, AlertDialog
- Components installed into `src/shared/components/ui/` via shadcn CLI
- All components customized via portal CSS tokens — no shadcn defaults overridden directly

### Components Refactored
- `ConfirmDialog` — migrated to shadcn AlertDialog
- `LoadingSkeleton` — migrated to shadcn Skeleton
- `StepDetail` — migrated to shadcn Tabs
- `NewTicketDialog` — migrated to shadcn Input, Textarea, Button
- `UpdatesFeed` — migrated to shadcn Badge

### New Components
- `UserAvatar` (`src/shared/components/common/UserAvatar.tsx`) — shadcn Avatar wrapper with initials fallback and portal token styling

### Design Token Additions (`tokens.css`)
- `--destructive`, `--destructive-foreground` — destructive action color (AlertDialog confirm)
- `--file-*` — file type icon color tokens
- `--priority-*` — priority level color tokens
- `--surface-raised` — elevated surface color (cards, sheets)

### Hardcoded Color Cleanup
- Replaced all hardcoded hex/Tailwind color classes with CSS custom property references across refactored components

---

## TASK-007: Nextcloud Folder Structure + Portal Navigation — 2026-03-22

### Shared Utilities
- Created `supabase/functions/_shared/slugify.ts` — German-aware slug generation (umlaut normalization, kebab-case)

### Edge Function: nextcloud-files
- Chapter folder naming now uses `slugify()` — `01_Konzept`, `02_Design`, etc.
- Client folder structure: `clients/{slug}/` hierarchy enforced

### Frontend: Files Module (`src/modules/files/`)
- Created `src/modules/files/` as a standalone module (separate from projects files)
- `DateienPage.tsx` — client-level file browser using client root from `profiles.nextcloud_client_root`
- `ClientFolderView.tsx` — generic folder browser with breadcrumbs and drill-down
- `ClientFileRow.tsx` — file row with type icon, size, download link
- `ClientActionBar.tsx` — toolbar (upload, create folder)
- `useClientFiles.ts` hook — reads from `profiles.nextcloud_client_root`, calls `nextcloud-files`

### Sidebar
- "Dateien" sidebar entry now routes to the client-level `DateienPage` (not project-scoped files)
- `profiles.nextcloud_client_root` column drives the file root path per user

### Files Changed: 12+

---

## TASK-006: Interactive Dashboard — 2026-03-22

- Created HTML-based project dashboard with visual timeline (`tasks/dashboard.md` format established)
- Dashboard shows task pipeline, completed tasks, residual items
- Timeline view for multi-phase project tracking

---

## TASK-005: Real-Time Updates — 2026-03-22

### Database
- Verified and enabled Supabase Realtime publication for: `task_cache`, `comment_cache`, `notifications`, `project_task_cache`
- Set REPLICA IDENTITY FULL on all Realtime-enabled tables

### Frontend
- Removed all manual polling intervals from hooks
- Supabase client initialized with proper Realtime channel options (reconnect, heartbeat)
- Task subscriptions broadened from UPDATE-only to INSERT + UPDATE + DELETE
- Project data now subscribes via `project_task_cache` Realtime channel
- Added 30s fallback polling (React Query `staleTime`) for Realtime failure recovery

---

## TASK-004: Account Page / Konto — 2026-03-22

- Created `/konto` route and `KontoPage.tsx`
- Profile display: name, email, company, avatar initials
- Notification preferences panel — granular per-type toggles (task_review, task_completed, team_comment, support_response, reminders)
- Email notification master toggle
- Password change flow (Supabase Auth `updateUser`)
- Magic link re-send option
- All German UI; form validation with error toasts
- Files Changed: 22

---

## TASK-003: Nextcloud Files Integration — 2026-03-22

### Edge Function: nextcloud-files
- WebDAV `PROPFIND` for folder listing
- WebDAV `PUT` for file upload
- WebDAV `GET` for file download (proxied)
- WebDAV `MKCOL` for folder creation (recursive — creates full tree)
- Path safety validation (no traversal, no control characters)
- `sub_path` parameter for arbitrary path navigation within project root
- `folder_path` parameter for `mkdir` action

### New Components (projects module)
- `FolderView.tsx` — generic folder browser with breadcrumbs, drill-down, inline folder creation, upload integration
- `CreateFolderInput.tsx` — inline folder name input with client-side validation
- `UploadSheet.tsx` (rewritten) — folder/subfolder selection replaces step-binding UI

### Modified Components
- `FilesPage.tsx` — replaced `selectedChapter` state with `pathSegments[]` for path-based navigation
- `FileUpload.tsx` — accepts `subPath` prop to route uploads to the active browsed path

### Deleted
- `ChapterFiles.tsx` — replaced entirely by `FolderView.tsx`

### New Hooks
- `useNextcloudFilesByPath` — path-based file listing
- `useUploadFileByPath` — path-based upload mutation
- `useCreateFolder` — folder creation mutation

### Files Changed: 12

---

## TASK-002: Project Panel Redesign — 2026-03-22

### Batch 1: Layout Deduplication + Foundation
- Deduplicated layout: single `ContentContainer` wrapper pattern enforced across all project pages
- Removed duplicate max-width wrappers from all project sub-pages
- Established `width="narrow"` as the standard (`max-w-4xl`, centered) — CLAUDE.md rule 11

### Batch 2: Comments, Messaging, Quick Actions, Activity Timeline
- `TaskComments.tsx` — threaded comment display with author avatars, timestamps, portal-vs-team distinction
- `SupportChat.tsx` — chat-style message interface for support tasks
- `SupportSheet.tsx` — slide-over sheet wrapping SupportChat
- Quick actions panel — configurable action buttons with counter pills
- Activity timeline — chronological project event feed
- Files Changed: 21 total (2 batches)

---

## TASK-001: Documentation Audit — 2026-03-22

- Full audit of all project documentation: 27 files reviewed
- Identified and resolved inconsistencies between ARCHITECTURE.md, SPEC.md, CLAUDE.md, and actual codebase
- Added missing `docs/planning/` directory and populated with domain model, delivery rules, product gap list, team operating model, current state map
- Agent team definitions moved to `.claude/agents/` (Claude Code native format)
- Planning docs moved into repository for persistence
- Context Hub references added for React, Tailwind, Vite, Vitest (`docs/reference/context-hub/`)
- Supabase reference documentation added (`docs/reference/supabase-context-hub/`)
- Files Audited: 27

---

## 2026-03-25 — Production Launch, Vercel Deploy, MBM Onboarding, UI Polish

### Infrastructure
- **Vercel deployment** — frontend deployed to Vercel; auto-deploys from `main` branch
  - `vercel.json`: SPA rewrites + auth proxy (`/auth/v1/*` → `portal.db.kamanin.at`)
  - Env vars set for all 3 Vercel environments: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MEMORY_OPERATOR_EMAILS`
  - Custom domain `portal.kamanin.at` → DNS A record → 76.76.21.21
  - No staging branch; Vercel preview deploys on PRs serve as staging
- **Repo consolidation** — `PORTAL_staging` renamed to `PORTAL` (single canonical repo)
- **Branch strategy**: `main` = production; feature branches get Vercel preview URLs automatically
- **`scripts/onboard-client.ts`** — automated client onboarding script
  - Creates auth user, profile, workspaces, credit package, project access, triggers task sync
  - Usage: `npx tsx scripts/onboard-client.ts --config client.json`

### First Production Client: MBM
- User: Nadin Bonin (nadin.bonin@mbm-moebel.de)
- Profile ID: f304b042-d408-4d39-874c-d53b7aa7adaf
- ClickUp list: 901519301126 — Support task: 86c81kdgk
- Credit package: Small (10 credits/month)
- Active modules: tickets, support (projects not yet configured)
- 15 legacy tasks migrated from Lovable portal; `created_by_name = 'Nadin'` applied

### UI Fixes & Polish
- **Filter row** — filter chips and filter button merged into a single row (were on separate lines)
- **Sidebar** — tickets and support are now flat direct links (no submenus)
- **TaskCard** — `created_by_name` from DB shown instead of hardcoded "Team"
- **Message bubbles** — padding 8×12→10×16, tail corner 4px→3px, gap between messages 10→14px; applied consistently to TaskComments, SupportChat, MessagesPage
- **Credit balance** — strips hour suffix from package name ("Small 10h" → "Small")
- **`scrollbar-hide` utility** added to `index.css` for Tailwind v4
- **Login page** — placeholder "K" square replaced with official KAMANIN colour icon SVG
- **Favicon** — replaced `vite.svg` with KAMANIN colour icon (cropped)
- **Page title** — "kamanin-portal" → "KAMANIN Portal"
- **Magic link** — hidden on login page until GoTrue SMTP is configured

---

## Phase 4: Project Memory & Integration Hardening — 2026-03-20+

### Project Memory Foundation
- Created `manage-project-memory` Edge Function for project memory CRUD operations
- Added project memory batch 1 foundation (client memory visibility and persistence)
- Hardened client memory visibility rules and internal memory authoring path
- Restored internal memory authoring path after browser verification flow changes

### ClickUp Integration Hardening
- Unified and hardened ClickUp public thread routing across Edge Functions
- Unified project webhook phase resolution
- Hardened shared ClickUp contract between Edge Functions
- Added ClickUp integration documentation for Phase 4

### Project Panel
- Shipped project panel batch 1 foundation (`feat(projects): ship project panel batch 1 foundation`)

### Developer Tooling & Documentation
- Added Playwright MCP browser testing setup
- Added Context Hub references for core frontend stack (React, Tailwind, Vite, Vitest)
- Added local Supabase reference documentation (`docs/reference/supabase-context-hub/`)
- Agent team migrated to Claude Code native (`.claude/agents/`)
- Planning docs moved into repository (`docs/planning/`)
- Documentation audit and consolidation in progress
