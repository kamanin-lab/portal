# KAMANIN Client Portal

> Current working rule: this repository is the **staging implementation copy**.
> Original reference repo copy remains untouched at `G:/01_OPUS/Projects/PORTAL`.
> Historical reference code has been moved under `archive/legacy-reference/`.

## What This Is

Modular client portal for KAMANIN IT Solutions (web agency, Salzburg, Austria). German-language B2B interface. Clients track projects, review deliverables, approve work, manage support tickets. Clients never see ClickUp.

## Stack

- **Frontend:** React 18 + TypeScript, Vite, Tailwind CSS v3, shadcn/ui, Lucide React, React Router v6
- **State:** TanStack React Query (server) + React Context (UI)
- **Backend:** Supabase — PostgreSQL + RLS, Auth (email/password + magic link), Edge Functions (Deno), Realtime, Storage
- **Integrations:** ClickUp (webhooks + API proxied through Edge Functions), Nextcloud (WebDAV, file storage source of truth), Mailjet (email via Edge Functions)
- **Deploy:** Vercel (frontend), Coolify → self-hosted Supabase (backend + Edge Functions)
- **Fonts:** DM Sans (UI) + DM Mono (code/metadata)

## Architecture Rules (non-negotiable)

1. **UI reads ONLY from cache tables** (`task_cache`, `comment_cache`) — never from ClickUp directly
2. **Edge Functions proxy ALL ClickUp calls** — API token is server-side secret, never exposed to browser
3. **RLS enforced on ALL tables** — users see only their own data (`profile_id` filter)
4. **Top-level `task_cache` columns override `raw_data`** — prevents stale status after webhook updates
5. **Realtime subscriptions** on `task_cache`, `comment_cache`, `notifications` — filtered by `profile_id`, debounced 300ms, fallback 30s polling
6. **All UI text in German** — zero English in user-facing strings
7. **Components < 150 lines** — extract logic to hooks
8. **`mapStatus(task.status)` for all status comparisons** — `task_cache.status` is raw ClickUp string; convert before comparing or rendering
9. **Sidebar is 3-zone Linear-style** — Global / Workspaces (from `client_workspaces`) / Utilities
10. **Task detail is a Sheet** — URL-based state `?taskId=xxx`, no separate `/tickets/:id` route
11. **`ContentContainer width="narrow"` on all app pages** — Every page uses `<ContentContainer width="narrow">` as its width wrapper (`max-w-4xl`, centered). Exception: login/auth pages and full-viewport layouts. Never use `width="wide"` or inline `max-w-*` on page roots.

## Modules

| Module | Path | Data Source | Status |
|--------|------|------------|--------|
| Project Experience | `src/modules/projects/` | Live Supabase (project_config, project_task_cache, step_enrichment) | Phase 3.6 complete |
| Tasks/Support | `src/modules/tickets/` | Live Supabase (task_cache, comment_cache) | Phase 3.5 complete |
| Shared Shell | `src/shared/` | Auth, layout, design tokens | Phase 3.5 complete |
| Content Editor | `src/modules/content/` | — | Future |
| Discovery Tool | `src/modules/discovery/` | — | Future |

## Key Files

| File | Purpose |
|------|---------|
| `docs/SPEC.md` | Full design spec: tokens, components, pixel values, status mapping |
| `docs/ARCHITECTURE.md` | System architecture, data flow diagrams |
| `docs/DECISIONS.md` | Architecture Decision Records |
| `docs/CHANGELOG.md` | What changed, when, why |
| `supabase/functions/main/index.ts` | Edge-runtime router — dispatches to worker functions via `EdgeRuntime.userWorkers.create()` |
| `supabase/functions/_shared/` | Shared utils: cors.ts, logger.ts, utils.ts, emailCopy.ts |
| `supabase/functions/create-clickup-task/` | Dual-mode task creation: ticket (profile list) or project (explicit listId + chapter custom field) |
| `supabase/functions/fetch-project-tasks/` | Syncs ClickUp tasks → project_task_cache + AI enrichment via Claude Haiku |
| `src/modules/tickets/components/NewTicketDialog.tsx` | Reusable dialog: mode="ticket" (default) or mode="project" (with chapters/phase) |
| `src/modules/tickets/components/PriorityIcon.tsx` | Volume-bar priority icons (1/2/3 bars + AlertCircle for urgent) |

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # Production build
npm run preview      # Preview production build
npx supabase gen types typescript --project-id [id] > src/shared/types/database.ts
```

## Project Structure

```
PORTAL/                         ← GitHub repo root (kamanin-lab/portal)
├── CLAUDE.md
├── docs/
│   ├── SPEC.md                 # Design tokens, component specs, status mapping
│   ├── ARCHITECTURE.md         # System architecture
│   ├── DECISIONS.md            # ADR log
│   ├── CHANGELOG.md
│   └── ideas/                  # Future feature proposals
│       └── knowledge-base.md   # Per-client AI knowledge base (Phase 4+)
├── src/
│   ├── app/                    # App.tsx, routes.tsx, providers.tsx
│   ├── shared/
│   │   ├── components/ui/      # shadcn/ui
│   │   ├── components/layout/  # AppShell, Sidebar, MobileHeader, BottomNav
│   │   ├── components/common/  # Badge, StatusDot, EmptyState
│   │   ├── hooks/              # useAuth, useProfile, useRealtime, useBreakpoint
│   │   ├── lib/                # supabase.ts, constants.ts, utils.ts, linkify.tsx
│   │   ├── styles/tokens.css   # CSS custom properties
│   │   └── types/              # database.ts (generated), common.ts
│   ├── modules/
│   │   ├── projects/           # Project Experience module
│   │   │   ├── components/     # overview/, steps/, tasks/, files/, messages/, help/
│   │   │   ├── hooks/          # useProject, useChapterHelpers, useHeroPriority
│   │   │   ├── lib/            # phase-colors, mock-data, helpers
│   │   │   ├── types/          # project.ts
│   │   │   └── pages/          # ProjectPage.tsx
│   │   └── tickets/            # Tasks/Support module (Phase 3.5)
│   │       ├── components/     # TaskCard, TaskList, TaskDetail, TaskActions,
│   │       │                   # TaskFilters, TaskSearchBar, SyncIndicator,
│   │       │                   # NewTaskButton, TaskDetailSheet, TaskComments,
│   │       │                   # NewTicketDialog, PriorityIcon
│   │       ├── hooks/          # useClickUpTasks, useTaskComments, useTaskActions, useNotifications, useUnreadCounts
│   │       ├── lib/            # status-mapping, status-dictionary, transforms, dictionary
│   │       ├── types/          # tasks.ts
│   │       └── pages/          # TicketsPage (Sheet-based), SupportPage
│   └── main.tsx
├── supabase/
│   └── functions/              # Edge Functions (deployed via volume mount to Coolify)
│       ├── main/index.ts       # Router — dispatches requests to worker functions
│       ├── _shared/            # cors.ts, logger.ts, utils.ts, emailCopy.ts
│       ├── fetch-clickup-tasks/
│       ├── fetch-task-comments/
│       ├── fetch-single-task/
│       ├── post-task-comment/
│       ├── update-task-status/
│       ├── clickup-webhook/
│       ├── fetch-project-tasks/
│       ├── send-mailjet-email/
│       ├── create-clickup-task/
│       ├── auth-email/
│       ├── send-feedback/
│       └── send-support-message/
├── tailwind.config.ts
└── .env.local                  # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

