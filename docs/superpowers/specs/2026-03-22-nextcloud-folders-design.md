# Nextcloud Folder Navigation & Creation

**Date:** 2026-03-22
**Status:** Approved (revised after spec review)
**Author:** Supervisor + Yuri

## Summary

Add subfolder browsing, creation, and upload-to-subfolder capabilities to the Nextcloud file integration. Replace the non-functional step-binding upload dialog with a working folder-aware upload flow.

## Current State

- **Edge Function `nextcloud-files`**: supports `list` (by chapter_sort_order), `download`, `upload` (by chapter_sort_order)
- **`ChapterFiles.tsx`**: filters out folders (`f.type === 'file'`), no subfolder navigation
- **`UploadSheet.tsx`**: stub — `handleUpload()` shows toast but doesn't upload to Nextcloud. Step-binding dropdown is non-functional.
- **`FileUpload.tsx`**: works but only supports `chapterSortOrder`, not arbitrary paths
- **`FolderGrid` in `FilesPage.tsx`**: shows chapter cards, no subfolder awareness

## Design

### 1. Edge Function Changes

#### Parse block: extract `sub_path`

The request parse block (lines 255–271) must extract `sub_path` from **both** JSON and FormData branches alongside existing fields. When `sub_path` is provided, `chapter_sort_order` is ignored — `resolveProjectContext` is called with `chapterSortOrder = undefined` to skip the `chapter_config` DB lookup entirely.

**Target path resolution:**
```
if (sub_path provided and isPathSafe):
  targetPath = ctx.rootPath + '/' + sub_path
else if (ctx.chapterFolder):
  targetPath = ctx.rootPath + '/' + ctx.chapterFolder
else:
  targetPath = ctx.rootPath
```

#### `isPathSafe` hardening

Add control character rejection to prevent WebDAV parsing issues:
```typescript
// Add to segment rejection check:
/[\x00-\x1f\x7f]/.test(s)
```

#### New action: `mkdir`

Creates a folder in Nextcloud via WebDAV `MKCOL`. **Recursive** — creates intermediate directories from root down (sequential MKCOL calls). MKCOL on existing collection returns 405, which is silently absorbed (idempotent success).

```json
{
  "action": "mkdir",
  "project_config_id": "uuid",
  "folder_path": "01_Konzept/Referenzen/Logos"
}
```

- `folder_path`: relative to `nextcloud_root_path`, validated by `isPathSafe()`
- Returns `{ ok: true, code: "OK", data: { path: "01_Konzept/Referenzen/Logos" } }`
- **Recursive creation**: splits `folder_path` by `/`, issues MKCOL for each prefix:
  1. MKCOL `01_Konzept` (405 = exists, absorb)
  2. MKCOL `01_Konzept/Referenzen` (405 = exists, absorb)
  3. MKCOL `01_Konzept/Referenzen/Logos` (201 = created)
- Only fails on actual server errors (5xx)

#### Extended `list` action: add `sub_path`

```json
{
  "action": "list",
  "project_config_id": "uuid",
  "sub_path": "01_Konzept/Referenzen"
}
```

- `sub_path`: optional, relative path within project root
- If provided, takes precedence over `chapter_sort_order` (which is ignored)
- Same PROPFIND Depth:1 behavior, returns both files and folders
- **Relative path computation**: when `sub_path` is provided, each item's `path` = `${sub_path}/${name}` (not just `name`). This ensures `download` action works correctly for files in subfolders.

#### Extended `upload` action: add `sub_path`

```json
// JSON mode
{
  "action": "upload",
  "project_config_id": "uuid",
  "sub_path": "01_Konzept/Referenzen"
}

// FormData mode
FormData:
  action: "upload"
  project_config_id: "uuid"
  sub_path: "01_Konzept/Referenzen"
  file: <binary>
```

- `sub_path`: optional, if provided uses `rootPath/sub_path` as target
- Falls back to `chapter_sort_order` → chapter folder if `sub_path` not provided

### 2. Frontend: Hook Changes

#### New hook: `useNextcloudFilesByPath`

Separate hook for path-based file listing (no overload ambiguity):

```typescript
export function useNextcloudFilesByPath(projectConfigId: string, subPath: string) {
  // Sends { action: 'list', project_config_id, sub_path: subPath }
  // Query key: ['nextcloud-files', projectConfigId, subPath]
}
```

Existing `useNextcloudFiles(projectConfigId, chapterSortOrder?)` remains unchanged for backward compatibility.

#### `useUploadFile` — add `subPath` support

New variant: `useUploadFileByPath(projectConfigId, subPath)` — sends `sub_path` instead of `chapter_sort_order`.

#### New: `useCreateFolder` mutation

```typescript
export function useCreateFolder(projectConfigId: string) {
  // mutateAsync({ folderPath: string })
  // Calls mkdir action
  // On success, invalidates:
  //   1. The current path query cache
  //   2. The parent path query cache (one level up)
  //   3. The root query cache (for chapter-level creation)
}
```

