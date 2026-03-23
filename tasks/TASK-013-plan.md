# TASK-013: Credit Approval Workflow + Auto-Deduction

## Workflow

```
Client creates task → TO DO
Team evaluates (sets Credits in ClickUp) → AWAITING APPROVAL
  ├── Client accepts → TO DO (team starts work)
  │   └── Comment posted: "Kostenfreigabe erteilt" (auto)
  └── Client declines → writes reason (required comment)
      └── Comment posted to ClickUp task
      └── Team reviews, adjusts credits → AWAITING APPROVAL again
Team works → IN PROGRESS → CLIENT REVIEW → APPROVED → COMPLETE
On COMPLETE → auto-deduct credits from balance
```

## 5 Work Items

### Item 1: Status Mapping — AWAITING APPROVAL

**File:** `src/modules/tickets/lib/status-mapping.ts`
- Add mapping: `'awaiting approval'` → `'needs_attention'` (same bucket as CLIENT REVIEW)
- This makes AWAITING APPROVAL tasks appear in "Ihre Rückmeldung" filter tab

**File:** `src/shared/components/common/StatusBadge.tsx`
- Add label for awaiting_approval: "Kostenfreigabe" (or reuse needs_attention display)

**File:** `src/modules/tickets/lib/dictionary.ts`
- Add German labels for the new status if needed

**File:** `docs/system-context/STATUS_TRANSITION_MATRIX.md`
- Add AWAITING APPROVAL row with transitions

### Item 2: Credit Approval UI in TaskDetailSheet

**File:** `src/modules/tickets/components/TaskDetail.tsx` (or new component)

When task status is `awaiting_approval` (mapped from "awaiting approval") AND `task.credits > 0`:

Show a prominent approval section:
```
┌─────────────────────────────────────────────┐
│ ⚡ Kostenfreigabe erforderlich              │
│                                             │
│ Diese Aufgabe wurde mit 2.0 Credits         │
│ bewertet.                                   │
│                                             │
│ [✓ Akzeptieren]     [✗ Ablehnen]           │
└─────────────────────────────────────────────┘
```

**Create:** `src/modules/tickets/components/CreditApproval.tsx` (~100 lines)
- Props: `taskId: string`, `credits: number`, `taskName: string`
- "Akzeptieren" button:
  - Calls `update-task-status` Edge Function with action `approve_credits` (or reuses existing `approve` with a flag)
  - Posts auto-comment to ClickUp: "✅ Kostenfreigabe erteilt ({credits} Credits)"
  - Changes task status back to TO DO (ready for work)
- "Ablehnen" button:
  - Opens required textarea: "Bitte beschreiben Sie, warum Sie die Bewertung ablehnen"
  - Posts comment to ClickUp with the reason
  - Keeps task in AWAITING APPROVAL (team will re-evaluate)
  - Comment format: "❌ Kostenfreigabe abgelehnt: {reason}"

### Item 3: Auto-Deduction on COMPLETE

**File:** `supabase/functions/clickup-webhook/index.ts`

In the ticket `taskStatusUpdated` handler, when status transitions to COMPLETE/DONE:
1. Read `task_cache.credits` for the task
2. If credits > 0:
   - Check: has a deduction already been recorded? (idempotency: `WHERE task_id = :clickupId AND type = 'task_deduction'`)
   - If not: insert `credit_transactions` row: `amount: -credits, type: 'task_deduction', task_id, task_name`
3. This automatically reduces the client's balance

### Item 4: Webhook — Handle AWAITING APPROVAL Status

**File:** `supabase/functions/clickup-webhook/index.ts`

When `taskStatusUpdated` with new status `AWAITING APPROVAL`:
- Create bell notification: "Aufgabe {name} — Kostenfreigabe erforderlich ({credits} Credits)"
- Send email type `credit_approval` (new template)
- This is the trigger for the client to see the approval section

**File:** `supabase/functions/send-mailjet-email/index.ts`
- Add `credit_approval` email template
- Subject: "Kostenfreigabe für {taskName} — {credits} Credits"
- Body: task name, credits amount, CTA to open task

**File:** `supabase/functions/_shared/emailCopy.ts`
- Add `credit_approval` entry

### Item 5: Edge Function — approve_credits / decline_credits actions

**File:** `supabase/functions/update-task-status/index.ts`

Add two new actions (or handle in existing flow):
- `approve_credits`:
  - Change ClickUp task status to TO DO
  - Post comment: "✅ Kostenfreigabe erteilt ({credits} Credits)"
- `decline_credits`:
  - Keep status AWAITING APPROVAL
  - Post comment: "❌ Kostenfreigabe abgelehnt: {reason}"

## Also fix: Remove manual refresh button from tasks

**File:** `src/modules/tickets/pages/TicketsPage.tsx` or wherever SyncIndicator is
- Remove the manual sync/refresh button
- Real-time should handle everything (per user feedback: "это вообще не современно")

## Commit Structure

| # | Content |
|---|---------|
| 1 | Status mapping + StatusBadge for AWAITING APPROVAL |
| 2 | CreditApproval UI component |
| 3 | Auto-deduction on COMPLETE in webhook |
| 4 | Webhook notification + email template for AWAITING APPROVAL |
| 5 | Edge Function approve/decline actions |
| 6 | Remove manual refresh button |

## Prerequisites (Yuri action)
- Create "AWAITING APPROVAL" status in ClickUp Space/Folder settings
- Color: yellow/amber
