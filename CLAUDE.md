# KAMANIN Client Portal

> This is the **canonical production repository** at `G:/01_OPUS/Projects/PORTAL`.
> Frontend is live at https://portal.kamanin.at (auto-deployed from `main` via Vercel).
> Historical reference code lives under `archive/legacy-reference/`.

## What This Is

Modular client portal for KAMANIN IT Solutions (web agency, Salzburg, Austria). German-language B2B interface. Clients track projects, review deliverables, approve work, manage support tickets. Clients never see ClickUp.

## Stack

- **Frontend:** React 19 + TypeScript, Vite, Tailwind CSS v4, shadcn/ui, React Router v7
- **Icons:** `@hugeicons/react` + `@hugeicons/core-free-icons` (primary icon set, stroke rounded), `@phosphor-icons/react` (secondary, weight variants + duotone). Lucide React is legacy-only — do not use for new code.
- **Toasts:** `sonner@^2.0.7` — use `import { toast } from "sonner"` for all toast notifications
- **Animation:** Motion (v12, successor to Framer Motion) — use `import { motion } from "motion/react"` for GPU-accelerated animations, layout transitions, scroll effects, spring physics
- **UI primitives:** shadcn/ui is the standard for new UI building blocks (Button, Input, Tabs, Badge, Skeleton, Avatar, AlertDialog, Textarea, etc.). Install selectively — only components actually needed. Customize via portal CSS tokens, not by overriding shadcn defaults directly.
- **State:** TanStack React Query (server) + React Context (UI)
- **Backend:** Supabase — PostgreSQL + RLS, Auth (email/password + magic link), Edge Functions (Deno), Realtime, Storage
- **Integrations:** ClickUp (webhooks + API proxied through Edge Functions), Nextcloud (WebDAV, file storage source of truth), Mailjet (email via Edge Functions)
- **Deploy:** Vercel (frontend, `main` → portal.kamanin.at, `staging` → staging.portal.kamanin.at), Coolify → self-hosted Supabase (production backend + Edge Functions), Cloud Supabase free tier (staging backend, project `ahlthosftngdcryltapu`), GitHub CLI for PRs
- **Fonts:** DM Sans (UI) + DM Mono (code/metadata)

