# KAMANIN Client Portal

## What This Is

Modular client portal for KAMANIN IT Solutions (web agency, Salzburg, Austria). German-language B2B interface. Clients track projects, review deliverables, approve work, manage support tickets. Clients never see ClickUp.

## Stack

- **Frontend:** React 18 + TypeScript, Vite, Tailwind CSS v3, shadcn/ui, Lucide React, React Router v6
- **State:** TanStack React Query (server) + React Context (UI)
- **Backend:** Supabase — PostgreSQL + RLS, Auth (email/password + magic link), Edge Functions (Deno), Realtime, Storage
- **Integrations:** ClickUp (webhooks + API proxied through Edge Functions), Nextcloud (WebDAV, file storage source of truth), Mailjet (email via Edge Functions)
- **Deploy:** Vercel
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
| Project Experience | `src/modules/projects/` | Mock data (Supabase later) | Building |
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
| `kamanin-portal-prototype.html` | Working HTML prototype — visual reference for all UI |

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # Production build
npm run preview      # Preview production build
npx supabase gen types typescript --project-id [id] > src/shared/types/database.ts
```

## Project Structure

```
kamanin-portal/
├── CLAUDE.md
├── docs/
│   ├── SPEC.md              # Design tokens, component specs, status mapping
│   ├── ARCHITECTURE.md       # System architecture
│   ├── DECISIONS.md          # ADR log
│   └── CHANGELOG.md
├── src/
│   ├── app/                  # App.tsx, routes.tsx, providers.tsx
│   ├── shared/
│   │   ├── components/ui/    # shadcn/ui
│   │   ├── components/layout/  # AppShell, Sidebar, MobileHeader, BottomNav
│   │   ├── components/common/  # Badge, StatusDot, EmptyState
│   │   ├── hooks/            # useAuth, useProfile, useRealtime, useBreakpoint
│   │   ├── lib/              # supabase.ts, constants.ts, utils.ts
│   │   ├── styles/tokens.css # CSS custom properties
│   │   └── types/            # database.ts (generated), common.ts
│   ├── modules/
│   │   ├── projects/         # Project Experience module
│   │   │   ├── components/   # overview/, steps/, tasks/, files/, messages/, help/
│   │   │   ├── hooks/        # useProject, useChapterHelpers, useHeroPriority
│   │   │   ├── lib/          # phase-colors, mock-data, helpers
│   │   │   ├── types/        # project.ts
│   │   │   └── pages/        # ProjectPage.tsx
│   │   └── tickets/          # Tasks/Support module (Phase 3.5)
│   │       ├── components/   # TaskCard (rich), TaskList (grid), TaskDetail, TaskActions,
│   │       │                 # TaskFilters (counts+Mehr), TaskSearchBar, SyncIndicator,
│   │       │                 # NewTaskButton, TaskDetailSheet, TaskComments, etc.
│   │       ├── hooks/        # useClickUpTasks, useTaskComments, useTaskActions, useNotifications, useUnreadCounts
│   │       ├── lib/          # status-mapping, status-dictionary, transforms, dictionary
│   │       ├── types/        # tasks.ts
│   │       └── pages/        # TicketsPage (Sheet-based), SupportPage
│   └── main.tsx
├── supabase/functions/       # Edge Functions (existing, don't modify)
├── tailwind.config.ts
└── .env.local                # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
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

## Context Hub (chub)

Tool for fetching LLM-optimized API docs on demand instead of guessing from training data.

- **Install:** `npm install -g @aisuite/chub` (already installed globally)
- **Skill:** `~/.claude/skills/get-api-docs/SKILL.md` (global) + `kamanin-portal/.claude/skills/get-api-docs/SKILL.md` (project)
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
