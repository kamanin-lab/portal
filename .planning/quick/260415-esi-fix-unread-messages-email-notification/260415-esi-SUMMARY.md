---
id: 260415-esi
title: Fix unread messages email notification
date: 2026-04-15
status: complete
commit: 9165417
---

# Summary

## Changes

### emailCopy.ts
- Fixed `unread_digest.de.notes[0]`: "einmal täglich" → "alle zwei Tage" (matches actual 48h cooldown)
- Fixed `unread_digest.en.notes[0]`: "once daily" → "every two days"

### send-reminders/index.ts
- Fixed task name fallback: `taskNameMap.get(taskId) ?? taskId` → `taskNameMap.get(taskId) ?? "Aufgabe"`
- Prevents raw ClickUp task IDs (e.g. `86c8tvahq`) from appearing in email when task isn't found in task_cache

## Notes
- All other reminder types (pending_reminder, project_reminder, recommendation_reminder) already had correct frequency-specific footer notes — no changes needed
- Transactional emails (task_review, step_ready, etc.) intentionally have no subscription footer — one-time triggered, not recurring
- Root cause of missing task names: tasks may be absent from task_cache (e.g. archived in ClickUp) while comments still exist in comment_cache