### Design Tools (available to all agents)
- **Motion** (`motion/react`) — animations, transitions, layout effects. Use for: page transitions, hero animations, card hovers, loading states, scroll-triggered reveals. Import: `import { motion, AnimatePresence } from "motion/react"`
- **21st.dev Magic MCP** — generates production React/TS components from natural language. Use for: rapid prototyping of new UI components. Available as MCP tool.
- **ui-ux-pro-max skill** — AI design system generator (67 styles, 161 palettes, 57 font pairings). Use for: design system decisions, color palette generation, typography pairing. Auto-activates on UI/UX tasks.
- **shadcn/ui** — base component library. Use for: all standard UI primitives (buttons, inputs, tabs, dialogs)
- **Frontend Design skill** (`/frontend-design`) — creates distinctive production interfaces. Use for: page-level design work.

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
| Files | `src/modules/files/` | Nextcloud WebDAV via `nextcloud-files` Edge Function | Live — root read-only, subfolder CRUD |
| Organisation | `src/modules/organisation/` | Live Supabase (organizations, org_members) | Phase 14 complete — admin-only |
| Shared Shell | `src/shared/` | Auth, layout, design tokens, OrgProvider | Phase 3.5 complete |
| Hilfe (FAQ) | `src/shared/pages/HilfePage.tsx` | Static FAQ data (`hilfe-faq-data.ts`) | Live |
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
| `supabase/functions/_shared/` | Shared utils: cors.ts, logger.ts, utils.ts, emailCopy.ts, clickup-contract.ts, org.ts |
| `supabase/functions/_shared/org.ts` | Org helpers: `getNonViewerProfileIds(supabase, profileIds)` — filters profile list to admin/member roles only; permissive fallback on error. Used by clickup-webhook to exclude viewers from action emails. `getOrgContextForUserAndTask(supabase, userId, taskId)` — resolves org from caller's org_members row, validates task belongs to that org (cross-org guard), returns `{orgId, surface, memberProfileIds, taskBelongsToOrg, projectConfigId}`. Used by post-task-comment for peer fan-out authz. |
| `supabase/functions/_shared/wp-audit.ts` | WordPress site audit via Maxi AI Core REST API — fetches plugins, WP version, product count, language, timezone, and active operator-notes; `bootstrap-session` is called first (v3.3.0+ requirement); graceful degradation on any failure |
| `supabase/functions/create-clickup-task/` | Dual-mode task creation: ticket (profile list) or project (explicit listId + chapter custom field) |
| `supabase/functions/fetch-project-tasks/` | Syncs ClickUp tasks → project_task_cache + AI enrichment via Claude Haiku |
| `supabase/functions/send-reminders/` | Dual-purpose reminder scheduler: (1) ticket reminders — tasks idle in Client Review 5+ days; (2) project reminders — project_task_cache entries idle in `client review` 3+ days → `project_reminder` email every 3 days, tracked via `profiles.last_project_reminder_sent_at` |
| `supabase/functions/nextcloud-files/` | WebDAV proxy: list, download, upload (XHR progress), mkdir, delete, delete-client |
| `src/shared/lib/upload-with-progress.ts` | Shared XHR upload utility — wraps XMLHttpRequest to expose `onProgress` (0–100) for all file uploads |
| `src/modules/files/components/UploadProgressBar.tsx` | Animated per-file progress bar; exports `UploadItem` interface; auto-dismisses at completion |
| `src/modules/tickets/components/NewTicketDialog.tsx` | Reusable dialog: mode="ticket" (default) or mode="project" (with chapters/phase) |
| `src/modules/tickets/components/PriorityIcon.tsx` | Volume-bar priority icons (1/2/3 bars + AlertCircle for urgent) |
| `src/shared/hooks/useOrg.ts` | OrgProvider React context — fetches org + role on mount; exposes `organization`, `orgRole`, `isAdmin`, `isMember`, `isViewer`, `isLoading`. Legacy fallback: treats user as `member` if no org_members row found. |
| `src/shared/types/organization.ts` | `Organization` TypeScript interface matching the `organizations` table shape |
| `src/modules/organisation/pages/OrganisationPage.tsx` | Admin-only page at `/organisation` — redirects non-admins to `/tickets` |
| `src/modules/organisation/hooks/useOrgMembers.ts` | React Query hook fetching all org_members with joined profile data (id, email, full_name, invited_email) |
| `src/modules/organisation/hooks/useMemberActions.ts` | Mutations: update role, remove member, `resendInvite` (sends fresh invite to pending member via `resend-invite` EF) |
| `scripts/onboard-client.ts` | Client onboarding script — creates auth user, profile, workspaces, credit package, project access, primes task cache. NOTE: needs update to create org + admin org_members row (currently creates standalone profile only) |
| `scripts/sync-staging-secrets.ts` | SSH to prod Coolify → reads 15 Edge Function secrets → pushes to staging Cloud Supabase via Management API |
| `scripts/sync-staging-schema.ts` | pg_dump prod public schema → apply to staging Cloud Supabase; flags: `--dump-only`, `--apply-only` |
| `docs/staging-env-reference.txt` | Staging environment variables, project refs, service role keys, site URL |
| `.github/workflows/deploy-edge-functions-staging.yml` | CI: on push to `staging` → deploy all Edge Functions to staging Cloud Supabase via Supabase CLI |
| `src/shared/lib/hilfe-faq-data.ts` | FAQ content: `FaqItemData` / `FaqSectionData` types + `FAQ_SECTIONS` array (7 sections, 32 items, German) |
| `src/shared/components/help/FaqItem.tsx` | Accordion item — AnimatePresence height animation, chevron rotation, `isLast` separator |
| `src/shared/components/help/FaqSection.tsx` | FAQ section card — Hugeicons icon + h2 + FaqItem list |
| `vercel.json` | `main` branch: SPA rewrites + `/auth/v1/*` proxy to self-hosted Supabase auth endpoint. `staging` branch: SPA rewrites only (proxy removed — Cloud Supabase handles CORS natively) |

