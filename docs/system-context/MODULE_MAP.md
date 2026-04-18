# Module Map

> One-stop orientation for agents. File list per module + one-line description + cross-module edges + architecture rules per module.
> Hand-maintained replacement for the codebase-knowledge-graph tools evaluated in [docs/ideas/knowledge-graph-tools.md](../ideas/knowledge-graph-tools.md).
>
> **How to use this file:** when starting a task, find the relevant module, read its "Entry points" and "Architecture rules" sections, then locate the specific file in the per-directory listing. Usually 2-4 file Reads are enough to orient.
>
> **Update cadence:** update when adding/removing a file, changing a module's architectural rules, or introducing a new cross-module dependency. Do NOT update for trivial renames.
>
> Canonical architecture rules live in [SYSTEM_CONSTRAINTS.md](SYSTEM_CONSTRAINTS.md); data flow in [ARCHITECTURE.md](../ARCHITECTURE.md); schema in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Top-level layout

```
src/
  app/              routing + auth guard
  main.tsx          bootstrap (QueryClient, Router, providers)
  modules/          feature modules (client-visible product areas)
    tickets/        Tasks + Support (ClickUp-backed)
    projects/       Project Experience (Supabase-backed)
    files/          Client file storage (Nextcloud WebDAV)
    organisation/   Admin-only org settings + member mgmt
  shared/           app shell, cross-module hooks, design tokens, common UI
supabase/
  functions/        Edge Functions — ClickUp proxy, email, Nextcloud proxy, webhooks
  migrations/       SQL migrations
```

## app/ — routing

| File | Purpose |
|---|---|
| `app/routes.tsx` | Route table. Maps URL paths to module pages. Lazy-loaded where it matters. |
| `app/ProtectedRoute.tsx` | Auth guard. Redirects to `/login` if no Supabase session. Wraps all app routes. |

## main.tsx

Bootstrap: `QueryClient`, `QueryClientProvider`, `BrowserRouter`, `AuthProvider`, `OrgProvider`, `Toaster` (sonner). Imports `tokens.css`.

---

## modules/tickets/ — Tasks & Support

**What it is:** Client-facing ticket dashboard. Backed by `task_cache` (synced from ClickUp via webhook + Edge Function polling). Includes a separate "Support" chat surface that is a single persistent task per org.

**Entry points (pages):**
- `pages/TicketsPage.tsx` — main task list. Sheet-based detail (URL state `?taskId=xxx`).
- `pages/SupportPage.tsx` — 1:1 support chat with the agency.

**Primary data source:** `task_cache` + `comment_cache` + `read_receipts` (Supabase). Filtered by `profile_id` via RLS. Never reads from ClickUp directly. `read_receipts` keys per-user "last viewed" timestamps by `context_type` (`task:<id>` or `support`); used to compute unread counts and drive the unread-message digest.

### Architecture rules (this module)

1. UI reads ONLY from `task_cache` / `comment_cache`. Never fetches directly from ClickUp.
2. All mutations go through Edge Functions (`update-task-status`, `post-task-comment`, `create-clickup-task`, `fetch-single-task`).
3. `mapStatus(task.status)` before comparing/rendering. Raw ClickUp status strings live in `task_cache.status`.
4. Top-level `task_cache` columns override `raw_data` equivalents (webhook-update freshness).
5. Realtime subscription on `task_cache` filtered by `profile_id`, debounced 300ms, fallback 30s polling via React Query `staleTime`.

### components/

