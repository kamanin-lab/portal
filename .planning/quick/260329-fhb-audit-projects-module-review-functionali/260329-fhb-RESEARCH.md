# Projects Module Audit - Research

**Researched:** 2026-03-29
**Domain:** Projects module (src/modules/projects/) -- full codebase audit
**Confidence:** HIGH (direct source code reading, not inference)

## Summary

The Projects module is a fully implemented, production-quality module with ~50 files spanning types, hooks, lib, components, and pages. It renders a project experience view with phases (chapters), steps within each phase, AI-enriched descriptions, file management via Nextcloud, comments via ClickUp comment_cache, and a project memory system. The architecture is sound -- data flows from Supabase cache tables through a clean transform layer into a typed `Project` model consumed by all UI components.

**Primary concerns identified:**
1. The **PhaseTimeline** (horizontal stepper) is functional but visually basic -- it uses small dots and minimal text crammed into a flex row, with no interactive expansion or progress visualization
2. **AI Enrichment** works well for generating `why_it_matters` and `what_becomes_fixed` but only runs on first sync -- there is no re-generation mechanism or manual trigger
3. The **MessagesPage** reads from mock-style `step.messages[]` array (from mock data or old transforms), not from the live `comment_cache` -- the OverviewTabs MessagesTab correctly uses `useProjectComments` but the standalone page does not
4. The **TasksPage** reads from `project.tasks[]` which is always set to an empty array `[]` in the transform -- the tasks page will always show "Keine Aufgaben vorhanden"
5. Several components mix English and German text (e.g., ProjectContextPreview has "Known context", "Useful context already agreed or safe to share")

**Primary recommendation:** Fix the broken TasksPage data pipeline, unify message sources across views, and redesign the PhaseTimeline with a proper stepper component.

## Module Architecture Map

### Data Flow
```
ClickUp API
    |
    v
fetch-project-tasks (Edge Function)
    |  - Fetches all tasks from ClickUp list
    |  - Filters by visibility custom field
    |  - Upserts into project_task_cache
    |  - Generates AI enrichment (Claude Haiku) for new tasks -> step_enrichment
    v
Supabase Tables
    |  - project_config (project metadata)
    |  - chapter_config (phases/chapters)
    |  - project_task_cache (tasks = steps in project context)
    |  - step_enrichment (AI-generated descriptions)
    |  - comment_cache (comments from ClickUp)
    |  - project_quick_actions (configurable action buttons)
    |  - project_memory_entries (project context memory)
    |  - project_access (user -> project mapping)
    v
useProject hook
    |  - Fetches all 6 tables in parallel
    |  - Calls transformToProject() to build typed Project model
    |  - Sets up Realtime subscription on project_task_cache
    |  - Triggers background refresh via fetch-project-tasks on mount
    v
Project model -> UI components
```

### Component Tree
```
UebersichtPage (route: /projekte/*)
  -> useProject()
  -> OverviewPage
      -> ContextStrip
      |    -> PhaseTimeline        <-- THE 4-STEP PROGRESS LINE
      |    |    -> PhaseNode (x4)  <-- Individual phase dots
      |    -> Narrative text
      |    -> Team status line
      -> DynamicHero               <-- Priority-based hero card
      -> AttentionList             <-- Additional review items
      -> QuickActions              <-- Action cards (3 columns)
      -> OverviewTabs
      |    -> ActivityFeed (Aktivitat tab)
      |    -> FilesTab (Dateien tab)
      |    -> MessagesTab (Nachrichten tab)  <-- Uses useProjectComments (LIVE)
      -> SchritteSheet             <-- Chapter drill-down
      -> StepSheet -> StepDetail   <-- Step detail with tabs
      |    -> StepOverviewTab
      |    |    -> StepActionBar   <-- Approve/Request changes
      |    |    -> Expandable sections (AI enrichment content)
      |    -> StepFilesTab
      |    -> StepDiscussionTab    <-- Uses TaskComments (LIVE)
      -> MessageSheet              <-- Send message (uses PostComment)
      -> UploadSheet               <-- File upload
      -> NewTicketDialog           <-- Create task in project

NachrichtenPage (route: /nachrichten)
  -> useProject()
  -> MessagesPage                  <-- Uses step.messages[] (MOCK/STALE)

DateienPage (route: /dateien)
  -> useProject()
  -> FilesPage
      -> FolderGrid -> FolderCard, FileRow
      -> FolderView -> FileRow, FileUpload, CreateFolderInput
```

## Detailed Findings

### 1. PhaseTimeline (The 4-Step Progress Line)

**Location:** `src/modules/projects/components/overview/PhaseTimeline.tsx` + `PhaseNode.tsx`