## Testing

**TDD is the default** for all new features and bug fixes in this project.

### Methodology: vertical slices (red → green per behavior)

Write ONE failing test → implement minimal code to pass → repeat. Never batch all tests first and all implementation second.

```
RIGHT:  test1 → impl1 → test2 → impl2 → ...
WRONG:  test1, test2, test3 → impl1, impl2, impl3
```

### Commands

```bash
npm run test              # run all tests once
npm run test:watch        # watch mode during development
npm run test:coverage     # run with coverage report + threshold enforcement
```

### Coverage thresholds (enforced by `npm run test:coverage`)

| Metric | Threshold | Rationale |
|--------|-----------|-----------|
| Lines | 85% | Primary indicator — every line of logic must be reachable |
| Functions | 90% | Every exported function must be callable by at least one test |
| Branches | 70% | Defensive `??` null-checks in data transforms inflate denominator |
| Statements | 80% | Complex store/transform code has reachable but low-risk paths |

### Test file locations

Tests live in `__tests__/` subdirectories co-located with the module they cover:
- `src/modules/projects/__tests__/*.test.ts`
- `src/modules/tickets/__tests__/*.test.ts`
- `src/shared/__tests__/*.test.ts`
- `src/shared/components/**/__tests__/*.test.tsx`

### What to test

**Always test (pure business logic):**
- All functions in `*/lib/` directories — status mappings, transforms, helpers, validators
- All exported utility functions

**Test with component rendering (`@testing-library/react`):**
- Components with non-trivial interaction logic or animation behavior
- Use `QueryClientProvider` wrapper when the component tree uses React Query

**Do NOT unit test:**
- Static config and data files (`dictionary.ts`, `hilfe-faq-data.ts`, `workspace-routes.ts`)
- XHR/browser API wrappers (`upload-with-progress.ts`) — integration-level only
- React JSX utilities (`linkify.tsx`) — behavior verified in component tests
- Timer/event-based infrastructure (`session-timeout.ts`) — E2E scope

### Mock patterns

```typescript
// React Query wrapper (any component using useQuery/useMutation)
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

// Supabase client mock (hooks that call supabase directly)
vi.mock('@/shared/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ select: vi.fn() })),
    channel: vi.fn(() => ({ on: vi.fn(() => ({ subscribe: vi.fn() })) })),
  },
}))

// Memory test adapter (project memory tests)
import { installMemoryTestAdapter, resetMemoryStore } from '../lib/memory-store'
```

### Skill

The `tdd` skill (from `mattpocock/skills`) is installed globally at `~/.agents/skills/tdd/`. Invoke it before any feature or bug fix implementation. It enforces vertical slices and prevents the horizontal-slice anti-pattern.

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

# Client onboarding
npx tsx scripts/onboard-client.ts --config client.json

# Vercel deploy
vercel             # preview deploy (feature branch)
vercel --prod      # manual production deploy (or push to main)

# Post-code review (GPT-5.4-mini via OpenRouter)
node scripts/openrouter-review.cjs                  # all uncommitted changes
node scripts/openrouter-review.cjs --staged         # staged only
node scripts/openrouter-review.cjs --branch main    # diff vs branch
node scripts/openrouter-review.cjs -o review.md     # output to file
node scripts/openrouter-review.cjs --context "..."  # add task context
```

## Staging Environment

**Staging URL:** https://staging.portal.kamanin.at (Vercel, `staging` branch)
**Staging backend:** Cloud Supabase free tier, project ref `ahlthosftngdcryltapu` (eu-central-1)
**Production URL:** https://portal.kamanin.at (Vercel, `main` branch)
**Production backend:** Self-hosted Supabase on Coolify

### Branch Strategy

| Branch | Deploys to | Backend |
|--------|-----------|---------|
| `staging` | staging.portal.kamanin.at | Cloud Supabase (`ahlthosftngdcryltapu`) |
| `main` | portal.kamanin.at | Self-hosted Supabase (Coolify) |

### Development Workflow

```bash
# Feature work
git checkout staging
# make changes, test locally
git push origin staging        # auto-deploys to staging.portal.kamanin.at + deploys Edge Functions via CI