| File | Role |
|---|---|
| `TaskCard.tsx` | List-item card in TaskList. Renders status, priority, due date. |
| `TaskList.tsx` | Virtual-scrolled list of cards. Accepts filtered/sorted task array. |
| `TaskDetail.tsx` | Renders task body inside `TaskDetailSheet`. Actions, comments, attachments, credit approvals. |
| `TaskDetailSheet.tsx` | Side sheet shell. URL-driven (`?taskId=xxx`). Delegates body to `TaskDetail`. |
| `TaskActions.tsx` | Status-change action buttons (Freigeben / Änderungen anfordern / Put on hold / Cancel / Resume). |
| `TaskFilters.tsx` | Top-of-list filter chips + count badges. |
| `TaskFilterPanel.tsx` | Expanded filter UI — priority, status, workspace. |
| `TaskSearchBar.tsx` | Text search over cached task list. |
| `TaskComments.tsx` | Comment thread in detail. Uses `useTaskComments` + `post-task-comment` EF. |
| `CommentInput.tsx` | Comment composer — text + attachments + @mentions. |
| `CommentInputParts.tsx` | Sub-pieces for mobile compose. |
| `FileAttachments.tsx` | Render attachment list inside comments. |
| `PriorityIcon.tsx` | Volume-bar icons (1-3 bars) + AlertCircle for urgent. Styles via `--priority-*` tokens. |
| `NewTicketDialog.tsx` | Dialog for new ticket or new project task (mode="ticket" or mode="project"). |
| `NewTaskButton.tsx` | Trigger button for `NewTicketDialog`. |
| `TicketFormFields.tsx` | Fields shared between ticket and project-task forms. |
| `ProjectTaskFormFields.tsx` | Project-mode-only fields (chapter, phase custom field). |
| `CreditApproval.tsx` | In-task UI for "approve additional credits" flow. |
| `CreditBadge.tsx` / `CreditBalance.tsx` | Inline credit indicators. |
| `RecommendationCard.tsx` / `RecommendationsBlock.tsx` / `RecommendationApproval.tsx` | Agency-sent "recommended next task" cards with accept/decline. |
| `NotificationBell.tsx` | Top-bar bell icon — unread `notifications` table count + dropdown. |
| `SyncIndicator.tsx` | Shows "syncing..." / "last synced" state above list. |
| `SupportSheet.tsx` / `SupportChat.tsx` | Support-task chat UI. 1 persistent task per org. |
| `MeineAufgabenFilters.tsx` | Filters specific to "Meine Aufgaben" (My Tasks) shared page. |

### hooks/

| File | Role | Key EF / table |
|---|---|---|
| `useClickUpTasks.ts` | Main list query. React Query + Realtime. | `task_cache` table, `fetch-clickup-tasks` EF |
| `useSingleTask.ts` | Single-task fetch for deep-link loads. | `fetch-single-task` EF → `task_cache` upsert |
| `useTaskActions.ts` | Status-change mutations (approve, reject, hold, resume, cancel, approve_credits). | `update-task-status` EF |
| `useTaskComments.ts` | Comment thread query + post mutation. | `comment_cache` + `post-task-comment` EF |
| `useCreateTask.ts` | New task creation (ticket or project mode). | `create-clickup-task` EF |
| `useNotifications.ts` | Bell dropdown — reads `notifications` table with RLS. | `notifications` |
| `useUnreadCounts.ts` | Aggregate unread-comment counts per task. | `comment_cache` + `read_receipts` + `notifications` |
| `useCredits.ts` | Current balance + deduction history. | `credit_packages` + `credit_transactions` |
| `useCreditHistory.ts` | Paginated list of past credit events. | `credit_transactions` |
| `useRecommendations.ts` | Recommendation cards + snooze/decline. | `recommendations` table |
| `useSupportTaskChat.ts` | Support-specific comment stream. | `send-support-message` EF |

### lib/

| File | Role |
|---|---|
| `transforms.ts` | `transformCachedTask()` — raw `task_cache` row → `ClickUpTask` UI type. Respects top-level column override rule. |
| `status-mapping.ts` | `mapStatus()` — raw ClickUp status → portal canonical status enum. |
| `status-dictionary.ts` | `STATUS_LABELS`, `PRIORITY_LABELS` (German). |
| `dictionary.ts` | Additional German labels + toast message strings. |
| `task-list-utils.ts` | `filterTasks`, `addDays`, date-window helpers used by TaskList + tests. |
| `logger.ts` | Module-local logger wrapper. |

