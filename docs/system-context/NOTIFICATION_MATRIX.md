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

2. **Fallback: profile ACL lookup** — If `task_cache` returns no results (task never synced, new task), the function fetches the task's `list_id` from the ClickUp API and queries `profiles` for all users whose `clickup_list_ids` JSONB array contains that list ID. A warning is logged if more than 10 profiles match (potential misconfiguration).

If both paths return zero profiles, the notification is silently dropped. No retry mechanism exists for dropped notifications.

## Visibility Gate

All notifications are gated by the ClickUp custom field "Visible in client portal". Before creating any notification, the webhook function fetches the task from the ClickUp API and checks this field. If the task is not visible, the notification is skipped entirely (no bell, no email). This check runs for every webhook event, even if the task is already cached, to ensure visibility changes in ClickUp are respected immediately.

## Email Delivery

- Provider: Mailjet (via `send-mailjet-email` Edge Function)
- Gated per user by `profiles.email_notifications` boolean
- Email types and templates:
  - `task_review` — Task moved to Client Review
  - `task_completed` — Task moved to Done/Complete
  - `team_question` — Team comment on a regular task
  - `support_response` — Team reply in support chat
- All emails include `firstName`, `taskName`, and `taskId` for deep linking

## Automated Reminders

For tasks remaining in `needs_attention` (Client Review) without client action, automated email reminders are sent on a 3-5-10 day schedule. These reminders prompt the client to review and act on pending tasks.

## Deduplication

- Completion notifications: Before inserting, the webhook checks if a notification with `type=status_change` and title containing "completed" already exists for the task. If so, the duplicate is skipped.
- Work started notifications: Same deduplication pattern, checking for title containing "started".
- No deduplication for `Client Review` notifications (repeated transitions back to review are intentional and should re-notify).
