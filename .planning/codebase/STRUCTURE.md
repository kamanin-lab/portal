# Codebase Structure

**Analysis Date:** 2026-03-26

## Directory Layout

```
PORTAL/                              ← Git repository root
├── .claude/                         # Agent roles, skills, settings
├── .planning/codebase/              # Generated codebase analysis (this document)
├── .learnings/                      # Learning memory (auto-updated)
├── .github/workflows/               # CI/CD (Vercel auto-deploy)
├── .vercel/                         # Vercel config (SPA rewrites, auth proxy)
├── archive/legacy-reference/        # Historical code, reference only
├── docs/                            # Project documentation
│   ├── ARCHITECTURE.md              # System architecture
│   ├── DECISIONS.md                 # Architecture Decision Records
│   ├── CHANGELOG.md                 # Version history
│   ├── SPEC.md                      # Design spec (tokens, components, values)
│   ├── BROWSER_TESTING.md           # E2E testing guide
│   ├── CLICKUP_INTEGRATION.md       # ClickUp API integration notes
│   ├── ideas/                       # Feature proposals (future work)
│   ├── planning/                    # Domain model, delivery rules, product gaps
│   ├── reference/                   # API docs (Context Hub caches)
│   └── system-context/              # Architectural source-of-truth
│       ├── DATABASE_SCHEMA.md       # Table definitions, RLS policies
│       ├── NOTIFICATION_MATRIX.md   # Email/bell trigger rules
│       ├── PRODUCT_VISION.md        # Product roadmap
│       ├── STATUS_TRANSITION_MATRIX.md # Allowed status changes
│       ├── SYSTEM_CONSTRAINTS.md    # Non-negotiable rules
│       └── TECH_CONTEXT.md          # Full stack documentation
├── scripts/                         # Automation
│   ├── onboard-client.ts            # Client onboarding (auth user + profile + workspaces)
│   └── openrouter-review.cjs        # Post-code review via GPT-5.4-mini
├── supabase/functions/              # Edge Functions (Deno runtime)
│   ├── main/index.ts                # Router dispatcher
│   ├── _shared/                     # Shared utils (cors.ts, logger.ts, utils.ts, emailCopy.ts, clickup-contract.ts)
│   ├── auth-email/                  # Custom email hook (not used yet)
│   ├── clickup-webhook/             # ClickUp → task_cache/credit_transactions
│   ├── create-clickup-task/         # Task creation (dual: ticket or project)
│   ├── fetch-clickup-tasks/         # Sync ClickUp → task_cache + visibility filter
│   ├── fetch-project-tasks/         # Sync project tasks + AI enrichment
│   ├── fetch-single-task/           # Single task detail
│   ├── fetch-task-comments/         # Comments for a task
│   ├── post-task-comment/           # Create comment
│   ├── manage-project-memory/       # AI memory for projects
│   ├── update-task-status/          # Status change + notifications
│   ├── nextcloud-files/             # WebDAV proxy (list/download/upload)
│   ├── send-mailjet-email/          # Email via Mailjet
│   ├── send-support-message/        # Support chat messages
│   ├── credit-topup/                # Monthly credit replenishment (pg_cron)
│   └── send-feedback/               # User feedback endpoint
├── src/
│   ├── main.tsx                     # React DOM render
│   ├── App.tsx                      # Root component (providers: QueryClientProvider, BrowserRouter, AuthProvider)
│   ├── index.css                    # Global styles + Tailwind directives
│   ├── app/                         # App-level routing & guards
│   │   ├── routes.tsx               # Route registry (all routes defined here)
│   │   └── ProtectedRoute.tsx       # Authentication gate
│   ├── shared/                      # Shared across all modules
│   │   ├── components/
│   │   │   ├── layout/              # Page shell (AppShell, Sidebar, MobileHeader, BottomNav, ContentContainer)
│   │   │   ├── common/              # Reusable UI (ConfirmDialog, EmptyState, LoadingSkeleton, StatusBadge, UserAvatar, MessageBubble)
│   │   │   ├── ui/                  # shadcn/ui components (Button, Input, Tabs, Badge, AlertDialog, Textarea, Avatar, Skeleton, SideSheet)
│   │   │   ├── konto/               # Account page sections (AvatarUpload, ProfileSection, PasswordSection, EmailSection, NotificationSection)
│   │   │   └── WorkspaceGuard.tsx   # Module access control (checks client_workspaces)
│   │   ├── hooks/                   # Custom hooks
│   │   │   ├── useAuth.ts           # Auth context (user, session, profile, sign in/out)
│   │   │   ├── useWorkspaces.ts     # Workspace access list
│   │   │   ├── useBreakpoint.ts     # Responsive breakpoint detection
│   │   │   └── useUpdateProfile.ts  # Profile mutations
│   │   ├── lib/
│   │   │   ├── supabase.ts          # Singleton Supabase client with auto-refresh
│   │   │   ├── utils.ts             # General utilities (cn, classname helpers)
│   │   │   ├── linkify.tsx          # Convert URLs in text to clickable links
│   │   │   ├── password-validation.ts # Password strength rules
│   │   │   ├── slugify.ts           # URL-safe string conversion
│   │   │   └── workspace-routes.ts  # Route generation for workspace modules
│   │   ├── styles/
│   │   │   └── tokens.css           # Design tokens (colors, spacing, typography, radius, shadows)
│   │   ├── types/
│   │   │   └── common.ts            # Profile, NotificationPreferences interfaces
│   │   └── pages/                   # Shared top-level pages
│   │       ├── LoginPage.tsx        # Email/password + magic link
│   │       ├── InboxPage.tsx        # Unified notifications + task summary
│   │       ├── MeineAufgabenPage.tsx # My tasks (filtered from task_cache)
│   │       ├── HilfePage.tsx        # Help / FAQ
│   │       ├── KontoPage.tsx        # Account settings (profile, password, notifications, avatar)
│   │       └── NotFoundPage.tsx     # 404
│   └── modules/                     # Feature-specific modules
│       ├── projects/                # Project Experience (live Supabase: project_config, chapters, tasks, enrichment)
│       │   ├── components/
│       │   │   ├── overview/        # OverviewPage, tabs (Overview, Files, Messages, Help), hero, timeline, activity, attention
│       │   │   ├── steps/           # Step detail, discussion, actions, metadata
│       │   │   ├── tasks/           # Project task list, cards
│       │   │   ├── files/           # File browser, folder view, upload
│       │   │   ├── messages/        # Team messages
│       │   │   ├── help/            # Project-specific help
│       │   │   ├── MessageSheet.tsx # Message detail (Sheet-based)
│       │   │   ├── SchritteSheet.tsx # Step detail (Sheet-based)
│       │   │   └── [others]         # Components for hero, phase timeline, quick actions, context strips
│       │   ├── hooks/               # Data fetching & mutations
│       │   │   ├── useProject.ts    # Fetch project config + chapters + tasks + enrichment
│       │   │   ├── useProjects.ts   # List all projects user has access to
│       │   │   ├── useProjectMemory.ts # AI project context management
│       │   │   ├── useChapterHelpers.ts # Chapter navigation
│       │   │   ├── useHeroPriority.ts # Attention item calculation
│       │   │   ├── useNextcloudFilesByPath.ts # File listing
│       │   │   ├── useUploadFileByPath.ts # File upload
│       │   │   └── useCreateFolder.ts # Folder creation
│       │   ├── lib/                 # Transforms & helpers
│       │   │   ├── transforms-project.ts # Raw rows → Project/Chapter/Step objects
│       │   │   ├── phase-colors.ts  # Phase color mapping
│       │   │   ├── step-status-mapping.ts # Step status display
│       │   │   ├── memory-access.ts # Project memory queries
│       │   │   ├── memory-store.ts  # Memory persistence logic
│       │   │   ├── overview-interpretation.ts # Activity/attention interpretation
│       │   │   └── [helpers]        # Utility functions
│       │   ├── types/
│       │   │   └── project.ts       # Project, Chapter, Step, Task interfaces; Supabase row types
│       │   ├── pages/
│       │   │   └── UebersichtPage.tsx # Project detail (wrapper, renders OverviewPage)
│       │   └── __tests__/           # Unit & integration tests for transforms, memory, overview logic
│       ├── tickets/                 # Tasks & Support (live Supabase: task_cache, comment_cache)
│       │   ├── components/
│       │   │   ├── TaskCard.tsx     # Single task display
│       │   │   ├── TaskList.tsx     # Filtered task list
│       │   │   ├── TaskDetail.tsx   # Task full view (status, comments, actions)
│       │   │   ├── TaskDetailSheet.tsx # Sheet-based task detail (URL state ?taskId=...)
│       │   │   ├── TaskActions.tsx  # Approve, request changes, hold, resume, cancel
│       │   │   ├── TaskFilters.tsx  # Filter dropdown (Open, In Progress, Needs Attention, etc.)
│       │   │   ├── TaskFilterPanel.tsx # Expandable filter panel (priority, date range)
│       │   │   ├── TaskSearchBar.tsx # Search input (name, description)
│       │   │   ├── TaskComments.tsx # Comment list + form
│       │   │   ├── CommentInput.tsx # Comment creation (text + file attachments)
│       │   │   ├── NewTaskButton.tsx # Create task button
│       │   │   ├── NewTicketDialog.tsx # Task creation dialog (mode: ticket or project)
│       │   │   ├── SyncIndicator.tsx # Realtime sync status (deprecated, handled by realtime now)
│       │   │   ├── NotificationBell.tsx # Unread notifications dropdown
│       │   │   ├── SupportChat.tsx  # Support channel messages
│       │   │   ├── SupportSheet.tsx # Support chat (Sheet-based)
│       │   │   ├── CreditBalance.tsx # Credit balance display
│       │   │   ├── CreditBadge.tsx  # Credit cost indicator
│       │   │   ├── CreditApproval.tsx # Approve credit deduction
│       │   │   ├── FileAttachments.tsx # Attachment display
│       │   │   ├── PriorityIcon.tsx # Volume-bar priority icons (1-3 bars + AlertCircle for urgent)
│       │   │   ├── TicketFormFields.tsx # Form for ticket creation
│       │   │   └── ProjectTaskFormFields.tsx # Form for project task creation (with chapters)
│       │   ├── hooks/               # Data fetching & mutations
│       │   │   ├── useClickUpTasks.ts # Fetch task_cache, Realtime subscription, debounced refetch
│       │   │   ├── useSingleTask.ts # Fetch single task by ID
│       │   │   ├── useTaskComments.ts # Fetch comment_cache, post new comments
│       │   │   ├── useTaskActions.ts # Update task status (approve, request changes, etc.)
│       │   │   ├── useCreateTask.ts # Create new ticket/project task
│       │   │   ├── useNotifications.ts # Fetch notifications table, mark read
│       │   │   ├── useUnreadCounts.ts # Unread counts (support + per-task)
│       │   │   ├── useSupportTaskChat.ts # Support channel message fetching/posting
│       │   │   └── useCredits.ts    # Credit balance & package queries
│       │   ├── lib/                 # Transforms & utilities
│       │   │   ├── status-mapping.ts # ClickUp string → TaskStatus enum (mapStatus function)
│       │   │   ├── status-dictionary.ts # German status labels
│       │   │   ├── transforms.ts    # transformCachedTask, transformCachedComment (enforces architecture rule #4)
│       │   │   ├── task-list-utils.ts # Filtering, sorting, search helpers
│       │   │   ├── dictionary.ts    # Task-related labels & constants
│       │   │   └── logger.ts        # Custom logging utility
│       │   ├── types/
│       │   │   └── tasks.ts         # ClickUpTask, CachedTask, TaskComment, CachedComment, TaskStatus enums
│       │   ├── pages/
│       │   │   ├── TicketsPage.tsx  # Task list + detail sheet + filters + new task dialog
│       │   │   └── SupportPage.tsx  # Support channel interface
│       │   └── __tests__/           # Unit tests for status mapping, transforms, search, support chat
│       └── files/                   # Client file browser (Nextcloud WebDAV)
│           ├── components/
│           │   ├── ClientFolderView.tsx # File/folder tree browser
│           │   ├── ClientFileRow.tsx # Single file/folder row
│           │   ├── ClientActionBar.tsx # Breadcrumb + new folder + upload
│           │   ├── CreateFolderInput.tsx # Inline folder creation
│           │   └── [upload/icon components]
│           ├── hooks/
│           │   └── useClientFiles.ts # Nextcloud WebDAV list, upload, mkdir
│           └── pages/
│               └── DateienPage.tsx  # File browser entry point (dynamic root folders)
├── vite.config.ts                  # Vite build config (React + TypeScript)
├── vitest.config.ts                # Test runner config (unit/integration tests)
├── tsconfig.json                   # TypeScript compiler config (strict mode, path aliases)
├── package.json                    # Dependencies (React, React Query, Tailwind, Motion, shadcn/ui)
├── vercel.json                     # Vercel deployment (SPA rewrites, auth proxy to self-hosted Supabase)
└── CLAUDE.md                       # Project instructions (this is the canonical reference)
```