# After staging validation, promote to production
git checkout main
git merge staging
git push origin main           # auto-deploys to portal.kamanin.at (PRODUCTION)
```

### Rollback Production

```bash
git tag --list                 # list stable tags (e.g. v1.0-stable)
git revert <commits>           # safe revert — creates a new commit, keeps history clean
git push origin main           # redeploys immediately
```

### Schema Migration Workflow

```bash
# 1. Dump prod schema
npx tsx scripts/sync-staging-schema.ts --dump-only

# 2. Apply to staging
npx tsx scripts/sync-staging-schema.ts --apply-only

# 3. Push new migrations to staging via Supabase CLI
supabase link --project-ref ahlthosftngdcryltapu
supabase db push
```

### Re-sync Secrets (when production secrets change)

```bash
npx tsx scripts/sync-staging-secrets.ts
# SSH to Coolify → reads 15 Edge Function secrets → pushes to staging via Management API
```

### Key Difference: `vercel.json` on staging vs main

The `staging` branch `vercel.json` does NOT have the `/auth/v1/*` proxy block. Cloud Supabase handles CORS natively — the proxy is only needed for the self-hosted instance on `main`.

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
│   ├── BROWSER_TESTING.md      # Playwright MCP setup
│   ├── CLICKUP_INTEGRATION.md  # ClickUp threading implementation notes
│   ├── audits/                 # Module audit reports
│   │   ├── projects-module-audit.md
│   │   └── ticket-audit-report.md
│   ├── domain/                 # Business/domain documents (NOT GSD planning)
│   │   ├── current-state-map.md
│   │   ├── delivery-rules.md
│   │   ├── domain-model-v1.md
│   │   ├── product-gap-list.md
│   │   ├── project-panel-redesign-v2.md
│   │   └── team-operating-model-v1.md
│   ├── ideas/                  # Future feature proposals
│   │   ├── admin-dashboard.md
│   │   ├── credit-evolution.md
│   │   ├── knowledge-base.md   # Per-client AI knowledge base (Phase 4+)
│   │   ├── organizations.md
│   │   └── recommendations.md
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
│   │   ├── components/help/    # FaqItem (accordion), FaqSection (card)
│   │   ├── hooks/              # useAuth, useBreakpoint, useWorkspaces
│   │   ├── lib/                # supabase.ts, utils.ts, linkify.tsx, workspace-routes.ts, hilfe-faq-data.ts
│   │   ├── pages/              # HilfePage (FAQ with accordion sections + text search + animate stagger)
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
├── scripts/
│   ├── openrouter-review.cjs        # Post-code review via GPT-5.4-mini (OpenRouter API)
│   ├── onboard-client.ts            # Client onboarding automation (auth user + profile + workspaces + credits)
│   ├── sync-staging-secrets.ts      # SSH prod Coolify → push 15 secrets to staging Cloud Supabase
│   └── sync-staging-schema.ts       # pg_dump prod schema → apply to staging Cloud Supabase
├── vercel.json                 # SPA rewrites + /auth/v1/* proxy to self-hosted Supabase
├── vite.config.ts
├── vitest.config.ts
└── .env.local                  # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, OPENROUTER_API_KEY
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

## Post-Code Review (OpenRouter)

Post-code review is performed by GPT-5.4-mini via OpenRouter API, replacing the Claude reviewer-architect for this step. This provides an independent second opinion from a different model family.

- **Script:** `scripts/openrouter-review.cjs`
- **Model:** `openai/gpt-5.4-mini` (configurable via `REVIEW_MODEL` env var)
- **Auth:** `OPENROUTER_API_KEY` in `.env.local` (OpenRouter API key, not OpenAI)
- **Architecture context:** baked into the script's system prompt (portal stack, rules, review points)
- **Output format:** matches reviewer-architect format — `[BLOCKING/NON-BLOCKING/FOLLOW-UP]` issues + verdict
- **Sandbox:** read-only, does not modify files
- **When Codex CLI OAuth limit resets:** can switch to `codex exec review` as an alternative runner (Codex CLI v0.116.0 already installed + OAuth authenticated)

### When to use
- After implementation-agent completes work (step 4 in Standard Sequence)
- Supervisor runs `node scripts/openrouter-review.cjs` and evaluates the verdict
- If REVISE: send blocking issues back to implementation-agent for another loop
- If APPROVE: proceed to qa-agent

### Pre-code review remains on Claude
reviewer-architect (Claude Sonnet) still handles pre-code review because it needs full agent context (reading files, checking architecture docs, interactive reasoning). OpenRouter script is fire-and-forget on a diff.

## API Reference Rules

### ClickUp
- Always use the project-local ClickUp reference skill at:
  `G:/01_OPUS/Projects/PORTAL/.claude/skills/clickup-api/SKILL.md`
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

### Ideas — Auto-Capture
- During ANY task, if you discover something that should be built but is out of scope — **immediately** create a file in `docs/ideas/` and add to `dashboard.json` ideas array
- Don't wait for user to suggest it. If you see a gap, a missing feature, a better approach — write it down
- Tag with priority: `high` (blocks other work), `medium` (would improve quality), `low` (nice to have)
- This is how the project stays alive even when the user is not actively guiding

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
- Keep work aligned with domain docs in docs/domain/
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
- Let silent multi-hour drift happen (this is a serious supervisor failure)
- Push breaking changes directly to `main` without a PR (it auto-deploys to production)

## Handoff Rules

### Standard Sequence
1. Supervisor frames the task (using task template)
2. reviewer-architect critiques the plan (pre-code review) — Claude Sonnet agent
3. implementation-agent executes scoped work
4. **OpenRouter post-code review** — `node scripts/openrouter-review.cjs` (GPT-5.4-mini, independent second opinion)
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
| reviewer-architect | Sonnet | **Pre-code review only**, architecture gate |
| **openrouter-review** | **GPT-5.4-mini (OpenRouter)** | **Post-code review** — independent second opinion via `scripts/openrouter-review.cjs` |
| implementation-agent | Opus | Coding, follows approved scope, reports what changed |
| designer | Opus | UI/UX design + implementation, uses /frontend-design skill |
| qa-agent | Sonnet | Build verification, data flow, edge cases, Playwright browser checks |
| docs-memory-agent | Sonnet | Updates docs, records decisions, preserves context |

## Key Project Documents
- `docs/system-context/MODULE_MAP.md` — **start here for any task touching src/** — per-module file lists, architecture rules, cross-module edges
- `docs/system-context/SYSTEM_CONSTRAINTS.md` — non-negotiable architectural rules
- `docs/system-context/TECH_CONTEXT.md` — full stack documentation
- `docs/system-context/STATUS_TRANSITION_MATRIX.md` — allowed status changes + notifications
- `docs/system-context/NOTIFICATION_MATRIX.md` — email/bell trigger rules
- `docs/system-context/PRODUCT_VISION.md` — product direction
- `docs/system-context/DATABASE_SCHEMA.md` — database schema reference
- `docs/domain/` — domain model, delivery rules, product gaps
- `tasks/dashboard.md` — current team status (keep updated!)

### Module orientation protocol
Before exploring `src/` for a task that touches UI code:
1. Open `docs/system-context/MODULE_MAP.md` and find the relevant module section.
2. Read the "Architecture rules" and "Entry points" for that module.
3. Locate specific files via the per-directory tables.
4. Only then start reading source files — usually 2-4 Reads are enough.

Update MODULE_MAP.md when adding/removing files or introducing new cross-module dependencies. Do NOT update for trivial renames.