### types/tasks.ts

- `ClickUpTask` — UI-facing task shape
- `CachedTask` — raw `task_cache` row (snake_case columns + `raw_data` JSON)
- `TaskPriority` — `'urgent' | 'high' | 'normal' | 'low'` union
- `CreateTaskInput` — form-to-EF payload shape (includes numeric priority 1-4)

### Cross-module edges

- Uses `shared/hooks/useOrg` for role-based action gating (viewers cannot approve).
- Uses `shared/hooks/useAuth` for `profile_id` filtering.
- Uses `shared/components/ui/SideSheet` for `TaskDetailSheet` base.
- Uses `shared/components/common/StatusBadge` for in-card status.
- `tickets` notification UI (`NotificationBell`) serves the **entire app** — notifications from projects, files, org, memberships all surface through this bell.
- Feeds `shared/pages/MeineAufgabenPage` (cross-module "my tasks" view).

### Related Edge Functions

`fetch-clickup-tasks`, `fetch-single-task`, `fetch-task-comments`, `create-clickup-task`, `post-task-comment`, `update-task-status`, `send-support-message`, `clickup-webhook` (inbound webhook, not called by UI).

---

## modules/projects/ — Project Experience

**What it is:** Guided delivery view for project-style work (Phases 1-3 Konzept/Design/Entwicklung/Launch). Clients see progress per step, upload briefing materials, read agency updates, approve step outputs.

**Entry points (pages):**
- `pages/UebersichtPage.tsx` — project overview (hero + timeline + tabs)
- `pages/NachrichtenPage.tsx` — message thread for the project
- `pages/DateienPage.tsx` — project files tab (Nextcloud subfolder)

**Primary data source:** `project_configs`, `project_task_cache`, `step_enrichment` (Supabase, enriched via Claude Haiku in `fetch-project-tasks` EF).

### Architecture rules (this module)

1. Project tasks are a **separate** cache (`project_task_cache`) from ticket tasks (`task_cache`). Do NOT conflate.
2. AI enrichment (`fetch-project-tasks` EF → Claude Haiku) produces `step_enrichment` rows with `why_it_matters` + `what_becomes_fixed`. Never surface raw ClickUp task descriptions.
3. Phase color scheme is fixed: Konzept purple / Design blue / Entwicklung yellow / Launch green. Use `phase-colors.ts`, not inline Tailwind.
4. "Chapter" = ClickUp custom field on project tasks. See `useChapterHelpers.ts`.
5. Memory: project memory (`manage-project-memory` EF + `memory-store.ts`) is persistent context the agency writes for the client — NOT user-editable.

### components/

**Top-level:**
| File | Role |
|---|---|
| `SchritteSheet.tsx` | Sheet wrapping per-step details. |
| `StepSheet.tsx` | Individual step drawer. |
| `UploadDropZone.tsx` | Drag-and-drop upload area used on project pages. |
| `UploadFolderSelector.tsx` | Picker for which subfolder to upload into. |

**overview/:**
| File | Role |
|---|---|
| `OverviewPage.tsx` | Main page body — hero + tabs + feed. |
| `DynamicHero.tsx` | Header block; adapts to phase + next action. |
| `PhaseTimeline.tsx`, `PhaseNode.tsx`, `PhaseConnector.tsx`, `PhaseTimelineSkeleton.tsx` | Phase progress visualization. |
| `OverviewTabs.tsx`, `UpdatesFeed.tsx`, `FilesTab.tsx`, `MessagesTab.tsx` | Overview tab strip + contents. |
| `AttentionList.tsx` | "Items needing your action" block. |
| `ContextStrip.tsx` | Slim context row (phase, briefings count, etc.). |
| `QuickActions.tsx` | Cluster of primary CTAs. |
| `ActivityItems.tsx` | Renders individual activity entries in the feed. |
| `ProjectContextSection.tsx`, `ProjectContextPreview.tsx`, `ProjectContextAdminPanel.tsx` | "What is this project about" block. Admin-panel version for agency edits. |
| `ProjectMemorySheet.tsx` | Admin sheet for editing project memory rows. |