## Directory Purposes

**`.planning/codebase/`:**
- Purpose: Generated codebase analysis documents (ARCHITECTURE.md, STRUCTURE.md, CONVENTIONS.md, TESTING.md, CONCERNS.md)
- Contains: Analysis for code navigation and implementation guidance
- Key files: This document + ARCHITECTURE.md

**`docs/`:**
- Purpose: Project documentation — spec, decisions, roadmap
- Key files:
  - `SPEC.md` — design tokens, component specs, pixel values
  - `ARCHITECTURE.md` — data flow, module structure, constraints
  - `DECISIONS.md` — Architecture Decision Records
  - `CHANGELOG.md` — release notes and changes
  - `system-context/DATABASE_SCHEMA.md` — table schema, RLS policies

**`docs/system-context/`:**
- Purpose: Architectural source-of-truth
- Key files:
  - `SYSTEM_CONSTRAINTS.md` — 12 non-negotiable rules (UI reads from cache, tokens server-side, etc.)
  - `DATABASE_SCHEMA.md` — table definitions, columns, RLS policies
  - `STATUS_TRANSITION_MATRIX.md` — allowed status changes + notification triggers
  - `NOTIFICATION_MATRIX.md` — email/bell triggers for each event

**`supabase/functions/`:**
- Purpose: Server-side Edge Functions (Deno runtime) for API proxying and webhooks
- Architecture: Single `main/index.ts` router dispatches to worker functions
- Key functions:
  - `fetch-clickup-tasks` — sync + filter
  - `clickup-webhook` — event ingestion
  - `create-clickup-task` — dual-mode creation
  - `nextcloud-files` — WebDAV proxy
  - Deployment: volume mount (not Supabase CLI)

