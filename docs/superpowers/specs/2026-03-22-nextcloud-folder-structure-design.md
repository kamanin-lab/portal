# Nextcloud Folder Structure — Design Spec

> Date: 2026-03-22
> Status: Approved (rev.3 — user feedback integrated)
> Scope: Standard folder hierarchy, portal visibility, auto-creation, normalization, navigation, migration

---

## Problem

Current Nextcloud structure is chaotic — each client has a different layout. Files get duplicated between "team" and "client" folders. No standard for where task attachments go. Portal maps only project folders, missing client-level hierarchy. No sidebar access to files. Projects sidebar has no submenu for multiple projects.

## Design

### Three-Level Access Model

```
clients/{client-slug}/
├── _intern/                  ← Owner-only (Yuri + future partners)
│   ├── vertraege/            ← Contracts, NDAs, DPAs
│   ├── buchhaltung/          ← Invoices, financial docs
│   └── notizen/              ← Internal strategic notes
│
├── team/                     ← Owner + team (freelancers)
│   ├── dev/                  ← Dev artifacts, backups, staging configs
│   ├── assets/               ← Working PSD, Figma exports, raw photos
│   ├── audit/                ← Site audits, SEO reports, performance
│   ├── export/               ← Data exports, templates, migration files
│   └── archiv/               ← Old versions, deprecated work
│
├── portal/                   ← Owner + team + client (visible in portal)
│   ├── projekte/
│   │   └── {projekt-slug}/
│   │       ├── {NN}_{chapter-slug}/   ← from chapter_config (normalized)
│   │       └── ...
│   │
│   ├── aufgaben/             ← Task-related files
│   │   └── {YYYY-MM}_{thema-slug}/    ← auto-created on upload
│   │
│   ├── dokumente/            ← Shared docs (scope of work, SOPs, guidelines)
│   ├── branding/             ← Logos, fonts, brand guidelines, colors
│   ├── empfehlungen/         ← Monthly reports + recommendations
│   │   └── {YYYY-MM}_monatsbericht/  ← auto-created per month
│   └── uploads/              ← General client uploads (not task-specific)
```

### Empfehlungen (Monthly Recommendations — future)

Each month the agency delivers:
- Summary of completed work
- Recommendations for next month (AI-assisted analysis in future)
- Attached reports (PDF, screenshots, audit results)

Folder: `portal/empfehlungen/{YYYY-MM}_monatsbericht/`
Portal: dedicated "Empfehlungen" page (future — ClickUp tasks with tag "recommendation")
This is a large future feature. For now: folder structure is ready, portal page is out of scope.

### _intern contains ONLY client contracts

`_intern/vertraege/` stores contracts **with the client** (Angebot, Vertrag, DPA with client).
Freelancer/team contracts (Subcontractor agreements, DPAs with team members) belong in `_agentur/team-vertraege/` — NOT in the client folder, because one freelancer works across multiple clients.

### Team Folder Rationale (from file tree analysis)

Patterns found across existing clients:

- `MBM_dev/` → `team/dev/` (dev artifacts, plugin files, configs)
- `MBM_dev/02_Archive/` → `team/archiv/` (old versions)
- `MBM_dev/Audit/`, `PSM/ADS/` → `team/audit/` (audits, reports)
- `MBM_dev/Export-Templates/` → `team/export/` (data exports)
- `MASUR/PIC/`, `PSM/FOTO/` → `team/assets/` (working photos, raw files)

### Access Matrix

| Who                     | `_intern/` | `team/`   | `portal/`     | How                                    |
| ----------------------- | ---------- | --------- | ------------- | -------------------------------------- |
| Owner (Yuri + partners) | Full       | Full      | Full          | Nextcloud owner                        |
| Team (freelancers)      | No access  | Full      | Full          | Nextcloud share on `team/` + `portal/` |
| Client                  | No access  | No access | Read + Upload | Portal Edge Function only              |

---

## Normalization — Universal `slugify()` Function

ALL folder names derived from user input (chapter titles, task names, project names) pass through a single `slugify()` function:

