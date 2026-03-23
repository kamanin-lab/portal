# KAMANIN Client Portal

> Current working rule: this repository is the **staging implementation copy**.
> Original reference repo copy remains untouched at `G:/01_OPUS/Projects/PORTAL`.
> Historical reference code has been moved under `archive/legacy-reference/`.

## What This Is

Modular client portal for KAMANIN IT Solutions (web agency, Salzburg, Austria). German-language B2B interface. Clients track projects, review deliverables, approve work, manage support tickets. Clients never see ClickUp.

## Stack

- **Frontend:** React 19 + TypeScript, Vite, Tailwind CSS v4, shadcn/ui, Lucide React, React Router v7
- **UI primitives:** shadcn/ui is the standard for new UI building blocks (Button, Input, Tabs, Badge, Skeleton, Avatar, AlertDialog, Textarea, etc.). Install selectively — only components actually needed. Customize via portal CSS tokens, not by overriding shadcn defaults directly.
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
12. **shadcn/ui for all new UI primitives** — Use shadcn/ui components (Button, Input, Tabs, Badge, Skeleton, Avatar, AlertDialog, Textarea) instead of building raw HTML equivalents. Style via portal tokens in `tokens.css`, not by modifying shadcn component source.

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
| `supabase/functions/_shared/` | Shared utils: cors.ts, logger.ts, utils.ts, emailCopy.ts, clickup-contract.ts |
| `supabase/functions/create-clickup-task/` | Dual-mode task creation: ticket (profile list) or project (explicit listId + chapter custom field) |
| `supabase/functions/fetch-project-tasks/` | Syncs ClickUp tasks → project_task_cache + AI enrichment via Claude Haiku |
| `supabase/functions/nextcloud-files/` | WebDAV proxy: list (`sub_path`), download, upload (`sub_path`), mkdir (`folder_path`) |
| `src/modules/tickets/components/NewTicketDialog.tsx` | Reusable dialog: mode="ticket" (default) or mode="project" (with chapters/phase) |
| `src/modules/tickets/components/PriorityIcon.tsx` | Volume-bar priority icons (1/2/3 bars + AlertCircle for urgent) |

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run test         # Run tests (Vitest)
npm run test:watch   # Tests in watch mode
npm run test:coverage # Tests with coverage report
npm run lint         # ESLint
npx supabase gen types typescript --project-id [id] > src/shared/types/database.ts
```

## Project Structure

```
PORTAL/                         ← GitHub repo root (kamanin-lab/portal)
├── CLAUDE.md
├── .claude/
│   ├── agents/                 # Agent role definitions
│   │   ├── docs-memory-agent.md
│   │   ├── implementation-agent.md
│   │   ├── qa-agent.md
│   │   └── reviewer-architect.md
│   ├── skills/                 # Skills (e.g., clickup-api/)
│   └── settings.json
├── docs/
│   ├── SPEC.md                 # Design tokens, component specs, status mapping
│   ├── ARCHITECTURE.md         # System architecture
│   ├── DECISIONS.md            # ADR log
│   ├── CHANGELOG.md
│   ├── ideas/                  # Future feature proposals
│   │   └── knowledge-base.md   # Per-client AI knowledge base (Phase 4+)
│   ├── planning/               # Domain model, delivery rules, product gaps
│   │   ├── current-state-map.md
│   │   ├── delivery-rules.md
│   │   ├── domain-model-v1.md
│   │   ├── product-gap-list.md
│   │   └── team-operating-model-v1.md
│   ├── reference/              # API docs, context-hub caches
│   │   ├── context-hub/
│   │   └── supabase-context-hub/
│   └── system-context/         # Architectural source-of-truth docs
│       ├── DATABASE_SCHEMA.md
│       ├── NOTIFICATION_MATRIX.md
│       ├── PRODUCT_VISION.md
│       ├── STATUS_TRANSITION_MATRIX.md
│       ├── SYSTEM_CONSTRAINTS.md
│       └── TECH_CONTEXT.md
├── tasks/
│   ├── dashboard.md            # Current team status (keep updated!)
│   └── task-template.md
├── src/
│   ├── app/                    # ProtectedRoute.tsx, routes.tsx
│   ├── shared/
│   │   ├── components/ui/      # SideSheet (shadcn/ui base)
│   │   ├── components/layout/  # AppShell, Sidebar, MobileHeader, BottomNav
│   │   ├── components/common/  # ConfirmDialog, EmptyState, LoadingSkeleton, MessageBubble, StatusBadge
│   │   ├── hooks/              # useAuth, useBreakpoint, useWorkspaces
│   │   ├── lib/                # supabase.ts, utils.ts, linkify.tsx, workspace-routes.ts
│   │   ├── styles/tokens.css   # CSS custom properties
│   │   └── types/              # common.ts
│   ├── modules/
│   │   ├── projects/           # Project Experience module
│   │   │   ├── components/     # overview/, steps/, tasks/, files/ (FolderView, CreateFolderInput), messages/, help/
│   │   │   ├── hooks/          # useProject, useProjects, useProjectMemory, useChapterHelpers, useHeroPriority, useNextcloudFilesByPath, useUploadFileByPath, useCreateFolder
│   │   │   ├── lib/            # helpers, transforms-project, phase-colors, step-status-mapping, memory-access, memory-store, overview-interpretation, mock-data
│   │   │   ├── types/          # project.ts
│   │   │   └── pages/          # UebersichtPage, NachrichtenPage, DateienPage
│   │   └── tickets/            # Tasks/Support module (Phase 3.5)
│   │       ├── components/     # TaskCard, TaskList, TaskDetail, TaskActions,
│   │       │                   # TaskFilters, TaskFilterPanel, TaskSearchBar,
│   │       │                   # SyncIndicator, NewTaskButton, TaskDetailSheet,
│   │       │                   # TaskComments, NewTicketDialog, PriorityIcon,
│   │       │                   # SupportChat, SupportSheet, CommentInput,
│   │       │                   # NotificationBell
│   │       ├── hooks/          # useClickUpTasks, useTaskComments, useTaskActions, useNotifications, useUnreadCounts, useCreateTask, useSingleTask, useSupportTaskChat
│   │       ├── lib/            # status-mapping, status-dictionary, transforms, dictionary, logger
│   │       ├── types/          # tasks.ts
│   │       └── pages/          # TicketsPage (Sheet-based), SupportPage
│   └── main.tsx
├── supabase/
│   └── functions/              # Edge Functions (deployed via volume mount to Coolify)
│       ├── main/index.ts       # Router — dispatches requests to worker functions
│       ├── _shared/            # cors.ts, logger.ts, utils.ts, emailCopy.ts, clickup-contract.ts
│       ├── auth-email/
│       ├── clickup-webhook/
│       ├── create-clickup-task/
│       ├── fetch-clickup-tasks/
│       ├── fetch-project-tasks/
│       ├── fetch-single-task/
│       ├── fetch-task-comments/
│       ├── manage-project-memory/
│       ├── post-task-comment/
│       ├── send-feedback/
│       ├── nextcloud-files/
│       ├── send-mailjet-email/
│       ├── send-support-message/
│       └── update-task-status/
├── vite.config.ts
├── vitest.config.ts
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
- **Available for our stack:** `supabase/client` (v2.99.0) — includes our portal-specific annotations
- **Not available (yet):** React, Tailwind, ClickUp, Mailjet, Vite — registry is growing