**`src/app/`:**
- Purpose: App-level routing and guards
- Key files:
  - `routes.tsx` — all routes defined here; lazy loading; Suspense fallbacks
  - `ProtectedRoute.tsx` — authentication gate

**`src/shared/`:**
- Purpose: Shared across all feature modules
- Contents: Auth context, layout shell, reusable UI primitives, utilities

**`src/shared/components/layout/`:**
- Purpose: Page shell structure
- Key files:
  - `AppShell.tsx` — main wrapper (Sidebar desktop, MobileHeader mobile, Outlet)
  - `Sidebar.tsx` — 3-zone navigation (Global, Workspaces, Utilities)
  - `ContentContainer.tsx` — page width wrapper (narrow=max-w-4xl, wide=max-w-6xl)

**`src/modules/tickets/`:**
- Purpose: Task & Support module (ClickUp tasks, comments, credits, support chat)
- Scope: task_cache, comment_cache, credit_transactions tables
- Pages: TicketsPage (task list + detail sheet), SupportPage (support chat)

**`src/modules/projects/`:**
- Purpose: Project Experience module
- Scope: project_config, chapter_config, project_task_cache, step_enrichment, project_access tables
- Pages: UebersichtPage (overview + tabs)

**`src/modules/files/`:**
- Purpose: Client file browser
- Scope: Nextcloud WebDAV (read-only or with upload depending on folder permission)
- Pages: DateienPage (dynamic root folders from profiles.nextcloud_client_root)

