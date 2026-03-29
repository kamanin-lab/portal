---
phase: quick
plan: 260329-fhb
subsystem: projects-module
tags: [audit, i18n, documentation, projects]
dependency_graph:
  requires: []
  provides: [docs/audits/projects-module-audit.md]
  affects: [src/modules/projects/]
tech_stack:
  added: []
  patterns: [audit-document, i18n-compliance]
key_files:
  created:
    - docs/audits/projects-module-audit.md
  modified:
    - src/modules/projects/components/overview/ProjectContextPreview.tsx
decisions:
  - "TasksPage should be removed if not routed (confirmed orphan), or fixed if routed — investigate routes.tsx"
  - "ContextStrip ETA should be removed (no reliable ClickUp ETA field), not populated"
  - "MessagesPage fix: wire useProjectComments hook instead of reading step.messages[]"
  - "AI enrichment: implement hash-based re-enrichment + manual trigger (both approaches)"
  - "PhaseTimeline redesign: custom build with shadcn + Motion (not library)"
  - "File source separation: keep ClickUp and Nextcloud separate, add clear labels"
metrics:
  duration_minutes: 25
  completed_date: "2026-03-29"
  tasks_completed: 2
  files_changed: 2
---

# Quick Task 260329-fhb: Projects Module Audit + German Translation Fix

**One-liner:** Formal 816-line audit of the Projects module documenting 22 findings (4 critical broken pipelines, AI enrichment write-once limitation, PhaseTimeline UX deficiencies) with a 4-phase improvement strategy and decision matrix, plus CLAUDE.md i18n compliance fix.

---

## What Was Done

### Task 1: Projects Module Audit Document

Created `docs/audits/projects-module-audit.md` (816 lines) — a comprehensive pre-implementation audit that serves as the single source of truth for all future Projects module work.

The document covers:

**Part 1: Audit Findings (22 findings across 7 categories)**

| Category | Severity | Count | Key Finding |
|----------|----------|-------|-------------|
| Broken Data Pipelines | Critical | 4 | TasksPage (`project.tasks: []`), MessagesPage (stale `step.messages[]`), ContextStrip ETA (always `""`), StepOverviewTab linked tasks (always `[]`) |
| AI Enrichment Limitations | High | 6 | Write-once `ignoreDuplicates:true`, no re-trigger, empty enrichment rendered, `sort_order` never populated, enrichment buried in StepOverviewTab not surfaced in hero, 30s silent timeout |
| PhaseTimeline UX Issues | High | 4 | Cramped layout, binary connectors (no partial fill), tiny 14px dots, no Motion animations |
| Internationalization Violations | Medium | 1 | English strings in ProjectContextPreview (fixed in Task 2) |
| Data Source Inconsistencies | Medium | 1 | FilesTab shows ClickUp attachments; DateienPage shows Nextcloud — "Alle anzeigen" navigates to different data |
| Unused Components | Low | 2 | ProjectContextSection + ProjectContextAdminPanel built but not integrated into OverviewPage |
| Code Quality | Low | 3 | Motion library unused, phase colors narrowly used, ProjectContextAdminPanel 157 lines (>150 guideline) |

**Part 2: Improvement Strategy (4 phases, 8-12 total hours)**

- Phase A: Critical Fixes (1-2h) — fix 4 dead pipelines
- Phase B: AI Enrichment Improvements (2-3h) — hash-based refresh, manual trigger, surface in hero
- Phase C: PhaseTimeline Redesign (3-4h) — shadcn + Motion custom stepper with partial-fill connectors
- Phase D: Data Unification + Polish (2-3h) — integrate ProjectContextSection, label file sources, Motion page transitions

**Decision Matrix:** 7 architectural decisions documented with options, recommendations, and rationale.

### Task 2: German Translation Fix

Translated all English user-facing strings in `ProjectContextPreview.tsx`:

| English (before) | German (after) |
|------------------|----------------|
| `"Known context"` | `"Bekannter Kontext"` |
| `"Useful context already agreed or safe to share"` | `"Bereits abgestimmter oder freigegebener Kontext"` |
| `"This preview is filtered for client-safe context only. Internal team notes stay off overview surfaces."` | `"Diese Vorschau zeigt nur kundenrelevanten Kontext. Interne Teamnotizen werden hier nicht angezeigt."` |
| `VISIBILITY_COPY.shared: 'Shared context'` | `'Geteilter Kontext'` |
| `VISIBILITY_COPY.client_visible: 'Client visible'` | `'Für Kunden sichtbar'` |

Build verified: `npm run build` passes with no regressions.

---

## Commits

| Task | Commit | Message |
|------|--------|---------|
| Task 1 | `c74ccde` | `docs(260329-fhb): write comprehensive Projects module audit` |
| Task 2 | `17050f4` | `fix(260329-fhb): translate ProjectContextPreview.tsx to German` |

---

## Deviations from Plan

None — plan executed exactly as written. Both tasks completed, all verifications passed.

---

## Known Stubs

None. No new UI components were created. The audit document is a documentation artifact, not a UI surface. The translation fix changes text content only.

---

## Self-Check: PASSED

- `docs/audits/projects-module-audit.md` exists: FOUND
- Line count >= 150: 816 lines (PASS)
- No English strings in ProjectContextPreview.tsx: PASS (grep confirmed)
- Build passes: PASS (`npm run build` succeeds in 13.59s)
- Commit `c74ccde` exists: FOUND
- Commit `17050f4` exists: FOUND