**steps/:**
| File | Role |
|---|---|
| `StepDetail.tsx` | Single-step body inside `StepSheet`. |
| `StepActionBar.tsx` | Per-step actions (approve step, request changes). |

**files/:**
| File | Role |
|---|---|
| `FolderView.tsx`, `FileBrowser.tsx`, `FileRow.tsx`, `FolderCard.tsx` | Nextcloud browser inside a project. |
| `FileUpload.tsx`, `CreateFolderInput.tsx` | Upload + new-folder UI for project subtree. |
| `FileTypeIcon.tsx` | Icon chooser based on mime/extension. |
| `FilesPage.tsx` | Renders inside the "Dateien" tab of the project shell. |

**messages/, help/:**
- `MessagesPage.tsx` — message thread (project-scoped).
- `HelpPage.tsx` — per-project help content.

### hooks/

| File | Role |
|---|---|
| `useProject.ts` | Single project fetch by slug/id. |
| `useProjects.ts` | List of projects the user can see. |
| `useChapterHelpers.ts` | Derive chapter set + label + color from task custom field. |
| `useHeroPriority.ts` | Compute what to highlight in `DynamicHero`. |
| `useNextcloudFiles.ts` | Nextcloud listings via `nextcloud-files` EF. Path-scoped to project subtree. |
| `useProjectActivity.ts` | Project-specific activity feed query. |
| `useProjectComments.ts` | Message thread for project. |
| `useProjectFileActivity.ts` | File-upload/delete events for a project. |
| `useProjectMemory.ts` | Project memory read + admin-write via `manage-project-memory` EF. |

### lib/

| File | Role |
|---|---|
| `helpers.ts` | Shared project helpers (path, url, phase derivation). |
| `slugify.ts` | URL-safe project slug. |
| `memory-store.ts` | Typed access to project memory rows. `installMemoryTestAdapter` for tests. |
| `memory-access.ts` | Permission/scope helpers for memory reads. |
| `transforms-project.ts` | `project_task_cache` row → UI shape. |
| `phase-colors.ts` | Phase → color token mapping. |
| `step-status-mapping.ts` | Step status enum conversion. |
| `overview-interpretation.ts` | Turns raw task state into hero copy + next-action hints. |
| `quick-action-helpers.ts` | Decide which CTAs to show in `QuickActions`. |
| `mock-data.ts` | Test/dev fixtures. |

### Cross-module edges

- Uses `shared/hooks/useAuth`, `useOrg`, `useWorkspaces`.
- Uses `shared/components/ui/SideSheet` for step/memory sheets.
- Upload/files path uses `shared/lib/upload-with-progress.ts`.
- `tickets/components/NotificationBell` surfaces project-scoped notifications.

### Related Edge Functions

`fetch-project-tasks`, `manage-project-memory`, plus `nextcloud-files` (shared with Files module), `send-feedback`, `post-task-comment` (used for project-task comments as well).

---

## modules/files/ — Client Files

**What it is:** Top-level file browser for the org's Nextcloud root. Read-only at root, CRUD inside subfolders. Source of truth is Nextcloud (WebDAV) proxied via Edge Function.

**Entry point:** `pages/DateienPage.tsx`.

### Architecture rules (this module)

1. All file I/O goes through `nextcloud-files` Edge Function. Never call Nextcloud directly from the browser.
2. Root directory is read-only to the client — client can only create/delete/upload inside existing subfolders.
3. Uploads use `shared/lib/upload-with-progress.ts` for XHR progress events.
4. Activity events are logged to `client_file_activity` for the home feed.

### components/

| File | Role |
|---|---|
| `ClientFolderView.tsx` | Main browser — breadcrumbs + file rows + new-folder input. |
| `ClientFileRow.tsx` | Single file row — name, size, date, actions. |
| `ClientActionBar.tsx` | Upload button + folder creation trigger. |
| `CreateFolderInput.tsx` | Inline new-folder input. |
| `UploadProgressBar.tsx` | Per-file progress bar. Auto-dismisses on completion. |

