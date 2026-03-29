---
phase: 05-data-unification-polish
plan: 01
subsystem: projects-module
tags: [nextcloud, files, slugify, tdd]
dependency_graph:
  requires: ["05-00"]
  provides: ["FilesTab-nextcloud", "StepFilesTab-nextcloud", "frontend-slugify"]
  affects: ["src/modules/projects/components/overview/FilesTab.tsx", "src/modules/projects/components/steps/StepFilesTab.tsx", "src/modules/projects/components/steps/StepDetail.tsx", "src/modules/projects/components/overview/OverviewTabs.tsx"]
tech_stack:
  added: []
  patterns: ["useNextcloudFiles hook", "path-based Nextcloud listing", "slugify for folder matching"]
key_files:
  created:
    - src/modules/projects/lib/slugify.ts
    - src/modules/projects/__tests__/FilesTab.test.tsx
    - src/modules/projects/__tests__/StepFilesTab.test.tsx
  modified:
    - src/modules/projects/components/overview/FilesTab.tsx
    - src/modules/projects/components/overview/OverviewTabs.tsx
    - src/modules/projects/components/steps/StepFilesTab.tsx
    - src/modules/projects/components/steps/StepDetail.tsx
decisions:
  - "FilesTab shows 8 most recent files sorted by lastModified desc, filtering out folder entries"
  - "StepFilesTab constructs Nextcloud path as chapterFolder/slugify(step.title)"
  - "StepDetail passes projectConfigId and buildChapterFolder(chapter.order, chapter.title) to StepFilesTab"
  - "No navigation to DateienPage from FilesTab — direct download on click per D-03"
metrics:
  duration_seconds: 326
  completed_date: "2026-03-30"
  tasks_completed: 2
  files_changed: 7
---

# Phase 05 Plan 01: FilesTab and StepFilesTab Nextcloud Rewrite Summary

FilesTab and StepFilesTab rewired from always-empty ClickUp attachment arrays to live Nextcloud file listings via existing hooks, with frontend slugify utility for path construction.

## What Was Built

### Task 1: FilesTab + OverviewTabs + slugify utility (commit `2f5b22d`)

**src/modules/projects/lib/slugify.ts** — Frontend copy of `supabase/functions/_shared/slugify.ts`. Exports `slugify(input, maxLength)` and `buildChapterFolder(sortOrder, title)`. Used to construct Nextcloud folder paths without calling the Edge Function for path computation.

**src/modules/projects/components/overview/FilesTab.tsx** — Rewrote from `{ files: FileItem[] }` to `{ projectConfigId: string }`. Calls `useNextcloudFiles(projectConfigId)`, filters to `type === 'file'` entries, sorts by `lastModified` descending, slices to 8. Download on click via `downloadFile(projectConfigId, f.path)`. Loading skeleton, German empty state. Removed `useNavigate` and "Alle X Dateien anzeigen" button.

**src/modules/projects/components/overview/OverviewTabs.tsx** — Removed `const allFiles: FileItem[]` computation and `FileItem` import. Changed `<FilesTab files={allFiles} />` to `<FilesTab projectConfigId={p.id} />`.

**src/modules/projects/__tests__/FilesTab.test.tsx** — 13 tests: FilesTab rendering (8-file cap, folder filtering, empty state, download click, skeleton, no navigation button) + slugify/buildChapterFolder unit tests. All pass.

### Task 2: StepFilesTab + StepDetail (commit `c7540d2`)

**src/modules/projects/components/steps/StepFilesTab.tsx** — Rewrote interface from `{ step: Step }` to `{ step: Step; projectConfigId: string; chapterFolder: string }`. Constructs `subPath = chapterFolder/slugify(step.title)`, calls `useNextcloudFilesByPath(projectConfigId, subPath)`. Filters to file-type entries, click-to-download, loading skeleton, German empty state. Removed drag-and-drop upload zone (out of scope).

**src/modules/projects/components/steps/StepDetail.tsx** — Imports `buildChapterFolder` from `../../lib/slugify`. Computes `chapterFolder = buildChapterFolder(chapter.order, chapter.title)` and passes `projectConfigId={project.id}` and `chapterFolder={chapterFolder}` to StepFilesTab. Removed `step.files.length` count from Dateien tab trigger (count was always 0, now irrelevant).

**src/modules/projects/__tests__/StepFilesTab.test.tsx** — 8 tests: path construction (exact slug + special chars), file rendering, empty state (no files + folders-only), loading state, download click, no upload zone. All pass.

## Test Results

```
Test Files: 2 passed
Tests: 21 passed (21 total)
```

## Build

```
npm run build: success in 10.67s, no type errors
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. Both components are fully wired to live Nextcloud data via `useNextcloudFiles` and `useNextcloudFilesByPath`. Empty states display correctly when no data is available.

## Self-Check: PASSED

Files exist:
- src/modules/projects/lib/slugify.ts: FOUND
- src/modules/projects/components/overview/FilesTab.tsx: FOUND
- src/modules/projects/components/overview/OverviewTabs.tsx: FOUND
- src/modules/projects/components/steps/StepFilesTab.tsx: FOUND
- src/modules/projects/components/steps/StepDetail.tsx: FOUND
- src/modules/projects/__tests__/FilesTab.test.tsx: FOUND
- src/modules/projects/__tests__/StepFilesTab.test.tsx: FOUND

Commits exist:
- 2f5b22d: feat(05-01): rewrite FilesTab for Nextcloud + frontend slugify utility
- c7540d2: feat(05-01): rewrite StepFilesTab for Nextcloud path-based file listing
