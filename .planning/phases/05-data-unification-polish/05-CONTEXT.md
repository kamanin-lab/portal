# Phase 5: Data Unification & Polish - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Fix the project files pipeline so it reads from Nextcloud (not broken ClickUp attachments), auto-create Nextcloud folders per task on ClickUp task creation, add Motion tab transitions, and show skeleton state for PhaseTimeline during loading. DATA-01 (ProjectContextSection) and DATA-05 (ProjectContextAdminPanel refactor) are deferred to admin dashboard scope.

</domain>

<decisions>
## Implementation Decisions

### FilesTab Nextcloud Migration (DATA-02)
- **D-01:** OverviewTabs FilesTab switches from ClickUp `task.attachments` (always empty) to Nextcloud via `useNextcloudFiles` hook. Shows last 8 recent files from the current project's Nextcloud folder.
- **D-02:** Files MUST be scoped to the current project's Nextcloud root path (`project_config.nextcloud_root_path`), not all Nextcloud files.
- **D-03:** Click on a file triggers direct download via `nextcloud-files` Edge Function. No navigation to DateienPage.
- **D-04:** No data source label needed — users don't need to know files come from Nextcloud.

### Task Folder Auto-Creation (expanded scope beyond DATA-02)
- **D-05:** When a new task is created in ClickUp (via webhook), automatically create a corresponding folder in Nextcloud inside the chapter's folder. Example: `Projekt_MBM/01_Konzept/Moodboard/`
- **D-06:** Folder naming: task name only (e.g., `Moodboard/`), no order prefix.
- **D-07:** Trigger: ClickUp task creation event (via existing `clickup-webhook` Edge Function).
- **D-08:** In task detail modal (StepFilesTab), show files from the task's corresponding Nextcloud folder (matched by task name → folder name).

### Tab Transitions (DATA-03)
- **D-09:** Claude's Discretion — add Motion fade+slide animation (opacity 0→1, y 8→0) when switching between OverviewTabs (Aktivität/Dateien/Nachrichten). Use existing Motion patterns from Phase 4.

### PhaseTimeline Loading Skeleton (DATA-04)
- **D-10:** Claude's Discretion — show shadcn Skeleton placeholder while `useProject` is loading, matching the PhaseTimeline stepper shape. Never show blank space or broken layout.

### Claude's Discretion
- Tab transition animation duration and easing (D-09)
- PhaseTimeline skeleton shape — whether dots, bars, or full stepper outline (D-10)
- StepFilesTab fallback behavior when no matching Nextcloud folder exists (D-08)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Architecture
- `docs/ARCHITECTURE.md` — system architecture, data flow diagrams
- `docs/system-context/DATABASE_SCHEMA.md` — database schema (project_config, project_task_cache)
- `docs/audits/projects-module-audit.md` — original PRD with all 22 findings

### Nextcloud Integration
- `supabase/functions/nextcloud-files/` — WebDAV proxy Edge Function (list, download, upload, mkdir)
- `src/modules/projects/hooks/useNextcloudFiles.ts` — existing Nextcloud files hook
- `src/modules/projects/hooks/useNextcloudFilesByPath.ts` — path-based Nextcloud query
- `src/modules/projects/hooks/useUploadFileByPath.ts` — file upload hook
- `src/modules/projects/hooks/useCreateFolder.ts` — folder creation hook

### ClickUp Webhook
- `supabase/functions/clickup-webhook/` — webhook handler for task events
- `docs/CLICKUP_INTEGRATION.md` — integration notes

### PhaseTimeline (Phase 4 output)
- `src/modules/projects/components/overview/PhaseTimeline.tsx` — current stepper implementation
- `src/modules/projects/components/overview/PhaseNode.tsx` — phase node with Motion animations
- `src/modules/projects/components/overview/PhaseConnector.tsx` — animated connectors

### Tab Components
- `src/modules/projects/components/overview/OverviewTabs.tsx` — current tabs (no animation)
- `src/modules/projects/components/overview/FilesTab.tsx` — current broken FilesTab (ClickUp attachments)

### Existing Files Module
- `src/modules/projects/components/files/FilesPage.tsx` — full DateienPage with Nextcloud folders
- `src/modules/projects/components/files/FolderView.tsx` — folder browser component
- `src/modules/projects/components/files/FileRow.tsx` — file row component

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `useNextcloudFiles` / `useNextcloudFilesByPath` hooks — already fetch Nextcloud files by path
- `useCreateFolder` hook — creates Nextcloud folders via Edge Function
- `FolderView`, `FileRow`, `FolderCard` components — existing file browser UI
- `nextcloud-files` Edge Function — supports `list`, `download`, `upload`, `mkdir` operations
- Motion patterns from Phase 4 (spring animations, AnimatePresence) — reuse for tab transitions
- `Skeleton` shadcn component — already used in multiple modules

### Established Patterns
- Nextcloud paths: `{nextcloud_root_path}/{chapter_order}_{chapter_title}/` (zero-padded)
- Edge Function proxy: all Nextcloud calls go through `nextcloud-files` function
- Tab transitions: currently no animation (instant swap via shadcn Tabs)
- Loading states: `LoadingSkeleton` component used in page-level loading, shadcn `Skeleton` for inline

### Integration Points
- `clickup-webhook` Edge Function: needs new handler for task.created → Nextcloud mkdir
- `OverviewTabs`: needs Motion wrapper around TabsContent
- `FilesTab`: complete rewrite — swap ClickUp attachment data for Nextcloud files
- `StepFilesTab`: add Nextcloud file listing by task name folder match
- `PhaseTimeline`: add Skeleton conditional before project data loads

</code_context>

<specifics>
## Specific Ideas

- Юрий хочет, чтобы при создании задачи в ClickUp автоматически создавалась папка в Nextcloud внутри папки шага. Файлы из этой папки отображаются на главной (последние 8) и в деталях задачи.
- Привязка файлов к проекту обязательна — путь Nextcloud должен быть правильным для текущего проекта.

</specifics>

<deferred>
## Deferred Ideas

### DATA-01: ProjectContextSection on OverviewPage
Deferred to admin dashboard scope. Components exist (ProjectContextSection.tsx, ProjectContextPreview.tsx) but not yet rendered. See `docs/ideas/admin-dashboard.md`.

### DATA-05: ProjectContextAdminPanel Refactor
Deferred with DATA-01. Panel is 156 lines, needs extract of MemoryEntryForm to meet < 150 line rule. Part of admin dashboard scope.

### ENRICH-02: Manual Re-enrichment Trigger
Still pending from Phase 3. Operator "Neu generieren" button — belongs in admin dashboard scope.

</deferred>

---

*Phase: 05-data-unification-polish*
*Context gathered: 2026-03-29*
