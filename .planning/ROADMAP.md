# KAMANIN Portal — Roadmap

## Milestone 1: Production Portal

### Phase 1: Portal Frontend
- **Goal:** Full client portal with tickets, projects, support, account management
- **Status:** Complete
- **Directory:** phases/01-portal-frontend/

---

## Milestone 2: Projects Module v2

### Phases

- [x] **Phase 2: Critical Fixes** — Restore four permanently broken data pipelines so the Projects module shows real data (completed 2026-03-29)
- [x] **Phase 3: AI Enrichment** — Fix write-once enrichment lifecycle and surface AI content where clients can see it (completed 2026-03-29)
- [ ] **Phase 4: PhaseTimeline Redesign** — Replace static dots with animated, informative, mobile-responsive timeline
- [ ] **Phase 5: Data Unification & Polish** — Integrate ProjectContext, clarify FilesTab, add page transitions, enforce code standards

---

## Phase Details

### Phase 2: Critical Fixes
**Goal**: The Projects module displays real data from the database instead of permanently empty views
**Depends on**: Phase 1
**Requirements**: CRIT-01, CRIT-02, CRIT-03, CRIT-04
**Success Criteria** (what must be TRUE):
  1. A client opening the Tasks tab of a project sees their actual project tasks — not a blank list
  2. A client opening the Messages tab sees live comment data — not a stale or empty feed
  3. The ContextStrip ETA field either shows a valid date or is absent — never renders a blank chip
  4. A step with failed or empty AI enrichment shows no expandable section — blank expand areas never appear
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md — Remove dead TasksPage pipeline + guard empty enrichment sections
- [x] 02-02-PLAN.md — Fix MessagesPage live data + remove broken ETA display

### Phase 3: AI Enrichment
**Goal**: AI enrichment stays current with task changes and its content reaches clients on the overview page
**Depends on**: Phase 2
**Requirements**: ENRICH-01, ENRICH-03, ENRICH-04
**Success Criteria** (what must be TRUE):
  1. When a task name or description changes in ClickUp, the next sync generates fresh enrichment for that step (not the stale version)
  2. The DynamicHero card shows the AI-generated "why it matters" text when enrichment exists — not an empty ClickUp description
  3. Steps within a chapter appear in the order defined by milestone_order in ClickUp — not alphabetically
**Plans**: 1 plan

Plans:
- [x] 03-01-PLAN.md — DB migration + Edge Function overhaul (hash detection, OpenRouter swap, sort_order) + DynamicHero enrichment display

### Phase 4: PhaseTimeline Redesign
**Goal**: The phase timeline communicates project progress clearly on all screen sizes with fluid animation
**Depends on**: Phase 3
**Requirements**: TIMELINE-01, TIMELINE-02, TIMELINE-03, TIMELINE-04, TIMELINE-05
**Success Criteria** (what must be TRUE):
  1. Phase nodes are visually distinct — completed, active, and future states are immediately readable without guessing
  2. Connector lines between phases fill proportionally to show how many steps in that phase are done
  3. Switching between phases or completing a step animates smoothly with Motion spring transitions — no instant jumps
  4. On a phone (< 768px), the timeline shows one phase at a time with prev/next navigation — no horizontal scroll or overflow
  5. Hovering a phase node shows a tooltip with the chapter's narrative description text
**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md — Tooltip primitive + PhaseConnector + PhaseNode rewrite (phase colors, Motion animations, tooltip)
- [ ] 04-02-PLAN.md — PhaseTimeline desktop/mobile rewrite + unit tests + visual verification

### Phase 5: Data Unification & Polish
**Goal**: Project context is visible to clients, the files tab is unambiguous, and the codebase meets all architectural standards
**Depends on**: Phase 4
**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05
**Success Criteria** (what must be TRUE):
  1. A client on the OverviewPage can read the project context section — and an operator can manage its entries without database access
  2. The FilesTab clearly states its data source and links point to the correct destination — no ambiguity about where files come from
  3. Navigating between project tabs fades and slides in — no jarring instantaneous content swaps
  4. While project data is loading, the PhaseTimeline shows a skeleton placeholder — never a blank space or broken layout
  5. ProjectContextAdminPanel is under 150 lines with MemoryEntryForm extracted as a separate component
**Plans**: TBD
**UI hint**: yes

---

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 2. Critical Fixes | 2/2 | Complete   | 2026-03-29 |
| 3. AI Enrichment | 1/1 | Complete   | 2026-03-29 |
| 4. PhaseTimeline Redesign | 0/2 | In progress | - |
| 5. Data Unification & Polish | 0/? | Not started | - |
