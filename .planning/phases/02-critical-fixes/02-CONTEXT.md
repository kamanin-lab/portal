# Phase 2: Critical Fixes - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning
**Source:** PRD Express Path (docs/audits/projects-module-audit.md)

<domain>
## Phase Boundary

Fix all 4 critical broken data pipelines in the Projects module so that clients see real data instead of empty views. The i18n violation (ProjectContextPreview) was already fixed in quick task 260329-fhb.

</domain>

<decisions>
## Implementation Decisions

### CRIT-01: TasksPage data pipeline
- TasksPage reads `project.tasks` which is hardcoded to `[]` in `transformToProject()` (line ~115 of transforms-project.ts)
- Decision: Either wire up `project.tasks` from `project_task_cache` rows, or remove TasksPage entirely if it's not routed
- Check `routes.tsx` for whether TasksPage has a route
- If routed: populate `project.tasks` in transform by mapping `project_task_cache` rows to `ProjectTask[]`
- If NOT routed: remove TasksPage component, remove `tasks` field from Project type and transform, clean up `getTasksForStep()` references

### CRIT-02: MessagesPage data source
- Standalone `/nachrichten` page reads `step.messages[]` which is always `[]` in transforms
- Meanwhile, OverviewTabs MessagesTab correctly uses `useProjectComments` hook
- Fix: Replace the broken data source in NachrichtenPage with `useProjectComments(project)` hook
- Group comments by `task_id` (step ID) and `chapter_config_id`
- Use existing `MessageBubble` component

### CRIT-03: ContextStrip ETA
- `teamWorkingOn.eta` is always empty string — no ClickUp field provides reliable ETA data
- Recommendation from audit: Remove the ETA display entirely
- Alternative: Replace with `teamWorkingOn.lastUpdate` shown as "Zuletzt aktiv"
- Do NOT populate from ClickUp `due_date` without explicit product decision

### CRIT-04: Empty enrichment sections
- StepOverviewTab renders blank ExpandableSection when enrichment `body.trim() === ''`
- Fix: Add guard — if body is empty, don't render the ExpandableSection at all
- Apply same guard to "Verknuepfte Aufgaben" section (already partially guarded)

### Claude's Discretion
- Whether to remove mock-data.ts as part of cleanup (audit finding 3.6.2)
- Exact fallback behavior for ContextStrip when no team status data exists
- Whether to clean up StepOverviewTab linked tasks section that searches empty `project.tasks`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit Document (PRD)
- `docs/audits/projects-module-audit.md` — Full 22-finding audit with exact line references, evidence, and implementation strategy (Section 4, Phase A)

### Transform Layer (root cause of all 4 bugs)
- `src/modules/projects/lib/transforms-project.ts` — The transform function that hardcodes empty arrays
- `src/modules/projects/types/project.ts` — Project type definition

### Affected Components
- `src/modules/projects/pages/NachrichtenPage.tsx` — Messages page (CRIT-02)
- `src/modules/projects/components/overview/ContextStrip.tsx` — ETA display (CRIT-03)
- `src/modules/projects/components/steps/StepOverviewTab.tsx` — Enrichment sections (CRIT-04)

### Data Hooks
- `src/modules/projects/hooks/useProject.ts` — Main data fetching hook
- `src/modules/projects/hooks/useProjectComments.ts` — Comments hook (correct data source for CRIT-02)

### Routing
- `src/app/routes.tsx` or `src/shared/pages/routes.tsx` — Check if TasksPage is routed (CRIT-01 decision)

</canonical_refs>

<specifics>
## Specific Ideas

- The audit recommends removing ETA entirely (CRIT-03) rather than showing unreliable data
- For CRIT-01, the audit provides both paths (wire up or remove) — check routing first
- All fixes are in the transform layer or component level — no Edge Function changes needed

</specifics>

<deferred>
## Deferred Ideas

- AI enrichment improvements → Phase 3
- PhaseTimeline redesign → Phase 4
- Data unification → Phase 5
- mock-data.ts removal → can be done in Phase 5 cleanup

</deferred>

---

*Phase: 02-critical-fixes*
*Context gathered: 2026-03-29 via PRD Express Path*
