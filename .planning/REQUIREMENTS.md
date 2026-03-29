# Milestone v1.1: Projects Module v2 — Requirements

**PRD Source:** `docs/audits/projects-module-audit.md` (22 findings, 7 categories)
**Created:** 2026-03-29

## v1.1 Requirements

### Critical Fixes (CRIT)

- [ ] **CRIT-01**: TasksPage shows project tasks from project_task_cache (not hardcoded empty array)
- [ ] **CRIT-02**: MessagesPage uses useProjectComments hook for live comment data (not stale step.messages)
- [ ] **CRIT-03**: ContextStrip ETA field either shows valid data or is removed entirely
- [ ] **CRIT-04**: StepOverviewTab hides empty enrichment sections (no blank expandable areas)

### AI Enrichment (ENRICH)

- [ ] **ENRICH-01**: Step enrichment re-generates when task name/description changes (hash-based detection)
- [ ] **ENRICH-02**: Operator can manually trigger re-enrichment per step via admin UI
- [ ] **ENRICH-03**: DynamicHero shows AI-generated whyItMatters text when available
- [ ] **ENRICH-04**: step_enrichment.sort_order is populated from milestone_order custom field

### PhaseTimeline (TIMELINE)

- [ ] **TIMELINE-01**: PhaseTimeline nodes are 20-24px with clear state differentiation via phase colors
- [ ] **TIMELINE-02**: Connector lines show partial completion fill (steps completed / total)
- [ ] **TIMELINE-03**: State transitions use Motion spring animations (layout transitions, state label entry/exit)
- [ ] **TIMELINE-04**: Mobile view (< 768px) collapses to single-phase with prev/next navigation
- [ ] **TIMELINE-05**: Tooltip on hover shows chapter narrative text

### Data Unification (DATA)

- [ ] **DATA-01**: ProjectContextSection rendered in OverviewPage (operator manages, client reads)
- [ ] **DATA-02**: FilesTab clearly labels data source ("ClickUp-Anhange") and link destination
- [ ] **DATA-03**: Page transitions use Motion fade+slide animations (opacity 0→1, y 8→0)
- [ ] **DATA-04**: PhaseTimeline shows shadcn Skeleton state while useProject is loading
- [ ] **DATA-05**: ProjectContextAdminPanel refactored to < 150 lines (extract MemoryEntryForm)

## Future Requirements (deferred)

- PWA with push notifications
- Dashboard / Ubersicht single-page overview
- Client review reminders (auto-nudge)

## Out of Scope

- Real-time collaborative editing of project memory — no use case for this milestone
- ClickUp webhook-triggered enrichment refresh — manual + sync-time is sufficient
- Vertical timeline layout variant — horizontal stepper is the established pattern
- AI enrichment model upgrade — stay with current gpt-4o-mini, proven reliable
- Multi-language support — all clients are German-speaking

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CRIT-01 | Phase 2 | Pending |
| CRIT-02 | Phase 2 | Pending |
| CRIT-03 | Phase 2 | Pending |
| CRIT-04 | Phase 2 | Pending |
| ENRICH-01 | Phase 3 | Pending |
| ENRICH-02 | Phase 3 | Pending |
| ENRICH-03 | Phase 3 | Pending |
| ENRICH-04 | Phase 3 | Pending |
| TIMELINE-01 | Phase 4 | Pending |
| TIMELINE-02 | Phase 4 | Pending |
| TIMELINE-03 | Phase 4 | Pending |
| TIMELINE-04 | Phase 4 | Pending |
| TIMELINE-05 | Phase 4 | Pending |
| DATA-01 | Phase 5 | Pending |
| DATA-02 | Phase 5 | Pending |
| DATA-03 | Phase 5 | Pending |
| DATA-04 | Phase 5 | Pending |
| DATA-05 | Phase 5 | Pending |