## Key File Locations

**Entry Points:**
- `src/main.tsx` — React DOM render to #root
- `src/App.tsx` — Root component, wraps with providers
- `src/app/routes.tsx` — Route registry

**Configuration:**
- `.env.local` — VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, OPENROUTER_API_KEY (local only, not committed)
- `vercel.json` — SPA rewrites, auth proxy
- `tsconfig.json` — compiler options, path aliases (`@/*` → `src/*`)
- `vite.config.ts` — Vite plugins, React preset
- `vitest.config.ts` — Test globals, environments

**Core Logic:**
- `src/shared/lib/supabase.ts` — Supabase client singleton
- `src/shared/hooks/useAuth.ts` — Auth context provider
- `src/modules/tickets/lib/status-mapping.ts` — Status normalization (critical)
- `src/modules/tickets/lib/transforms.ts` — Cache row transforms (enforces architecture rules)
- `src/modules/projects/lib/transforms-project.ts` — Project data assembly

**Design System:**
- `src/shared/styles/tokens.css` — CSS custom properties (colors, spacing, typography, radius, shadows)
- `src/shared/components/ui/` — shadcn/ui components (customized via tokens)

**Testing:**
- `src/modules/tickets/__tests__/` — status mapping, transforms, task list search, support chat tests
- `src/modules/projects/__tests__/` — transforms, memory access, overview interpretation tests
- `vitest.config.ts` — test runner setup

## Naming Conventions

**Files:**
- Components: PascalCase (e.g., `TaskCard.tsx`, `OverviewPage.tsx`)
- Hooks: camelCase, prefixed with `use` (e.g., `useClickUpTasks.ts`, `useProject.ts`)
- Utilities: camelCase (e.g., `transforms.ts`, `status-mapping.ts`)
- Types: camelCase (e.g., `tasks.ts`, `project.ts`)
- Pages: PascalCase + "Page" suffix (e.g., `TicketsPage.tsx`, `OverviewPage.tsx`)