**Current implementation:**
- Horizontal flex row with PhaseNode buttons connected by thin 2px lines
- Each PhaseNode shows: a status dot (14-15px), chapter title, progress fraction (e.g., "1/2"), and optional state label ("Abgeschlossen" / "Aktuell")
- Three states: completed (green checkmark dot), current (purple pulsing dot), upcoming (gray dot)
- Connector lines turn green when previous chapter is completed
- Clicking a PhaseNode opens the SchritteSheet (chapter drill-down)
- On mobile, nodes shrink but do not collapse -- can overflow horizontally

**UX problems identified:**
1. **Too cramped with 4+ phases** -- each node shows title + progress + label vertically, competing for horizontal space
2. **No visual progress indication** -- the line between nodes is binary (gray or green), no partial fill
3. **Dots are tiny** (14-15px) -- hard to distinguish states at a glance
4. **No step count or task summary visible** -- you see "1/2" but not what those steps are
5. **No animation on state transitions** -- despite Motion being in the stack, the timeline is static
6. **Current phase indicator** uses inline styles with hardcoded rgba values instead of CSS tokens
7. **Mobile overflow** -- the component uses `overflow-x-auto` but nodes don't collapse into a more compact form

**What works well:**
- Clean state derivation from chapter data
- The pulse animation on current phase is a nice touch
- Click interaction to open chapter detail

### 2. AI Enrichment System

**Location:** `supabase/functions/fetch-project-tasks/index.ts` (lines 148-207)

**How it works:**
- When `fetch-project-tasks` runs (triggered on mount via `useProject` background refresh), it checks which tasks don't have entries in `step_enrichment`
- For new tasks, it batches them (10 at a time) and calls Claude Haiku (`claude-haiku-4-5-20251001`) via the Anthropic API
- The prompt asks for German-language `why_it_matters` and `what_becomes_fixed` for each task
- Results are upserted into `step_enrichment` table with `onConflict: "clickup_task_id", ignoreDuplicates: true`

**How enrichment is displayed:**
- `transformToProject()` merges enrichment data into each Step: `step.whyItMatters` and `step.whatBecomesFixed`
- `StepOverviewTab` shows these as expandable sections ("Warum ist das wichtig?" and "Was wird damit festgelegt?")
- `DynamicHero` shows `primaryAttention.description` which comes from `step.description` (the ClickUp description, NOT the AI enrichment)
- `AttentionList` shows `item.portalCta || item.title` -- also not showing AI enrichment

**Issues found:**
1. **No re-generation mechanism** -- once enrichment exists, it's never updated even if the task name/description changes. The `ignoreDuplicates: true` means existing records are never overwritten.
2. **No manual trigger for re-enrichment** -- there's no admin button to force re-generation
3. **Empty enrichment is silently accepted** -- if AI returns empty strings, they're saved and displayed as empty expandable sections
4. **30s timeout on AI call** -- could fail silently on slow responses; only logs a warning
5. **Enrichment sort_order** -- the `step_enrichment` table has a `sort_order` column but it's never populated by the AI generation function (defaults to 0), yet the transform uses it for sorting tasks within a chapter
6. **AI enrichment is only visible inside StepOverviewTab** -- the overview page itself does not surface the AI-generated content in any meaningful way (not in hero, not in attention list)

**What works well:**
- Clean separation between cache (project_task_cache) and enrichment (step_enrichment)
- Batch processing to avoid rate limits
- Graceful degradation when ANTHROPIC_API_KEY is missing

### 3. Tab Navigation (OverviewTabs)

**Location:** `src/modules/projects/components/overview/OverviewTabs.tsx`

**Tabs present:**
1. **Aktivitat** (ActivityFeed) -- FUNCTIONAL. Merges status change events (from project.updates) with comment events (from useProjectComments). Shows paginated feed with status icons.
2. **Dateien** (FilesTab) -- PARTIALLY FUNCTIONAL. Shows files from `step.files[]` (ClickUp attachments), limited to 8 items. Has a "show all" link navigating to `/dateien`. Does NOT show Nextcloud files -- those are only on the dedicated DateienPage.
3. **Nachrichten** (MessagesTab) -- FUNCTIONAL. Uses `useProjectComments` for live data from comment_cache. Shows comments with author, timestamp, and step context.

**Issues:**
- FilesTab only shows ClickUp attachment files, not Nextcloud files. The user might expect to see all project files here.
- The "show all" link on FilesTab navigates to `/dateien` which shows Nextcloud files -- different data source, potentially confusing.

### 4. Broken/Incomplete Features

#### 4a. TasksPage is non-functional
**Location:** `src/modules/projects/components/tasks/TasksPage.tsx`

