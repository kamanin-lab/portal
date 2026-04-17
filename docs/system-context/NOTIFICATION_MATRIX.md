# Notification Matrix

## Status Change Notifications

| ClickUp Status    | Portal Status        | Email Sent | In-App Notification | Trigger Source         | Notes                                                                 |
|-------------------|----------------------|------------|---------------------|------------------------|-----------------------------------------------------------------------|
| TO DO             | Open                 | No         | No                  | —                      | Initial state, no notification on assignment                         |
| IN PROGRESS       | In Progress          | No         | Yes (once)          | clickup-webhook        | Bell only, deduplicated ("Arbeit hat begonnen"), first transition only |
| INTERNAL REVIEW   | In Progress          | No         | No                  | —                      | Internal status, invisible to clients                                |
| REWORK            | In Progress          | No         | No                  | —                      | Internal status, invisible to clients                                |
| CLIENT REVIEW     | Needs Your Attention | Yes        | Yes                 | clickup-webhook        | Primary alert: email + bell, "Aufgabe bereit zur Uberprufung"        |
| APPROVED          | Approved             | No         | No                  | Portal action only     | Set by client via portal, no inbound notification needed              |
| COMPLETE          | Done                 | Yes        | Yes                 | clickup-webhook        | Email + bell, deduplicated, "Aufgabe abgeschlossen"                  |
| AWAITING APPROVAL | Kostenfreigabe       | Yes        | Yes                 | clickup-webhook        | Email + bell. Wording changes to "Aktualisierte Kostenfreigabe" on re-approval (detected via `task_cache.approved_credits`). Credits force-fetched from ClickUp API on re-approval to avoid stale-cache race. |
| ON HOLD           | On Hold              | No         | No                  | Portal action or team  | No automated notification currently                                  |
| CANCELED          | Cancelled            | No         | No                  | Portal action or team  | No automated notification currently                                  |

## Comment Notifications

| Comment Type                        | Email Sent | In-App Notification | Trigger Source  | Notes                                                         |
|-------------------------------------|------------|---------------------|-----------------|---------------------------------------------------------------|
| Team comment with `@client:` prefix | Yes        | Yes (`team_reply`)  | clickup-webhook | Prefix stripped in display, email type: `team_question`       |
| Reply in client-facing thread       | Yes        | Yes (`team_reply`)  | clickup-webhook | Thread context checked, no prefix required                    |
| Reply in internal thread            | No         | No                  | —               | Blocked even if `@client:` prefix present                    |
| Portal-originated comment           | No         | No                  | —               | Skipped by webhook (detected via regex)                       |
| Support chat from team              | Yes        | Yes (`team_reply`)  | clickup-webhook | Routed via `support_task_id`, email type: `support_response`  |
| Support chat from client            | No         | No                  | —               | Client sees their own message; no self-notification           |

## Recipient Resolution Logic

The webhook function resolves notification recipients through a two-step process:

1. **Primary: task_cache lookup** — Query `task_cache` for all `profile_id` values matching the `clickup_id` of the affected task. This is the fast path and works for all tasks that have been synced at least once.

2. **Fallback: org_members lookup** — If `task_cache` returns no results (task never synced, new task), the function fetches the task's `list_id` from the ClickUp API and queries `organizations` (via `org_members`) for all users whose org has that list ID in `clickup_list_ids`. Updated in Phase 10 — previously queried `profiles.clickup_list_ids` directly.

If both paths return zero profiles, the notification is silently dropped. No retry mechanism exists for dropped notifications.

### Viewer filtering (Phase 14)

After recipient resolution, **action-required email types** (`task_review`, `step_ready`) are filtered through `getNonViewerProfileIds(supabase, profileIds)` from `supabase/functions/_shared/org.ts`. This removes viewer-role members from the email recipient list — viewers cannot act on these requests, so sending them action emails is misleading.

**Bell (in-app) notifications are NOT filtered** — all org members including viewers receive badge counts and see notification entries. Filtering applies only to email dispatch.

## Visibility Gate

All notifications are gated by the ClickUp custom field "Visible in client portal". Before creating any notification, the webhook function fetches the task from the ClickUp API and checks this field. If the task is not visible, the notification is skipped entirely (no bell, no email). This check runs for every webhook event, even if the task is already cached, to ensure visibility changes in ClickUp are respected immediately.

