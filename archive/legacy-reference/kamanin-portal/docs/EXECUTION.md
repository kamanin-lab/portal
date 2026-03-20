# KAMANIN Portal — Execution Plan

Read `CLAUDE.md` for project context. Read `docs/SPEC.md` for design details.
Reference: `kamanin-portal-prototype.html` for visual truth.

---

## Pre-Setup: Install ECC

```bash
# Clone + install
git clone https://github.com/affaan-m/everything-claude-code.git
cd everything-claude-code
./install.sh typescript

# Token optimization (~/.claude/settings.json)
{
  "model": "sonnet",
  "env": {
    "MAX_THINKING_TOKENS": "10000",
    "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE": "50"
  }
}
```

Use Opus only for deep architecture: `/model opus`

**Relevant ECC skills:** `frontend-patterns`, `backend-patterns`, `postgres-patterns`, `coding-standards`, `tdd-workflow`, `security-review`, `search-first`, `strategic-compact`, `continuous-learning-v2`

**Session protocol:** `/plan` before each phase → `/compact` between phases → `/learn` after modules → `/cost` to monitor.

---

## Phase 0: Discovery

**Goal:** Understand existing system before writing code.

### Steps

1. **Analyze existing Lovable codebase** at path provided by user:
   ```bash
   find [path]/src -type f | head -100
   cat [path]/src/App.tsx
   find [path]/src -name "use*.ts" -o -name "use*.tsx" | head -20
   cat [path]/src/hooks/useClickUpTasks.ts
   cat [path]/src/hooks/useTaskComments.ts
   ls [path]/supabase/functions/
   ```

2. **Extract Supabase schema:**
   ```bash
   npx supabase gen types typescript --project-id [id] > database.ts
   ```

3. **Produce discovery report:**
   ```
   DISCOVERY REPORT
   Tables: [list]
   RLS policies: [confirmed/missing]
   Edge Functions: [list]
   Key hooks: [list]
   Auth flow: [type]
   Realtime subscriptions: [list]

   INTEGRATION PLAN
   Reuse hooks: [list]
   Reuse types: [list]
   Connect tables: [list]
   ```

4. **Generate CLAUDE.md** at project root (template in CLAUDE.md file)

5. **Generate initial docs/:**
   - `docs/ARCHITECTURE.md` — from discovery findings
   - `docs/DECISIONS.md` — start with "ADR-001: New codebase instead of extending Lovable"
   - `docs/CHANGELOG.md` — start with "Phase 0: Discovery completed"

### ✅ Phase 0 Done When

- [ ] Discovery report produced and confirmed by user
- [ ] CLAUDE.md exists at project root
- [ ] `docs/ARCHITECTURE.md` exists with data flow diagram
- [ ] `docs/DECISIONS.md` has ADR-001
- [ ] `docs/CHANGELOG.md` initialized
- [ ] Supabase types generated to `database.ts`

**Then:** `/compact` and proceed to Phase 1.

---

## Phase 1: Project Scaffold

**Goal:** Empty but working project with layout shell and routing.

### Steps

1. `npm create vite@latest kamanin-portal -- --template react-ts`
2. Install deps: `tailwindcss @tanstack/react-query react-router-dom lucide-react @supabase/supabase-js`
3. Set up shadcn/ui
4. Create `src/shared/styles/tokens.css` from SPEC.md Section 1
5. Map tokens to `tailwind.config.ts`
6. Create Supabase client: `src/shared/lib/supabase.ts`
7. Create auth hooks: `useAuth`, `useProfile`
8. Create layout: `AppShell`, `Sidebar`, `MobileHeader`, `BottomNav`
9. Create routing (all routes from CLAUDE.md)
10. Login page (email/password + magic link via Supabase Auth)
11. Copy `docs/` folder into project

### ✅ Phase 1 Done When

