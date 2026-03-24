# Feature Idea: Client Review Reminder Emails

> Status: Idea | Priority: Medium | Target: Phase 5+

## Problem

Tasks in "CLIENT REVIEW" status can sit without client feedback indefinitely. The agency has no automated way to nudge the client, leading to stalled workflows and delayed project timelines.

## Vision

Automated email reminders when a client hasn't responded to tasks awaiting their review. Escalating cadence: gentle nudge → firmer reminder → final notice.

## Reminder Schedule

| Trigger | Timing | Tone |
|---------|--------|------|
| First reminder | 3 days in CLIENT REVIEW without activity | Gentle: "Wir warten auf Ihre Rückmeldung zu X" |
| Second reminder | 5 days | Firmer: "X Aufgaben warten seit 5 Tagen auf Ihre Freigabe" |
| Third reminder | 7 days | Final: "Dringende Rückmeldung erforderlich — X Aufgaben blockiert" |

## Scope

- **Per-task tracking:** each task in CLIENT REVIEW gets its own reminder timer
- **Batch emails:** if multiple tasks are pending, combine into one email (not one per task)
- **Reset on activity:** any client action (comment, approve, request changes) resets the timer
- **Opt-out:** client can disable reminders via notification preferences (→ account page settings)
- **Agency visibility:** agency dashboard shows which clients have overdue reviews

## Implementation Notes

### Data needed
- `task_cache.status` = CLIENT REVIEW status (raw ClickUp string)
- `task_cache.updated_at` or `last_activity_at` as timer baseline
- `profiles.notification_preferences` for opt-out

### Possible approaches
1. **Supabase pg_cron** — scheduled SQL job checks task_cache for stale CLIENT REVIEW tasks, triggers Edge Function to send email via Mailjet
2. **External cron (Coolify)** — periodic HTTP call to an Edge Function that checks and sends
3. **ClickUp automation** — use ClickUp's built-in automation (less control, but simpler)

### Preferred: Supabase pg_cron + Edge Function
- Query: tasks WHERE status maps to CLIENT REVIEW AND last_activity_at < NOW() - INTERVAL '3 days'
- Cross-reference with a `reminder_log` table to avoid duplicate sends
- Use existing `send-mailjet-email` Edge Function for delivery

### New table sketch
```sql
CREATE TABLE review_reminder_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_cache_id UUID REFERENCES task_cache(id),
  profile_id UUID REFERENCES profiles(id),
  reminder_level INTEGER NOT NULL, -- 1, 2, 3
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Dependencies
- Mailjet integration (exists)
- Notification preferences on account page (planned, TASK-004)
- `mapStatus()` for reliable CLIENT REVIEW detection (exists)