The component reads from `project.tasks` which is the `ProjectTask[]` array. However, in `transformToProject()` (line 229), this is hardcoded to:
```typescript
tasks: [] as ProjectTask[],
```
The transform never populates this array. The original mock data had tasks, but the live transform does not map any data into it. Result: the tasks page always shows "Keine Aufgaben vorhanden."

**Impact:** The TasksPage component exists but is dead code in production. It's not clear if it's even routed to -- it doesn't appear in the routes file. It seems like an orphaned component from earlier design iterations.

#### 4b. MessagesPage uses stale data source
**Location:** `src/modules/projects/components/messages/MessagesPage.tsx`

This page reads `step.messages[]` from the Project model. In the transform, `messages` is always `[]` (line 165):
```typescript
messages: [],
```
Only mock data had populated messages. The live comment data flows through `comment_cache` -> `useProjectComments` hook, which is used by `OverviewTabs/MessagesTab` and `StepDiscussionTab`, but NOT by this standalone MessagesPage.

**Impact:** The `/nachrichten` route shows "Noch keine Nachrichten." even when comments exist. The OverviewTabs Nachrichten tab works correctly because it uses the right hook.

#### 4c. ProjectContextPreview has English text
**Location:** `src/modules/projects/components/overview/ProjectContextPreview.tsx`

Contains hardcoded English strings:
- "Known context"
- "Useful context already agreed or safe to share"
- "This preview is filtered for client-safe context only. Internal team notes stay off overview surfaces."

Violates the "All UI text in German" rule from CLAUDE.md.

#### 4d. StepOverviewTab linked tasks section reads from empty array
The `getTasksForStep()` helper searches `project.tasks` which is always `[]`. The "Verknuepfte Aufgaben" section will always be empty even if tasks are linked.

#### 4e. ContextStrip shows ETA that's always empty
**Location:** `src/modules/projects/components/overview/ContextStrip.tsx` (line 31)

Shows `ETA: {teamWorkingOn.eta}` but the eta field is always empty string in the transform (line 238: `eta: ''`). This renders as "ETA: " with nothing after it.

### 5. Project Memory System

**Status:** Fully functional feature.

Components: `ProjectContextSection` (client view), `ProjectContextAdminPanel` (operator view), `ProjectMemorySheet` (create/edit form). Uses `useProjectMemory` hook with `manage-project-memory` Edge Function for writes.

**Architecture:** Clean scoped memory system with client/project scope, 7 categories, 3 visibility levels (internal/shared/client_visible), and operator gating via `VITE_MEMORY_OPERATOR_EMAILS` env var.

**Note:** ProjectContextSection and ProjectContextAdminPanel are defined but NOT rendered in the current OverviewPage. They exist as complete components but are not integrated into the page layout.

### 6. File Management (Nextcloud Integration)

**Status:** Fully functional.

The DateienPage works correctly with full Nextcloud WebDAV integration: folder browsing, file download, file upload, folder creation. Uses path-based navigation with breadcrumbs.

## Better Stepper/Progress Components

### Recommendation: Build a custom stepper using shadcn/ui primitives + Motion

After researching available options, there is no official shadcn/ui Stepper component. The best approach for this project:

### Option A: ReUI Stepper Patterns (copy-paste)
**Source:** https://reui.io/patterns/stepper
- 15 pre-built stepper patterns compatible with shadcn/ui
- Includes horizontal progress bar, segmented bar, icons, badges
- Copy-ready for React + Tailwind
- Requires adaptation to portal design tokens

### Option B: Custom Stepper with shadcn Primitives
Build using existing shadcn/ui components (Badge, Button, Tooltip) + Motion for animations:

**Recommended design for the PhaseTimeline replacement:**
```
[=== Konzept ===]---[=== Struktur ===]---[=== Design ===]---[=== Entwicklung ===]
    (2/2) done         (0/2) current        (0/1) upcoming      (0/2) upcoming
```

Key improvements over current PhaseTimeline:
1. **Wider nodes** with horizontal layout (icon + title + progress inline)
2. **Progress fill** on connector lines (partial fill showing overall chapter completion)
3. **Step count badges** using shadcn Badge
4. **Motion transitions** on state changes (`motion/react` LayoutGroup)
5. **Responsive collapse** -- on mobile, show only current phase with prev/next navigation
6. **Tooltip on hover** showing chapter narrative
7. **Active phase highlight** using phase colors from `phase-colors.ts`

### Option C: nyxbui Timeline (21st.dev)
**Source:** https://21st.dev/community/components/nyxbui/timeline
- Vertical timeline with status indicators (done, current, error)
- Good for a detailed project timeline view (secondary view)
- NOT suitable as the primary horizontal phase indicator
- Could complement the horizontal stepper as a "full timeline" view