**Directories:**
- Feature modules: lowercase (e.g., `tickets/`, `projects/`, `files/`)
- Component subdirectories: lowercase by feature (e.g., `overview/`, `steps/`, `files/`)
- Shared utilities: `lib/`, `hooks/`, `components/`, `types/`, `styles/`

**Functions & Variables:**
- Event handlers: camelCase, prefixed with action (e.g., `openTask()`, `closeTask()`, `handleSubmit()`)
- Hooks: `use` prefix (e.g., `useClickUpTasks`, `useTaskActions`)
- Transformers: `transform*` prefix (e.g., `transformCachedTask`, `transformToProject`)
- Status mappers: `map*` or `is*` prefix (e.g., `mapStatus()`, `needsClientAction()`, `isTerminal()`)

**Types & Interfaces:**
- Component props: `{ComponentName}Props` (e.g., `TaskCardProps`)
- API responses: `{Feature}Response` (e.g., `FetchTasksResponse`)
- Database rows: `{Table}Row` (e.g., `CachedTask`, `ProjectTaskCacheRow`)
- Display types: `{Feature}` (e.g., `ClickUpTask`, `Project`, `Chapter`)

## Where to Add New Code

**New Feature Module:**
- Directory: `src/modules/{feature_name}/`
- Structure:
  ```
  src/modules/{feature}/
  ├── components/          # UI components
  ├── hooks/               # Custom hooks (data fetching, mutations)
  ├── lib/                 # Transforms, utilities, helpers
  ├── types/               # TypeScript interfaces
  ├── pages/               # Route entry points
  └── __tests__/           # Unit tests
  ```
- Example: `src/modules/tickets/` or `src/modules/projects/`

**New Page Within Module:**
- Primary code: `src/modules/{feature}/pages/{PageName}Page.tsx`
- Tests: `src/modules/{feature}/__tests__/page-name.test.tsx`
- Hook data: `src/modules/{feature}/hooks/usePageData.ts`
- Components used by page: `src/modules/{feature}/components/{Feature}Page.tsx` (if complex)

**New Reusable Component:**
- Shared across modules: `src/shared/components/{category}/{ComponentName}.tsx`
- Module-specific: `src/modules/{feature}/components/{ComponentName}.tsx`
- Category options: `layout/`, `common/`, `ui/`, `konto/`

**New Custom Hook:**
- Location: `src/modules/{feature}/hooks/{hookName}.ts` or `src/shared/hooks/{hookName}.ts`
- Pattern:
  ```typescript
  import { useQuery, useMutation } from '@tanstack/react-query'

  export function useFeatureData() {
    const { data, isLoading, error } = useQuery({
      queryKey: ['feature-data'],
      queryFn: async () => { /* fetch from Supabase */ },
    })
    return { data, isLoading, error }
  }
  ```

**New Utility/Transform:**
- Location: `src/modules/{feature}/lib/{utilName}.ts`
- Pattern: Export pure functions; no side effects
- Example: `transformCachedTask()`, `mapStatus()`, `filterTasks()`

**New Test:**
- Location: `src/modules/{feature}/__tests__/{feature-name}.test.ts`
- Framework: Vitest
- Pattern:
  ```typescript
  import { describe, it, expect } from 'vitest'

  describe('transformCachedTask', () => {
    it('overrides raw_data with top-level columns', () => {
      // Test architecture rule #4
    })
  })
  ```

## Special Directories

**`archive/legacy-reference/`:**
- Purpose: Historical code, reference only
- Contents: Old kamanin-portal, old portal code
- Usage: DO NOT commit changes here; read-only reference for patterns
- Generated: No
- Committed: Yes (historical)

**`.planning/codebase/`:**
- Purpose: Generated analysis documents
- Committed: Yes (tracked in git)
- Generated: Yes (by `/gsd:map-codebase` agent)
- Update: Auto on architecture changes

**`.vercel/`:**
- Purpose: Vercel deployment metadata
- Generated: Yes (Vercel auto-generates)
- Committed: Yes

**`supabase/`:**
- Purpose: Backend configuration (Edge Functions)
- Not deployed via Supabase CLI (self-hosted)
- Deployed via volume mount to Coolify server
- Path on server: `/home/deno/functions/` (see main/index.ts)

---

*Structure analysis: 2026-03-26*