### 3. Frontend: FolderView (refactored ChapterFiles)

Replace `ChapterFiles` with a generic `FolderView` that supports arbitrary depth.

**Props:**
```typescript
interface FolderViewProps {
  project: Project;
  /** Breadcrumb path segments, e.g. ["01_Konzept", "Referenzen"] */
  pathSegments: string[];
  onNavigate: (newSegments: string[]) => void;
}
```

No `onBack` prop — back navigation is `onNavigate(pathSegments.slice(0, -1))`. When `pathSegments` becomes empty, `FilesPage` shows `FolderGrid`.

**Behavior:**
- Calls `useNextcloudFilesByPath(project.id, pathSegments.join('/'))` (or root if empty)
- Renders breadcrumbs: `Dateien > 01_Konzept > Referenzen` — each segment clickable via `onNavigate`
- Lists folders first (with `Folder` icon), then files
- Click folder → `onNavigate([...pathSegments, folderName])`
- Click breadcrumb segment → `onNavigate(pathSegments.slice(0, idx + 1))`
- "Neuer Ordner" button → inline input → calls `useCreateFolder`
- `FileUpload` at bottom, uses current path
- Frontend pre-validates folder names: no `/`, `\`, `..`, leading `.`, empty string

### 4. Frontend: FilesPage Navigation State

`FilesPage` manages the navigation state:

```typescript
const [pathSegments, setPathSegments] = useState<string[]>([]);

// pathSegments = [] → show FolderGrid (chapter cards + root files)
// pathSegments = ["01_Konzept"] → FolderView for chapter
// pathSegments = ["01_Konzept", "Referenzen"] → FolderView for subfolder
```

Replace `selectedChapter` state with `pathSegments`. When user clicks a chapter card, set `pathSegments` to `["{sortOrder:02d}_{title}"]`.

### 5. Frontend: UploadSheet Redesign

Replace step-binding with folder selection:

```
┌─────────────────────────────────────────┐
│ Datei hochladen                         │
├─────────────────────────────────────────┤
│ ┌─────────────────────────────────────┐ │
│ │  Drop zone (drag or click)         │ │
│ │  selected-file.pdf                 │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Ordner                                  │
│ ┌───────────────────────────────────┐   │
│ │ 01_Konzept              v        │   │
│ └───────────────────────────────────┘   │
│                                         │
│ Unterordner                             │
│ ┌───────────────────────────────────┐   │
│ │ Referenzen              v        │   │
│ └───────────────────────────────────┘   │
│ + Neuen Ordner erstellen                │
│                                         │
│         [Abbrechen]  [Hochladen]        │
└─────────────────────────────────────────┘
```

- **Chapter dropdown**: lists chapters from `project.chapters`, maps to folder name `{order:02d}_{title}`
- **Subfolder dropdown**: dynamically loads subfolders from selected chapter via `useNextcloudFilesByPath`
  - While loading: disabled dropdown with "Wird geladen..."
  - No subfolders: hide dropdown entirely (upload goes to chapter root)
- **"Neuen Ordner erstellen"**: inline input → calls `useCreateFolder` → auto-selects new folder
- **Upload**: calls `useUploadFileByPath` with computed `subPath`
- **Removed**: step binding dropdown, note field

### 6. Deletions

- Remove `selectedStepId` and step-binding logic from `UploadSheet`
- Remove `note` field from `UploadSheet`
- `ChapterFiles.tsx` replaced by `FolderView.tsx`

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/nextcloud-files/index.ts` | Modify | Add `mkdir` action (recursive MKCOL), add `sub_path` to parse block + `list` + `upload`, harden `isPathSafe` |
| `src/modules/projects/hooks/useNextcloudFiles.ts` | Modify | Add `useNextcloudFilesByPath`, `useUploadFileByPath`, `useCreateFolder` hooks |
| `src/modules/projects/components/files/FolderView.tsx` | Create | Generic folder browser with breadcrumbs, replaces ChapterFiles |
| `src/modules/projects/components/files/FilesPage.tsx` | Modify | Path-based navigation state instead of selectedChapter |
| `src/modules/projects/components/files/ChapterFiles.tsx` | Delete | Replaced by FolderView |
| `src/modules/projects/components/files/FileUpload.tsx` | Modify | Accept `subPath` prop alongside existing `chapterSortOrder` |
| `src/modules/projects/components/UploadSheet.tsx` | Rewrite | Folder-aware upload, remove step binding |
| `src/modules/projects/components/files/CreateFolderInput.tsx` | Create | Inline folder name input with validation |

## Follow-ups (out of scope)

- File/folder **delete** action — product gap, not needed for this feature
- Folder rename — future enhancement

## Post-Implementation

- Update `docs/CHANGELOG.md`
- Update `docs/system-context/DATABASE_SCHEMA.md` (Edge Function docs section)
- Update `CLAUDE.md` if any structural changes
- Update `docs/DECISIONS.md` with ADR for removing step-binding
