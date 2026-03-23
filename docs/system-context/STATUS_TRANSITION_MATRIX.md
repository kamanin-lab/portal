# Status Transition Matrix

## ClickUp to Portal Status Mapping

| ClickUp Status  | Portal Status        | Client Visible | Internal Only |
|-----------------|----------------------|----------------|---------------|
| TO DO           | Open                 | Yes            | No            |
| IN PROGRESS     | In Progress          | Yes            | No            |
| INTERNAL REVIEW | In Progress          | Yes (merged)   | Yes           |
| REWORK          | In Progress          | Yes (merged)   | Yes           |
| CLIENT REVIEW   | Needs Your Attention | Yes            | No            |
| APPROVED        | Approved             | Yes            | No            |
| COMPLETE        | Done                 | Yes            | No            |
| ON HOLD         | On Hold              | Yes            | No            |
| AWAITING APPROVAL | Kostenfreigabe    | Yes            | No            |
| CANCELED        | Cancelled            | Yes            | No            |

Notes:
- INTERNAL REVIEW and REWORK are distinct statuses in ClickUp but both map to "In Progress" in the portal. Clients never see the internal review/rework cycle.
- AWAITING APPROVAL is used for credit-based approval. The client must accept or decline the estimated credits before work begins.
- Portal status is derived at render time from the ClickUp status stored in `task_cache.status`. It is never stored as a separate field.

## Allowed Transitions

### Standard Lifecycle

| From (ClickUp)  | To (ClickUp)     | Trigger           | Client Action Required | Notification Type        |
|-----------------|------------------|--------------------|------------------------|--------------------------|
| TO DO           | IN PROGRESS      | Team action        | No                     | Bell (once)              |
| IN PROGRESS     | INTERNAL REVIEW  | Team action        | No                     | None (invisible)         |
| INTERNAL REVIEW | CLIENT REVIEW    | Team action        | No                     | Email + Bell             |
| CLIENT REVIEW   | APPROVED         | Client approves    | Yes                    | None                     |
| CLIENT REVIEW   | REWORK           | Client requests changes | Yes               | None                     |
| REWORK          | IN PROGRESS      | Team action        | No                     | None (invisible)         |
| IN PROGRESS     | CLIENT REVIEW    | Team action        | No                     | Email + Bell             |
| APPROVED        | COMPLETE         | Team action        | No                     | Email + Bell             |

### Credit Approval

| From (ClickUp)     | To (ClickUp)         | Trigger                  | Client Action Required | Notification Type |
|---------------------|----------------------|--------------------------|------------------------|-------------------|
| TO DO               | AWAITING APPROVAL    | Team sets credits        | No                     | Email + Bell      |
| AWAITING APPROVAL   | TO DO                | Client accepts credits   | Yes                    | None              |
| AWAITING APPROVAL   | AWAITING APPROVAL    | Client declines (comment)| Yes                    | None              |
| COMPLETE            | —                    | Auto-deduction           | No                     | None              |

When a task reaches COMPLETE, credits are auto-deducted from the client's balance (idempotent: one deduction per task).

### Hold and Cancel

| From (ClickUp)  | To (ClickUp) | Trigger             | Client Action Required | Notification Type |
|-----------------|--------------|----------------------|------------------------|-------------------|
| Any (not Done/Cancelled) | ON HOLD  | Client or team | Yes (if client) | None              |
| ON HOLD         | TO DO        | Client resumes       | Yes                    | None              |
| Any (not Done/Cancelled) | CANCELED | Client or team | Yes (if client) | None              |

### Resume Logic

When a client resumes a task from On Hold, the ClickUp status is set to TO DO (portal: Open), not IN PROGRESS. This ensures the task re-enters the standard lifecycle from the beginning rather than skipping the team's internal review process.

## Client-Available Actions by Portal Status

| Portal Status        | Primary Actions              | Secondary Actions        |
|----------------------|------------------------------|--------------------------|
| Open                 | —                            | Put on Hold, Cancel      |
| In Progress          | —                            | Put on Hold, Cancel      |
| Needs Your Attention | Approve, Request Changes     | Put on Hold, Cancel      |
| Kostenfreigabe       | Akzeptieren, Ablehnen        | Put on Hold, Cancel      |
| Approved             | —                            | Put on Hold, Cancel      |
| Done                 | —                            | —                        |
| On Hold              | —                            | Resume, Cancel           |
| Cancelled            | —                            | —                        |

Notes:
- Primary actions are visually prominent (filled buttons).
- Secondary actions are subtle (outline/ghost style), same visual weight as navigation links.
- Done and Cancelled are terminal states with no available actions.

## Action to ClickUp Status Mapping

| Portal Action    | ClickUp Status Set   | Edge Function        |
|------------------|----------------------|-----------------------|
| Approve          | APPROVED             | update-task-status    |
| Request Changes  | REWORK               | update-task-status    |
| Approve Credits  | TO DO                | update-task-status    |
| Decline Credits  | (stays AWAITING APPROVAL) | post-task-comment |
| Put on Hold      | ON HOLD              | update-task-status    |
| Resume           | TO DO                | update-task-status    |
| Cancel           | CANCELED             | update-task-status    |

All actions support an optional comment that is posted to ClickUp alongside the status change.

## Confirmation Requirements

| Action          | Confirmation Dialog | Optional Comment |
|-----------------|---------------------|------------------|
| Approve         | No                  | Yes              |
| Request Changes | No                  | Yes              |
| Put on Hold     | Yes                 | Yes              |
| Resume          | Yes                 | Yes              |
| Cancel          | Yes                 | Yes              |

## Edge Cases

### Repeated Client Review

A task can move to CLIENT REVIEW multiple times (e.g., after rework). Each transition generates a new email and bell notification. There is no deduplication for this status because repeated review requests are intentional.

### Direct status jumps

ClickUp allows arbitrary status changes by team members. If a task jumps from TO DO directly to COMPLETE, the portal processes the webhook normally — completion notification is sent, "work started" notification is not (it was never triggered). The portal does not enforce sequential transitions.

### Webhook-driven vs portal-driven status changes

When a client changes status via the portal (e.g., Approve), the Edge Function updates ClickUp, which fires a webhook back. The webhook then updates `task_cache`. This means every portal action results in two updates: the immediate ClickUp API response and the subsequent webhook-driven cache update. The webhook update is the one that triggers Realtime subscriptions.

### Invisible tasks

If a task is not marked "Visible in client portal" in ClickUp, no notifications are generated regardless of status changes. If a previously visible task is made invisible, it is marked `is_visible=false` in `task_cache` during the next sync and disappears from the portal UI. No notification is sent about the removal.
