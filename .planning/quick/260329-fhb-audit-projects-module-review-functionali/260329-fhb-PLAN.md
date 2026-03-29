---
phase: quick
plan: 260329-fhb
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/audits/projects-module-audit.md
  - src/modules/projects/components/overview/ProjectContextPreview.tsx
autonomous: true
requirements: [AUDIT-01]

must_haves:
  truths:
    - "A comprehensive audit document exists cataloging every broken, incomplete, and improvable aspect of the Projects module"
    - "A strategy section exists with prioritized recommendations, effort estimates, and proposed implementation phases"
    - "All English text in ProjectContextPreview.tsx is replaced with German equivalents"
  artifacts:
    - path: "docs/audits/projects-module-audit.md"
      provides: "Complete module audit with findings, severity ratings, and improvement strategy"
      min_lines: 150
    - path: "src/modules/projects/components/overview/ProjectContextPreview.tsx"
      provides: "German-only UI text (i18n compliance fix)"
  key_links:
    - from: "docs/audits/projects-module-audit.md"
      to: "260329-fhb-RESEARCH.md"
      via: "Research findings inform audit severity ratings and recommendations"
      pattern: "Severity|Priority|Recommendation"
---

<objective>
Produce a formal audit document for the Projects module that catalogs all broken features, data pipeline issues, UX shortcomings, and AI enrichment limitations — then provide a prioritized strategy for addressing them. Additionally, fix the low-hanging German translation violation as a quick win.

Purpose: The Projects module has significant hidden issues (dead data pipelines, mock data residue, underutilized AI enrichment) that need formal documentation before any implementation work begins. This audit becomes the single source of truth for future planning.

Output: `docs/audits/projects-module-audit.md` (audit + strategy), patched `ProjectContextPreview.tsx` (German text)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260329-fhb-audit-projects-module-review-functionali/260329-fhb-RESEARCH.md

Key source files to reference during audit (read, do not modify except ProjectContextPreview.tsx):
@src/modules/projects/lib/transforms-project.ts
@src/modules/projects/components/overview/PhaseTimeline.tsx
@src/modules/projects/components/overview/PhaseNode.tsx
@src/modules/projects/components/overview/ContextStrip.tsx
@src/modules/projects/components/overview/ProjectContextPreview.tsx
@src/modules/projects/components/overview/OverviewTabs.tsx
@src/modules/projects/components/overview/DynamicHero.tsx
@src/modules/projects/components/overview/AttentionList.tsx
@src/modules/projects/components/messages/MessagesPage.tsx
@src/modules/projects/components/tasks/TasksPage.tsx
@src/modules/projects/components/steps/StepOverviewTab.tsx
@src/modules/projects/hooks/useProject.ts
@src/modules/projects/types/project.ts
@supabase/functions/fetch-project-tasks/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write comprehensive Projects module audit document</name>
  <files>docs/audits/projects-module-audit.md</files>
  <action>
Create `docs/audits/` directory if it does not exist, then write `projects-module-audit.md`.

The document must have two major parts: AUDIT FINDINGS and IMPROVEMENT STRATEGY.

**Part 1: Audit Findings**

Read each source file listed in the context section. For every finding, document:
- Component/file path
- What it does (brief)
- Current status (Working / Broken / Partial / Unused)
- Issue description (specific, with line references where helpful)
- Severity (Critical / High / Medium / Low)
- Evidence (code snippets or specific field names showing the problem)

Organize findings into these categories:

1. **Broken Data Pipelines** (Critical severity)
   - TasksPage: `project.tasks` hardcoded to `[]` in transforms-project.ts — page is dead code
   - MessagesPage: reads `step.messages[]` (always `[]`) instead of `useProjectComments` — standalone page broken while OverviewTabs MessagesTab works
   - ContextStrip ETA: `teamWorkingOn.eta` always empty string — renders "ETA: " with no value
   - StepOverviewTab linked tasks: `getTasksForStep()` searches `project.tasks` which is always `[]`

2. **AI Enrichment Limitations** (High severity)
   - Write-once pattern: `ignoreDuplicates: true` prevents re-enrichment when tasks change
   - No manual re-trigger mechanism exists
   - Empty enrichment silently saved and displayed as empty expandable sections
   - `step_enrichment.sort_order` never populated (defaults to 0)
   - AI content buried in StepOverviewTab — not surfaced in DynamicHero or AttentionList
   - 30s timeout on AI call with only a warning log on failure

3. **PhaseTimeline UX Issues** (High severity)
   - Cramped layout with 4+ phases (title + progress + label competing for horizontal space)
   - No partial progress fill on connector lines (binary gray/green only)
   - Tiny dots (14-15px) — states hard to distinguish at a glance
   - No Motion animations despite Motion being in the stack
   - Hardcoded rgba values instead of CSS tokens for current phase indicator
   - No mobile collapse — uses overflow-x-auto but nodes don't adapt

4. **Internationalization Violations** (Medium severity)
   - ProjectContextPreview.tsx contains English strings: "Known context", "Useful context already agreed or safe to share", disclaimer text

5. **Data Source Inconsistencies** (Medium severity)
   - FilesTab shows ClickUp attachments only; DateienPage shows Nextcloud files only — users see different files in different places
   - "Alle anzeigen" link from FilesTab navigates to DateienPage which has a completely different data source

6. **Unused/Unintegrated Components** (Low severity)
   - ProjectContextSection and ProjectContextAdminPanel: fully built but not rendered in OverviewPage
   - ProjectContextPreview: rendered but has English text
   - Mock data residue: `mock-data.ts` still exists and some type fields are only populated there