### hooks/useClientFiles.ts

- `useClientFiles(path)` — list.
- `downloadClientFile(path)` — signed download.
- `uploadClientFile(file, path, onProgress)` — XHR upload via `upload-with-progress`.
- `createClientFolder(path)` — mkdir.
- `useDeleteClientItem` — delete file/folder.
- `useClientFileActivity` + `useSyncClientFileActivity` — feed helpers.

### Cross-module edges

- Shares the `nextcloud-files` EF with `projects/files/`. Different paths, same proxy.
- Uses `shared/lib/upload-with-progress.ts`.

---

## modules/organisation/ — Org Settings

**What it is:** Admin-only page for managing the org and its members. Only accessible to `org_members.role = 'admin'`.

**Entry point:** `pages/OrganisationPage.tsx` (redirects non-admins to `/tickets`).

### Architecture rules (this module)

1. Admin-only. Client-side guard via `useOrg().isAdmin`; server-side RLS enforces.
2. Member invites go through `invite-member` EF (creates auth user + `profiles` row + `org_members` row + sends mail).
3. Role changes are admin-only mutations on `org_members`.

### components/

| File | Role |
|---|---|
| `OrgInfoSection.tsx` | Displays org name, logo, ClickUp list IDs (read-only for now). |
| `TeamSection.tsx` | Member list + invite button. |
| `InviteMemberDialog.tsx` | Email + role picker, calls `invite-member` EF. |
| `MemberRowActions.tsx` | Per-row dropdown: change role, remove member. |
| `RolesInfoSection.tsx` | Static explainer of role capabilities (admin / member / viewer). |

### hooks/

| File | Role |
|---|---|
| `useOrgMembers.ts` | Fetch all `org_members` + joined `profiles` + pending-invite rows. |
| `useMemberActions.ts` | Mutations: update role, remove member. |

### Cross-module edges

- `shared/hooks/useOrg` is the single source of truth for org context app-wide.
- `scripts/onboard-client.ts` creates the initial admin member (needs sync when changing org data model).

### Related Edge Functions

`invite-member`, also `auth-email` (invite flow email template).

---

## shared/ — App Shell & Cross-module

**What it is:** Everything used by two or more modules, plus the shell itself (sidebar, auth, layout).

### app shell — shared/components/layout/

| File | Role |
|---|---|
| `AppShell.tsx` | Page frame: sidebar + main area + mobile header. |
| `Sidebar.tsx` | 3-zone Linear-style sidebar. Composes Global/Workspaces/Utilities. |
| `SidebarGlobalNav.tsx` | Top zone: Inbox, Meine Aufgaben, Hilfe, Konto. |
| `SidebarWorkspaces.tsx` | Middle zone: per-workspace nav from `client_workspaces`. |
| `SidebarUtilities.tsx` | Bottom zone: admin links, logout. |
| `SidebarUserFooter.tsx` | User avatar + name + env badge. |
| `MobileHeader.tsx` + `MobileSidebarOverlay.tsx` + `BottomNav.tsx` | Mobile shell components. |
| `ContentContainer.tsx` | Page width wrapper — **always `width="narrow"`** per project rule. |

### shared pages

| File | Route | Purpose |
|---|---|---|
| `pages/LoginPage.tsx` | `/login` | Email + password, magic link. |
| `pages/PasswortSetzenPage.tsx` | `/passwort-setzen` | First-login password flow. |
| `pages/MeineAufgabenPage.tsx` | `/meine-aufgaben` | Cross-module "my tasks" aggregator. |
| `pages/InboxPage.tsx` | `/inbox` | Notification center. |
| `pages/KontoPage.tsx` | `/konto` | Account settings, credit history. |
| `pages/HilfePage.tsx` | `/hilfe` | Static FAQ (`hilfe-faq-data.ts`). |
| `pages/NotFoundPage.tsx` | catch-all | 404. |

