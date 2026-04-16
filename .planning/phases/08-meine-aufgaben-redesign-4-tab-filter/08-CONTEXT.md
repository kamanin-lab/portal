# Phase 8: Meine Aufgaben Redesign — 4-Tab Filter System

**Gathered:** 2026-04-14
**Status:** Ready for planning
**Source:** User voice note transcript

<domain>
## Phase Boundary

Redesign MeineAufgabenPage to replace the current flat list with a 4-tab filter system
matching the UX pattern of TicketsPage (Aufgaben). Each tab has a count bubble. Remove
the recommendations block from TicketsPage entirely (it belongs on MeineAufgaben only).
Task cards render in a 2-column grid (same as TaskList on TicketsPage).

This phase does NOT touch:
- TicketsPage filter chips (Ihre Rückmeldung, Offen, etc.) — stays as-is
- Backend / Edge Functions
- Sidebar badge logic (already counts all attention types)
- Task card content or TaskDetailSheet behavior

</domain>

<decisions>
## Implementation Decisions

### Tab Order and Labels (locked by user)
1. **Tab 1 — Nachrichten** (unread messages): tasks with `taskUnread[id] > 0`
2. **Tab 2 — Kostenfreigabe** (cost approval): tasks with `mapStatus(t.status) === 'awaiting_approval'`
3. **Tab 3 — Warten auf Freigabe** (client review): tasks with `mapStatus(t.status) === 'needs_attention'`
4. **Tab 4 — Empfehlungen** (recommendations): tasks with `recommendation` tag

### Tab Behavior
- Tab chips row with count bubbles (same visual style as TaskFilters chips in TicketsPage)
- Default tab = first tab with count > 0; if all zero → show empty state
- Clicking a tab filters the grid below
- Each tab shows a 2-column task grid (same as TaskList)

### Recommendations Tab
- Uses existing `RecommendationCard` component for tab 4
- Session-only snooze (`snoozedIds` state) still applies in tab 4
- Snoozed recommendations are excluded from tab 4 count and grid

### TicketsPage — no changes
TicketsPage (Aufgaben) is untouched. RecommendationsBlock stays on the "Ihre Rückmeldung" tab.

### Layout
- Task grid: `grid grid-cols-1 md:grid-cols-2 gap-3` (same as TaskList)
- Tab chips use same pill/chip style as `TaskFilters` chips (rounded-full, border, count badge)
- Active tab: `bg-accent text-white border-accent`
- Inactive tab: `bg-surface border-border text-text-secondary hover:border-accent hover:text-accent`

### Empty State
- Show when the ACTIVE tab has zero tasks
- Full empty state only when ALL tabs are zero (no tasks needing attention at all)

### Component Size Rule
- MeineAufgabenPage must stay < 150 lines
- Extract `MeineAufgabenFilters` component for the tab chips row
- Keep task grid rendering inline or in a small `MeineAufgabenGrid` component

### Claude's Discretion
- Animation: use `motion.div` with `cardVariants` (same as TaskList) for stagger entrance
- Tab transition: simple re-render (no AnimatePresence needed for tab switch)
- Default active tab logic: first tab where count > 0 (evaluated once on data load)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `src/shared/pages/MeineAufgabenPage.tsx` — current implementation (replace entirely)
- `src/modules/tickets/pages/TicketsPage.tsx` — remove RecommendationsBlock from here
- `src/modules/tickets/components/TaskFilters.tsx` — chip style to replicate
- `src/modules/tickets/components/TaskList.tsx` — grid layout to replicate
- `src/modules/tickets/components/RecommendationsBlock.tsx` — reuse for tab 4
- `src/modules/tickets/components/RecommendationCard.tsx` — reuse for tab 4
- `src/modules/tickets/hooks/useUnreadCounts.ts` — `taskUnread` Record<string, number>
- `src/modules/tickets/hooks/useRecommendations.ts` — existing hook
- `src/modules/tickets/lib/status-mapping.ts` — `mapStatus()` for status comparisons
- `src/modules/tickets/lib/task-list-utils.ts` — `cardVariants` for motion
- `src/shared/pages/__tests__/MeineAufgabenPage.test.tsx` — existing tests (must pass or be updated)
- `docs/SPEC.md` — design tokens
- `src/shared/styles/tokens.css` — CSS variables

</canonical_refs>
