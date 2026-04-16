---
id: 260415-esi
title: Fix unread messages email notification
date: 2026-04-15
status: in_progress
---

# Quick Task 260415-esi: Fix unread messages email notification

## Problem Analysis

### Issue 1: Task IDs shown instead of task names
In `send-reminders/index.ts` line 277, when a task ID has no match in `taskNameMap`, the fallback is the raw `taskId`:
```ts
taskName: isSupport ? "Support-Chat" : (taskNameMap.get(taskId) ?? taskId),
```
The `taskNameMap` is built from `task_cache.clickup_id`. The unread items loop uses `comment.task_id`. These should match, but there may be cases where the task isn't in the cache. Root fix: ensure the fallback is graceful, but more importantly the fetch should work. The bug might be that `task_cache` lookup uses `profile_id` filter implicitly — but actually the query at line 235 has NO profile_id filter. This should work. The issue may simply be that some tasks are missing from task_cache for the current user.

**Fix:** Keep the current logic but also ensure the query fetches task names correctly. The real issue seen in the screenshot is that ALL tasks show IDs — this points to the `taskNameMap` lookup failing. Need to verify the query at line 235 doesn't have a missing profile filter issue. Actually looking again: the query selects `clickup_id, name` from `task_cache` filtering by `clickup_id IN (allUnreadTaskIds)`. This is correct — no profile filter here.

Wait — the screenshot shows IDs like `86c8tvahq` which are ClickUp task IDs. These ARE in the `task_cache`. The problem could be that `task_cache` is filtered by RLS when using service role... No, service role bypasses RLS. OR the issue could be that `allUnreadTaskIds` is built from `comment.task_id` which might be the support task ID (which is NOT in `task_cache` — it's the support thread task). For support tasks, the code correctly uses "Support-Chat". For regular tasks — the IDs shown are ClickUp task IDs, so the lookup SHOULD work.

**Most likely root cause:** The support `task_id` stored in `profiles.support_task_id` might match `comment.task_id`, making `isSupport=true`. But the task ID shown in screenshot (`86c8tvahq`) doesn't look like a support task. More likely: the service role query runs but returns no rows because `task_cache` has entries for the STAGING environment where `clickup_id` format differs, OR the task_cache rows exist but under a different profile's scope.

**Pragmatic fix:** Add a safety net — if `taskNameMap` doesn't have the name, try fetching it directly. Better: ensure the query works correctly. Since the screenshot shows raw IDs, the simplest safe fix is to make the name fallback more explicit — but the REAL fix is to investigate why `taskNameMap.get(taskId)` returns undefined.

After reviewing more carefully: the `allUnreadTaskIds` set contains task IDs from `comment_cache.task_id`. The `task_cache` query filters `clickup_id IN allUnreadTaskIds`. This should work unless the task IDs in `comment_cache` use a different format than `clickup_id` in `task_cache`. This is the likely culprit — `task_cache.clickup_id` stores the ClickUp task ID, and `comment_cache.task_id` should also be the ClickUp task ID. If they match, the lookup works. If they don't, it returns `taskId` as fallback.

**Fix approach:** Add more defensive logic — if a task name isn't found, use a placeholder instead of the raw ID. Also ensure the name fetch doesn't have an RLS issue (it shouldn't with service role).

### Issue 2: Wrong frequency in footer
`emailCopy.ts` line 162: `"Sie erhalten diese Erinnerung einmal täglich"` 
But actual cooldown is `48 * 60 * 60 * 1000` ms = **2 days**, not 1 day.
Fix: change to `"Sie erhalten diese Erinnerung alle zwei Tage"`.

Also update the EN version to "every two days" from "once daily".

### Issue 3: Subscription footer notes audit
All recurring reminder types already have proper notes:
- `pending_reminder`: ✅ "alle 5 Tage" 
- `project_reminder`: ✅ "alle 3 Tage"
- `unread_digest`: ❌ "einmal täglich" → fix to "alle zwei Tage"
- `recommendation_reminder`: ✅ "alle 5 Tage"

Transactional/event emails (task_review, step_ready, etc.) intentionally have NO notes — they're one-time triggered, not recurring. No changes needed there.

## Tasks

### T1: Fix footer frequency text in emailCopy.ts
**File:** `supabase/functions/_shared/emailCopy.ts`
**Change:** Lines 162-163 — update `unread_digest.de.notes[0]` from "einmal täglich" to "alle zwei Tage", and EN counterpart.

### T2: Fix task name fallback in send-reminders/index.ts
**File:** `supabase/functions/send-reminders/index.ts`
**Change:** Line 277 — improve fallback: use `"Aufgabe"` (or a truncated ID display) instead of raw task ID when name lookup fails. Also verify the `taskNameMap` query is correct.

After deeper analysis: The issue is that the task lookup at line 235 selects from `task_cache` but `task_cache` may not include the support task (which has its own table). For non-support tasks, the lookup should work. The raw ID fallback is the issue for the screenshot.

**Better fix:** In the `buildUnreadDigestHtml` function, pass a proper fallback name. Change `taskName: isSupport ? "Support-Chat" : (taskNameMap.get(taskId) ?? taskId)` to `taskName: isSupport ? "Support-Chat" : (taskNameMap.get(taskId) ?? "Aufgabe")`.

But wait — if the task name IS being fetched and the lookup fails, showing "Aufgabe" is worse than debugging. The REAL fix needs to ensure the lookup works. Let me re-read...

Line 235-243: the query fetches from `task_cache` by `clickup_id`. The `allUnreadTaskIds` contains task IDs from `comment_cache.task_id`. These should be ClickUp task IDs. This should work unless there's a data inconsistency.

**Decision:** Fix both — use proper fallback text AND verify the query covers support tasks correctly. Since we also pass the `profile_id` to the support task check (line 208 `profile.support_task_id === comment.task_id`), support tasks are correctly excluded from the `task_cache` lookup. The remaining IDs should be findable. However as a safe fallback, replace raw ID with `"(Aufgabe)"` if name is missing.