## Email Delivery

- Provider: Mailjet (via `send-mailjet-email` Edge Function)
- Gated per user by `profiles.notification_preferences` JSONB (granular per-type control)
- Backward compat: if `notification_preferences` is null, falls back to `profiles.email_notifications` boolean
- Email types and templates:
  - `task_review` — Task moved to Client Review
  - `task_completed` — Task moved to Done/Complete
  - `team_question` — Team comment on a regular task
  - `support_response` — Team reply in support chat
  - `step_ready` — Project step moved to Client Review
  - `project_reply` — Team reply on a project step
  - `project_reminder` — Project step/task idle in Client Review for 3+ days (CTA: `/projekte`)
  - `credit_approval` — Task moved to AWAITING APPROVAL; wording changes on re-approval (see below)
- All emails include `firstName`, `taskName`, and `taskId` for deep linking

### credit_approval email — re-approval variant

When the webhook detects that a task returning to AWAITING APPROVAL was previously approved (i.e., `task_cache.approved_credits` is set), it passes `previousCredits` alongside `credits` to the email function.

| Field | First approval | Re-approval |
|---|---|---|
| Subject | "Kostenfreigabe für {task} — {credits} Credits" | "Aktualisierte Kostenfreigabe für {task} — {credits} Credits" |
| Title | "Kostenfreigabe erforderlich" | "Aktualisierte Kostenfreigabe" |
| Body | "Diese Aufgabe wurde mit {credits} Credits bewertet." | "Die Schätzung für „{task}" wurde von {prev} auf {credits} Credits angepasst und wartet erneut auf Ihre Freigabe." |

Re-approval is detected in the webhook by reading `task_cache.approved_credits` before sending. If the column is non-NULL and its numeric value differs from the freshly-fetched credits, `previousCredits` is set and the re-approval template path is used.

### Granular Notification Preferences

Users can control which email types they receive via the Account page (`/konto`). The preferences are stored in `profiles.notification_preferences` as a JSONB object.

| Email Type (webhook sends) | JSONB Preference Key | UI Label (German) | Default |
|---|---|---|---|
| `task_review` | `task_review` | Aufgabe zur Prüfung bereit | ON |
| `step_ready` | `task_review` | (same preference as task_review) | ON |
| `task_completed` | `task_completed` | Aufgabe abgeschlossen | ON |
| `team_question` | `team_comment` | Neue Nachricht vom Team | ON |
| `project_reply` | `team_comment` | (same preference as team_comment) | ON |
| `support_response` | `support_response` | Support-Antwort | ON |
| `project_reminder` | `reminders` | Erinnerungen | ON |

The webhook function uses `shouldSendEmail(profile, emailType)` to check the appropriate preference key. If the JSONB column is null (pre-migration users), it falls back to the legacy `email_notifications` boolean.

In-app (bell) notifications are always sent regardless of email preferences.

## Automated Reminders

### Ticket Reminders (support/task module)
For tasks remaining in `needs_attention` (Client Review) without client action, automated email reminders are sent on a 3-5-10 day schedule. These reminders prompt the client to review and act on pending tasks.

### Project Task Reminders (projects module)
For project tasks in `client review` status that have been idle for 3+ days, a `project_reminder` email is sent every 3 days. The CTA links to `/projekte`.

- **Trigger:** `send-reminders` Edge Function — separate block from ticket reminders
- **Source table:** `project_task_cache` (idle 3+ days in `client review`)
- **Recipient resolution:** via `project_access` table (maps project → profile)
- **Email type:** `project_reminder`
- **Cooldown tracking:** `profiles.last_project_reminder_sent_at` (timestamptz) — prevents re-send within 3-day window
- **Concurrency safety:** atomic claim pattern to prevent duplicate sends in parallel invocations
- **Preference gate:** `profiles.notification_preferences.reminders` key

## Deduplication

- Completion notifications: Before inserting, the webhook checks if a notification with `type=status_change` and title containing "completed" already exists for the task. If so, the duplicate is skipped.
- Work started notifications: Same deduplication pattern, checking for title containing "started".
- No deduplication for `Client Review` notifications (repeated transitions back to review are intentional and should re-notify).