## Status Mapping (ClickUp → Portal)

| ClickUp | Portal | Primary Actions |
|---------|--------|----------------|
| TO DO | Open | — |
| IN PROGRESS / INTERNAL REVIEW / REWORK | In Progress | — |
| CLIENT REVIEW | **Ihre Rückmeldung** (needs_attention) | **Freigeben, Änderungen anfordern** |
| APPROVED | Approved | — |
| COMPLETE | Done | — (terminal) |
| ON HOLD | On Hold | Resume, Cancel |
| CANCELED | Cancelled | — (terminal) |

Secondary actions (Put on Hold, Cancel) available on all non-terminal states.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Supabase Realtime disconnects | Fallback to 30s polling via React Query staleTime |
| Edge Function returns 500 | Toast with "Verbindungsfehler. Bitte erneut versuchen." + retry button |
| Edge Function returns 202XX | Treat as transient, retry once automatically |
| task_cache empty on first login | Show loading skeleton → trigger `fetch-clickup-tasks` → populate |
| Webhook down (stale data) | Portal works with cached data. Manual refresh button triggers full sync |
| Comment post fails | Revert optimistic update, show error toast |

## API Reference Rules

### ClickUp
- Always use the project-local ClickUp reference skill at:
  `G:/01_OPUS/Projects/PORTAL_staging/.claude/skills/clickup-api/SKILL.md`
- For any work touching ClickUp tasks, comments, webhooks, statuses, custom fields, lists/folders/spaces, or integration behavior, do not rely on memory alone.

### Supabase
- Always consult the project-local Supabase reference docs at:
  `docs/reference/supabase-context-hub/`
- Primary local files:
  - `docs/reference/supabase-context-hub/javascript-sdk.md`
  - `docs/reference/supabase-context-hub/python-sdk.md`
- Use these alongside official docs when working on Supabase client usage, queries, auth, storage, realtime, edge functions, and RLS-sensitive flows.

### Context Hub as a general rule
- Prefer Context Hub as the first curated documentation source when available.
- Project-local Context Hub reference copies live at:
  `docs/reference/context-hub/`
- Current local references include React, React DOM, Tailwind CSS, Vite, and Vitest.
- If Context Hub does not have the technology you need, or the local CLI fetch path is broken, fall back to official documentation directly.

### Context Hub (chub)
Tool for fetching LLM-optimized API docs on demand instead of guessing from training data.

- **Install:** `npm install -g @aisuite/chub` (already installed globally)
- **Skill:** `~/.claude/skills/get-api-docs/SKILL.md` (global)
- **Usage:** Before writing code against an external API → `chub search [api]` → `chub get [id] --lang js`
- **Add gotchas:** `chub annotate [id] "note"` (overwrites — combine all notes for same ID into one call)
- **Available for our stack:** `supabase/client` (v2.76.1) — includes our portal-specific annotations
- **Not available (yet):** React, Tailwind, ClickUp, Mailjet, Vite — registry is growing

## Docs Update Protocol

After ANY structural change:
1. Update relevant doc in `docs/`
2. Update this CLAUDE.md if project-level context changed
3. Add entry to `docs/DECISIONS.md` for architecture decisions
4. Add entry to `docs/CHANGELOG.md`
