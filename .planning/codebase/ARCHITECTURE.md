# Architecture

**Analysis Date:** 2026-03-26

## Pattern Overview

**Overall:** React SPA with layered data flow — UI reads from Supabase cache tables, Edge Functions proxy external API calls (ClickUp, Nextcloud), Realtime subscriptions with fallback polling.

**Key Characteristics:**
- Cache-first design: UI never hits ClickUp or Nextcloud APIs directly
- Token/credentials server-side only (Edge Functions)
- RLS enforced on all tables — profile_id filtering
- Top-level cache columns override nested raw_data — critical for webhook consistency
- Modular feature structure with shared shell and domain-specific modules

## Layers

**Presentation (UI Components):**
- Purpose: React components for pages, sheets, forms, dialogs; Motion animations; shadcn/ui primitives
- Location: `src/shared/components/`, `src/modules/*/components/`
- Contains: Page containers, task/project/file views, detail sheets, dialogs, forms, layout components
- Depends on: Custom hooks, lib utilities, theme tokens
- Used by: Route handlers in `src/app/routes.tsx`

**Custom Hooks (Business Logic):**
- Purpose: Encapsulate data fetching, mutations, state management via React Query and context
- Location: `src/shared/hooks/`, `src/modules/*/hooks/`
- Contains: useAuth, useClickUpTasks, useTaskActions, useCreateTask, useProject, useClientFiles, useSingleTask, useTaskComments, useNotifications, useCredits
- Depends on: Supabase client, Edge Function invocation, transformers
- Used by: Presentation layer components

**Data Transformation (Lib):**
- Purpose: Convert raw Supabase rows → normalized types; implement status mapping; apply architecture rules
- Location: `src/modules/*/lib/`
- Contains: transforms.ts (e.g., transformCachedTask, transformCachedComment), status-mapping.ts, task-list-utils.ts, helpers
- Depends on: Type definitions
- Used by: Custom hooks

**Type Definitions:**
- Purpose: Interfaces for Supabase tables, ClickUp API responses, component props
- Location: `src/shared/types/`, `src/modules/*/types/`
- Contains: Profile, ClickUpTask, CachedTask, TaskComment, CachedComment, Project, Chapter, etc.
- Depends on: None
- Used by: All layers

**Supabase Client (Data Access):**
- Purpose: Singleton Supabase client with auto-session management, Realtime subscriptions
- Location: `src/shared/lib/supabase.ts`
- Initialization: localStorage-backed session, auto-refresh, CORS configured
- Realtime: eventsPerSecond limit 10; subscriptions debounced 300ms, fallback 30s polling

**Edge Functions (Server-Side Integration):**
- Purpose: Proxy ClickUp API, Nextcloud WebDAV, email; handle webhooks; maintain cache consistency
- Location: `supabase/functions/`
- Router: `supabase/functions/main/index.ts` — dispatches requests to worker functions
- Critical functions:
  - `fetch-clickup-tasks` — sync ClickUp → task_cache, return visibility-filtered tasks
  - `fetch-project-tasks` — sync project tasks → project_task_cache, trigger AI enrichment
  - `create-clickup-task` — dual-mode: ticket list or project list with phase custom field
  - `clickup-webhook` — receive status/credit changes → update task_cache, credit_transactions
  - `nextcloud-files` — WebDAV proxy for list/download/upload/mkdir
  - `post-task-comment` — create comment in ClickUp + cache
  - `send-mailjet-email` — transactional email
- Auth: JWT verification via `VERIFY_JWT` env var; ClickUp token and Nextcloud creds server-side only

**Authentication (Supabase Auth):**
- Purpose: Email/password + magic link via Supabase GoTrue
- Profile lookup: `useAuth` context hook fetches from profiles table (RLS-filtered by auth.users.id)
- Session management: persisted to localStorage, auto-refresh, detectSessionInUrl for magic links

## Data Flow

**Task Fetch & Display:**

1. Page mounts → `useClickUpTasks` (React Query)
2. Query runs:
   - First: fetch from `task_cache` (filtered by profile_id, is_visible=true)
   - Fallback: invoke `fetch-clickup-tasks` Edge Function
