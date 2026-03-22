# Nextcloud Folder Structure — Design Spec

> Date: 2026-03-22
> Status: Approved by user
> Scope: Standard folder hierarchy, portal visibility rules, auto-creation, migration

---

## Problem

Current Nextcloud structure is chaotic — each client has a different layout. Files get duplicated between "team" and "client" folders. No standard for where task attachments go. Portal currently maps only project folders (`project_config.nextcloud_root_path`), missing the broader client-level hierarchy.

## Design

### Three-Level Access Model

```
kunden/{client-slug}/
├── _intern/              ← Owner-only (Yuri + future partners)
│   ├── vertraege/        ← Contracts, NDAs, DPAs
│   ├── buchhaltung/      ← Invoices, financial docs
│   ├── notizen/          ← Internal strategic notes
│   └── zugaenge/         ← Credentials (encrypted)
│
├── team/                 ← Owner + team (Mihael, Matic, Diana)
│   ├── dev/              ← Dev artifacts, backups, exports
│   ├── staging/          ← Test data, staging configs
│   └── assets/           ← Working PSD, Figma exports, raw files
│
├── portal/               ← Owner + team + client (visible in portal)
│   ├── projekte/
│   │   └── {projekt-slug}/
│   │       ├── {chapter_folder}/    ← from chapter_config, not hardcoded
│   │       ├── {chapter_folder}/
│   │       └── ...
│   │
│   ├── aufgaben/         ← Task-related files
│   │   └── {YYYY-MM}_{thema-slug}/  ← auto-created on upload
│   │
│   ├── dokumente/        ← General shared docs (SOPs, guidelines)
│   ├── branding/         ← Logos, fonts, brand guidelines
│   └── uploads/          ← General client uploads (not task-specific)
```

### Access Matrix

| Who | `_intern/` | `team/` | `portal/` | How |
|-----|-----------|---------|-----------|-----|
| Owner (Yuri) | Full | Full | Full | Nextcloud owner |
| Team (freelancers) | No access | Full | Full | Nextcloud share on `team/` + `portal/` |
| Client | No access | No access | Read + Upload | Portal Edge Function only |

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Client slug | lowercase, hyphens | `mbm`, `helferportal`, `psm` |
| Project slug | lowercase, hyphens | `website-redesign`, `shop-migration` |
| Chapter folder | `{sort_order:02d}_{title_slug}` from `chapter_config` | `01_konzept`, `02_design` |
| Task folder | `{YYYY-MM}_{thema-slug}` | `2026-03_seo-audit` |

### Chapter Folder Naming — Dynamic from DB

Current Edge Function hardcodes `{sort_order:02d}_{title}`. Change to read from `chapter_config`:

```
chapter_config.title = "Konzept"
chapter_config.sort_order = 1
→ folder name: "01_konzept" (lowercase, special chars → hyphens)
```

The `slugify()` function normalizes: lowercase, replace spaces/special chars with hyphens, trim.

### Aufgaben Auto-Creation

When a client uploads a file to a task through the portal:

1. Portal sends upload with `task_name` and `task_date` (or current month)
2. Edge Function builds folder path: `portal/aufgaben/{YYYY-MM}_{task-slug}/`
3. If folder doesn't exist → `MKCOL` creates it automatically
4. File uploaded into that folder

No manual folder creation needed. The folder appears in Nextcloud for the team automatically.

### Database Changes

**New column on `profiles` (or `project_access`):**
```sql
-- Client-level Nextcloud root (above project level)
ALTER TABLE profiles ADD COLUMN nextcloud_client_root text;
-- Example: "/kunden/mbm/portal"
```

**Existing column stays:**
```
project_config.nextcloud_root_path
-- Example: "/kunden/mbm/portal/projekte/website-redesign"
-- This is already used by the Edge Function
```

**Relationship:**
```
profiles.nextcloud_client_root = "/kunden/mbm/portal"
project_config.nextcloud_root_path = "{client_root}/projekte/{project-slug}"
```

### Edge Function Changes

**`nextcloud-files/index.ts`:**

1. **Chapter folder naming:** Replace hardcoded `{sort_order:02d}_{title}` with `slugify(title)`:
   ```typescript
   function buildChapterFolder(sortOrder: number, title: string): string {
     const slug = title.toLowerCase()
       .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
       .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
     return `${String(sortOrder).padStart(2, '0')}_${slug}`;
   }
   ```

