# Project Panel Redesign — Product Plan v2

> Source: Yuri's hands-on testing feedback + OpenClaw session 2026-03-21
> Status: Needs grounding audit against current codebase before implementation

---

## Problem Summary

Current project panel suffers from **5x duplication** of the same active task/step:
1. Main CTA card (hero)
2. "Needs your attention" card
3. "Aktueller Status" card
4. Action buttons area (Freigeben/Proofing)
5. "Letzte Aktualisierung" tab

The screen doesn't help the client make decisions — it echoes the same ClickUp entity everywhere.

---

## Target Architecture: Project Panel v2

### Header
- Project name
- Date range
- Phase progress (4 steps)
- Last synced timestamp

### Main CTA (single card)
**One highest-priority client action.**

Selection logic:
1. If manual override exists (ClickUp custom field `Show in CTA` / `Portal CTA`) → that task
2. Else → task in `client review` status with lowest `Milestone Order`
3. If no client review tasks → show current active phase without CTA

### Needs Your Attention (scrollable list)
- All remaining `client review` tasks except primary CTA
- Sorted by Milestone Order ASC
- Scrollable container with max-height if many items

### Project Status
- Project-level summary, NOT task duplication
- Content: current phase, progress, what's in progress, what's waiting, what's next
- **Rule-based / template-driven**, NOT AI-generated (v1)

### Quick Actions
**Mandatory:**
- Send Message (with required destination selector)
- Upload File (with required destination selector)

**Config-driven (project-specific):**
- Staging site link
- Figma link
- Call/Zoom link
- Email link
- Other custom links

**Quick Actions management:**
- Stored in Supabase project config (not hardcoded per client)
- Schema: `{ id, project_id, type, label, url, sort_order, is_active }`
- No admin panel yet — edit via DB directly
- UI renders only `is_active = true` with valid URL

### Tabs
1. **Messages** — project-scoped aggregated inbox (all tasks)
2. **Activity** — timeline of all project events (status changes, comments, uploads, approvals)
3. **Files** — project folders (4 standard + user-created), future Nextcloud sync

### Hidden from Client
- Internal operator memory
- Context/memory blocks
- "Add memory" button
- Admin tooling

---

## Product Rules

| # | Rule |
|---|------|
| R1 | Primary CTA: manual override → Milestone Order fallback among client review tasks |
| R2 | Attention list: all other client review tasks, scrollable, sorted by Milestone Order |
| R3 | Context/memory blocks hidden from client completely |
| R4 | Send Message requires mandatory destination selection |
| R5 | Destination options: "General Project Message" + all non-done tasks |
| R6 | Done tasks excluded from message destination selector |
| R7 | Approve = optional comment; Request Changes = required comment |
| R8 | Action logic identical in Task view and Project view |
| R9 | "Latest updates" = activity timeline, not summary |
| R10 | Files remain tab-based, must support folders + future Nextcloud sync |
| R11 | Quick actions are config-driven per project, not hardcoded |
| R12 | Project status text is rule-based / template-driven, not AI-generated |

---

## Communication Model

### Send Message Flow
1. Client clicks "Nachricht senden"
2. Must select destination:
   - "Allgemeine Projektnachricht" (General)
   - List of active (non-done) project tasks
3. Message sent to selected target

### General Project Message — Backend Question (OPEN)
Where does a general project message land in ClickUp?

**Preferred option:** Dedicated support task per project in ClickUp
- One system task per project (e.g., "Client Communication")
- All general messages go there
- Needs lifecycle management
- Must be hidden from normal task workflow noise

### Approve / Request Changes
- **Freigeben:** status change + optional comment input
- **Änderungen anfragen:** status change + **required** comment input
- Works identically in Workspace Tasks AND Project view

---

## Domain Boundaries (from Grounded Plan v3.1)

| Domain | Responsibilities |
|--------|-----------------|
| **ClickUp** | Tasks, statuses, client review, approvals, request changes, task-thread comments, general project message (dedicated task), CTA selection inputs (Portal CTA, Milestone Order, visibility, phase) |
| **Nextcloud** | Project files, folder hierarchy, file upload, file browsing, folder creation |
| **Supabase** | Cache tables, project config, quick action config, RLS, Edge Functions |
| **Portal UI** | Interpretation layer, template-driven summaries, action routing |

---

## Open Questions for Grounding Audit

1. **CTA field:** Does `Portal CTA` custom field already exist in ClickUp? What's its ID?
2. **Milestone Order:** How is it currently extracted and used?
3. **General message task:** Is there already a project-level support task pattern?
4. **Quick actions config:** Is there existing project metadata in Supabase we can extend?
5. **Project status text:** What generates current descriptive text? AI or hardcoded?
6. **Real-time sync:** What's the current state of project view refresh/sync?
7. **Memory/context blocks:** What components render them currently?
8. **Approve/request changes:** Current implementation — does it support comments?

---

## Files (from Grounded Plan v3.1)

### Rules
- **F1:** Portal files are Nextcloud-native, not ClickUp-attachment-native
- **F2:** Files tab must read from project ↔ Nextcloud mapping, not task attachment cache
- **F3:** ClickUp = workflow/communication; Nextcloud = file storage
- **F4:** Do not design client file UX around task attachments

### Current Status
- Files tab exists but was designed around ClickUp attachments
- Needs to be rebuilt as Nextcloud-backed project file browser
- Separate integration stream required

---

## What Stays Unchanged
- Portal CTA override mechanism
- Milestone Order fallback
- Task-backed messaging model
- Quick actions in Supabase config
- Scrollable attention list
- Dedicated general message task pattern
