# TASK-003: Files Tab → Nextcloud Integration

> Status: PRE-CODE REVIEWED | Created: 2026-03-22
> Review: APPROVE WITH CONDITIONS — 2 blocking resolved below

## Goal
Rebuild the project Files tab from ClickUp-attachment-based to Nextcloud WebDAV-backed file browser with upload capability.

## Context

### Nextcloud Access
- **URL:** `https://cloud.kamanin.at`
- **Auth:** Single service account via Edge Function (credentials server-side only, never exposed to browser)
- **Protocol:** WebDAV (Nextcloud exposes at `/remote.php/dav/files/{username}/`)

### Folder Structure
```
/01_OPUS/{Company}/projects/{ProjectName}/
├── 01_{phase_1_title}/
├── 02_{phase_2_title}/
├── 03_{phase_3_title}/
└── 04_{phase_4_title}/
```

- Phase folder names come from `chapter_config.title` (dynamic per project)
- Prefixes `01_`–`04_` for sort order, mapped via `chapter_config.sort_order`
- Never hardcode phase names — always read from `chapter_config`

### Current State
- `src/modules/projects/components/files/FilesPage.tsx` — reads from ClickUp task attachments (project.chapters → steps → files)
- Needs complete rebuild to read from Nextcloud WebDAV

## Scope

### In-scope
1. **New Edge Function** `nextcloud-files` — proxies WebDAV to Nextcloud
   - `GET /list` — list files in a path (PROPFIND)
   - `GET /download` — download a file (returns signed URL or streams)
   - `POST /upload` — upload file to path (PUT via WebDAV)
   - `POST /create-folder` — create folder (MKCOL)
   - Auth: service account credentials in env vars (NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_PASS)
   - RLS: verify user has access to the project via `project_config` + profiles

2. **DB: project_config mapping** — add `nextcloud_root_path` column to `project_config`
   - Example value: `/01_OPUS/KAMANIN GmbH/projects/Website Relaunch/`
   - Edge Function builds full path: `{nextcloud_root_path}/{chapter_prefix}_{chapter_title}/`

3. **Rebuild FilesPage.tsx** — Nextcloud-backed file browser
   - Phase folder cards (from `chapter_config`, not hardcoded)
   - File list from Nextcloud WebDAV PROPFIND response
   - File type icons (pdf, image, doc, etc.)
   - File size and last modified date
   - Click to download
   - Upload button per folder

4. **Upload component** — drag & drop or file picker
   - Upload to current folder via Edge Function
   - Progress indicator
   - Max file size validation
   - Toast feedback

5. **Hook: useNextcloudFiles** — React Query hook
   - `useNextcloudFiles(projectConfigId, chapterPath?)`
   - Calls Edge Function, returns file list
   - Caches with React Query staleTime

### Out-of-scope
- Creating Nextcloud accounts per client
- Nextcloud folder creation automation (manual for now)
- File preview (PDF viewer, image lightbox) — future
- File versioning
- Sharing links

## Affected Files

### New files
- `supabase/functions/nextcloud-files/index.ts` — Edge Function: WebDAV proxy
- `src/modules/projects/hooks/useNextcloudFiles.ts` — React Query hook
- `src/modules/projects/components/files/FileUpload.tsx` — upload component

### Modified files
- `src/modules/projects/components/files/FilesPage.tsx` — complete rebuild
- `src/modules/projects/types/project.ts` — update FileItem type if needed
- `supabase/functions/main/index.ts` — register new function route (if needed)
- `docs/system-context/DATABASE_SCHEMA.md` — document nextcloud_root_path

## DB Change

```sql
ALTER TABLE project_config ADD COLUMN nextcloud_root_path TEXT;

-- Example: set for existing projects
-- UPDATE project_config SET nextcloud_root_path = '/01_OPUS/CompanyName/projects/ProjectName/' WHERE id = '...';
```

## Edge Function: nextcloud-files

### Env vars needed (in Edge Functions container)
```
NEXTCLOUD_URL=https://cloud.kamanin.at
NEXTCLOUD_USER=<service_account_username>
NEXTCLOUD_PASS=<service_account_password>
```

**Note:** These need to be added to the docker-compose `supabase-edge-functions` environment section, same pattern as SMTP vars.

### API Design

#### List files
```
POST /functions/v1/nextcloud-files
{
  "action": "list",
  "project_config_id": "uuid",
  "chapter_sort_order": 0  // optional, omit for root
}
→ { files: [{ name, type, size, lastModified, path }] }
```

#### Download
```
POST /functions/v1/nextcloud-files
{
  "action": "download",
  "project_config_id": "uuid",
  "file_path": "01_Konzept/brief.pdf"
}
→ redirect to file stream or signed URL
```

#### Upload (multipart/form-data — NOT base64)
```
POST /functions/v1/nextcloud-files
Content-Type: multipart/form-data

FormData:
  action: "upload"
  project_config_id: "uuid"
  chapter_sort_order: "0"
  file: <binary file>
→ { ok: true, data: { name, size, path } }
```
**CRITICAL: Use FormData + streaming, NOT base64 JSON.** Worker memory limit is 150MB, base64 doubles payload. Stream file bytes directly to Nextcloud PUT.

## WebDAV Reference

Nextcloud WebDAV endpoint: `https://cloud.kamanin.at/remote.php/dav/files/{username}/{path}`

| Operation | Method | WebDAV |
|---|---|---|
| List files | PROPFIND | depth: 1 |
| Download | GET | direct file URL |
| Upload | PUT | file body |
| Create folder | MKCOL | — |

Auth: Basic Auth with service account credentials.

## Implementation Order
1. DB migration: add `nextcloud_root_path` to `project_config`
2. Edge Function: `nextcloud-files` with list/download/upload actions
3. Hook: `useNextcloudFiles`
4. Rebuild `FilesPage.tsx` with Nextcloud data
5. Add `FileUpload.tsx` component
6. Update docs

## Constraints
- All UI text in German
- `ContentContainer width="narrow"` wrapper
- Components < 150 lines
- Edge Function handles ALL Nextcloud communication — browser never talks to Nextcloud directly
- Service account credentials server-side only
- Verify project access via RLS before any Nextcloud operation

## Security: Path Traversal Prevention
**CRITICAL:** Edge Function MUST sanitize all file paths from client:
- Reject any path containing `..`
- Reject any path starting with `/`
- Validate `chapter_sort_order` is integer within known chapter bounds
- After building full path, verify it starts with `nextcloud_root_path`

## Response Contract
All responses MUST follow standard format: `{ ok, code, correlationId, data? }`.
When `nextcloud_root_path` is null → return `{ ok: false, code: "NEXTCLOUD_NOT_CONFIGURED" }`.
UI shows: "Dateien sind für dieses Projekt noch nicht konfiguriert."

## XML Parsing
Use `fast-xml-parser` via `https://esm.sh/fast-xml-parser` (Deno Edge Runtime may not have DOMParser).
Fields needed: `d:displayname`, `d:getcontentlength`, `d:getlastmodified`, `d:resourcetype`.

## Types
Create `NextcloudFile` type (separate from existing `FileItem` which is ClickUp-shaped).

## Risks
- Edge Functions env vars: NEXTCLOUD_* need mapping in docker-compose (same pattern as SMTP)
- Folder might not exist yet in Nextcloud — handle 404 as empty file list, not error
- Worker timeout 60s — stream downloads, don't buffer
- Folder name mismatch between chapter_config.title and actual Nextcloud folder — handle gracefully