```typescript
function slugify(input: string, maxLength = 60): string {
  return input
    .toLowerCase()
    .replace(/[äÄ]/g, "ae")
    .replace(/[öÖ]/g, "oe")
    .replace(/[üÜ]/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-") // all non-alphanumeric → hyphens
    .replace(/^-|-$/g, "") // trim leading/trailing hyphens
    .slice(0, maxLength); // truncate long names
}
```

### Where it applies:

| Source                  | Input example            | Output                       | Max length |
| ----------------------- | ------------------------ | ---------------------------- | ---------- |
| `chapter_config.title`  | "Konzept & Strategie"    | `01_konzept-strategie`       | 60         |
| Task name (from client) | "Bitte Logo ändern!! 🙏" | `2026-03_bitte-logo-aendern` | 60         |
| Project name            | "Website Redesign 2026"  | `website-redesign-2026`      | 60         |
| Client name             | "MBM Möbel"              | `mbm-moebel`                 | 40         |

### Task name normalization

Client-written task names are often messy. The slug is built from `task_name`:

1. `slugify(task_name, 50)` — lowercase, hyphens, truncated
2. Prepend `{YYYY-MM}_` from `task_date` or current month
3. Result: `2026-03_bitte-logo-aendern`
4. If slug is empty after normalization → reject with `BAD_REQUEST`

### Chapter folder naming

```
chapter_config.title = "Konzept & Strategie"
chapter_config.sort_order = 1
→ folder name: "01_konzept-strategie"
```

Display in portal UI uses the original `chapter_config.title` (with capitals, spaces).
Filesystem folder uses the slugified version. The Edge Function translates between them.

---

## Portal UI Changes (IN SCOPE)

### 1. Sidebar: Add "Dateien" navigation item

**File:** `src/shared/lib/workspace-routes.ts`

Current tickets workspace has children: `[Aufgaben, Support]`.
Add a new **global** nav item "Dateien" after "Meine Aufgaben":

```typescript
// In SidebarGlobalNav or as a third workspace
{ path: '/dateien', label: 'Dateien', icon: 'folder' }
```

This opens the Client Files page showing: `projekte/`, `aufgaben/`, `dokumente/`, `branding/`, `uploads/`.

### 2. Sidebar: Projects submenu for multiple projects

**File:** `src/shared/lib/workspace-routes.ts`

Current `projects` workspace has `children: []` (no submenu).
Change to list each project as a child:

```typescript
projects: [
  {
    path: "/projekte/website-redesign",
    label: "Website Redesign",
    icon: "folder-kanban",
  },
  {
    path: "/projekte/shop-migration",
    label: "Shop Migration",
    icon: "folder-kanban",
  },
];
```

Children are populated dynamically from `useProjects()` hook (already exists, returns `ProjectSummary[]`).

### 3. Client Files page

**New route:** `/dateien`
**New page:** `src/modules/files/pages/DateienPage.tsx`

Shows the client-level portal folder structure:

- Folder cards for: Projekte, Aufgaben, Dokumente, Branding, Uploads
- Click into any folder → breadcrumb navigation (reuse existing `FolderView` pattern)
- Uses `browse-client` Edge Function action

### 4. Project files access

From the project overview, files are already accessible via the Files tab.
Additionally, clicking "Projekte" folder in DateienPage shows all project folders.

---

## Edge Function Changes

**`nextcloud-files/index.ts`:**

1. **Shared `slugify()` function** — extracted to `_shared/slugify.ts`, used by all path-building logic

2. **Chapter folder naming:** Replace hardcoded `{sort_order:02d}_{title}` with `slugify()`:

   ```typescript
   function buildChapterFolder(sortOrder: number, title: string): string {
     return `${String(sortOrder).padStart(2, "0")}_${slugify(title)}`;
   }
   ```

3. **New action: `upload-task-file`:**
   - Input: `project_config_id` (for access authorization via `project_access` only), `task_name`, `task_date` (ISO), file
   - Upload destination derived from `profiles.nextcloud_client_root`
   - `task_name` slugified: `slugify(task_name, 50)`
   - **If slug is empty → reject with `BAD_REQUEST`**
   - Assembled path `aufgaben/{YYYY-MM}_{slug}` passes `isPathSafe()` + prefix check
   - Auto-creates folder via MKCOL if missing