- [ ] `npm run dev` starts without errors
- [ ] Login page renders, auth flow works with staging Supabase
- [ ] Sidebar collapses (56px) and expands on hover (260px, 0.2s transition)
- [ ] Mobile: bottom nav renders at < 768px, hamburger opens sidebar overlay
- [ ] All routes defined, each shows a placeholder page title
- [ ] Supabase client initialized, `useAuth` returns user session
- [ ] Design tokens in `tokens.css`, mapped to Tailwind config
- [ ] No English text in UI

**Then:** `/compact`, `/learn`

---

## Phase 2: Project Experience Module

**Goal:** Full project overview page that matches prototype pixel-for-pixel.

### Steps

1. Create types: `src/modules/projects/types/project.ts` (from SPEC.md Section 8)
2. Create mock data: `src/modules/projects/lib/mock-data.ts` (from SPEC.md Section 9)
3. Create helpers: `src/modules/projects/lib/helpers.ts` (from SPEC.md Section 8)
4. Create phase colors: `src/modules/projects/lib/phase-colors.ts`
5. Build `PhaseTimeline` + `PhaseNode` (SPEC.md 3.1)
6. Build `DynamicHero` with priority cascade (SPEC.md 3.2)
7. Build `QuickActions` with counter pills (SPEC.md 3.3)
8. Build `OverviewTabs` + `UpdatesFeed` + `UpdateItem` (SPEC.md 3.4)
9. Build `ContextStrip` (assembles timeline + narrative)
10. Build `OverviewPage` (assembles all 5 sections)
11. Build `StepDetail` with 3 tabs (SPEC.md Section 4)
12. Build remaining pages: Tasks bridge, Files, Messages, Help
13. Test responsive breakpoints (1100, 768, 420)
14. Visual comparison against `kamanin-portal-prototype.html`

### Docs update (part of this phase)

- Update `docs/CHANGELOG.md`
- Create `docs/COMPONENT_CATALOG.md` with all project module components

### ✅ Phase 2 Done When

- [ ] Overview page renders with all 5 sections in correct order
- [ ] PhaseTimeline: 3 dot states work (completed ✓, current pulse, upcoming –)
- [ ] DynamicHero: shows Priority 1 with mock data (awaiting_input exists)
- [ ] DynamicHero: phase-tinted background visible
- [ ] QuickActions: 3 cards with correct colors, counter pills show counts
- [ ] OverviewTabs: Updates feed shows type icons (26×26 tinted)
- [ ] Step detail: 3 tabs work, expandable sections toggle
- [ ] Files page: phase folders visible
- [ ] Mobile (375px): bottom nav, 2×2 timeline, stacked QA, no sidebar
- [ ] No layout shifts, no FOUC
- [ ] All text in German
- [ ] `docs/COMPONENT_CATALOG.md` exists

**Then:** `/compact`, `/learn`

---

## Phase 3: Tasks/Support Module

**Goal:** Live task management connected to staging Supabase.

### Steps

1. Create `status-mapping.ts` (SPEC.md Section 6)
2. Create `transforms.ts` with `transformCachedTask` (top-level columns override raw_data)
3. Build `useTasks` hook: React Query + Realtime subscription on `task_cache`
4. Build `useTaskComments` hook: React Query + Realtime on `comment_cache`
5. Build `useTaskActions` hook: mutations calling `update-task-status` Edge Function
6. Build `useNotifications` hook: notifications + read_receipts
7. Build `useSupportChat` hook: comments via `support_task_id`
8. Build `TaskList` + `TaskCard` (SPEC.md Section 5)
9. Build `TaskDetailPage` with actions + comments (SPEC.md Section 5)
10. Build `TaskFilters`
11. Build `SupportPage`
12. Build `NotificationsFeed` (bell dropdown)
13. Wire Realtime: subscribe on mount, debounce 300ms, fallback 30s polling
14. Error handling: toasts, retry, loading skeletons (CLAUDE.md error table)
15. Test with real staging data and user

### Docs update (part of this phase)