7. **Code Quality Notes**
   - ProjectContextAdminPanel at 157 lines (slightly over 150 line guideline)
   - Phase colors system well-structured but only used in PhaseNode
   - Motion library available but completely unused in this module

**Part 2: Improvement Strategy**

Organize into implementation phases with effort estimates (Claude execution time):

**Phase A: Critical Fixes (1-2 hours)**
- Fix or remove TasksPage data pipeline (decide: populate `project.tasks` from `project_task_cache` in transform, or remove orphaned component)
- Fix MessagesPage to use `useProjectComments` hook instead of `step.messages`
- Fix ContextStrip ETA (populate from project data or remove display)
- Translate ProjectContextPreview to German (done in Task 2 of this plan)
- Fix StepOverviewTab linked tasks

**Phase B: AI Enrichment Improvements (2-3 hours)**
- Replace `ignoreDuplicates` with upsert-on-change (compare task hash)
- Add `last_enriched_at` timestamp column
- Surface enrichment content in DynamicHero and AttentionList
- Handle empty enrichment gracefully (hide section instead of showing empty)
- Add manual re-enrichment trigger (admin action)

**Phase C: PhaseTimeline Redesign (3-4 hours)**
- Custom stepper using shadcn primitives (Badge, Button, Tooltip) + Motion
- Wider nodes with inline layout (icon + title + progress)
- Partial fill on connector lines showing chapter completion percentage
- Motion transitions on state changes (LayoutGroup)
- Responsive collapse on mobile (show current phase + prev/next nav)
- Use CSS tokens from tokens.css instead of hardcoded values
- Reference ReUI stepper patterns for visual inspiration

**Phase D: Data Unification and Polish (2-3 hours)**
- Integrate ProjectContextSection into OverviewPage
- Unify FilesTab to show both ClickUp and Nextcloud files (or clearly label sources)
- Add Motion page transitions
- Loading shimmer on PhaseTimeline
- Populate step_enrichment.sort_order

Include a decision matrix at the end:

| Decision | Options | Recommendation | Rationale |
|----------|---------|----------------|-----------|
| TasksPage | Fix data pipeline vs Remove component | Needs investigation — is there a route to it? If no route, remove. If routed, fix. | Verify in routes.tsx |
| File sources | Merge both into FilesTab vs Keep separate with labels | Keep separate, add clear labels | Different write paths (ClickUp auto-attach vs Nextcloud manual upload) |
| PhaseTimeline approach | Custom build vs Library | Custom build with shadcn primitives + Motion | No official shadcn stepper; existing component is already custom; clean data model supports it |
| AI enrichment refresh | Hash-based auto-refresh vs Manual button vs Both | Both — auto-detect changes + admin manual trigger | Covers both automated staleness detection and on-demand needs |

Format the entire document in clean Markdown with a table of contents at the top.
  </action>
  <verify>
    <automated>test -f "G:/01_OPUS/Projects/PORTAL/docs/audits/projects-module-audit.md" && wc -l "G:/01_OPUS/Projects/PORTAL/docs/audits/projects-module-audit.md" | awk '{if ($1 >= 150) print "PASS: " $1 " lines"; else print "FAIL: only " $1 " lines"}'</automated>
  </verify>
  <done>Audit document exists at docs/audits/projects-module-audit.md with minimum 150 lines, covering all 7 finding categories and 4 improvement phases with effort estimates and a decision matrix</done>
</task>

<task type="auto">
  <name>Task 2: Fix German translation in ProjectContextPreview.tsx</name>
  <files>src/modules/projects/components/overview/ProjectContextPreview.tsx</files>
  <action>
Read `src/modules/projects/components/overview/ProjectContextPreview.tsx` and replace all English-language strings with German equivalents. This is a CLAUDE.md rule ("All UI text in German — zero English in user-facing strings").

Specific replacements:
- "Known context" -> "Bekannter Kontext"
- "Useful context already agreed or safe to share" -> "Bereits abgestimmter oder freigegebener Kontext"
- "This preview is filtered for client-safe context only. Internal team notes stay off overview surfaces." -> "Diese Vorschau zeigt nur kundenrelevanten Kontext. Interne Teamnotizen werden hier nicht angezeigt."

Scan the entire file for any other English strings and translate those as well. Do NOT change any logic, imports, component structure, or styling — only text content.
  </action>
  <verify>
    <automated>grep -n "Known context\|Useful context\|Internal team notes\|client-safe\|stay off" "G:/01_OPUS/Projects/PORTAL/src/modules/projects/components/overview/ProjectContextPreview.tsx" && echo "FAIL: English strings still present" || echo "PASS: No English strings found"</automated>
  </verify>
  <done>ProjectContextPreview.tsx contains zero English user-facing strings. All text is in German. Component renders identically except for language.</done>
</task>

</tasks>

<verification>
1. `docs/audits/projects-module-audit.md` exists, has 150+ lines, contains all severity categories
2. `ProjectContextPreview.tsx` has no English user-facing text (grep confirms)
3. `npm run build` still passes (no broken imports or syntax from the translation fix)
</verification>

<success_criteria>
- Audit document is comprehensive enough to serve as the sole planning input for future Projects module improvement phases
- Every broken feature from the research is documented with severity, evidence, and recommended fix
- A clear phased improvement strategy exists with effort estimates
- The quick-win German translation fix is applied and verified
- Build passes with the translation change
</success_criteria>

<output>
After completion, create `.planning/quick/260329-fhb-audit-projects-module-review-functionali/260329-fhb-SUMMARY.md`
</output>