3. Transform: `transformCachedTask` applies architecture rule — top-level columns override raw_data
4. Render: TaskList displays transformed tasks
5. Updates: Realtime channel `task-cache-{userId}` listens for postgres_changes (debounced 300ms)
6. Stale: React Query staleTime 5min, refetch on window focus/visibility

**Status Display & Action:**

- Task status always comes from `task_cache.status` (not raw_data)
- Before rendering/comparing: call `mapStatus(task.status)` to convert ClickUp string → portal TaskStatus enum
- Status mapping reference: `src/modules/tickets/lib/status-mapping.ts`
- Actions (Approve, Request Changes, etc.) available only when `needsClientAction(status)` is true

**Comment Fetch & Post:**

1. TaskDetailSheet mounts → `useTaskComments` queries `comment_cache` (by task_id, filtered by profile_id)
2. User writes comment → `useTaskComments.mutate()` (or `post-task-comment` mutation)
3. Edge Function receives request → validate user → post to ClickUp API → log in comment_cache → return with optimistic update
4. Realtime propagates comment_cache INSERT to all subscribed clients

**Project Data & Enrichment:**

1. `UebersichtPage` mounts → `useProject()` (React Query, query key `['project', projectId]`)
2. Fetches 6 data sources in parallel:
   - `project_config` (single row)
   - `chapter_config` (ordered by sort_order)
   - `project_task_cache` (all tasks for project)
   - `step_enrichment` (join by clickup_task_id for AI-generated context)
   - `comment_cache` (count per task)
   - `project_quick_actions` (config)
3. Transform: `transformToProject` merges all sources into nested Project object with Chapters and Steps
4. AI enrichment: If task not in step_enrichment, `fetch-project-tasks` Edge Function triggers Claude Haiku → generates why_it_matters + what_becomes_fixed, upserts step_enrichment

**File Management:**

1. `DateienPage` mounts → `useClientFiles(sub_path)` invokes `nextcloud-files` Edge Function
2. Edge Function: WebDAV LIST on `profiles.nextcloud_client_root + sub_path` → returns filtered tree
3. User uploads file → `useUploadFileByPath(folder_path, file)` → Edge Function WebDAV PUT
4. Download: direct href to `nextcloud-files?method=download&path=...`

**State Management:**

- Server state: React Query (tasks, comments, projects, files) — TanStack Query handles caching & sync
- UI state: React Context (`AuthProvider`, `useWorkspaces`)
- Real-time updates: Supabase Realtime channels with 300ms debounce → React Query refetch
- Fallback: 30s polling via React Query staleTime if Realtime drops

## Key Abstractions

**mapStatus(clickupStatus: string) → TaskStatus:**
- Purpose: Normalize ClickUp status strings → portal enum
- Examples: "in progress" → "in_progress", "client review" → "needs_attention", "complete" → "done"
- Rule: Always convert before rendering or comparing status
- Location: `src/modules/tickets/lib/status-mapping.ts`
- Pattern: All status checks use mapStatus output, never raw string