- Update `docs/CHANGELOG.md`
- Create `docs/SUPABASE_SCHEMA.md` — auto-generated from discovered schema
- Create `docs/API_CONTRACTS.md` — Edge Function request/response shapes
- Create `docs/STATUS_MAPPING.md` — copy from SPEC.md Section 6
- Update `docs/COMPONENT_CATALOG.md` with tasks module components
- Update `CLAUDE.md` module status table

### ✅ Phase 3 Done When

- [ ] TasksPage loads real tasks from staging Supabase
- [ ] Filter "Wartet auf Sie" shows only CLIENT REVIEW tasks
- [ ] TaskDetail shows comment thread from `comment_cache`
- [ ] Posting a comment appears in ClickUp (verified manually)
- [ ] Approve action changes task to APPROVED in ClickUp
- [ ] Request Changes action changes task to REWORK in ClickUp
- [ ] Hold/Cancel show confirmation dialog, then update status
- [ ] Realtime: status change in ClickUp reflects in portal within 2s
- [ ] Realtime: new comment appears without page refresh
- [ ] Support chat works via `support_task_id`
- [ ] Notification bell shows unread count
- [ ] Error states: loading skeleton, connection error toast, empty state
- [ ] `docs/SUPABASE_SCHEMA.md`, `docs/API_CONTRACTS.md`, `docs/STATUS_MAPPING.md` exist
- [ ] All text in German

**Then:** `/compact`, `/learn`

---

## Multi-Agent Strategy (optional optimization)

Use when a phase has clearly independent workstreams. Don't force it — sequential is fine if workstreams share state.

### When to parallelize

```
Phase 2 — CAN split:
  Agent A: Layout shell, Sidebar, routing, tokens.css → Tailwind mapping
  Agent B: Project types, mock data, helpers, phase-colors
  → Merge, then single agent builds pages (both depend on layout + data)

Phase 3 — CAN split:
  Agent A: Auth flow, useAuth, useProfile, login page, Supabase client
  Agent B: status-mapping.ts, transforms.ts, useTasks, useTaskComments
  → Merge, then single agent builds UI + wires Realtime
```

### How to execute

```bash
/multi-plan "Phase 2: Agent A builds shared layout + tokens. Agent B builds project module types + mock data. Both reference SPEC.md."
/multi-execute
```

### Rules

- Agent A creates shared types BEFORE Agent B imports them
- Each agent works on a git branch
- After merge: one integration pass to resolve imports
- If worktrees unavailable: just run sequential, it's fine
- `/compact` between phases regardless

---

## Implementation Rules

### DO

- TypeScript strict mode
- Tailwind for all styling (tokens → Tailwind config)
- shadcn/ui for base components
- Lucide React for icons
- React Router v6 for routing
- React Query for all data fetching
- Supabase client for tasks module (live staging)
- Mock data for Project Experience (Supabase later)
- Supabase Realtime for live updates
- Components < 150 lines, logic in hooks
- Update docs/ after every structural change
- Match prototype pixel-for-pixel on desktop

### DO NOT

- No Redux, no Zustand — React Context + React Query only
- Do not rebuild Edge Functions — reuse existing
- Do not modify Supabase tables — read from existing schema
- Do not call ClickUp API from browser
- No English in UI
- No CSS modules, no styled-components
- Do not change overview 5-section structure
- No analytics/monitoring yet

### Quality Bar

- Overview identical to prototype
- Sidebar hover-expand smooth (0.2s)
- Phase timeline pulse animation works
- Hero phase tinting visible
- Mobile works at 375px
- No layout shifts, no CLS, no FOUC
- Page transitions feel instant (client-side routing)
- Error states handled (loading, error, empty)

---

## Reference Files

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Project context — read at every session start |
| `docs/SPEC.md` | Design tokens, components, pixel values — reference during build |
| `kamanin-portal-prototype.html` | Working HTML prototype — visual source of truth |
