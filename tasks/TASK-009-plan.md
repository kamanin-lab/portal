# TASK-009: File Management in DateienPage

## Context
DateienPage can browse folders and download files, but has NO way to upload files or create folders. The Edge Function `nextcloud-files` already supports `upload` (with `sub_path`) and `mkdir` actions. We just need to wire the UI.

## Changes

### 1. Add upload + mkdir hooks to useClientFiles.ts

Add two mutation functions:
- `uploadClientFile(subPath: string, file: File)` — calls `nextcloud-files` with `action: 'upload'`, `sub_path`, multipart file. Invalidates `['client-files', subPath]` on success.
- `createClientFolder(folderPath: string)` — calls `nextcloud-files` with `action: 'mkdir'`, `folder_path`. Invalidates the parent path query on success.

Note: The existing `upload` action in the Edge Function requires `project_config_id`. For client-root uploads we need to use a different approach — either use the `browse-client` pattern (derive root from profile) or pass a project_config_id. Check how the Edge Function handles this. If needed, add an `upload-client-file` action similar to `download-client-file`.

### 2. Add action bar to ClientFolderView

At the top of ClientFolderView (between breadcrumbs and content), add an action bar:
- "Datei hochladen" button (Upload icon) — opens file picker
- "Neuer Ordner" button (FolderPlus icon) — shows inline input for folder name
- Both use shadcn Button (variant="outline", size="sm")
- Action bar only appears when inside a folder (not on root grid)

### 3. File upload flow
- Click "Datei hochladen" → hidden `<input type="file">` triggered
- File selected → call `uploadClientFile(currentSubPath, file)`
- Show loading toast during upload
- On success → toast "Datei hochgeladen", refetch folder contents
- On error → toast "Upload fehlgeschlagen"

### 4. Create folder flow
- Click "Neuer Ordner" → inline input appears (like CreateFolderInput pattern from projects module)
- Enter name → call `createClientFolder(currentSubPath + '/' + slugify(name))`
- On success → toast "Ordner erstellt", refetch folder contents
- On error → toast error

### Files to modify
- `src/modules/files/hooks/useClientFiles.ts` — add upload + mkdir functions
- `src/modules/files/components/ClientFolderView.tsx` — add action bar with upload + mkdir UI
- `supabase/functions/nextcloud-files/index.ts` — add `upload-client-file` and `mkdir-client` actions if current actions don't support client-root paths

### Files to reuse
- `src/shared/components/ui/button.tsx` — shadcn Button
- `src/shared/components/ui/input.tsx` — shadcn Input for folder name
- `src/shared/lib/slugify.ts` — for folder name normalization
- Existing `UploadDropZone` pattern from projects module

## Verification
- Navigate to /dateien → Projekte → see "Datei hochladen" + "Neuer Ordner" buttons
- Upload a file → appears in list
- Create a folder → appears in list
- Build passes, tests pass