### Option D: Stepperize Library
**Source:** https://github.com/damianricobelli/stepperize
- Type-safe step-by-step workflow library (< 1kB gzipped)
- More suited for form wizards than project progress display
- NOT recommended for this use case

**Verdict:** Use Option B (custom stepper) as primary approach. The current PhaseTimeline is already custom -- it just needs a design upgrade. The project's design tokens, phase colors, and chapter data model are well-structured for this. Optionally reference ReUI patterns for visual inspiration.

## Prioritized Action Items

### Critical (Broken features)
1. **Fix TasksPage data pipeline** -- either populate `project.tasks` in the transform, or remove the component if it's not needed
2. **Fix MessagesPage data source** -- replace `step.messages` reading with `useProjectComments` hook
3. **Fix ContextStrip ETA display** -- either populate eta or remove the display
4. **Translate ProjectContextPreview** to German

### High (UX improvements)
5. **Redesign PhaseTimeline** -- wider nodes, progress fill on connectors, Motion animations, responsive collapse
6. **Surface AI enrichment in overview** -- show `whyItMatters` in the DynamicHero or AttentionList, not just buried in StepOverviewTab
7. **Integrate ProjectContextSection** into OverviewPage (it's built but not rendered)

### Medium (Enhancements)
8. **Add re-enrichment mechanism** -- button to regenerate AI descriptions, or auto-update when task name changes
9. **Unify FilesTab with Nextcloud** -- show Nextcloud files in overview tab, not just ClickUp attachments
10. **Populate step_enrichment.sort_order** -- either from milestone_order or from a manual admin input

### Low (Polish)
11. Add Motion page transitions between project views
12. Add loading shimmer on PhaseTimeline during data fetch
13. Consider adding the nyxbui vertical timeline as an alternative "full project view"

## Common Pitfalls

### Pitfall 1: Mock Data Residue
**What goes wrong:** Components reference fields populated in mock-data.ts but empty in live transforms
**Why it happens:** The module was built with mock data first, then live data was wired in -- but not all paths were updated
**How to avoid:** Audit every field in the Project type to verify it's populated in transformToProject()
**Warning signs:** Features that work in development (with mock data?) but show empty in production

### Pitfall 2: Dual File Sources
**What goes wrong:** FilesTab shows ClickUp attachments, DateienPage shows Nextcloud files -- users see different files in different places
**Why it happens:** Two separate file storage systems (ClickUp attachments on tasks vs Nextcloud project folders)
**How to avoid:** Decide on a single source of truth for files, or clearly label which is which
**Warning signs:** User reports "I uploaded a file but can't find it"

### Pitfall 3: Enrichment Staleness
**What goes wrong:** AI enrichment generated for old task names/descriptions persists after task updates
**Why it happens:** `ignoreDuplicates: true` prevents overwriting existing enrichments
**How to avoid:** Add a `last_enriched_at` timestamp and re-run enrichment when task was updated after last enrichment

## Project Constraints (from CLAUDE.md)

- All UI text in German (violated by ProjectContextPreview)
- Components < 150 lines (most comply; ProjectContextAdminPanel is 157 lines)
- ContentContainer width="narrow" on all app pages (compliant)
- shadcn/ui for all new UI primitives (compliant)
- Motion (v12) available for animations (underutilized in this module)
- mapStatus() for status comparisons (project module uses its own mapStepStatus() which is appropriate)

## Sources

### Primary (HIGH confidence)
- Direct source code reading of all ~50 files in src/modules/projects/
- Direct reading of supabase/functions/fetch-project-tasks/index.ts
- Direct reading of routes.tsx for routing confirmation

### Secondary (MEDIUM confidence)
- [ReUI Stepper Patterns](https://reui.io/patterns/stepper) - 15 shadcn-compatible stepper patterns
- [nyxbui Timeline](https://21st.dev/community/components/nyxbui/timeline) - Vertical timeline component
- [shadcn-stepper](https://github.com/damianricobelli/shadcn-stepper) - Community stepper (last updated Oct 2025)
- [Stepperize](https://github.com/damianricobelli/stepperize) - Type-safe step workflow library
- [shadcn/ui Stepper Discussion](https://github.com/shadcn-ui/ui/discussions/1422) - Official feature request (not yet implemented)

## Metadata

**Confidence breakdown:**
- Module architecture: HIGH - complete source code audit
- Broken features: HIGH - verified by reading transforms and components
- AI Enrichment: HIGH - read the full Edge Function implementation
- Stepper alternatives: MEDIUM - web research, not hands-on testing
- UX recommendations: MEDIUM - based on code reading, not visual inspection

**Research date:** 2026-03-29
**Valid until:** 2026-04-15 (stable codebase, findings based on current code)