### hooks/

| File | Role |
|---|---|
| `useAuth.ts` | `AuthProvider` context. Supabase session, `profile_id`, sign-in/out/magiclink. |
| `useOrg.ts` | `OrgProvider` context. Org, role, `isAdmin`/`isMember`/`isViewer`. |
| `useWorkspaces.ts` | Sidebar workspaces from `client_workspaces`. |
| `useMeineAufgaben.ts` | Aggregate tasks-needing-attention across tickets + projects. |
| `useNeedsAttentionCount.ts` | Badge count for sidebar. |
| `useUpdateProfile.ts` | Profile mutations (name, avatar, email, password). |
| `useBreakpoint.ts` | Small hook for responsive switches. |
| `useSwipeGesture.ts` | Mobile swipe detection for sheet drag-close. |

### lib/

| File | Role |
|---|---|
| `supabase.ts` | Browser Supabase client. |
| `workspace-routes.ts` | Module-key → route mapping (for sidebar). |
| `session-timeout.ts` | Auto-logout after inactivity. |
| `password-validation.ts` | Password strength rules. |
| `date-utils.ts` | Format helpers (German locale). |
| `upload-with-progress.ts` | XHR upload wrapper with progress events. Used by Files + Projects. |
| `linkify.tsx` | URL auto-link in message text. |
| `hilfe-faq-data.ts` | Static FAQ content for HilfePage. |
| `slugify.ts` | Shared with `modules/projects/lib/slugify.ts` (TODO: dedupe). |
| `utils.ts` | `cn()` class merger (clsx + tailwind-merge) and other micro-utilities. |

### components (cross-module UI)

