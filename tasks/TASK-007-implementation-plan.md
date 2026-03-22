# TASK-007: Implementation Plan — Nextcloud Folder Structure + Portal Navigation

## Context
Spec: `docs/superpowers/specs/2026-03-22-nextcloud-folder-structure-design.md` (rev.4, approved)
MBM files already reorganized locally in `MBM/kunden/` folder.

## Scope: 5 Work Items

---

### Item 1: Shared `slugify()` function

**Create:** `supabase/functions/_shared/slugify.ts`
```typescript
export function slugify(input: string, maxLength = 60): string {
  return input
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
}
```

**Modify:** `supabase/functions/nextcloud-files/index.ts`
- Import `slugify` from `../_shared/slugify.ts`
- Replace hardcoded chapter folder naming (line ~183) with:
  ```typescript
  function buildChapterFolder(sortOrder: number, title: string): string {
    return `${String(sortOrder).padStart(2, '0')}_${slugify(title)}`;
  }
  ```

**Also create frontend copy:** `src/shared/lib/slugify.ts` (same function, for client-side use)

---

### Item 2: Database changes + browse-client & upload-task-file actions

**Database (via Supabase SQL endpoint):**
```sql
ALTER TABLE profiles ADD COLUMN nextcloud_client_root text;
-- Set for MBM test user
UPDATE profiles SET nextcloud_client_root = '/kunden/mbm/portal' WHERE email = 'test-client@example.com';
```

**Modify:** `supabase/functions/nextcloud-files/index.ts`
- Add `browse-client` action:
  - Get `nextcloud_client_root` from authenticated user's profile (JWT → user.id → profiles row)
  - Accept optional `sub_path`
  - `isPathSafe()` on sub_path + prefix check against client root
  - PROPFIND on resolved path, return files/folders
- Add `upload-task-file` action:
  - Accept `project_config_id` (auth check via project_access), `task_name`, `task_date`, file
  - Build path: `aufgaben/{YYYY-MM}_{slugify(task_name, 50)}/`
  - Reject if slug empty
  - isPathSafe() + prefix check
  - MKCOL if folder missing, then PUT file

---

### Item 3: Sidebar — "Dateien" nav item

**Modify:** `src/shared/lib/workspace-routes.ts`
- Add `files` workspace or add as global nav item:
```typescript
// Option: add as third workspace
{ id: 'default-files', profile_id: '', module_key: 'files', display_name: 'Dateien', icon: 'folder', sort_order: 3, is_active: true, created_at: '' }
```

**Modify:** `src/shared/components/layout/SidebarWorkspaces.tsx`
- Add `Folder` to ICON_MAP: `'folder': Folder` (from lucide-react)

**Modify:** workspace-routes.ts:
```typescript
WORKSPACE_ROUTES: { ..., files: '/dateien' }
WORKSPACE_CHILDREN: { ..., files: [] }
```

**Create route:** `src/app/routes.tsx` — add `/dateien` route pointing to new DateienPage

---

### Item 4: Sidebar — Projects submenu (dynamic)

**Modify:** `src/shared/components/layout/SidebarWorkspaces.tsx`
- For `projects` workspace: dynamically populate children from `useProjects()` hook
- Each project becomes a child link: `{ path: '/projekte/{id}', label: project.name, icon: 'folder-kanban' }`
- Need to call `useProjects()` in the sidebar or pass projects down from AppShell

**Modify:** `src/shared/lib/workspace-routes.ts`
- Remove static empty `projects: []` children
- Children will be injected dynamically

---

### Item 5: Client Files page (DateienPage)

**Create:** `src/modules/files/pages/DateienPage.tsx` (~100 lines)
- Shows folder cards for: Projekte, Aufgaben, Dokumente, Branding, Uploads
- Uses `useClientFiles()` hook (new) that calls `browse-client` action
- Click folder → navigate to sub-path view with breadcrumbs

**Create:** `src/modules/files/hooks/useClientFiles.ts` (~60 lines)
- Calls `nextcloud-files` Edge Function with `action: 'browse-client'`
- React Query with key `['client-files', subPath]`
- Reuses `NextcloudFile` type from projects module

**Create:** `src/modules/files/components/ClientFolderView.tsx` (~80 lines)
- Breadcrumb navigation
- File/folder list (reuse `FileRow`, `FolderCard` from projects module)
- Upload button for current folder

---

## Commit Structure

| Commit | Content |
|--------|---------|
| 1 | slugify() shared function + chapter folder naming fix |
| 2 | DB migration + browse-client + upload-task-file Edge Function actions |
| 3 | Sidebar: Dateien nav item + Projects dynamic submenu |
| 4 | DateienPage + useClientFiles hook + ClientFolderView |

## Verification

1. `npm run build` passes
2. All tests pass
3. Sidebar shows "Dateien" with folder icon
4. Sidebar shows project submenu under "Projekte"
5. `/dateien` page renders folder cards
6. Click into folder → breadcrumb navigation works
7. Browse-client Edge Function returns files from Nextcloud
8. Chapter folders use slugified names
