# Nextcloud Folder Navigation & Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable subfolder browsing, creation, and upload-to-subfolder in the Nextcloud file integration, and replace the stub UploadSheet with a working folder-aware upload dialog.

**Architecture:** Edge Function `nextcloud-files` gains `mkdir` action (recursive MKCOL) and `sub_path` parameter for `list`/`upload`. Frontend replaces `ChapterFiles` with a generic `FolderView` supporting drill-down navigation with breadcrumbs. `UploadSheet` is rewritten to select folder/subfolder instead of steps.

**Tech Stack:** Deno Edge Function (WebDAV MKCOL), React 19, TanStack React Query, Tailwind CSS v4, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-03-22-nextcloud-folders-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/functions/nextcloud-files/index.ts` | Modify | Add `sub_path` parsing, `mkdir` action, path hardening |
| `src/modules/projects/hooks/useNextcloudFiles.ts` | Modify | Add `useNextcloudFilesByPath`, `useUploadFileByPath`, `useCreateFolder` |
| `src/modules/projects/components/files/FolderView.tsx` | Create | Generic folder browser: breadcrumbs + folder list + file list + upload + create folder |
| `src/modules/projects/components/files/CreateFolderInput.tsx` | Create | Inline folder name input with validation |
| `src/modules/projects/components/files/FilesPage.tsx` | Modify | Replace `selectedChapter` state with `pathSegments` |
| `src/modules/projects/components/files/FileUpload.tsx` | Modify | Accept `subPath` prop |
| `src/modules/projects/components/files/ChapterFiles.tsx` | Delete | Replaced by FolderView |
| `src/modules/projects/components/UploadSheet.tsx` | Rewrite | Folder-aware upload |

---

## Task 1: Edge Function — add `sub_path` parsing and `isPathSafe` hardening

**Files:**
- Modify: `supabase/functions/nextcloud-files/index.ts:28-34` (isPathSafe)
- Modify: `supabase/functions/nextcloud-files/index.ts:248-271` (parse block)
- Modify: `supabase/functions/nextcloud-files/index.ts:298-324` (context resolution + targetPath)

- [ ] **Step 1: Harden `isPathSafe` — add control character rejection**

In `isPathSafe` (line 33), add control character check to the segment rejection:

```typescript
function isPathSafe(p: string): boolean {
  if (!p) return false;
  if (p.startsWith("/")) return false;
  const segments = p.split(/[/\\]/);
  return !segments.some((s) => s === ".." || s === "." || s.includes("%") || s.includes("\0") || /[\x00-\x1f\x7f]/.test(s));
}
```

- [ ] **Step 2: Add `sub_path` to parse block**

After `let uploadFile` (line 253), add:
```typescript
let subPath: string | undefined;
```

In the FormData branch (after line 261), add:
```typescript
subPath = (formData.get("sub_path") as string) || undefined;
```

In the JSON branch (after line 270), add:
```typescript
subPath = body.sub_path || undefined;
```

- [ ] **Step 3: Validate `sub_path` if provided**

After the `chapter_sort_order` validation block (line 288), add:
```typescript
if (subPath !== undefined && !isPathSafe(subPath)) {
  return new Response(
    JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid sub_path", correlationId: requestId }),
    { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
```

- [ ] **Step 4: Skip `chapter_sort_order` when `sub_path` is provided**

Modify the `resolveProjectContext` call (line 299) — pass `undefined` for chapterSortOrder when subPath is present:
```typescript
const { ctx, accessDenied } = await resolveProjectContext(
  supabase, supabaseService, user.id, projectConfigId,
  subPath ? undefined : chapterSortOrder, log,
);
```

- [ ] **Step 5: Update targetPath build to use `sub_path`**

Replace the targetPath block (lines 321-324) with:
```typescript
let targetPath = ctx.rootPath;
if (subPath) {
  targetPath = `${targetPath}/${subPath}`;
} else if (ctx.chapterFolder) {
  targetPath = `${targetPath}/${ctx.chapterFolder}`;
}
```

- [ ] **Step 6: Fix `relativePath` in list action to use `sub_path`**

In the list action's file mapping (lines 373-379), replace the relativePath logic:
```typescript
let relativePath = "";
if (subPath) {
  relativePath = `${subPath}/${name}`;
} else if (ctx.chapterFolder) {
  relativePath = `${ctx.chapterFolder}/${name}`;
} else {
  relativePath = name;
}
```

- [ ] **Step 7: Test `list` with `sub_path` manually**

```bash
# Get token
ANON_KEY=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d= -f2)
TOKEN=$(curl -s -X POST "https://portal.db.kamanin.at/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"email":"reg@kamanin.at","password":"Ubnfhf76!"}' | python -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Test list with sub_path
curl -s -X POST "https://portal.db.kamanin.at/functions/v1/nextcloud-files" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"list","project_config_id":"11111111-1111-1111-1111-111111111111","sub_path":"01_Konzept"}' | python -m json.tool
```

Expected: `{ ok: true, data: { files: [...] } }` with each file having `path` prefixed by `01_Konzept/`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/nextcloud-files/index.ts
git commit -m "feat(nextcloud): add sub_path support to list/upload, harden isPathSafe"
```

---

## Task 2: Edge Function — add `mkdir` action

**Files:**
- Modify: `supabase/functions/nextcloud-files/index.ts` (add new action block before "Unknown action")

- [ ] **Step 1: Add `folder_path` to parse block**

After the `subPath` extraction in both FormData and JSON branches, add:
```typescript
// In FormData branch:
const folderPath = (formData.get("folder_path") as string) || undefined;

// In JSON branch:
const folderPath = body.folder_path || undefined;
```

Also declare at the top of the parse section:
```typescript
let folderPath: string | undefined;
```

- [ ] **Step 2: Add `mkdir` action handler**

Before the "Unknown action" response (line 544), add the mkdir block:

```typescript
// ====================================================================
// ACTION: mkdir
// ====================================================================
if (action === "mkdir") {
  if (!folderPath) {
    return new Response(
      JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "folder_path required", correlationId: requestId }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  if (!isPathSafe(folderPath)) {
    log.warn("Invalid folder_path", { folderPath });
    return new Response(
      JSON.stringify({ ok: false, code: "BAD_REQUEST", message: "Invalid folder path", correlationId: requestId }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Recursive creation: MKCOL each segment from root down
  const segments = folderPath.split("/");
  let currentPath = ctx.rootPath;

  for (const segment of segments) {
    currentPath = `${currentPath}/${segment}`;
    const davUrl = `${base}${encodePath(currentPath)}`;

    log.info("MKCOL", { davUrl });

    const mkcolResp = await fetch(davUrl, {
      method: "MKCOL",
      headers: { Authorization: authHeaderNC },
    });

    if (mkcolResp.status === 201) {
      log.info("Folder created", { segment });
    } else if (mkcolResp.status === 405) {
      // Folder already exists — idempotent success
      log.info("Folder already exists", { segment });
    } else if (!mkcolResp.ok) {
      const errText = await mkcolResp.text();
      log.error("MKCOL failed", { status: mkcolResp.status, body: errText.slice(0, 500) });
      return new Response(
        JSON.stringify({ ok: false, code: "NEXTCLOUD_ERROR", message: "Failed to create folder", correlationId: requestId }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  log.info("mkdir complete", { folderPath });

  return new Response(
    JSON.stringify({
      ok: true,
      code: "OK",
      correlationId: requestId,
      data: { path: folderPath },
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
```

- [ ] **Step 3: Test `mkdir` manually**

```bash
curl -s -X POST "https://portal.db.kamanin.at/functions/v1/nextcloud-files" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"mkdir","project_config_id":"11111111-1111-1111-1111-111111111111","folder_path":"01_Konzept/Test_Subfolder"}' | python -m json.tool
```

Expected: `{ ok: true, code: "OK", data: { path: "01_Konzept/Test_Subfolder" } }`

Verify with list:
```bash
curl -s -X POST "https://portal.db.kamanin.at/functions/v1/nextcloud-files" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"list","project_config_id":"11111111-1111-1111-1111-111111111111","sub_path":"01_Konzept"}' | python -m json.tool
```

Expected: `Test_Subfolder` appears in files list with `type: "folder"`.

- [ ] **Step 4: Test idempotent mkdir (same path again)**

Run the same mkdir command again. Expected: `{ ok: true }` (no error).

- [ ] **Step 5: Commit and deploy**

```bash
git add supabase/functions/nextcloud-files/index.ts
git commit -m "feat(nextcloud): add mkdir action with recursive MKCOL"
git push origin main
```

The GitHub Actions workflow will auto-deploy since `supabase/functions/**` changed.

---

## Task 3: Frontend hooks — `useNextcloudFilesByPath`, `useUploadFileByPath`, `useCreateFolder`

**Files:**
- Modify: `src/modules/projects/hooks/useNextcloudFiles.ts`

- [ ] **Step 1: Add `fetchFilesByPath` function**

After the existing `fetchFiles` function (line 53), add:

```typescript
async function fetchFilesByPath(
  projectConfigId: string,
  subPath: string,
): Promise<{ files: NextcloudFile[]; notConfigured: boolean }> {
  const { data, error } = await supabase.functions.invoke<ListResponse>(
    'nextcloud-files',
    {
      body: {
        action: 'list',
        project_config_id: projectConfigId,
        sub_path: subPath,
      },
    },
  );

  if (error) throw new Error(error.message || 'Verbindungsfehler');
  if (data?.code === 'NEXTCLOUD_NOT_CONFIGURED') {
    return { files: [], notConfigured: true };
  }
  if (!data?.ok) throw new Error(data?.code || 'Unbekannter Fehler');

  return { files: data.data?.files ?? [], notConfigured: false };
}
```

- [ ] **Step 2: Add `useNextcloudFilesByPath` hook**

After existing `useNextcloudFiles` hook:

```typescript
export function useNextcloudFilesByPath(projectConfigId: string, subPath: string) {
  const queryKey = ['nextcloud-files', projectConfigId, subPath];

  const query = useQuery({
    queryKey,
    queryFn: () => fetchFilesByPath(projectConfigId, subPath),
    enabled: !!projectConfigId && !!subPath,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return {
    files: query.data?.files ?? [],
    notConfigured: query.data?.notConfigured ?? false,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
```

- [ ] **Step 3: Add `useUploadFileByPath` hook**

After existing `useUploadFile` hook:

```typescript
export function useUploadFileByPath(projectConfigId: string, subPath: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Nicht authentifiziert');

      const formData = new FormData();
      formData.append('action', 'upload');
      formData.append('project_config_id', projectConfigId);
      formData.append('sub_path', subPath);
      formData.append('file', file);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const resp = await fetch(`${supabaseUrl}/functions/v1/nextcloud-files`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      });

      const result: UploadResponse = await resp.json();
      if (!result.ok) throw new Error(result.code || 'Upload fehlgeschlagen');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nextcloud-files', projectConfigId, subPath] });
      // Also invalidate root if uploading to a chapter root
      if (!subPath.includes('/')) {
        queryClient.invalidateQueries({ queryKey: ['nextcloud-files', projectConfigId, 'root'] });
      }
    },
  });
}
```

- [ ] **Step 4: Add `useCreateFolder` hook**

```typescript
interface MkdirResponse {
  ok: boolean;
  code: string;
  correlationId: string;
  data?: { path: string };
}

export function useCreateFolder(projectConfigId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (folderPath: string): Promise<MkdirResponse> => {
      const { data, error } = await supabase.functions.invoke<MkdirResponse>(
        'nextcloud-files',
        {
          body: {
            action: 'mkdir',
            project_config_id: projectConfigId,
            folder_path: folderPath,
          },
        },
      );

      if (error) throw new Error(error.message || 'Verbindungsfehler');
      if (!data?.ok) throw new Error(data?.code || 'Ordner konnte nicht erstellt werden');
      return data;
    },
    onSuccess: (_data, folderPath) => {
      // Invalidate parent folder and root
      const parentPath = folderPath.includes('/')
        ? folderPath.substring(0, folderPath.lastIndexOf('/'))
        : '';
      queryClient.invalidateQueries({ queryKey: ['nextcloud-files', projectConfigId, parentPath] });
      queryClient.invalidateQueries({ queryKey: ['nextcloud-files', projectConfigId, 'root'] });
    },
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/projects/hooks/useNextcloudFiles.ts
git commit -m "feat(nextcloud): add path-based hooks — useNextcloudFilesByPath, useUploadFileByPath, useCreateFolder"
```

---

## Task 4: Frontend — `CreateFolderInput` component

**Files:**
- Create: `src/modules/projects/components/files/CreateFolderInput.tsx`

- [ ] **Step 1: Create the component**

```typescript
import { useState } from 'react';
import { FolderPlus, Loader2 } from 'lucide-react';

interface CreateFolderInputProps {
  onSubmit: (name: string) => Promise<void>;
  isLoading: boolean;
}

const INVALID_CHARS = /[/\\:*?"<>|%]/;

export function CreateFolderInput({ onSubmit, isLoading }: CreateFolderInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function validate(val: string): string {
    if (!val.trim()) return 'Name darf nicht leer sein';
    if (val.startsWith('.')) return 'Name darf nicht mit einem Punkt beginnen';
    if (val.includes('..')) return 'Ungültiger Name';
    if (INVALID_CHARS.test(val)) return 'Ungültige Zeichen im Namen';
    return '';
  }

  async function handleSubmit() {
    const err = validate(name);
    if (err) { setError(err); return; }
    await onSubmit(name.trim());
    setName('');
    setError('');
    setIsOpen(false);
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-[6px] text-[12px] text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors mt-[8px]"
      >
        <FolderPlus size={14} />
        Neuen Ordner erstellen
      </button>
    );
  }

  return (
    <div className="flex items-center gap-[8px] mt-[8px]">
      <input
        autoFocus
        value={name}
        onChange={(e) => { setName(e.target.value); setError(''); }}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setIsOpen(false); }}
        placeholder="Ordnername…"
        className="flex-1 px-[10px] py-[6px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
      />
      <button
        onClick={handleSubmit}
        disabled={isLoading || !name.trim()}
        className="px-[12px] py-[6px] text-[12px] font-semibold text-white bg-[var(--accent)] rounded-[var(--r-sm)] hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
      >
        {isLoading ? <Loader2 size={14} className="animate-spin" /> : 'Erstellen'}
      </button>
      <button
        onClick={() => { setIsOpen(false); setName(''); setError(''); }}
        className="px-[8px] py-[6px] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        Abbrechen
      </button>
    </div>
    {error && <p className="text-[11px] text-red-500 mt-[4px]">{error}</p>}
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/projects/components/files/CreateFolderInput.tsx
git commit -m "feat(nextcloud): add CreateFolderInput component"
```

---

## Task 5: Frontend — Update `FileUpload` to accept `subPath`

> **Note:** This must happen BEFORE Task 6 (FolderView) because FolderView depends on the `subPath` prop.

**Files:**
- Modify: `src/modules/projects/components/files/FileUpload.tsx`

- [ ] **Step 1: Add `subPath` prop**

Update the interface and hook usage:

```typescript
interface FileUploadProps {
  projectConfigId: string;
  chapterSortOrder?: number;
  subPath?: string;
  disabled?: boolean;
}

export function FileUpload({ projectConfigId, chapterSortOrder, subPath, disabled }: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const uploadByChapter = useUploadFile(projectConfigId, chapterSortOrder);
  const uploadByPath = useUploadFileByPath(projectConfigId, subPath ?? '');
  const upload = subPath !== undefined ? uploadByPath : uploadByChapter;
  // ... rest unchanged
```

Add the import at the top:
```typescript
import { useUploadFile, useUploadFileByPath } from '../../hooks/useNextcloudFiles';
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/projects/components/files/FileUpload.tsx
git commit -m "feat(nextcloud): FileUpload supports subPath prop"
```

---

## Task 6: Frontend — `FolderView` component (replaces ChapterFiles)

**Files:**
- Create: `src/modules/projects/components/files/FolderView.tsx`
- Delete: `src/modules/projects/components/files/ChapterFiles.tsx`

- [ ] **Step 1: Create `FolderView.tsx`**

```typescript
import { Folder, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import type { Project } from '../../types/project';
import { useNextcloudFilesByPath, useCreateFolder } from '../../hooks/useNextcloudFiles';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { FileRow } from './FileRow';
import { FileUpload } from './FileUpload';
import { CreateFolderInput } from './CreateFolderInput';

interface FolderViewProps {
  project: Project;
  pathSegments: string[];
  onNavigate: (newSegments: string[]) => void;
}

export function FolderView({ project, pathSegments, onNavigate }: FolderViewProps) {
  const subPath = pathSegments.join('/');
  const { files, isLoading, error } = useNextcloudFilesByPath(project.id, subPath);
  const createFolder = useCreateFolder(project.id);

  const folders = files.filter((f) => f.type === 'folder');
  const fileItems = files.filter((f) => f.type === 'file');

  async function handleCreateFolder(name: string) {
    try {
      const folderPath = subPath ? `${subPath}/${name}` : name;
      await createFolder.mutateAsync(folderPath);
      toast.success('Ordner erstellt', { description: name });
    } catch (err) {
      toast.error('Ordner konnte nicht erstellt werden', {
        description: (err as Error).message,
      });
    }
  }

  return (
    <>
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-[4px] text-[13px] mb-[16px] flex-wrap">
        <button
          onClick={() => onNavigate([])}
          className="text-[var(--accent)] hover:underline transition-colors"
        >
          Dateien
        </button>
        {pathSegments.map((seg, idx) => (
          <span key={idx} className="flex items-center gap-[4px]">
            <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
            {idx === pathSegments.length - 1 ? (
              <span className="text-[var(--text-primary)] font-medium">{seg}</span>
            ) : (
              <button
                onClick={() => onNavigate(pathSegments.slice(0, idx + 1))}
                className="text-[var(--accent)] hover:underline transition-colors"
              >
                {seg}
              </button>
            )}
          </span>
        ))}
      </nav>

      {/* Content */}
      {isLoading ? (
        <LoadingSkeleton lines={4} height="40px" />
      ) : error ? (
        <EmptyState message="Dateien konnten nicht geladen werden." />
      ) : (
        <>
          {/* Subfolders */}
          {folders.length > 0 && (
            <div className="flex flex-col gap-[2px] mb-[12px]">
              {folders.map((f) => (
                <button
                  key={f.path}
                  onClick={() => onNavigate([...pathSegments, f.name])}
                  className="flex items-center gap-[10px] px-[12px] py-[10px] rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors text-left"
                >
                  <Folder size={16} className="text-[var(--accent)] flex-shrink-0" />
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">{f.name}</span>
                </button>
              ))}
            </div>
          )}

          {/* Files */}
          {fileItems.length > 0 && (
            <div className="flex flex-col gap-[2px] mb-[12px]">
              {fileItems.map((f) => (
                <FileRow key={f.path} file={f} projectConfigId={project.id} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {folders.length === 0 && fileItems.length === 0 && (
            <EmptyState message="Dieser Ordner ist leer." />
          )}

          {/* Create folder */}
          <CreateFolderInput
            onSubmit={handleCreateFolder}
            isLoading={createFolder.isPending}
          />

          {/* Upload */}
          <div className="mt-[12px]">
            <FileUpload projectConfigId={project.id} subPath={subPath} />
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 2: Delete `ChapterFiles.tsx`**

```bash
git rm src/modules/projects/components/files/ChapterFiles.tsx
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/projects/components/files/FolderView.tsx
git commit -m "feat(nextcloud): add FolderView with drill-down navigation and breadcrumbs"
```

---

## Task 7: Frontend — Update `FilesPage` with path-based navigation

**Files:**
- Modify: `src/modules/projects/components/files/FilesPage.tsx`

- [ ] **Step 1: Replace `selectedChapter` with `pathSegments`**

Rewrite `FilesPage`:

```typescript
import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import type { Project } from '../../types/project';
import { useNextcloudFiles } from '../../hooks/useNextcloudFiles';
import { ContentContainer } from '@/shared/components/layout/ContentContainer';
import { EmptyState } from '@/shared/components/common/EmptyState';
import { LoadingSkeleton } from '@/shared/components/common/LoadingSkeleton';
import { FolderCard } from './FolderCard';
import { FileRow } from './FileRow';
import { FolderView } from './FolderView';

interface FilesPageProps {
  project: Project;
}

export function FilesPage({ project }: FilesPageProps) {
  const [pathSegments, setPathSegments] = useState<string[]>([]);

  function handleChapterClick(order: number, title: string) {
    const padded = String(order).padStart(2, '0');
    setPathSegments([`${padded}_${title}`]);
  }

  return (
    <ContentContainer width="narrow">
      <div className="p-[24px] max-[768px]:p-[16px]">
        <h1 className="text-[1.2rem] font-semibold text-[var(--text-primary)] tracking-[-0.02em] mb-[20px]">
          Dateien
        </h1>

        {pathSegments.length > 0 ? (
          <FolderView
            project={project}
            pathSegments={pathSegments}
            onNavigate={setPathSegments}
          />
        ) : (
          <FolderGrid
            chapters={project.chapters}
            projectId={project.id}
            onSelect={handleChapterClick}
          />
        )}
      </div>
    </ContentContainer>
  );
}

// ---------------------------------------------------------------------------
// FolderGrid — root view showing phase folders + optional root-level files
// ---------------------------------------------------------------------------

interface FolderGridProps {
  chapters: { id: string; title: string; order: number }[];
  projectId: string;
  onSelect: (order: number, title: string) => void;
}

function FolderGrid({ chapters, projectId, onSelect }: FolderGridProps) {
  const { files: rootFiles, notConfigured, isLoading, error } = useNextcloudFiles(projectId);

  if (notConfigured) {
    return (
      <EmptyState
        icon={<FolderOpen size={28} />}
        message="Dateien sind für dieses Projekt noch nicht konfiguriert."
      />
    );
  }

  return (
    <>
      {/* Phase folder cards — always visible regardless of Nextcloud status */}
      <div className="grid grid-cols-4 gap-[10px] mb-[20px] max-[768px]:grid-cols-2">
        {chapters.map((ch) => (
          <FolderCard
            key={ch.id}
            title={ch.title}
            order={ch.order}
            isSelected={false}
            onClick={() => onSelect(ch.order, ch.title)}
          />
        ))}
      </div>

      {/* Root-level files (if any) */}
      {error ? (
        <p className="text-[13px] text-[var(--text-tertiary)]">
          Dateien konnten nicht geladen werden.
        </p>
      ) : isLoading ? (
        <LoadingSkeleton lines={3} height="40px" />
      ) : rootFiles.filter((f) => f.type === 'file').length > 0 ? (
        <>
          <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] mb-[8px]">
            Allgemeine Dateien
          </h2>
          <div className="flex flex-col gap-[2px] mb-[16px]">
            {rootFiles
              .filter((f) => f.type === 'file')
              .map((f) => (
                <FileRow key={f.path} file={f} projectConfigId={projectId} />
              ))}
          </div>
        </>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Remove ChapterFiles import (no longer referenced)**

Verify no other files import `ChapterFiles`. Search:
```bash
grep -r "ChapterFiles" src/ --include="*.tsx" --include="*.ts"
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/projects/components/files/FilesPage.tsx
git commit -m "feat(nextcloud): FilesPage uses path-based navigation with FolderView"
```

---

## Task 8: Frontend — Rewrite `UploadSheet` with folder selection

**Files:**
- Rewrite: `src/modules/projects/components/UploadSheet.tsx`

- [ ] **Step 1: Rewrite UploadSheet**

```typescript
import { useState, useRef } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SideSheet } from '@/shared/components/ui/SideSheet';
import type { Project } from '../types/project';
import { useNextcloudFilesByPath, useUploadFileByPath, useCreateFolder } from '../hooks/useNextcloudFiles';

interface UploadSheetProps {
  project: Project;
  open: boolean;
  onClose: () => void;
}

export function UploadSheet({ project, open, onClose }: UploadSheetProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedChapter, setSelectedChapter] = useState('');
  const [selectedSubfolder, setSelectedSubfolder] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Build chapter folder names
  const chapterFolders = project.chapters.map((ch) => ({
    label: ch.title,
    value: `${String(ch.order).padStart(2, '0')}_${ch.title}`,
  }));

  // Load subfolders for selected chapter
  const { files: chapterContents, isLoading: loadingSubfolders } = useNextcloudFilesByPath(
    project.id,
    selectedChapter,
  );
  const subfolders = chapterContents.filter((f) => f.type === 'folder');

  // Upload target path
  const uploadPath = selectedSubfolder
    ? `${selectedChapter}/${selectedSubfolder}`
    : selectedChapter;

  const upload = useUploadFileByPath(project.id, uploadPath);
  const createFolder = useCreateFolder(project.id);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile || !selectedChapter) return;
    try {
      await upload.mutateAsync(selectedFile);
      toast.success('Datei hochgeladen', { description: selectedFile.name });
      setSelectedFile(null);
      onClose();
    } catch (err) {
      toast.error('Upload fehlgeschlagen', {
        description: (err as Error).message || 'Bitte erneut versuchen.',
      });
    }
  }

  async function handleCreateFolder() {
    if (!newFolderName.trim() || !selectedChapter) return;
    setIsCreatingFolder(true);
    try {
      const folderPath = `${selectedChapter}/${newFolderName.trim()}`;
      await createFolder.mutateAsync(folderPath);
      setSelectedSubfolder(newFolderName.trim());
      setNewFolderName('');
      toast.success('Ordner erstellt');
    } catch (err) {
      toast.error('Ordner konnte nicht erstellt werden');
    }
    setIsCreatingFolder(false);
  }

  return (
    <SideSheet open={open} onClose={onClose} title="Datei hochladen">
      <div className="p-6">
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] tracking-[-0.02em] mb-6">
          Datei hochladen
        </h2>

        <div className="flex flex-col gap-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-[var(--r-md)] p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-[var(--accent)] bg-[var(--accent-light)]'
                : selectedFile
                  ? 'border-[var(--committed)] bg-[#F0FDF4]'
                  : 'border-[var(--border)] hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            <Upload size={22} className="mx-auto mb-3 opacity-50" />
            {selectedFile ? (
              <p className="text-[13px] font-medium text-[var(--text-primary)]">{selectedFile.name}</p>
            ) : (
              <p className="text-[13px] text-[var(--text-secondary)]">
                Dateien hierher ziehen oder <strong className="text-[var(--accent)]">klicken</strong>
              </p>
            )}
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setSelectedFile(f); }}
            />
          </div>

          {/* Chapter selector */}
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
              Ordner
            </label>
            <select
              value={selectedChapter}
              onChange={(e) => { setSelectedChapter(e.target.value); setSelectedSubfolder(''); }}
              className="w-full px-[12px] py-[8px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
            >
              <option value="">— Ordner wählen —</option>
              {chapterFolders.map((cf) => (
                <option key={cf.value} value={cf.value}>{cf.label}</option>
              ))}
            </select>
          </div>

          {/* Subfolder selector (only when chapter selected and has subfolders) */}
          {selectedChapter && (
            loadingSubfolders ? (
              <div className="text-[12px] text-[var(--text-tertiary)]">Wird geladen...</div>
            ) : subfolders.length > 0 ? (
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                  Unterordner (optional)
                </label>
                <select
                  value={selectedSubfolder}
                  onChange={(e) => setSelectedSubfolder(e.target.value)}
                  className="w-full px-[12px] py-[8px] text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
                >
                  <option value="">— Hauptordner —</option>
                  {subfolders.map((sf) => (
                    <option key={sf.name} value={sf.name}>{sf.name}</option>
                  ))}
                </select>
              </div>
            ) : null
          )}

          {/* Create subfolder */}
          {selectedChapter && (
            <div className="flex items-center gap-2">
              <input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateFolder(); }}
                placeholder="Neuer Unterordner…"
                className="flex-1 px-[10px] py-[6px] text-[12px] bg-[var(--surface)] border border-[var(--border)] rounded-[var(--r-sm)] outline-none focus:border-[var(--accent)] transition-colors"
              />
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || isCreatingFolder}
                className="px-[10px] py-[6px] text-[11px] font-semibold text-[var(--accent)] border border-[var(--accent)] rounded-[var(--r-sm)] hover:bg-[var(--accent)] hover:text-white disabled:opacity-50 transition-colors"
              >
                {isCreatingFolder ? <Loader2 size={12} className="animate-spin" /> : 'Erstellen'}
              </button>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              className="px-[14px] py-[8px] text-[13px] text-[var(--text-secondary)] border border-[var(--border)] bg-[var(--surface)] rounded-[var(--r-sm)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
            >
              Abbrechen
            </button>
            <button
              onClick={handleUpload}
              disabled={!selectedFile || !selectedChapter || upload.isPending}
              className="px-[16px] py-[8px] text-[13px] font-semibold text-white bg-[var(--accent)] rounded-[var(--r-sm)] hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50 cursor-pointer"
            >
              {upload.isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
              Hochladen
            </button>
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/projects/components/UploadSheet.tsx
git commit -m "feat(nextcloud): rewrite UploadSheet with folder selection, remove step binding"
```

---

## Task 9: Build verification and manual QA

**Files:** None (testing only)

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: No new errors.

- [ ] **Step 3: Run dev server and test manually**

```bash
npm run dev
```

Test checklist:
1. Login as `reg@kamanin.at` / `Ubnfhf76!`
2. Open project Helferportal → Dateien tab
3. Verify 4 chapter cards show (Konzept, Design, Entwicklung, Launch)
4. Click "01_Konzept" → verify breadcrumbs: `Dateien > 01_Konzept`
5. Click "Neuer Ordner erstellen" → type "Test" → Erstellen
6. Verify "Test" folder appears in the list
7. Click "Test" → verify breadcrumbs: `Dateien > 01_Konzept > Test`
8. Click "Dateien" in breadcrumbs → verify back at root
9. From overview page → click "Datei hochladen" quick action
10. Verify UploadSheet shows chapter dropdown (no step selector)
11. Select a chapter → verify subfolder dropdown loads
12. Upload a file → verify it appears in Dateien tab

- [ ] **Step 4: Final commit with all changes**

```bash
git add -A
git commit -m "feat(nextcloud): folder navigation, creation, and folder-aware upload"
git push origin main
```

---

## Task 10: Update documentation

**Files:**
- Modify: `docs/CHANGELOG.md`
- Modify: `docs/system-context/DATABASE_SCHEMA.md`
- Modify: `docs/DECISIONS.md`
- Modify: `CLAUDE.md` (if needed)

- [ ] **Step 1: Update CHANGELOG.md**

Add entry:
```markdown
## 2026-03-22 — Nextcloud Folder Navigation & Creation

- **Added**: Subfolder browsing with drill-down navigation and breadcrumbs
- **Added**: Folder creation (recursive) from Dateien tab and UploadSheet
- **Added**: `mkdir` action in `nextcloud-files` Edge Function (WebDAV MKCOL)
- **Added**: `sub_path` parameter for `list` and `upload` actions
- **Changed**: UploadSheet now uses folder/subfolder selection instead of step binding
- **Removed**: Non-functional step-binding and note field from UploadSheet
- **Removed**: `ChapterFiles.tsx` — replaced by generic `FolderView.tsx`
- **Fixed**: Chapter folder cards no longer disappear when Nextcloud returns an error
```

- [ ] **Step 2: Update DATABASE_SCHEMA.md Edge Function section**

Update the `nextcloud-files` documentation to include `mkdir` action and `sub_path` parameter.

- [ ] **Step 3: Update DECISIONS.md**

Add ADR:
```markdown
## ADR-NNN: Remove step-binding from UploadSheet, replace with folder selection (2026-03-22)

**Context:** UploadSheet had a "Schritt zuordnen" dropdown that was non-functional (stub code, no Nextcloud integration). Unclear what step-binding would mean for file storage.

**Decision:** Replace step-binding with folder/subfolder selection. Files go to Nextcloud folders, not ClickUp task attachments. The folder structure (chapters) already maps to project phases.

**Consequences:** Simpler mental model — files live in folders, not attached to tasks. Future: if task-file linking is needed, it should be metadata in the database, not a storage path decision.
```

- [ ] **Step 4: Review CLAUDE.md for needed updates**

Check if `UploadSheet` or `ChapterFiles` are mentioned. Update any references. Add `FolderView.tsx` and `CreateFolderInput.tsx` to the file listing if the project structure section mentions individual files.

- [ ] **Step 5: Commit docs**

```bash
git add docs/ CLAUDE.md
git commit -m "docs: update CHANGELOG, DATABASE_SCHEMA, DECISIONS for Nextcloud folders"
git push origin main
```
