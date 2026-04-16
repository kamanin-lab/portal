---
phase: 07
plan: 02
subsystem: email-reminders
tags: [edge-function, email, recommendations, cron, reminder]
dependency_graph:
  requires: ["07-01"]
  provides: ["recommendation_reminder email copy", "sendRecommendationReminders cron job"]
  affects: ["supabase/functions/send-reminders/index.ts", "supabase/functions/_shared/emailCopy.ts"]
tech_stack:
  added: []
  patterns: ["atomic claim pattern on profile column", "JS-side tag filter for recommendation tasks"]
key_files:
  created: []
  modified:
    - supabase/functions/_shared/emailCopy.ts
    - supabase/functions/send-reminders/index.ts
decisions:
  - "JS-side tag filter (Approach B from RESEARCH.md) chosen over JSONB DB filter — simpler, mirrors useRecommendations hook exactly"
  - "sendRecommendationReminders placed after unread digest in handler to preserve job order"
  - "buildReminderHtml emailType union extended to include recommendation_reminder (no separate builder needed)"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-14"
  tasks_completed: 2
  files_modified: 2
---

# Phase 07 Plan 02: Recommendation Reminder Email Job Summary

**One-liner:** Recommendation reminder cron job with 5-day cooldown, atomic claim, JS-side tag filter, and German email copy (singular/plural subject).

## What Was Built

### Task 1: recommendation_reminder email copy (emailCopy.ts)

Extended `supabase/functions/_shared/emailCopy.ts`:

- Added `"recommendation_reminder"` to the `EmailType` string literal union
- Added `EMAIL_COPY.recommendation_reminder` entry with `de` and `en` locales
- German subject function: `"Erinnerung: N offene Empfehlung(en) warte(t/n) auf Ihre Entscheidung"` (correct singular/plural)
- `title: "Offene Empfehlungen"`, `cta: "Im Portal ansehen"`
- Reuses existing `greetDe` / `greetEn` greeting helpers
- 07-01 RED tests (4 cases) now GREEN

**Commit:** `38d5c43`

### Task 2: sendRecommendationReminders job (send-reminders/index.ts)

Extended `supabase/functions/send-reminders/index.ts`:

- Extended `buildReminderHtml` emailType union to accept `"recommendation_reminder"`
- New `sendRecommendationReminders(supabase, log)` function:
  - Queries `profiles` with `email_notifications=true`
  - Queries `task_cache` for `status=to do`, `is_visible=true`, `last_activity_at < 3 days ago`, scoped to eligible profile IDs
  - JS-side tag filter: `tag.name === "recommendation"` — mirrors `useRecommendations` hook exactly
  - Groups results by `profile_id` into `ReminderTaskItem[]`
  - Per-profile: skips if `notification_preferences.reminders === false`
  - Atomic claim on `last_recommendation_reminder_sent_at` with 5-day cooldown boundary — prevents double-send on concurrent cron runs
  - Calls `buildReminderHtml(..., "recommendation_reminder", "${portalUrl}/meine-aufgaben")`
  - Error handling: logs via `log.error`, increments `errors`, continues loop
  - Returns `{ sent, skipped, errors }`
- Wired into handler after unread digest job; `recStats` logged and included in response JSON
- CRON_SECRET auth guard at handler entry unchanged

**Commit:** `4a96940`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all paths functional. The job will produce real emails when deployed with valid `MAILJET_API_KEY`, `MAILJET_API_SECRET`, and `PORTAL_URL` env vars.

## Threat Surface Scan

No new network endpoints or auth paths introduced. Existing `CRON_SECRET` guard covers the new job. Service-role query explicitly scoped to `profile_id IN (profiles)` — T-07-09 mitigation in place. Atomic claim addresses T-07-05.

## Self-Check

### Created files exist
- `supabase/functions/_shared/emailCopy.ts` — modified (not created)
- `supabase/functions/send-reminders/index.ts` — modified (not created)

### Commits exist
- `38d5c43` — feat(07-02): add recommendation_reminder to EmailType union + EMAIL_COPY dict
- `4a96940` — feat(07-02): add sendRecommendationReminders job to send-reminders Edge Function

## Self-Check: PASSED
