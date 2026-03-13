# Changelog

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