2. **New action: `upload-task-file`:**
   - Input: `project_config_id` (for access authorization via `project_access` only), `task_name`, `task_date` (ISO), file
   - Upload destination path is derived from `profiles.nextcloud_client_root` (not from `project_config.nextcloud_root_path`)
   - `task_name` is slugified per `buildChapterFolder` pattern (lowercase, umlauts → ae/oe/ue, special chars → hyphens)
   - **If slug result is empty → reject with `BAD_REQUEST`**
   - Assembled sub_path `aufgaben/{YYYY-MM}_{slug}` must pass `isPathSafe()` before any MKCOL or PUT
   - Resolved full path must be prefix-checked against `nextcloud_client_root`
   - Auto-creates folder via MKCOL if missing
   - Uploads file

3. **New action: `browse-client`:**
   - Input: `sub_path` (optional, relative to client root)
   - Authorization: derives `nextcloud_client_root` from the authenticated user's own `profiles` row using `user.id` from JWT. No `profile_id` in request body — the function knows the caller from the token.
   - **Path security:** `sub_path` must pass `isPathSafe()`. The resolved full path must be prefix-checked against `nextcloud_client_root` before any WebDAV operation. This prevents traversal to `_intern/` or `team/` via `../`.
   - Lists files in the client-level portal folder (not just project)
   - Used for: dokumente/, branding/, uploads/, aufgaben/
   - Reads `nextcloud_client_root` via user-scoped Supabase client (user can read their own profile row — service-role NOT required)

### Portal UI Changes

**Files tab in project view** — no change (already reads from `project_config.nextcloud_root_path`).

**New: Client Files page** (future, not in this sprint):
- Shows `dokumente/`, `branding/`, `uploads/`, `aufgaben/`
- Accessible from sidebar under client workspace
- Uses `browse-client` action with `profiles.nextcloud_client_root`

**Task file upload** — when uploading a file from task detail:
- Use `upload-task-file` action
- Auto-creates `aufgaben/{YYYY-MM}_{task-slug}/` folder
- File lands in the right place without user choosing a folder

---

## Migration Plan — MBM Only

### Current → New mapping:

| Current path | New path | Action |
|---|---|---|
| `MBM/01_DOC/BuHa/` | `kunden/mbm/_intern/buchhaltung/` | Move |
| `MBM/MBM_dev/01_DOKU/` (contracts) | `kunden/mbm/_intern/vertraege/` | Move |
| `MBM/MBM_dev/` (dev files) | `kunden/mbm/team/dev/` | Move |
| `MBM/MBM_dev/LOGO-new/` | `kunden/mbm/portal/branding/` | Move |
| `MBM/AUDIT/` | `kunden/mbm/portal/dokumente/` | Move |
| `MBM/MBM_dev/PROJ/` | `kunden/mbm/team/dev/proj/` | Move (internal projects) |

### Steps:
1. Create folder structure in Nextcloud: `kunden/mbm/{_intern,team,portal}/`
2. Move files (Nextcloud web UI or WebDAV)
3. **Rename existing chapter folders** to match new slugified convention (e.g., `01_Konzept` → `01_konzept`) before deploying Edge Function change
4. Update `project_config.nextcloud_root_path` for MBM project
5. Add `nextcloud_client_root` to MBM profile
6. Verify portal still shows files correctly
7. Archive old `MBM/` folder (don't delete yet)

---

## Security Notes

- **Single service account:** Nextcloud credentials (`NEXTCLOUD_USER`, `NEXTCLOUD_PASS`) are a shared service account with access to all `kunden/` folders. Client isolation relies entirely on Edge Function path-scoping. This is acceptable for a small agency but is a known architectural constraint.
- **Path traversal defense:** All `sub_path` and `task_name` inputs pass `isPathSafe()` (rejects `..`, null bytes, control chars). Resolved paths are prefix-checked against `nextcloud_client_root` before any WebDAV call.
- **Auth anchoring:** All client-facing actions derive the Nextcloud root from the authenticated user's own JWT/profile, never from request body parameters.

## What's NOT in Scope

- Admin panel for managing folder structure
- Client Files page in portal sidebar (future feature)
- Migration of clients other than MBM
- Nextcloud sharing automation (manual Nextcloud share setup)
- File versioning or conflict resolution

## Success Criteria

- [ ] MBM files accessible through portal with new path structure
- [ ] Chapter folders created from `chapter_config.title`, not hardcoded
- [ ] Task upload auto-creates `aufgaben/{YYYY-MM}_{slug}/` folder
- [ ] `_intern/` and `team/` folders NOT accessible through portal
- [ ] Existing portal file browsing still works (no regression)
