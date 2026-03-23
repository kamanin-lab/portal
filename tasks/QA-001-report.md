# QA Report -- Full Portal Static Analysis
Date: 2026-03-23
Environment: src/ static analysis + build + test suite

## Summary

| Item | Result |
|---|---|
| Pages analyzed | 9 |
| TypeScript build | PASS |
| ESLint (src/ only) | PASS |
| Test suite 77/77 | PASS |
| Blocking issues | 2 |
| Non-blocking issues | 2 |

## Build Verification

### TypeScript Build -- PASS
Result: ok (no errors). Clean compilation.

### ESLint -- PASS for src/
All errors confined to archive/legacy-reference/ (not deployed) and supabase/functions/ (Deno runtime).
Zero errors in src/modules/, src/shared/, src/app/.

### Test Suite -- PASS
11 test files, 77 tests, all pass.
New tests: support-chat.test.tsx, task-detail-sheet.test.tsx, task-list-search.test.ts
Coverage: TaskDetailSheet loading/error/not-found states; SupportChat onRead; filterTasks + matchesTaskSearch

## Data Flow Verification

### Inbound -- PASS
ClickUp -> Webhook -> Edge Function -> Cache Table -> Realtime -> UI

- useClickUpTasks reads task_cache with profile_id + is_visible=true (RLS compliant)
- transformCachedTask overrides raw_data with top-level columns (architecture rule 4 -- COMPLIANT)
- Realtime subscription on task_cache filtered by profile_id, debounced 300ms -- COMPLIANT
- 30s polling fallback in useUnreadCounts on connectionStatus=error -- COMPLIANT
- Background refresh on mount catches missed changes -- COMPLIANT

### Outbound -- PASS
UI Action -> Edge Function -> ClickUp API -> Webhook -> Cache Update

- useTaskActions -> update-task-status Edge Function -> ClickUp API
- On success: invalidates clickup-tasks and needs-attention-count queries
- Toast feedback in German from dict.toasts

## Status Transitions Verification

Per STATUS_TRANSITION_MATRIX.md:

| Portal Status        | Expected Actions                        | Result          |
|----------------------|-----------------------------------------|-----------------|
| Open                 | Hold, Cancel                            | PASS            |
| In Progress          | Hold, Cancel                            | PASS            |
| Needs Your Attention | Approve, Request Changes, Hold, Cancel  | PASS            |
| Approved             | Hold, Cancel                            | PASS            |
| Done                 | (none -- terminal)                      | PASS            |
| Cancelled            | (none -- terminal)                      | PASS            |
| On Hold              | Resume, Cancel                          | FAIL (BLOCKING) |

## Edge Cases

| Scenario | Result |
|---|---|
| Webhook before task cached (race condition) | PASS -- useSingleTask fallback to fetch-single-task |
| Realtime fails (30s polling) | PASS -- useUnreadCounts setInterval(30000) |
| raw_data stale, top-level status fresh | PASS -- transformCachedTask overrides correctly |
| Multi-profile visibility | PASS -- RLS filter on profile_id confirmed |
| Portal comments not overwritten by sync | PASS -- display_text takes priority over comment_text |
| Edge Function error response | PASS -- German error toast shown |

## Page-by-Page Results

### Login (/login) -- PASS
Full German UI, all three modes. STAGING_AUTH_BYPASS = false. Redirects to /inbox.

### Inbox (/inbox) -- PASS
Paginated notifications (10/page), type badges in German, mark-read on click.
Filters out support task notifications correctly.

### Tasks/Aufgaben (/tickets) -- PASS
Renders from task_cache, filter chips, sorts needs_attention first.
Search by name/description/list_name correct.
CreditBalance, SyncIndicator with manual refresh, Filter panel present.
TaskDetailSheet via ?taskId=xxx URL param -- COMPLIANT.

### Task Detail Sheet -- PASS (except on_hold action)
Loading/error/not-found states with German messages.
useSingleTask fallback when task not in cache.
Credits badge shown when task.credits > 0.
mapStatus() used for all comparisons -- COMPLIANT (rule 8).

### Support (/support) -- PASS
useSupportTaskChat uses same pipeline as TaskDetail -- COMPLIANT.
isConfigured gate prevents CommentInput when no support_task_id.

### Dateien (/dateien) -- PASS
5 root folder cards: Projekte, Aufgaben, Dokumente, Branding, Uploads.
Sub-folder navigation via ClientFolderView.

### Projects (/projekte) -- PASS
Single useProjectComments source for activity feed and messages tab.
Three tabs: Aktivitaet, Dateien, Nachrichten.

### Konto (/konto) -- PASS
ProfileSection, EmailSection, PasswordSection, NotificationSection all present.
Sign out button, all text German.

### Sidebar / Navigation -- PASS
3-zone Linear-style (Global / Workspaces / Utilities) -- COMPLIANT.
Unread badges, attention count, dynamic project sub-items from useProjects().

### Mobile -- PASS (code-level)
BottomNav with Inbox/Aufgaben/Support/Mehr, unread badges.
MobileHeader + MobileSidebarOverlay on mobile.

## Critical Issues (must fix before launch)

### BLOCKING-1: TaskActions -- On Hold status shows wrong actions
File: src/modules/tickets/components/TaskActions.tsx

When status is on_hold, component renders Pausieren (Put on Hold) and Abbrechen.
Per STATUS_TRANSITION_MATRIX.md, On Hold must show Fortsetzen (Resume) and Abbrechen only.
Pausieren is logically wrong for an already-paused task.

Additional problems in the same file:
- resumeTask is not destructured from useTaskActions()
- run() function has no branch for the resume action

Impact: Client cannot resume a paused task from the portal UI. Functional gap.

Fix required:
1. Destructure resumeTask from useTaskActions()
2. Branch on status === on_hold: render Fortsetzen button (calls resumeTask) + Abbrechen only
3. Add resume case to run() function
4. Remove put_on_hold confirm dialog and button when status is already on_hold

### BLOCKING-2: NotificationBell -- Wrong routing pattern for task navigation
File: src/modules/tickets/components/NotificationBell.tsx (line 15)

Current code: navigate("/tickets/" + taskId)
Problem: No /tickets/:id route is defined in routes.tsx.
Architecture uses URL search param: /tickets?taskId=xxx (confirmed in TicketsPage.tsx line 34).

Impact: ALL notification bell task links navigate to 404 NotFound page.
Every task notification click-through is broken.

Fix: Change navigate call to navigate("/tickets?taskId=" + taskId)

## Non-Blocking Issues (can launch with)

### NON-BLOCKING-1: StatusBadge -- ASCII approximation for German umlaut
File: src/shared/components/common/StatusBadge.tsx (line 30)
Current: needs_attention: "Ihre Rueckmeldung"
Expected: correct German umlaut form matching dict.ts and TaskFilters
Impact: Minor cosmetic -- badge text uses ASCII fallback.

### NON-BLOCKING-2: ESLint scans archive directory
Scope: archive/legacy-reference/ (not deployed, historical reference)
Impact: None on production. Adds ESLint noise.
Recommendation: Add archive/ to .eslintignore.

## Verdict: ~~REVISE~~ → **ACCEPT** (after fixes)

## Deploy Recommendation: ~~NO-GO~~ → **GO**

Two blocking issues were found and **fixed in commit `aa8de5e`**:
1. ✅ On Hold → Resume button added, resumeTask wired, conditional rendering
2. ✅ NotificationBell: `/tickets/${id}` → `/tickets?taskId=${id}`
3. ✅ StatusBadge umlaut fixed ("Rueckmeldung" → "Rückmeldung")

**Portal is launch-ready for MBM.**