**common/**: `ConfirmDialog`, `EmptyState`, `LoadingSkeleton`, `MessageBubble`, `StatusBadge`, `UserAvatar`
**ui/** (shadcn base): `Button`, `Input`, `Tabs`, `Badge`, `Skeleton`, `Avatar`, `AlertDialog`, `Textarea`, `Tooltip`, `SideSheet`
**inbox/**: `NotificationAccordionItem`, `NotificationDetailPanel`, `TypeBadge`, `notification-utils.ts`
**konto/**: `AvatarUpload`, `CreditHistorySection`, `EmailSection`, `NotificationSection`, `PasswordSection`, `ProfileSection`
**help/**: `FaqItem`, `FaqSection`
**WorkspaceGuard.tsx** — wraps workspace-specific routes, checks `client_workspaces` has the requested module.

### styles/tokens.css

CSS custom properties for colors, spacing, typography. Priority tokens (`--priority-urgent/high/normal/low`), status tokens, phase colors, destructive/success/warning. **Add new color tokens here**, not inline Tailwind.

### types/

- `common.ts` — shared utility types.
- `organization.ts` — `Organization` interface matching `organizations` table.

---

## supabase/functions/ — Edge Functions

**Dispatch:** `main/index.ts` is the only entry point. It routes requests to worker functions via `EdgeRuntime.userWorkers.create()`. Every Edge Function is a subfolder with its own `index.ts`.

**Shared helpers:** `_shared/` — `cors.ts`, `logger.ts`, `utils.ts`, `emailCopy.ts`, `clickup-contract.ts`, `org.ts` (critical — see below), `wp-audit.ts`.

### `_shared/org.ts` — read this before touching any EF that reads user+task

- `getNonViewerProfileIds(supabase, profileIds)` — filter profile list to admin/member (drops viewers).
- `getOrgContextForUserAndTask(supabase, userId, taskId)` — resolves org via caller's `org_members` row, then validates task belongs to that org. Used for cross-org authz in `post-task-comment`.

### Ticket/Project functions

| Function | Purpose |
|---|---|
| `fetch-clickup-tasks` | Poll ClickUp → upsert `task_cache`. Called from useClickUpTasks. |
| `fetch-single-task` | Single-task fetch → upsert one row. |
| `fetch-project-tasks` | Project-task fetch + Claude Haiku enrichment → `project_task_cache` + `step_enrichment`. |
| `fetch-task-comments` | Comment thread → `comment_cache`. |
| `create-clickup-task` | Dual-mode: ticket (priority 1-4) or project (with chapter custom field). |
| `post-task-comment` | Post comment to ClickUp + peer-notification fan-out + `comment_cache` update. |
| `update-task-status` | All client actions: approve, request_changes, put_on_hold, resume, cancel, approve_credits, accept/decline_recommendation. Uses `upsert_task_deduction` RPC for credit UPSERT. |
| `clickup-webhook` | Inbound webhook from ClickUp. Updates `task_cache`, fires notifications. Excludes viewers. |
| `send-reminders` | Scheduled (dual-purpose): (1) ticket reminders for `client_review` idle 5+ days, (2) project reminders every 3 days in `client review`, (3) unread-message digest (48h cooldown), (4) recommendation reminders (5-day cooldown). |
| `send-weekly-summary` | Scheduled Monday 09:00 CET. Sends per-admin weekly digest with tiered delivery (SKIP / LIGHT / FULL). FULL includes agency-work section ("Was wir gemacht haben" — AI narrative via OpenRouter + Claude Haiku 4.5, completed, in-progress, team comments, peer activity), per-project block (always shown if admin has an active project), and client-pending blocks (waiting / recs / unread). LIGHT is pending-only with gentler subject "Offene Punkte — KW X". SKIP fires when admin has zero activity and zero pending. 6-day cooldown via `profiles.last_weekly_summary_sent_at`. |

### Integration functions

| Function | Purpose |
|---|---|
| `nextcloud-files` | WebDAV proxy: list, download, upload (XHR progress), mkdir, delete, delete-client. |
| `send-mailjet-email` | Mailjet email send. |
| `auth-email` | Custom auth-flow emails (invite, magic link, reset). |
| `send-support-message` | Support chat message → ClickUp comment on support task. |

### Org functions

| Function | Purpose |
|---|---|
| `invite-member` | Creates auth user + profile + `org_members` row + invite email. |
| `credit-topup` | Admin-only credit package top-up. |

### Other

| Function | Purpose |
|---|---|
| `manage-project-memory` | Read/write `project_memory` rows. |
| `send-feedback` | Feedback form → agency email. |
| `triage-agent` | Experimental agent (see `docs/ideas/triage-agent.md`). |

---

## Key cross-module mental model

**Auth & Org**: every module depends on `shared/hooks/useAuth` (session) and `useOrg` (role). Start here for any "who can do what" question.

**Task data flow (tickets)**: ClickUp ←→ Edge Function ←→ `task_cache` ←→ React Query ←→ UI. Realtime pushes updates; polling is fallback.

**Task data flow (projects)**: same shape but different cache (`project_task_cache`) and AI-enriched with `step_enrichment`.

**Files**: all go through `nextcloud-files` EF. Root = org-level browser (Files module); subfolders = project-scoped (Projects module).

**Notifications**: server-side writes to `notifications` table (RLS filters by `profile_id`). Client reads via `useNotifications` + `NotificationBell` in tickets module — but the bell is a global surface.

**Actions**: every destructive client action routes through `update-task-status` (tickets) or `manage-project-memory` / analogous (projects). Never mutate cache tables directly from the client.

## When adding a new cross-module feature

1. Decide: does it belong in one module, or should it be in `shared/`?
2. If shared and UI-level → `shared/components/`. If shared and logic-level → `shared/hooks/` or `shared/lib/`.
3. If module-specific but needs cross-module data → use an existing `shared/` hook rather than duplicating queries.
4. Any new DB column: check whether it affects transforms (`modules/*/lib/transforms*.ts`) and whether top-level-overrides-raw_data rule applies (tickets module).
5. Any new Edge Function: add routing entry in `supabase/functions/main/index.ts` + cors whitelist.
6. Update this map when the module shape changes.
