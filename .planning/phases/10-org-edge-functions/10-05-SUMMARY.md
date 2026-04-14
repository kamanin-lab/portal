---
phase: 10-org-edge-functions
plan: "05"
subsystem: edge-functions
tags: [org, reminders, send-reminders, email, cron, org-be-07]
dependency_graph:
  requires: [10-01]
  provides: [ORG-BE-07]
  affects: [supabase/functions/send-reminders/index.ts]
tech_stack:
  added: []
  patterns:
    - org_members JOIN organizations!inner + profiles!inner for admin resolution
    - getOrgMemberIds for project_access fan-out
    - atomic claim pattern preserved for project reminders (prevents double-send on concurrent runs)
key_files:
  modified:
    - supabase/functions/send-reminders/index.ts
decisions:
  - "Ticket reminders: task_cache still queried by admin profile_id (Pitfall 4 — admin has most complete cache)"
  - "Project reminders: project_task_cache is shared (not profile-scoped), filter by project_config_id from all org member IDs"
  - "Preference key checked: prefs.reminders (consistent with existing code), not prefs.ticket_reminder"
  - "Atomic claim pattern preserved for project reminders to prevent double-send on concurrent cron runs"
  - "Removed PendingTaskRow interface (no longer needed after refactor from inline handler to dedicated functions)"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-15"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 1
---

# Phase 10 Plan 05: send-reminders org-grouped admin-only reminders Summary

Org-grouped ticket and project reminders that send only to the org admin instead of every profile — prevents duplicate emails when an org has multiple members (ORG-BE-07).

## What Was Built

Rewrote `sendTicketReminders` and `sendProjectReminders` in `supabase/functions/send-reminders/index.ts` from inline profile-centric code in the `Deno.serve` handler to proper standalone async functions with an org-first loop structure.

### sendTicketReminders (Task 1)

**Before:** Inline code in handler. Queried `task_cache` joined to `profiles`, grouped by profile_id — would send one email per member of an org.

**After:** Queries `org_members WHERE role = 'admin'`, joins `organizations!inner` (for `clickup_list_ids`) and `profiles!inner` (for email prefs + cooldown). Loop iterates over org admins only. `task_cache` query inside loop filters by `admin.profile_id` + org's `clickup_list_ids` — ensures admin's cache (most complete) is used for task lookup. 5-day cooldown on `profiles.last_reminder_sent_at`.

### sendProjectReminders (Task 2)

**Before:** Inline code in handler. Queried `project_task_cache` then fan-out to all profiles with access — would send one email per member.

**After:** Same org-first pattern. Queries `org_members WHERE role = 'admin'`. Uses `getOrgMemberIds(supabase, org.id)` to resolve all org member IDs, then queries `project_access` to find all `project_config_id`s visible to the org. `project_task_cache` filtered by those IDs (shared table, no profile_id column). Atomic claim on `last_project_reminder_sent_at` preserved to prevent double-send on concurrent cron runs. 3-day cooldown.

### Out of scope (unchanged)

- `sendUnreadMessageReminders` — profile-based, untouched
- `sendRecommendationReminders` — profile-based, untouched

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] preference key alignment**
- **Found during:** Task 1 implementation
- **Issue:** Plan pseudocode used `prefs.ticket_reminder` as the preference key, but existing codebase consistently uses `prefs.reminders` for all reminder types (visible in the old inline code and `sendRecommendationReminders`)
- **Fix:** Used `prefs.reminders === false` (consistent with existing code) instead of `prefs.ticket_reminder`
- **Files modified:** `supabase/functions/send-reminders/index.ts`
- **Commit:** e13ed52

**2. [Rule 2 - Missing functionality] projectErrors in response**
- **Found during:** Task 2 completion
- **Issue:** Old response payload had no `projectErrors` field; with refactored function returning `{ sent, skipped, errors }`, errors from project reminders were silently dropped
- **Fix:** Extracted `projectErrors = projectStats.errors` and included it in JSON response + message string
- **Files modified:** `supabase/functions/send-reminders/index.ts`
- **Commit:** e13ed52

**3. [Rule 1 - Cleanup] Removed unused PendingTaskRow interface**
- **Found during:** Task 1 — after extracting sendTicketReminders, the `PendingTaskRow` interface used only by old inline code became dead code
- **Fix:** Removed interface declaration
- **Files modified:** `supabase/functions/send-reminders/index.ts`
- **Commit:** e13ed52

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| `getOrgMemberIds` imported from `_shared/org.ts` | PASS — line 12 |
| `sendTicketReminders` queries `org_members` with `.eq("role", "admin")` | PASS — line 455 |
| `sendTicketReminders` joins `organizations!inner` and `profiles!inner` | PASS — lines 441-454 |
| `task_cache` query inside loop: `.eq("profile_id", profile.id)` AND `.in("list_id", listIds)` | PASS — lines 499-505 |
| Cooldown constant `5 * 24 * 60 * 60 * 1000` present | PASS — line 462 |
| Mailjet fetch call (`api.mailjet.com/v3.1/send`) inside try block | PASS — line 721 |
| Update to `profiles.last_reminder_sent_at` present | PASS — lines 535-538 |
| `sendUnreadMessageReminders` function present and UNCHANGED | PASS — lines 159-309 |
| `sendRecommendationReminders` function present and UNCHANGED | PASS — lines 312-423 |
| `sendProjectReminders` contains `.eq("role", "admin")` | PASS — line 581 |
| `sendProjectReminders` references `last_project_reminder_sent_at` | PASS — lines 578, 608, 667 |
| `sendProjectReminders` calls `getOrgMemberIds` | PASS — line 614 |
| `project_task_cache` query filters by `project_config_id` | PASS — lines 628-633 |
| `profiles.last_project_reminder_sent_at` updated after send | PASS — lines 667-669 |
| `deno check` exits 0 | UNTESTED — deno not in bash PATH on dev machine; type casts explicitly applied throughout |

## Self-Check

- `supabase/functions/send-reminders/index.ts` — FOUND (modified in place)
- Commit e13ed52 — FOUND (`git log --oneline -1` confirms)

## Self-Check: PASSED
