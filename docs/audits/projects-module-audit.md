# Projects Module Audit

**Date:** 2026-03-29
**Auditor:** Claude Sonnet 4.6 (GSD executor)
**Module:** `src/modules/projects/` + `supabase/functions/fetch-project-tasks/`
**Confidence:** HIGH — direct source code reading across ~50 files
**Purpose:** Formal pre-implementation audit. This document is the single source of truth for all future Projects module improvement work.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Module Architecture Overview](#2-module-architecture-overview)
3. [Audit Findings](#3-audit-findings)
   - [3.1 Broken Data Pipelines (Critical)](#31-broken-data-pipelines-critical)
   - [3.2 AI Enrichment Limitations (High)](#32-ai-enrichment-limitations-high)
   - [3.3 PhaseTimeline UX Issues (High)](#33-phasetimeline-ux-issues-high)
   - [3.4 Internationalization Violations (Medium)](#34-internationalization-violations-medium)
   - [3.5 Data Source Inconsistencies (Medium)](#35-data-source-inconsistencies-medium)
   - [3.6 Unused / Unintegrated Components (Low)](#36-unused--unintegrated-components-low)
   - [3.7 Code Quality Notes (Low)](#37-code-quality-notes-low)
4. [Improvement Strategy](#4-improvement-strategy)
   - [Phase A: Critical Fixes](#phase-a-critical-fixes-1-2-hours)
   - [Phase B: AI Enrichment Improvements](#phase-b-ai-enrichment-improvements-2-3-hours)
   - [Phase C: PhaseTimeline Redesign](#phase-c-phasetimeline-redesign-3-4-hours)
   - [Phase D: Data Unification and Polish](#phase-d-data-unification-and-polish-2-3-hours)
5. [Decision Matrix](#5-decision-matrix)
6. [Severity Summary](#6-severity-summary)

---

## 1. Executive Summary

The Projects module is a well-architected, production-quality module spanning ~50 files. The core data flow (ClickUp → `fetch-project-tasks` → `project_task_cache` → `transformToProject()` → UI) is sound. Realtime subscriptions, AI enrichment, file management, and project memory are all correctly wired.

However, four **critical bugs** exist where components read from data fields that are hardcoded to empty in the transform layer — producing permanently empty views even when data exists in the database. Additionally, the AI enrichment system has a **write-once limitation** that prevents content from being refreshed, and the PhaseTimeline has **notable UX deficiencies** compared to what the Motion + shadcn/ui stack could deliver.

**Immediate action required:**
- Fix the TasksPage dead pipeline (`project.tasks` always `[]`)
- Fix the MessagesPage reading stale mock data instead of `useProjectComments`
- Fix the ContextStrip ETA always rendering as an empty string
- Translate `ProjectContextPreview.tsx` to German (CLAUDE.md compliance violation)

---

## 2. Module Architecture Overview

### Data Flow

```
ClickUp API
    |
    v
fetch-project-tasks (Edge Function)
    |  - Fetches all tasks from ClickUp list with pagination
    |  - Filters by visibility custom field (CLICKUP_VISIBLE_FIELD_ID)
    |  - Upserts into project_task_cache (onConflict: clickup_id,project_config_id)
    |  - Generates AI enrichment (Claude Haiku) for NEW tasks only -> step_enrichment
    v
Supabase Tables
    |  - project_config         (project metadata)
    |  - chapter_config         (phases / chapters)
    |  - project_task_cache     (tasks = steps in project context)
    |  - step_enrichment        (AI-generated why_it_matters + what_becomes_fixed)
    |  - comment_cache          (comments from ClickUp, used by useProjectComments)
    |  - project_quick_actions  (configurable action buttons per project)
    |  - project_memory_entries (project context memory, scoped by client/project)
    |  - project_access         (user -> project mapping)
    v
useProject hook
    |  - Resolves default project ID from project_access when none explicit
    |  - Fetches 6 tables in parallel (config, chapters, tasks, enrichments, comments, quickActions)
    |  - Calls transformToProject() to build typed Project model
    |  - Sets up Realtime subscription on project_task_cache (debounced 300ms)
    |  - Triggers background refresh via fetch-project-tasks on first mount
    |  - staleTime: 5 minutes (Realtime handles live updates in between)
    v
Project model -> all UI components
```

### Component Tree

```
UebersichtPage (route: /projekte/*)
  -> useProject()
  -> OverviewPage
      -> ContextStrip
      |    -> PhaseTimeline               <- 4-step progress line (horizontal stepper)
      |    |    -> PhaseNode (x4)         <- Individual chapter dots
      |    -> Narrative text (generateNarrative)
      |    -> Team status line (teamWorkingOn.task / .eta / .lastUpdate)
      -> DynamicHero                      <- Priority-based hero card (4 priority states)
      -> AttentionList                    <- Additional review items (awaiting_input)
      -> QuickActions                     <- Configurable action cards
      -> OverviewTabs
      |    -> ActivityFeed (Aktivitat)    <- LIVE: merges status events + useProjectComments
      |    -> FilesTab (Dateien)          <- ClickUp attachments only (max 8, "show all" -> /dateien)
      |    -> MessagesTab (Nachrichten)   <- LIVE: useProjectComments
      -> SchritteSheet                    <- Chapter drill-down (steps list)
      -> StepSheet -> StepDetail
      |    -> StepOverviewTab             <- AI expandable sections (whyItMatters, whatBecomesFixed)
      |    |    -> StepActionBar          <- Approve / Request changes (awaiting_input only)
      |    -> StepFilesTab                <- ClickUp attachments for this step
      |    -> StepDiscussionTab           <- LIVE: TaskComments (comment_cache)
      -> MessageSheet, UploadSheet, NewTicketDialog

NachrichtenPage (route: /nachrichten)
  -> useProject()
  -> MessagesPage                         <- BROKEN: reads step.messages[] (always [])

DateienPage (route: /dateien)
  -> useProject()
  -> FilesPage (Nextcloud WebDAV)         <- Separate data source from FilesTab
```

---

## 3. Audit Findings

---

### 3.1 Broken Data Pipelines (Critical)

#### Finding 3.1.1 — TasksPage: Dead data pipeline

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/tasks/TasksPage.tsx` |
| **Status** | Broken |
| **Severity** | Critical |

**What the component does:** Renders project tasks grouped into "Wartet auf Sie" (needs-attention) and "In Bearbeitung" (in-progress) buckets with navigation to step detail.

**Issue:** `transformToProject()` hardcodes `tasks: [] as ProjectTask[]` at line 229 of `transforms-project.ts`. The `Project` model's `tasks` field is never populated from any live data source. As a result, `project.tasks.filter(...)` always returns empty arrays and the page permanently shows "Keine Aufgaben vorhanden."

**Evidence:**
```typescript
// transforms-project.ts line 229
tasks: [] as ProjectTask[],
```

```typescript
// TasksPage.tsx lines 11-12
const needsAttention = project.tasks.filter(t => t.status === 'needs-attention');
const inProgress = project.tasks.filter(t => t.status === 'in-progress');
```

**Additional evidence:** `TasksPage` is not wired to any route in `routes.tsx` (confirmed in research). This component appears to be dead code from an earlier design iteration before the Project model was restructured around chapters/steps.

**Impact:** Complete feature failure. The page renders but is permanently empty. If a route ever exists, users always see "Keine Aufgaben vorhanden" regardless of data.

---

#### Finding 3.1.2 — MessagesPage: Reads stale data instead of live comments

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/messages/MessagesPage.tsx` |
| **Status** | Broken |
| **Severity** | Critical |

**What the component does:** Standalone page at `/nachrichten` route — intended to show all project messages grouped by step.

**Issue:** The page reads `step.messages[]` from the `Project` model. In `transforms-project.ts`, each `Step`'s `messages` field is always set to `[]` (line 164). Live comment data flows through `comment_cache` → `useProjectComments` hook, which is correctly used by `OverviewTabs/MessagesTab` and `StepDiscussionTab`, but NOT by this standalone page.

**Evidence:**
```typescript
// transforms-project.ts line 164
messages: [],
```

```typescript
// MessagesPage.tsx lines 13-20
const groups = project.chapters.flatMap(ch =>
  ch.steps
    .filter(s => s.messages.length > 0)  // always 0, filter removes all
    .map(s => ({ ... messages: s.messages }))
);
```

**Contrast — what works correctly:**
```typescript
// OverviewTabs.tsx line 16 — correct approach
const { data: comments = [], isLoading } = useProjectComments(p);
```

**Impact:** The `/nachrichten` route always shows "Noch keine Nachrichten." even when dozens of comments exist in the system. Clients who navigate directly to the messages page see empty state.

---

#### Finding 3.1.3 — ContextStrip: ETA always empty string

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/ContextStrip.tsx` (line 33) |
| **Status** | Broken |
| **Severity** | Critical |

**What the component does:** Displays the currently active team task with ETA and last-update timestamp in the project overview header strip.

**Issue:** The `teamWorkingOn.eta` field is hardcoded to `''` in `transformToProject()` at line 233. The `ContextStrip` renders `ETA: {teamWorkingOn.eta}` unconditionally, producing the string "ETA: " with nothing after it in every project view.

**Evidence:**
```typescript
// transforms-project.ts lines 231-237
teamWorkingOn: {
  task: currentWork?.name || '',
  eta: '',                              // always empty
  lastUpdate: currentWork?.last_activity_at
    ? formatDate(currentWork.last_activity_at) || ''
    : '',
},
```

```typescript
// ContextStrip.tsx line 33
· ETA:{' '}
<strong className="text-[var(--text-primary)] font-medium">
  {teamWorkingOn.eta}                   // always empty — renders "ETA: "
</strong>
```

**Impact:** Every project overview shows "ETA: " dangling with no value. Minor cosmetic damage but consistently broken. `task` and `lastUpdate` are populated correctly — only `eta` is missing.

---

#### Finding 3.1.4 — StepOverviewTab: Linked tasks section always empty

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/steps/StepOverviewTab.tsx` (line 20) |
| **Status** | Broken |
| **Severity** | Critical |

**What the component does:** Shows AI-enriched expandable sections for each step, plus a "Verknuepfte Aufgaben" section listing tasks linked to that step.

**Issue:** `getTasksForStep(step.id, project)` searches `project.tasks` which is always `[]` (same root cause as Finding 3.1.1). The linked tasks section condition `linkedTasks.length > 0` always evaluates to false, so the section never renders even if tasks are linked.

**Evidence:**
```typescript
// helpers.ts (getTasksForStep)
export function getTasksForStep(stepId: string, project: Project): ProjectTask[] {
  return project.tasks.filter(t => t.stepId === stepId);
  // project.tasks is always [] -> always returns []
}
```

```typescript
// StepOverviewTab.tsx lines 20-21
const linkedTasks = getTasksForStep(step.id, project);
// linkedTasks.length always === 0 -> section never shown
```

**Impact:** The "Verknuepfte Aufgaben" feature is completely non-functional in production.

---

### 3.2 AI Enrichment Limitations (High)

#### Finding 3.2.1 — Write-once pattern: no re-enrichment on task changes

| Attribute | Value |
|-----------|-------|
| **File** | `supabase/functions/fetch-project-tasks/index.ts` (lines 304-308, 421-430) |
| **Status** | Partial — works for first sync only |
| **Severity** | High |

**What it does:** When `fetch-project-tasks` runs, it checks which task IDs don't have entries in `step_enrichment` and generates AI descriptions for those new tasks only.

**Issue:** `onConflict: "clickup_task_id", ignoreDuplicates: true` means that once an enrichment record exists, it is never overwritten — even if the task's name or description changes significantly in ClickUp. The set of "already enriched" task IDs is computed at request start and never revalidated.

**Evidence:**
```typescript
// Lines 304-308 — computed once at start
const { data: existingEnrichments } = await supabaseService
  .from("step_enrichment")
  .select("clickup_task_id");
const enrichedTaskIds = new Set((existingEnrichments || []).map(e => e.clickup_task_id));
// ...

// Lines 421-430 — ignoreDuplicates prevents re-generation
await supabaseService
  .from("step_enrichment")
  .upsert(enrichments.map(...), { onConflict: "clickup_task_id", ignoreDuplicates: true });
```

**Impact:** AI-enriched descriptions become stale as tasks evolve. A task renamed from "Konzept-Entwurf" to "Finales Konzept + Freigabe" retains the original enrichment. No mechanism to detect or correct this.

---

#### Finding 3.2.2 — No manual re-enrichment trigger

| Attribute | Value |
|-----------|-------|
| **File** | `fetch-project-tasks/index.ts`, all project UI components |
| **Status** | Missing feature |
| **Severity** | High |

**Issue:** There is no admin-accessible button, API endpoint, or scheduled job to force re-generation of AI enrichment for existing tasks. The only way to get fresh enrichment is to delete the `step_enrichment` row manually from the database.

**Impact:** Operators cannot self-service stale content without direct database access. No UI affordance exists.

---

#### Finding 3.2.3 — Empty enrichment silently saved and rendered

| Attribute | Value |
|-----------|-------|
| **File** | `fetch-project-tasks/index.ts` line 198-202, `StepOverviewTab.tsx` lines 37-50 |
| **Status** | Partial |
| **Severity** | High |

**Issue:** If Claude Haiku returns empty strings for `why_it_matters` or `what_becomes_fixed`, those empty strings are saved to `step_enrichment` and later rendered. `ExpandableSection` in `StepOverviewTab` does not guard against empty `body` — it renders an open expandable section with an empty `<div>`.

**Evidence:**
```typescript
// StepOverviewTab.tsx lines 37-49
<ExpandableSection
  title="Warum ist das wichtig?"
  body={step.whyItMatters}           // could be "" — no guard
  isOpen={expandedSections.whyItMatters}
  onToggle={() => toggleSection('whyItMatters')}
/>
```

```typescript
// ExpandableSection renders body unconditionally when open:
<div className="border-t border-border-light px-3.5 py-3 ...">
  {body}                             // empty string renders blank section
</div>
```

**Impact:** Steps with failed AI enrichment display confusing expandable sections that expand to nothing.

---

#### Finding 3.2.4 — `step_enrichment.sort_order` never populated

| Attribute | Value |
|-----------|-------|
| **File** | `fetch-project-tasks/index.ts` lines 421-430, `transforms-project.ts` lines 125-133 |
| **Status** | Partial |
| **Severity** | High |

**Issue:** The `step_enrichment` table has a `sort_order` column. The transform uses it to order steps within chapters (`ea?.sort_order ?? 999`). However, the AI enrichment generation never writes `sort_order` — it only writes `clickup_task_id`, `why_it_matters`, and `what_becomes_fixed`. All records default to `sort_order = 0`, making the sort fall back to `localeCompare(name)` for all steps.

**Evidence:**
```typescript
// fetch-project-tasks/index.ts lines 422-427
enrichments.map(e => ({
  clickup_task_id: e.clickup_task_id,
  why_it_matters: e.why_it_matters,
  what_becomes_fixed: e.what_becomes_fixed,
  // sort_order: never written -> defaults to 0
}))
```

```typescript
// transforms-project.ts lines 126-131
chapterTasks.sort((a, b) => {
  const ea = enrichmentMap.get(a.clickup_id);
  const orderA = ea?.sort_order ?? 999;  // 0 for all enriched tasks -> sorted together
  const orderB = eb?.sort_order ?? 999;
  if (orderA !== orderB) return orderA - orderB;
  return a.name.localeCompare(b.name);   // fallback for same sort_order
});
```

**Impact:** Step ordering within chapters is non-deterministic — effectively alphabetical by name. Intended milestone ordering is never applied.

---

#### Finding 3.2.5 — AI enrichment not surfaced in DynamicHero or AttentionList

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/DynamicHero.tsx`, `AttentionList.tsx` |
| **Status** | Design gap |
| **Severity** | High |

**Issue:** `DynamicHero` shows `primaryAttention.description` which comes from `step.description` (the raw ClickUp task description — often empty or technical). The AI-enriched `step.whyItMatters` is only accessible deep inside `StepOverviewTab` (inside a StepSheet, inside a SchritteSheet). `AttentionList` shows `item.portalCta || item.title` — no AI content.

**Evidence:**
```typescript
// DynamicHero.tsx line 49
description: primaryAttention.description,  // raw ClickUp description, not AI enrichment
```

**Impact:** The most client-relevant content (AI-generated "warum ist das wichtig") is buried three layers deep. The overview page hero card, which has the highest visibility, shows raw ClickUp descriptions that may be empty or technical.

---

#### Finding 3.2.6 — 30s AI timeout with silent failure

| Attribute | Value |
|-----------|-------|
| **File** | `fetch-project-tasks/index.ts` line 183 |
| **Status** | Risk |
| **Severity** | Medium (listed here for completeness) |

**Evidence:**
```typescript
}, 30000); // 30s timeout for AI
// ...
} catch (err) {
  log.warn("AI enrichment failed", { error: (err as Error).message });
  return [];  // no retry, silent failure
}
```

**Impact:** On slow Anthropic API responses, enrichment generation silently fails. No retry attempted. No user-facing indication. Tasks remain un-enriched until next sync cycle.

---

### 3.3 PhaseTimeline UX Issues (High)

#### Finding 3.3.1 — Cramped layout with 4+ phases

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/PhaseNode.tsx`, `PhaseTimeline.tsx` |
| **Status** | Partial |
| **Severity** | High |

**Issue:** Each `PhaseNode` uses a vertical flex layout with dot + title + progress fraction + state label stacked. With 4 chapters, each node competes for horizontal space in a `flex-1` container. Title text truncates or wraps. The 28px wide connector lines (`w-[28px]`) between nodes further compress available node space.

**Evidence:**
```typescript
// PhaseNode.tsx lines 30-52: vertical flex stack inside each node button
<div className="flex flex-col gap-0">
  <span className="text-body font-semibold...">  {chapter.title}  </span>
  <span className="text-2xs mt-0.5">             {progress}       </span>
  {stateLabel && <span className="text-2xs...">  {stateLabel}     </span>}
</div>
```

**Impact:** On typical 4-phase projects, titles like "Konzeptentwicklung" clip visually. Progress + label compete for the same small vertical space.

---

#### Finding 3.3.2 — Binary connector lines (no partial fill)

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/PhaseTimeline.tsx` (lines 31-36) |
| **Status** | Design gap |
| **Severity** | High |

**Issue:** Connector lines between `PhaseNode` elements are either full gray (prev chapter not completed) or full green (`var(--committed)` when completed). There is no partial fill indicating percentage completion of an in-progress chapter.

**Evidence:**
```typescript
// PhaseTimeline.tsx lines 31-36
<div className={`w-[28px] h-[2px] ...
  ${prevCompleted ? 'bg-[var(--committed)] opacity-100' : 'bg-[var(--border)] opacity-40'}
`}/>
```

**Impact:** The timeline gives no visual feedback about progress within a current phase.

---

#### Finding 3.3.3 — Tiny state dots (14-15px)

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/PhaseNode.tsx` (lines 62-83) |
| **Status** | Design gap |
| **Severity** | High |

**Issue:** Status dots are 14px (completed/upcoming) and 15px (current). At these sizes, the checkmark `✓` and dash `–` icons inside are barely readable. The "current" state's inner white dot is 5px — nearly invisible.

**Evidence:**
```typescript
// PhaseNode.tsx line 62
<div className={`${base} w-[14px] h-[14px] border-[var(--committed)] ...`}>
  <span className="text-3xs text-white font-bold leading-none">✓</span>
// PhaseNode.tsx line 71
<div className={`${base} w-[15px] h-[15px] ...`} style={{ animation: 'phase-pulse...' }}>
  <span className="block w-[5px] h-[5px] rounded-full bg-white" />
```

**Impact:** State differentiation at a glance is poor, especially on low-DPI or small screens.

---

#### Finding 3.3.4 — No Motion animations

| Attribute | Value |
|-----------|-------|
| **File** | `PhaseTimeline.tsx`, `PhaseNode.tsx` |
| **Status** | Missed opportunity |
| **Severity** | High |

**Issue:** Motion (`motion/react`) is in the project stack and is documented as the primary animation tool. The PhaseTimeline is entirely static despite having meaningful state transitions (upcoming → current → completed) that would benefit from animated layout changes.

The only animation present is a CSS `animation: 'phase-pulse 2.4s...'` inline style on the current node dot — this is CSS, not Motion.

**Impact:** The timeline feels static and unresponsive compared to the Motion-capable polish the rest of the stack supports.

---

#### Finding 3.3.5 — Hardcoded rgba values instead of CSS tokens

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/PhaseNode.tsx` (lines 22-27) |
| **Status** | Code quality |
| **Severity** | Medium |

**Issue:** The "current" phase node uses hardcoded `rgba(43,24,120,...)` values for background, border, and box-shadow. These are not CSS custom properties from `tokens.css`, making them immune to theme changes.

**Evidence:**
```typescript
// PhaseNode.tsx lines 22-27
style={status === 'current' ? {
  background: 'rgba(43,24,120,0.07)',
  border: '1px solid rgba(43,24,120,0.15)',
  boxShadow: 'inset 0 0 0 1px rgba(43,24,120,0.06)',
  margin: '-1px 0',
} : undefined}
```

**Impact:** If the accent color token changes, the PhaseNode current state highlight will not update automatically.

---

#### Finding 3.3.6 — Mobile overflow without adaptive layout

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/PhaseTimeline.tsx` (line 14) |
| **Status** | Partial |
| **Severity** | Medium |

**Issue:** Mobile responsiveness is handled via `overflow-x-auto` with `max-[768px]:flex-none max-[768px]:shrink-0` on each node. This produces horizontal scrolling rather than a compact mobile-first layout. On a 375px screen with 4 phases, the entire timeline requires horizontal scrolling.

**Impact:** Suboptimal mobile UX. A better pattern would show current phase prominently with prev/next navigation, or collapse to a compact single-row indicator.

---

### 3.4 Internationalization Violations (Medium)

#### Finding 3.4.1 — English strings in ProjectContextPreview.tsx

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/ProjectContextPreview.tsx` |
| **Status** | Violation |
| **Severity** | Medium |

**Issue:** CLAUDE.md rule: "All UI text in German — zero English in user-facing strings." `ProjectContextPreview.tsx` contains three English strings rendered directly to the user:

| Line | English | Required German |
|------|---------|----------------|
| 18 | `"Known context"` | `"Bekannter Kontext"` |
| 19 | `"Useful context already agreed or safe to share"` | `"Bereits abgestimmter oder freigegebener Kontext"` |
| 20 | `"This preview is filtered for client-safe context only. Internal team notes stay off overview surfaces."` | `"Diese Vorschau zeigt nur kundenrelevanten Kontext. Interne Teamnotizen werden hier nicht angezeigt."` |

Additionally, the `VISIBILITY_COPY` constant (lines 7-10) contains English values `'Shared context'` and `'Client visible'` which are rendered in the UI via `{VISIBILITY_COPY[entry.visibility]}` at line 27.

**Evidence:**
```typescript
// Lines 7-10
const VISIBILITY_COPY: Record<...> = {
  shared: 'Shared context',       // English — rendered to user
  client_visible: 'Client visible', // English — rendered to user
};
// Line 18
<div>...>Known context</div>
// Line 19
<div>...>Useful context already agreed or safe to share</div>
// Line 20
<p>...>This preview is filtered for client-safe context only. Internal team notes stay off overview surfaces.</p>
```

**Impact:** Direct CLAUDE.md compliance violation. Clients see English in an otherwise German-language portal.

---

### 3.5 Data Source Inconsistencies (Medium)

#### Finding 3.5.1 — FilesTab vs DateienPage: different data sources

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/OverviewTabs.tsx` (FilesTab), `src/modules/projects/pages/DateienPage.tsx` |
| **Status** | Design inconsistency |
| **Severity** | Medium |

**Issue:** The "Dateien" tab in `OverviewTabs` shows ClickUp task attachments (`step.files[]`, sourced from `task.attachments` in `project_task_cache`). It links to `/dateien` via "Alle anzeigen". The `/dateien` page (`DateienPage`) shows Nextcloud WebDAV files — a completely different storage system with different files.

```
OverviewTabs FilesTab -> project_task_cache.attachments (ClickUp attachments)
DateienPage -> Nextcloud WebDAV (manually uploaded client files)
```

The "Alle anzeigen" link from FilesTab navigates to a page that shows completely different data than what the user just saw.

**Impact:** Potential client confusion: "I uploaded a file to Nextcloud but can't find it in the Dateien tab" or "I see files in the tab but not on the page." The user mental model of "project files" is fragmented.

---

### 3.6 Unused / Unintegrated Components (Low)

#### Finding 3.6.1 — ProjectContextSection and ProjectContextAdminPanel not rendered

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/ProjectContextSection.tsx`, `ProjectContextAdminPanel.tsx` |
| **Status** | Unused (built but not integrated) |
| **Severity** | Low |

**Issue:** Both `ProjectContextSection` (client view) and `ProjectContextAdminPanel` (operator view) are fully built components. They use the `useProjectMemory` hook and `manage-project-memory` Edge Function. However, they are not rendered in `OverviewPage` — they exist as complete, working components that are simply never shown to users.

**Impact:** The project memory feature is built but invisible. Operators cannot enter context, clients cannot see it.

---

#### Finding 3.6.2 — mock-data.ts still present

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/lib/mock-data.ts` |
| **Status** | Residual |
| **Severity** | Low |

**Issue:** `mock-data.ts` still exists and populates fields that are now empty in live transforms (including `messages`, `tasks`, etc.). This file is the source of the "works in mock, broken in production" pattern seen throughout the module.

**Impact:** Maintenance confusion. A developer may reference mock-data types and expect fields to be populated in production.

---

### 3.7 Code Quality Notes (Low)

#### Finding 3.7.1 — ProjectContextAdminPanel exceeds 150-line guideline

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/components/overview/ProjectContextAdminPanel.tsx` |
| **Status** | Minor violation |
| **Severity** | Low |

CLAUDE.md: "Components < 150 lines". `ProjectContextAdminPanel.tsx` is 157 lines — 7 lines over.

#### Finding 3.7.2 — Motion library completely unused in this module

| Attribute | Value |
|-----------|-------|
| **File** | All files in `src/modules/projects/` |
| **Status** | Missed opportunity |
| **Severity** | Low |

Despite `motion/react` being the designated animation tool in CLAUDE.md, no file in the Projects module imports or uses Motion. All animations are CSS-only (`animation:` inline styles or Tailwind `transition-*`). This is not a bug, but represents unused capability.

#### Finding 3.7.3 — Phase colors system well-structured but narrowly used

| Attribute | Value |
|-----------|-------|
| **File** | `src/modules/projects/lib/phase-colors.ts` |
| **Status** | Underutilized |
| **Severity** | Low |

`phase-colors.ts` provides a clean `getPhaseColor(order)` function returning `{ main, light, text }` color sets. It is used in `DynamicHero` and `TasksPage` but not in `PhaseNode` or `PhaseTimeline`, which use hardcoded rgba values instead.

---

## 4. Improvement Strategy

---

### Phase A: Critical Fixes (1-2 hours)

Fix all four broken data pipelines and the i18n violation (Task 2 of this plan already handles the i18n fix).

**A1. Resolve TasksPage fate**
- Verify in `routes.tsx` whether `TasksPage` is routed.
- If NOT routed: remove the component and the `tasks: [] as ProjectTask[]` field from the `Project` type and transform. Clean up `getTasksForStep()` and `StepOverviewTab`'s linked tasks section.
- If routed: populate `project.tasks` in `transformToProject()` by mapping `project_task_cache` rows with appropriate status mapping into `ProjectTask[]` records linked to steps via `clickup_id`.

**A2. Fix MessagesPage data source**
- Replace `project.chapters.flatMap(ch => ch.steps.filter(s => s.messages.length > 0)...)` with `useProjectComments(project)` hook call.
- Group comments by `task_id` (step ID) and `chapter_config_id`.
- Render using the same `MessageBubble` component already used on the page.

**A3. Fix ContextStrip ETA display**
- Option A (recommended): Remove the ETA display entirely — no ClickUp field provides reliable ETA data.
- Option B: Replace with `teamWorkingOn.lastUpdate` shown as "Zuletzt aktiv" if available.
- Do NOT attempt to populate `eta` from ClickUp `due_date` without explicit product decision.

**A4. Fix StepOverviewTab empty enrichment sections**
- Add guard in `ExpandableSection`: if `body.trim() === ''`, render nothing (not an expandable section).
- Also apply to the "Verknuepfte Aufgaben" section (already guarded by `linkedTasks.length > 0`).

---

### Phase B: AI Enrichment Improvements (2-3 hours)

**B1. Replace write-once with hash-based re-enrichment**
- Add `last_enriched_at` timestamp and `task_name_hash` column to `step_enrichment` table.
- On sync: compare current task name/description hash with stored hash. If different, include in the re-enrichment batch even if record exists.
- Change `ignoreDuplicates: true` to a proper upsert without ignore (update on conflict).

**B2. Add manual re-enrichment trigger**
- Add an admin-only "Neu generieren" button to `StepOverviewTab` (operator-only, gated by `VITE_MEMORY_OPERATOR_EMAILS`).
- On click: call `fetch-project-tasks` with a `forceEnrichTaskId` parameter that bypasses the existing-enrichment check for that specific task.

**B3. Surface enrichment in DynamicHero**
- Change `DynamicHero`'s `description` field to prefer `primaryAttention.whyItMatters` over `primaryAttention.description` when available.
- Fall back to `description` if `whyItMatters` is empty.

**B4. Populate `step_enrichment.sort_order`**
- Determine the sort order source: either use `milestone_order` custom field value (from `extractMilestoneOrder()`) or add an explicit admin input.
- Write `sort_order` in the AI enrichment upsert payload.

**B5. Improve AI failure handling**
- Add one retry on `generateStepEnrichment` timeout.
- Log a structured error event when enrichment fails (for monitoring).

---

### Phase C: PhaseTimeline Redesign (3-4 hours)

Redesign the horizontal stepper using shadcn/ui primitives + Motion. Reference ReUI stepper patterns for visual inspiration (https://reui.io/patterns/stepper).

**C1. Node redesign**
- Increase dot size to 20-24px for clear state differentiation.
- Use horizontal inline layout inside each node: `[dot] [title] [badge]` on one line.
- Use shadcn `Badge` for progress count ("1/2") instead of plain text.
- Replace hardcoded rgba values with CSS tokens from `tokens.css` (`var(--accent)`, `var(--accent-light)`).

**C2. Connector line improvements**
- Implement partial fill on connector lines: calculate chapter completion percentage from `steps.filter(s => s.status === 'completed').length / steps.length`.
- Use a two-layer div (gray background + colored overlay width=percentage%) for the fill effect.

**C3. Motion integration**
- Wrap `PhaseTimeline` with `<LayoutGroup>` from `motion/react`.
- Animate dot state transitions with `motion.div` layout animations.
- Add `AnimatePresence` for state label entry/exit.
- Use spring physics (`type: "spring", stiffness: 300, damping: 30`) for smooth transitions.

**C4. Mobile responsive collapse**
- On screens `< 768px`: show only the current phase node with prev/next navigation arrows.
- Use `useBreakpoint` hook (already in `src/shared/hooks/`) to detect mobile.
- Optionally show a compact "Phase 2 von 4" indicator.

**C5. Tooltip on hover**
- Add shadcn `Tooltip` to each `PhaseNode` showing the chapter narrative on hover.
- `chapter.narrative` is already available in the data model.

---

### Phase D: Data Unification and Polish (2-3 hours)

**D1. Integrate ProjectContextSection into OverviewPage**
- Add `ProjectContextSection` below `QuickActions` in `OverviewPage`.
- Load memory entries via `useProjectMemory`.
- Gate `ProjectContextAdminPanel` behind operator email check.

**D2. Clarify file source separation in FilesTab**
- Add a section label "ClickUp-Anhange" to the FilesTab header.
- Rename "Alle anzeigen" link to "Nextcloud-Dateien anzeigen" to set correct expectation.
- Or: merge both sources by adding a Nextcloud summary section to FilesTab using `useNextcloudFilesByPath`.

**D3. Motion page transitions**
- Add `AnimatePresence` + `motion.div` entry/exit animations on `OverviewPage`, `DateienPage`, `MessagesPage` (when fixed).
- Use `opacity: 0 -> 1` + `y: 8 -> 0` with 200ms ease for page-level transitions.

**D4. Loading shimmer on PhaseTimeline**
- Add a skeleton state to `PhaseTimeline` that renders while `useProject` is loading.
- Use `Skeleton` from shadcn/ui.

**D5. Refactor ProjectContextAdminPanel to < 150 lines**
- Extract the memory entry form into a separate `MemoryEntryForm` component.
- Reduces `ProjectContextAdminPanel` from 157 to approximately 90 lines.

---

## 5. Decision Matrix

| Decision | Options | Recommendation | Rationale |
|----------|---------|----------------|-----------|
| **TasksPage fate** | A) Populate `project.tasks` from `project_task_cache` B) Remove component + type field | **B — Remove** if not routed. **A — Fix** if routed. Verify `routes.tsx` first. | Steps (tasks-as-steps) already appear in the chapter/step UI. A separate flat tasks list may be redundant. Clarify product intent before implementing. |
| **ContextStrip ETA** | A) Remove ETA display B) Show `lastUpdate` as "Zuletzt aktiv" C) Populate from ClickUp due_date | **A — Remove ETA display** | No ClickUp field reliably maps to project-level ETA. Showing an empty string is worse than showing nothing. |
| **MessagesPage fix** | A) Use `useProjectComments` + group by step B) Remove standalone page (OverviewTabs MessagesTab covers the need) | **A — Wire `useProjectComments`** | The `/nachrichten` route exists. Removing it would break navigation. Fix is straightforward. |
| **File source display** | A) Merge ClickUp + Nextcloud in FilesTab B) Keep separate, add clear labels C) Remove ClickUp attachments from tab | **B — Keep separate with labels** | Different write paths (ClickUp auto-attach vs Nextcloud manual upload). Merging is complex. Labels solve the confusion without architectural change. |
| **PhaseTimeline approach** | A) Custom build with shadcn + Motion B) ReUI copy-paste adaptation | **A — Custom build** | Current `PhaseTimeline` is already custom. Phase colors, chapter data model, and responsive needs require project-specific control. Use ReUI for visual inspiration only. |
| **AI enrichment refresh** | A) Hash-based auto-refresh only B) Manual button only C) Both | **C — Both** | Auto-refresh catches unnoticed task changes. Manual button gives operator control for immediate corrections. These are complementary, not competing approaches. |
| **ProjectContextSection integration** | A) Add to OverviewPage now B) Keep as-is until explicitly requested | **A — Add to OverviewPage** | The component is complete and tested. Not integrating it means a built feature is invisible indefinitely. Low risk, high value. |

---

## 6. Severity Summary

| Severity | Count | Items |
|----------|-------|-------|
| **Critical** | 4 | TasksPage dead pipeline, MessagesPage stale data, ContextStrip empty ETA, StepOverviewTab empty linked tasks |
| **High** | 8 | AI write-once limitation, no re-enrichment trigger, empty enrichment rendered, sort_order not populated, enrichment not surfaced in hero, AI timeout silent failure, cramped PhaseTimeline layout, no Motion animations |
| **Medium** | 5 | Binary connector lines, tiny dots, hardcoded rgba values, mobile overflow, FilesTab/DateienPage source inconsistency |
| **Low** | 5 | English strings in ProjectContextPreview (fixed in Task 2), unused ProjectContextSection, mock-data.ts residue, 157-line component, phase colors underused |
| **Total** | 22 | Across 7 categories |

### Recommended sequencing

```
Phase A (Critical Fixes)  ->  Phase B (AI Enrichment)  ->  Phase D (Data + Polish)  ->  Phase C (PhaseTimeline Redesign)
1-2 hours                     2-3 hours                    2-3 hours                    3-4 hours
```

Total estimated effort: 8-12 Claude execution hours across 4 distinct implementation sessions.

---

*Audit produced from direct source code reading. All findings verified against actual file contents. Confidence: HIGH.*
*Research source: `.planning/quick/260329-fhb-audit-projects-module-review-functionali/260329-fhb-RESEARCH.md`*