## Docs Update Protocol

After ANY structural change:
1. Update relevant doc in `docs/`
2. Update this CLAUDE.md if project-level context changed
3. Add entry to `docs/DECISIONS.md` for architecture decisions
4. Add entry to `docs/CHANGELOG.md`

### Ideas Lifecycle
- When an idea from `docs/ideas/` is **implemented**: mark the file with `Status: IMPLEMENTED (TASK-XXX, date)` and **remove it from `dashboard.json` ideas array**
- When a new idea is added to `docs/ideas/`: add it to `dashboard.json` ideas array immediately
- Partially implemented ideas: update status to `in_progress`, keep in dashboard with updated summary
- Ideas with remaining phases (e.g., Phase 2/3): keep the file for future reference, but remove from dashboard ideas (it's now a residual/roadmap item, not an idea)

## Supervisor Role (Lead Session)

This session acts as the Supervisor for the PORTAL agent team.
You are responsible for this project. Yuri is your manager. You manage the agent team.

### Documentation Ownership (CRITICAL)
The Supervisor is personally responsible for keeping ALL project documentation current:
- **After EVERY completed task:** update CHANGELOG.md, verify ARCHITECTURE.md, verify DATABASE_SCHEMA.md
- **After EVERY task:** create/update task file in `tasks/TASK-XXX-*.md`
- **After structural changes:** update CLAUDE.md, DECISIONS.md
- **Implemented ideas:** mark as IMPLEMENTED in `docs/ideas/`, remove from `dashboard.json` ideas
- **Use docs-memory-agent** after every task acceptance — this is mandatory, not optional
- **Failing to update docs = supervisor failure** — treat it as seriously as a build failure

### Core Rules
- Frame tasks clearly before execution using the task template
- Keep work aligned with planning docs in docs/planning/
- Enforce staging-only rule: implementation-agent works only in staging
- Stop uncontrolled scope growth
- **Dashboard discipline (CRITICAL):** Update BOTH `tasks/dashboard.md` AND `tasks/dashboard.json` at EVERY phase transition — before launching each agent (🔄) and after each agent completes (✅/❌). The dashboard must reflect real-time status at all times. Stale dashboard = supervisor failure. When a new idea is added to `docs/ideas/`, add it to `dashboard.json` ideas array immediately. The interactive dashboard at `tasks/dashboard.html` auto-reads from `dashboard.json` every 5 seconds.
- After every completed loop step, immediately trigger the next step
- When a review/QA verdict arrives, the next workflow step MUST start immediately — do not stop at a status-only reply
- **Approval gate:** Wait for explicit user approval before launching implementation-agent. Never auto-proceed from pre-code review to coding.
- Send short status updates via Telegram at meaningful phase transitions
- During long-running execution, send checkpoint updates roughly every 5 minutes
- Each checkpoint: verify (1) actual task status and (2) dashboard accuracy
- Only escalate to Yuri for serious architectural decisions, true blockers, or explicit approval boundaries
- Never remain in passive status-explaining mode when the process has a clear next action
- Actively supervise parallel work: do not forget the main task during side conversations

### Must NOT Do
- Skip review just to move faster
- Treat first implementation as automatically acceptable
- Allow direct implementation in the original repo
- Let silent multi-hour drift happen (this is a serious supervisor failure)

## Handoff Rules

### Standard Sequence
1. Supervisor frames the task (using task template)
2. reviewer-architect critiques the plan (pre-code review)
3. implementation-agent executes scoped work
4. reviewer-architect reviews the result (post-code review)
5. qa-agent verifies behavior and regressions
6. Supervisor decides accept / revise
7. docs-memory-agent updates source-of-truth when needed

### Minimum Handoff Content
Each handoff to an agent MUST include:
- Task goal
- In-scope changes
- Out-of-scope changes
- Affected files/modules
- Constraints / references to consult
- Known risks
- Required outputs

### Flow Discipline
- When one step finishes and the next is clear → move immediately
- Update dashboard right away
- Trigger the next agent right away
- Do NOT wait for user if no new approval is required
- Do NOT let the process stall because of delayed status sync
- After verdict, launch the next step — status reporting alone is not enough

### Revision Rule
If review or QA finds blocking issues → work returns for another loop.
No task is complete until the Supervisor accepts it.

## Telegram Communication Format

When sending status via Channels (Telegram):
- 📋 **Plan ready**: [brief summary]. Approve?
- 🔍 **Pre-code review**: [verdict]. [key concerns if any]
- ⚙️ **Implementation done**: [X files changed]. Running review...
- 🔍 **Post-code review**: [X blocking, Y non-blocking]. [verdict]
- ✅ **QA passed**: [summary]. Push to GitHub?
- 🚀 **Deployed** to portal.kamanin.at
- ❌ **Problem**: [description]. How to proceed?
- ⏳ **Checkpoint**: [current phase], [% done], [next step]

Keep messages concise. Yuri manages from phone — no walls of text.

## Available Agents

| Agent | Model | Role |
|---|---|---|
| reviewer-architect | Sonnet | Pre-code & post-code review, architecture gate |
| implementation-agent | Opus | Coding, stays in staging, follows approved scope |
| designer | Opus | UI/UX design + implementation, uses /frontend-design skill |
| qa-agent | Sonnet | Build verification, data flow, edge cases, Playwright browser checks |
| docs-memory-agent | Sonnet | Updates docs, records decisions, preserves context |

## Key Project Documents
- `docs/system-context/SYSTEM_CONSTRAINTS.md` — non-negotiable architectural rules
- `docs/system-context/TECH_CONTEXT.md` — full stack documentation
- `docs/system-context/STATUS_TRANSITION_MATRIX.md` — allowed status changes + notifications
- `docs/system-context/NOTIFICATION_MATRIX.md` — email/bell trigger rules
- `docs/system-context/PRODUCT_VISION.md` — product direction
- `docs/system-context/DATABASE_SCHEMA.md` — database schema reference
- `docs/planning/` — domain model, delivery rules, product gaps
- `tasks/dashboard.md` — current team status (keep updated!)
