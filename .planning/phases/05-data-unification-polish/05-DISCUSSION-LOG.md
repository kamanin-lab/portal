# Phase 5: Data Unification & Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 05-data-unification-polish
**Areas discussed:** FilesTab data clarity, Context section placement

---

## FilesTab Data Clarity

### Q1: What should the overview FilesTab show?

| Option | Description | Selected |
|--------|-------------|----------|
| Nextcloud recent files | Switch to useNextcloudFiles — show last 8 files across all project folders from Nextcloud | ✓ |
| Folder cards only | Show the 4 chapter folders as cards, click navigates to DateienPage | |
| Remove FilesTab from overview | Keep files only on the dedicated DateienPage route | |

**User's choice:** Nextcloud recent files
**Notes:** Files must be scoped to current project's Nextcloud folder path.

### Q2: What happens when a user clicks a file?

| Option | Description | Selected |
|--------|-------------|----------|
| Direct download | Click triggers Nextcloud download immediately | ✓ |
| Navigate to DateienPage | Click navigates to the full DateienPage at the file's folder location | |
| You decide | Claude picks best UX | |

**User's choice:** Direct download
**Notes:** User emphasized that file path must be correct for the current project (project-scoped Nextcloud path).

### Q3: Source label needed?

| Option | Description | Selected |
|--------|-------------|----------|
| No label needed | Files are files — users don't care where they come from | ✓ |
| Subtle source hint | Small text like "Aus Nextcloud" | |
| You decide | Claude picks | |

**User's choice:** No label needed

### Q4: Task detail files (StepFilesTab)?

**User's extended input:** ClickUp API doesn't support file attachments. User wants a system where:
1. When a task is created in ClickUp, a corresponding folder is auto-created in Nextcloud inside the chapter folder
2. Files uploaded to that folder appear in the task detail AND in the overview recent files
3. Example: Chapter "Konzept" → Task "Moodboard" → Folder `Konzept/Moodboard/` in Nextcloud

### Q5: Scope decision — auto-creating Nextcloud folders per task

| Option | Description | Selected |
|--------|-------------|----------|
| Include in Phase 5 | Expand scope: auto-create task folders + task-scoped files in detail modal | ✓ |
| Defer to backlog | Phase 5 only fixes overview FilesTab | |
| Partial: manual mapping | No auto-creation, but show files if matching folder exists | |

**User's choice:** Include in Phase 5

### Q6: When should task folders be auto-created?

| Option | Description | Selected |
|--------|-------------|----------|
| On ClickUp task creation | Webhook triggers folder creation | ✓ |
| On first file upload | Folder created lazily | |
| You decide | Claude picks | |

**User's choice:** On ClickUp task creation

### Q7: Folder naming

| Option | Description | Selected |
|--------|-------------|----------|
| Task name only | e.g., "Moodboard/" | ✓ |
| Order + task name | e.g., "01_Moodboard/" | |
| You decide | Claude picks | |

**User's choice:** Task name only

---

## Context Section Placement

### Q1: Where should ProjectContextSection appear?

**User's choice:** "Нигде пока, убираем это из плана." (Nowhere for now, removing from plan)
**Notes:** DATA-01 deferred entirely. Components exist but should not be rendered yet.

### Q2: Admin panel location?

**User's choice:** "Это всё позже, запиши в идеи" (All of this later, write to ideas)
**Notes:** DATA-05 deferred. Added ProjectContext info to `docs/ideas/admin-dashboard.md`.

---

## Claude's Discretion

- Tab transition animation duration and easing (DATA-03)
- PhaseTimeline skeleton shape (DATA-04)
- StepFilesTab fallback when no matching Nextcloud folder exists

## Deferred Ideas

- DATA-01: ProjectContextSection on OverviewPage → admin dashboard scope
- DATA-05: ProjectContextAdminPanel refactor → admin dashboard scope
- ENRICH-02: Manual re-enrichment trigger → admin dashboard scope