**transformCachedTask(cached: CachedTask) → ClickUpTask:**
- Purpose: Convert task_cache row → display-ready ClickUpTask
- Rule: Top-level cache columns (status, status_color, etc.) ALWAYS override raw_data (architecture rule #4)
- Reason: Webhooks update top-level fields first; raw_data may lag
- Location: `src/modules/tickets/lib/transforms.ts`
- Pattern: used in useClickUpTasks, useSingleTask

**transformCachedComment(cached: CachedComment) → TaskComment:**
- Purpose: Convert comment_cache row → TaskComment
- Rule: display_text (cleaned) takes precedence over raw comment_text
- Location: `src/modules/tickets/lib/transforms.ts`

**useClickUpTasks():**
- Purpose: Fetch, cache, and subscribe to task updates
- Returns: { data: ClickUpTask[], isLoading, error, refetch }
- Internals: React Query query key `['clickup-tasks']`, staleTime 5min, Realtime channel `task-cache-{userId}` with 300ms debounce
- Fallback: if Realtime not available, 30s polling via staleTime

**ContentContainer width="narrow" | "wide":**
- Purpose: Consistent page layout wrapper (max-w-4xl or max-w-6xl, centered)
- Rule: Every app page uses ContentContainer(width="narrow") except login/auth and full-viewport layouts
- Location: `src/shared/components/layout/ContentContainer.tsx`

**ProtectedRoute + WorkspaceGuard:**
- Purpose: Authentication gate + module access control
- Flow: ProtectedRoute checks isAuthenticated → redirects to /login; WorkspaceGuard checks module_key in client_workspaces
- Location: `src/app/ProtectedRoute.tsx`, `src/shared/components/WorkspaceGuard.tsx`

## Entry Points

**Browser Boot:**
- Location: `src/main.tsx`
- Creates React root, renders `<App>`

**App Root:**
- Location: `src/App.tsx`
- Wraps with: QueryClientProvider, BrowserRouter, AuthProvider, Toaster
- Renders: AppRoutes

**Route Registry:**
- Location: `src/app/routes.tsx`
- Pattern: lazy-loaded pages with Suspense; ProtectedRoute wraps authenticated routes
- Routes:
  - `/login` — LoginPage (public)
  - `/inbox` — InboxPage (protected, shared)
  - `/meine-aufgaben` — MeineAufgabenPage (protected, shared)
  - `/tickets` — TicketsPage (protected, WorkspaceGuard moduleKey="tickets")
  - `/support` — SupportPage (protected, WorkspaceGuard moduleKey="tickets")
  - `/projekte/*` — UebersichtPage (protected, WorkspaceGuard moduleKey="projects")
  - `/dateien` — DateienPage (protected, WorkspaceGuard moduleKey="files")
  - `/nachrichten` — NachrichtenPage (protected, shared)
  - `/hilfe` — HilfePage (protected, shared)
  - `/konto` — KontoPage (protected, shared)

**Layout Container:**
- Location: `src/shared/components/layout/AppShell.tsx`
- Structure: Sidebar (desktop) + MobileHeader + MobileSidebarOverlay + BottomNav + main Outlet
- Sidebar Zones: Global nav (Inbox, Meine Aufgaben) → Workspaces (dynamic) → Utilities (Hilfe, Konto, CreditBalance)

## Error Handling

**Strategy:** User-facing errors via toast; network errors trigger fallback polling; edge cases return empty states.

**Patterns:**

- **Edge Function 500:** Toast "Verbindungsfehler. Bitte erneut versuchen." + manual retry button (via ErrorBoundary or catch in hook)
- **Edge Function 202XX:** Transient, automatic retry via React Query
- **Realtime disconnect:** Fallback to 30s polling via React Query staleTime; no error toast (silent)
- **Stale cache:** Show cached data with "last synced" indicator; manual refresh button available
- **Comment post optimistic fail:** Revert optimistic update + toast error
- **File upload failure:** Toast + retry button
- **Auth session expired:** `onAuthStateChange` listener redirects to /login
- **RLS violation:** Supabase returns 403; treat as auth error, redirect to /login

## Cross-Cutting Concerns

**Logging:**
- Framework: Custom logger utility `src/modules/*/lib/logger.ts`
- Pattern: `createLogger('HookName')` → methods: `.info()`, `.error()`, `.debug()`, `.warn()`
- Usage: Track async operations, cache hits/misses, webhook receipts, API calls

**Validation:**
- Form inputs: HTML5 + React hook forms where needed
- Priority: enum 1-4 (urgent, high, normal, low)
- Status: validated by mapStatus (converts ClickUp string or rejects)
- Dates: ISO 8601 strings
- File uploads: type + size validation before Edge Function call

**Authentication:**
- Context: `AuthProvider` wraps entire app
- Hook: `useAuth()` returns { user, session, profile, isAuthenticated, signIn, signOut, refreshProfile }
- Session: persisted to localStorage, auto-refresh token
- Profile: auto-loaded on session established, RLS filters to current user

**Authorization:**
- Database: RLS on all tables, profile_id filter
- Routes: WorkspaceGuard checks client_workspaces.module_key
- UI: Disabled buttons for terminal task statuses; hidden forms on unauthorized access

**Internationalization (German):**
- All user-facing text in German (no English)
- Template strings and labels: German only
- Error messages: German from backend or frontend
- Status labels: German via status dictionary `src/modules/tickets/lib/status-dictionary.ts`

---

*Architecture analysis: 2026-03-26*