4. **New action: `browse-client`:**
   - Input: `sub_path` (optional, relative to client portal root)
   - Auth: derives `nextcloud_client_root` from authenticated user's own `profiles` row (JWT)
   - **Path security:** `sub_path` passes `isPathSafe()`, resolved path prefix-checked against `nextcloud_client_root`
   - Used for: dokumente/, branding/, uploads/, aufgaben/

---

## Database Changes

**New column on `profiles`:**

```sql
ALTER TABLE profiles ADD COLUMN nextcloud_client_root text;
-- Example: "/clients/mbm/portal"
-- Read via user-scoped client (user reads own row, no service-role needed)
```

**Existing column stays:**

```
project_config.nextcloud_root_path = "/clients/mbm/portal/projekte/website-redesign"
```

---

## Migration Plan — MBM Only

### Current → New mapping:

| Current path | New path | Action |
|---|---|---|
| `MBM/01_DOC/BuHa/` | `clients/mbm/_intern/buchhaltung/` | Move |
| `MBM/FUREMA/`, client contracts | `clients/mbm/_intern/vertraege/` | Move (client contracts ONLY) |
| `MBM/MBM_dev/01_DOKU/` (freelancer contracts) | `_agentur/team-vertraege/` | Move (NOT in client folder) |
| `MBM/MBM_dev/` (dev files, plugins, configs) | `clients/mbm/team/dev/` | Move |
| `MBM/MBM_dev/02_Archive/` | `clients/mbm/team/archiv/` | Move |
| `MBM/MBM_dev/Audit/` | `clients/mbm/team/audit/` | Move |
| `MBM/MBM_dev/Export-Templates/` | `clients/mbm/team/export/` | Move |
| `MBM/MBM_dev/LOGO-new/` | `clients/mbm/portal/branding/` | Move |
| `MBM/LOGO/` | `clients/mbm/portal/branding/` | Move |
| `MBM/AUDIT/` | `clients/mbm/portal/dokumente/` | Move |
| `MBM/MBM_dev/Legal documents for WLA Lite/` | `clients/mbm/portal/dokumente/` | Move |
| `MBM/2025-09-09_Meeting/` | `clients/mbm/_intern/notizen/` | Move |
| `MBM/projects/ERP/` | `clients/mbm/portal/projekte/erp/` | Move |

### Steps:

1. Create folder structure in Nextcloud: `clients/mbm/{_intern,team,portal}/`
2. Create portal subfolders: `projekte/`, `aufgaben/`, `dokumente/`, `branding/`, `uploads/`
3. Move files (Nextcloud web UI or WebDAV)
4. **Rename existing chapter folders** to match slugified convention (`01_Konzept` → `01_konzept`)
5. Update `project_config.nextcloud_root_path` for MBM project
6. Add `nextcloud_client_root` to MBM profile in Supabase
7. Set up Nextcloud shares: team gets `team/` + `portal/`
8. Verify portal still shows files correctly
9. Archive old `MBM/` folder (don't delete yet)

---

## Security Notes

- **Single service account:** Nextcloud credentials are shared. Client isolation relies on Edge Function path-scoping. Acceptable for current scale.
- **Path traversal defense:** All inputs pass `isPathSafe()` + resolved path prefix-checked against root.
- **Auth anchoring:** All client-facing actions derive Nextcloud root from JWT, never from request body.
- **Slug validation:** Empty slugs rejected. Max length enforced. No raw user input in paths.

## What's NOT in Scope

- Admin panel for managing folder structure
- Nextcloud sharing automation (manual setup for now)
- Migration of clients other than MBM
- File versioning or conflict resolution
- `_intern/` or `team/` access through portal (future: operator/admin view)

## Success Criteria

- [ ] MBM files accessible through portal with new path structure
- [ ] Chapter folders created from `chapter_config.title` via `slugify()`, not hardcoded
- [ ] Task upload auto-creates `aufgaben/{YYYY-MM}_{slug}/` folder
- [ ] `_intern/` and `team/` folders NOT accessible through portal
- [ ] "Dateien" item in sidebar navigation, opens Client Files page
- [ ] Projects sidebar shows submenu with multiple projects
- [ ] All folder names normalized via shared `slugify()` function
- [ ] Existing project file browsing still works (no regression)
